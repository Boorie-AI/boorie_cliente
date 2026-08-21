/**
 * El texto con el que el chat cuenta un escenario ya simulado (#44).
 *
 * La narración se escribe **en código y no con el modelo**, y es una decisión,
 * no una comodidad. El criterio de aceptación pide que las cifras coincidan con
 * la ejecución directa del motor y que la respuesta cite la simulación de
 * origen; un modelo local de 4B redondeando 470,4 m³ a «unos 500» rompe las dos
 * cosas a la vez. El modelo hace lo que sabe hacer —entender la petición y
 * proponer el escenario—, y los números los pone quien los tiene.
 *
 * Es la misma regla que gobierna el ahorro energético del #42: ninguna cifra
 * sale de una estimación.
 */

interface NudoAfectado {
  id: string
  undelivered_m3: number
  outage_hours: number
  min_service_availability: number
}

export interface ResultadoEscenario {
  scenario: {
    name: string
    duration_hours: number
    events: Array<{ tipo: string; aplicado: boolean; elementos?: string[]; metodo?: string; omitidos: Array<{ id: string; motivo: string }> }>
  }
  unmet_demand: {
    total_m3: number
    baseline_m3: number
    attributable_m3: number
    by_node: NudoAfectado[]
    max_deficit_hours: number
  }
  nodes_below_minimum_pressure: Array<{ id: string; min_pressure: number; hours_below_threshold: number }>
  min_pressure_threshold: number
  total_junction_count: number
  population: {
    total_population: number
    event: { population_affected: number; affected_node_count: number; undelivered_volume_m3: number }
    baseline: { population_affected: number }
    attributable_to_event: { population_affected: number; affected_node_count: number; undelivered_volume_m3: number }
    connections: { affected_connections: number; persons_per_connection: number; method: string } | null
    traceability: Record<string, unknown>
  }
  convergence_warnings: { converged: boolean }
}

/**
 * El formato se escribe a mano y no con `toLocaleString('es-ES')`.
 *
 * No es purismo: en el entorno de pruebas —Node sin datos de ICU completos— esa
 * llamada devuelve «2592» y en Electron «2.592». Una cifra que se cita como
 * prueba no puede cambiar de forma según dónde se ejecute, ni pasar un test que
 * fallaría en la aplicación.
 */
const miles = (entera: string) => entera.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

const numero = (n: number, decimales = 1) => {
  const [entera, decimal = ''] = Math.abs(n).toFixed(decimales).split('.')
  const signo = n < 0 ? '−' : ''
  return decimales > 0 ? `${signo}${miles(entera)},${decimal}` : `${signo}${miles(entera)}`
}

const entero = (n: number) => {
  const redondeado = Math.round(n)
  return `${redondeado < 0 ? '−' : ''}${miles(String(Math.abs(redondeado)))}`
}

/**
 * @param runId Identificador de la ejecución registrada, para que la cifra sea
 *   rastreable hasta ella. Sin él la narración lo dice, en vez de callarlo.
 */
export function narrarEscenario(r: ResultadoEscenario, runId?: string | null): string {
  const lineas: string[] = []
  const p = r.population
  const u = r.unmet_demand

  lineas.push(`**${r.scenario.name}** — simulado sobre ${r.scenario.duration_hours} h en modo PDA.`)
  lineas.push('')

  // Lo primero, lo que el escenario causa; el total de la red va después, porque
  // mezclarlos es lo que produce cifras alarmantes y falsas.
  const habitantes = p.attributable_to_event.population_affected
  if (habitantes > 0) {
    const clientes = p.connections
      ? ` (unas ${entero(p.connections.affected_connections)} acometidas a ${numero(p.connections.persons_per_connection, 0)} habitantes por acometida)`
      : ''
    lineas.push(`Deja sin servicio a **${entero(habitantes)} habitantes**${clientes}, en ${p.attributable_to_event.affected_node_count} nudos de ${r.total_junction_count}.`)
  } else {
    lineas.push('**No deja a nadie sin servicio** que no lo estuviera ya antes del evento.')
  }

  lineas.push(`Demanda no satisfecha atribuible al escenario: **${numero(u.attributable_m3)} m³**.`)

  if (p.baseline.population_affected > 0) {
    lineas.push(
      `La red ya arrastraba un déficit propio de ${entero(p.baseline.population_affected)} habitantes ` +
      `y ${numero(u.baseline_m3)} m³ sin el evento, y no se le atribuye al escenario.`
    )
  }

  if (u.max_deficit_hours > 0) {
    lineas.push(`El nudo peor parado está sin servicio pleno ${numero(u.max_deficit_hours)} h.`)
  }

  const peores = u.by_node.slice(0, 5)
  if (peores.length > 0) {
    lineas.push('')
    lineas.push('Nudos más afectados:')
    for (const n of peores) {
      lineas.push(`- **${n.id}**: ${numero(n.undelivered_m3)} m³ sin servir, ${numero(n.outage_hours)} h de déficit, disponibilidad mínima ${numero(n.min_service_availability * 100, 0)}%.`)
    }
  }

  if (r.nodes_below_minimum_pressure.length > 0) {
    lineas.push('')
    lineas.push(`${r.nodes_below_minimum_pressure.length} nudos bajan de los ${numero(r.min_pressure_threshold, 0)} m de presión mínima.`)
  }

  const omitidos = r.scenario.events.flatMap(e => e.omitidos ?? [])
  if (omitidos.length > 0) {
    lineas.push('')
    lineas.push(`No se pudo aplicar: ${omitidos.map(o => `${o.id} (${o.motivo})`).join('; ')}.`)
  }

  if (!r.convergence_warnings.converged) {
    lineas.push('')
    lineas.push('⚠️ Alguna simulación no convergió: las cifras de esos instantes no son fiables.')
  }

  // La cita de origen. Es un criterio de aceptación, no un adorno: sin ella
  // estas cifras son indistinguibles de una generalidad.
  lineas.push('')
  const metodo = r.scenario.events
    .filter(e => e.aplicado && e.metodo)
    .map(e => `${e.tipo}: ${e.metodo}`)
    .join(' · ')
  lineas.push(
    `_Fuente: ${runId ? `simulación \`${runId}\`` : 'esta simulación (no se pudo registrar en el historial)'}` +
    `, motor WNTR en modo PDA${metodo ? `. ${metodo}` : ''}._`
  )

  return lineas.join('\n')
}
