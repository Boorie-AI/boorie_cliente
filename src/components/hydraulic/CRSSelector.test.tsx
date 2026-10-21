import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CRSSelector } from './CRSSelector'

/**
 * En el ámbito del proyecto no guarda el selector sino quien lo abre (el visor
 * del mapa), así que un fallo al guardar tiene que volver hasta aquí: si no, la
 * ventana se cerraba y el ingeniero creía guardado un sistema que no lo estaba.
 */
describe('el selector de sistema del proyecto', () => {
  const abrir = (onDeclarado: (epsg: string | null) => void | Promise<void>, onCerrar = vi.fn()) => {
    render(
      <CRSSelector abierto ambito="proyecto" pais={null} limites={null}
        epsgActual="EPSG:32717" onCerrar={onCerrar} onDeclarado={onDeclarado} />
    )
    return onCerrar
  }

  it('si guardar falla, enseña el error y no se cierra', async () => {
    const onCerrar = abrir(() => Promise.reject(new Error('No se pudo guardar el sistema del proyecto.')))

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

    expect(await screen.findByText('No se pudo guardar el sistema del proyecto.')).toBeInTheDocument()
    expect(onCerrar).not.toHaveBeenCalled()
  })

  it('si guarda, se cierra', async () => {
    const onDeclarado = vi.fn().mockResolvedValue(undefined)
    const onCerrar = abrir(onDeclarado)

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

    await waitFor(() => expect(onCerrar).toHaveBeenCalled())
    expect(onDeclarado).toHaveBeenCalledWith('EPSG:32717')
  })

  // Los husos UTM no salen en la lista sin búsqueda; el elegido sí, o al volver
  // a abrir no se veía qué estaba seleccionado.
  it('al abrirlo, el sistema elegido está a la vista aunque sea un huso UTM', () => {
    abrir(vi.fn())

    expect(screen.getByText('EPSG:32717')).toBeInTheDocument()
  })

  it('con el país elegido, sus husos UTM salen primero', () => {
    render(
      <CRSSelector abierto ambito="proyecto" pais="Ecuador" limites={null}
        epsgActual={null} onCerrar={vi.fn()} onDeclarado={vi.fn()} />
    )

    const primeros = screen.getAllByRole('button').map(b => b.textContent).filter(t => t?.startsWith('EPSG:')).slice(0, 2)
    expect(primeros[0]).toMatch(/^EPSG:32715/)
    expect(primeros[1]).toMatch(/^EPSG:32716/)
  })
})
