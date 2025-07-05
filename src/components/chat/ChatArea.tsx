import { useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '@/stores/chatStore'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { ChatHeader } from './ChatHeader'
import { cn } from '@/utils/cn'

export function ChatArea() {
  const { t } = useTranslation()
  const { activeConversationId, conversations, isLoading, streamingMessage } = useChatStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const activeConversation = conversations.find(c => c.id === activeConversationId)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [activeConversation?.messages, streamingMessage])

  if (!activeConversation) {
    return (
      <div className="flex-1 flex flex-col h-full bg-background">
        {/* Welcome Screen */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-6 max-w-md mx-auto px-6">
            <div className="relative">
              <div className="w-20 h-20 bg-gradient-to-br from-primary to-primary/70 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
                <span className="text-3xl">💬</span>
              </div>
              <div className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                <span className="text-lg">✨</span>
              </div>
            </div>
            
            <div className="space-y-3">
              <h2 className="text-2xl font-bold text-foreground">{t('chat.welcome.title')}</h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                {t('chat.welcome.subtitle')}
              </p>
            </div>
            
            <button
              onClick={() => useChatStore.getState().createNewConversation()}
              className={cn(
                "px-8 py-3 bg-primary text-primary-foreground rounded-xl font-medium",
                "hover:bg-primary/90 transition-all duration-200 shadow-lg hover:shadow-xl",
                "transform hover:scale-105"
              )}
            >
              {t('chat.welcome.startNewChat')}
            </button>
            
            <div className="text-sm text-muted-foreground/70">
              {t('chat.welcome.selectModelHint')}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-background min-h-0">
      {/* Header with conversation info and model selector */}
      <div className="flex-shrink-0 border-b border-border/50 bg-card z-10">
        <ChatHeader conversation={activeConversation} />
      </div>
      
      {/* Messages area with proper scrolling */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-4">
          <MessageList 
            messages={activeConversation.messages} 
            isLoading={isLoading}
            streamingMessage={streamingMessage}
          />
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-border/50 bg-card/30">
        <MessageInput />
      </div>
    </div>
  )
}