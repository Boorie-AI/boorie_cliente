import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import { Loader2, CheckCircle2, AlertTriangle, Download, Cpu } from 'lucide-react'
import { cn } from '@/utils/cn'

interface SetupStatus {
  ready: boolean
  pythonPath: string | null
  pythonVersion: string | null
  venvPath: string
  missing: string[]
  optionalMissing: string[]
  problems?: { name: string; error: string }[]
  venvPythonUnsupported?: boolean
  canRecreateVenv?: boolean
  message?: string
}

interface ProgressEvent {
  stage?: 'venv' | 'pip' | 'install' | 'done' | 'error' | 'warning'
  current?: number
  total?: number
  package?: string
  message?: string
  log?: string
}

interface SetupWizardProps {
  onComplete: () => void
}

const TOTAL_STEPS_LABEL = 'Preparando NeMo Guardrails, Milvus Lite y motor WNTR'

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const logRef = useRef<HTMLDivElement>(null)
  const [logLines, setLogLines] = useState<string[]>([])
  const api = (window as any).electronAPI?.setup

  useEffect(() => {
    if (!api) return
    api.status().then(setStatus).catch(() => {
      setErrorMsg('No se pudo consultar el estado de Python.')
    })

    const off = api.onProgress((p: ProgressEvent) => {
      setProgress(p)
      if (p.log) {
        setLogLines((prev) => {
          const next = [...prev, p.log!.trim()].slice(-200)
          return next
        })
      }
      if (p.stage === 'error') {
        setErrorMsg(p.message ?? 'Error en el setup.')
      }
      // Los avisos ('warning') explican por qué algo quedará deshabilitado —
      // p.ej. un venv sobre Python 3.9 donde Milvus no puede instalarse. Antes
      // se emitían y no se pintaban en ningún sitio, así que el usuario veía el
      // asistente reaparecer sin ninguna explicación.
      if (p.stage === 'warning' && p.message) {
        setWarnings((prev) => (prev.includes(p.message!) ? prev : [...prev, p.message!]))
      }
    })

    return off
  }, [])

  useEffect(() => {
    // Auto-scroll del log
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logLines])

  const startInstall = async () => {
    setInstalling(true)
    setErrorMsg(null)
    setWarnings([])
    setLogLines([])
    try {
      const result = await api.install()
      if (result?.success) {
        // Refrescar status para confirmar
        const fresh = await api.status()
        setStatus(fresh)
        if (fresh.ready) {
          // pequeño delay para que el usuario vea el "done"
          setTimeout(onComplete, 800)
        }
      } else {
        // El evento de progreso 'error' ya trae el motivo real (qué import
        // falla y por qué). No lo pisamos con el código genérico.
        setErrorMsg((prev) => prev || result?.error || t('messages.setupFailed'))
      }
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Setup falló.')
    } finally {
      setInstalling(false)
    }
  }

  const skip = () => {
    onComplete()
  }

  if (!api) return null

  const pct = progress?.current && progress?.total
    ? Math.round((progress.current / progress.total) * 100)
    : (progress?.stage === 'done' ? 100 : 0)

  return (
    <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-md flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-8 py-6 border-b border-border bg-gradient-to-r from-primary/5 to-purple-500/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Cpu className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-foreground">{t('setup.preparing')}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{TOTAL_STEPS_LABEL}</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-8 py-6 space-y-5">
          {!installing && status && !status.ready && (
            <>
              <div className="text-sm text-foreground/80">
                {t('setup.intro')}
              </div>
              {status.missing.length > 0 && (
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">{t('setup.pending')}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {status.missing.map((m) => (
                      <span key={m} className="text-xs px-2 py-0.5 rounded-full bg-muted text-foreground/80">
                        {m}
                      </span>
                    ))}
                  </div>
                  {/* El motivo del fallo, no sólo el nombre: un paquete puede
                      estar instalado y no cargar (DLL, versión incompatible). */}
                  {status.problems && status.problems.length > 0 && (
                    <div className="pt-2 space-y-1 text-[11px] font-mono text-muted-foreground">
                      {status.problems.map((p) => (
                        <div key={p.name} className="break-all">
                          {p.name}: {p.error}
                        </div>
                      ))}
                    </div>
                  )}
                  {status.pythonVersion && (
                    <div className="pt-1 text-[11px] text-muted-foreground">
                      {t('setup.interpreter')} <span className="font-mono">{status.pythonPath}</span> ({status.pythonVersion})
                    </div>
                  )}
                </div>
              )}
              {/* El diagnóstico del backend (qué falta y por qué) es lo único
                  que dice al usuario qué tiene que hacer; antes se descartaba. */}
              {status.message && (
                <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-foreground/80">
                  {status.message}
                </div>
              )}
              {(!status.pythonPath || (status.venvPythonUnsupported && !status.canRecreateVenv)) && (
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 text-sm text-yellow-700 dark:text-yellow-400 flex gap-3 items-start">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <div>
                    {t('setup.noPython')}{' '}
                    <a className="underline" href="https://www.python.org/downloads/" target="_blank" rel="noopener noreferrer">
                      python.org/downloads
                    </a>
                    {t('setup.checkPath')} <span className="font-mono">Add python.exe to PATH</span> {t('setup.thenRestart')}
                  </div>
                </div>
              )}
            </>
          )}

          {installing && (
            <>
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">
                    {progress?.message ?? 'Instalando…'}
                  </div>
                  {progress?.package && (
                    <div className="text-xs text-muted-foreground mt-0.5">{progress.package}</div>
                  )}
                </div>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-200"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div
                ref={logRef}
                className="rounded-lg bg-muted/40 border border-border p-3 text-[11px] font-mono text-muted-foreground max-h-40 overflow-y-auto whitespace-pre-wrap"
              >
                {logLines.length === 0
                  ? 'Esperando salida del instalador…'
                  : logLines.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            </>
          )}

          {!installing && status?.ready && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-5 h-5" />
                {t('setup.ready')}
              </div>
              {status.optionalMissing.length > 0 && (
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-xs text-yellow-700 dark:text-yellow-400 flex gap-2 items-start">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    {t('setup.guardrailsOff', { faltan: status.optionalMissing.join(', ') })} <strong>{t('setup.guardrailsNo')}</strong> {t('setup.guardrailsRest')}
                  </div>
                </div>
              )}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 text-sm text-yellow-700 dark:text-yellow-400 space-y-2">
              {warnings.map((w, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <div>{w}</div>
                </div>
              ))}
            </div>
          )}

          {errorMsg && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-700 dark:text-red-400 flex gap-3 items-start">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <div>{errorMsg}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-border bg-muted/30 flex items-center justify-between gap-3">
          <button
            onClick={skip}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {status?.ready
              ? 'Continuar sin guardrails'
              : 'Continuar de todos modos (algunas funciones no estarán disponibles)'}
          </button>
          <div className="flex gap-2">
            {status?.ready ? (
              <button
                onClick={onComplete}
                className={cn(
                  'px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium',
                  'hover:bg-primary/90 transition-colors',
                )}
              >
                {t('setup.start')}
              </button>
            ) : (
              <button
                onClick={startInstall}
                disabled={installing || !status?.pythonPath}
                className={cn(
                  'flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                <Download className="w-4 h-4" />
                {installing ? 'Instalando…' : 'Instalar dependencias'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
