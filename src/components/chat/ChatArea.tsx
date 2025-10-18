import { useRef, useEffect, useState } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { ChatHeader } from './ChatHeader'
import { ProjectSelector } from './ProjectSelector'
import { ProjectConversationsList } from './ProjectConversationsList'
import { cn } from '@/utils/cn'
import boorieIconLight from '@/assets/boorie_icon_light.png'

export function ChatArea() {
  const { activeConversationId, conversations, isLoading, streamingMessage } = useChatStore()
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>()
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
              <img 
                src={boorieIconLight} 
                alt="Boorie Logo" 
                className="w-32 h-auto mx-auto mb-6 drop-shadow-lg"
              />
            </div>
            
            <div className="space-y-3">
              <h2 className="text-2xl font-bold text-foreground">Welcome to Boorie</h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Your intelligent AI assistant is ready to help. Start a conversation to begin exploring the possibilities.
              </p>
            </div>
            
            <div className="space-y-4 flex flex-col items-center">
              <ProjectSelector 
                selectedProjectId={selectedProjectId}
                onProjectSelect={setSelectedProjectId}
                className="justify-center"
              />
              
              <button
                onClick={() => useChatStore.getState().createNewConversation(selectedProjectId)}
                className={cn(
                  "px-8 py-3 bg-primary text-primary-foreground rounded-xl font-medium",
                  "hover:bg-primary/90 transition-all duration-200 shadow-lg hover:shadow-xl",
                  "transform hover:scale-105"
                )}
              >
                Start New Chat
              </button>
            </div>
            
            <div className="text-sm text-muted-foreground/70">
              {selectedProjectId ? 
                "This conversation will be linked to the selected project" :
                "Select a project to link conversations or start without one"
              }
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex bg-background">
      <div className="flex-1 flex flex-col min-h-0">
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
      
      {/* Project conversations list */}
      <ProjectConversationsList 
        projectId={activeConversation.projectId} 
        currentConversationId={activeConversation.id}
      />
    </div>
  )
}