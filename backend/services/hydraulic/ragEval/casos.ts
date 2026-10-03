import type { CasoRAG, Comprobacion } from './bateria'

/**
 * Los casos con los que se miden las respuestas del RAG (#226).
 *
 * Regla de la casa, la misma que en `agentEval/casos.ts`: **ningún valor
 * esperado se escribe de memoria**. Cada hecho dice en `origen` la página,
 * tabla o ecuación de la que sale, y las cifras se comprobaron contra el texto
 * que la app extrae del PDF (`extraerTextoDeFichero`).
 *
 * El documento no está en el repositorio ni puede estarlo: es el libro de Luis.
 * La ruta se da con la variable de `DOCUMENTOS` o con `--documento clave=ruta`.
 *
 * Las expresiones se buscan en minúsculas y con los espacios normalizados
 * (`normalizar`). En `enFuente` se escriben contra el texto del PDF, que parte
 * las fórmulas: «s_w = CQ²» llega como «s w = cq 2».
 */

export const DOCUMENTOS: Record<string, { titulo: string; variable: string }> = {
  walton: {
    titulo: 'Groundwater Pumping Tests, William C. Walton (1987), 216 páginas',
    variable: 'BOORIE_EVAL_DOC_WALTON',
  },
}

const BORRADOR = 'Borrador de Claude para revisar con Luis (3 oct 2026); sin revisar todavía.'

// Piezas de expresiones que se repiten. Las respuestas mezclan castellano,
// inglés, Markdown y LaTeX: «10 s», «10 segundos», «10 seconds», «10 seg.».
const SEG = '(?:s|seg|segundos?|seconds?|sec)\\b'
const MIN = '(?:min|minutos?|minutes?)\\b'
const A = ' ?(?:-|a|y|to) ?'
const DE_C = '(?:s|sec|seg|segundos?)\\s*(?:²|\\^ ?\\{?2\\}?|2)\\s*/\\s*(?:ft|pies?)'
const FT = '(?:ft|pies?|feet|foot)\\b'
const HORAS = '(?:h|horas?|hours?)\\b'
// qwen2.5:7b llamó a la escalonada «prueba en etapas» y a la de caudal constante «prueba continua».
const ESCALONADA = '(?:escalonad|step|etapas|escalones|caudal variable)'
const CONSTANTE = '(?:constante|constant|continu)'
const CQ2 = 's ?[_{]?\\{?w\\}? ?= ?c ?[·*×]? ?q ?(?:²|\\^ ?\\{?2|2)'

const texto = (patron: string): Comprobacion => ({ patron })
const cifra = (valor: number, tolerancia: number, unidad?: string): Comprobacion => ({ cifra: valor, tolerancia, ...(unidad ? { unidad } : {}) })
const METROS = 'm\\b|metros?'

const UNIDADES = { s: SEG, min: MIN, h: '(?:h|horas?|hours?)\\b' }

/**
 * Una fila de la tabla 2.1: el tramo de tiempo y el intervalo, en ese orden.
 * La unidad del tramo es opcional porque en una tabla suele ir en la cabecera
 * («Tiempo (min) | Intervalo»), como la escribió qwen2.5:7b.
 */
const filaTabla21 = (
  id: string, desde: string, hasta: string, cada: number, unidad: keyof typeof UNIDADES, fuente: string[]
) => ({
  id,
  descripcion: `De ${desde.replace(/\[.*?\]\?/g, '')} a ${hasta.replace(/\[.*?\]\?/g, '')} min, cada ${cada} ${unidad}`,
  // Corto a propósito: con más margen, el intervalo de la fila siguiente valdría por el de esta.
  enRespuesta: [texto(`\\b${desde}${A}${hasta}(?: ?${MIN})?.{0,25}?\\b${cada} ?${UNIDADES[unidad]}`)],
  enFuente: fuente.map(texto),
  origen: 'Tabla 2.1, p. 14',
})

export const CASOS: CasoRAG[] = [
  {
    id: 'walton-tabla-2-1',
    pregunta: 'Según el libro de Walton, ¿cada cuánto tiempo hay que medir el nivel del agua en los pozos de observación durante una prueba de bombeo? Dame la tabla de intervalos.',
    documento: 'walton',
    hechos: [
      filaTabla21('1-2-min-10-s', '1', '2', 10, 's', ['1-2 minutes', '10 seconds']),
      filaTabla21('2-5-min-30-s', '2', '5', 30, 's', ['2-5 minutes', '30 seconds']),
      filaTabla21('15-50-min-5-min', '15', '50', 5, 'min', ['15-50 minutes', '5 minutes']),
      filaTabla21('100-500-min-30-min', '100', '500', 30, 'min', ['100 - 500 minutes', '30 minutes']),
      filaTabla21('1000-5000-min-4-h', '1[.,]?000', '5[.,]?000', 4, 'h', ['1000 - 5000 minutes', '4 hours']),
      {
        id: 'cita-tabla-2-1',
        descripcion: 'Dice que sale de la tabla 2.1',
        enRespuesta: [texto('tabla 2\\.1|table 2\\.1')],
        enFuente: [texto('table 2\\.1')],
        origen: 'Tabla 2.1, p. 14',
      },
    ],
    prohibidos: [],
    revision: BORRADOR,
  },
  {
    id: 'walton-calendario-4-dias',
    pregunta: '¿Qué calendario típico de prueba de bombeo propone Walton para un acuífero artesiano, día por día?',
    documento: 'walton',
    hechos: [
      {
        id: 'dia-1-tendencia',
        descripcion: 'Día 1: medir niveles para establecer la tendencia previa (antecedente)',
        enRespuesta: [texto('tendencias? (?:previas?|antecedentes?|anterior(?:es)?)|antecedent trend')],
        enFuente: [texto('day 1\\. water level measurements to establish antecedent trend')],
        origen: 'p. 14',
      },
      {
        id: 'dia-2-escalonada-3-h',
        descripcion: 'Día 2: prueba escalonada de 3 horas para el coeficiente de pérdidas del pozo',
        enRespuesta: [texto(`3 ?${HORAS}.{0,120}${ESCALONADA}|${ESCALONADA}.{0,120}\\b3 ?${HORAS}`)],
        enFuente: [texto('3-hour step-drawdown test')],
        origen: 'p. 14',
      },
      {
        id: 'dia-2-recuperacion-20-h',
        descripcion: 'Día 2: recuperación de 20 horas tras la escalonada',
        enRespuesta: [texto('20 ?(?:h|horas?|hours?)\\b')],
        enFuente: [texto('20-hour recovery period')],
        origen: 'p. 14',
      },
      {
        id: 'dia-3-caudal-constante-24-h',
        descripcion: 'Día 3: prueba a caudal constante de 24 horas',
        enRespuesta: [texto(`24 ?${HORAS}.{0,60}${CONSTANTE}|${CONSTANTE}.{0,60}24 ?${HORAS}`)],
        enFuente: [texto('24-hour constant rate test')],
        origen: 'p. 14',
      },
      {
        id: 'dia-4-recuperacion-24-h',
        descripcion: 'Día 4: recuperación de 24 horas',
        enRespuesta: [texto('(?:recuperaci[oó]n|recovery).{0,40}24 ?(?:h|horas?|hours?)\\b|24 ?(?:h|horas?|hours?)\\b.{0,40}(?:recuperaci[oó]n|recovery)')],
        enFuente: [texto('day 4\\. 24-hour recovery test')],
        origen: 'p. 14',
      },
    ],
    prohibidos: [],
    revision: BORRADOR,
  },
  {
    id: 'walton-tabla-2-2-pozo-16',
    pregunta: 'Tengo un pozo de 16 pulgadas y quiero bombear 20 l/s. Según la tabla 2.2 de Walton, ¿para qué caudales es óptimo ese diámetro y qué diámetro correspondería a 20 l/s?',
    documento: 'walton',
    hechos: [
      {
        id: '16-in-800-1800-gpm',
        descripcion: '16 in es el diámetro óptimo para 800-1800 gpm',
        enRespuesta: [texto(`800${A}1[.,]?800 ?(?:gpm|gal)`)],
        enFuente: [texto('production well diameters for discharge rates'), texto('800 - 1800')],
        origen: 'Tabla 2.2, p. 20',
      },
      {
        id: '20-ls-317-gpm',
        descripcion: '20 l/s son unos 317 gpm',
        enRespuesta: [cifra(317, 3, 'gpm|gal')],
        // La conversión no está en el libro: es aritmética. Se exige sólo que el
        // modelo tuviera la tabla delante.
        enFuente: [texto('production well diameters for discharge rates')],
        origen: '20 l/s × 15,85 = 317 gpm (conversión, no está en el libro)',
      },
      {
        id: '317-gpm-10-12-in',
        descripcion: 'Para ~317 gpm la tabla da 10 in (150-350 gpm) o 12 in (300-700 gpm)',
        enRespuesta: [texto('(?:10|12) ?(?:in|pulg|pulgadas|")'), texto('150' + A + '350'), texto('300' + A + '700')],
        enFuente: [texto('150 - 350'), texto('300 - 700')],
        origen: 'Tabla 2.2, p. 20',
      },
    ],
    prohibidos: [
      {
        id: '20-ls-45-gpm',
        descripcion: 'La conversión mal hecha que dio qwen2.5:7b: 20 l/s = 45,9 gpm',
        comprobaciones: [cifra(45.9, 0.2, 'gpm|gal')],
      },
    ],
    revision: BORRADOR,
  },
  {
    id: 'walton-ecuacion-4-1',
    pregunta: '¿Cómo calcula Walton la pérdida de carga en el pozo (well loss) y en qué unidades van el coeficiente y el caudal?',
    documento: 'walton',
    hechos: [
      {
        id: 'sw-cq2',
        descripcion: 's_w = C·Q² (ecuación 4.1, Jacob 1946)',
        enRespuesta: [texto(CQ2)],
        enFuente: [texto('s w = cq 2 \\(4\\.1\\)')],
        origen: 'Ecuación 4.1, p. 77',
      },
      {
        id: 'unidades-c',
        descripcion: 'C en s²/ft⁵',
        enRespuesta: [texto(`${DE_C} ?(?:⁵|\\^ ?\\{?5|5)`)],
        enFuente: [texto('well loss coefficient, in sec 2 /ft 5')],
        origen: 'p. 77',
      },
      {
        id: 'q-en-cfs',
        descripcion: 'Q en pies cúbicos por segundo (cfs)',
        enRespuesta: [texto('cfs|ft ?(?:³|\\^ ?3|3) ?/ ?s|pies c[uú]bicos por segundo|cubic feet per second')],
        enFuente: [texto('discharge rate, in cfs')],
        origen: 'p. 77',
      },
      {
        id: '1-cfs-449-gpm',
        descripcion: '1 cfs = 449 gpm',
        enRespuesta: [cifra(449, 0.5, 'gpm|gal')],
        enFuente: [texto('1 cfs = 449 gpm')],
        origen: 'p. 77',
      },
    ],
    prohibidos: [
      {
        id: 'eficiencia-caudal-teorico',
        descripcion: 'La eficiencia inventada que dio qwen2.5:7b: caudal teórico / caudal observado',
        comprobaciones: [texto('caudal te[oó]rico ?/ ?caudal (?:observado|real)')],
      },
    ],
    revision: BORRADOR,
  },
  {
    id: 'walton-coeficiente-c',
    pregunta: 'En una prueba escalonada, ¿cómo se calcula el coeficiente de pérdidas del pozo C a partir de dos escalones y qué valores de C considera normales Walton?',
    documento: 'walton',
    hechos: [
      {
        id: 'formula-c',
        descripcion: 'C = (s_n/Q_n − s_{n−1}/Q_{n−1}) / (Q_{n−1} + Q_n)',
        enRespuesta: [
          texto('s_?\\{?n\\}? ?/ ?q_?\\{?n\\}? ?[-−] ?s_?\\{?n ?[-−] ?1\\}? ?/ ?q_?\\{?n ?[-−] ?1\\}?'),
          texto('s_?\\{?2\\}? ?/ ?q_?\\{?2\\}? ?[-−] ?s_?\\{?1\\}? ?/ ?q_?\\{?1\\}?'),
          texto('s_?\\{?3\\}? ?/ ?q_?\\{?3\\}? ?[-−] ?s_?\\{?2\\}? ?/ ?q_?\\{?2\\}?'),
          texto('\\\\frac\\{s_\\{?n\\}?\\}\\{q_\\{?n\\}?\\} ?[-−] ?\\\\frac\\{s_\\{?n ?- ?1\\}?\\}'),
        ],
        enFuente: [texto('\\(s3/q3 - s 2 /q 2 \\)/\\(q 2 \\+ q 3 \\)')],
        origen: 'Ecuaciones 4.2 y 4.3, p. 78',
      },
      {
        id: 'incrementos-tendencia',
        descripcion: 'Los incrementos de abatimiento se miden respecto a la extrapolación de la curva del escalón anterior, al mismo tiempo',
        enRespuesta: [texto('extrapola|mismo (?:intervalo de )?tiempo|same time')],
        enFuente: [texto('extrapolation of the preced')],
        origen: 'p. 78',
      },
      {
        id: 'c-menor-10',
        descripcion: 'C suele ser menor que 10 s²/ft⁵',
        enRespuesta: [cifra(10, 0, DE_C)],
        enFuente: [texto('less than 10 sec 2 /ft 5')],
        origen: 'p. 78',
      },
      {
        id: 'c-cerca-de-2',
        descripcion: 'C es a menudo de unos 2,0 s²/ft⁵',
        enRespuesta: [cifra(2, 0, DE_C)],
        enFuente: [texto('often about 2\\.0 sec 2 /ft 5')],
        origen: 'p. 78',
      },
    ],
    prohibidos: [],
    revision: BORRADOR,
  },
  {
    id: 'walton-ejemplo-4-1',
    pregunta: 'En el ejemplo 4.1 de Walton, con escalones de 100, 151 y 199 gpm y abatimientos de 3,35, 5,14 y 6,86 ft, ¿qué coeficiente de pérdidas C sale y cuál es la pérdida en el pozo a 151 gpm?',
    documento: 'walton',
    hechos: [
      {
        id: 'c-2-0',
        descripcion: 'C medio = 2,0 s²/ft⁵',
        enRespuesta: [cifra(2, 0.1, DE_C)],
        enFuente: [texto('average calculated value of well loss coefficient is 2\\.0')],
        origen: 'Ejemplo 4.1, p. 79',
      },
      {
        id: 'sw-0-23-ft',
        descripcion: 'Pérdida en el pozo a 151 gpm = 0,23 ft (≈ 0,07 m)',
        enRespuesta: [cifra(0.23, 0.01, FT), cifra(0.07, 0.005, METROS)],
        enFuente: [texto('151 gpm discharge rate based on equation 4\\.1 is 0\\.23 ft')],
        origen: 'Ejemplo 4.1, p. 79',
      },
      {
        id: 'cita-ecuacion-4-1',
        descripcion: 'Usa s_w = C·Q² (ecuación 4.1)',
        enRespuesta: [texto(CQ2), texto('ecuaci[oó]n 4\\.1|equation 4\\.1')],
        enFuente: [texto('s w = cq 2')],
        origen: 'Ecuación 4.1, p. 77',
      },
    ],
    prohibidos: [],
    revision: BORRADOR,
  },
  {
    id: 'walton-caso-5-7',
    pregunta: '¿Qué resultados dio la prueba escalonada del caso de estudio 5.7 de Walton: coeficientes de pérdidas, valor medio y pérdida en el pozo al caudal máximo?',
    documento: 'walton',
    hechos: [
      {
        id: 'c12-0-04',
        descripcion: 'C de los escalones 1 y 2 = 0,04 s²/ft⁵',
        enRespuesta: [cifra(0.04, 0.001, DE_C)],
        enFuente: [texto('0\\.04 sec 2 /ft 5')],
        origen: 'Caso 5.7, p. 101',
      },
      {
        id: 'c23-0-11',
        descripcion: 'C de los escalones 2 y 3 = 0,11 s²/ft⁵',
        enRespuesta: [cifra(0.11, 0.001, DE_C)],
        enFuente: [texto('0\\.11 sec 2 /ft 5')],
        origen: 'Caso 5.7, pp. 101-102',
      },
      {
        id: 'c-medio-0-08',
        descripcion: 'C medio = 0,08 s²/ft⁵',
        enRespuesta: [cifra(0.08, 0.001, DE_C)],
        enFuente: [texto('average value of the well loss coefficient is 0\\.08')],
        origen: 'Caso 5.7, p. 102',
      },
      {
        id: 'sw-0-77-ft-1400-gpm',
        descripcion: 'Pérdida en el pozo a 1400 gpm = 0,77 ft',
        enRespuesta: [cifra(0.77, 0.01, FT), cifra(0.23, 0.01, METROS)],
        enFuente: [texto('1400 gpm rate was calculated to be 0\\.77 ft')],
        origen: 'Caso 5.7, p. 102',
      },
      {
        id: 'diez-por-ciento',
        descripcion: 'Es en torno al 10 % del abatimiento total del pozo',
        enRespuesta: [cifra(10, 0, '%|por ?ciento|percent')],
        enFuente: [texto('about 10% of the total drawdown')],
        origen: 'Caso 5.7, p. 102',
      },
    ],
    prohibidos: [],
    revision: BORRADOR,
  },
  {
    id: 'walton-criterios-del-sitio',
    pregunta: '¿Qué condiciones tiene que cumplir el pozo de bombeo y su equipo para que una prueba de bombeo dé resultados aceptables, según Walton?',
    documento: 'walton',
    hechos: [
      {
        id: 'equipo-fiable',
        descripcion: 'Energía, bomba y control de la descarga fiables',
        enRespuesta: [texto('(?:fiable|confiable|reliable).{0,80}(?:bomba|energ|control)|(?:bomba|energ|control).{0,80}(?:fiable|confiable|reliable)')],
        enFuente: [texto('reliable power, pump, and discharge-control equipment')],
        origen: 'Criterio 1 (Stallman), p. 9',
      },
      {
        id: 'sin-recirculacion',
        descripcion: 'Conducir el agua bombeada lejos del pozo para evitar recirculación',
        enRespuesta: [texto('recircula')],
        enFuente: [texto('recircula')],
        origen: 'Criterio 2, p. 9',
      },
      {
        id: 'nivel-en-el-pozo-de-bombeo',
        descripcion: 'Poder medir el nivel en el pozo de bombeo antes, durante y después',
        enRespuesta: [texto('antes, durante y despu[eé]s|before, during,? and after')],
        enFuente: [texto('before, during, and after pumping')],
        origen: 'Criterio 4, p. 9',
      },
      {
        id: 'pozos-cercanos-controlados',
        descripcion: 'Los pozos de bombeo cercanos dentro del área de influencia, controlados y con caudal conocido',
        enRespuesta: [texto('(?:pozos?|wells?).{0,60}(?:cercan|vecin|nearby|[áa]rea de influencia|area of influence)')],
        enFuente: [texto('within the pumping test area of influence should be capable of being controlled')],
        origen: 'Criterio 6, p. 9',
      },
      {
        id: 'prueba-de-respuesta',
        descripcion: 'Comprobar la respuesta de los pozos de observación inyectando un volumen conocido de agua',
        enRespuesta: [texto('inyect|inject|volumen conocido|known volume')],
        enFuente: [texto('injecting a known volume of water')],
        origen: 'Criterio 9, pp. 9-10',
      },
    ],
    prohibidos: [],
    revision: BORRADOR,
  },
  {
    id: 'walton-pozos-de-observacion',
    pregunta: '¿Cuántos pozos de observación recomienda Walton, a qué distancias del pozo de bombeo y con qué diámetro?',
    documento: 'walton',
    hechos: [
      {
        id: 'al-menos-tres',
        descripcion: 'Al menos tres pozos de observación',
        enRespuesta: [texto('(?:al menos|m[ií]nimo|at least) (?:3|tres|three)')],
        enFuente: [texto('at least three observation wells')],
        origen: 'p. 10',
      },
      {
        id: 'espaciado-logaritmico',
        descripcion: 'Espaciado logarítmico, al menos un ciclo de distancia-abatimiento',
        enRespuesta: [texto('logar[ií]tmic')],
        enFuente: [texto('spacing should be logarithmic')],
        origen: 'p. 10',
      },
      {
        id: '100-400-1000-ft',
        descripcion: 'Espaciado típico: 100, 400 y 1000 ft',
        enRespuesta: [texto(`100 ?(?:${FT})?,? 400 ?(?:${FT})?,? (?:y|and) 1[.,]?000 ?${FT}`), cifra(122, 2, METROS)],
        enFuente: [texto('typical spacing is 100, 400, and 1000 ft')],
        origen: 'p. 10',
      },
      {
        id: 'distancia-minima-ec-2-1',
        descripcion: 'El más cercano a 1,5·m·(P_H/P_V)^½ o más para evitar la penetración parcial (ec. 2.1)',
        enRespuesta: [texto('1[.,]5 ?[·*×]? ?m ?[·*×]? ?\\(?\\\\?(?:sqrt|√)?'), texto('ecuaci[oó]n 2\\.1|equation 2\\.1|\\(2\\.1\\)')],
        enFuente: [texto('1\\.5m\\(p h /p v \\) 1/2 \\(2\\.1\\)')],
        origen: 'Ecuación 2.1, p. 10',
      },
      {
        id: 'diametro-4-6-in',
        descripcion: 'Diámetro de los pozos de observación: más de 1 in, a menudo 4-6 in con registrador de flotador',
        enRespuesta: [texto(`4${A}6 ?(?:in|pulg|pulgadas|")`)],
        enFuente: [texto('often 4-6 in\\. when float-operated recorders')],
        origen: 'p. 12',
      },
    ],
    prohibidos: [],
    revision: BORRADOR,
  },
  {
    id: 'walton-capacidad-especifica',
    pregunta: '¿Con qué ecuaciones aproximadas estima Walton la capacidad específica de un pozo a partir de la transmisividad, en acuífero artesiano y en libre?',
    documento: 'walton',
    hechos: [
      {
        id: 'artesiano-t-2000',
        descripcion: 'Artesiano: Q/s = T/2000 (ec. 2.4)',
        enRespuesta: [texto('t ?/ ?2[.,]?000|\\\\frac\\{t\\}\\{2[.,]?000\\}')],
        enFuente: [texto('q/s = t/2000 \\(2\\.4\\)')],
        origen: 'Ecuación 2.4, p. 19',
      },
      {
        id: 'libre-t-1500',
        descripcion: 'Libre: Q/s = T/1500 (ec. 2.5)',
        enRespuesta: [texto('t ?/ ?1[.,]?500|\\\\frac\\{t\\}\\{1[.,]?500\\}')],
        enFuente: [texto('q/s = t/1500 \\(2\\.5\\)')],
        origen: 'Ecuación 2.5, p. 19',
      },
      {
        id: 'unidades',
        descripcion: 'Q/s en gpm/ft y T en gpd/ft',
        enRespuesta: [texto('gpm ?/ ?ft'), texto('gpd ?/ ?ft')],
        enFuente: [texto('specific capacity with full pen- etration, in gpm/ft')],
        origen: 'p. 19',
      },
      {
        id: 'sin-perdidas',
        descripcion: 'Suponen pérdidas en el pozo despreciables y penetración total',
        enRespuesta: [texto('despreci|negligible|sin p[eé]rdidas'), texto('penetraci[oó]n (?:total|completa)|fully penetrat')],
        enFuente: [texto('assume that well loss is negligible')],
        origen: 'p. 19',
      },
    ],
    prohibidos: [],
    revision: BORRADOR,
  },
  {
    id: 'luis-prueba-caudal-variable',
    // La pregunta de Luis tal como está en `glosarioHidraulico.test.ts`. La que
    // envió entera pedía además fórmulas de eficiencia y parámetros críticos del
    // informe para 80 m y 20 l/s: que Luis la sustituya por la literal.
    pregunta: 'Deseo planificar una prueba de bombeo a caudal variable para ver la eficiencia de un pozo para explotacion de agua subterranean con fines de abastecimiento urbano. El pozo se acaba de perforar y desarrollar, el nivel estatico esta a 20 metros, el diametro del poszo es de 16 pulgadas. Dame una tabla de tiempos, los escalones de caudales a considerar, las precauciones que debo tomar y los equipos de bombeo que debo y no debo utilizar.',
    documento: 'walton',
    hechos: [
      filaTabla21('tabla-2-1-1-2-min', '1', '2', 10, 's', ['1-2 minutes', '10 seconds']),
      filaTabla21('tabla-2-1-5-15-min', '5', '15', 1, 'min', ['5-15 minutes', '1 minute']),
      {
        id: 'tres-escalones-1-h',
        descripcion: 'Tres escalones sucesivos, normalmente de 1 hora, a fracciones constantes de la capacidad',
        enRespuesta: [texto('(?:3|tres|three) (?:escalones|etapas|pasos|steps|periodos)')],
        enFuente: [texto('three successive periods usually 1 hour')],
        origen: 'Capítulo 4, p. 77',
      },
      {
        id: 'sw-cq2',
        descripcion: 's_w = C·Q² (ecuación 4.1)',
        enRespuesta: [texto(CQ2)],
        enFuente: [texto('s w = cq 2')],
        origen: 'Ecuación 4.1, p. 77',
      },
      {
        id: 'criterio-c',
        descripcion: 'Criterio de Walton: C normalmente < 10 s²/ft⁵, a menudo ≈ 2,0',
        enRespuesta: [cifra(10, 0, DE_C), cifra(2, 0, DE_C)],
        enFuente: [texto('less than 10 sec 2 /ft 5')],
        origen: 'p. 78',
      },
      {
        id: 'escalonada-dentro-del-calendario',
        descripcion: 'La escalonada de 3 h va el día 2, antes de la de caudal constante de 24 h',
        enRespuesta: [texto(`24 ?${HORAS}.{0,60}${CONSTANTE}|${CONSTANTE}.{0,60}24 ?${HORAS}`)],
        enFuente: [texto('24-hour constant rate test')],
        origen: 'p. 14',
      },
      {
        id: 's-bq-cq2',
        descripcion: 'Abatimiento total s = BQ + CQ² (Jacob)',
        enRespuesta: [texto('s ?= ?b ?[·*×]? ?q ?\\+ ?c ?[·*×]? ?q ?(?:²|\\^ ?\\{?2|2)')],
        // La respuesta de referencia de Luis lo trae, pero el libro no: si falla
        // siempre como «recuperación», es que el material no lo tenía.
        enFuente: [texto('bq ?\\+ ?cq')],
        origen: 'Respuesta de referencia de Luis (criterio de experto); no está en Walton',
        fueraDelDocumento: true,
      },
      {
        id: 'eficiencia-bq-s',
        descripcion: 'Eficiencia E = BQ / s',
        enRespuesta: [texto('e ?= ?\\(?b ?[·*×]? ?q\\)? ?/ ?s|\\\\frac\\{b ?q\\}\\{s')],
        enFuente: [texto('bq ?/ ?s')],
        origen: 'Respuesta de referencia de Luis (criterio de experto); no está en Walton',
        fueraDelDocumento: true,
      },
    ],
    prohibidos: [
      {
        id: '20-ls-45-gpm',
        descripcion: 'La conversión mal hecha de qwen2.5:7b: 20 l/s = 45,9 gpm',
        comprobaciones: [cifra(45.9, 0.2, 'gpm|gal')],
      },
      {
        id: 'eficiencia-caudal-teorico',
        descripcion: 'La eficiencia inventada: caudal teórico / caudal observado',
        comprobaciones: [texto('caudal te[oó]rico ?/ ?caudal (?:observado|real)')],
      },
    ],
    revision: 'Caso de Luis: pregunta suya, hechos sacados del informe enviado a Luis y Cristina (30 sep 2026). Borrador para revisar con Luis.',
  },
]
