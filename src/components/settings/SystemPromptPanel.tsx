import { useState, useEffect } from 'react'

import { Save, RotateCcw, FileText } from 'lucide-react'
import { cn } from '@/utils/cn'
import { databaseService } from '@/services/database'

export function SystemPromptPanel() {
  // const { t } = useTranslation()
  const [systemPrompt, setSystemPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  // Default system prompt for hydraulic engineering
  const defaultPrompt = `Eres un asistente especializado en ingeniería hidráulica con experiencia en:

- Diseño de redes de distribución de agua
- Cálculos hidráulicos y análisis de presiones  
- Normativas españolas, mexicanas y colombianas
- Uso de software EPANET y WNTR
- Selección y dimensionado de equipos

INSTRUCCIONES:
- Proporciona respuestas técnicas precisas
- Incluye fórmulas cuando sea relevante
- Cita las normativas aplicables
- Responde en español técnico apropiado
- Usa unidades del sistema métrico
- Cuando sea posible, sugiere verificaciones adicionales`

  useEffect(() => {
    loadSystemPrompt()
  }, [])

  const loadSystemPrompt = async () => {
    try {
      setIsLoading(true)
      const result = await databaseService.getSetting('system_prompt')
      if (result) {
        setSystemPrompt(result)
      } else {
        setSystemPrompt(defaultPrompt)
      }
    } catch (error) {
      console.error('Error loading system prompt:', error)
      setSystemPrompt(defaultPrompt)
    } finally {
      setIsLoading(false)
    }
  }

  const saveSystemPrompt = async () => {
    try {
      setIsSaving(true)
      const success = await databaseService.setSetting(
        'system_prompt',
        systemPrompt,
        'chat'
      )

      if (success) {
        setLastSaved(new Date())
        console.log('✅ System prompt saved successfully')
        alert('Prompt del sistema guardado correctamente')
      } else {
        console.error('❌ Failed to save system prompt')
        alert('Error al guardar el prompt del sistema')
      }
    } catch (error) {
      console.error('Error saving system prompt:', error)
      alert('Error al guardar el prompt del sistema')
    } finally {
      setIsSaving(false)
    }
  }

  const testSystemPrompt = async () => {
    try {
      // Test the system prompt by getting it from database
      const retrieved = await databaseService.getSetting('system_prompt')
      console.log('🧪 System prompt test:', {
        saved: systemPrompt.length,
        retrieved: retrieved?.length || 0,
        matches: retrieved === systemPrompt
      })

      if (retrieved === systemPrompt) {
        alert('✅ System prompt está guardado correctamente en la base de datos')
      } else {
        alert('❌ El prompt en la base de datos no coincide con el mostrado')
      }
    } catch (error) {
      console.error('Error testing system prompt:', error)
      alert('Error al probar el prompt del sistema')
    }
  }

  const resetToDefault = () => {
    setSystemPrompt(defaultPrompt)
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando configuración...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-6 pb-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-card-foreground">System Prompt</h2>
              <p className="text-sm text-muted-foreground">
                Configura el prompt del sistema que se usará en todas las conversaciones
              </p>
            </div>
          </div>
        </div>

        {/* Main Configuration Card */}
        <div className="bg-card rounded-xl border border-border p-6 space-y-6">
          {/* Description */}
          <div className="space-y-2">
            <h3 className="font-medium text-card-foreground">
              Configuración del Prompt Global
            </h3>
            <p className="text-sm text-muted-foreground">
              Este prompt se aplicará automáticamente al inicio de todas las conversaciones de chat,
              independientemente del proveedor de AI que uses (OpenAI, Anthropic, etc.).
              Define aquí la personalidad y especialización de tu asistente.
            </p>
          </div>

          {/* System Prompt Editor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-card-foreground">
                Prompt del Sistema
              </label>
              <div className="flex items-center space-x-2">
                {lastSaved && (
                  <span className="text-xs text-muted-foreground">
                    Guardado: {lastSaved.toLocaleTimeString()}
                  </span>
                )}
                <button
                  onClick={resetToDefault}
                  className="flex items-center space-x-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Restaurar</span>
                </button>
              </div>
            </div>

            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={defaultPrompt}
              rows={16}
              className="w-full px-3 py-3 bg-input border border-border rounded-lg text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none text-sm font-mono resize-vertical"
            />

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                <span>Caracteres: {systemPrompt.length}</span>
                <span>Líneas: {systemPrompt.split('\n').length}</span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={testSystemPrompt}
                  className="px-3 py-2 text-sm border border-border rounded-lg text-foreground hover:bg-accent transition-colors"
                >
                  Test DB
                </button>
                <button
                  onClick={saveSystemPrompt}
                  disabled={isSaving}
                  className={cn(
                    "flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all",
                    "bg-primary text-primary-foreground hover:bg-primary/90",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {isSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Guardar Prompt</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Usage Information */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2">💡 Cómo funciona</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• El prompt se aplicará automáticamente al inicio de cada conversación</li>
            <li>• Funciona con todos los proveedores de AI configurados</li>
            <li>• Se combina con el sistema RAG si tienes documentos indexados</li>
            <li>• Puedes modificarlo en cualquier momento</li>
          </ul>
        </div>

        {/* Examples */}
        <div className="bg-accent/30 border border-border rounded-lg p-4">
          <h4 className="font-medium text-card-foreground mb-3">🎯 Ejemplos de uso</h4>
          <div className="grid gap-4">
            <div>
              <h5 className="font-medium text-sm text-card-foreground mb-1">Para Ingeniería Hidráulica:</h5>
              <p className="text-xs text-muted-foreground">
                "Eres un ingeniero hidráulico especializado en redes de distribución..."
              </p>
            </div>
            <div>
              <h5 className="font-medium text-sm text-card-foreground mb-1">Para Consultoría Técnica:</h5>
              <p className="text-xs text-muted-foreground">
                "Actúas como consultor técnico senior, siempre cita normativas y estándares..."
              </p>
            </div>
            <div>
              <h5 className="font-medium text-sm text-card-foreground mb-1">Para Educación:</h5>
              <p className="text-xs text-muted-foreground">
                "Eres un profesor de ingeniería, explica conceptos paso a paso..."
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}