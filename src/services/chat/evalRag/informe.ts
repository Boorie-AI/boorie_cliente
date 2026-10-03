import {
  estabilidad,
  marcador,
  type CasoRAG,
  type EstabilidadCaso,
  type Marcador,
  type PuntuacionRespuesta,
  type ResultadoHecho,
} from '@/../backend/services/hydraulic/ragEval/bateria'
import type { UsoDelAdjunto } from '@/services/chat/adjunto'

export interface Repeticion {
  n: number
  estado: 'respondida' | 'error'
  error?: string
  /** Lo que vería el usuario, sin el apartado de la revisión. */
  respuesta?: string
  /** Lo que recibió el modelo, para volver a puntuar sin volver a preguntar (`--repuntuar`). */
  leido?: string
  puntuacion?: PuntuacionRespuesta
  tiempos: { componerMs: number; modeloMs: number; revisionMs?: number; totalMs: number }
  tokens: { entrada?: number; salida?: number; estimadosDelPrompt: number }
  adjunto?: UsoDelAdjunto
  revision?: { problemas: number }
  finishReason?: string
}

export interface ResultadoDeCaso {
  id: string
  estado: 'ejecutado' | 'no-ejecutado' | 'error'
  /** Por qué no se ejecutó: falta la clave, el documento o el modelo. No es un fallo. */
  motivo?: string
  repeticiones: Repeticion[]
  estabilidad?: EstabilidadCaso
}

export interface InformeDeModelo {
  modelo: string
  proveedor: string
  fecha: string
  repeticiones: number
  casos: ResultadoDeCaso[]
  marcador: Marcador
  tiempoMedioMs: number
  tokensMedios: { entrada: number; salida: number }
}

const respondidas = (r: ResultadoDeCaso) => r.repeticiones.filter(x => x.estado === 'respondida')
const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/** Cierra un caso: estado y estabilidad a partir de sus repeticiones. */
export function cerrarCaso(id: string, repeticiones: Repeticion[]): ResultadoDeCaso {
  const puntuaciones = repeticiones.flatMap(r => (r.puntuacion ? [r.puntuacion] : []))
  return {
    id,
    estado: puntuaciones.length ? 'ejecutado' : 'error',
    repeticiones,
    ...(puntuaciones.length ? { estabilidad: estabilidad(puntuaciones) } : {}),
  }
}

export function informeDeModelo(
  modelo: string, proveedor: string, repeticiones: number, casos: ResultadoDeCaso[], fecha = new Date().toISOString()
): InformeDeModelo {
  const todas = casos.flatMap(respondidas)
  return {
    modelo,
    proveedor,
    fecha,
    repeticiones,
    casos,
    marcador: marcador(casos.map(c => ({ estado: c.estado, puntuaciones: respondidas(c).flatMap(r => (r.puntuacion ? [r.puntuacion] : [])) }))),
    tiempoMedioMs: Math.round(media(todas.map(r => r.tiempos.totalMs))),
    tokensMedios: {
      entrada: Math.round(media(todas.map(r => r.tokens.entrada ?? r.tokens.estimadosDelPrompt))),
      salida: Math.round(media(todas.map(r => r.tokens.salida ?? 0))),
    },
  }
}

const segundos = (ms: number) => `${(ms / 1000).toFixed(0)} s`

/** A acierta, A* acierta sin estar en lo leído, R falla de recuperación, D falla de redacción. */
export function letra(h: ResultadoHecho | undefined): string {
  if (!h) return '·'
  if (h.estado === 'acierta') return h.sinRespaldo ? 'A*' : 'A'
  return h.estado === 'falla-recuperacion' ? 'R' : 'D'
}

function estableEnPorcentaje(c: ResultadoDeCaso): string {
  if (!c.estabilidad) return '—'
  const total = Object.keys(c.estabilidad.porHecho).length
  return total ? `${Math.round((c.estabilidad.hechosEstables / total) * 100)} %` : '—'
}

export function informeMarkdown(informes: InformeDeModelo[], casos: CasoRAG[]): string {
  const porId = new Map(casos.map(c => [c.id, c]))
  const l: string[] = []
  l.push(`# Batería de evaluación del RAG`, '')
  l.push(`Generado el ${informes[0]?.fecha ?? new Date().toISOString()}. Ver \`docs/BATERIA_RAG.md\` para leerlo.`, '')
  l.push('## Resumen por modelo', '')
  l.push('| Modelo | Proveedor | Rep. | Ejecutados | No ejecutados | Aciertos | Fallos de recuperación | Fallos de redacción | Prohibidos dichos | Tiempo medio | Tokens medios (entrada / salida) |')
  l.push('|---|---|---|---|---|---|---|---|---|---|---|')
  for (const i of informes) {
    const m = i.marcador
    l.push(`| ${i.modelo} | ${i.proveedor} | ${i.repeticiones} | ${m.ejecutados}/${m.casos} | ${m.noEjecutados} | ${m.porcentaje} % | ${m.fallosDeRecuperacion} | ${m.fallosDeRedaccion} | ${m.prohibidosDichos} | ${segundos(i.tiempoMedioMs)} | ${i.tokensMedios.entrada} / ${i.tokensMedios.salida} |`)
  }
  l.push('')

  for (const i of informes) {
    l.push(`## ${i.modelo}`, '')
    l.push('| Caso | Estado | Aciertos por repetición | Hechos estables | Prohibidos | Tiempo medio | Adjunto leído |')
    l.push('|---|---|---|---|---|---|---|')
    for (const c of i.casos) {
      const caso = porId.get(c.id)
      const rs = respondidas(c)
      const total = caso?.hechos.length ?? 0
      const aciertos = rs.map(r => `${r.puntuacion?.aciertos ?? 0}/${total}`).join(', ') || '—'
      const prohibidos = [...new Set(rs.flatMap(r => r.puntuacion?.prohibidos ?? []))].join(', ') || '—'
      const errores = c.repeticiones.filter(r => r.estado === 'error').length
      const estado = c.estado === 'no-ejecutado'
        ? `no ejecutado: ${c.motivo}`
        : c.estado === 'error' ? `error: ${c.repeticiones[0]?.error ?? ''}` : errores ? `ejecutado (${errores} con error)` : 'ejecutado'
      const adj = rs[0]?.adjunto
      const leido = adj ? `${adj.incluidos}/${adj.total} fragmentos${adj.porSignificado ? ', por significado' : ''}` : '—'
      l.push(`| ${c.id} | ${estado} | ${aciertos} | ${estableEnPorcentaje(c)} | ${prohibidos} | ${rs.length ? segundos(media(rs.map(r => r.tiempos.totalMs))) : '—'} | ${leido} |`)
    }
    l.push('')

    l.push(`### Hechos de ${i.modelo}`, '')
    l.push('A = acierta · A* = acierta sin estar en lo leído (de memoria) · R = no estaba en lo que recibió el modelo (recuperación) · D = estaba y no lo usó (redacción).', '')
    for (const c of i.casos) {
      const caso = porId.get(c.id)
      const rs = respondidas(c)
      if (!caso || !rs.length) continue
      l.push(`**${c.id}**`, '')
      l.push(`| Hecho | ${rs.map(r => `Rep. ${r.n}`).join(' | ')} |`)
      l.push(`|---|${rs.map(() => '---').join('|')}|`)
      for (const h of caso.hechos) {
        l.push(`| ${h.descripcion} | ${rs.map(r => letra(r.puntuacion?.hechos.find(x => x.id === h.id))).join(' | ')} |`)
      }
      l.push('')
    }
  }
  return l.join('\n')
}
