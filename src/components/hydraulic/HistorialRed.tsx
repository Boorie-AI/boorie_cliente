/**
 * Historial de versiones de una red (#38).
 *
 * Responde a «¿cómo estaba esta red en marzo?» y permite volver. Las versiones
 * son inmutables: aquí se añaden, se marcan como hito y se restauran, pero
 * ninguna acción reescribe una existente.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Activity, AlertTriangle, GitCompare, History, RotateCcw, Share2, Star, Plus, BrainCircuit, RefreshCw } from 'lucide-react'
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

interface Simulacion {
  id: string
  versionNumber: number
  tipo: string
  createdAt: string
  /** Cómo va su indexación en el RAG del proyecto (#41). */
  estadoIndexacion?: EstadoIndexacion
  errorIndexacion?: string | null
}

type EstadoIndexacion = 'pendiente' | 'indexando' | 'indexada' | 'fallida' | 'omitida'

/**
 * Cómo se cuenta el estado de la indexación.
 *
 * Se dice también cuando va bien: el criterio del issue es que un fallo se
 * comunique, y un indicador que sólo aparece al fallar no se entiende cuando
 * aparece —no hay con qué compararlo—, así que el estado normal también se ve.
 */
/** El texto vive en los ficheros de idioma; aquí sólo el color. */
const COLOR_INDEXACION: Record<EstadoIndexacion, string> = {
  pendiente: 'text-muted-foreground',
  indexando: 'text-muted-foreground',
  indexada: 'text-emerald-600',
  fallida: 'text-amber-600',
  omitida: 'text-muted-foreground',
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
  const { t, i18n } = useTranslation()
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
  /** Ejecución que se está reindexando ahora, para deshabilitar su botón. */
  const [reindexando, setReindexando] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [r, rs] = await Promise.all([
        window.electronAPI.networkVersions.list(networkId),
        window.electronAPI.networkVersions.simulations(networkId),
      ])
      if (!r?.success) throw new Error(r?.error || t('networkHistory.errors.read'))
      setVersiones(r.data)
      if (rs?.success) setSimulaciones(rs.data)
    } catch (e) {
      logger.error('Error leyendo el historial de versiones:', e)
      setError(e instanceof Error ? e.message : t('networkHistory.errors.read'))
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
      if (!r?.success) throw new Error(r?.error || t('networkHistory.errors.save'))
      setNota('')
      await recargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('networkHistory.errors.save'))
    }
  }

  const alternarHito = async (v: Version) => {
    await window.electronAPI.networkVersions.mark({ versionId: v.id, marcada: !v.marcada })
    await recargar()
  }

  const restaurar = async (v: Version) => {
    try {
      const r = await window.electronAPI.networkVersions.restore(v.id)
      if (!r?.success) throw new Error(r?.error || t('networkHistory.errors.restore'))
      setConfirmarRestaurar(null)
      await recargar()
      onRestaurada?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('networkHistory.errors.restore'))
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
      if (!r?.success) throw new Error(r?.error || t('networkHistory.errors.compare'))
      setComparacion({ contra: v.versionNumber, resumen: r.data.resumen })
    } catch (e) {
      setError(e instanceof Error ? e.message : t('networkHistory.errors.compare'))
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
      if (!r?.success) throw new Error(r?.error || t('networkHistory.errors.compareRuns'))
      setComparaSims(r.data.resumen)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('networkHistory.errors.compareRuns'))
    }
  }

  /** Reintento manual de la indexación, que ignora el ajuste de automática. */
  const reindexar = async (sim: Simulacion) => {
    setReindexando(sim.id)
    try {
      const r = await window.electronAPI.simulacionRAG.reindexar(sim.id)
      if (!r?.success) throw new Error(r?.error || t('networkHistory.errors.index'))
      await recargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('networkHistory.errors.index'))
    } finally {
      setReindexando(null)
    }
  }

  const exportar = async (v: Version) => {
    try {
      const r = await window.electronAPI.networkVersions.exportar({
        versionId: v.id,
        nombre: `${nombreRed}-v${v.versionNumber}`,
      })
      // Cancelar el diálogo de guardado no es un error que haya que enseñar.
      if (!r?.success && r?.error && !/cancelada/i.test(r.error)) throw new Error(r.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('networkHistory.errors.export'))
    }
  }

  const fecha = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })

  return (
    <Dialog open={abierto} onOpenChange={v => !v && onCerrar()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            {t('networkHistory.title', { network: nombreRed })}
          </DialogTitle>
          <DialogDescription>
            {t('networkHistory.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={nota}
            onChange={e => setNota(e.target.value)}
            placeholder={t('networkHistory.notePlaceholder')}
            onKeyDown={e => { if (e.key === 'Enter') guardarVersion() }}
          />
          <Button size="sm" onClick={guardarVersion} className="shrink-0">
            <Plus className="mr-2 h-3.5 w-3.5" />
            {t('networkHistory.saveVersion')}
          </Button>
        </div>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="max-h-96 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {cargando && <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('common.loading')}</p>}

          {!cargando && versiones.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t('networkHistory.empty')}
            </p>
          )}

          {versiones.map(v => (
            <div key={v.id} className="px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{t('networkHistory.version', { number: v.versionNumber })}</span>
                    {v.marcada && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-500">
                        {t('networkHistory.milestone')}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{t(`networkHistory.origin.${v.origen}`)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {fecha(v.createdAt)}
                    {v.simulaciones > 0 &&
                      ` · ${t(v.simulaciones === 1 ? 'networkHistory.simulationOne' : 'networkHistory.simulationOther', { count: v.simulaciones })}`}
                  </p>
                  {v.changeNote && <p className="mt-1 text-xs">{v.changeNote}</p>}
                  {comparacion?.contra === v.versionNumber && (
                    <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                      {t('networkHistory.comparedWith', { number: v.versionNumber - 1, summary: comparacion.resumen })}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={v.marcada ? t('networkHistory.unmarkMilestone') : t('networkHistory.markMilestone')}
                    onClick={() => alternarHito(v)}
                  >
                    <Star className={cn('h-3.5 w-3.5', v.marcada && 'fill-amber-500 text-amber-500')} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={!versiones.some(x => x.versionNumber === v.versionNumber - 1)}
                    title={t('networkHistory.compareWithPrevious')}
                    onClick={() => compararConAnterior(v)}
                  >
                    <GitCompare className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={t('networkHistory.exportVersion')}
                    onClick={() => exportar(v)}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={t('networkHistory.restoreVersion')}
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
                {t('networkHistory.simulationsOnNetwork')}
              </h3>
              <Button
                size="sm"
                variant="outline"
                disabled={elegidas.length !== 2}
                onClick={compararEjecuciones}
              >
                {t('networkHistory.compareChosen')}
              </Button>
            </div>

            <div className="max-h-40 divide-y divide-border overflow-y-auto rounded-md border border-border">
              {simulaciones.map(sim => {
                const estado = sim.estadoIndexacion ?? 'pendiente'
                const reintentable = sim.estadoIndexacion === 'fallida' || sim.estadoIndexacion === 'pendiente' || sim.estadoIndexacion === 'omitida'

                return (
                  <div
                    key={sim.id}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-xs',
                      elegidas.includes(sim.id) && 'bg-primary/10'
                    )}
                  >
                    <button
                      onClick={() => alternarEleccion(sim.id)}
                      className="flex min-w-0 flex-1 items-center justify-between text-left hover:opacity-80"
                    >
                      <span className="truncate">
                        {sim.tipo}
                        <span className="ml-2 text-muted-foreground">{t('networkHistory.versionInline', { number: sim.versionNumber })}</span>
                      </span>
                      <span className="ml-2 shrink-0 text-muted-foreground">{fecha(sim.createdAt)}</span>
                    </button>

                    <span
                      className={cn('flex shrink-0 items-center gap-1', COLOR_INDEXACION[estado])}
                      title={sim.errorIndexacion ?? undefined}
                    >
                      <BrainCircuit className="h-3 w-3" />
                      {t(`networkHistory.indexing.${estado}`)}
                    </span>

                    {reintentable && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 shrink-0 px-1.5"
                        disabled={reindexando === sim.id}
                        onClick={() => reindexar(sim)}
                        title={t('networkHistory.indexNow')}
                      >
                        <RefreshCw className={cn('h-3 w-3', reindexando === sim.id && 'animate-spin')} />
                      </Button>
                    )}
                  </div>
                )
              })}
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
                {t('networkHistory.restoreWarning', { number: confirmarRestaurar.versionNumber })}
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => restaurar(confirmarRestaurar)}>
                  {t('networkHistory.restore')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmarRestaurar(null)}>
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
