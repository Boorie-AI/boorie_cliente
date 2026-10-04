/**
 * El prompt y la lectura de las consultas en el idioma del adjunto (#224).
 *
 * Sin dependencias: lo usan el renderer, que las pide a Ollama, y el proceso
 * principal, que las pide a la nube con la clave que sólo vive allí.
 */

export type Idioma = 'es' | 'ca' | 'en'

const NOMBRE: Record<Idioma, string> = { es: 'castellano', ca: 'catalán', en: 'inglés' }

const EJEMPLO: Record<Idioma, string[]> = {
  en: ['pipe diameter selection discharge', 'head loss calculation', 'PVC roughness coefficient'],
  es: ['selección del diámetro de tubería', 'cálculo de la pérdida de carga', 'coeficiente de rugosidad del PVC'],
  ca: ['selecció del diàmetre de canonada', 'càlcul de la pèrdua de càrrega', 'coeficient de rugositat del PVC'],
}

export const esIdioma = (valor: unknown): valor is Idioma => valor === 'es' || valor === 'ca' || valor === 'en'

export function promptDeConsultas(pregunta: string, idiomaDelDocumento: Idioma): string {
  const idioma = NOMBRE[idiomaDelDocumento]
  return `Una persona pregunta sobre un documento escrito en ${idioma}. Para encontrar en él las partes que responden, escribe consultas de búsqueda en ${idioma}: cortas (de 2 a 6 palabras) y una por cada cosa distinta que pide la pregunta. Entre 3 y 8, una por línea, sin numerar ni explicar.
- Nombra cada ensayo, método o concepto con el término técnico que usaría un libro en ${idioma}, no traduciendo palabra por palabra.
- Busca lo que se pide (tablas, procedimientos, fórmulas, criterios), no los datos del caso: profundidades, diámetros o caudales concretos no están en el documento.

Ejemplo
Pregunta: ¿Qué diámetro de tubería necesito para 50 l/s y cuánta pérdida de carga tendrá? ¿Qué rugosidad uso para PVC?
Consultas:
${EJEMPLO[idiomaDelDocumento].join('\n')}

Pregunta: ${pregunta}
Consultas:`
}

const MAXIMO_CONSULTAS = 8

/** Las líneas que son consultas: cortas, sin preguntas ni explicaciones. */
export function leerConsultas(respuesta: string): string[] {
  const vistas = new Set<string>()
  return respuesta
    .split('\n')
    .map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^["«]|["»]$/g, '').trim())
    .filter(l => {
      const palabras = l.split(/\s+/).filter(Boolean).length
      if (palabras < 1 || palabras > 8 || /[?:]|\.$/.test(l) || vistas.has(l.toLowerCase())) return false
      vistas.add(l.toLowerCase())
      return true
    })
    .slice(0, MAXIMO_CONSULTAS)
}
