import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import { useAIConfigStore } from '@/stores/aiConfigStore'
import { cargarModelosRAG, guardarModeloElegido, modeloElegido, type ModeloElegido } from '@/config/modelosRAG'
import { logger } from '@/utils/logger'

/** Los de embeddings no redactan: sacarlos de la lista evita elegir uno que no puede responder. */
const DE_EMBEDDINGS = /embed|bge|(^|[-/])e5[-:]|minilm/i

const AUTOMATICO = 'auto'
const separar = (valor: string) => {
  const i = valor.indexOf('::')
  return { proveedorId: valor.slice(0, i), modelo: valor.slice(i + 2) }
}

/**
 * Qué modelo redacta las respuestas del chat (#49 lo dejó fijo; aquí se vuelve a poder elegir).
 *
 * Local o de un proveedor externo con clave. Sólo cambia quién redacta: el auxiliar que gradúa las
 * fuentes fragmento a fragmento sigue siendo el local, porque se llama hasta veinte veces por
 * pregunta.
 */
export function ModeloDeRespuesta({ modelosOllama }: { modelosOllama: string[] }) {
  const { t } = useTranslation()
  const providers = useAIConfigStore(s => s.providers)
  const [automatico, setAutomatico] = useState<string>('')
  const [valor, setValor] = useState<string>(AUTOMATICO)
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    cargarModelosRAG().then(m => {
      setAutomatico(m?.modeloRespuesta ?? '')
      const e = modeloElegido()
      if (e) setValor(`${e.proveedorId}::${e.modelo}`)
    })
  }, [])

  const ollama = providers.find(p => p.type === 'local')
  const idOllama = ollama?.id ?? 'ollama'
  const locales = modelosOllama.filter(m => !DE_EMBEDDINGS.test(m))
  const externos = useMemo(
    () => providers.filter(p => p.type === 'api' && p.apiKey && p.availableModels.length > 0),
    [providers]
  )

  const aElegido = (v: string): ModeloElegido | null => {
    if (v === AUTOMATICO) return null
    const { proveedorId, modelo } = separar(v)
    const proveedor = proveedorId === idOllama ? 'Ollama' : providers.find(p => p.id === proveedorId)?.name ?? ''
    return { proveedorId, proveedor, modelo }
  }
  const actual = aElegido(valor)
  const esExterno = !!actual && actual.proveedor.toLowerCase() !== 'ollama'

  const cambiar = async (nuevo: string) => {
    setValor(nuevo)
    setGuardado(false)
    try {
      await guardarModeloElegido(aElegido(nuevo))
      setGuardado(true)
    } catch (error) {
      logger.error('No se pudo guardar el modelo de respuesta:', error)
    }
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6 space-y-3">
      <div>
        <h2 className="text-xl font-semibold text-card-foreground">{t('ai.modeloRespuesta.titulo')}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{t('ai.modeloRespuesta.descripcion')}</p>
      </div>

      <select
        aria-label={t('ai.modeloRespuesta.titulo')}
        value={valor}
        onChange={e => cambiar(e.target.value)}
        className="w-full max-w-xl bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"
      >
        <option value={AUTOMATICO}>
          {t('ai.modeloRespuesta.automatico', { modelo: automatico || '…' })}
        </option>
        {locales.length > 0 && (
          <optgroup label={t('ai.modeloRespuesta.local')}>
            {locales.map(m => (
              <option key={m} value={`${idOllama}::${m}`}>{m}</option>
            ))}
          </optgroup>
        )}
        {externos.map(p => (
          <optgroup key={p.id} label={p.name}>
            {p.availableModels.map(m => (
              <option key={m.modelId} value={`${p.id}::${m.modelId}`}>{m.modelName || m.modelId}</option>
            ))}
          </optgroup>
        ))}
      </select>

      {externos.length === 0 && (
        <p className="text-xs text-muted-foreground">{t('ai.modeloRespuesta.sinExternos')}</p>
      )}

      {esExterno && actual && (
        <div className="flex items-start space-x-2 p-3 rounded-lg bg-accent/40 border border-border/50 text-xs text-muted-foreground">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{t('ai.modeloRespuesta.avisoExterno', { proveedor: actual.proveedor })}</span>
        </div>
      )}

      {guardado && <p className="text-xs text-muted-foreground">{t('ai.modeloRespuesta.guardado')}</p>}
    </div>
  )
}
