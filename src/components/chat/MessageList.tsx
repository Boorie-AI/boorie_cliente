import { Message } from '@/stores/chatStore'
import { MessageBubble } from './MessageBubble'
import { TypingIndicator } from './TypingIndicator'
import { usePreferencesStore } from '@/stores/preferencesStore'

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
  streamingMessage: string
}

export function MessageList({ messages, isLoading, streamingMessage }: MessageListProps) {
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
    </div>
  )
}