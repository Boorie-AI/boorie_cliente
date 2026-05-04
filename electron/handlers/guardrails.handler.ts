import { ipcMain } from 'electron'
import { PrismaClient } from '@prisma/client'
import { guardrailsWrapper, GuardrailVerdict, RailName } from '../../backend/services/guardrails/guardrailsWrapper'

interface SettingsShape {
  enabled: Record<RailName, boolean>
  advisoryMode: boolean
  judgeProvider: 'ollama' | 'nvidia-api'
  judgeModel: string
  ollamaBaseUrl: string
  nvidiaApiKey?: string
}

const DEFAULT_SETTINGS: SettingsShape = {
  enabled: { input: true, retrieval: true, output: true, execution: true },
  advisoryMode: false,
  judgeProvider: 'ollama',
  judgeModel: 'nemotron-mini',
  ollamaBaseUrl: 'http://localhost:11434',
  nvidiaApiKey: undefined,
}

let cachedSettings: SettingsShape | null = null

async function loadSettings(prisma: PrismaClient): Promise<SettingsShape> {
  if (cachedSettings) return cachedSettings
  const row = await prisma.appSetting.findFirst({ where: { key: 'guardrails_settings' } })
  if (!row) {
    cachedSettings = DEFAULT_SETTINGS
    return cachedSettings
  }
  try {
    cachedSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) }
  } catch {
    cachedSettings = DEFAULT_SETTINGS
  }
  return cachedSettings!
}

async function saveSettings(prisma: PrismaClient, next: SettingsShape) {
  cachedSettings = next
  await prisma.appSetting.upsert({
    where: { key: 'guardrails_settings' },
    create: { key: 'guardrails_settings', value: JSON.stringify(next), category: 'guardrails' },
    update: { value: JSON.stringify(next) },
  })
  guardrailsWrapper.configure({
    enabled: next.enabled,
    advisoryMode: next.advisoryMode,
    judgeProvider: next.judgeProvider,
    judgeModel: next.judgeModel,
    ollamaBaseUrl: next.ollamaBaseUrl,
    nvidiaApiKey: next.nvidiaApiKey,
  })
}

async function audit(
  prisma: PrismaClient,
  rail: RailName,
  verdict: GuardrailVerdict,
  payload: any,
  conversationId?: string,
  messageId?: string,
) {
  if (verdict.allow && !verdict.reason.startsWith('[advisory]')) return
  try {
    await prisma.guardrailViolation.create({
      data: {
        conversationId: conversationId ?? null,
        messageId: messageId ?? null,
        rail,
        severity: verdict.severity,
        reason: verdict.reason,
        blocked: !verdict.allow,
        judgeModel: verdict.judge_model,
        judgeProvider: verdict.judge_provider,
        payload: payload ? JSON.stringify(payload).slice(0, 4000) : null,
      },
    })
  } catch (e) {
    console.warn('[Guardrails] failed to audit violation:', e)
  }
}

export function registerGuardrailsHandlers(prisma?: PrismaClient) {
  const prismaClient = prisma || new PrismaClient()

  // Apply persisted settings at startup
  loadSettings(prismaClient).then((s) => {
    guardrailsWrapper.configure({
      enabled: s.enabled,
      advisoryMode: s.advisoryMode,
      judgeProvider: s.judgeProvider,
      judgeModel: s.judgeModel,
      ollamaBaseUrl: s.ollamaBaseUrl,
      nvidiaApiKey: s.nvidiaApiKey,
    })
  }).catch(() => { /* fail-open */ })

  ipcMain.handle('guardrails:getSettings', async () => {
    return await loadSettings(prismaClient)
  })

  ipcMain.handle('guardrails:setSettings', async (_e, next: Partial<SettingsShape>) => {
    const current = await loadSettings(prismaClient)
    const merged: SettingsShape = { ...current, ...next, enabled: { ...current.enabled, ...(next.enabled ?? {}) } }
    await saveSettings(prismaClient, merged)
    return merged
  })

  ipcMain.handle('guardrails:ping', async () => {
    return guardrailsWrapper.ping()
  })

  ipcMain.handle('guardrails:validateInput', async (_e, args: { text: string; conversationId?: string; messageId?: string }) => {
    const v = await guardrailsWrapper.validateInput(args.text)
    await audit(prismaClient, 'input', v, { text: args.text }, args.conversationId, args.messageId)
    return v
  })

  ipcMain.handle('guardrails:validateRetrieval', async (_e, args: { query: string; chunks: string[]; conversationId?: string }) => {
    const v = await guardrailsWrapper.validateRetrieval(args.query, args.chunks)
    await audit(prismaClient, 'retrieval', v, { query: args.query, chunkCount: args.chunks.length }, args.conversationId)
    return v
  })

  ipcMain.handle('guardrails:validateOutput', async (_e, args: { user: string; answer: string; context: string; conversationId?: string; messageId?: string }) => {
    const v = await guardrailsWrapper.validateOutput(args.user, args.answer, args.context)
    await audit(prismaClient, 'output', v, { user: args.user, answer: args.answer.slice(0, 1000) }, args.conversationId, args.messageId)
    return v
  })

  ipcMain.handle('guardrails:validateExecution', async (_e, args: { tool: string; params: any; conversationId?: string }) => {
    const v = await guardrailsWrapper.validateExecution(args.tool, args.params)
    await audit(prismaClient, 'execution', v, { tool: args.tool, params: args.params }, args.conversationId)
    return v
  })

  ipcMain.handle('guardrails:listViolations', async (_e, options?: { limit?: number; rail?: RailName; conversationId?: string }) => {
    const where: any = {}
    if (options?.rail) where.rail = options.rail
    if (options?.conversationId) where.conversationId = options.conversationId
    return prismaClient.guardrailViolation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 100,
    })
  })
}

export { guardrailsWrapper }
