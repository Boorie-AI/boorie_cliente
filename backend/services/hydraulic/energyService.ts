/**
 * Análisis energético y verificación de ahorros — envoltorio TypeScript (#42).
 *
 * La regla que sostiene todo esto: **ninguna cifra de ahorro sale de una
 * estimación**. `verificarMedida` aplica el cambio sobre una copia de la red, la
 * simula y resta; lo que se reporta es lo que dio WNTR. Cuando el agente
 * proponga medidas (segunda entrega del #42), su papel será redactar y ordenar,
 * no calcular.
 */

import { spawn } from 'child_process'
import { createLogger } from '../../utils/logger'
import { findPythonPath } from './pythonDetector'
import { resolvePythonScriptPath } from './pythonScriptPath'
import type { EscenarioEvento } from './resilienceService'
import type { TarifaElectrica } from './tarifaElectrica'

const logger = createLogger('WNTREnergyService')

/** Lo que se sabe de la eficiencia con la que trabaja una bomba. */
export interface EficienciaBomba {
  origen: string
  media_pct: number
  minima_pct: number
  maxima_pct: number
}

/** Dónde trabaja la bomba frente al punto óptimo de su curva, si la declara. */
export interface PuntoOptimo {
  curva: string
  eficiencia_en_operacion_pct: number
  punto_optimo: { caudal_m3s: number; eficiencia_pct: number }
  desviacion_caudal_pct: number | null
}

export interface ConsumoBomba {
  nombre: string
  energia_kwh: number
  coste: number
  horas_en_marcha: number
  potencia_media_kw: number
  potencia_maxima_kw: number
  caudal_medio_m3s: number
  eficiencia: EficienciaBomba | null
  punto_optimo: PuntoOptimo | null
}

export interface ResumenEnergetico {
  energia_total_kwh: number
  coste_total: number
  moneda: string
  bombas: ConsumoBomba[]
  /** kWh y coste repartidos por bloque de la tarifa: es de donde sale «mueve el bombeo al valle». */
  por_bloque_horario: Record<string, { kwh: number; coste: number; precio_kwh: number }>
  tarifa_aplicada: TarifaElectrica
  trazabilidad: {
    eficiencia_global_pct: number
    origen_eficiencia: string
    curvas_de_eficiencia: string
    metrica: string
    simulador: string
    wntr_version: string
    paso_s: number
    intervalos: number
  }
}

export interface AnalisisEnergeticoResult {
  success: boolean
  data?: ResumenEnergetico & {
    duration_hours: number
    execution_time: number
    convergence_warnings: { event: string[]; converged: boolean }
  }
  error?: string
}

export interface VerificacionAhorroResult {
  success: boolean
  data?: {
    medidas: Array<{ indice: number; tipo: string; aplicado: boolean; elementos?: string[]; metodo?: string; omitidos: Array<{ id: string; motivo: string }> }>
    antes: ResumenEnergetico
    despues: ResumenEnergetico
    ahorro: {
      energia_kwh: number
      coste: number
      moneda: string
      porcentaje_energia: number
      /** Siempre 'simulado': es la marca de que la cifra viene de WNTR. */
      origen: string
    }
    /** Lo que la medida le cuesta al servicio: un ahorro no se reporta sin su contrapartida. */
    impacto_en_servicio: {
      habitantes_afectados_atribuibles: number
      demanda_no_satisfecha_atribuible_m3: number
      nudos_afectados_atribuibles: number
      metodo: Record<string, unknown>
    }
    duration_hours: number
    execution_time: number
    convergence_warnings: { baseline: string[]; event: string[]; converged: boolean }
  }
  error?: string
  medidas?: Array<{ indice: number; tipo: string; aplicado: boolean; omitidos: Array<{ id: string; motivo: string }> }>
}

interface OpcionesEnergia {
  duration_hours?: number
  tarifa?: TarifaElectrica
  /** Sólo se usa para las bombas sin curva y si el .inp no declara eficiencia. */
  eficiencia_global?: number
}

export class WNTREnergyService {
  private servicePath: string

  /** Ver nota en wntrWrapper: se resuelve en cada ejecución, no al construir. */
  private get pythonPath(): string {
    return findPythonPath()
  }

  constructor() {
    this.servicePath = resolvePythonScriptPath('wntr_energy_service.py')
  }

  /** Consumo y coste de cada bomba, con la tarifa del proyecto. */
  async analizar(networkFile: string, options?: OpcionesEnergia): Promise<AnalisisEnergeticoResult> {
    return this.ejecutar('analizar', networkFile, options)
  }

  /**
   * Ahorro **medido** de una medida operativa.
   *
   * Las medidas se declaran con el mismo vocabulario de eventos del motor de
   * escenarios (#43): apagar una bomba en hora punta es el `pump_outage` que ya
   * existe, no un mecanismo nuevo.
   */
  async verificarMedida(networkFile: string, options: OpcionesEnergia & {
    medidas: EscenarioEvento[]
    /** Para poder decir a cuánta gente afectaría la medida, no sólo lo que ahorra. */
    demand_module_lphd?: number
    availability_threshold?: number
    required_pressure?: number
    minimum_pressure?: number
    persons_per_connection?: number
  }): Promise<VerificacionAhorroResult> {
    return this.ejecutar('verificar', networkFile, options)
  }

  private async ejecutar(comando: string, networkFile: string, options?: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      const args = [this.servicePath, comando, networkFile]
      if (options) args.push(JSON.stringify(options))

      logger.debug(`Executing: ${this.pythonPath} ${args.join(' ')}`)

      const proceso = spawn(this.pythonPath, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env } })

      let stdout = ''
      let stderr = ''
      proceso.stdout.on('data', d => { stdout += d.toString() })
      proceso.stderr.on('data', d => { stderr += d.toString() })

      // Tres minutos: verificar una medida son dos simulaciones de periodo
      // extendido, igual que la simulación de interrupción.
      const timeout = setTimeout(() => {
        proceso.kill()
        reject(new Error('Energy analysis timeout'))
      }, 180000)

      proceso.on('close', code => {
        clearTimeout(timeout)
        if (code !== 0) {
          logger.error(`Energy service exited with ${code}: ${stderr}`)
          reject(new Error(stderr || `Energy service exited with code ${code}`))
          return
        }
        try {
          resolve(JSON.parse(stdout))
        } catch (error) {
          logger.error('Failed to parse energy service response:', error)
          logger.error('Raw stdout:', stdout)
          reject(new Error(`Invalid JSON response: ${error}`))
        }
      })

      proceso.on('error', error => {
        clearTimeout(timeout)
        reject(error)
      })
    })
  }
}
