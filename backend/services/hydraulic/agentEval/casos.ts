import type { CasoAgente } from './bateria'

/**
 * Los casos con los que se mide al agente (#119, fase 0).
 *
 * Regla de la casa: **ningún valor esperado se escribe de memoria**. Cada caso
 * dice en `origen` de dónde salió el suyo, y todos salen de la misma red que va
 * a tener delante el agente —las guardadas en la base— o del motor real
 * ejecutado sobre ella. Un número sin procedencia aquí es una creencia con
 * aspecto de prueba.
 *
 * Los casos `pendiente` describen herramientas que todavía no existen: son el
 * objetivo de la fase 1, escritos antes para que la fase se pueda dar por
 * terminada contra algo. Su valor esperado también está calculado ya, así que
 * el día que la herramienta aparezca el caso se activa borrando una línea.
 */
export const CASOS: CasoAgente[] = [
  // ---------------------------------------------------------------- topología
  {
    id: 'net3-nudo-101',
    pregunta: '¿Qué cota y qué demanda tiene el nudo 101?',
    red: 'Net3 2.inp',
    herramienta: 'consultar_elemento',
    argumentos: { id: '101' },
    espera: [
      { ruta: 'encontrado', valor: true },
      { ruta: 'elemento.tipo', valor: 'junction' },
      { ruta: 'elemento.cota_m', valor: 12.8016, tolerancia: 0.0001 },
      // La red guarda 0,01198398… m³/s; la herramienta entrega l/s a tres
      // decimales para que el modelo no tenga que multiplicar por mil.
      { ruta: 'elemento.demanda_base_litros_por_segundo', valor: 11.984, tolerancia: 0.001 },
      { ruta: 'tramos_conectados.0.id', valor: '101' },
    ],
    origen: 'networkData de la red guardada: elevation 12.8016, demand 0.01198398280618 m³/s.',
  },
  {
    id: 'net3-id-inventado',
    pregunta: '¿Cuál es la presión en el nudo J999?',
    red: 'Net3 2.inp',
    herramienta: 'consultar_elemento',
    argumentos: { id: 'J999' },
    espera: [{ ruta: 'encontrado', valor: false }],
    // Este caso vale más que los que aciertan: mide que el agente tenga con qué
    // decir «ese nudo no está en tu red» en lugar de rellenar el hueco.
    origen: 'En Net3 los nudos son numéricos; no existe ningún J999.',
  },
  {
    id: 'net3-tuberia-mas-larga',
    pregunta: '¿Cuáles son las cinco tuberías más largas de la red?',
    red: 'Net3 2.inp',
    herramienta: 'listar_elementos',
    argumentos: { tipo: 'pipe', ordenar_por: 'length', limite: 5 },
    espera: [
      { ruta: 'total', valor: 117 },
      { ruta: 'devueltos', valor: 5 },
      { ruta: 'elementos.0.id', valor: '329' },
      { ruta: 'elementos.0.longitud_m', valor: 13868.4, tolerancia: 0.001 },
      { ruta: 'elementos.0.diametro_mm', valor: 762 },
      { ruta: 'elementos.1.id', valor: '101' },
    ],
    origen: 'networkData ordenado por length: 329 (13868,4 m, 0,762 m) y 101 (4328,16 m).',
  },
  {
    id: 'net3-nudo-mas-demandante',
    pregunta: '¿Qué nudo tiene la mayor demanda base?',
    red: 'Net3 2.inp',
    herramienta: 'listar_elementos',
    argumentos: { tipo: 'junction', ordenar_por: 'demand', limite: 3 },
    espera: [
      { ruta: 'total', valor: 92 },
      { ruta: 'elementos.0.id', valor: '109' },
      { ruta: 'elementos.0.demanda_base_litros_por_segundo', valor: 14.599, tolerancia: 0.001 },
    ],
    origen: 'networkData ordenado por demand: 109 con 0,0145990714 m³/s.',
  },
  {
    id: 'net3-cuantas-bombas',
    pregunta: '¿Cuántas bombas hay en la red?',
    red: 'Net3 2.inp',
    herramienta: 'listar_elementos',
    argumentos: { tipo: 'pump' },
    espera: [{ ruta: 'total', valor: 2 }],
    origen: 'Recuento por tipo sobre links: 117 pipe y 2 pump.',
  },
  {
    id: 'villa-demanda-j3',
    pregunta: '¿Cuánta agua consume el nudo J3?',
    red: 'villa_100_casas.inp',
    herramienta: 'consultar_elemento',
    argumentos: { id: 'J3' },
    espera: [
      { ruta: 'encontrado', valor: true },
      { ruta: 'elemento.demanda_base_litros_por_segundo', valor: 0.231, tolerancia: 0.001 },
    ],
    origen: 'networkData de villa_100_casas: los cinco nudos llevan 0,000231 m³/s.',
  },
  {
    id: 'net3-escenario-rotura',
    pregunta: '¿Qué pasa si se rompe la tubería 329?',
    red: 'Net3 2.inp',
    herramienta: 'proponer_escenario',
    argumentos: { tipo: 'pipe_break', elementos: ['329'] },
    espera: [
      { ruta: 'propuesta', valor: true },
      // Que exija confirmación es parte de la respuesta correcta, no un detalle:
      // ningún escenario se lanza sin que el usuario apruebe la definición.
      { ruta: 'requiere_confirmacion', valor: true },
      { ruta: 'definicion.eventos.0.tipo', valor: 'pipe_break' },
      { ruta: 'definicion.eventos.0.elementos.0', valor: '329' },
    ],
    origen: 'Salida real de proponer_escenario sobre la red guardada; la 329 existe y se valida antes de proponer.',
  },

  // ------------------------------------------------- fase 1: las que faltan
  {
    id: 'net3-indicadores-resiliencia',
    pregunta: '¿Cómo está de resiliente mi red?',
    red: 'Net3 2.inp',
    herramienta: 'indicadores_resiliencia',
    argumentos: {},
    espera: [
      { ruta: 'todini_index', valor: 0.3841, tolerancia: 0.0005 },
      { ruta: 'network_entropy', valor: 3.6668, tolerancia: 0.0005 },
      { ruta: 'hydraulic_redundancy', valor: 2.5372, tolerancia: 0.0005 },
      // Fracción, no porcentaje: es justo la confusión que costó el #89.
      { ruta: 'serviceability.pressure_serviceability', valor: 0.9565, tolerancia: 0.0005 },
      { ruta: 'serviceability.junctions_meeting_pressure', valor: 88 },
    ],
    origen: 'wntr_resilience_service.py resilience_indicators sobre el .inp de la red guardada.',
    pendiente: 'La herramienta no existe: hoy los indicadores sólo se lanzan desde el panel.',
  },
  {
    id: 'net3-curva-fragilidad',
    pregunta: '¿Cuántas tuberías fallarían con un sismo de 1,2 g si son de PVC?',
    red: 'Net3 2.inp',
    herramienta: 'curva_fragilidad',
    argumentos: {
      material: 'PVC',
      damage_model: 'HAZUS_MH',
      hazard_type: 'seismic_pga',
      soil_class: 'stiff_soil',
      max_intensity: 1.2,
    },
    espera: [
      { ruta: 'pipe_count', valor: 117 },
      { ruta: 'total_length_km', valor: 65.75, tolerancia: 0.01 },
      { ruta: 'intensity_unit', valor: 'g' },
      { ruta: 'pipe_failure_probability.20', valor: 0.9774, tolerancia: 0.0005 },
      { ruta: 'expected_failed_pipes.20', valor: 114.356, tolerancia: 0.01 },
    ],
    origen: 'wntr_resilience_service.py fragility_curve con esos argumentos explícitos.',
    pendiente: 'La herramienta no existe: la curva sólo se genera desde el panel de resiliencia.',
  },
]
