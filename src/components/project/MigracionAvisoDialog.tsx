import { useTranslation } from 'react-i18next'
import * as Dialog from '@radix-ui/react-dialog'
import { Database, AlertTriangle } from 'lucide-react'
import type { InformeMigracion } from '@/services/migration/migrateProjectAssets'
import { CLAVE_OVERLAY } from '@/services/migration/migrateProjectAssets'
import { cn } from '@/utils/cn'

/**
 * Resumen de la migración del almacenamiento local a la base de datos (#31).
 *
 * Se informa a propósito en lugar de migrar en silencio: el usuario tiene que
 * poder saber qué se movió y, sobre todo, qué quedó a medias. El texto va en
 * castellano y sin pasar por i18next porque es un aviso puntual de una unica
 * version: internacionalizarlo obligaria a mantener tres traducciones de algo que
 * deja de mostrarse en cuanto se ejecuta.
 */
export function MigracionAvisoDialog({
  informe,
  onClose
}: {
  informe: InformeMigracion | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  if (!informe) return null

  const hayProblemas = informe.redesIncompletas.length > 0 || informe.redesFallidas.length > 0

  return (
    <Dialog.Root open onOpenChange={abierto => { if (!abierto) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 animate-in fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
            'w-[480px] max-w-[92vw] max-h-[85vh] overflow-y-auto',
            'bg-card rounded-lg shadow-lg border border-border',
            'animate-in fade-in-0 zoom-in-95 duration-200'
          )}
        >
          <div className="p-6">
            <div className="flex gap-3">
              <Database className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <Dialog.Title className="text-base font-semibold text-foreground">
                  {t('migration.saved')}
                </Dialog.Title>
                <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t('migration.nowInProject')}
                </Dialog.Description>
              </div>
            </div>

            <div className="mt-4 flex gap-8 rounded-lg border border-border bg-muted/30 p-4">
              <div>
                <div className="text-xs text-muted-foreground">{t('migration.networks')}</div>
                <div className="font-mono text-lg font-semibold text-foreground">{informe.redesMigradas}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t('migration.calculations')}</div>
                <div className="font-mono text-lg font-semibold text-foreground">{informe.calculosMigrados}</div>
              </div>
            </div>

            {informe.redesYaExistentes.length > 0 && (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {t('migration.duplicated', { count: informe.redesYaExistentes.length })}
              </p>
            )}

            {informe.redesIncompletas.length > 0 && (
              <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-xs text-yellow-700 dark:text-yellow-400">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">
                      {t('migration.noInp', { count: informe.redesIncompletas.length })}
                    </p>
                    <p className="mt-1 leading-relaxed">
                      {t('migration.noInpHint')}
                    </p>
                    <ul className="mt-2 list-disc space-y-0.5 pl-4 font-mono">
                      {informe.redesIncompletas.map(r => (
                        <li key={`${r.proyecto}-${r.red}`}>{r.red}{r.ruta ? ` — ${r.ruta}` : ''}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {informe.redesFallidas.length > 0 && (
              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-400">
                <p className="font-medium">
                  {t('migration.failed', { count: informe.redesFallidas.length })}
                </p>
                <ul className="mt-2 list-disc space-y-0.5 pl-4">
                  {informe.redesFallidas.map(r => (
                    <li key={`${r.proyecto}-${r.red}`}><span className="font-mono">{r.red}</span>: {r.error}</li>
                  ))}
                </ul>
              </div>
            )}

            {hayProblemas && (
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                {t('migration.nothingDeleted')} <span className="font-mono">{CLAVE_OVERLAY}</span>.
              </p>
            )}

            <button
              onClick={onClose}
              className={cn(
                'mt-5 w-full rounded-md px-4 py-2 text-sm font-medium',
                'bg-primary text-primary-foreground hover:bg-primary/90'
              )}
            >
              {t('migration.gotIt')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
