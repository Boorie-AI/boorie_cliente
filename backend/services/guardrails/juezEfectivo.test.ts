import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: () => {}, removeAllListeners: () => {} } }))

import { juezEfectivo } from './guardrailsWrapper'
import { sinClavePropia } from '../../../electron/handlers/guardrails.handler'

const CLAVE = 'nvapi-FAKEjuez0123456789abcdefghijklm'

describe('el juez de guardrails y la clave de NVIDIA (#225, R10, R20)', () => {
  it('con consentimiento usa la clave del proveedor NVIDIA', () => {
    expect(juezEfectivo({ judgeProvider: 'nvidia-api', judgeModel: 'nvidia/x' }, true, CLAVE))
      .toEqual({ proveedor: 'nvidia-api', modelo: 'nvidia/x', clave: CLAVE })
  })

  it('sin consentimiento juzga en local, con un modelo que Ollama tenga, y sin clave', () => {
    expect(juezEfectivo({ judgeProvider: 'nvidia-api', judgeModel: 'nvidia/x' }, false, CLAVE))
      .toEqual({ proveedor: 'ollama', modelo: 'nemotron-mini', clave: '' })
  })

  it('sin clave en el proveedor, también en local', () => {
    expect(juezEfectivo({ judgeProvider: 'nvidia-api', judgeModel: 'nvidia/x' }, true, null).proveedor).toBe('ollama')
  })

  it('el juez local no cambia', () => {
    expect(juezEfectivo({ judgeProvider: 'ollama', judgeModel: 'qwen' }, false, null))
      .toEqual({ proveedor: 'ollama', modelo: 'qwen', clave: '' })
  })

  it('los ajustes de guardrails ya no llevan clave, ni al leerlos ni al guardarlos', () => {
    const ajustes = sinClavePropia({ judgeProvider: 'nvidia-api', nvidiaApiKey: CLAVE })
    expect(ajustes.judgeProvider).toBe('nvidia-api')
    expect(JSON.stringify(ajustes)).not.toContain(CLAVE)
    expect('nvidiaApiKey' in ajustes).toBe(false)
  })
})
