import { renderToStaticMarkup } from 'react-dom/server'
import type { TFunction } from 'i18next'
import type { Conversation, Message } from '@/stores/chatStore'
import { separarDocumentoPegado } from '@/services/chat/adjunto'
import { logger } from '@/utils/logger'
import { MarkdownRenderer } from './MarkdownRenderer'

export interface ConversacionCopiable {
  texto: string
  html: string
}

// Lo mismo que se ve en la burbuja: la pregunta, y del adjunto solo el nombre.
function partesDelMensaje(m: Message) {
  if (m.role !== 'user') return { contenido: m.content, adjunto: undefined }
  const { pregunta, nombre } = separarDocumentoPegado(m.content)
  return { contenido: pregunta, adjunto: m.metadata?.adjunto?.nombre ?? nombre }
}

const SIMBOLOS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', eta: 'η', theta: 'θ',
  lambda: 'λ', mu: 'μ', nu: 'ν', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', omega: 'ω',
  Delta: 'Δ', Sigma: 'Σ', Phi: 'Φ', Omega: 'Ω', Gamma: 'Γ', Lambda: 'Λ',
  cdot: '·', times: '×', div: '÷', pm: '±', approx: '≈', leq: '≤', geq: '≥', le: '≤', ge: '≥',
  neq: '≠', infty: '∞', rightarrow: '→', to: '→', sum: 'Σ', partial: '∂', circ: '°', degree: '°',
}
const SUPERINDICES: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' }

// Word no entiende el HTML de KaTeX sin su hoja de estilos: sale la fórmula
// repetida y descolocada. Se pega como texto que un ingeniero lee sin LaTeX.
export function texLegible(tex: string): string {
  let s = tex.trim()
    .replace(/\\(?:left|right)\s*/g, '')
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/\\([A-Za-z]+)/g, (todo, nombre: string) => SIMBOLOS[nombre] ?? todo)
    // Solo exponentes enteros: «R^{0.63}» con superíndices se leería «R⁰.63».
    .replace(/\^(?:\{(-?\d+)\}|(\d)(?![\d.]))/g, (_, llaves: string | undefined, suelto: string | undefined) =>
      [...(llaves ?? suelto ?? '')].map(c => SUPERINDICES[c]).join(''))
  for (let i = 0; i < 5; i++) {
    const antes = s
    s = s
      // Antes que \frac, que no ve dentro de llaves anidadas: «\frac{S_{n-1}}{…}» se quedaba
      // sin convertir. Con paréntesis, «S_(n-1)» no se lee como «S_n menos 1».
      .replace(/_\{([^{}]*)\}/g, (_, sub: string) => (sub.trim().length > 1 ? `_(${sub.trim()})` : `_${sub.trim()}`))
      .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a: string, b: string) => `${envolver(a)}/${envolver(b)}`)
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
      .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\s*\{([^{}]*)\}/g, '$1')
    if (s === antes) break
  }
  return s
    .replace(/[{}]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// «2g» va entre paréntesis: «v²/2g» se puede leer como (v²/2)·g.
const envolver = (s: string) => {
  const limpio = s.trim()
  return /^(\d+(\.\d+)?|[^\W\d][\w⁰¹²³⁴⁵⁶⁷⁸⁹⁻]*)$/u.test(limpio) || entreParentesis(limpio) ? limpio : `(${limpio})`
}

// El modelo suele escribir ya «\frac{(a - b)}{c}»: envolverlo otra vez daba «((a - b))».
const entreParentesis = (s: string) => {
  if (!s.startsWith('(') || !s.endsWith(')')) return false
  let nivel = 0
  for (let i = 0; i < s.length; i++) {
    nivel += s[i] === '(' ? 1 : s[i] === ')' ? -1 : 0
    if (nivel === 0 && i < s.length - 1) return false
  }
  return true
}

const BORDE = 'border:1px solid #808080;padding:4px 8px;vertical-align:top'

/** El marcado que pinta el chat, con lo que Word no sabe leer cambiado por algo que sí. */
function paraWord(html: string): string {
  const raiz = document.createElement('div')
  raiz.innerHTML = html

  raiz.querySelectorAll('.katex-display, .katex').forEach(nodo => {
    // El .katex de dentro de un .katex-display ya se fue con su padre.
    if (!raiz.contains(nodo)) return
    const tex = nodo.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? nodo.textContent ?? ''
    const formula = document.createElement(nodo.classList.contains('katex-display') ? 'p' : 'span')
    const cursiva = document.createElement('i')
    cursiva.textContent = texLegible(tex)
    formula.appendChild(cursiva)
    nodo.replaceWith(formula)
  })

  // El chat pinta las listas como filas con la viñeta a mano; Word las quiere
  // como <ul>/<ol> para darles sangría y numeración propias.
  raiz.querySelectorAll('div.flex.items-start').forEach(fila => {
    const [marca, cuerpo] = Array.from(fila.children)
    if (!marca || !cuerpo || !raiz.contains(fila)) return
    const etiqueta = marca.textContent === '•' ? 'UL' : 'OL'
    const lista = document.createElement(etiqueta)
    if (etiqueta === 'OL') lista.setAttribute('start', String(parseInt(marca.textContent ?? '1', 10) || 1))
    fila.before(lista)
    let actual: Element | null = fila
    while (actual?.matches('div.flex.items-start') && (actual.firstElementChild?.textContent === '•') === (etiqueta === 'UL')) {
      const siguiente: Element | null = actual.nextElementSibling
      const li = document.createElement('li')
      li.append(...Array.from(actual.children[1]?.childNodes ?? []))
      lista.appendChild(li)
      actual.remove()
      actual = siguiente
    }
  })

  // Sin la hoja de Tailwind las tablas quedan sin bordes: van en línea.
  raiz.querySelectorAll('table').forEach(t => {
    t.setAttribute('border', '1')
    t.setAttribute('style', 'border-collapse:collapse')
  })
  raiz.querySelectorAll('th, td').forEach(c => {
    const alineacion = (c as HTMLElement).style.textAlign
    c.setAttribute('style', `${BORDE}${alineacion ? `;text-align:${alineacion}` : ''}`)
  })
  raiz.querySelectorAll('[class]').forEach(n => n.removeAttribute('class'))
  return raiz.innerHTML
}

export function contenidoDeLaConversacion(conversacion: Pick<Conversation, 'title' | 'messages'>, t: TFunction): ConversacionCopiable {
  const autor = (m: Message) => (m.role === 'user' ? t('chatHeader.copiar.usuario') : t('chatHeader.copiar.asistente'))
  const etiquetaAdjunto = (nombre: string) => t('chatHeader.copiar.adjunto', { nombre })
  const aviso = t('descargo.avisoExportado')
  const mensajes = conversacion.messages.map(m => ({ m, ...partesDelMensaje(m) }))

  const texto = [
    `# ${conversacion.title}`,
    ...mensajes.map(({ m, contenido, adjunto }) =>
      [`${autor(m)}:`, adjunto && `[${etiquetaAdjunto(adjunto)}]`, contenido.trim()].filter(Boolean).join('\n')),
    `---\n${aviso}`,
  ].join('\n\n')

  const marcado = renderToStaticMarkup(
    <div>
      <h1>{conversacion.title}</h1>
      {mensajes.map(({ m, contenido, adjunto }) => (
        <div key={m.id}>
          <p><strong>{autor(m)}:</strong></p>
          {adjunto && <p><em>{etiquetaAdjunto(adjunto)}</em></p>}
          <MarkdownRenderer content={contenido.trim()} />
          <br />
        </div>
      ))}
      <hr />
      <p><em>{aviso}</em></p>
    </div>
  )

  return { texto, html: paraWord(marcado) }
}

/**
 * HTML para Word y texto para el Bloc de notas en la misma copia. Si el
 * portapapeles rechaza el HTML, al menos queda el texto.
 */
export async function copiarAlPortapapeles({ texto, html }: ConversacionCopiable): Promise<void> {
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob([texto], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      }),
    ])
  } catch (error) {
    logger.warn('No se pudo copiar con formato; se copia solo el texto:', error)
    await navigator.clipboard.writeText(texto)
  }
}
