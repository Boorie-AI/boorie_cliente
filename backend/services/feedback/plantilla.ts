/**
 * Del formulario de «Ayuda y comentarios» al issue con la plantilla del equipo
 * (#217). Los títulos de sección son los de `.github/ISSUE_TEMPLATE/bug_report.md`
 * y `feature_request.md`, para que el triaje los lea igual que los demás.
 */

export type Frecuencia = 'una-vez' | 'a-veces' | 'siempre'

export interface FormularioBug {
  tipo: 'bug'
  haciendo: string
  paso: string
  esperabas: string
  frecuencia: Frecuencia
}

export interface FormularioMejora {
  tipo: 'mejora'
  necesitas: string
  paraQue: string
  comoHoy: string
}

export type Formulario = FormularioBug | FormularioMejora

export interface Entorno {
  version: string
  so: string
  arquitectura: string
  python: string | null
  venvGestionado: boolean
  pantalla: string
  registro: string[]
}

export interface Reporte {
  titulo: string
  cuerpo: string
}

export const MAX_CAMPO = 4000
const MAX_TITULO = 80
const FRECUENCIAS: Frecuencia[] = ['una-vez', 'a-veces', 'siempre']

const FRECUENCIA_EN: Record<Frecuencia, string> = {
  'una-vez': 'Once',
  'a-veces': 'Sometimes',
  siempre: 'Always',
}

function texto(v: unknown): string | null {
  if (typeof v !== 'string') return null
  return v.trim().slice(0, MAX_CAMPO)
}

/** El formulario llega por IPC: se valida aquí, no se da por bueno lo que mande el renderer. */
export function normalizarFormulario(raw: unknown): Formulario | null {
  if (!raw || typeof raw !== 'object') return null
  const f = raw as Record<string, unknown>
  if (f.tipo === 'bug') {
    const haciendo = texto(f.haciendo)
    const paso = texto(f.paso)
    const esperabas = texto(f.esperabas)
    const frecuencia = FRECUENCIAS.includes(f.frecuencia as Frecuencia) ? (f.frecuencia as Frecuencia) : null
    if (haciendo === null || !paso || esperabas === null || !frecuencia) return null
    return { tipo: 'bug', haciendo, paso, esperabas, frecuencia }
  }
  if (f.tipo === 'mejora') {
    const necesitas = texto(f.necesitas)
    const paraQue = texto(f.paraQue)
    const comoHoy = texto(f.comoHoy)
    if (!necesitas || paraQue === null || comoHoy === null) return null
    return { tipo: 'mejora', necesitas, paraQue, comoHoy }
  }
  return null
}

function tituloDe(prefijo: string, frase: string): string {
  const linea = frase.split('\n')[0].trim()
  const corta = linea.length > MAX_TITULO ? `${linea.slice(0, MAX_TITULO - 1).trimEnd()}…` : linea
  return `${prefijo} ${corta}`
}

const vacio = (s: string) => s || '_—_'

function seccionEntorno(entorno: Entorno | null): string[] {
  if (!entorno) {
    return ['## 🖥️ Environment Information', '_Not included: the user chose not to share technical information._']
  }
  const python = entorno.python
    ? `${entorno.python}${entorno.venvGestionado ? ' (Boorie managed venv)' : ''}`
    : 'not detected'
  const lineas = [
    '## 🖥️ Environment Information',
    `- OS: ${entorno.so}`,
    `- Boorie Version: ${entorno.version}`,
    `- Architecture: ${entorno.arquitectura}`,
    `- Python Version: ${python}`,
    `- Screen: ${entorno.pantalla}`,
  ]
  if (entorno.registro.length > 0) {
    lineas.push('', '## 🔍 Console Output', '```', ...entorno.registro, '```')
  }
  return lineas
}

export function construirReporte(form: Formulario, entorno: Entorno | null): Reporte {
  const pie = ['## 📋 Additional Context', 'Sent from Boorie → Help & feedback.']

  if (form.tipo === 'bug') {
    return {
      titulo: tituloDe('[BUG]', form.paso),
      cuerpo: [
        '## 🐛 Bug Description',
        form.paso,
        '',
        '## 🔄 Steps to Reproduce',
        vacio(form.haciendo),
        '',
        '## ✅ Expected Behavior',
        vacio(form.esperabas),
        '',
        '## ⚠️ Impact',
        `- Frequency: ${FRECUENCIA_EN[form.frecuencia]}`,
        '',
        '## 📸 Screenshots',
        '<!-- Si copiaste la captura desde Boorie, pégala aquí con Ctrl+V. -->',
        '',
        ...seccionEntorno(entorno),
        '',
        ...pie,
      ].join('\n'),
    }
  }

  return {
    titulo: tituloDe('[FEATURE]', form.necesitas),
    cuerpo: [
      '## 🚀 Feature Description',
      form.necesitas,
      '',
      '## 🎯 Problem Statement',
      vacio(form.paraQue),
      '',
      '## 🔄 Alternative Solutions',
      vacio(form.comoHoy),
      '',
      ...seccionEntorno(entorno),
      '',
      ...pie,
    ].join('\n'),
  }
}

export const URL_NUEVO_ISSUE = 'https://github.com/Boorie-AI/boorie_cliente/issues/new'
/** GitHub responde 414 por encima de unos 8 KB de URL. */
export const MAX_URL = 7500

export function urlDeIssue(reporte: Reporte, tipo: Formulario['tipo']): string {
  const params = new URLSearchParams({
    template: tipo === 'bug' ? 'bug_report.md' : 'feature_request.md',
    labels: tipo === 'bug' ? 'bug' : 'enhancement',
    title: reporte.titulo,
    body: reporte.cuerpo,
  })
  return `${URL_NUEVO_ISSUE}?${params.toString()}`
}

/** Única dirección que la app puede abrir desde este canal. */
export function esUrlPermitida(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.host === 'github.com' && u.pathname === '/Boorie-AI/boorie_cliente/issues/new'
      && u.username === '' && u.password === '' && u.hash === ''
  } catch {
    return false
  }
}

const AVISO_RECORTE = '\n\n_(Report shortened to fit in the link. The full text was copied to the clipboard.)_'

/**
 * La URL tiene que caber: primero se quitan líneas del log, de las más antiguas
 * a las más recientes, y sólo si aun así no cabe se corta el cuerpo.
 */
export function ajustarALaUrl(form: Formulario, entorno: Entorno | null): { url: string; reporte: Reporte; recortado: boolean } {
  const completo = construirReporte(form, entorno)
  let url = urlDeIssue(completo, form.tipo)
  if (url.length <= MAX_URL) return { url, reporte: completo, recortado: false }

  if (entorno) {
    const total = entorno.registro.length
    for (let quedan = total - 1; quedan >= 0; quedan--) {
      const r = construirReporte(form, { ...entorno, registro: entorno.registro.slice(total - quedan) })
      url = urlDeIssue(r, form.tipo)
      if (url.length <= MAX_URL) return { url, reporte: r, recortado: true }
    }
  }

  const base = construirReporte(form, entorno ? { ...entorno, registro: [] } : null)
  let cuerpo = base.cuerpo
  while (cuerpo.length > 0) {
    cuerpo = cuerpo.slice(0, Math.floor(cuerpo.length * 0.9))
    const r = { titulo: base.titulo, cuerpo: cuerpo + AVISO_RECORTE }
    url = urlDeIssue(r, form.tipo)
    if (url.length <= MAX_URL) return { url, reporte: r, recortado: true }
  }
  const minimo = { titulo: base.titulo, cuerpo: AVISO_RECORTE.trim() }
  return { url: urlDeIssue(minimo, form.tipo), reporte: minimo, recortado: true }
}
