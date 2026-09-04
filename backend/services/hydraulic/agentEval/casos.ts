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
 * Los casos `pendiente` describen herramientas que todavía no existen. Se
 * escriben antes, con su valor esperado ya calculado, para que la fase que las
 * traiga se pueda dar por terminada contra algo; el día que la herramienta
 * aparece, el caso se activa borrando una línea. Así entraron los tres de la
 * fase 1, que ya están activos.
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
    herramienta: 'proponer_indicadores_resiliencia',
    argumentos: {},
    espera: [
      // Lo correcto aquí **no** es una cifra: es que proponga y se calle. Estos
      // indicadores simulan la red entera, y en Net6 pasan de diez minutos.
      { ruta: 'requiere_confirmacion', valor: true },
      { ruta: 'definicion.analisis', valor: 'indicadores_resiliencia' },
      { ruta: 'definicion.comparar_con_interrupcion', valor: false },
    ],
    origen:
      'Decisión de diseño del #119: se propone lo que simula. Medido, resilience_indicators pasa ' +
      'de 3,45 s en Net3 a más de 600 s en Net6, mientras fragility_curve se queda en 2,5 s en las dos.',
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
      { ruta: 'tuberias_de_la_red', valor: 117 },
      { ruta: 'longitud_total_km', valor: 65.75, tolerancia: 0.01 },
      { ruta: 'unidad_de_intensidad', valor: 'g' },
      { ruta: 'mediana_en_unidad_del_eje', valor: 0.3608, tolerancia: 0.0002 },
      // Cinco puntos repartidos por el eje: la curva entera no cabe en el prompt.
      { ruta: 'puntos.0.intensidad', valor: 0.24, tolerancia: 0.001 },
      { ruta: 'puntos.0.probabilidad_de_fallo', valor: 0.2484, tolerancia: 0.0002 },
      { ruta: 'puntos.4.intensidad', valor: 1.2, tolerancia: 0.001 },
      { ruta: 'puntos.4.probabilidad_de_fallo', valor: 0.9774, tolerancia: 0.0002 },
      { ruta: 'puntos.4.tuberias_afectadas', valor: 114.4, tolerancia: 0.05 },
    ],
    origen:
      'wntr_resilience_service.py fragility_curve con esos argumentos explícitos, y contrastado ' +
      'contra la aplicación real: el panel muestra 114,4 de 117 y 97,7 % con suelo firme.',
  },
  {
    id: 'net3-curva-fragilidad-suelo-blando',
    pregunta: 'La misma pregunta, pero el emplazamiento es de suelo blando.',
    red: 'Net3 2.inp',
    herramienta: 'curva_fragilidad',
    argumentos: {
      material: 'PVC',
      damage_model: 'HAZUS_MH',
      hazard_type: 'seismic_pga',
      soil_class: 'soft_soil',
      max_intensity: 1.2,
    },
    espera: [
      { ruta: 'clase_de_suelo', valor: 'soft_soil' },
      { ruta: 'puntos.4.probabilidad_de_fallo', valor: 0.9915, tolerancia: 0.0002 },
      { ruta: 'puntos.4.tuberias_afectadas', valor: 116.0, tolerancia: 0.05 },
    ],
    /**
     * Este caso existe por un susto. Mirando la aplicación anoté 116,0 de 117
     * para esta red y creí que discrepaba del motor, que daba 114,4. No
     * discrepaba: 116,0 es el valor de **suelo blando**, y lo que estaba mal
     * era mi apunte de con qué suelo lo había generado. Reproducido después en
     * la aplicación, las dos cifras salen donde tienen que salir.
     *
     * La lección es del tamaño de la batería entera: una cifra sin los
     * argumentos con los que se obtuvo no se puede contrastar con nada. Con
     * los tres suelos fijados, la duda se resuelve mirando cuál coincide.
     */
    origen:
      'wntr_resilience_service.py con soil_class soft_soil, y reproducido en la aplicación real: ' +
      '116,0 de 117 en el panel.',
  },
]
