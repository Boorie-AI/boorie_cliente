/**
 * Instantáneas de un proyecto (#38).
 *
 * Responde a «¿cómo estaba este proyecto en la entrega de marzo?». Una
 * instantánea no copia nada: anota qué versión de cada red estaba vigente, y esas
 * versiones ya son inmutables. Por eso congelar un proyecto entero cuesta unas
 * pocas filas, y por eso la retención no puede podar una versión que una
 * instantánea sujete.
 */

import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Camera, Download, RotateCcw, Share2, Trash2 } from 'lucide-react'
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

interface RedEnSnapshot {
  networkId: string
  nombre: string
  versionId: string
  versionNumber: number
}

interface Snapshot {
  id: string
  label: string
  note?: string
  createdAt: string
  redes: RedEnSnapshot[]
}

interface InstantaneasProyectoProps {
  abierto: boolean
  onCerrar: () => void
  projectId: string
  nombreProyecto: string
  /** Se llama tras restaurar, para recargar lo que la vista tenga abierto. */
  onRestaurado?: () => void
}

export function InstantaneasProyecto({
  abierto,
  onCerrar,
  projectId,
  nombreProyecto,
  onRestaurado,
}: InstantaneasProyectoProps) {
  const { t } = useTranslation()
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [etiqueta, setEtiqueta] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<Snapshot | null>(null)
  const [importado, setImportado] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const r = await window.electronAPI.projectSnapshots.list(projectId)
      if (!r?.success) throw new Error(r?.error || 'No se pudieron leer las instantáneas')
      setSnapshots(r.data)
    } catch (e) {
      logger.error('Error leyendo instantáneas:', e)
      setError(e instanceof Error ? e.message : 'No se pudieron leer las instantáneas')
    } finally {
      setCargando(false)
    }
  }, [projectId])

  useEffect(() => {
    if (abierto) {
      setConfirmar(null)
      recargar()
    }
  }, [abierto, recargar])

  const crear = async () => {
    if (!etiqueta.trim()) return
    try {
      const r = await window.electronAPI.projectSnapshots.create({
        projectId,
        label: etiqueta.trim(),
      })
      if (!r?.success) throw new Error(r?.error || 'No se pudo crear la instantánea')
      setEtiqueta('')
      await recargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la instantánea')
    }
  }

  const restaurar = async (s: Snapshot) => {
    try {
      const r = await window.electronAPI.projectSnapshots.restore(s.id)
      if (!r?.success) throw new Error(r?.error || 'No se pudo restaurar')
      setConfirmar(null)
      onRestaurado?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo restaurar')
    }
  }

  const borrar = async (s: Snapshot) => {
    await window.electronAPI.projectSnapshots.delete(s.id)
    await recargar()
  }

  const exportar = async (s: Snapshot) => {
    const r = await window.electronAPI.projectSnapshots.exportar({
      snapshotId: s.id,
      nombre: `${nombreProyecto}-${s.label}`,
    })
    if (!r?.success && r?.error && !/cancelada/i.test(r.error)) setError(r.error)
  }

  const importar = async () => {
    setError(null)
    const r = await window.electronAPI.networkVersions.importar(projectId)
    if (!r?.success) {
      if (r?.error && !/cancelada/i.test(r.error)) setError(r.error)
      return
    }
    setImportado(r.data.resumen)
    await recargar()
    onRestaurado?.()
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
            <Camera className="h-4 w-4" />
            Instantáneas de {nombreProyecto}
          </DialogTitle>
          <DialogDescription>
            {t('snapshots.snapshotHint')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={etiqueta}
            onChange={e => setEtiqueta(e.target.value)}
            placeholder={t('snapshots.nameHint')}
            onKeyDown={e => { if (e.key === 'Enter') crear() }}
          />
          <Button size="sm" onClick={crear} disabled={!etiqueta.trim()} className="shrink-0">
            <Camera className="mr-2 h-3.5 w-3.5" />
            {t('snapshots.create')}
          </Button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {t('snapshots.packageHint')}
          </p>
          <Button variant="outline" size="sm" className="shrink-0" onClick={importar}>
            <Download className="mr-2 h-3.5 w-3.5" />
            {t('snapshots.import')}
          </Button>
        </div>

        {importado && (
          <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs">{importado}</p>
        )}

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="max-h-96 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {cargando && <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('snapshots.loading')}</p>}

          {!cargando && snapshots.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t('snapshots.empty')}
            </p>
          )}

          {snapshots.map(s => (
            <div key={s.id} className="px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {fecha(s.createdAt)} · {s.redes.length}{' '}
                    {s.redes.length === 1 ? 'red' : 'redes'}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {s.redes.map(r => (
                      <li key={r.versionId} className="text-xs text-muted-foreground">
                        {r.nombre} — {t('snapshots.versionOf', { numero: r.versionNumber })}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={t('snapshots.export')}
                    onClick={() => exportar(s)}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={t('snapshots.restoreHint')}
                    onClick={() => setConfirmar(s)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-red-500"
                    title={t('snapshots.delete')}
                    onClick={() => borrar(s)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {confirmar && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p>
                {t('snapshots.restoreAll', { count: confirmar.redes.length, etiqueta: confirmar.label })}
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => restaurar(confirmar)}>
                  {t('snapshots.restore')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmar(null)}>
                  {t('snapshots.cancel')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
