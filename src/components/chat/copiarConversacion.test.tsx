import { describe, it, expect, vi, afterEach } from 'vitest'
import i18n from '@/i18n'
import type { Message } from '@/stores/chatStore'
import { contenidoDeLaConversacion, copiarAlPortapapeles, texLegible } from './copiarConversacion'

const t = i18n.t.bind(i18n)
const msg = (role: Message['role'], content: string, metadata?: Message['metadata']): Message =>
  ({ id: Math.random().toString(36), role, content, timestamp: new Date(), metadata })

const PEGADO = '=== ATTACHED DOCUMENT: informe.pdf ===\nTEXTO SECRETO DEL PDF\n=== END DOCUMENT ===\n\n¿Qué diámetro tiene la P-12?'

const conversacion = {
  title: 'Red de Pachuca',
  messages: [
    msg('user', PEGADO),
    msg('assistant', 'La **P-12** mide:\n\n| Tubería | DN (mm) |\n|---|---:|\n| P-12 | 150 |\n\n- revisar presión\n- **purgar** aire\n\n3. cerrar válvula\n4. medir\n\n$$h_f = f \\frac{L}{D} \\frac{v^2}{2g}$$'),
    msg('user', 'Y la otra', { adjunto: { nombre: 'anexo.xlsx', texto: 'NO DEBE SALIR' } }),
  ],
}

describe('contenidoDeLaConversacion', () => {
  const { texto, html } = contenidoDeLaConversacion(conversacion, t)

  it('pone las etiquetas de autor traducidas', () => {
    expect(texto).toContain('Usuario:\n')
    expect(texto).toContain('Asistente:\n')
    expect(texto).not.toMatch(/\b(User|Assistant):/)
    expect(html).toContain('<strong>Usuario:</strong>')
    expect(contenidoDeLaConversacion(conversacion, i18n.getFixedT('ca')).texto).toContain('Usuari:')
  })

  it('deja fuera el texto del adjunto y pone solo su nombre', () => {
    for (const salida of [texto, html]) {
      expect(salida).not.toContain('TEXTO SECRETO')
      expect(salida).not.toContain('NO DEBE SALIR')
      expect(salida).toContain('Documento adjunto: informe.pdf')
      expect(salida).toContain('Documento adjunto: anexo.xlsx')
    }
    expect(texto).toContain('¿Qué diámetro tiene la P-12?')
  })

  it('termina con el descargo, como la exportación', () => {
    const aviso = t('descargo.avisoExportado')
    expect(texto.trimEnd().endsWith(aviso)).toBe(true)
    expect(html).toContain(aviso)
  })

  it('el texto plano conserva el markdown', () => {
    expect(texto).toContain('# Red de Pachuca')
    expect(texto).toContain('| P-12 | 150 |')
  })

  it('el HTML lleva negritas, tablas con bordes y la fórmula como texto, sin KaTeX ni clases', () => {
    const div = document.createElement('div')
    div.innerHTML = html
    expect([...div.querySelectorAll('strong')].map(s => s.textContent)).toContain('P-12')
    const tabla = div.querySelector('table')!
    expect(tabla.getAttribute('border')).toBe('1')
    expect(div.querySelector('th')?.getAttribute('style')).toContain('border:1px solid')
    expect(div.querySelectorAll('td')[1].getAttribute('style')).toContain('text-align:right')
    expect(div.textContent).toContain('h_f = f L/D v²/(2g)')
    expect(div.querySelector('.katex, [class], math')).toBeNull()
    expect([...div.querySelectorAll('ul > li')].map(li => li.textContent)).toEqual(['revisar presión', 'purgar aire'])
    expect(div.querySelector('ol')?.getAttribute('start')).toBe('3')
    expect([...div.querySelectorAll('ol > li')].map(li => li.textContent)).toEqual(['cerrar válvula', 'medir'])
  })
})

describe('texLegible', () => {
  it('traduce lo habitual a texto', () => {
    expect(texLegible('\\Delta P = \\rho \\cdot g \\cdot h')).toBe('Δ P = ρ · g · h')
    expect(texLegible('V = 0.849\\, C\\, R^{0.63}')).toBe('V = 0.849 C R^0.63')
    expect(texLegible('\\sqrt{2 g h}')).toBe('√(2 g h)')
    expect(texLegible('Q = \\frac{\\pi D^2}{4} v')).toBe('Q = (π D²)/4 v')
  })
})

describe('copiarAlPortapapeles', () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  afterEach(() => { if (original) Object.defineProperty(navigator, 'clipboard', original) })

  const fingirPortapapeles = (write: () => Promise<void>) => {
    const portapapeles = { write: vi.fn(write), writeText: vi.fn().mockResolvedValue(undefined) }
    Object.defineProperty(navigator, 'clipboard', { value: portapapeles, configurable: true })
    return portapapeles
  }

  it('escribe texto y HTML a la vez', async () => {
    const p = fingirPortapapeles(() => Promise.resolve())
    await copiarAlPortapapeles({ texto: 'a', html: '<b>a</b>' })
    const [item] = p.write.mock.calls[0] as unknown as [ClipboardItem[]]
    expect(item[0].types).toEqual(expect.arrayContaining(['text/plain', 'text/html']))
    expect(p.writeText).not.toHaveBeenCalled()
  })

  it('si el HTML no se puede, copia al menos el texto', async () => {
    const p = fingirPortapapeles(() => Promise.reject(new Error('NotAllowed')))
    await copiarAlPortapapeles({ texto: 'a', html: '<b>a</b>' })
    expect(p.writeText).toHaveBeenCalledWith('a')
  })
})
