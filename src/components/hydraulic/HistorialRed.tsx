/**
 * Historial de versiones de una red (#38).
 *
 * Responde a «¿cómo estaba esta red en marzo?» y permite volver. Las versiones
 * son inmutables: aquí se añaden, se marcan como hito y se restauran, pero
 * ninguna acción reescribe una existente.
 */

import { useCallback, useEffect, useState } from 'react'
import { Activity, AlertTriangle, GitCompare, History, RotateCcw, Star, Plus } from 'lucide-react'
import { logger } from '@/utils/logger'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/utils/cn'

interface Version {
  id: string
  versionNumber: number
  changeNote?: string
  origen: 'manual' | 'importacion' | 'escenario' | 'migracion'
  marcada: boolean
  createdAt: string
  simulaciones: number
}

const ORIGEN: Record<Version['origen'], string> = {
  manual: 'Guardada a mano',
  importacion: 'Importación',
  escenario: 'Escenario',
  migracion: 'Estado inicial',
}

interface Simulacion {
  id: string
  versionNumber: number
  tipo: string
  createdAt: string
}

interface HistorialRedProps {
  abierto: boolean
  onCerrar: () => void
  networkId: string
  nombreRed: string
  /** Se llama tras restaurar, para que la vista recargue la red. */
  onRestaurada?: () => void
}

export function HistorialRed({
  abierto,
  onCerrar,
  networkId,
  nombreRed,
  onRestaurada,
}: HistorialRedProps) {
  const [versiones, setVersiones] = useState<Version[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nota, setNota] = useState('')
  const [comparacion, setComparacion] = useState<{ contra: number; resumen: string } | null>(null)
  const [confirmarRestaurar, setConfirmarRestaurar] = useState<Version | null>(null)
  const [simulaciones, setSimulaciones] = useState<Simulacion[]>([])
  /** Las dos ejecuciones elegidas para comparar. */
  const [elegidas, setElegidas] = useState<string[]>([])
  const [comparaSims, setComparaSims] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [r, rs] = await Promise.all([
        window.electronAPI.networkVersions.list(networkId),
        window.electronAPI.networkVersions.simulations(networkId),
      ])
      if (!r?.success) throw new Error(r?.error || 'No se pudo leer el historial')
      setVersiones(r.data)
      if (rs?.success) setSimulaciones(rs.data)
    } catch (e) {
      logger.error('Error leyendo el historial de versiones:', e)
      setError(e instanceof Error ? e.message : 'No se pudo leer el historial')
    } finally {
      setCargando(false)
    }
  }, [networkId])

  useEffect(() => {
    if (abierto) {
      setComparacion(null)
      setConfirmarRestaurar(null)
      setElegidas([])
      setComparaSims(null)
      recargar()
    }
  }, [abierto, recargar])

  const guardarVersion = async () => {
    try {
      const r = await window.electronAPI.networkVersions.create({
        networkId,
        changeNote: nota.trim() || undefined,
      })
      if (!r?.success) throw new Error(r?.error || 'No se pudo guardar la versión')
      setNota('')
      await recargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la versión')
    }
  }

  const alternarHito = async (v: Version) => {
    await window.electronAPI.networkVersions.mark({ versionId: v.id, marcada: !v.marcada })
    await recargar()
  }

  const restaurar = async (v: Version) => {
    try {
      const r = await window.electronAPI.networkVersions.restore(v.id)
      if (!r?.success) throw new Error(r?.error || 'No se pudo restaurar')
      setConfirmarRestaurar(null)
      await recargar()
      onRestaurada?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo restaurar')
    }
  }

  /** Compara una versión con la inmediatamente anterior. */
  const compararConAnterior = async (v: Version) => {
    const anterior = versiones.find(x => x.versionNumber === v.versionNumber - 1)
    if (!anterior) return
    try {
      const r = await window.electronAPI.networkVersions.compare({
        versionA: anterior.id,
        versionB: v.id,
      })
      if (!r?.success) throw new Error(r?.error || 'No se pudo comparar')
      setComparacion({ contra: v.versionNumber, resumen: r.data.resumen })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo comparar')
    }
  }

  /** Se eligen dos: al marcar una tercera, se descarta la más antigua. */
  const alternarEleccion = (id: string) => {
    setComparaSims(null)
    setElegidas(previas =>
      previas.includes(id) ? previas.filter(x => x !== id) : [...previas, id].slice(-2)
    )
  }

  const compararEjecuciones = async () => {
    if (elegidas.length !== 2) return
    try {
      const r = await window.electronAPI.networkVersions.compareSimulations({
        runA: elegidas[0],
        runB: elegidas[1],
      })
      if (!r?.success) throw new Error(r?.error || 'No se pudieron comparar')
      setComparaSims(r.data.resumen)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron comparar')
    }
  }

  const fecha = (iso: string) =>
    new Date(iso).toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })

  return (
    <Dialog open={abierto} onOpenChange={v => !v && onCerrar()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Historial de {nombreRed}
          </DialogTitle>
          <DialogDescription>
            Cada versión es un escenario distinto de la red de la cual precede. No se modifican
            nunca: se añaden, se marcan como hito y se pueden restaurar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={nota}
            onChange={e => setNota(e.target.value)}
            placeholder="Qué cambió, para reconocerla después"
            onKeyDown={e => { if (e.key === 'Enter') guardarVersion() }}
          />
          <Button size="sm" onClick={guardarVersion} className="shrink-0">
            <Plus className="mr-2 h-3.5 w-3.5" />
            Guardar versión
          </Button>
        </div>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="max-h-96 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {cargando && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Cargando…</p>}

          {!cargando && versiones.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Esta red todavía no tiene versiones guardadas.
            </p>
          )}

          {versiones.map(v => (
            <div key={v.id} className="px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">Versión {v.versionNumber}</span>
                    {v.marcada && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-500">
                        hito
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{ORIGEN[v.origen]}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {fecha(v.createdAt)}
                    {v.simulaciones > 0 &&
                      ` · ${v.simulaciones} ${v.simulaciones === 1 ? 'simulación' : 'simulaciones'}`}
                  </p>
                  {v.changeNote && <p className="mt-1 text-xs">{v.changeNote}</p>}
                  {comparacion?.contra === v.versionNumber && (
                    <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                      Frente a la versión {v.versionNumber - 1}: {comparacion.resumen}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={v.marcada ? 'Quitar el hito' : 'Marcar como hito (nunca se poda)'}
                    onClick={() => alternarHito(v)}
                  >
                    <Star className={cn('h-3.5 w-3.5', v.marcada && 'fill-amber-500 text-amber-500')} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={!versiones.some(x => x.versionNumber === v.versionNumber - 1)}
                    title="Comparar con la versión anterior"
                    onClick={() => compararConAnterior(v)}
                  >
                    <GitCompare className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Restaurar esta versión"
                    onClick={() => setConfirmarRestaurar(v)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {simulaciones.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <Activity className="h-3.5 w-3.5" />
                Simulaciones sobre esta red
              </h3>
              <Button
                size="sm"
                variant="outline"
                disabled={elegidas.length !== 2}
                onClick={compararEjecuciones}
              >
                Comparar las dos elegidas
              </Button>
            </div>

            <div className="max-h-40 divide-y divide-border overflow-y-auto rounded-md border border-border">
              {simulaciones.map(sim => (
                <button
                  key={sim.id}
                  onClick={() => alternarEleccion(sim.id)}
                  className={cn(
                    'flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-muted',
                    elegidas.includes(sim.id) && 'bg-primary/10'
                  )}
                >
                  <span>
                    {sim.tipo}
                    <span className="ml-2 text-muted-foreground">versión {sim.versionNumber}</span>
                  </span>
                  <span className="text-muted-foreground">{fecha(sim.createdAt)}</span>
                </button>
              ))}
            </div>

            {comparaSims && (
              <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs">
                {comparaSims}
              </p>
            )}
          </div>
        )}

        {confirmarRestaurar && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p>
                La red volverá a como estaba en la versión {confirmarRestaurar.versionNumber}. El
                estado actual no se pierde: se guarda antes como una versión nueva.
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => restaurar(confirmarRestaurar)}>
                  Restaurar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmarRestaurar(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
