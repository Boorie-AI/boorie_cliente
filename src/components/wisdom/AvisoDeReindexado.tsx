/**
 * El aviso de que hay que reindexar, y el botón que lo lanza (#162).
 *
 * Al actualizar a la versión que cambia el modelo de embeddings (#155), los
 * vectores que el usuario ya tiene son de otro tamaño. Buscar con los nuevos
 * contra los viejos no da error: el almacén vectorial responde «Success» y una
 * lista vacía, así que el efecto es que el RAG deja de encontrar nada con toda
 * la documentación indexada delante y sin decir una palabra.
 *
 * Por eso el aviso es visible y lleva el botón: quien actualiza no tiene por qué
 * saber que existe un reindexado ni ir a buscarlo por los menús.
 *
 * Y no se lanza solo. Son decenas de minutos de CPU y una reescritura completa
 * de la base del usuario: eso lo decide el usuario, no la aplicación al
 * arrancar.
 */

import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { logger } from '@/utils/logger'

interface Props {
  /** Para que el panel recargue la lista cuando el reindexado termina. */
  alTerminar?: () => void
}

interface Descuadre {
  guardada?: number
  esperada: number
  modelo: string
  fragmentos: number
  /**
   * Por qué hay que reindexar. Cambia el motivo que se le enseña al usuario,
   * no lo que hace el botón: en los dos casos hay que regenerarlo todo (#158).
   */
  motivo: 'dimension' | 'ambito'
}

export function AvisoDeReindexado({ alTerminar }: Props) {
  const { t } = useTranslation()
  const [descuadre, setDescuadre] = useState<Descuadre | null>(null)
  const [enMarcha, setEnMarcha] = useState(false)
  const [progreso, setProgreso] = useState<{ hechos: number; total: number; titulo?: string } | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)

  useEffect(() => {
    comprobar()
  }, [])

  useEffect(() => {
    if (!enMarcha) return
    const cancelar = window.electronAPI.wisdom.onReindexProgress(
      (d: { document?: number; totalDocuments?: number; title?: string }) => {
        setProgreso({ hechos: d.document ?? 0, total: d.totalDocuments ?? 0, titulo: d.title })
      })
    return () => cancelar?.()
  }, [enMarcha])

  const comprobar = async () => {
    try {
      const res = await window.electronAPI.wisdom.getRAGHealth()
      const emb = res?.health?.metrics?.embeddings
      if (res?.success && (emb?.descuadrada || emb?.ambitoSinCodificar)) {
        setDescuadre({
          guardada: emb.dimensionGuardada,
          esperada: emb.dimensionEsperada,
          modelo: emb.modelo,
          fragmentos: emb.total ?? 0,
          motivo: emb.descuadrada ? 'dimension' : 'ambito',
        })
      } else {
        setDescuadre(null)
      }
    } catch (error) {
      logger.warn('No se pudo comprobar si hace falta reindexar:', error)
    }
  }

  const reindexar = async () => {
    setEnMarcha(true)
    setResultado(null)
    try {
      const res = await window.electronAPI.wisdom.massiveReindex({ reindexAll: true })
      if (res?.success) {
        const r = res.results
        setResultado(t('wisdom.reindexado.hecho', {
          documentos: r.successful,
          total: r.totalProcessed,
          fragmentos: r.indexedChunks,
        }))
        await comprobar()
        alTerminar?.()
      } else {
        setResultado(t('wisdom.reindexado.fallo', { motivo: res?.message ?? '' }))
      }
    } catch (error) {
      setResultado(t('wisdom.reindexado.fallo', { motivo: String(error) }))
    } finally {
      setEnMarcha(false)
      setProgreso(null)
    }
  }

  if (!descuadre && !resultado) return null

  if (!descuadre && resultado) {
    return (
      <div className="mb-4 rounded-lg border border-green-500/40 bg-green-50 dark:bg-green-950/20 p-3 text-sm text-green-800 dark:text-green-200">
        {resultado}
      </div>
    )
  }

  return (
    <div className="mb-4 rounded-lg border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-amber-900 dark:text-amber-100">
            {t('wisdom.reindexado.titulo')}
          </h4>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
            {descuadre!.motivo === 'dimension'
              ? t('wisdom.reindexado.porque', {
                  modelo: descuadre!.modelo,
                  guardada: descuadre!.guardada,
                  esperada: descuadre!.esperada,
                })
              : t('wisdom.reindexado.porqueAmbito')}
          </p>
          <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
            {t('wisdom.reindexado.como', { fragmentos: descuadre!.fragmentos })}
          </p>

          {enMarcha && progreso && (
            <div className="mt-3">
              <div className="h-1.5 w-full rounded bg-amber-200 dark:bg-amber-900">
                <div
                  className="h-1.5 rounded bg-amber-600 transition-all"
                  style={{ width: `${progreso.total ? (progreso.hechos / progreso.total) * 100 : 0}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300 truncate">
                {t('wisdom.reindexado.progreso', {
                  hechos: progreso.hechos,
                  total: progreso.total,
                  titulo: progreso.titulo ?? '',
                })}
              </p>
            </div>
          )}

          {resultado && (
            <p className="mt-2 text-sm text-amber-900 dark:text-amber-100">{resultado}</p>
          )}

          <button
            onClick={reindexar}
            disabled={enMarcha}
            className="mt-3 inline-flex items-center gap-2 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${enMarcha ? 'animate-spin' : ''}`} />
            {enMarcha ? t('wisdom.reindexado.enMarcha') : t('wisdom.reindexado.boton')}
          </button>
        </div>
      </div>
    </div>
  )
}
