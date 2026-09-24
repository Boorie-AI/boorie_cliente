import { describe, it, expect } from 'vitest'
import {
  documentoVisible,
  duenosPermitidos,
  filtroPrisma,
  filtroVectorial,
  duenoVectorial,
  origenDe,
  type Ambito,
} from './ambitos'

const A = 'proyecto-A'
const B = 'proyecto-B'
const TODOS: Ambito[] = ['general', 'proyecto', 'ambos']

describe('la regla que no se puede romper', () => {
  it('un documento del proyecto A no es visible desde el proyecto B en ningún ámbito', () => {
    // Es el criterio de aceptación, y es de confidencialidad: verlo de más
    // significa enseñarle a un cliente los documentos de otro.
    for (const ambito of TODOS) {
      expect(documentoVisible(A, ambito, B), ambito).toBe(false)
      expect(duenosPermitidos(ambito, B), ambito).not.toContain(A)
    }
  })

  it('tampoco desde ningún proyecto ajeno, sea cual sea', () => {
    for (const ajeno of ['x', 'y', 'z-largo-y-raro', '']) {
      for (const ambito of TODOS) {
        expect(documentoVisible(A, ambito, ajeno)).toBe(false)
      }
    }
  })

  it('sin proyecto activo sólo se ve lo general, nunca lo de nadie', () => {
    for (const ambito of TODOS) {
      expect(duenosPermitidos(ambito, null), ambito).toEqual([null])
      expect(duenosPermitidos(ambito, undefined), ambito).toEqual([null])
      expect(documentoVisible(A, ambito, null), ambito).toBe(false)
    }
  })
})

describe('herencia de un solo sentido', () => {
  it('desde un proyecto se ve lo general', () => {
    expect(documentoVisible(null, 'ambos', A)).toBe(true)
    expect(documentoVisible(null, 'general', A)).toBe(true)
  })

  it('«sólo proyecto» deja fuera lo general, que para eso es un ámbito aparte', () => {
    expect(documentoVisible(null, 'proyecto', A)).toBe(false)
    expect(documentoVisible(A, 'proyecto', A)).toBe(true)
  })

  it('«ambos» es lo general más lo propio, y nada más', () => {
    expect(duenosPermitidos('ambos', A)).toEqual([null, A])
  })

  it('lo general no hereda de ningún proyecto', () => {
    expect(duenosPermitidos('general', A)).toEqual([null])
  })
})

describe('origen del resultado', () => {
  it('distingue una norma de un documento interno', () => {
    expect(origenDe(null)).toBe('general')
    expect(origenDe(A)).toBe('proyecto')
  })
})

describe('cómo se escribe el dueño en el almacén vectorial', () => {
  it('lo general es la cadena vacía, nunca el nulo', () => {
    // Milvus no alcanza los campos JSON a null: guardado así, lo general no se
    // puede seleccionar con ninguna expresión, ni afirmándolo ni negándolo.
    expect(duenoVectorial(null)).toBe('')
    expect(duenoVectorial(A)).toBe('proyecto-A')
  })
})

describe('filtro del almacén vectorial', () => {
  it('restringe cuando sólo se piden proyectos', () => {
    expect(filtroVectorial([A])).toBe('projectId == "proyecto-A"')
  })

  it('el ámbito general también filtra, y filtra por la cadena vacía', () => {
    // Antes devolvía `undefined` y la búsqueda general iba sin filtrar: los
    // fragmentos de proyecto se llevaban todos los candidatos y se descartaban
    // después, así que la búsqueda contestaba vacía con la base indexada.
    expect(filtroVectorial([null])).toBe('projectId == ""')
  })

  it('ámbito «ambos»: lo general y el proyecto, no todo lo que haya', () => {
    expect(filtroVectorial([null, A])).toBe(
      'projectId == "" or projectId == "proyecto-A"'
    )
    expect(filtroVectorial([null, A])).not.toContain(B)
  })

  it('sin nada permitido no inventa un filtro', () => {
    expect(filtroVectorial([])).toBeUndefined()
  })
})

describe('condición para la base de datos', () => {
  it('el ámbito general no usa «in», porque Prisma rechaza el nulo ahí dentro', () => {
    // El fallo que sólo apareció al probarlo contra la base: «Argument in:
    // Invalid value provided. Expected Null, provided (Null)». Y el general es
    // el valor por defecto, así que habría roto el caso más común.
    expect(filtroPrisma([null])).toEqual({ projectId: null })
  })

  it('sólo proyectos: se filtra por la lista', () => {
    expect(filtroPrisma([A])).toEqual({ projectId: { in: [A] } })
  })

  it('general más proyecto: el nulo va aparte, con un OR', () => {
    expect(filtroPrisma([null, A])).toEqual({
      OR: [{ projectId: null }, { projectId: { in: [A] } }],
    })
  })

  it('sin nada permitido, una condición que no acepta nada', () => {
    // Se ve de menos, nunca de más.
    expect(filtroPrisma([])).toEqual({ projectId: { in: [] } })
  })

  it('la condición nunca menciona un proyecto que no esté permitido', () => {
    for (const ambito of TODOS) {
      expect(JSON.stringify(filtroPrisma(duenosPermitidos(ambito, B)))).not.toContain(A)
    }
  })
})
