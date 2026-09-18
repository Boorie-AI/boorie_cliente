/**
 * El aviso de que hay informes de simulación repetidos, y el botón que los poda
 * (#167).
 *
 * Hasta ahora cada ejecución dejaba un juego entero de informes en el índice sin
 * quitar los de la anterior, y el título no distingue una ejecución de otra
 * —se compone de la red y la versión—, así que la lista acababa con veinte
 * fichas con el mismo nombre. Eso ya no pasa al indexar, pero lo acumulado sigue
 * ahí.
 *
 * Y no se poda solo. Es un borrado en la base del usuario, y aunque lo que se
 * borra sea regenerable desde los resultados de la simulación, la decisión de
 * cuándo tocar su base es suya. Por eso el aviso dice cuántos son antes de
 * ofrecer el botón.
 */

import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { Layers, Trash2 } from 'lucide-react'
import { logger } from '@/utils/logger'

interface Props {
  /** Para que el panel recargue la lista cuando la poda termina. */
  alTerminar?: () => void
}

export function AvisoDeInformesRepetidos({ alTerminar }: Props) {
  const { t } = useTranslation()
  const [sobrantes, setSobrantes] = useState<{ documentos: number; versiones: number } | null>(null)
  const [enMarcha, setEnMarcha] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)

  useEffect(() => {
    comprobar()
  }, [])

  const comprobar = async () => {
    try {
      const res = await window.electronAPI.simulacionRAG?.informesRepetidos?.()
      setSobrantes(res?.success && res.data?.documentos > 0 ? res.data : null)
    } catch (error) {
      logger.warn('No se pudo comprobar si hay informes repetidos:', error)
    }
  }

  const podar = async () => {
    setEnMarcha(true)
    try {
      const res = await window.electronAPI.simulacionRAG.podarInformes()
      if (res?.success) {
        setResultado(t('wisdom.informesRepetidos.hecho', { documentos: res.data.podados }))
        await comprobar()
        alTerminar?.()
      } else {
        setResultado(t('wisdom.informesRepetidos.fallo', { motivo: res?.error ?? '' }))
      }
    } catch (error) {
      setResultado(t('wisdom.informesRepetidos.fallo', { motivo: String(error) }))
    } finally {
      setEnMarcha(false)
    }
  }

  if (!sobrantes && !resultado) return null

  if (!sobrantes && resultado) {
    return (
      <div className="mb-4 rounded-lg border border-green-500/40 bg-green-50 dark:bg-green-950/20 p-3 text-sm text-green-800 dark:text-green-200">
        {resultado}
      </div>
    )
  }

  return (
    <div className="mb-4 rounded-lg border border-sky-500/50 bg-sky-50 dark:bg-sky-950/20 p-4">
      <div className="flex items-start gap-3">
        <Layers className="w-5 h-5 text-sky-600 dark:text-sky-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sky-900 dark:text-sky-100">
            {t('wisdom.informesRepetidos.titulo', { documentos: sobrantes!.documentos })}
          </h4>
          <p className="mt-1 text-sm text-sky-800 dark:text-sky-200">
            {t('wisdom.informesRepetidos.porque', {
              documentos: sobrantes!.documentos,
              versiones: sobrantes!.versiones,
            })}
          </p>
          {resultado && (
            <p className="mt-2 text-sm text-sky-900 dark:text-sky-100">{resultado}</p>
          )}
          <button
            onClick={podar}
            disabled={enMarcha}
            className="mt-3 inline-flex items-center gap-2 rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
          >
            <Trash2 className="w-4 h-4" />
            {enMarcha ? t('wisdom.informesRepetidos.enMarcha') : t('wisdom.informesRepetidos.boton')}
          </button>
        </div>
      </div>
    </div>
  )
}
