import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Eye, EyeOff, Lock, Info } from 'lucide-react'
import type { AIProvider } from '@/stores/aiConfigStore'

interface Props {
  provider: Pick<AIProvider, 'id' | 'name' | 'tieneClave' | 'estadoClave' | 'finClave'>
  /** Si este equipo puede cifrar; `null` mientras no se sabe. */
  cifradoDisponible: boolean | null
  onGuardar: (clave: string, opciones: { permitirSinCifrar?: boolean }) => Promise<boolean>
}

/**
 * La clave de un proveedor, de sólo escritura (#225, D2).
 *
 * La clave guardada no vuelve a la interfaz: se ve si hay una, en qué estado
 * está y sus cuatro últimos caracteres. Antes se guardaba con cada tecla —en
 * claro, y dejando en la base cada prefijo tecleado—; ahora sólo al pulsar
 * «Guardar».
 */
export function ClaveDelProveedor({ provider, cifradoDisponible, onGuardar }: Props) {
  const { t } = useTranslation()
  const [borrador, setBorrador] = useState('')
  const [visible, setVisible] = useState(false)
  const [confirmarSinCifrar, setConfirmarSinCifrar] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(false)

  const sinLlavero = cifradoDisponible === false

  const guardar = async (opciones: { permitirSinCifrar?: boolean } = {}) => {
    if (!borrador.trim()) return
    setGuardando(true)
    setError(false)
    const ok = await onGuardar(borrador.trim(), opciones)
    setGuardando(false)
    if (ok) {
      setBorrador('')
      setConfirmarSinCifrar(false)
    } else {
      setError(true)
    }
  }

  const fin = provider.finClave ?? ''
  const estado = provider.estadoClave
  const aviso = estado === 'ilegible' || estado === 'sinCifrado' || estado === 'sesion'

  return (
    <div className="space-y-2">
      <div className={`flex items-start gap-2 text-xs ${aviso ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`} data-testid={`estado-clave-${provider.id}`}>
        {estado === 'ok' ? <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> : aviso ? <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> : <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
        <span>
          {estado === 'ok' && t('ai.clave.estadoOk', { fin })}
          {estado === 'ilegible' && t('ai.clave.estadoIlegible')}
          {estado === 'sinCifrado' && t('ai.clave.estadoSinCifrado', { fin })}
          {estado === 'sesion' && t('ai.clave.estadoSesion', { fin })}
          {!estado && t('ai.clave.sinClave')}
        </span>
      </div>

      {sinLlavero && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{t('ai.clave.sinLlavero')}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <input
            type={visible ? 'text' : 'password'}
            value={borrador}
            onChange={e => { setBorrador(e.target.value); setError(false) }}
            onKeyDown={e => { if (e.key === 'Enter' && !sinLlavero) void guardar() }}
            placeholder={provider.tieneClave ? t('ai.clave.reemplazar') : t('ai.enterApiKey')}
            aria-label={t('ai.apiKey')}
            autoComplete="off"
            spellCheck={false}
            className="w-full px-3 py-2 pr-10 bg-input border border-border rounded-lg text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none text-sm"
          />
          <button
            type="button"
            onClick={() => setVisible(v => !v)}
            aria-label={t(visible ? 'ai.clave.ocultar' : 'ai.clave.mostrar')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={!borrador.trim() || guardando}
          className="px-3 py-2 rounded-lg border border-border text-sm hover:border-primary disabled:opacity-50 whitespace-nowrap"
        >
          {sinLlavero ? t('ai.clave.usarEnSesion') : t('ai.clave.guardar')}
        </button>
        {sinLlavero && (
          <button
            type="button"
            onClick={() => setConfirmarSinCifrar(true)}
            disabled={!borrador.trim() || guardando}
            className="px-3 py-2 rounded-lg border border-amber-400 text-amber-800 dark:text-amber-300 text-sm disabled:opacity-50 whitespace-nowrap"
          >
            {t('ai.clave.guardarSinCifrar')}
          </button>
        )}
      </div>

      {confirmarSinCifrar && (
        <div role="alert" className="p-3 rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-xs space-y-2">
          <p className="text-amber-900 dark:text-amber-200">{t('ai.clave.riesgoSinCifrar', { proveedor: provider.name })}</p>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setConfirmarSinCifrar(false)} className="px-3 py-1 rounded border border-border">
              {t('ai.clave.cancelar')}
            </button>
            <button type="button" onClick={() => void guardar({ permitirSinCifrar: true })} className="px-3 py-1 rounded bg-amber-600 text-white">
              {t('ai.clave.confirmarSinCifrar')}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{t('ai.clave.error')}</p>}
    </div>
  )
}
