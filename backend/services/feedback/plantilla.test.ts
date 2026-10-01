import { describe, it, expect } from 'vitest'
import {
  ajustarALaUrl,
  construirReporte,
  esUrlPermitida,
  MAX_URL,
  normalizarFormulario,
  urlDeIssue,
  type Entorno,
  type FormularioBug,
  type FormularioMejora,
} from './plantilla'

const BUG: FormularioBug = {
  tipo: 'bug',
  haciendo: 'Preguntaba al chat por la presión de la red',
  paso: 'La respuesta no llegó y se quedó cargando',
  esperabas: 'Que respondiera en unos segundos',
  frecuencia: 'a-veces',
}

const MEJORA: FormularioMejora = {
  tipo: 'mejora',
  necesitas: 'Exportar la simulación a Excel',
  paraQue: 'Para mandarla al cliente',
  comoHoy: 'Copio los valores a mano',
}

const ENTORNO: Entorno = {
  version: '1.44.0',
  so: 'linux 6.8.0',
  arquitectura: 'x64',
  python: 'Python 3.12.3',
  venvGestionado: true,
  pantalla: 'chat',
  registro: ['[renderer] [error] algo falló'],
}

describe('normalizarFormulario (#217)', () => {
  it('acepta un bug y una mejora completos, recortando espacios', () => {
    expect(normalizarFormulario({ ...BUG, paso: '  roto  ' })).toEqual({ ...BUG, paso: 'roto' })
    expect(normalizarFormulario(MEJORA)).toEqual(MEJORA)
  })

  it('rechaza lo que no es un formulario válido', () => {
    expect(normalizarFormulario(null)).toBeNull()
    expect(normalizarFormulario({ tipo: 'otro' })).toBeNull()
    expect(normalizarFormulario({ ...BUG, paso: '   ' })).toBeNull()
    expect(normalizarFormulario({ ...BUG, frecuencia: 'nunca' })).toBeNull()
    expect(normalizarFormulario({ ...MEJORA, necesitas: 42 })).toBeNull()
  })

  it('limita la longitud de cada campo', () => {
    const f = normalizarFormulario({ ...BUG, paso: 'x'.repeat(10_000) }) as FormularioBug
    expect(f.paso.length).toBe(4000)
  })
})

describe('construirReporte: plantilla de bug (R13, D7)', () => {
  const { titulo, cuerpo } = construirReporte(BUG, ENTORNO)

  it('lleva el prefijo de la plantilla y lo que pasó como título', () => {
    expect(titulo).toBe('[BUG] La respuesta no llegó y se quedó cargando')
  })

  it('reparte los tres campos en las secciones de bug_report.md y la frecuencia en «Impact»', () => {
    const tras = (seccion: string) => cuerpo.split(seccion)[1].split('\n## ')[0]
    expect(tras('## 🐛 Bug Description')).toContain(BUG.paso)
    expect(tras('## 🔄 Steps to Reproduce')).toContain(BUG.haciendo)
    expect(tras('## ✅ Expected Behavior')).toContain(BUG.esperabas)
    expect(tras('## ⚠️ Impact')).toContain('Frequency: Sometimes')
  })

  it('incluye el entorno y la pantalla de origen cuando hay consentimiento (R4, R11)', () => {
    expect(cuerpo).toContain('- Boorie Version: 1.44.0')
    expect(cuerpo).toContain('- OS: linux 6.8.0')
    expect(cuerpo).toContain('- Python Version: Python 3.12.3 (Boorie managed venv)')
    expect(cuerpo).toContain('- Screen: chat')
    expect(cuerpo).toContain('[renderer] [error] algo falló')
  })

  it('sin consentimiento no lleva ningún dato técnico (R10)', () => {
    const sin = construirReporte(BUG, null).cuerpo
    for (const dato of ['1.44.0', 'linux', 'x64', 'Python', '- Screen:', 'Console Output', 'algo falló']) {
      expect(sin).not.toContain(dato)
    }
    expect(sin).toContain('Not included')
  })

  it('acorta un título largo', () => {
    const t = construirReporte({ ...BUG, paso: 'a'.repeat(200) }, null).titulo
    expect(t.length).toBeLessThanOrEqual('[BUG] '.length + 80)
    expect(t.endsWith('…')).toBe(true)
  })
})

describe('construirReporte: plantilla de mejora (R8, R13)', () => {
  it('usa las secciones de feature_request.md', () => {
    const { titulo, cuerpo } = construirReporte(MEJORA, null)
    expect(titulo).toBe('[FEATURE] Exportar la simulación a Excel')
    expect(cuerpo.split('## 🚀 Feature Description')[1]).toContain(MEJORA.necesitas)
    expect(cuerpo.split('## 🎯 Problem Statement')[1]).toContain(MEJORA.paraQue)
    expect(cuerpo.split('## 🔄 Alternative Solutions')[1]).toContain(MEJORA.comoHoy)
  })
})

describe('URL del issue (R25)', () => {
  it('apunta a issues/new con la plantilla y el texto codificados', () => {
    const url = urlDeIssue(construirReporte(BUG, null), 'bug')
    const u = new URL(url)
    expect(u.origin + u.pathname).toBe('https://github.com/Boorie-AI/boorie_cliente/issues/new')
    expect(u.searchParams.get('template')).toBe('bug_report.md')
    expect(u.searchParams.get('labels')).toBe('bug')
    expect(u.searchParams.get('title')).toBe('[BUG] La respuesta no llegó y se quedó cargando')
    expect(u.searchParams.get('body')).toContain('## 🐛 Bug Description')
    expect(new URL(urlDeIssue(construirReporte(MEJORA, null), 'mejora')).searchParams.get('template')).toBe('feature_request.md')
  })

  it('la lista blanca solo deja pasar issues/new de este repositorio', () => {
    expect(esUrlPermitida('https://github.com/Boorie-AI/boorie_cliente/issues/new?title=x')).toBe(true)
    for (const mala of [
      'http://github.com/Boorie-AI/boorie_cliente/issues/new',
      'https://github.com/otro/repo/issues/new',
      'https://github.com/Boorie-AI/boorie_cliente/issues/new/../../settings',
      'https://github.com.evil.io/Boorie-AI/boorie_cliente/issues/new',
      'https://user:pw@github.com/Boorie-AI/boorie_cliente/issues/new',
      'file:///etc/passwd',
      'no es una url',
    ]) {
      expect(esUrlPermitida(mala), mala).toBe(false)
    }
  })

  it('si no cabe, quita primero las líneas antiguas del log y conserva las recientes', () => {
    const registro = Array.from({ length: 50 }, (_, i) => `linea-${i} ${'x'.repeat(200)}`)
    const { url, reporte, recortado } = ajustarALaUrl(BUG, { ...ENTORNO, registro })
    expect(url.length).toBeLessThanOrEqual(MAX_URL)
    expect(recortado).toBe(true)
    expect(reporte.cuerpo).toContain('linea-49')
    expect(reporte.cuerpo).not.toContain('linea-0 ')
    expect(reporte.cuerpo).toContain(BUG.paso)
  })

  it('si ni sin log cabe, corta el cuerpo y lo avisa', () => {
    const { url, reporte, recortado } = ajustarALaUrl({ ...BUG, paso: 'ñ'.repeat(4000), esperabas: 'é'.repeat(4000) }, null)
    expect(url.length).toBeLessThanOrEqual(MAX_URL)
    expect(recortado).toBe(true)
    expect(reporte.cuerpo).toContain('clipboard')
  })

  it('no toca lo que ya cabe', () => {
    expect(ajustarALaUrl(BUG, ENTORNO).recortado).toBe(false)
  })
})
