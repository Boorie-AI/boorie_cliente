import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Lightbulb, Play, X } from 'lucide-react'
import { narrarEnergia, type RecomendacionVerificada } from '@/services/hydraulic/narrarEnergia'

/**
 * La confirmación antes de buscar medidas de eficiencia energética (#42).
 *
 * Se pide confirmación por la misma razón que en los escenarios, aunque aquí no
 * haya nada que romper: **cada candidata son dos simulaciones de periodo
 * extendido**, y en un equipo sin tarjeta gráfica eso son varios minutos. Lanzar
 * eso porque alguien preguntó «¿cómo ahorro luz?» sin avisar sería secuestrarle
 * la máquina.
 */

interface Props {
  /** Proyecto de la conversación: su tarifa manda. */
  projectId?: string | null
  /** Red activa: hace falta para registrar cada verificación y poder citarla. */
  redId?: string | null
  /**
   * El texto y, aparte, las medidas con su ejecución: sin ellas la narración es
   * un párrafo y no se puede valorar nada (#42, tercera entrega).
   */
  onNarracion: (texto: string, valorables: Array<{ runId: string; titulo: string; contexto: Record<string, unknown> }>) => void
}

export function PropuestaEnergia({ projectId, redId, onNarracion }: Props) {
  const { t } = useTranslation()
  const [estado, setEstado] = useState<'pendiente' | 'trabajando' | 'hecho' | 'descartado'>('pendiente')
  const [error, setError] = useState<string | null>(null)

  if (estado === 'descartado') {
    return <div className="mt-2 text-[11px] text-muted-foreground">{t('proposal.energyDropped')}</div>
  }
  if (estado === 'hecho') {
    return <div className="mt-2 text-[11px] text-muted-foreground">{t('proposal.energyDone')}</div>
  }

  const ejecutar = async () => {
    setEstado('trabajando')
    setError(null)
    try {
      const r = await window.electronAPI.wntr.energyRecommend({
        projectId: projectId ?? null,
        redId: redId ?? null,
        duration_hours: 24,
      })

      if (!r?.success) {
        setError(r?.error || 'No se pudieron calcular las medidas')
        setEstado('pendiente')
        return
      }

      const recomendaciones = (r.data.recomendaciones ?? []) as RecomendacionVerificada[]
      onNarracion(
        narrarEnergia(r.data.analisis, recomendaciones, r.data.motivo),
        recomendaciones
          .filter(x => x.runId && x.ahorro)
          .map(x => ({
            runId: x.runId as string,
            titulo: x.candidata.titulo,
            contexto: { medida: x.candidata.medida, naturaleza: x.candidata.naturaleza, ahorro: x.ahorro, motivo: x.candidata.motivo },
          })),
      )
      setEstado('hecho')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron calcular las medidas')
      setEstado('pendiente')
    }
  }

  return (
    <div className="mt-3 border border-yellow-500/40 bg-yellow-500/5 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-yellow-700 dark:text-yellow-400">
        <Lightbulb className="h-3.5 w-3.5" />
        {t('proposal.energyTitle')}
      </div>
      <div className="text-[11px] text-muted-foreground">
        {t('proposal.energyHint1')} <strong>{t('proposal.energyHint2')}</strong> {t('proposal.energyHint3')}
      </div>

      {error && <div className="text-[11px] text-destructive">{error}</div>}

      <div className="flex gap-2">
        <Button size="sm" className="text-xs" onClick={ejecutar} disabled={estado === 'trabajando'}>
          <Play className="h-3 w-3 mr-1" />
          {estado === 'trabajando' ? 'Simulando medidas…' : 'Analizar y verificar'}
        </Button>
        <Button size="sm" variant="ghost" className="text-xs" onClick={() => setEstado('descartado')} disabled={estado === 'trabajando'}>
          <X className="h-3 w-3 mr-1" /> {t('proposal.drop')}
        </Button>
      </div>

      <div className="text-[10px] text-muted-foreground">
        {t('proposal.energyTime')}
      </div>
    </div>
  )
}
