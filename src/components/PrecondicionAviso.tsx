import { useTranslation } from 'react-i18next'
import { FolderOpen, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/appStore'
import { usePrecondiciones } from '@/hooks/usePrecondiciones'
import { NAVEGACION, itemActivo, pendientesItem } from '@/config/navegacion'
import type { Vista } from '@/config/precondiciones'

/**
 * Explica qué precondición falta y ofrece el botón que la resuelve (issue #33).
 *
 * Se muestra **encima** del contenido de la vista, no en lugar de él: sin
 * proyecto activo, la vista de red ya enseña el selector de proyectos, que es
 * la acción correcta. Lo que faltaba era decir por qué aparece, porque el menú
 * marcaba «Red WNTR» y el contenido era la lista de proyectos, idéntica a la de
 * «Proyectos», sin ninguna explicación.
 */
export function PrecondicionAviso({ vista }: { vista: Vista }) {
  const { t } = useTranslation()
  const { estado, pendientes } = usePrecondiciones()
  const setCurrentView = useAppStore(s => s.setCurrentView)
  const ambitoChat = useAppStore(s => s.ambitoChat)
  const seccionRed = useAppStore(s => s.seccionRed)

  /**
   * Se mira lo que pidió el usuario, no sólo la vista a la que llegó (#46).
   *
   * «Simulaciones» y «Red WNTR» llevan a la misma vista, y sólo la primera exige
   * una red. Como el aviso miraba la vista, quien pulsaba «Simulaciones» sin red
   * —el ítem sale con candado, pero sigue siendo accionable a propósito para que
   * pueda llegar a la explicación— aterrizaba en la pantalla de importar sin que
   * nada dijera qué había pasado ni por qué no estaba en simulaciones.
   */
  const item = NAVEGACION.find(i => itemActivo(i, { vista, ambitoChat, seccionRed }))
  const faltan = item ? pendientesItem(item, estado) : pendientes(vista)
  if (faltan.length === 0) return null

  const faltaProyecto = faltan.includes('proyecto')

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-6 py-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            {faltaProyecto
              ? t('precondiciones.tituloProyecto')
              : t('precondiciones.tituloRedDe', { modulo: t(item?.etiqueta ?? 'precondiciones.esteModulo') })}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t(faltaProyecto ? 'precondiciones.descProyecto' : 'precondiciones.descRed')}
          </p>
        </div>
        {faltaProyecto && (
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => setCurrentView('projects')}>
            <FolderOpen className="h-3.5 w-3.5 mr-2" />
            {t('precondiciones.accionElegirProyecto')}
          </Button>
        )}
        {!faltaProyecto && (
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => setCurrentView('wntr')}>
            <Plus className="h-3.5 w-3.5 mr-2" />
            {t('precondiciones.accionImportarRed')}
          </Button>
        )}
      </div>
    </div>
  )
}
