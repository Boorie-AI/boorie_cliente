import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import es from '../../../src/locales/es.json'
import en from '../../../src/locales/en.json'
import ca from '../../../src/locales/ca.json'
import { esUrlPermitida, MAX_URL } from './plantilla'
import {
  NO_APLICA,
  PREGUNTAS,
  SECTOR_ACADEMIA,
  SECTOR_APYS,
  TITULO_ENCUESTA,
  construirEncuesta,
  faltanPorResponder,
  normalizarRespuestas,
  urlDeEncuesta,
  type Respuestas,
} from './encuestaUso'

function respuestasCompletas(): Respuestas {
  const r: Respuestas = {}
  for (const p of PREGUNTAS) r[p.id] = p.opciones ? p.opciones[1] : `Respuesta a ${p.id}`
  r.sector = SECTOR_ACADEMIA
  return r
}

describe('encuesta de uso (#13)', () => {
  it('pregunta lo mismo que la plantilla de GitHub, con los mismos ids y en el mismo orden', () => {
    const yml = fs.readFileSync(path.join(__dirname, '../../../.github/ISSUE_TEMPLATE/Cuestionario1_BoorieCliente.yml'), 'utf-8')
    const ids = [...yml.matchAll(/^ {4}id: (\S+)$/gm)].map(m => m[1])
    expect(PREGUNTAS.map(p => p.id)).toEqual(ids)
    for (const p of PREGUNTAS) {
      expect(yml).toContain(`label: "${p.etiqueta}"`)
      for (const o of p.opciones ?? []) expect(yml).toContain(`- "${o}"`)
    }
  })

  it('cada pregunta está traducida en los tres idiomas, con tantas opciones como la plantilla', () => {
    for (const dic of [es, en, ca]) {
      const p = (dic as { encuesta: { p: Record<string, { l: string; ph?: string; o?: string[] }> } }).encuesta.p
      for (const q of PREGUNTAS) {
        expect(p[q.id]?.l, q.id).toBeTruthy()
        if (q.opciones) expect(p[q.id].o).toHaveLength(q.opciones.length)
        else expect(p[q.id].ph, q.id).toBeTruthy()
      }
    }
    const pes = (es as { encuesta: { p: Record<string, { l: string; o?: string[] }> } }).encuesta.p
    for (const q of PREGUNTAS) {
      expect(pes[q.id].l).toBe(q.etiqueta)
      if (q.opciones) expect(pes[q.id].o).toEqual(q.opciones)
    }
  })

  it('el rol del otro sector no se pregunta y se envía como «No aplica»', () => {
    const r = respuestasCompletas()
    delete r['rol-apys']
    expect(faltanPorResponder(r)).toEqual([])
    expect(normalizarRespuestas(r)?.['rol-apys']).toBe(NO_APLICA)

    const apys = { ...respuestasCompletas(), sector: SECTOR_APYS }
    delete apys['rol-academia']
    expect(normalizarRespuestas(apys)?.['rol-academia']).toBe(NO_APLICA)
  })

  it('rechaza respuestas incompletas o con opciones que no son de la lista', () => {
    const r = respuestasCompletas()
    expect(normalizarRespuestas({ ...r, cargo: '   ' })).toBeNull()
    expect(normalizarRespuestas({ ...r, pais: 'Atlántida' })).toBeNull()
    expect(normalizarRespuestas(null)).toBeNull()
  })

  it('las preguntas opcionales pueden quedar vacías', () => {
    const r = respuestasCompletas()
    delete r.login
    expect(normalizarRespuestas(r)).not.toBeNull()
  })

  it('el issue tiene el formato de los enviados con la plantilla', () => {
    const r = normalizarRespuestas(respuestasCompletas())!
    delete r.login
    const { titulo, cuerpo } = construirEncuesta(r, '1.50.0', 'abc123')
    expect(titulo).toBe(TITULO_ENCUESTA)
    expect(cuerpo.startsWith('### Nombre completo\n\nRespuesta a nombre-completo\n\n### País\n\nColombia')).toBe(true)
    expect(cuerpo).toContain('### ¿Has tenido problemas al iniciar sesión?\n\n_No response_')
    expect(cuerpo).toContain('Boorie 1.50.0')
    expect(cuerpo.endsWith('<!-- boorie-encuesta:abc123 -->')).toBe(true)
  })

  it('la URL va al repositorio, con las etiquetas de la plantilla', () => {
    const { url, recortado } = urlDeEncuesta(normalizarRespuestas(respuestasCompletas())!, '1.50.0', 'abc123')
    expect(recortado).toBe(false)
    expect(esUrlPermitida(url)).toBe(true)
    const q = new URL(url).searchParams
    expect(q.get('labels')).toBe('encuesta,feedback')
    expect(q.get('title')).toBe(TITULO_ENCUESTA)
  })

  it('si no cabe en la URL, recorta las respuestas pero no la referencia', () => {
    const r = normalizarRespuestas({ ...respuestasCompletas(), 'experiencia-general': 'ñ'.repeat(2000), mejoras: 'á'.repeat(2000) })!
    const res = urlDeEncuesta(r, '1.50.0', 'abc123')
    expect(res.recortado).toBe(true)
    expect(res.url.length).toBeLessThanOrEqual(MAX_URL)
    expect(res.completo).toContain('ñ'.repeat(2000))
    const body = new URL(res.url).searchParams.get('body')!
    expect(body).toContain('portapapeles')
    expect(body.endsWith('<!-- boorie-encuesta:abc123 -->')).toBe(true)
  })
})
