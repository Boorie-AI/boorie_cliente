import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'

const showOpenDialog = vi.fn()
const showSaveDialog = vi.fn()
vi.mock('electron', () => ({ dialog: { showOpenDialog: (...a: unknown[]) => showOpenDialog(...a), showSaveDialog: (...a: unknown[]) => showSaveDialog(...a) } }))

let modulo: typeof import('./dialogosArchivo')
beforeEach(async () => {
  vi.resetModules()
  showOpenDialog.mockReset()
  showSaveDialog.mockReset()
  modulo = await import('./dialogosArchivo')
})

const redes = path.resolve('/datos/redes')

describe('diálogos con la última carpeta (#307)', () => {
  it('el primero deja la ruta como venga; el siguiente abre donde se eligió el anterior', async () => {
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [path.join(redes, 'a.inp')] })
    await modulo.elegirParaAbrir({ properties: ['openFile'] })
    expect(showOpenDialog.mock.calls[0][0].defaultPath).toBeUndefined()

    await modulo.elegirParaAbrir({ properties: ['openFile'] })
    expect(showOpenDialog.mock.calls[1][0].defaultPath).toBe(redes)
  })

  it('un nombre de fichero sugerido se guarda en la última carpeta; una ruta absoluta se respeta', async () => {
    modulo.recordarCarpeta(path.join(redes, 'a.inp'), false)
    expect(modulo.rutaInicial('red.inp')).toBe(path.join(redes, 'red.inp'))
    const absoluta = path.resolve('/otra/red.inp')
    expect(modulo.rutaInicial(absoluta)).toBe(absoluta)
  })

  it('al elegir una carpeta se recuerda la carpeta misma, y cancelar no cambia nada', async () => {
    showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [redes] })
    await modulo.elegirParaAbrir({ properties: ['openDirectory'] })
    showSaveDialog.mockResolvedValueOnce({ canceled: true, filePath: '' })
    await modulo.elegirParaGuardar({ defaultPath: 'x.json' })
    expect(showSaveDialog.mock.calls[0][0].defaultPath).toBe(path.join(redes, 'x.json'))
    expect(modulo.rutaInicial()).toBe(redes)
  })

  it('con ventana, el diálogo se abre sobre ella', async () => {
    const ventana = {} as never
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    await modulo.elegirParaAbrir({ properties: ['openFile'] }, ventana)
    expect(showOpenDialog.mock.calls[0][0]).toBe(ventana)
  })
})
