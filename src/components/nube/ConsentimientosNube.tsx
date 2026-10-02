import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CloudOff } from 'lucide-react'
import { leerConsentimientos, retirarConsentimiento, type EstadoConsentimiento } from '@/services/consentimientoNube'

/**
 * A qué proveedores se ha autorizado mandar datos, desde cuándo, y el botón
 * para retirarlo (#225, R7).
 */
export function ConsentimientosNube({ alRetirar, version: refresco }: { alRetirar?: (proveedor: string) => void; version?: number }) {
  const { t, i18n } = useTranslation()
  const [estado, setEstado] = useState<EstadoConsentimiento | null>(null)

  const cargar = () => leerConsentimientos().then(setEstado)
  useEffect(() => { void cargar() }, [refresco])

  const vigentes = Object.entries(estado?.consentimientos ?? {}).filter(([, c]) => c.version >= (estado?.version ?? 1))

  const retirar = async (proveedor: string) => {
    await retirarConsentimiento(proveedor)
    alRetirar?.(proveedor)
    await cargar()
  }

  return (
    <div className="pt-3 border-t border-border/50 space-y-2">
      <h3 className="text-sm font-medium text-card-foreground">{t('nube.gestion.titulo')}</h3>
      {vigentes.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('nube.gestion.ninguno')}</p>
      ) : (
        <ul className="space-y-1">
          {vigentes.map(([proveedor, c]) => (
            <li key={proveedor} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-foreground">
                {t('nube.gestion.autorizado', {
                  proveedor,
                  fecha: new Date(c.fecha).toLocaleDateString(i18n.language),
                  version: c.version,
                })}
              </span>
              <button
                type="button"
                onClick={() => void retirar(proveedor)}
                className="flex items-center gap-1 px-2 py-1 rounded border border-border hover:border-destructive hover:text-destructive"
              >
                <CloudOff className="w-3 h-3" />
                {t('nube.gestion.retirar')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">{t('nube.gestion.efecto')}</p>
    </div>
  )
}
