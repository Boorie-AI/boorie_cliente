import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { logger } from '@/utils/logger'

/**
 * Valorar una recomendación energética (#42, tercera entrega).
 *
 * No es un pulgar decorativo: lo que se guarda va con la medida, la cifra
 * verificada y el identificador de la ejecución que la respaldó, porque este
 * registro **es el dataset** con el que se podría afinar un modelo más adelante
 * —el Enfoque B del issue— y sin esos tres datos un «no me sirve» no es un
 * ejemplo utilizable.
 *
 * El campo de corrección aparece sólo al marcar «no me sirve», que es cuando hay
 * algo que explicar. Es la parte con más valor de todo esto: la cifra la pone la
 * simulación, pero *por qué* la medida no vale en esta red sólo lo sabe quien
 * conoce la red.
 */

interface Props {
  runId: string
  titulo: string
  contexto?: Record<string, unknown>
  /** Lo ya valorado, si se está volviendo a abrir el panel. */
  valoracionInicial?: { rating: number; correccion: string | null } | null
  compacto?: boolean
}

export function FeedbackRecomendacion({ runId, titulo, contexto, valoracionInicial, compacto }: Props) {
  const [rating, setRating] = useState<number | null>(valoracionInicial?.rating ?? null)
  const [correccion, setCorreccion] = useState(valoracionInicial?.correccion ?? '')
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const guardar = async (valor: 1 | -1, texto?: string) => {
    setGuardando(true)
    setError(null)
    try {
      const r = await window.electronAPI.energia.feedback({
        runId,
        titulo,
        rating: valor,
        correccion: texto ?? null,
        contexto,
      })
      if (r?.success) {
        setRating(valor)
        if (valor === -1 && texto === undefined) setPidiendoMotivo(true)
        else setPidiendoMotivo(false)
      } else {
        setError(r?.error || 'No se pudo guardar la valoración')
      }
    } catch (e) {
      logger.warn('No se pudo guardar la valoración de la recomendación:', e)
      setError('No se pudo guardar la valoración')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className={compacto ? 'mt-1 space-y-1' : 'mt-2 space-y-1 border-t pt-2'}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">¿Te sirve?</span>
        <Button
          size="sm" variant={rating === 1 ? 'secondary' : 'ghost'}
          className="h-6 px-2" disabled={guardando}
          onClick={() => guardar(1)}
          title="Útil"
        >
          <ThumbsUp className="h-3 w-3" />
        </Button>
        <Button
          size="sm" variant={rating === -1 ? 'secondary' : 'ghost'}
          className="h-6 px-2" disabled={guardando}
          onClick={() => guardar(-1)}
          title="No me sirve"
        >
          <ThumbsDown className="h-3 w-3" />
        </Button>
        {rating !== null && !pidiendoMotivo && (
          <span className="text-[10px] text-muted-foreground">
            {rating === 1 ? 'Guardado como útil.' : 'Guardado como incorrecta.'}
          </span>
        )}
      </div>

      {(pidiendoMotivo || (rating === -1 && correccion)) && (
        <div className="space-y-1">
          <textarea
            className="w-full bg-background border rounded px-2 py-1 text-[11px]"
            rows={2}
            placeholder="¿Por qué no sirve en esta red? (opcional, pero es lo más útil que puedes dejar aquí)"
            value={correccion}
            onChange={e => setCorreccion(e.target.value)}
          />
          <Button size="sm" variant="outline" className="h-6 text-[10px]" disabled={guardando}
            onClick={() => guardar(-1, correccion)}>
            Guardar el motivo
          </Button>
        </div>
      )}

      {error && <div className="text-[10px] text-destructive">{error}</div>}
    </div>
  )
}
