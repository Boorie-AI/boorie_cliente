import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as Dialog from '@radix-ui/react-dialog'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Pregunta antes de salir de Boorie (#278). El main para cualquier intento de
 * cerrar la ventana (la «x», Ctrl/Cmd+Q, Alt+F4…) y lo anuncia por
 * `onSolicitudCierre`; sólo «Salir» deja que siga. Cancelar, Escape o pulsar
 * fuera dejan la aplicación como estaba.
 */
export function ConfirmarSalida() {
  const { t } = useTranslation()
  const [abierto, setAbierto] = useState(false)

  useEffect(() => window.electronAPI?.onSolicitudCierre?.(() => setAbierto(true)), [])

  const salir = () => {
    setAbierto(false)
    void window.electronAPI.confirmarCierre()
  }

  return (
    <Dialog.Root open={abierto} onOpenChange={setAbierto}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-200" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-201
                     w-[min(28rem,calc(100vw-2rem))] bg-card border border-border
                     rounded-lg shadow-xl p-6"
        >
          <Dialog.Title className="text-lg font-semibold flex items-center gap-2 mb-3">
            <LogOut className="h-5 w-5 text-primary shrink-0" />
            {t('window.salir.titulo')}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground">
            {t('window.salir.mensaje')}
          </Dialog.Description>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-5">
            <Button variant="outline" autoFocus onClick={() => setAbierto(false)}>
              {t('window.salir.cancelar')}
            </Button>
            <Button onClick={salir}>
              {t('window.salir.confirmar')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
