import * as Dialog from '@radix-ui/react-dialog'
import { useTranslation } from 'react-i18next'
import { FolderOpen, AlertTriangle } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { cn } from '@/utils/cn'

/**
 * Se monta una sola vez en la raíz. Aparece cuando se abre una conversación que
 * pertenece a un proyecto distinto del activo (#31).
 *
 * No se resuelve en silencio a propósito: conmutar por su cuenta cambiaría el
 * contexto de la red y del Wisdom Center sin que el usuario lo pida, y no
 * conmutar dejaría al LLM respondiendo con el contexto de otro proyecto. Las dos
 * opciones son defendibles, así que decide quien está delante.
 */
export function ProjectMismatchDialog() {
  const { t } = useTranslation()
  const mismatch = useProjectStore(s => s.projectMismatch)
  const resolve = useProjectStore(s => s.resolveProjectMismatch)

  return (
    <Dialog.Root open={!!mismatch} onOpenChange={abierto => { if (!abierto) resolve('keep') }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 animate-in fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
            'w-[440px] max-w-[92vw] bg-card rounded-lg shadow-lg border border-border',
            'animate-in fade-in-0 zoom-in-95 duration-200'
          )}
        >
          <div className="p-6">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-500" />
              <div className="min-w-0">
                <Dialog.Title className="text-base font-semibold text-foreground">
                  {t('project.mismatch.title')}
                </Dialog.Title>
                <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {/* Sin proyecto activo el texto normal dejaría un hueco vacío. */}
                  {t(mismatch?.activeProjectName ? 'project.mismatch.body' : 'project.mismatch.bodyNoActive', {
                    conversationProject: mismatch?.conversationProjectName ?? '',
                    activeProject: mismatch?.activeProjectName ?? ''
                  })}
                </Dialog.Description>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2">
              <button
                onClick={() => resolve('switch')}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2',
                  'bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90'
                )}
              >
                <FolderOpen className="h-4 w-4" />
                {t('project.mismatch.switch', { project: mismatch?.conversationProjectName ?? '' })}
              </button>
              {mismatch?.activeProjectName && (
                <button
                  onClick={() => resolve('keep')}
                  className={cn(
                    'rounded-md border border-border px-4 py-2 text-sm font-medium',
                    'text-foreground hover:bg-muted'
                  )}
                >
                  {t('project.mismatch.keep', { project: mismatch.activeProjectName })}
                </button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
