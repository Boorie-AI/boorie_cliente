import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Message, type EsperaDelProveedor } from '@/stores/chatStore'
import { MessageBubble } from './MessageBubble'
import { TypingIndicator } from './TypingIndicator'
import { usePreferencesStore } from '@/stores/preferencesStore'

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
  streamingMessage: string
  /** La respuesta ya está y se revisa contra el documento (#223). */
  revisando?: boolean
  /** El proveedor está saturado y se repite al acabar la cuenta (#266). */
  esperaDelProveedor?: EsperaDelProveedor | null
}

function AvisoDeEspera({ espera }: { espera: EsperaDelProveedor }) {
  const { t } = useTranslation()
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    setAhora(Date.now())
    const reloj = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(reloj)
  }, [espera])
  const segundos = Math.max(0, Math.ceil((espera.hasta - ahora) / 1000))
  const datos = { proveedor: espera.proveedor, intento: espera.intento, total: espera.total, segundos }
  return (
    <p role="status" className="ml-11 text-sm text-muted-foreground">
      {segundos > 0 ? t('chat.esperaProveedor.cuentaAtras', datos) : t('chat.esperaProveedor.reintentando', datos)}
    </p>
  )
}

export function MessageList({ messages, isLoading, streamingMessage, revisando = false, esperaDelProveedor = null }: MessageListProps) {
  const { t } = useTranslation()
  const { showTypingIndicators } = usePreferencesStore()

  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}

      <TypingIndicator show={isLoading && showTypingIndicators && !streamingMessage} />

      {streamingMessage && (
        <MessageBubble
          message={{
            id: 'streaming',
            role: 'assistant',
            content: streamingMessage,
            timestamp: new Date()
          }}
          isStreaming
        />
      )}

      {/* Debajo del texto, no en su lugar: lo que se está leyendo no desaparece. */}
      {isLoading && revisando && (
        <p role="status" className="ml-11 text-sm text-muted-foreground animate-pulse">
          {t('chat.revision.enCurso')}
        </p>
      )}

      {isLoading && esperaDelProveedor && <AvisoDeEspera espera={esperaDelProveedor} />}
    </div>
  )
}
