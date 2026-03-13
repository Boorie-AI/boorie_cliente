import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { findPythonPath, resetPythonPathCache } from './pythonDetector'

// Mock fs and child_process
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
    default: { ...actual.default, existsSync: vi.fn().mockReturnValue(false) },
    existsSync: vi.fn().mockReturnValue(false),
  }
})

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
    execSync: vi.fn().mockImplementation(() => { throw new Error('not found') }),
  }
})

describe('pythonDetector', () => {
  beforeEach(() => {
    resetPythonPathCache()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should use PYTHON_PATH env variable when set', () => {
    vi.stubEnv('PYTHON_PATH', '/custom/python3')
    const result = findPythonPath()
    expect(result).toBe('/custom/python3')
  })

  it('should cache the result after first call', () => {
    vi.stubEnv('PYTHON_PATH', '/cached/python3')
    const first = findPythonPath()
    vi.stubEnv('PYTHON_PATH', '/different/python3')
    const second = findPythonPath()
    expect(first).toBe(second)
    expect(second).toBe('/cached/python3')
  })

  it('should reset cache when resetPythonPathCache is called', () => {
    vi.stubEnv('PYTHON_PATH', '/first/python3')
    const first = findPythonPath()
    resetPythonPathCache()
    vi.stubEnv('PYTHON_PATH', '/second/python3')
    const second = findPythonPath()
    expect(first).toBe('/first/python3')
    expect(second).toBe('/second/python3')
  })

  it('should return a string path when no PYTHON_PATH is set', () => {
    // When PYTHON_PATH is not set, findPythonPath should still return a valid string
    delete process.env.PYTHON_PATH
    resetPythonPathCache()
    const result = findPythonPath()
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})
