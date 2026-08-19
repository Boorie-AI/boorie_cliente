import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Network, AlertCircle } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { logger } from '@/utils/logger'

interface ResumenRed {
  nombre: string
  junctions: number
  pipes: number
  longitudTotalM: number
}

interface RespuestaContexto {
  success: boolean
  data?: { resumen: ResumenRed | null }
}

/**
 * Dice qué red está viendo el agente (issue #34, criterio 3).
 *
 * Sin esto el usuario no puede saber si el chat responde sobre su red o de
 * memoria, que es justo la confusión que el issue quiere eliminar.
 */
export function RedEnContexto() {
  const { t } = useTranslation()
  const projectId = useProjectStore(s => s.currentProjectId)
  const [resumen, setResumen] = useState<ResumenRed | null>(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    let vigente = true
    if (!projectId) {
      setResumen(null)
      return
    }
    setCargando(true)
    window.electronAPI.networkRepository
      .context(projectId)
      .then((r: RespuestaContexto) => {
        if (vigente) setResumen(r?.success ? r.data?.resumen ?? null : null)
      })
      .catch((e: unknown) => {
        logger.warn('No se pudo leer la red en contexto:', e)
        if (vigente) setResumen(null)
      })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [projectId])

  if (cargando) return null

  if (!resumen) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title={t('chat.redEnContexto.ningunaAyuda')}>
        <AlertCircle className="h-3 w-3" />
        <span>{t('chat.redEnContexto.ninguna')}</span>
      </div>
    )
  }

  const km = (resumen.longitudTotalM / 1000).toFixed(2)
  return (
    <div
      className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
      title={t('chat.redEnContexto.detalle', { nudos: resumen.junctions, tuberias: resumen.pipes, km })}
    >
      <Network className="h-3 w-3 text-primary" />
      <span>{t('chat.redEnContexto.viendo', { red: resumen.nombre })}</span>
    </div>
  )
}
