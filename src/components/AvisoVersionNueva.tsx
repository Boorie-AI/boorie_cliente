import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

type VersionNueva = { version: string; url: string }

/**
 * En Mac no hay actualización automática (#310): el main sólo comprueba y
 * aquí se avisa, con el enlace a la release. El enlace sale por
 * `window.open`, que la ventana abre en el navegador tras filtrarlo
 * (`navegacionSegura.ts`). Cerrarlo lo oculta hasta el próximo arranque.
 */
export function AvisoVersionNueva() {
  const { t } = useTranslation()
  const [nueva, setNueva] = useState<VersionNueva | null>(null)

  useEffect(() => {
    const api = window.electronAPI
    void api?.versionPendiente?.().then(v => { if (v) setNueva(v) }).catch(() => {})
    return api?.onVersionNueva?.(setNueva)
  }, [])

  if (!nueva) return null

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-150 w-[min(22rem,calc(100vw-2rem))]
                 bg-card border border-border rounded-lg shadow-xl p-4"
    >
      <div className="flex items-start gap-3">
        <Download className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm font-medium">{t('window.versionNueva.mensaje', { version: nueva.version })}</p>
          <p className="text-xs text-muted-foreground">{t('window.versionNueva.detalle')}</p>
        </div>
        <button
          type="button"
          onClick={() => setNueva(null)}
          aria-label={t('window.versionNueva.cerrar')}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex justify-end gap-2 pt-3">
        <Button variant="outline" size="sm" onClick={() => setNueva(null)}>
          {t('window.versionNueva.cerrar')}
        </Button>
        <Button size="sm" onClick={() => window.open(nueva.url, '_blank')}>
          {t('window.versionNueva.ver')}
        </Button>
      </div>
    </div>
  )
}
