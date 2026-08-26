import { describe, it, expect, vi } from 'vitest'
import { importarRed, type DependenciasImportacion, type RedLeida } from './importarRed'

type Red = { name?: string; nodes?: unknown[]; links?: unknown[] }

const RED: RedLeida<Red> = {
  success: true,
  data: { name: 'Net1v3', nodes: [], links: [] },
  filePath: '/home/quien/redes/Net1v3.inp',
}

const deps = (parcial: Partial<DependenciasImportacion<Red>> = {}): DependenciasImportacion<Red> => ({
  elegirFichero: vi.fn().mockResolvedValue(RED),
  crearProyecto: vi.fn().mockResolvedValue({ id: 'p1' }),
  guardarRed: vi.fn().mockResolvedValue({ success: true }),
  ...parcial,
})

describe('importar una red desde la raíz de proyectos (#77)', () => {
  it('crea el proyecto, guarda la red y la devuelve para abrirla', async () => {
    const d = deps()
    const r = await importarRed(d)

    expect(r).toMatchObject({ estado: 'importada', proyectoId: 'p1', nombreFichero: 'Net1v3.inp' })
    expect(d.crearProyecto).toHaveBeenCalledWith('Net1v3', 'Red hidráulica importada desde Net1v3.inp')
    expect(d.guardarRed).toHaveBeenCalledWith({
      projectId: 'p1',
      networkData: RED.data,
      filePath: RED.filePath,
      filename: 'Net1v3.inp',
    })
  })

  it('cerrar el diálogo no es un error que enseñar', async () => {
    const d = deps({ elegirFichero: vi.fn().mockResolvedValue({ success: false, error: 'No file selected' }) })
    expect(await importarRed(d)).toEqual({ estado: 'cancelado' })
    expect(d.crearProyecto).not.toHaveBeenCalled()
  })

  it('sin respuesta del diálogo tampoco', async () => {
    expect(await importarRed(deps({ elegirFichero: vi.fn().mockResolvedValue(null) }))).toEqual({ estado: 'cancelado' })
  })

  it('un .inp que no se puede leer no deja un proyecto huérfano con su nombre', async () => {
    const d = deps({ elegirFichero: vi.fn().mockResolvedValue({ success: false, error: 'WNTR no está instalado' }) })
    const r = await importarRed(d)

    expect(r).toEqual({ estado: 'error', mensaje: 'WNTR no está instalado' })
    expect(d.crearProyecto).not.toHaveBeenCalled()
  })

  it('si el proyecto no se puede crear, lo dice en vez de seguir sin él', async () => {
    const d = deps({ crearProyecto: vi.fn().mockResolvedValue(null) })
    const r = await importarRed(d)

    expect(r).toMatchObject({ estado: 'error' })
    expect(d.guardarRed).not.toHaveBeenCalled()
  })

  it('si no se pudo guardar, la red se abre igual y el aviso sube aparte', async () => {
    const d = deps({ guardarRed: vi.fn().mockResolvedValue({ success: false, error: 'ya existe una red con ese nombre' }) })
    const r = await importarRed(d)

    expect(r).toMatchObject({ estado: 'importada', avisoAlGuardar: 'ya existe una red con ese nombre' })
  })

  it('el nombre sale del fichero, no del que la red trae dentro', async () => {
    const d = deps({
      elegirFichero: vi.fn().mockResolvedValue({
        success: true,
        data: { name: 'nombre interno del modelo' },
        filePath: 'C:\\Redes\\Sector Norte.inp',
      }),
    })
    await importarRed(d)

    expect(d.crearProyecto).toHaveBeenCalledWith('Sector Norte', expect.stringContaining('Sector Norte.inp'))
  })
})
