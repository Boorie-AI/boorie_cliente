import i18n from '@/i18n'
import { decirTexto, type TextoDelMotor } from './textoDelMotor'
/**
 * El texto con el que el chat cuenta las medidas de eficiencia energética ya
 * verificadas (#42, segunda entrega).
 *
 * Escrito en código, por lo mismo que la narración de escenarios: el criterio del
 * issue es que **ninguna cifra de ahorro provenga del modelo** y que toda cifra
 * sea trazable a una ejecución concreta de WNTR. El modelo entiende la pregunta;
 * los números los pone quien los simuló.
 *
 * Se muestran también las medidas que **no** ahorran. Una recomendación que
 * resulta contraproducente es información: en Net3, parar las dos bombas en hora
 * punta consume más porque los depósitos se vacían y hay que recuperarlos.
 */

interface Ahorro {
  energia_kwh: number
  coste: number
  moneda: string
  porcentaje_energia: number
  origen: TextoDelMotor
}

export interface RecomendacionVerificada {
  candidata: {
    titulo: TextoDelMotor
    motivo: TextoDelMotor
    naturaleza: 'operativa' | 'equipo'
    medida: { tipo: string; elementos: string[]; desde_h?: number; hasta_h?: number }
  }
  runId?: string | null
  ahorro: Ahorro | null
  impacto_en_servicio?: {
    habitantes_afectados_atribuibles: number
    demanda_no_satisfecha_atribuible_m3: number
  }
  antes?: { energia_kwh: number; coste: number }
  despues?: { energia_kwh: number; coste: number }
  convergio?: boolean
  error?: string
}

export interface AnalisisResumido {
  energia_total_kwh: number
  coste_total: number
  moneda: string
  bombas: Array<{ nombre: string; energia_kwh: number; coste: number }>
}

const miles = (entera: string) => entera.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/** Mismo formato manual que la narración de escenarios, y por el mismo motivo. */
const numero = (n: number, decimales = 1) => {
  const [entera, decimal = ''] = Math.abs(n).toFixed(decimales).split('.')
  const signo = n < 0 ? '−' : ''
  return decimales > 0 ? `${signo}${miles(entera)},${decimal}` : `${signo}${miles(entera)}`
}

export function narrarEnergia(
  analisis: AnalisisResumido,
  recomendaciones: RecomendacionVerificada[],
  motivoSinRecomendaciones?: string | null,
): string {
  const l: string[] = []
  const m = analisis.moneda

  l.push(i18n.t('narracion.consumoBombeo', {
    kwh: numero(analisis.energia_total_kwh),
    coste: numero(analisis.coste_total, 2),
    moneda: m,
  }))
  if (analisis.bombas.length > 1) {
    const peor = [...analisis.bombas].sort((a, b) => b.energia_kwh - a.energia_kwh)[0]
    l.push(i18n.t('narracion.laQueMasGasta', {
      bomba: peor.nombre,
      kwh: numero(peor.energia_kwh),
      coste: numero(peor.coste, 2),
      moneda: m,
    }))
  }

  if (recomendaciones.length === 0) {
    l.push('')
    l.push(motivoSinRecomendaciones ?? i18n.t('narracion.sinMedidas'))
    return l.join('\n')
  }

  const ahorran = recomendaciones.filter(r => (r.ahorro?.energia_kwh ?? 0) > 0.05)
  const resto = recomendaciones.filter(r => !ahorran.includes(r))

  l.push('')
  // La concordancia se resuelve aquí y no en la plantilla: «1 medida
  // simulándolas» se leyó así en la aplicación y canta.
  const cuantas = recomendaciones.length === 1
    ? i18n.t('narracion.probadaUna')
    : i18n.t('narracion.probadasVarias', { count: recomendaciones.length })
  l.push(ahorran.length === 0
    ? i18n.t('narracion.ningunaAhorra', { cuantas })
    : ahorran.length === 1
      ? i18n.t('narracion.unaAhorra', { cuantas })
      : i18n.t('narracion.variasAhorran', { cuantas, count: ahorran.length }))

  for (const r of [...ahorran, ...resto]) {
    l.push('')
    l.push(`**${decirTexto(i18n.t.bind(i18n), r.candidata.titulo)}**` +
      (r.candidata.naturaleza === 'equipo' ? i18n.t('narracion.requiereEquipo') : ''))

    if (!r.ahorro) {
      l.push(i18n.t('narracion.noVerificada', { motivo: r.error ?? i18n.t('narracion.simulacionFallo') }))
      continue
    }

    const kwh = r.ahorro.energia_kwh
    if (Math.abs(kwh) < 0.05) {
      l.push(i18n.t('narracion.noCambia'))
    } else if (kwh < 0) {
      l.push(i18n.t('narracion.consumeMas', { kwh: numero(-kwh), coste: numero(-r.ahorro.coste, 2), moneda: m }))
    } else {
      l.push(i18n.t('narracion.ahorra', {
        kwh: numero(kwh),
        coste: numero(r.ahorro.coste, 2),
        moneda: m,
        porcentaje: numero(Math.abs(r.ahorro.porcentaje_energia)),
      }))
    }

    l.push(decirTexto(i18n.t.bind(i18n), r.candidata.motivo))

    if (r.impacto_en_servicio) {
      const hab = r.impacto_en_servicio.habitantes_afectados_atribuibles
      l.push(hab > 0
        ? i18n.t('narracion.costeServicio', {
            habitantes: numero(hab, 0),
            m3: numero(r.impacto_en_servicio.demanda_no_satisfecha_atribuible_m3),
          })
        : i18n.t('narracion.nadieSinAgua'))
    }

    // La cita de origen, que es criterio de aceptación del issue.
    l.push(r.runId
      ? i18n.t('narracion.verificadaEn', { runId: r.runId })
      : i18n.t('narracion.verificadaSinRun'))

    if (r.convergio === false) {
      l.push(i18n.t('narracion.noConvergioUna'))
    }
  }

  return l.join('\n')
}
