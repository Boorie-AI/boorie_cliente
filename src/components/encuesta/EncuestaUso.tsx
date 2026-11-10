import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, ClipboardList, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import {
  SECCIONES,
  faltanPorResponder,
  preguntaOculta,
  type Pregunta,
  type Respuestas,
} from '@/../backend/services/feedback/encuestaUso'

type Estado = { fase: 'editando' } | { fase: 'enviando' } | { fase: 'recortado' } | { fase: 'error' }

const campoClase =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-hidden focus:ring-2 focus:ring-primary/40'

/**
 * Encuesta de uso (#13), obligatoria: se pide al salir de Boorie hasta que se
 * envía. Escape y pulsar fuera no la descartan; salir sin enviarla deja la
 * aplicación cerrada, pero la próxima salida la vuelve a pedir.
 */
export function EncuestaUso({ abierta, noPublicada = false, onTerminar }: { abierta: boolean; noPublicada?: boolean; onTerminar: () => void }) {
  const { t } = useTranslation()
  const [respuestas, setRespuestas] = useState<Respuestas>({})
  const [estado, setEstado] = useState<Estado>({ fase: 'editando' })

  useEffect(() => {
    if (!abierta) return
    setRespuestas({})
    setEstado({ fase: 'editando' })
  }, [abierta])

  const faltan = faltanPorResponder(respuestas).length

  const cambiar = (id: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setRespuestas(r => ({ ...r, [id]: e.target.value }))
      setEstado({ fase: 'editando' })
    }

  const enviar = async () => {
    setEstado({ fase: 'enviando' })
    try {
      const r = await window.electronAPI?.encuesta?.abrirGithub(respuestas)
      if (!r?.success) return setEstado({ fase: 'error' })
      if (r.recortado) return setEstado({ fase: 'recortado' })
      onTerminar()
    } catch {
      setEstado({ fase: 'error' })
    }
  }

  const campo = (p: Pregunta) => {
    const base = `encuesta.p.${p.id}`
    const valor = respuestas[p.id] ?? ''
    return (
      <label key={p.id} className="block space-y-1.5">
        <span className="text-sm font-medium text-foreground">
          {t(`${base}.l`)}{p.obligatoria && <span className="text-primary" aria-hidden> *</span>}
        </span>
        {p.tipo === 'opciones' ? (
          <select name={p.id} required value={valor} onChange={cambiar(p.id)} className={campoClase}>
            <option value="" disabled>{t('encuesta.elige')}</option>
            {p.opciones!.map((o, i) => <option key={o} value={o}>{t(`${base}.o.${i}`)}</option>)}
          </select>
        ) : p.tipo === 'parrafo' ? (
          <textarea
            name={p.id}
            rows={2}
            required={p.obligatoria}
            value={valor}
            onChange={cambiar(p.id)}
            placeholder={t(`${base}.ph`)}
            className={cn(campoClase, 'resize-y')}
          />
        ) : (
          <input
            name={p.id}
            required={p.obligatoria}
            value={valor}
            onChange={cambiar(p.id)}
            placeholder={t(`${base}.ph`)}
            className={campoClase}
          />
        )}
      </label>
    )
  }

  return (
    <Dialog.Root open={abierta}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-200" />
        <Dialog.Content
          onEscapeKeyDown={e => e.preventDefault()}
          onPointerDownOutside={e => e.preventDefault()}
          onInteractOutside={e => e.preventDefault()}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-201
                     w-[min(44rem,calc(100vw-2rem))] max-h-[90vh] flex flex-col
                     bg-card border border-border rounded-xl shadow-xl"
        >
          <div className="p-6 pb-4 space-y-4 border-b border-border">
            <div>
              <Dialog.Title className="text-xl font-semibold text-foreground flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary shrink-0" />
                {t('encuesta.titulo')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">{t('encuesta.subtitulo')}</Dialog.Description>
            </div>
            {noPublicada && (
              <p role="status" className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />{t('encuesta.noPublicada')}
              </p>
            )}
            <div
              role="note"
              className="flex gap-2 rounded-lg border border-primary/40 bg-primary/10 p-3 text-xs text-foreground"
            >
              <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
              <div className="space-y-1">
                <p className="font-medium">{t('encuesta.descargo')}</p>
                <p className="text-muted-foreground">{t('encuesta.descargoPublico')}</p>
              </div>
            </div>
          </div>

          <form
            id="encuesta-uso"
            className="flex-1 overflow-y-auto p-6 space-y-6"
            onSubmit={e => { e.preventDefault(); if (faltan === 0) void enviar() }}
          >
            {SECCIONES.map(s => (
              <fieldset key={s.id} className="space-y-4">
                <legend className="text-base font-semibold text-foreground mb-3">{t(`encuesta.secciones.${s.id}`)}</legend>
                {s.preguntas.filter(p => !preguntaOculta(p.id, respuestas)).map(campo)}
              </fieldset>
            ))}
          </form>

          <div className="p-6 pt-4 border-t border-border space-y-3">
            {estado.fase === 'error' && (
              <p role="alert" className="flex gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />{t('encuesta.error')}
              </p>
            )}
            {estado.fase === 'recortado' && (
              <p role="status" className="text-sm text-muted-foreground">{t('encuesta.recortado')}</p>
            )}
            <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {faltan > 0 ? t('encuesta.faltan', { count: faltan }) : t('encuesta.lista')}
              </span>
              <div className="flex flex-col-reverse sm:flex-row gap-2">
                {estado.fase === 'recortado' ? (
                  <Button onClick={onTerminar}>{t('encuesta.salir')}</Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={onTerminar} disabled={estado.fase === 'enviando'}>
                      {t('encuesta.salirSinEnviar')}
                    </Button>
                    <Button type="submit" form="encuesta-uso" disabled={faltan > 0 || estado.fase === 'enviando'}>
                      {t('encuesta.enviar')}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
