import { useTranslation } from 'react-i18next'
import { marcaDeFuente } from '@/services/contextoConocimiento'
import { logger } from '@/utils/logger'
import { Message } from '@/stores/chatStore'
import { Copy, User, Bot } from 'lucide-react'
import { useState } from 'react'
import { MarkdownRenderer } from './MarkdownRenderer'
import { PropuestaEscenario } from './PropuestaEscenario'
import { PropuestaEnergia } from './PropuestaEnergia'
import { FeedbackRecomendacion } from '@/components/hydraulic/FeedbackRecomendacion'
import { useChatStore } from '@/stores/chatStore'
import { AvisoDescargo } from '@/components/descargo/AvisoDescargo'

interface MessageBubbleProps {
  message: Message
  isStreaming?: boolean
}

export function MessageBubble({ message, isStreaming = false }: MessageBubbleProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'
  const propuesta = message.metadata?.propuesta_escenario
  const propuestaEnergia = message.metadata?.propuesta_energia

  /**
   * La narración del escenario entra como un mensaje más del asistente (#44).
   *
   * Así queda en el historial y se guarda con la conversación: la cifra y su
   * cita de origen tienen que sobrevivir a cerrar la aplicación, no vivir en el
   * estado de un componente.
   */
  const anadirNarracion = (
    texto: string,
    runId: string | null,
    valorables?: Array<{ runId: string; titulo: string; contexto?: Record<string, unknown> }>,
  ) => {
    const { activeConversationId, addMessageToConversation } = useChatStore.getState()
    if (!activeConversationId) return
    addMessageToConversation(activeConversationId, {
      role: 'assistant',
      content: texto,
      metadata: {
        escenarioEjecutado: runId ?? undefined,
        ...(valorables?.length ? { recomendaciones_energia: valorables } : {}),
      },
    })
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      logger.error('Failed to copy text:', error)
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}>
      <div className={`flex w-full ${isUser ? 'flex-row-reverse max-w-[85%]' : 'flex-row max-w-full'}`}>
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

            {/* Valorar cada medida narrada, con la ejecución que la respalda (#42). */}
            {message.metadata?.recomendaciones_energia?.length && !isUser ? (
              <div className="mt-2 border-t pt-2 space-y-2">
                {message.metadata.recomendaciones_energia.map(r => (
                  <div key={r.runId}>
                    <div className="text-[11px] font-medium">{r.titulo}</div>
                    <FeedbackRecomendacion runId={r.runId} titulo={r.titulo} contexto={r.contexto} compacto />
                  </div>
                ))}
              </div>
            ) : null}

            {propuestaEnergia && !isUser && (
              <PropuestaEnergia
                projectId={propuestaEnergia.project_id ?? null}
                redId={propuestaEnergia.red_id ?? null}
                onNarracion={(texto, valorables) => anadirNarracion(texto, null, valorables)}
              />
            )}

            {propuesta && !isUser && (
              <PropuestaEscenario
                propuesta={propuesta}
                networkId={propuesta.red_id ?? null}
                onNarracion={anadirNarracion}
              />
            )}

            {/* Metadata */}
            {message.metadata && !isUser && (
              <div className="mt-2 pt-2 border-t border-border text-xs text-muted-foreground">
                {/* El modelo no se enseña: la especificación lo quiere
                    invisible y queda anotado en el log (#49). */}
                <div className="flex items-center space-x-2">
                  <span>{message.metadata.provider}</span>
                  {message.metadata.tokens && (
                    <>
                      <span>•</span>
                      <span>{message.metadata.tokens} tokens</span>
                    </>
                  )}
                  {message.metadata.modeloDegradado && (
                    <>
                      <span>•</span>
                      <span className="text-yellow-600 dark:text-yellow-500">
                        {t('chatInput.helperAnswer')}
                      </span>
                    </>
                  )}
                </div>
                {message.metadata.sources && message.metadata.sources.length > 0 && (
                  <div className="mt-2">
                    <div className="flex items-center space-x-1 mb-1">
                      <span className="font-semibold text-blue-600">📚 {t('chatInput.ragSources')}</span>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-950/20 rounded-md p-2 space-y-1">
                      {message.metadata.sources.map((source: any, index: number) => (
                        <div key={index} className="text-xs">
                          {typeof source === 'string' ? (
                            <div className="text-blue-700 dark:text-blue-300">• {source}</div>
                          ) : (
                            <div className="space-y-1">
                              {/**
                                * La marca va aquí y en el prompt, y tienen que
                                * ser la misma: una cita «(F1)» que el lector no
                                * puede resolver en esta lista es peor que
                                * ninguna, porque parece comprobable y no lo es.
                                */}
                              <div className="font-medium text-blue-800 dark:text-blue-200">
                                <span className="font-mono mr-1">[{marcaDeFuente(index)}]</span>
                                📄 {source.title || `Documento ${index + 1}`}
                              </div>
                              {(source.section || source.page) && (
                                <div className="text-blue-600 dark:text-blue-400">
                                  🔖 {[
                                    source.section && `${t('chatInput.ragSection')} ${source.section}`,
                                    source.page && `${t('chatInput.ragPage')} ${source.page}`,
                                  ].filter(Boolean).join(' · ')}
                                </div>
                              )}
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
                    <span className="text-xs text-green-600 dark:text-green-400">🧠 {t('chatInput.ragOn')}</span>
                    {message.metadata.originalQuery && message.metadata.originalQuery !== message.content && (
                      <span className="text-xs text-amber-600 dark:text-amber-400">✨ {t('chatInput.improvedQuery')}</span>
                    )}
                  </div>
                )}

                {message.metadata.ragAttempted && (!message.metadata.sources || message.metadata.sources.length === 0) && (
                  <div className="mt-1 flex items-center space-x-1">
                    <span className="text-xs text-muted-foreground">🧠 {t('chatInput.ragNothing')}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* El aviso va pegado a la respuesta, no en un rincón de la pantalla
              (#108): es lo único de Boorie que puede inventarse una cifra
              entera, y quien la lee la lee aquí. Sólo en las de la IA: en lo
              que ha escrito la persona no hay nada de lo que avisar. */}
          {!isUser && <AvisoDescargo variante="ia" />}
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
            title={t('chatInput.copy')}
          >
            <Copy size={12} />
          </button>

          {copied && (
            <span className="text-xs text-green-600">{t('chatInput.copied')}</span>
          )}
        </div>
      </div>
    </div>
  )
}