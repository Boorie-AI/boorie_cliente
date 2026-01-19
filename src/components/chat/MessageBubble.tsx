import { Message } from '@/stores/chatStore'
import { Copy, User, Bot } from 'lucide-react'
import { useState } from 'react'
import { MarkdownRenderer } from './MarkdownRenderer'

interface MessageBubbleProps {
  message: Message
  isStreaming?: boolean
}

export function MessageBubble({ message, isStreaming = false }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy text:', error)
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}>
      <div className={`flex max-w-[90%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar */}
        <div className={`flex-shrink-0 ${isUser ? 'ml-3' : 'mr-3'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}>
            {isUser ? <User size={16} /> : <Bot size={16} />}
          </div>
        </div>

        {/* Message Content */}
        <div className={`relative ${isUser ? 'mr-2' : 'ml-2'}`}>
          <div className={`rounded-lg p-4 ${isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
            } ${isStreaming ? 'animate-pulse' : ''}`}>
            {/* Message text */}
            <div className="relative">
              <MarkdownRenderer content={message.content} />
              {isStreaming && !isUser && (
                <span className="animate-pulse text-primary ml-1">▌</span>
              )}
            </div>

            {/* Metadata */}
            {message.metadata && !isUser && (
              <div className="mt-2 pt-2 border-t border-border text-xs text-muted-foreground">
                <div className="flex items-center space-x-2">
                  <span>{message.metadata.provider}</span>
                  <span>•</span>
                  <span>{message.metadata.model}</span>
                  {message.metadata.tokens && (
                    <>
                      <span>•</span>
                      <span>{message.metadata.tokens} tokens</span>
                    </>
                  )}
                </div>
                {message.metadata.sources && message.metadata.sources.length > 0 && (
                  <div className="mt-2">
                    <div className="flex items-center space-x-1 mb-1">
                      <span className="font-semibold text-blue-600">📚 Fuentes RAG:</span>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-950/20 rounded-md p-2 space-y-1">
                      {message.metadata.sources.map((source: any, index: number) => (
                        <div key={index} className="text-xs">
                          {typeof source === 'string' ? (
                            <div className="text-blue-700 dark:text-blue-300">• {source}</div>
                          ) : (
                            <div className="space-y-1">
                              <div className="font-medium text-blue-800 dark:text-blue-200">
                                📄 {source.title || `Documento ${index + 1}`}
                              </div>
                              {source.category && (
                                <div className="text-blue-600 dark:text-blue-400">
                                  🏷️ {source.category}
                                </div>
                              )}
                              {source.relevance && (
                                <div className="text-blue-600 dark:text-blue-400">
                                  🎯 Relevancia: {(source.relevance * 100).toFixed(0)}%
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {message.metadata.ragEnabled && (
                  <div className="mt-1 flex items-center space-x-1">
                    <span className="text-xs text-green-600 dark:text-green-400">🧠 RAG Habilitado</span>
                    {message.metadata.originalQuery && message.metadata.originalQuery !== message.content && (
                      <span className="text-xs text-amber-600 dark:text-amber-400">✨ Consulta mejorada</span>
                    )}
                  </div>
                )}

                {message.metadata.ragAttempted && (!message.metadata.sources || message.metadata.sources.length === 0) && (
                  <div className="mt-1 flex items-center space-x-1">
                    <span className="text-xs text-muted-foreground">🧠 RAG: Sin información relevante encontrada</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Timestamp and actions */}
        <div className={`flex items-center mt-1 space-x-2 opacity-0 group-hover:opacity-100 transition-opacity ${isUser ? 'justify-end' : 'justify-start'
          }`}>
          <span className="text-xs text-muted-foreground">
            {formatTime(message.timestamp)}
          </span>

          <button
            onClick={handleCopy}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            title="Copy message"
          >
            <Copy size={12} />
          </button>

          {copied && (
            <span className="text-xs text-green-600">Copied!</span>
          )}
        </div>
      </div>
    </div>
  )
}