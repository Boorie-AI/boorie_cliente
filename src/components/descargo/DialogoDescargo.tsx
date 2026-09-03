import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { logger } from '@/utils/logger'
import { guardarAceptacion, hayQueAceptar, leerAceptacion } from '@/services/descargo'

/**
 * La aceptación del descargo, al primer arranque (issue #108, capa 1).
 *
 * Bloqueante a propósito, y decidido así en el issue: sin aceptación registrada
 * no hay constancia de nada, y descubrir en una auditoría que no la hay no es
 * aceptable. Una fricción de una sola vez sí lo es.
 *
 * No se enseña mientras se comprueba. Enseñarlo y esconderlo al leer la base
 * haría parpadear un modal a pantalla completa en cada arranque, que es peor
 * que esperar dos décimas.
 */
export function DialogoDescargo() {
  const { t } = useTranslation()
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vigente = true
    leerAceptacion()
      .then(aceptacion => { if (vigente) setAbierto(hayQueAceptar(aceptacion)) })
      .catch(error => {
        // Si la base no responde, se pregunta. Es preferible pedir la
        // aceptación de más que dar por hecha una que no consta.
        logger.error('No se pudo leer la aceptación del descargo:', error)
        if (vigente) setAbierto(true)
      })
    return () => { vigente = false }
  }, [])

  const aceptar = async () => {
    setGuardando(true)
    try {
      await guardarAceptacion()
      setAbierto(false)
    } catch (error) {
      // Cerrar sin poder guardar dejaría a la persona dentro sin constancia, y
      // volvería a preguntarle al siguiente arranque sin explicar por qué.
      logger.error('No se pudo guardar la aceptación del descargo:', error)
      setGuardando(false)
    }
  }

  return (
    <Dialog.Root open={abierto} modal>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 z-[100] animate-in fade-in-0" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101]
                     w-[min(38rem,calc(100vw-2rem))] max-h-[85vh] overflow-y-auto
                     bg-card border border-border rounded-lg shadow-xl p-6
                     animate-in fade-in-0 zoom-in-95"
          /**
           * Las tres salidas, cerradas. No hay `Dialog.Close`: la única forma de
           * seguir es aceptar, o cerrar la aplicación. Es la parte que un cambio
           * de versión de Radix puede romper en silencio, y por eso tiene test.
           */
          onEscapeKeyDown={e => e.preventDefault()}
          onPointerDownOutside={e => e.preventDefault()}
          onInteractOutside={e => e.preventDefault()}
        >
          <Dialog.Title className="text-lg font-semibold flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            {t('descargo.titulo')}
          </Dialog.Title>

          <Dialog.Description asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>{t('descargo.parrafoModelos')}</p>
              <p>{t('descargo.parrafoIA')}</p>
              <p className="text-foreground font-medium">{t('descargo.parrafoDecision')}</p>
              <p>{t('descargo.parrafoResponsabilidad')}</p>
              <p className="text-[11px] italic pt-1">{t('descargo.prevalece')}</p>
            </div>
          </Dialog.Description>

          <div className="flex justify-end pt-5">
            <Button onClick={aceptar} disabled={guardando}>
              {t('descargo.aceptar')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
