import { useTranslation } from 'react-i18next'
import { Bot } from 'lucide-react'

interface TypingIndicatorProps {
  show: boolean
}

export function TypingIndicator({ show }: TypingIndicatorProps) {
  const { t } = useTranslation()

  if (!show) return null

  return (
    <div className="flex justify-start group">
      <div className="flex max-w-[70%]">
        {/* Avatar */}
        <div className="flex-shrink-0 mr-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-muted text-muted-foreground">
            <Bot size={16} />
          </div>
        </div>

        {/* Typing Animation */}
        <div className="relative ml-2">
          <div className="rounded-lg p-4 bg-muted text-foreground">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">
                {t('chat.aiThinking')}
              </span>
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}