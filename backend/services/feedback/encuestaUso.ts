import { MAX_URL, URL_NUEVO_ISSUE } from './plantilla'

/**
 * La encuesta de uso de `.github/ISSUE_TEMPLATE/Cuestionario1_BoorieCliente.yml`
 * dentro de la app. Etiquetas y opciones van en castellano, tal cual las de la
 * plantilla: el issue que sale tiene que leerse igual que los que ya hay (#13),
 * se conteste en el idioma que se conteste. La interfaz las traduce aparte.
 */

export type TipoPregunta = 'texto' | 'parrafo' | 'opciones'

export interface Pregunta {
  id: string
  tipo: TipoPregunta
  etiqueta: string
  opciones?: string[]
  obligatoria: boolean
}

export interface Seccion {
  id: string
  titulo: string
  preguntas: Pregunta[]
}

const texto = (id: string, etiqueta: string, obligatoria = true): Pregunta => ({ id, tipo: 'texto', etiqueta, obligatoria })
const parrafo = (id: string, etiqueta: string, obligatoria = true): Pregunta => ({ id, tipo: 'parrafo', etiqueta, obligatoria })
const opciones = (id: string, etiqueta: string, valores: string[]): Pregunta => ({ id, tipo: 'opciones', etiqueta, opciones: valores, obligatoria: true })

const FACILIDAD = ['Muy fácil', 'Fácil', 'Regular', 'Difícil', 'Muy difícil']
const ACUERDO = ['Sí, totalmente', 'Sí, en parte', 'Regular', 'No mucho', 'No']

export const NO_APLICA = 'No aplica'
export const SECTOR_ACADEMIA = 'Academia'
export const SECTOR_APYS = 'APyS (Agua Potable y Saneamiento)'

export const SECCIONES: Seccion[] = [
  {
    id: 'identificacion',
    titulo: 'Identificación',
    preguntas: [
      texto('nombre-completo', 'Nombre completo'),
      opciones('pais', 'País', ['Chile', 'Colombia', 'El Salvador', 'Perú', 'Otro']),
      texto('institucion', 'Institución'),
      opciones('sector', 'Sector al que pertenece', [SECTOR_ACADEMIA, SECTOR_APYS]),
      opciones('rol-academia', 'Rol en Academia', [NO_APLICA, 'Docente', 'Estudiante pregrado', 'Estudiante posgrado', 'Investigador', 'Director académico']),
      opciones('rol-apys', 'Rol en APyS', [NO_APLICA, 'Operador', 'Técnico especializado', 'Supervisor técnico', 'Coordinador operativo']),
      texto('cargo', 'Cargo'),
      texto('area-trabajo', 'Área de trabajo'),
    ],
  },
  {
    id: 'uso',
    titulo: 'Uso general',
    preguntas: [
      texto('frecuencia', '¿Con qué frecuencia usas la aplicación?'),
      texto('tiempo-uso', '¿Desde hace cuánto tiempo la usas?'),
      texto('proposito', '¿Para qué la utilizas principalmente?'),
      opciones('dispositivo', '¿Qué tipo de dispositivo usas para acceder a la aplicación?', ['Teléfono móvil', 'Computadora de escritorio', 'Portátil', 'Tablet', 'Otro']),
      opciones('uso', '¿La usas de forma personal o para trabajo/estudio?', ['Personal', 'Trabajo', 'Estudio', 'Mixto']),
    ],
  },
  {
    id: 'inicio',
    titulo: 'Primeros pasos',
    preguntas: [
      opciones('instalacion', '¿Qué tan fácil fue instalar o abrir la aplicación por primera vez?', FACILIDAD),
      opciones('entendimiento', '¿Pudiste entender rápidamente para qué sirve?', ['Sí, totalmente', 'Sí, en parte', 'Más o menos', 'No mucho', 'No']),
      opciones('primer-uso', '¿Encontraste fácil crear tu primer uso o interacción?', FACILIDAD),
      parrafo('inicio-confuso', '¿Hubo algún paso que te resultó confuso al comenzar?'),
      parrafo('mejorar-inicio', '¿Qué mejorarías del proceso de inicio?'),
    ],
  },
  {
    id: 'funcionalidad',
    titulo: 'Funcionalidad',
    preguntas: [
      opciones('cumple-esperativas', '¿La aplicación cumple con lo que esperabas?', ACUERDO),
      parrafo('funcion-util', '¿Qué función te resulta más útil?'),
      parrafo('funciones-no-uso', '¿Hay alguna función que no uses porque te parece difícil?', false),
      opciones('rapidez', '¿Sientes que la aplicación responde de manera rápida?', ['Siempre', 'Casi siempre', 'A veces', 'Rara vez', 'Nunca']),
      parrafo('errores', '¿Has encontrado errores o fallos durante el uso?'),
    ],
  },
  {
    id: 'diseno',
    titulo: 'Diseño y experiencia',
    preguntas: [
      opciones('navegacion', '¿Qué tan fácil es navegar dentro de la aplicación?', FACILIDAD),
      opciones('diseno', '¿Consideras que el diseño es claro y ordenado?', ACUERDO),
      opciones('satisfaccion', '¿Qué tan satisfecho estás con la experiencia general?', ['Muy satisfecho', 'Satisfecho', 'Neutral', 'Insatisfecho', 'Muy insatisfecho']),
      parrafo('utilidad', '¿La información o las respuestas que recibes te parecen útiles?'),
      opciones('confianza', '¿La aplicación te genera confianza para usarla de forma frecuente?', ['Sí, mucha confianza', 'Sí, bastante', 'Regular', 'Poca confianza', 'Nada de confianza']),
    ],
  },
  {
    id: 'problemas',
    titulo: 'Problemas técnicos',
    preguntas: [
      parrafo('login', '¿Has tenido problemas al iniciar sesión?', false),
      parrafo('cierre', '¿La aplicación se ha cerrado sola o ha presentado fallos?', false),
      parrafo('conexion', '¿Has tenido problemas de conexión o carga?', false),
      parrafo('lentitud', '¿Alguna parte de la aplicación tarda demasiado en responder?', false),
      parrafo('reinicio', '¿Has necesitado reiniciar la aplicación por un error?', false),
    ],
  },
  {
    id: 'sugerencias',
    titulo: 'Sugerencias',
    preguntas: [
      parrafo('mejoras', '¿Qué te gustaría que la aplicación hiciera mejor?'),
      parrafo('nueva-funcion', '¿Qué función nueva te gustaría que tuviera?', false),
      parrafo('cambiar-diseno', '¿Qué cambiarías del diseño o la forma de uso?', false),
    ],
  },
  {
    id: 'valoracion',
    titulo: 'Valoración final',
    preguntas: [
      opciones('recomendar', '¿Qué tan probable es que recomiendes la aplicación?', ['Muy probable', 'Probable', 'Neutral', 'Poco probable', 'Nada probable']),
      parrafo('experiencia-general', '¿Cómo calificarías tu experiencia general?'),
    ],
  },
]

export const PREGUNTAS: Pregunta[] = SECCIONES.flatMap(s => s.preguntas)

export type Respuestas = Record<string, string>

const MAX_RESPUESTA = 2000

/** El rol que no corresponde al sector elegido no se pregunta: vale «No aplica». */
export function preguntaOculta(id: string, respuestas: Respuestas): boolean {
  if (id === 'rol-academia') return respuestas.sector !== SECTOR_ACADEMIA
  if (id === 'rol-apys') return respuestas.sector !== SECTOR_APYS
  return false
}

export function faltanPorResponder(respuestas: Respuestas): string[] {
  return PREGUNTAS
    .filter(p => p.obligatoria && !preguntaOculta(p.id, respuestas) && !(respuestas[p.id] ?? '').trim())
    .map(p => p.id)
}

/** Llega por IPC: sólo pasan las preguntas conocidas y, en las de opciones, valores de la lista. */
export function normalizarRespuestas(raw: unknown): Respuestas | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const limpias: Respuestas = {}
  for (const p of PREGUNTAS) {
    const v = r[p.id]
    if (typeof v !== 'string') continue
    const valor = v.trim().slice(0, MAX_RESPUESTA)
    if (p.opciones && !p.opciones.includes(valor)) continue
    limpias[p.id] = valor
  }
  for (const id of ['rol-academia', 'rol-apys']) {
    if (preguntaOculta(id, limpias)) limpias[id] = NO_APLICA
  }
  return faltanPorResponder(limpias).length === 0 ? limpias : null
}

export const TITULO_ENCUESTA = 'Encuesta de uso: Boorie cliente'

/** Va en un comentario HTML: no se ve en el issue publicado y la app lo busca para saber que se publicó. */
export const marcaDeEncuesta = (ref: string) => `<!-- boorie-encuesta:${ref} -->`

function pie(version: string, ref: string): string {
  return `---\n_Enviada desde Boorie ${version} al salir de la aplicación._\n\n${marcaDeEncuesta(ref)}`
}

/** Mismo formato que GitHub da a un issue enviado con la plantilla: «### etiqueta» y la respuesta. */
export function construirEncuesta(respuestas: Respuestas, version: string, ref: string): { titulo: string; cuerpo: string } {
  const bloques = PREGUNTAS.map(p => `### ${p.etiqueta}\n\n${respuestas[p.id]?.trim() || '_No response_'}`)
  bloques.push(pie(version, ref))
  return { titulo: TITULO_ENCUESTA, cuerpo: bloques.join('\n\n') }
}

function url(titulo: string, cuerpo: string): string {
  return `${URL_NUEVO_ISSUE}?${new URLSearchParams({ labels: 'encuesta,feedback', title: titulo, body: cuerpo })}`
}

const AVISO_RECORTE = '\n\n_(La encuesta no cabe entera en el enlace. El texto completo está en el portapapeles: pégalo aquí en lugar de este.)_\n\n'

/** Si hay que recortar, se recortan las respuestas: el pie con la marca va siempre entero. */
export function urlDeEncuesta(respuestas: Respuestas, version: string, ref: string): { url: string; completo: string; recortado: boolean } {
  const { titulo, cuerpo } = construirEncuesta(respuestas, version, ref)
  const entera = url(titulo, cuerpo)
  if (entera.length <= MAX_URL) return { url: entera, completo: cuerpo, recortado: false }
  const final = pie(version, ref)
  let corto = cuerpo.slice(0, cuerpo.length - final.length)
  let candidata = entera
  while (corto.length > 0 && candidata.length > MAX_URL) {
    corto = corto.slice(0, Math.floor(corto.length * 0.9))
    candidata = url(titulo, corto + AVISO_RECORTE + final)
  }
  return { url: candidata, completo: cuerpo, recortado: true }
}
