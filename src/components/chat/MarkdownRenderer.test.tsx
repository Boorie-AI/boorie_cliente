import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MarkdownRenderer } from './MarkdownRenderer'

const pintar = (content: string) => render(<MarkdownRenderer content={content} />).container

describe('MarkdownRenderer: fórmulas', () => {
  it('pinta con KaTeX una fórmula en línea y deja el texto alrededor', () => {
    const c = pintar('La pérdida es $h_f = f \\frac{L}{D} \\frac{v^2}{2g}$ en metros.')
    expect(c.querySelectorAll('.katex')).toHaveLength(1)
    expect(c.querySelector('.katex .mfrac')).not.toBeNull()
    expect(c.textContent).toContain('La pérdida es')
    expect(c.textContent).toContain('en metros.')
    // el LaTeX sigue en la anotación MathML oculta, que es la que se copia
    expect(c.querySelector('.katex-html')?.textContent).not.toContain('\\frac')
  })

  it('no convierte en cursiva los subíndices', () => {
    const c = pintar('Con $Q_1$ y $Q_2$ se cumple la continuidad.')
    expect(c.querySelectorAll('.katex')).toHaveLength(2)
    expect(c.querySelector('em')).toBeNull()
  })

  it('acepta \\( \\) en línea', () => {
    const c = pintar('Hazen-Williams: \\(V = 0.849\\, C\\, R^{0.63} S^{0.54}\\)')
    expect(c.querySelectorAll('.katex')).toHaveLength(1)
    expect(c.querySelector('.katex-display')).toBeNull()
  })

  it('pinta en bloque $$ $$ y \\[ \\], también en varias líneas', () => {
    const c = pintar('Darcy-Weisbach:\n$$\nh_f = f \\frac{L}{D} \\frac{v^2}{2g}\n$$\nY la continuidad:\n\\[Q = V A\\]\nFin.')
    expect(c.querySelectorAll('.katex-display')).toHaveLength(2)
    expect(c.textContent).toContain('Darcy-Weisbach:')
    expect(c.textContent).toContain('Fin.')
    expect(c.querySelector('br')).toBeNull()
  })

  it('no toma por fórmula un importe en dólares', () => {
    const c = pintar('El presupuesto va de $50 a $100 por metro.')
    expect(c.querySelector('.katex')).toBeNull()
    expect(c.textContent).toContain('$50 a $100')
  })

  it('no toca el $ dentro de un bloque de código', () => {
    const c = pintar('```bash\necho $HOME $PATH\n```')
    expect(c.querySelector('.katex')).toBeNull()
    expect(c.querySelector('pre')?.textContent).toBe('echo $HOME $PATH')
  })

  it('no rompe el mensaje con LaTeX que no entiende', () => {
    const c = pintar('Esto $\\noexiste{x}$ sigue.')
    expect(c.textContent).toContain('sigue.')
  })

  it('una fórmula a medio llegar se queda como texto', () => {
    const c = pintar('Mientras llega: $$h_f = f \\frac{L}')
    expect(c.querySelector('.katex')).toBeNull()
  })
})
