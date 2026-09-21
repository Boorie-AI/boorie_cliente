/**
 * Qué modelo convierte texto en vectores, y cuántos números devuelve (#155).
 *
 * Estaba escrito a mano en cinco sitios —tres tablas de dimensiones en
 * `document.handler`, el `targetDimension` fijo de `hybridSearch` y el
 * `nomic-embed-text` repetido en cada rama de `EmbeddingService`—, así que
 * cambiar de modelo no era cambiar un valor sino encontrarlos todos.
 *
 * El modelo por defecto pasa a ser `bge-m3`, que es multilingüe. El anterior,
 * `nomic-embed-text`, es monolingüe inglés, y eso no es un matiz de calidad: una
 * pregunta en castellano no recuperaba un documento técnico en inglés en
 * absoluto. Medido sobre 796 fragmentos reales con diez preguntas de hidrología
 * que el corpus responde, el libro aparecía en 1 de 30 puestos del top-3 (MRR
 * 0,119); con `bge-m3`, en 30 de 30 (MRR 1,000). Lo que sí recuperaba eran los
 * informes de simulación que la propia aplicación escribe en castellano.
 *
 * Cambiar de modelo invalida los vectores ya guardados: tienen otro tamaño y
 * Milvus responde «Success» con cero resultados al buscar con el nuevo. La
 * búsqueda avisa en el log y `wisdom:massiveReindex` es lo que los regenera.
 *
 * Medido después contra el corpus de un usuario real —317 libros técnicos,
 * 102.062 fragmentos— con 32 preguntas en castellano repartidas entre 14 de
 * esos libros, y los mismos textos para los dos modelos:
 *
 *   bge-m3 (566M, 1024)              MRR@10 0,560 · 22 de 32 en el top-3 · 184 frag/min
 *   granite-embedding:278m (768)     MRR@10 0,643 · 24 de 32 en el top-3 · 551 frag/min
 *   multilingual-e5-base (278M, 768) MRR@10 0,125 ·  1 de 32 en el top-3 · 563 frag/min
 *   multilingual-e5-small (117M, 384) MRR@10 0,053 ·  1 de 32 en el top-3 · 1435 frag/min
 *
 * O sea que el pequeño multilingüe evidente —e5-small, que es lo que uno
 * probaría para ir más rápido— no recupera nada: 8 veces más rápido y el RAG
 * deja de encontrar. Los E5 además necesitan los prefijos `query:`/`passage:`,
 * que aquí no se ponen; sin ellos bajan a 0,010. `granite-embedding:278m`
 * recupera mejor que el que está puesto y va 3 veces más rápido, con la
 * salvedad de que su ventana son 512 tokens contra los 8.192 de bge-m3, lo que
 * condiciona cualquier cambio futuro del troceado. Cambiar el de por defecto
 * obliga a reindexar a todo el mundo, así que se deja disponible por
 * `BOORIE_MODELO_EMBEDDINGS` hasta que esa decisión se tome.
 */

/**
 * El orden importa: se devuelve la primera coincidencia, así que lo específico
 * va antes que lo genérico. `bge-m3` tiene que mirarse antes que `bge`, porque
 * son 1024 y no los 768 de `bge-base`; con la tabla anterior caía al valor por
 * defecto y el almacén vectorial se quedaba esperando vectores de 768.
 */
const CATALOGO: { patron: string; dimension: number }[] = [
  { patron: 'bge-m3', dimension: 1024 },
  { patron: 'granite-embedding', dimension: 768 },
  { patron: 'bge-large', dimension: 1024 },
  { patron: 'bge-base', dimension: 768 },
  { patron: 'bge-small', dimension: 384 },
  { patron: 'multilingual-e5-large', dimension: 1024 },
  { patron: 'multilingual-e5-base', dimension: 768 },
  { patron: 'multilingual-e5-small', dimension: 384 },
  { patron: 'e5-large', dimension: 1024 },
  { patron: 'e5-base', dimension: 768 },
  { patron: 'e5-small', dimension: 384 },
  { patron: 'mxbai', dimension: 1024 },
  { patron: 'nomic', dimension: 768 },
  { patron: 'minilm', dimension: 384 },
  { patron: 'text-embedding-3-large', dimension: 3072 },
  { patron: 'text-embedding-3-small', dimension: 1536 },
  { patron: 'gemma', dimension: 3072 },
  { patron: 'llama', dimension: 4096 },
  { patron: 'mistral', dimension: 4096 },
]

/** El de por defecto si el nombre no está en el catálogo. */
export const DIMENSION_DESCONOCIDA = 768

export const MODELO_OLLAMA_POR_DEFECTO = 'bge-m3'

/** El modelo de Ollama con el que se indexa y se consulta. */
export function modeloEmbeddingsOllama(): string {
  return process.env.BOORIE_MODELO_EMBEDDINGS || MODELO_OLLAMA_POR_DEFECTO
}

/**
 * Cuántos números produce ese modelo, o `undefined` si no se sabe.
 *
 * Quien necesite un número para decidir usa `dimensionEsperada()`. La diferencia
 * importa al crear una colección: adivinar mal reserva el tamaño equivocado y el
 * fallo aparece después, al insertar, no aquí.
 */
export function dimensionDeModelo(nombre: string): number | undefined {
  const n = nombre.toLowerCase()
  return CATALOGO.find(e => n.includes(e.patron))?.dimension
}

/** La dimensión del modelo en uso, con `EMBEDDING_DIMENSION` por encima de todo. */
export function dimensionEsperada(): number {
  const puesta = process.env.EMBEDDING_DIMENSION
  if (puesta) {
    const n = parseInt(puesta)
    if (Number.isFinite(n) && n > 0) return n
  }
  return dimensionDeModelo(modeloEmbeddingsOllama()) ?? DIMENSION_DESCONOCIDA
}
