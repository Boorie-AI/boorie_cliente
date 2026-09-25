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

describe('MarkdownRenderer: tablas', () => {
  const tabla = [
    'Cálculo paso a paso:',
    '| Paso | Descripción | Resultado |',
    '|------|:-----------:|----------:|',
    '| 1 | Área **del tubo** | \\( A = \\frac{\\pi D^2}{4} \\) |',
    '| 2 | Velocidad | $V = Q/A$ |',
    'Resultado final.',
  ].join('\n')

  it('pinta cabecera, filas y el texto de alrededor', () => {
    const c = pintar(tabla)
    expect(c.querySelectorAll('table')).toHaveLength(1)
    expect([...c.querySelectorAll('th')].map(th => th.textContent)).toEqual(['Paso', 'Descripción', 'Resultado'])
    expect(c.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(c.textContent).toContain('Cálculo paso a paso:')
    expect(c.textContent).toContain('Resultado final.')
    expect(c.textContent).not.toContain('|---')
  })

  it('las celdas admiten negrita y fórmulas', () => {
    const c = pintar(tabla)
    expect(c.querySelector('td strong')?.textContent).toBe('del tubo')
    expect(c.querySelectorAll('td .katex')).toHaveLength(2)
  })

  it('respeta la alineación del separador', () => {
    const c = pintar(tabla)
    const alin = [...c.querySelectorAll('th')].map(th => (th as HTMLElement).style.textAlign)
    expect(alin).toEqual(['left', 'center', 'right'])
  })

  it('no parte la celda por el | de una fórmula ni por un \\| escapado', () => {
    const c = pintar('| Magnitud | Valor |\n|---|---|\n| Módulo | $|z| = 5$ |\n| Tubería | A \\| B |')
    const filas = [...c.querySelectorAll('tbody tr')].map(tr => tr.querySelectorAll('td').length)
    expect(filas).toEqual([2, 2])
    expect(c.querySelector('td .katex')).not.toBeNull()
    expect(c.querySelectorAll('tbody tr')[1].querySelectorAll('td')[1].textContent).toBe('A | B')
  })

  it('sin línea separadora no es una tabla', () => {
    const c = pintar('| esto | no |\n| es | tabla |')
    expect(c.querySelector('table')).toBeNull()
  })

  it('completa las filas cortas con celdas vacías', () => {
    const c = pintar('| a | b | c |\n|---|---|---|\n| 1 |')
    expect(c.querySelectorAll('tbody td')).toHaveLength(3)
  })
})
