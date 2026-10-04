import { useTranslation } from 'react-i18next'
import { Message } from '@/stores/chatStore'
import { MessageBubble } from './MessageBubble'
import { TypingIndicator } from './TypingIndicator'
import { usePreferencesStore } from '@/stores/preferencesStore'

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
  streamingMessage: string
  /** La respuesta ya está y se revisa contra el documento (#223). */
  revisando?: boolean
}

export function MessageList({ messages, isLoading, streamingMessage, revisando = false }: MessageListProps) {
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
    </div>
  )
}
