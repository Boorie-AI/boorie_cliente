/**
 * Instantáneas de un proyecto (#38).
 *
 * Responde a «¿cómo estaba este proyecto en la entrega de marzo?». Una
 * instantánea no copia nada: anota qué versión de cada red estaba vigente, y esas
 * versiones ya son inmutables. Por eso congelar un proyecto entero cuesta unas
 * pocas filas, y por eso la retención no puede podar una versión que una
 * instantánea sujete.
 */

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Camera, RotateCcw, Trash2 } from 'lucide-react'
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
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [etiqueta, setEtiqueta] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<Snapshot | null>(null)

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
            Una instantánea anota qué versión de cada red estaba vigente. Sirve para volver al
            estado completo de una entrega, y sujeta esas versiones para que la retención no las
            pode.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={etiqueta}
            onChange={e => setEtiqueta(e.target.value)}
            placeholder="Cómo la reconocerás: «Entrega de marzo»"
            onKeyDown={e => { if (e.key === 'Enter') crear() }}
          />
          <Button size="sm" onClick={crear} disabled={!etiqueta.trim()} className="shrink-0">
            <Camera className="mr-2 h-3.5 w-3.5" />
            Congelar el proyecto
          </Button>
        </div>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="max-h-96 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {cargando && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Cargando…</p>}

          {!cargando && snapshots.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Este proyecto todavía no tiene instantáneas.
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
                        {r.nombre} — versión {r.versionNumber}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Devolver el proyecto a este estado"
                    onClick={() => setConfirmar(s)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-red-500"
                    title="Borrar la instantánea (no borra las versiones)"
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
                Las {confirmar.redes.length} redes del proyecto volverán a como estaban en «
                {confirmar.label}». El estado actual de cada una se guarda antes como una versión
                nueva, así que no se pierde.
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => restaurar(confirmar)}>
                  Restaurar el proyecto
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmar(null)}>
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
