import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { Send } from 'lucide-react'

export function MessageInput() {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { sendMessage, isLoading } = useChatStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim() || isLoading) return

    const messageToSend = message.trim()
    setMessage('')

    try {
      await sendMessage(messageToSend)
      // Re-focus the input after sending
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus()
        }
      }, 100)
    } catch (error) {
      console.error('Failed to send message:', error)
      // Re-focus even on error
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus()
        }
      }, 100)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }
  }, [message])

  // Auto-focus input when component mounts
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

  return (
    <div className="p-4 border-t border-border bg-card relative z-10">
      <form onSubmit={handleSubmit} className="flex items-center space-x-2"
            onClick={(e) => {
              // If clicking on the form but not on a button, focus the textarea
              if (e.target === e.currentTarget) {
                textareaRef.current?.focus()
              }
            }}>
        {/* Message input */}
        <div className="flex-1 relative">
          <textarea
            id="message-input"
            name="message"
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onClick={() => textareaRef.current?.focus()}
            onFocus={() => {
              // Ensure the textarea is properly focused
              if (textareaRef.current) {
                textareaRef.current.setSelectionRange(
                  textareaRef.current.value.length,
                  textareaRef.current.value.length
                )
              }
            }}
            placeholder="Type your message... (Press Enter to send, Shift+Enter for new line)"
            className="w-full p-3 bg-input text-foreground border border-border rounded-lg focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 resize-none min-h-[44px] max-h-[200px] placeholder-muted-foreground transition-all duration-200"
            rows={1}
            disabled={isLoading}
            tabIndex={0}
          />
        </div>
        {/* Send button */}
        <button
          type="submit"
          disabled={!message.trim() || isLoading}
          className="p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          title="Send message"
        >
          <Send size={20} />
        </button>
      </form>
    </div>
  )
}