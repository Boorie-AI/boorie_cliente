import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Info } from 'lucide-react'
import { useAIConfigStore } from '@/stores/aiConfigStore'
import { refrescarModelosRAG, type EstadoMotorRAG } from '@/config/modelosRAG'
import { pedirConsentimiento } from '@/services/consentimientoNube'
import { logger } from '@/utils/logger'

type Motor = EstadoMotorRAG['ajuste']

/** Así sale en el diálogo de consentimiento; se guarda en minúsculas. */
const NVIDIA = 'NVIDIA'

/**
 * Dónde se reformula la pregunta y se gradúan los fragmentos (#224).
 *
 * Antes sólo se podía llevar a la nube con variables de entorno, que en la app
 * instalada no hay forma de fijar. El ajuste lo guarda y lo hace cumplir el
 * proceso principal; aquí se enseña lo que dice, también cuando no puede
 * cumplirse (sin clave, sin consentimiento o porque manda el entorno).
 */
export function MotorDeBusqueda() {
  const { t } = useTranslation()
  // Al guardar o quitar una clave cambia la lista de proveedores, y con ella si NVIDIA se puede usar.
  const providers = useAIConfigStore(s => s.providers)
  const [estado, setEstado] = useState<EstadoMotorRAG | null>(null)
  const [aviso, setAviso] = useState<'guardado' | 'rechazado' | 'error' | null>(null)

  useEffect(() => {
    let vigente = true
    Promise.resolve(window.electronAPI.agenticRAG.motor?.())
      .then(r => { if (vigente && r?.success && r.data) setEstado(r.data) })
      .catch(error => logger.warn('No se pudo leer dónde se procesa la búsqueda:', error))
    return () => { vigente = false }
  }, [providers])

  const elegir = async (motor: Motor) => {
    setAviso(null)
    // Antes de que salga nada, el consentimiento (#225). Sin él no se cambia nada.
    if (motor === 'nvidia' && !(await pedirConsentimiento(NVIDIA))) {
      setAviso('rechazado')
      return
    }
    try {
      const r = await window.electronAPI.agenticRAG.guardarMotor?.(motor)
      if (!r?.success || !r.data) throw new Error(r?.error ?? 'sin respuesta')
      setEstado(r.data)
      setAviso('guardado')
      refrescarModelosRAG()
    } catch (error) {
      logger.error('No se pudo guardar dónde se procesa la búsqueda:', error)
      setAviso('error')
    }
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6 space-y-3">
      <div>
        <h2 className="text-xl font-semibold text-card-foreground">{t('ai.motorBusqueda.titulo')}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{t('ai.motorBusqueda.descripcion')}</p>
      </div>

      <select
        aria-label={t('ai.motorBusqueda.titulo')}
        value={estado?.ajuste ?? 'ollama'}
        disabled={!estado}
        onChange={e => elegir(e.target.value as Motor)}
        className="w-full max-w-xl bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"
      >
        <option value="ollama">{t('ai.motorBusqueda.local')}</option>
        <option value="nvidia">{t('ai.motorBusqueda.nvidia')}</option>
      </select>

      {estado?.porEntorno && (
        <p className="text-xs text-muted-foreground">
          {t('ai.motorBusqueda.porEntorno', { motor: t(estado.pedido === 'nvidia' ? 'ai.motorBusqueda.nvidia' : 'ai.motorBusqueda.local') })}
        </p>
      )}

      {estado?.motivo && (
        <div role="alert" className="flex items-start space-x-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs text-foreground">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-yellow-600" />
          <div className="space-y-2">
            <p>{t(estado.motivo === 'sinClave' ? 'ai.motorBusqueda.sinClave' : 'ai.motorBusqueda.sinConsentimiento')}</p>
            {estado.motivo === 'sinConsentimiento' && (
              <button type="button" onClick={() => elegir('nvidia')} className="underline">
                {t('ai.motorBusqueda.darConsentimiento')}
              </button>
            )}
          </div>
        </div>
      )}

      {estado?.efectivo === 'nvidia' && (
        <div className="flex items-start space-x-2 p-3 rounded-lg bg-accent/40 border border-border/50 text-xs text-muted-foreground">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{t('ai.motorBusqueda.avisoNube')}</span>
        </div>
      )}

      {aviso === 'guardado' && <p className="text-xs text-muted-foreground">{t('ai.motorBusqueda.guardado')}</p>}
      {aviso === 'rechazado' && <p className="text-xs text-muted-foreground">{t('ai.motorBusqueda.sigueLocal')}</p>}
      {aviso === 'error' && <p className="text-xs text-destructive">{t('ai.motorBusqueda.error')}</p>}
    </div>
  )
}
