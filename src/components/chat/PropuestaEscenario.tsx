import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Play, X } from 'lucide-react'
import { narrarEscenario, type ResultadoEscenario } from '@/services/hydraulic/narrarEscenario'
import { logger } from '@/utils/logger'

/**
 * La confirmación de un escenario antes de ejecutarlo (#44).
 *
 * El criterio es explícito: **ningún escenario se ejecuta sin que el usuario
 * apruebe la definición propuesta**. Por eso la herramienta del agente sólo
 * propone —no puede simular— y la simulación se lanza desde aquí, con un clic
 * sobre una definición que está a la vista.
 *
 * Se enseña la definición completa, no un resumen bonito: quien va a aprobar una
 * simulación de cuatro horas de bombas paradas tiene derecho a ver qué se va a
 * cerrar y cuándo.
 */

export interface Propuesta {
  resumen?: string
  definicion?: { nombre?: string; eventos: Array<Record<string, unknown>> }
  elementos_inexistentes?: Array<{ id: string; ids_parecidos: string[] }>
}

interface Props {
  propuesta: Propuesta
  /** Proyecto de la conversación: la ejecución se registra en su red. */
  projectId?: string | null
  /** Red sobre la que se registra la simulación, para que la cifra sea rastreable. */
  networkId?: string | null
  onNarracion: (texto: string, runId: string | null) => void
}

export function PropuestaEscenario({ propuesta, networkId, onNarracion }: Props) {
  const [estado, setEstado] = useState<'pendiente' | 'ejecutando' | 'hecho' | 'descartado'>('pendiente')
  const [error, setError] = useState<string | null>(null)

  if (!propuesta?.definicion?.eventos?.length) return null

  if (estado === 'descartado') {
    return <div className="mt-2 text-[11px] text-muted-foreground">Escenario descartado. No se ha simulado nada.</div>
  }
  if (estado === 'hecho') {
    return <div className="mt-2 text-[11px] text-muted-foreground">Escenario ejecutado.</div>
  }

  const ejecutar = async () => {
    setEstado('ejecutando')
    setError(null)
    try {
      const r = await window.electronAPI.wntr.simulateScenario({
        ...propuesta.definicion,
        duration_hours: 24,
        persons_per_connection: 4,
        // Sobre qué red: el chat no pasa por la vista de red, así que sin esto
        // el motor no tiene fichero que simular (#44).
        red_id: networkId ?? undefined,
      })

      if (!r?.success) {
        setError(r?.error || 'El escenario no se pudo simular')
        setEstado('pendiente')
        return
      }

      // Se registra antes de narrar: la narración cita esta ejecución, así que
      // la cifra tiene que poder rastrearse hasta ella. Si el registro falla, la
      // narración lo dice en vez de citar un identificador que no existe.
      let runId: string | null = null
      if (networkId) {
        try {
          const registro = await window.electronAPI.networkVersions.recordSimulation({
            networkId,
            tipo: 'scenario',
            parameters: propuesta.definicion,
            results: r.data,
          })
          runId = registro?.data?.id ?? null
        } catch (e) {
          logger.warn('No se pudo registrar la simulación del escenario:', e)
        }
      }

      onNarracion(narrarEscenario(r.data as ResultadoEscenario, runId), runId)
      setEstado('hecho')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'El escenario no se pudo simular')
      setEstado('pendiente')
    }
  }

  return (
    <div className="mt-3 border border-amber-500/40 bg-amber-500/5 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
        <AlertTriangle className="h-3.5 w-3.5" />
        Escenario propuesto — requiere tu confirmación
      </div>

      {propuesta.resumen && <div className="text-xs">{propuesta.resumen}</div>}

      <pre className="text-[10px] bg-background/60 rounded p-2 overflow-x-auto">
        {JSON.stringify(propuesta.definicion.eventos, null, 2)}
      </pre>

      {propuesta.elementos_inexistentes?.length ? (
        <div className="text-[11px] text-destructive">
          No están en la red y se han dejado fuera:{' '}
          {propuesta.elementos_inexistentes.map(e => e.id).join(', ')}
        </div>
      ) : null}

      {error && <div className="text-[11px] text-destructive">{error}</div>}

      <div className="flex gap-2">
        <Button size="sm" className="text-xs" onClick={ejecutar} disabled={estado === 'ejecutando'}>
          <Play className="h-3 w-3 mr-1" />
          {estado === 'ejecutando' ? 'Simulando…' : 'Ejecutar escenario'}
        </Button>
        <Button size="sm" variant="ghost" className="text-xs" onClick={() => setEstado('descartado')} disabled={estado === 'ejecutando'}>
          <X className="h-3 w-3 mr-1" /> Descartar
        </Button>
      </div>

      <div className="text-[10px] text-muted-foreground">
        Son dos simulaciones de periodo extendido —una de referencia y otra con el evento— y en un equipo sin
        tarjeta gráfica dedicada pueden tardar un par de minutos.
      </div>
    </div>
  )
}
