/**
 * Cómo se abre la base SQLite para que una pregunta no se pierda al guardarla.
 *
 * La base venía en el modo de diario clásico (`journal_mode=delete`), en el
 * que mientras dura una lectura nadie puede escribir. La búsqueda recorre
 * `hydraulic_knowledge` —sin índices, dentro de un fichero de 3,8 GB— y el
 * `INSERT` de la pregunta, que con un libro adjunto lleva 300 KB de metadata,
 * esperaba los 5 s de Prisma y fallaba con P1008: la pregunta se veía en
 * pantalla y no quedaba guardada. Pasó tres veces en una tarde.
 *
 * En WAL las lecturas no bloquean las escrituras. El modo queda grabado en el
 * fichero; junto a él aparecen `-wal` y `-shm`, y SQLite los vuelca y borra al
 * cerrar la última conexión. Una copia de la base con la aplicación abierta,
 * o tras un cierre brusco, tiene que llevarse también el `-wal`.
 */

/** Lo que Prisma espera a que SQLite quede libre, en segundos; por defecto, 5. */
const ESPERA_SEGUNDOS = 20

/** La URL con la espera, si es de SQLite y no la trae ya. */
export function urlConEspera(url: string): string {
  if (!url.startsWith('file:') || /[?&]socket_timeout=/.test(url)) return url
  return `${url}${url.includes('?') ? '&' : '?'}socket_timeout=${ESPERA_SEGUNDOS}`
}

interface ClienteConSQL {
  $queryRawUnsafe: (sql: string) => Promise<unknown>
}

/** Pone la base en WAL y devuelve el modo en que queda; si no se puede, sigue como estaba. */
export async function activarWAL(cliente: ClienteConSQL, url: string): Promise<string | null> {
  if (!url.startsWith('file:')) return null
  try {
    const filas = await cliente.$queryRawUnsafe('PRAGMA journal_mode=WAL') as Array<Record<string, unknown>>
    const modo = filas?.[0] ? String(Object.values(filas[0])[0]) : null
    return modo
  } catch (error) {
    console.warn('[baseSqlite] No se pudo poner la base en WAL; sigue en su modo:', error)
    return null
  }
}
