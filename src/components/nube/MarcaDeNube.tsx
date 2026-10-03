import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Cloud } from 'lucide-react'
import { cargarModelosRAG, modeloFijadoRAG } from '@/config/modelosRAG'
import { esProveedorLocal } from '@/services/consentimientoNube'

/**
 * Mientras la conversación responde con un modelo externo, se ve en la propia
 * conversación (#225, R8): el proveedor elegido en Configuración o, con el
 * selector de diagnóstico, el de la conversación.
 */
export function MarcaDeNube({ proveedorDeLaConversacion }: { proveedorDeLaConversacion: string }) {
  const { t } = useTranslation()
  const [proveedor, setProveedor] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    cargarModelosRAG().then(() => {
      if (vigente) setProveedor(modeloFijadoRAG()?.provider ?? proveedorDeLaConversacion)
    })
    return () => { vigente = false }
  }, [proveedorDeLaConversacion])

  if (!proveedor || esProveedorLocal(proveedor)) return null

  return (
    <span
      className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300 shrink-0"
      title={t('nube.marca.detalle', { proveedor })}
      data-testid="marca-nube"
    >
      <Cloud className="w-3.5 h-3.5" />
      {t('nube.marca.etiqueta', { proveedor })}
    </span>
  )
}
