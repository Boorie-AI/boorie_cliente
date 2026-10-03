import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, Bug, Camera, Copy, ExternalLink, Lightbulb, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import { useAyudaStore } from '@/stores/ayudaStore'
import type { Frecuencia, FormularioAyuda, TipoAyuda } from '@/types/feedback'

type Estado =
  | { fase: 'editando' }
  | { fase: 'enviando' }
  | { fase: 'abierto'; recortado: boolean }
  | { fase: 'copiado' }
  | { fase: 'error' }

const FRECUENCIAS: { valor: Frecuencia; clave: string }[] = [
  { valor: 'una-vez', clave: 'ayuda.frecuenciaUnaVez' },
  { valor: 'a-veces', clave: 'ayuda.frecuenciaAVeces' },
  { valor: 'siempre', clave: 'ayuda.frecuenciaSiempre' },
]

const VACIO = { haciendo: '', paso: '', esperabas: '', frecuencia: 'a-veces' as Frecuencia, necesitas: '', paraQue: '', comoHoy: '' }

const campoClase =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-hidden focus:ring-2 focus:ring-primary/40'

export function DialogoAyuda() {
  const { t } = useTranslation()
  const { abierta, tipo: tipoInicial, pantalla, cerrar } = useAyudaStore()
  const [tipo, setTipo] = useState<TipoAyuda>(tipoInicial)
  const [campos, setCampos] = useState(VACIO)
  const [incluirTecnica, setIncluirTecnica] = useState(false)
  const [verPrevia, setVerPrevia] = useState(false)
  const [previa, setPrevia] = useState<{ cuerpo: string; recortado: boolean } | null>(null)
  const [estado, setEstado] = useState<Estado>({ fase: 'editando' })
  const [captura, setCaptura] = useState<'ninguna' | 'copiada' | 'error'>('ninguna')

  // Cada apertura empieza de cero y en el modo del botón que se pulsó.
  useEffect(() => {
    if (!abierta) return
    setTipo(tipoInicial)
    setCampos(VACIO)
    setIncluirTecnica(false)
    setVerPrevia(false)
    setPrevia(null)
    setEstado({ fase: 'editando' })
    setCaptura('ninguna')
  }, [abierta, tipoInicial])

  const form: FormularioAyuda = useMemo(
    () => tipo === 'bug'
      ? { tipo, haciendo: campos.haciendo, paso: campos.paso, esperabas: campos.esperabas, frecuencia: campos.frecuencia }
      : { tipo, necesitas: campos.necesitas, paraQue: campos.paraQue, comoHoy: campos.comoHoy },
    [tipo, campos],
  )
  const opciones = useMemo(() => ({ incluirTecnica, pantalla }), [incluirTecnica, pantalla])
  const completo = tipo === 'bug' ? campos.paso.trim() !== '' : campos.necesitas.trim() !== ''

  // La vista previa la construye el main, que es quien anonimiza: lo que se ve es lo que sale.
  useEffect(() => {
    if (!abierta || !verPrevia || !completo) { setPrevia(null); return }
    let vigente = true
    const id = setTimeout(() => {
      window.electronAPI?.feedback?.preview(form, opciones)
        .then(r => { if (vigente) setPrevia(r.success ? { cuerpo: r.cuerpo, recortado: r.recortado } : null) })
        .catch(() => { if (vigente) setPrevia(null) })
    }, 250)
    return () => { vigente = false; clearTimeout(id) }
  }, [abierta, verPrevia, completo, form, opciones])

  const cambiar = (campo: keyof typeof VACIO) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setCampos(c => ({ ...c, [campo]: e.target.value }))
      setEstado({ fase: 'editando' })
    }

  const abrirEnGithub = async () => {
    setEstado({ fase: 'enviando' })
    try {
      const r = await window.electronAPI?.feedback?.openGithub(form, opciones)
      setEstado(r?.success ? { fase: 'abierto', recortado: r.recortado } : { fase: 'error' })
    } catch {
      setEstado({ fase: 'error' })
    }
  }

  const copiarInforme = async () => {
    setEstado({ fase: 'enviando' })
    try {
      const r = await window.electronAPI?.feedback?.copy(form, opciones)
      setEstado(r?.success ? { fase: 'copiado' } : { fase: 'error' })
    } catch {
      setEstado({ fase: 'error' })
    }
  }

  const copiarCaptura = async () => {
    try {
      const r = await window.electronAPI?.feedback?.copySnapshot()
      setCaptura(r?.success ? 'copiada' : 'error')
    } catch {
      setCaptura('error')
    }
  }

  const enviando = estado.fase === 'enviando'

  const area = (campo: keyof typeof VACIO, etiqueta: string, ph: string, filas = 3, obligatorio = false) => (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">
        {t(etiqueta)}{obligatorio && <span className="text-primary" aria-hidden> *</span>}
      </span>
      <textarea
        name={campo}
        rows={filas}
        required={obligatorio}
        value={campos[campo]}
        onChange={cambiar(campo)}
        placeholder={t(ph)}
        className={cn(campoClase, 'resize-y')}
      />
    </label>
  )

  return (
    <Dialog.Root open={abierta} onOpenChange={o => { if (!o) cerrar() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-90 animate-in fade-in-0" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-91
                     w-[min(44rem,calc(100vw-2rem))] max-h-[90vh] overflow-y-auto
                     bg-card border border-border rounded-xl shadow-xl p-6 space-y-5
                     animate-in fade-in-0 zoom-in-95"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-xl font-semibold text-foreground">{t('ayuda.titulo')}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">{t('ayuda.subtitulo')}</Dialog.Description>
            </div>
            <Dialog.Close className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={t('ayuda.cerrar')}>
              <X size={18} />
            </Dialog.Close>
          </div>

          <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium">{t('ayuda.avisoPublico')}</p>
              <p>{t('ayuda.avisoCuenta')}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3" role="group">
            {([['bug', Bug, 'ayuda.reportar'], ['mejora', Lightbulb, 'ayuda.sugerir']] as const).map(([valor, Icono, clave]) => (
              <button
                key={valor}
                type="button"
                aria-pressed={tipo === valor}
                onClick={() => { setTipo(valor); setEstado({ fase: 'editando' }) }}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold transition-colors',
                  tipo === valor ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <Icono size={18} />
                {t(clave)}
              </button>
            ))}
          </div>

          {tipo === 'bug' ? (
            <div className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-foreground">{t('ayuda.haciendo')}</span>
                <input name="haciendo" value={campos.haciendo} onChange={cambiar('haciendo')} placeholder={t('ayuda.haciendoPh')} className={campoClase} />
              </label>
              {area('paso', 'ayuda.paso', 'ayuda.pasoPh', 3, true)}
              {area('esperabas', 'ayuda.esperabas', 'ayuda.esperabasPh', 2)}
              <div className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">{t('ayuda.frecuencia')}</span>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('ayuda.frecuencia')}>
                  {FRECUENCIAS.map(f => (
                    <button
                      key={f.valor}
                      type="button"
                      role="radio"
                      aria-checked={campos.frecuencia === f.valor}
                      onClick={() => setCampos(c => ({ ...c, frecuencia: f.valor }))}
                      className={cn(
                        'rounded-full border px-3 py-1 text-sm transition-colors',
                        campos.frecuencia === f.valor ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t(f.clave)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">{t('ayuda.captura')}</span>
                <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground space-y-2">
                  <button type="button" onClick={copiarCaptura} className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
                    <Camera size={14} /> {t('ayuda.capturar')}
                  </button>
                  <p>{t('ayuda.capturaAviso')}</p>
                  {captura === 'copiada' && <p role="status" className="text-green-700 dark:text-green-400">{t('ayuda.capturaCopiada')}</p>}
                  {captura === 'error' && <p role="status" className="text-destructive">{t('ayuda.capturaError')}</p>}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {area('necesitas', 'ayuda.necesitas', 'ayuda.necesitasPh', 3, true)}
              {area('paraQue', 'ayuda.paraQue', 'ayuda.paraQuePh', 2)}
              {area('comoHoy', 'ayuda.comoHoy', 'ayuda.comoHoyPh', 2)}
            </div>
          )}

          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="incluirTecnica"
                checked={incluirTecnica}
                onChange={e => setIncluirTecnica(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">{t('ayuda.incluirTecnica')}</span>
                <span className="block text-xs text-muted-foreground">{t('ayuda.incluirTecnicaDesc')}</span>
              </span>
            </label>
            <details open={verPrevia} onToggle={e => setVerPrevia((e.currentTarget as HTMLDetailsElement).open)}>
              <summary className="cursor-pointer text-xs font-medium text-primary">{t('ayuda.verPrevia')}</summary>
              {verPrevia && (
                previa ? (
                  <div className="mt-2 space-y-1">
                    {previa.recortado && <p className="text-xs text-amber-700 dark:text-amber-400">{t('ayuda.previaRecortada')}</p>}
                    <pre data-testid="previa-reporte" className="max-h-60 overflow-auto whitespace-pre-wrap wrap-anywhere rounded bg-background p-2 text-[11px] text-foreground">{previa.cuerpo}</pre>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">{t('ayuda.cargandoPrevia')}</p>
                )
              )}
            </details>
          </div>

          {estado.fase !== 'editando' && estado.fase !== 'enviando' && (
            <div
              role="status"
              className={cn(
                'rounded-md p-3 text-sm',
                estado.fase === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-800 dark:text-green-300',
              )}
            >
              {estado.fase === 'abierto' && (
                <>
                  <p>{t('ayuda.abierto')}</p>
                  {estado.recortado && <p className="mt-1">{t('ayuda.abiertoRecortado')}</p>}
                </>
              )}
              {estado.fase === 'copiado' && <p>{t('ayuda.copiado')}</p>}
              {estado.fase === 'error' && <p>{t('ayuda.error')}</p>}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="outline">{t('ayuda.cancelar')}</Button>
            </Dialog.Close>
            <Button variant="secondary" onClick={copiarInforme} disabled={!completo || enviando}>
              <Copy size={16} className="mr-2" />{t('ayuda.copiar')}
            </Button>
            <Button onClick={abrirEnGithub} disabled={!completo || enviando}>
              <ExternalLink size={16} className="mr-2" />{enviando ? t('ayuda.preparando') : t('ayuda.abrirGithub')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
