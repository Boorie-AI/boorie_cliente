import { describe, it, expect } from 'vitest'
import {
  HERRAMIENTAS,
  ejecutarHerramienta,
  type ContextoHerramientas,
  type RedCompleta,
} from './agentTools'

/**
 * Las herramientas de análisis del #119, fase 1.
 *
 * El motor va inyectado, así que aquí se prueba sin Python: lo que se comprueba
 * es el contrato con el modelo —qué recibe, qué pasa cuando no hay motor, y que
 * lo que propone no trae cifras—. Que la cifra sea la del motor lo mide la
 * batería de `agentEval`, que sí lo ejecuta de verdad.
 */

const red: RedCompleta = {
  nodes: [{ id: 'J1', type: 'junction' }],
  links: [{ id: 'P1', type: 'pipe', length: 100, diameter: 0.1 }],
}

/** Una curva como la que devuelve el motor, con sus veintiún puntos. */
const curvaDelMotor = (n = 21) => ({
  material: 'PVC',
  damage_model: 'HAZUS_MH',
  hazard_type: 'seismic_pga',
  intensity_unit: 'g',
  soil_class: 'stiff_soil',
  median: 0.36082,
  pipe_count: 117,
  total_length_km: 65.7531,
  intensities: Array.from({ length: n }, (_, i) => (i * 1.2) / (n - 1)),
  pipe_failure_probability: Array.from({ length: n }, (_, i) => i / (n - 1)),
  expected_failed_pipes: Array.from({ length: n }, (_, i) => (117 * i) / (n - 1)),
  // Con la forma que emite de verdad el motor: los grupos traen sus dos
  // columnas, tuberías y kilómetros, que es lo que permite costear el daño.
  by_diameter: Array.from({ length: 10 }, (_, g) => ({
    diameter_mm: 100 + g * 50,
    pipe_count: 3 + g,
    length_km: 1.234 + g,
    affected_pipes: Array.from({ length: n }, (_, i) => ((3 + g) * i) / (n - 1)),
    affected_length_km: Array.from({ length: n }, (_, i) => ((1.234 + g) * i) / (n - 1)),
  })),
})

const conMotor = (motor: ContextoHerramientas['motores']): ContextoHerramientas => ({ red, motores: motor })

describe('las dos herramientas nuevas están ofrecidas al agente', () => {
  it('la de fragilidad dice que se ejecuta sola, y la de resiliencia que no', () => {
    const fragilidad = HERRAMIENTAS.find(h => h.nombre === 'curva_fragilidad')
    const resiliencia = HERRAMIENTAS.find(h => h.nombre === 'proponer_analisis')
    expect(fragilidad).toBeTruthy()
    expect(resiliencia).toBeTruthy()

    // La descripción es lo único que el modelo lee para decidir: si no dice que
    // una se ejecuta y la otra se propone, el criterio no existe para él.
    expect(fragilidad!.descripcion).toMatch(/sin pedir confirmacion/i)
    expect(resiliencia!.descripcion).toMatch(/NO los ejecuta/)
    expect(resiliencia!.nombre).toMatch(/^proponer_/)
  })

  it('la de fragilidad avisa de que los parámetros son genéricos', () => {
    // El descargo no puede depender de que el modelo se acuerde.
    const f = HERRAMIENTAS.find(h => h.nombre === 'curva_fragilidad')!
    expect(f.descripcion).toMatch(/validacion de un experto/i)
  })
})

describe('curva_fragilidad', () => {
  it('resume la curva en vez de volcarla entera', async () => {
    const r = await ejecutarHerramienta(
      'curva_fragilidad', {}, conMotor({ curvaFragilidad: async () => curvaDelMotor() })) as any

    // Cinco puntos, no veintiuno, y sin el reparto por diámetro: en Net3 son
    // miles de números que no caben en el prompt y que nadie va a leer ahí.
    expect(r.puntos).toHaveLength(5)
    expect(r.by_diameter).toBeUndefined()
    expect(r.pipe_failure_probability).toBeUndefined()
    expect(JSON.stringify(r).length).toBeLessThan(1200)
  })

  it('reparte los puntos por el eje y termina en el tope', async () => {
    const r = await ejecutarHerramienta(
      'curva_fragilidad', {}, conMotor({ curvaFragilidad: async () => curvaDelMotor() })) as any
    const intensidades = r.puntos.map((p: any) => p.intensidad)
    expect(intensidades[0]).toBeCloseTo(0.24, 5)
    expect(intensidades[4]).toBeCloseTo(1.2, 5)
    // Crecientes: un resumen desordenado se lee como una curva que baja.
    expect([...intensidades].sort((a: number, b: number) => a - b)).toEqual(intensidades)
  })

  it('lleva la unidad en el nombre del campo y el aviso en el resultado', async () => {
    const r = await ejecutarHerramienta(
      'curva_fragilidad', {}, conMotor({ curvaFragilidad: async () => curvaDelMotor() })) as any
    expect(r.unidad_de_intensidad).toBe('g')
    expect(r.longitud_total_km).toBe(65.75)
    expect(r.aviso).toMatch(/validacion de un experto/i)
  })

  it('el reparto por diámetro sólo sale si se pide, y no cuesta otra llamada', async () => {
    let llamadas = 0
    const motor = conMotor({ curvaFragilidad: async () => { llamadas++; return curvaDelMotor() } })

    const sin = await ejecutarHerramienta('curva_fragilidad', {}, motor) as any
    expect(sin.reparto_por_diametro).toBeUndefined()

    const con = await ejecutarHerramienta(
      'curva_fragilidad', { reparto_por_diametro: true }, motor) as any
    expect(con.reparto_por_diametro).toHaveLength(10)
    // En el tope del eje el grupo entero está afectado, y van sus dos columnas.
    expect(con.reparto_por_diametro[0]).toEqual({
      diametro_mm: 100, tuberias: 3, longitud_km: 1.23, tuberias_afectadas: 3, km_afectados: 1.23,
    })
    // Sale del mismo cálculo: pedirlo no vuelve a lanzar el motor.
    expect(llamadas).toBe(2)
  })

  it('el argumento del reparto es nuestro y no viaja al motor', async () => {
    let visto: Record<string, unknown> | null = null
    await ejecutarHerramienta(
      'curva_fragilidad', { material: 'PVC', reparto_por_diametro: true },
      conMotor({ curvaFragilidad: async (o) => { visto = o; return curvaDelMotor() } }))
    expect(visto).toEqual({ material: 'PVC' })
  })

  it('sin motor lo dice, en vez de callarse o inventar', async () => {
    const r = await ejecutarHerramienta('curva_fragilidad', {}, { red }) as any
    expect(r.error).toMatch(/no hay motor/i)
    // Y le dice al agente qué hacer con eso, que es lo que evita que rellene.
    expect(r.error).toMatch(/red activa/i)
    expect(r.puntos).toBeUndefined()
  })

  it('el error del motor le llega al modelo tal cual', async () => {
    const r = await ejecutarHerramienta(
      'curva_fragilidad', { material: 'ORO' },
      conMotor({ curvaFragilidad: async () => ({ error: 'material no valido: ORO' }) })) as any
    expect(r.error).toBe('material no valido: ORO')
  })

  it('los argumentos llegan al motor sin tocarlos', async () => {
    let visto: Record<string, unknown> | null = null
    await ejecutarHerramienta(
      'curva_fragilidad',
      { material: 'CI', soil_class: 'rock', hazard_type: 'seismic_pga' },
      conMotor({ curvaFragilidad: async (o) => { visto = o; return curvaDelMotor() } }))
    expect(visto).toEqual({ material: 'CI', soil_class: 'rock', hazard_type: 'seismic_pga' })
  })
})

describe('proponer_analisis', () => {
  it('propone, pide confirmación y no trae ninguna cifra', async () => {
    const r = await ejecutarHerramienta(
      'proponer_analisis', { tipo: 'indicadores_resiliencia' }, { red }) as any
    expect(r.requiere_confirmacion).toBe(true)
    expect(r.definicion.analisis).toBe('indicadores_resiliencia')
    expect(r.siguiente_paso).toMatch(/no des cifras/i)

    // Ni un número en todo el resultado: si la propuesta trajera un índice de
    // Todini, el modelo lo daría por calculado y lo repetiría.
    expect(JSON.stringify(r)).not.toMatch(/\d+[.,]\d+/)
  })

  it('dice lo que va a calcular y lo que va a costar', async () => {
    const r = await ejecutarHerramienta(
      'proponer_analisis', { tipo: 'indicadores_resiliencia' }, { red }) as any
    expect(r.calcula).toContain('indice de Todini')
    // Que el modelo pueda explicar la espera en vez de que parezca un cuelgue.
    expect(r.coste).toMatch(/diez minutos/)
  })

  it('con comparación avisa de que cuesta el doble', async () => {
    const r = await ejecutarHerramienta(
      'proponer_analisis',
      { tipo: 'indicadores_resiliencia', comparar_con_interrupcion: true }, { red }) as any
    expect(r.definicion.comparar_con_interrupcion).toBe(true)
    expect(r.coste).toMatch(/veinte minutos/)
  })

  it('los cuatro análisis se pueden proponer, y ninguno trae cifras', async () => {
    for (const tipo of ['indicadores_resiliencia', 'simulacion_hidraulica', 'calidad_del_agua', 'eficiencia_energetica']) {
      const r = await ejecutarHerramienta('proponer_analisis', { tipo }, { red }) as any
      expect(r.requiere_confirmacion, tipo).toBe(true)
      expect(r.definicion.analisis, tipo).toBe(tipo)
      expect(r.calcula.length, tipo).toBeGreaterThan(0)
      expect(JSON.stringify(r), tipo).not.toMatch(/\d+[.,]\d+/)
    }
  })

  it('comparar sólo significa algo en resiliencia', async () => {
    // Aceptarlo en silencio en los demás prometería un antes y un después que
    // ese análisis no tiene.
    const r = await ejecutarHerramienta(
      'proponer_analisis',
      { tipo: 'calidad_del_agua', comparar_con_interrupcion: true }, { red }) as any
    expect(r.definicion.comparar_con_interrupcion).toBeUndefined()
    expect(r.coste).not.toMatch(/veinte minutos/)
  })

  it('un análisis que no existe se rechaza con la lista de los que sí', async () => {
    const r = await ejecutarHerramienta('proponer_analisis', { tipo: 'adivinar' }, { red }) as any
    expect(r.error).toMatch(/adivinar/)
    expect(r.error).toMatch(/calidad_del_agua/)
    expect(r.requiere_confirmacion).toBeUndefined()
  })
})

describe('calcular', () => {
  it('resuelve la fórmula y devuelve cada paso con su propia unidad', async () => {
    const r = await ejecutarHerramienta('calcular', {
      formula: 'darcy-weisbach',
      datos: {
        f: { valor: 0.02, unidad: 'dimensionless' },
        L: { valor: 500, unidad: 'm' },
        // En mm a propósito: es la unidad que el motor rechazaba.
        D: { valor: 300, unidad: 'mm' },
        V: { valor: 0.5, unidad: 'm/s' },
      },
    }, { red }) as any

    expect(r.resultado.valor).toBeCloseTo(0.42474, 5)
    expect(r.resultado.unidad).toBe('m')
    expect(r.pasos.map((p: any) => p.unidad)).toEqual(['m', 'adimensional', 'm'])
  })

  it('dice «adimensional» en vez de dejar el hueco', async () => {
    // Un hueco se lee como un olvido; la palabra se lee como una decisión.
    const r = await ejecutarHerramienta('calcular', {
      formula: 'darcy-weisbach',
      datos: {
        f: { valor: 0.02, unidad: 'dimensionless' }, L: { valor: 500, unidad: 'm' },
        D: { valor: 300, unidad: 'mm' }, V: { valor: 0.5, unidad: 'm/s' },
      },
    }, { red }) as any
    expect(r.pasos.every((p: any) => typeof p.unidad === 'string' && p.unidad.length > 0)).toBe(true)
  })

  it('un parámetro sin unidad se rechaza diciendo qué forma tiene que tener', async () => {
    const r = await ejecutarHerramienta('calcular', {
      formula: 'darcy-weisbach',
      datos: { f: { valor: 0.02 } },
    }, { red }) as any
    expect(r.error).toMatch(/"f"/)
    expect(r.error).toMatch(/unidad/)
  })

  it('el error del motor le llega al modelo para que corrija', async () => {
    const r = await ejecutarHerramienta('calcular', {
      formula: 'darcy-weisbach',
      datos: { f: { valor: 0.02, unidad: 'dimensionless' } },
    }, { red }) as any
    expect(r.error).toMatch(/Missing required parameter/)
  })
})
