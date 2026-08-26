/**
 * Importar una red `.inp` desde la raíz de proyectos (#77).
 *
 * El botón de importar no importaba nada: comprobaba Python y WNTR, creaba un
 * proyecto **vacío** y despedía al usuario con un aviso —«ahora abra el proyecto
 * y use Cargar Red Hidráulica»— que obligaba a volver a elegir el mismo fichero.
 * Media importación y dos diálogos para una sola intención.
 *
 * El orden aquí no es casual: primero se lee la red y sólo si se pudo leer se
 * crea el proyecto. Al revés, un `.inp` ilegible dejaba un proyecto huérfano en
 * la lista con el nombre del fichero que nunca llegó a entrar.
 *
 * Los colaboradores se inyectan porque los tres son efectos —diálogo del sistema,
 * base de datos, disco— y esto tiene que poder probarse sin ninguno.
 */

/**
 * La red va como parámetro de tipo porque cada visor tiene su propia
 * declaración de `NetworkData` —deuda anterior— y este módulo no tiene por qué
 * elegir una: sólo necesita el nombre para bautizar el proyecto.
 */
export interface RedLeida<T extends { name?: string } = { name?: string }> {
  success?: boolean
  error?: string
  data?: T
  filePath?: string
}

export interface DependenciasImportacion<T extends { name?: string }> {
  /** Abre el diálogo del proceso principal, valida Python/WNTR y parsea el .inp. */
  elegirFichero: () => Promise<RedLeida<T> | null>
  crearProyecto: (nombre: string, descripcion: string) => Promise<{ id: string } | null>
  guardarRed: (datos: {
    projectId: string
    networkData: T
    filePath?: string
    filename: string
  }) => Promise<{ success?: boolean; error?: string } | null>
}

export type ResultadoImportacion<T> =
  /** El usuario cerró el diálogo: no hay nada que importar ni nada que avisar. */
  | { estado: 'cancelado' }
  | { estado: 'error'; mensaje: string }
  | {
      estado: 'importada'
      proyectoId: string
      nombreFichero: string
      red: T
      filePath?: string
      /** La red se abre igual aunque no se haya podido guardar; el aviso sube aparte. */
      avisoAlGuardar?: string
    }

/** El proceso principal devuelve la cancelación del diálogo como si fuera un error. */
const CANCELADO = 'No file selected'

export async function importarRed<T extends { name?: string }>(
  deps: DependenciasImportacion<T>
): Promise<ResultadoImportacion<T>> {
  const leida = await deps.elegirFichero()
  if (!leida || leida.error === CANCELADO) return { estado: 'cancelado' }
  if (!leida.success || !leida.data) {
    return { estado: 'error', mensaje: leida.error || 'No se pudo leer el fichero de red' }
  }

  const nombreFichero = leida.filePath?.split(/[\\/]/).pop() || `${leida.data.name ?? 'red'}.inp`
  const proyecto = await deps.crearProyecto(
    nombreFichero.replace(/\.inp$/i, ''),
    `Red hidráulica importada desde ${nombreFichero}`
  )
  if (!proyecto) {
    return { estado: 'error', mensaje: 'No se pudo crear el proyecto para la red importada' }
  }

  const guardada = await deps.guardarRed({
    projectId: proyecto.id,
    networkData: leida.data,
    filePath: leida.filePath,
    filename: nombreFichero,
  })

  return {
    estado: 'importada',
    proyectoId: proyecto.id,
    nombreFichero,
    red: leida.data,
    filePath: leida.filePath,
    avisoAlGuardar: guardada?.success ? undefined : (guardada?.error || 'No se pudo guardar la red en el proyecto'),
  }
}
