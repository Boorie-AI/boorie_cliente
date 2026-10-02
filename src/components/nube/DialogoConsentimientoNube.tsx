import { useTranslation } from 'react-i18next'
import * as Dialog from '@radix-ui/react-dialog'
import { UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDialogoConsentimiento } from '@/services/consentimientoNube'

/** Las claves de `nube.consentimiento.datos`, en el orden en que se enseñan. */
const DATOS = ['pregunta', 'adjunto', 'fragmentos', 'red', 'otrasFunciones'] as const

/**
 * Qué sale de la máquina y a quién, antes de que salga (#225).
 *
 * Se monta una vez en `App` y lo abre `pedirConsentimiento`. Hay que contestar:
 * cerrar con Escape o pulsando fuera cuenta como «no», que deja respondiendo al
 * modelo local. El texto está en los locales (`nube.consentimiento`) con su
 * versión; si cambia de forma sustancial, se sube `VERSION_CONSENTIMIENTO` en
 * `backend/services/security/consentimientoNube.ts` y se vuelve a pedir.
 */
export function DialogoConsentimientoNube() {
  const { t } = useTranslation()
  const peticion = useDialogoConsentimiento(s => s.peticion)
  const proveedor = peticion?.proveedor ?? ''

  return (
    <Dialog.Root open={!!peticion} onOpenChange={abierto => { if (!abierto) peticion?.responder(false) }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-[100]" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101]
                     w-[min(40rem,calc(100vw-2rem))] max-h-[85vh] overflow-y-auto
                     bg-card border border-border rounded-lg shadow-xl p-6"
        >
          <Dialog.Title className="text-lg font-semibold flex items-center gap-2 mb-3">
            <UploadCloud className="h-5 w-5 text-primary shrink-0" />
            {t('nube.consentimiento.titulo', { proveedor })}
          </Dialog.Title>

          <Dialog.Description asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>{t('nube.consentimiento.intro', { proveedor })}</p>
              <p className="text-foreground font-medium">{t('nube.consentimiento.queSale', { proveedor })}</p>
              <ul className="list-disc pl-5 space-y-1">
                {DATOS.map(d => <li key={d}>{t(`nube.consentimiento.datos.${d}`, { proveedor })}</li>)}
              </ul>
              <p>{t('nube.consentimiento.cliente', { proveedor })}</p>
              <p>{t('nube.consentimiento.retirar', { proveedor })}</p>
              <p className="text-foreground">{t('nube.consentimiento.siNo')}</p>
              <p className="text-[11px] italic">{t('nube.consentimiento.version', { version: peticion?.version ?? 1 })}</p>
            </div>
          </Dialog.Description>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-5">
            <Button variant="outline" onClick={() => peticion?.responder(false)}>
              {t('nube.consentimiento.rechazar')}
            </Button>
            <Button onClick={() => peticion?.responder(true)}>
              {t('nube.consentimiento.aceptar', { proveedor })}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
