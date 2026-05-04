import { useEffect, useState } from 'react'
import { Shield, ShieldCheck, ShieldAlert, RefreshCw, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/utils/cn'
import * as Switch from '@radix-ui/react-switch'

type RailName = 'input' | 'retrieval' | 'output' | 'execution'

interface GuardrailsSettings {
  enabled: Record<RailName, boolean>
  advisoryMode: boolean
  judgeProvider: 'ollama' | 'nvidia-api'
  judgeModel: string
  ollamaBaseUrl: string
  nvidiaApiKey?: string
}

interface Violation {
  id: string
  rail: RailName
  severity: string
  reason: string
  blocked: boolean
  judgeModel: string | null
  judgeProvider: string | null
  createdAt: string
}

const RAIL_LABELS: Record<RailName, { title: string; description: string }> = {
  input: {
    title: 'Input rail',
    description: 'Bloquea jailbreaks, PII y temas fuera de ingeniería hidráulica antes de llegar al LLM.',
  },
  retrieval: {
    title: 'Retrieval rail',
    description: 'Valida que los chunks RAG son relevantes antes de inyectarlos al prompt.',
  },
  output: {
    title: 'Output rail',
    description: 'Fact-check de la respuesta contra el contexto recuperado para evitar alucinaciones.',
  },
  execution: {
    title: 'Execution rail',
    description: 'Sanity-check de parámetros antes de ejecutar simulaciones WNTR.',
  },
}

export function GuardrailsPanel() {
  const [settings, setSettings] = useState<GuardrailsSettings | null>(null)
  const [pingStatus, setPingStatus] = useState<{ ok: boolean; error?: string } | null>(null)
  const [violations, setViolations] = useState<Violation[]>([])
  const [loading, setLoading] = useState(false)

  const api = (window as any).electronAPI?.guardrails

  const load = async () => {
    if (!api) return
    setLoading(true)
    try {
      const [s, p, v] = await Promise.all([
        api.getSettings(),
        api.ping(),
        api.listViolations({ limit: 30 }),
      ])
      setSettings(s)
      setPingStatus(p)
      setViolations(v || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const update = async (patch: Partial<GuardrailsSettings>) => {
    if (!api || !settings) return
    const next = await api.setSettings(patch)
    setSettings(next)
  }

  const toggleRail = (rail: RailName, value: boolean) => {
    if (!settings) return
    update({ enabled: { ...settings.enabled, [rail]: value } })
  }

  if (!api) {
    return (
      <div className="p-6 text-muted-foreground">
        Guardrails API no disponible. Reinicia Boorie tras la actualización.
      </div>
    )
  }

  if (!settings) {
    return <div className="p-6 text-muted-foreground">Cargando configuración…</div>
  }

  return (
    <div className="overflow-y-auto h-full pb-12">
      {/* Header */}
      <div className="flex items-start gap-3 mb-6">
        <Shield className="w-7 h-7 text-primary flex-shrink-0 mt-1" />
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-foreground">NVIDIA NeMo Guardrails</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Red agéntica de validación basada en Nemotron. Cada rail es un agente independiente
            que aprueba, bloquea o avisa sobre el flujo de chat / RAG / WNTR.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-2 rounded-lg hover:bg-accent transition-colors"
          title="Recargar"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Status */}
      <div className={cn(
        'rounded-lg border p-4 mb-6 flex items-start gap-3',
        pingStatus?.ok
          ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900'
          : 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-900',
      )}>
        {pingStatus?.ok
          ? <ShieldCheck className="w-5 h-5 text-green-600 flex-shrink-0" />
          : <ShieldAlert className="w-5 h-5 text-yellow-600 flex-shrink-0" />}
        <div className="text-sm">
          {pingStatus?.ok ? (
            <>
              <div className="font-medium text-green-900 dark:text-green-200">Servicio activo</div>
              <div className="text-green-800/80 dark:text-green-300/80 mt-0.5">
                Juez: {settings.judgeModel} ({settings.judgeProvider})
              </div>
            </>
          ) : (
            <>
              <div className="font-medium text-yellow-900 dark:text-yellow-200">Servicio no disponible</div>
              <div className="text-yellow-800/80 dark:text-yellow-300/80 mt-0.5">
                {pingStatus?.error || 'No se pudo conectar al proceso Python.'} Modo fail-open: el chat funciona pero sin guardrails.
                Ejecuta <code className="px-1 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/40">./setup-guardrails.sh</code> para instalar.
              </div>
            </>
          )}
        </div>
      </div>

      {/* Provider config */}
      <div className="bg-card rounded-lg border border-border p-4 mb-6">
        <h3 className="font-semibold text-foreground mb-3">Modelo juez</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-muted-foreground">Provider</label>
            <select
              value={settings.judgeProvider}
              onChange={(e) => update({ judgeProvider: e.target.value as any })}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
            >
              <option value="ollama">Ollama (local)</option>
              <option value="nvidia-api">NVIDIA API Catalog</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Modelo</label>
            <input
              type="text"
              value={settings.judgeModel}
              onChange={(e) => update({ judgeModel: e.target.value })}
              placeholder={settings.judgeProvider === 'ollama' ? 'nemotron-mini' : 'meta/llama-3.1-nemotron-70b-instruct'}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
            />
          </div>
          <div>
            {settings.judgeProvider === 'ollama' ? (
              <>
                <label className="text-xs text-muted-foreground">Ollama URL</label>
                <input
                  type="text"
                  value={settings.ollamaBaseUrl}
                  onChange={(e) => update({ ollamaBaseUrl: e.target.value })}
                  placeholder="http://localhost:11434"
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
                />
              </>
            ) : (
              <>
                <label className="text-xs text-muted-foreground">NVIDIA API key</label>
                <input
                  type="password"
                  value={settings.nvidiaApiKey ?? ''}
                  onChange={(e) => update({ nvidiaApiKey: e.target.value })}
                  placeholder="nvapi-..."
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Advisory toggle */}
      <div className="bg-card rounded-lg border border-border p-4 mb-6 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-foreground">Modo aviso (advisory)</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Cuando está activo, los rails registran las violaciones pero <strong>no bloquean</strong> el flujo.
            Útil para evaluar falsos positivos antes de poner en modo bloqueante.
          </p>
        </div>
        <Switch.Root
          checked={settings.advisoryMode}
          onCheckedChange={(v) => update({ advisoryMode: v })}
          className="w-11 h-6 rounded-full bg-muted data-[state=checked]:bg-primary relative"
        >
          <Switch.Thumb className="block w-5 h-5 rounded-full bg-white shadow translate-x-0.5 data-[state=checked]:translate-x-[22px] transition-transform" />
        </Switch.Root>
      </div>

      {/* Rails toggles */}
      <h3 className="font-semibold text-foreground mb-3">Rails</h3>
      <div className="space-y-3 mb-6">
        {(Object.keys(RAIL_LABELS) as RailName[]).map((rail) => (
          <div key={rail} className="bg-card rounded-lg border border-border p-4 flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="font-medium text-foreground">{RAIL_LABELS[rail].title}</div>
              <div className="text-sm text-muted-foreground mt-1">{RAIL_LABELS[rail].description}</div>
            </div>
            <Switch.Root
              checked={settings.enabled[rail]}
              onCheckedChange={(v) => toggleRail(rail, v)}
              className="w-11 h-6 rounded-full bg-muted data-[state=checked]:bg-primary relative flex-shrink-0"
            >
              <Switch.Thumb className="block w-5 h-5 rounded-full bg-white shadow translate-x-0.5 data-[state=checked]:translate-x-[22px] transition-transform" />
            </Switch.Root>
          </div>
        ))}
      </div>

      {/* Violations log */}
      <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" />
        Auditoría reciente ({violations.length})
      </h3>
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        {violations.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Sin violaciones registradas. Las que se registren aparecerán aquí.
          </div>
        ) : (
          <div className="divide-y divide-border max-h-96 overflow-y-auto">
            {violations.map((v) => (
              <div key={v.id} className="p-3 flex items-start gap-3 text-sm">
                {v.blocked
                  ? <XCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  : <CheckCircle2 className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground capitalize">{v.rail}</span>
                    <span className={cn(
                      'text-xs px-1.5 py-0.5 rounded-full',
                      v.severity === 'critical' || v.severity === 'high'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : v.severity === 'medium'
                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                        : 'bg-muted text-muted-foreground',
                    )}>
                      {v.severity}
                    </span>
                    {!v.blocked && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30">advisory</span>
                    )}
                  </div>
                  <div className="text-muted-foreground mt-0.5 break-words">{v.reason}</div>
                  <div className="text-xs text-muted-foreground/70 mt-0.5">
                    {new Date(v.createdAt).toLocaleString()}
                    {v.judgeModel && ` · ${v.judgeModel} (${v.judgeProvider})`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
