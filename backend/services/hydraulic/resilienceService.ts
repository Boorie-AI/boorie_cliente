/**
 * WNTR Resilience Service - TypeScript Wrapper
 * Skeletonization, service-interruption simulation, resilience indicators
 * and seismic fragility curves (epic #26: "Rutinas de resiliencia WNTR").
 */

import { TextoDelMotor } from '../../../src/services/hydraulic/textoDelMotor'
import { spawn } from 'child_process';
import { createLogger } from '../../utils/logger';
import { findPythonPath } from './pythonDetector';
import { resolvePythonScriptPath } from './pythonScriptPath';

const logger = createLogger('WNTRResilienceService');

export interface SkeletonizeResult {
  success: boolean;
  data?: {
    before: { junctions: number; tanks: number; reservoirs: number; pipes: number; pumps: number; valves: number };
    after: { junctions: number; tanks: number; reservoirs: number; pipes: number; pumps: number; valves: number };
    reduction: { pipes_pct: number; junctions_pct: number };
    pipe_diameter_threshold_mm: number;
    inp_content: string;
  };
  error?: string;
}

export interface ComponentFailureInput {
  id: string;
  type?: 'pipe' | 'pump' | 'valve';
}

export interface AffectedPopulationNode {
  id: string;
  population: number;
  population_affected: number;
  min_service_availability: number;
  outage_hours: number;
  undelivered_m3: number;
  min_pressure: number | null;
}

export interface PopulationSnapshot {
  population_affected: number;
  affected_node_count: number;
  affected_nodes: AffectedPopulationNode[];
  max_outage_hours: number;
  undelivered_volume_m3: number;
  min_service_availability: number;
}

/** Población y clientes afectados (#32), calculados sobre las mismas dos corridas PDA. */
export interface PopulationImpact {
  total_population: number;
  population_nodes: number;
  event: PopulationSnapshot;
  /** Misma red sin el evento: separa el déficit crónico del causado por la interrupción. */
  baseline: PopulationSnapshot;
  /**
   * Impacto del evento sobre la referencia. Ninguno de los tres baja de cero
   * (#77): la resta puede salir negativa —hay nudos que un corte deja mejor que
   * antes— y como impacto atribuible eso no se puede leer.
   */
  attributable_to_event: {
    population_affected: number;
    affected_node_count: number;
    undelivered_volume_m3: number;
    /** La resta sin recortar, para que el recorte no borre el dato de origen. */
    raw_difference: {
      population_affected: number;
      affected_node_count: number;
      undelivered_volume_m3: number;
    };
    /** Qué campos hubo que recortar en esta ejecución. */
    clipped_to_zero: string[];
  };
  connections: {
    persons_per_connection: number;
    total_connections: number;
    affected_connections: number;
    method: string;
  } | null;
  /** Nudos con demanda base negativa (fuentes modeladas como junction), excluidos del cómputo. */
  excluded_negative_demand_nodes: Array<{ id: string; population: number }>;
  traceability: {
    demand_model: 'PDA';
    simulator: string;
    wntr_version: string;
    demand_module_lphd: number;
    per_capita_demand_m3s: number;
    availability_threshold: number;
    required_pressure_m: number;
    minimum_pressure_m: number;
    timestep_s: number;
    population_metric: string;
    impact_metric: string;
  };
}

export interface SimulateFailureResult {
  success: boolean;
  data?: {
    status: string;
    execution_time: number;
    failed_components: string[];
    failure_start_hours: number;
    restore_hours: number | null;
    duration_hours: number;
    min_pressure_threshold: number;
    affected_nodes: Array<{
      id: string;
      min_pressure: number;
      baseline_min_pressure: number;
      /** Caída respecto a la referencia, nunca negativa: donde el fallo mejora el nudo, cero. */
      pressure_drop: number;
      outage_hours: number;
    }>;
    affected_node_count: number;
    total_junction_count: number;
    node_results: Record<string, { pressure: number[] }>;
    link_results: Record<string, { flowrate: number[] }>;
    timestamps: number[];
    convergence_warnings: { baseline: string[]; event: string[]; converged: boolean };
    population: PopulationImpact;
  };
  error?: string;
}

/**
 * Un evento de escenario (#43).
 *
 * Las cuatro familias de causa del issue —naturales, operativas, inducidas y de
 * demanda— no son cuatro mecanismos en WNTR: se expresan con estos cinco. Un
 * terremoto es una lista de roturas, y un ciberataque una pérdida de control.
 */
export type EscenarioEvento =
  | { tipo: 'pipe_break'; elementos: string[]; modo?: 'cierre' | 'fuga'; area_m2?: number; coef_descarga?: number; desde_h?: number; hasta_h?: number | null }
  | { tipo: 'pump_outage'; elementos: string[]; desde_h?: number; hasta_h?: number | null }
  | { tipo: 'control_loss'; alcance?: 'todos' | string[]; congelar?: string[]; congelar_en?: 'cerrado' | 'abierto'; desde_h?: number; hasta_h?: number | null }
  | { tipo: 'demand_surge'; nudos?: string[] | 'todos'; multiplicador: number; desde_h?: number; hasta_h?: number | null }
  | { tipo: 'source_reduction'; elementos: string[]; factor?: number; nivel_m?: number }

export interface EventoAplicado {
  indice: number
  tipo: string
  aplicado: boolean
  elementos?: string[]
  /** Cómo se modeló: varios eventos admiten más de una forma y la cifra depende de cuál. */
  metodo?: string
  omitidos: Array<{ id: string; motivo: TextoDelMotor }>
  desde_h?: number
  hasta_h?: number | null
}

export interface SimulateScenarioResult {
  success: boolean
  data?: {
    status: string
    execution_time: number
    scenario: { name: string; events: EventoAplicado[]; duration_hours: number }
    /** La cifra que da sentido al resto: cuánta demanda se queda sin servir. */
    unmet_demand: {
      total_m3: number
      baseline_m3: number
      /** Lo que causa el escenario, descontado el déficit que la red ya tenía. */
      attributable_m3: number
      by_node: Array<{ id: string; undelivered_m3: number; outage_hours: number; min_service_availability: number }>
      max_deficit_hours: number
    }
    nodes_below_minimum_pressure: Array<{
      id: string
      min_pressure: number
      baseline_min_pressure: number
      pressure_drop: number
      hours_below_threshold: number
    }>
    min_pressure_threshold: number
    total_junction_count: number
    population: PopulationImpact
    timestamps: number[]
    convergence_warnings: { baseline: string[]; event: string[]; converged: boolean }
  }
  error?: string
  /** Cuando ningún evento se pudo aplicar, para poder decir por qué. */
  eventos?: EventoAplicado[]
}

export interface ResilienceSnapshot {
  todini_index: number;
  network_entropy: number;
  hydraulic_redundancy: number;
  serviceability: {
    pressure_serviceability: number;
    junctions_meeting_pressure: number;
    total_junctions: number;
  };
}

export interface ResilienceIndicatorsResult {
  success: boolean;
  data?: {
    before: ResilienceSnapshot;
    after?: ResilienceSnapshot;
    delta?: {
      todini_index: number;
      network_entropy: number;
      hydraulic_redundancy: number;
      pressure_serviceability: number;
    };
  };
  error?: string;
}

export interface FragilityCurveResult {
  success: boolean;
  data?: {
    hazard_type: string;
    material: string;
    median_pgv: number;
    beta: number;
    intensities: number[];
    pipe_failure_probability: number[];
    expected_failed_pipes: number[];
    pipe_count: number;
    total_length_km: number;
    methodology: string;
  };
  error?: string;
}

export class WNTRResilienceService {
  private servicePath: string;

  /** Ver nota en wntrWrapper: se resuelve en cada ejecución, no al construir. */
  private get pythonPath(): string {
    return findPythonPath();
  }

  constructor() {
    this.servicePath = resolvePythonScriptPath('wntr_resilience_service.py');
  }

  async skeletonizeNetwork(networkFile: string, options?: {
    pipe_diameter_threshold_mm?: number;
    branch_trim?: boolean;
    series_pipe_merge?: boolean;
    parallel_pipe_merge?: boolean;
  }): Promise<SkeletonizeResult> {
    return this.executePythonService('skeletonize', networkFile, options);
  }

  async simulateComponentFailure(networkFile: string, options: {
    components: ComponentFailureInput[];
    duration_hours?: number;
    failure_start_hours?: number;
    restore_hours?: number;
    min_pressure_threshold?: number;
    /** Módulo de demanda media en l/hab/día (típico LatAm 150-300, por defecto 200). */
    demand_module_lphd?: number;
    /** Por debajo de esta fracción de la demanda esperada el nudo cuenta como afectado. */
    availability_threshold?: number;
    /** Presión a la que PDA entrega el 100% de la demanda. */
    required_pressure?: number;
    /** Presión por debajo de la cual PDA no entrega nada. */
    minimum_pressure?: number;
    /** Habitantes por acometida. Si se omite no se reportan clientes. */
    persons_per_connection?: number;
  }): Promise<SimulateFailureResult> {
    return this.executePythonService('simulate_failure', networkFile, options);
  }

  /**
   * Ejecuta un escenario declarativo (#43).
   *
   * Dos corridas en PDA —referencia y evento— porque sin la de referencia el
   * déficit que la red ya arrastra se le atribuye al escenario. El resultado
   * trae la demanda no satisfecha por nudo y total, los nudos bajo presión
   * mínima con su duración, y los habitantes y clientes afectados con el método
   * declarado.
   */
  async simulateScenario(networkFile: string, definicion: {
    nombre?: string
    eventos: EscenarioEvento[]
    duration_hours?: number
    min_pressure_threshold?: number
    /** Presión a la que PDA entrega el 100% de la demanda. */
    required_pressure?: number
    /** Presión por debajo de la cual PDA no entrega nada. */
    minimum_pressure?: number
    /** Módulo de demanda media en l/hab/día (típico LatAm 150-300, por defecto 200). */
    demand_module_lphd?: number
    availability_threshold?: number
    /** Habitantes por acometida. Si se omite no se reportan clientes. */
    persons_per_connection?: number
  }): Promise<SimulateScenarioResult> {
    return this.executePythonService('scenario', networkFile, definicion);
  }

  async calculateResilienceIndicators(networkFile: string, options?: {
    duration_hours?: number;
    min_pressure_threshold?: number;
    failed_components?: ComponentFailureInput[];
    failure_start_hours?: number;
  }): Promise<ResilienceIndicatorsResult> {
    return this.executePythonService('resilience_indicators', networkFile, options);
  }

  async generateFragilityCurve(networkFile: string, options?: {
    hazard_type?: string;
    material?: 'CI' | 'AC' | 'STEEL' | 'DI' | 'PVC' | 'HDPE' | 'CONCRETE' | 'DEFAULT';
    max_intensity?: number;
    steps?: number;
    beta?: number;
  }): Promise<FragilityCurveResult> {
    return this.executePythonService('fragility_curve', networkFile, options);
  }

  private async executePythonService(command: string, networkFile: string, options?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const args = [this.servicePath, command, networkFile];
      if (options) {
        args.push(JSON.stringify(options));
      }

      logger.debug(`Executing: ${this.pythonPath} ${args.join(' ')}`);

      const pythonProcess = spawn(this.pythonPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        pythonProcess.kill();
        reject(new Error('Resilience analysis timeout'));
      }, 180000); // 3 minutes - extended-period simulations can be slow

      pythonProcess.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          try {
            resolve(JSON.parse(stdout));
          } catch (parseError) {
            logger.error('Failed to parse Python service response:', parseError);
            logger.error('Raw stdout:', stdout);
            reject(new Error(`Invalid JSON response: ${parseError}`));
          }
        } else {
          logger.error(`Python service exited with code ${code}`);
          logger.error('stderr:', stderr);
          reject(new Error(`Python service failed with code ${code}: ${stderr}`));
        }
      });

      pythonProcess.on('error', (error) => {
        logger.error('Failed to start Python service:', error instanceof Error ? error.message : 'Unknown error');
        reject(error);
      });
    });
  }
}
