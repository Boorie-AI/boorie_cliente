import { describe, it, expect, vi, beforeEach } from 'vitest'
import { migrateProjectAssets, CLAVE_OVERLAY, CLAVE_MARCADOR } from './migrateProjectAssets'

const save = vi.fn()
const saveCalculation = vi.fn()
const getProject = vi.fn()

const red = (name: string, filePath?: string) => ({
  id: `net_${name}`, name, filePath,
  uploadDate: '2026-07-01T00:00:00.000Z', nodeCount: 5, linkCount: 6, data: { name, summary: {} },
})

const calculo = (name: string) => ({
  id: `calc_${name}`, name, date: '2026-07-01T00:00:00.000Z',
  status: 'completed', networkId: 'net_x', results: { ok: true },
})

describe('migrateProjectAssets', () => {
  beforeEach(() => {
    save.mockReset(); saveCalculation.mockReset(); getProject.mockReset()
    localStorage.clear()
    Object.defineProperty(window, 'electronAPI', {
      value: { networkRepository: { save }, hydraulic: { saveCalculation, getProject } },
      writable: true,
    })
    getProject.mockResolvedValue({ success: true, data: { id: 'p1' } })
    save.mockResolvedValue({ success: true, data: { id: 'n1', hasFileContent: true } })
    saveCalculation.mockResolvedValue({ success: true })
  })

  it('no hace nada si no hay overlay', async () => {
    const r = await migrateProjectAssets()
    expect(r.ejecutada).toBe(false)
    expect(r.motivo).toBe('sin-datos')
    expect(save).not.toHaveBeenCalled()
  })

  it('migra redes y cálculos de cada proyecto', async () => {
    localStorage.setItem(CLAVE_OVERLAY, JSON.stringify({
      p1: { networks: [red('A', '/ruta/A.inp'), red('B', '/ruta/B.inp')], calculations: [calculo('c1')] },
    }))

    const r = await migrateProjectAssets()

    expect(r.ejecutada).toBe(true)
    expect(r.redesMigradas).toBe(2)
    expect(r.calculosMigrados).toBe(1)
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'p1', filePath: '/ruta/A.inp', filename: 'A.inp', allowMissingFile: true,
    }))
  })

  // La regla que no se negocia: los datos originales se quedan donde están.
  it('NUNCA borra la clave original', async () => {
    const contenido = JSON.stringify({ p1: { networks: [red('A', '/ruta/A.inp')] } })
    localStorage.setItem(CLAVE_OVERLAY, contenido)

    await migrateProjectAssets()

    expect(localStorage.getItem(CLAVE_OVERLAY)).toBe(contenido)
  })

  it('no vuelve a migrar si ya existe el marcador', async () => {
    localStorage.setItem(CLAVE_OVERLAY, JSON.stringify({ p1: { networks: [red('A', '/r/A.inp')] } }))
    localStorage.setItem(CLAVE_MARCADOR, JSON.stringify({ at: 'antes' }))

    const r = await migrateProjectAssets()

    expect(r.motivo).toBe('ya-migrada')
    expect(save).not.toHaveBeenCalled()
  })

  it('marca como incompleta la red cuyo .inp ya no existe, pero la migra', async () => {
    save.mockResolvedValue({ success: true, data: { id: 'n1', hasFileContent: false } })
    localStorage.setItem(CLAVE_OVERLAY, JSON.stringify({
      p1: { networks: [red('Perdida', '/ruta/borrada.inp')] },
    }))

    const r = await migrateProjectAssets()

    expect(r.redesMigradas).toBe(1)
    expect(r.redesIncompletas).toEqual([
      { proyecto: 'p1', red: 'Perdida', ruta: '/ruta/borrada.inp' },
    ])
  })

  it('registra las redes que fallan sin abortar el resto', async () => {
    save
      .mockResolvedValueOnce({ success: false, error: 'nombre duplicado' })
      .mockResolvedValueOnce({ success: true, data: { id: 'n2', hasFileContent: true } })
    localStorage.setItem(CLAVE_OVERLAY, JSON.stringify({
      p1: { networks: [red('A', '/r/A.inp'), red('B', '/r/B.inp')] },
    }))

    const r = await migrateProjectAssets()

    expect(r.redesMigradas).toBe(1)
    expect(r.redesFallidas).toEqual([{ proyecto: 'p1', red: 'A', error: 'nombre duplicado' }])
  })

  // Un proyecto borrado no puede recibir sus redes: la clave ajena lo rechazaría.
  it('salta los proyectos que ya no existen y deja sus datos en el respaldo', async () => {
    getProject.mockImplementation((id: string) =>
      Promise.resolve(id === 'vivo' ? { success: true, data: { id } } : { success: false }))
    localStorage.setItem(CLAVE_OVERLAY, JSON.stringify({
      vivo: { networks: [red('A', '/r/A.inp')] },
      borrado: { networks: [red('B', '/r/B.inp')] },
    }))

    const r = await migrateProjectAssets()

    expect(r.redesMigradas).toBe(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(CLAVE_OVERLAY)).toContain('borrado')
  })

  it('marca aunque el overlay esté vacío, para no comprobarlo en cada arranque', async () => {
    localStorage.setItem(CLAVE_OVERLAY, JSON.stringify({ p1: { networks: [], calculations: [] } }))

    const r = await migrateProjectAssets()

    expect(r.ejecutada).toBe(false)
    expect(localStorage.getItem(CLAVE_MARCADOR)).toBeTruthy()
  })

  // React.StrictMode invoca los efectos dos veces en desarrollo: sin guarda, dos
  // llamadas simultaneas duplicaban el volcado, porque el marcador solo se escribe
  // al terminar.
  it('dos llamadas simultáneas comparten una sola ejecución', async () => {
    localStorage.setItem(CLAVE_OVERLAY, JSON.stringify({
      p1: { networks: [red('A', '/r/A.inp'), red('B', '/r/B.inp')] },
    }))

    const [r1, r2] = await Promise.all([migrateProjectAssets(), migrateProjectAssets()])

    expect(save).toHaveBeenCalledTimes(2)
    expect(r1).toBe(r2)
    expect(r1.redesMigradas).toBe(2)
  })

  it('no revienta ni marca si el overlay no es JSON válido', async () => {
    localStorage.setItem(CLAVE_OVERLAY, '{esto no es json')

    const r = await migrateProjectAssets()

    expect(r.ejecutada).toBe(false)
    expect(localStorage.getItem(CLAVE_MARCADOR)).toBeNull()
    expect(localStorage.getItem(CLAVE_OVERLAY)).toBe('{esto no es json')
  })

  // Reintentar en cada arranque duplicaría lo ya migrado.
  it('marca aunque haya fallos, dejando el detalle en el informe', async () => {
    save.mockResolvedValue({ success: false, error: 'boom' })
    localStorage.setItem(CLAVE_OVERLAY, JSON.stringify({ p1: { networks: [red('A', '/r/A.inp')] } }))

    await migrateProjectAssets()

    const marcador = JSON.parse(localStorage.getItem(CLAVE_MARCADOR) || '{}')
    expect(marcador.informe.redesFallidas).toHaveLength(1)
  })
})
