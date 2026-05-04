import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import * as path from 'path'

export type RailName = 'input' | 'retrieval' | 'output' | 'execution'
export type Severity = 'low' | 'medium' | 'high' | 'critical'

export interface GuardrailVerdict {
  allow: boolean
  reason: string
  severity: Severity
  judge_model: string
  judge_provider: string
}

export interface GuardrailsOptions {
  judgeModel?: string
  judgeProvider?: 'ollama' | 'nvidia-api'
  ollamaBaseUrl?: string
  nvidiaApiKey?: string
  /** When true, every rail returns allow=true regardless of judge verdict.
   *  Used for "advisory mode" where we record violations but don't block. */
  advisoryMode?: boolean
  /** Per-rail enabled flags. Disabled rails skip the Python call entirely. */
  enabled?: Record<RailName, boolean>
}

interface PendingRequest {
  resolve: (v: GuardrailVerdict) => void
  reject: (e: Error) => void
}

const ALLOW: GuardrailVerdict = {
  allow: true,
  reason: 'rail-disabled',
  severity: 'low',
  judge_model: 'none',
  judge_provider: 'none',
}

class GuardrailsWrapper {
  private proc: ChildProcessWithoutNullStreams | null = null
  private nextId = 1
  private pending = new Map<number, PendingRequest>()
  private buffer = ''
  private starting: Promise<void> | null = null
  private opts: GuardrailsOptions = {}
  private startupError: string | null = null

  configure(opts: GuardrailsOptions) {
    this.opts = { ...this.opts, ...opts }
    // Force restart so the new env vars take effect on next call
    this.shutdown()
  }

  private getPythonPath(): string {
    const { findPythonPath } = require('../hydraulic/pythonDetector')
    return findPythonPath()
  }

  private getScriptPath(): string {
    // The guardrails service follows the same packaging conventions as the
    // hydraulic Python services, so we re-use the resolver.
    const { resolvePythonScriptPath } = require('../hydraulic/pythonScriptPath')
    // resolvePythonScriptPath looks under backend/services/hydraulic; for
    // guardrails we need backend/services/guardrails. Build the path
    // manually but use the same heuristic the resolver applies.
    const candidates: string[] = []
    if (process.resourcesPath) {
      candidates.push(path.join(process.resourcesPath, 'backend', 'services', 'guardrails', 'guardrailsService.py'))
      candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'backend', 'services', 'guardrails', 'guardrailsService.py'))
    }
    candidates.push(path.join(__dirname, 'guardrailsService.py'))
    candidates.push(path.join(process.cwd(), 'backend', 'services', 'guardrails', 'guardrailsService.py'))
    const fs = require('fs')
    for (const c of candidates) {
      try { if (fs.existsSync(c)) return c } catch { /* ignore */ }
    }
    return candidates[0]
  }

  private async ensureStarted(): Promise<void> {
    if (this.proc && !this.proc.killed) return
    if (this.starting) return this.starting

    this.starting = new Promise<void>((resolve, reject) => {
      try {
        const env = {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          BOORIE_GUARDRAILS_MODEL: this.opts.judgeModel ?? 'nemotron-mini',
          BOORIE_GUARDRAILS_PROVIDER: this.opts.judgeProvider ?? 'ollama',
          OLLAMA_BASE_URL: this.opts.ollamaBaseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
          NVIDIA_API_KEY: this.opts.nvidiaApiKey ?? process.env.NVIDIA_API_KEY ?? '',
        }

        const proc = spawn(this.getPythonPath(), [this.getScriptPath()], {
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
        })

        proc.stdout.on('data', (chunk) => this.onStdout(chunk.toString()))
        proc.stderr.on('data', (chunk) => {
          const text = chunk.toString()
          if (text.toLowerCase().includes('error')) {
            console.warn('[Guardrails py stderr]', text.trim())
          }
        })
        proc.on('error', (err) => {
          this.startupError = err.message
          this.failAllPending(err)
          this.proc = null
        })
        proc.on('close', (code) => {
          if (code !== 0 && code !== null) {
            console.warn(`[Guardrails] Python exited with code ${code}`)
          }
          this.failAllPending(new Error('guardrails Python process closed'))
          this.proc = null
        })

        this.proc = proc
        resolve()
      } catch (e: any) {
        this.startupError = e?.message ?? String(e)
        reject(e)
      } finally {
        this.starting = null
      }
    })

    return this.starting
  }

  private onStdout(text: string) {
    this.buffer += text
    let idx: number
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim()
      this.buffer = this.buffer.slice(idx + 1)
      if (!line) continue
      try {
        const msg = JSON.parse(line)
        const id = msg.id as number | undefined
        if (id == null) continue
        const pending = this.pending.get(id)
        if (!pending) continue
        this.pending.delete(id)
        if (msg.ok && msg.result) {
          pending.resolve(msg.result as GuardrailVerdict)
        } else {
          pending.reject(new Error(msg.error || 'unknown guardrails error'))
        }
      } catch (e) {
        console.warn('[Guardrails] failed to parse line:', line, e)
      }
    }
  }

  private failAllPending(err: Error) {
    for (const [, p] of this.pending) p.reject(err)
    this.pending.clear()
  }

  private async send(cmd: string, payload: any): Promise<GuardrailVerdict> {
    await this.ensureStarted()
    if (!this.proc) {
      // Fail-open: if we cannot start the rails, we don't block traffic.
      return { ...ALLOW, reason: `guardrails-unavailable: ${this.startupError ?? 'no process'}` }
    }
    return new Promise<GuardrailVerdict>((resolve, reject) => {
      const id = this.nextId++
      this.pending.set(id, { resolve, reject })
      const line = JSON.stringify({ id, cmd, payload }) + '\n'
      try {
        this.proc!.stdin.write(line)
      } catch (e: any) {
        this.pending.delete(id)
        reject(e)
      }
      // Timeout per call — keep generous because cold starts of nemotron
      // can be slow on first request.
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error('guardrails timeout'))
        }
      }, 60_000)
    })
  }

  private isEnabled(rail: RailName): boolean {
    return this.opts.enabled?.[rail] !== false
  }

  private applyAdvisory(v: GuardrailVerdict): GuardrailVerdict {
    if (this.opts.advisoryMode && !v.allow) {
      return { ...v, allow: true, reason: `[advisory] ${v.reason}` }
    }
    return v
  }

  async validateInput(text: string): Promise<GuardrailVerdict> {
    if (!this.isEnabled('input')) return ALLOW
    try {
      const v = await this.send('validate_input', { text })
      return this.applyAdvisory(v)
    } catch (e: any) {
      return { ...ALLOW, reason: `fail-open: ${e.message ?? e}` }
    }
  }

  async validateRetrieval(query: string, chunks: string[]): Promise<GuardrailVerdict> {
    if (!this.isEnabled('retrieval')) return ALLOW
    try {
      const v = await this.send('validate_retrieval', { query, chunks })
      return this.applyAdvisory(v)
    } catch (e: any) {
      return { ...ALLOW, reason: `fail-open: ${e.message ?? e}` }
    }
  }

  async validateOutput(user: string, answer: string, context: string): Promise<GuardrailVerdict> {
    if (!this.isEnabled('output')) return ALLOW
    try {
      const v = await this.send('validate_output', { user, answer, context })
      return this.applyAdvisory(v)
    } catch (e: any) {
      return { ...ALLOW, reason: `fail-open: ${e.message ?? e}` }
    }
  }

  async validateExecution(tool: string, params: any): Promise<GuardrailVerdict> {
    if (!this.isEnabled('execution')) return ALLOW
    try {
      const v = await this.send('validate_execution', { tool, params })
      return this.applyAdvisory(v)
    } catch (e: any) {
      return { ...ALLOW, reason: `fail-open: ${e.message ?? e}` }
    }
  }

  async ping(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.send('ping', {})
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  }

  shutdown() {
    if (!this.proc) return
    try { this.proc.stdin.write(JSON.stringify({ id: 0, cmd: 'shutdown' }) + '\n') } catch { /* ignore */ }
    try { this.proc.kill() } catch { /* ignore */ }
    this.proc = null
    this.failAllPending(new Error('shutdown'))
  }
}

export const guardrailsWrapper = new GuardrailsWrapper()
