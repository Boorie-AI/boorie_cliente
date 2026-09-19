/**
 * Si una pregunta es manifiestamente ajena a la ingeniería hidráulica (#170).
 *
 * Boorie contestó «Puedes hacer 40 hamburguesas con un kilo de carne». Lo grave
 * no es la pregunta: es que la cifra se la inventó, con el mismo aplomo con el
 * que daría una presión. Un asistente que responde de cualquier cosa con
 * seguridad enseña a confiar en él justo donde no hay que hacerlo.
 *
 * ## Por qué esto no lo juzga un modelo
 *
 * El rail de entrada ya existía y ya le preguntaba a `nemotron-mini`. Medido
 * con temperatura 0 sobre ocho casos —tres claramente fuera, tres de
 * hidráulica, un saludo y una pregunta sobre el propio asistente—, el juez
 * respondió **ALLOW a los ocho**, tanto con la instrucción que traía como con
 * una reescrita para exigir pertinencia temática. Cero bloqueos de ocho. Es el
 * mismo comportamiento que se midió en #161, donde ese modelo puntuaba 0,95
 * todo lo que aceptaba: no discrimina.
 *
 * Así que esto se decide con una regla que se puede leer, probar y razonar, y
 * que responde en microsegundos en lugar de segundos.
 *
 * ## El criterio, y por qué es asimétrico
 *
 * **Sólo se bloquea cuando hay señal explícita de que la pregunta es de otro
 * mundo y ninguna de que sea del nuestro.** Ante cualquier otra combinación,
 * pasa.
 *
 * La asimetría es deliberada y es lo más importante de este fichero. Los dos
 * errores posibles no cuestan lo mismo:
 *
 *   - Dejar pasar una pregunta de cocina: el usuario recibe una respuesta
 *     inútil y se ríe. Molesto.
 *   - Bloquear una pregunta legítima de hidráulica: la herramienta deja de
 *     servir para lo que existe, delante de quien la está usando bien, y sin
 *     que él pueda hacer nada. Inaceptable.
 *
 * Por eso una pregunta sin señal de ninguna clase —un «hola», un «¿qué puedes
 * hacer?», un «¿y el valor de C?»— pasa siempre. No hace falta demostrar que
 * algo es del dominio; hace falta demostrar que no lo es.
 */

/** Normaliza para comparar: sin acentos, en minúsculas. */
function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Palabras que sitúan la pregunta en el dominio, en los tres idiomas de la
 * aplicación y en el inglés de la documentación técnica.
 *
 * No pretende ser exhaustiva y no hace falta que lo sea: su papel es indultar,
 * no acusar. Una que falte sólo significa que esa pregunta se juzgará por si
 * tiene señal de estar fuera, y si no la tiene, pasará igual.
 */
const DEL_DOMINIO = [
  // Agua y redes
  'agua', 'aigua', 'water', 'hidraulic', 'hydraulic', 'hidrolog', 'hydrolog',
  'red', 'xarxa', 'network', 'acueducto', 'aqueduct', 'alcantarill', 'sewer',
  'saneamiento', 'drenaje', 'drainage', 'abastecimiento', 'potable',
  // Elementos
  'tuberia', 'tuberias', 'canonada', 'pipe', 'pipes', 'nudo', 'nudos', 'node',
  'tramo', 'tramos', 'tram', 'link', 'links', 'conduccion', 'impulsion',
  'carga', 'fuga', 'fugas', 'leak', 'sector', 'dma', 'calibracion',
  'bomba', 'bombas', 'pump', 'pumps', 'valvula', 'valvules', 'valve', 'valves',
  'deposito', 'tanque', 'tank', 'embalse', 'reservoir', 'hidrante', 'hydrant',
  'caudalimetro', 'contador',
  // Magnitudes
  'presion', 'pressio', 'pressure', 'caudal', 'cabal', 'flow', 'velocidad',
  'velocitat', 'velocity', 'perdida de carga', 'head loss', 'rugosidad',
  'diametro', 'diametre', 'diameter', 'demanda', 'demand', 'consumo',
  'elevacion', 'cota', 'energia', 'energy',
  // Modelos, normas y herramientas
  'epanet', 'wntr', 'simulacion', 'simulacio', 'simulation', 'escenario',
  'scenario', 'norma', 'normativa', 'regulation', 'standard', 'estandar',
  'estandard', 'iso', 'une',
  'darcy', 'weisbach', 'hazen', 'williams', 'manning', 'bernoulli', 'reynolds',
  'colebrook', 'todini', 'resiliencia', 'resilience', 'fragilidad', 'fragility',
  'hidrograma', 'hydrograph', 'evapotranspiracion', 'evapotranspiration',
  'precipitacion', 'precipitation', 'infiltracion', 'acuifero', 'aquifer',
  'cloro', 'chlorine', 'calidad del agua', 'water quality',
  // La propia aplicación
  'boorie', 'proyecto', 'projecte', 'project', 'inp', 'indexad', 'documento',
]

/**
 * Señales de que la pregunta es de otro mundo, en los tres idiomas de la
 * aplicación: castellano, catalán e inglés.
 *
 * Aquí sí importa no pasarse: **cada término de esta lista puede bloquear**.
 * Se eligen palabras que no aparecen en una conversación de ingeniería
 * hidráulica ni de pasada, y ante la mínima ambigüedad se prefiere la forma
 * larga: «partido de fútbol» en vez de «partido», que en catalán es además un
 * partido político y en castellano puede ser cualquier cosa. Lo que se pierde
 * es algún bloqueo; lo que se evita es bloquear a quien está trabajando.
 */
const DE_OTRO_MUNDO = [
  // Cocina
  'hamburguesa', 'hamburguesas', 'hamburgueses', 'burger', 'burgers',
  'receta', 'recetas', 'recepta', 'receptes', 'recipe', 'recipes',
  'cocinar', 'cocina', 'cuinar', 'cuina', 'cooking', 'to cook',
  'horno', 'forn', 'oven', 'sarten', 'sartenes', 'paella de cocina',
  'ingredientes', 'ingredients de cuina', 'carne picada', 'minced meat',
  // Deporte y espectáculo
  'futbol', 'football', 'soccer', 'baloncesto', 'basquet', 'basketball',
  'tenis', 'tennis', 'mundial de futbol', 'world cup', 'liga de futbol',
  'partido de futbol', 'partit de futbol',
  'pelicula', 'peliculas', 'movie', 'movies', 'serie de television',
  'serie de televisio', 'tv series', 'cantante', 'cantant', 'singer',
  'famoso', 'celebrity',
  // Política, salud, derecho
  'elecciones', 'eleccions', 'election', 'elections',
  'presidente del gobierno', 'president del govern', 'prime minister',
  'partido politico', 'partit politic', 'political party', 'votar', 'to vote',
  'sintomas', 'simptomes', 'symptoms', 'diagnostico medico', 'medical diagnosis',
  'medicamento', 'medicament', 'medication', 'enfermedad', 'malaltia', 'illness',
  'dosis de', 'abogado', 'advocat', 'lawyer', 'divorcio', 'divorci', 'divorce',
  'herencia', 'herencia legal', 'inheritance',
  // Programación genérica
  'javascript', 'typescript', 'python script', 'funcion en python',
  'funcio en python', 'python function', 'html', 'css', 'react', 'sql query',
  // Otros
  'horoscopo', 'horoscop', 'horoscope', 'chiste', 'acudit', 'joke',
  'poema', 'poem', 'letra de la cancion', 'lletra de la canco', 'song lyrics',
]

/**
 * ¿Aparece el término como palabra, y no dentro de otra?
 *
 * Los límites de palabra no son un detalle: en #161, `potencia` casaba dentro
 * de «evapotranspiración **potencial**» y eso hacía que el agente descartara la
 * fuente que respondía. Aquí el mismo descuido bloquearía preguntas legítimas.
 */
function contiene(texto: string, termino: string): boolean {
  const escapado = termino.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapado}($|[^\\p{L}\\p{N}])`, 'u').test(texto)
}

export interface JuicioDeDominio {
  /** Si la pregunta puede seguir su camino. */
  pasa: boolean
  /** El término que la delató, para poder decirlo en el log y en las pruebas. */
  motivo?: string
}

export function juzgarDominio(pregunta: string): JuicioDeDominio {
  const texto = normalizar(pregunta ?? '')
  if (!texto.trim()) return { pasa: true }

  // Primero el indulto: una sola señal del dominio basta para dejar pasar,
  // aunque la pregunta mencione además algo de fuera («¿qué tubería uso en la
  // cocina?» es una pregunta de fontanería, no de cocina).
  if (DEL_DOMINIO.some(t => contiene(texto, t))) return { pasa: true }

  const ajeno = DE_OTRO_MUNDO.find(t => contiene(texto, t))
  if (ajeno) return { pasa: false, motivo: ajeno }

  // Sin señal de ninguna clase se pasa: no hay que demostrar que algo es del
  // dominio, hay que demostrar que no lo es.
  return { pasa: true }
}
