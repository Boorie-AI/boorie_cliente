import { logger } from '@/utils/logger'
import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { Send, Paperclip, Mic, X, FileText } from 'lucide-react'

interface PendingAttachment {
  fileName: string
  content: string
}

// Chromium (and therefore Electron's renderer) exposes SpeechRecognition
// under the webkit-prefixed name; there's no official TS lib type for it.
type SpeechRecognitionInstance = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: any) => void) | null
  onerror: ((event: any) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

export function MessageInput() {
  const [message, setMessage] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null)
  const [attachError, setAttachError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const { sendMessage, isLoading } = useChatStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if ((!message.trim() && !attachment) || isLoading) return

    let messageToSend = message.trim()
    if (attachment) {
      messageToSend =
        `=== ATTACHED DOCUMENT: ${attachment.fileName} ===\n\n${attachment.content}\n\n=== END DOCUMENT ===\n\n${messageToSend}`
    }
    setMessage('')
    setAttachment(null)

    try {
      await sendMessage(messageToSend)
      // Re-focus the input after sending
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus()
        }
      }, 100)
    } catch (error) {
      logger.error('Failed to send message:', error)
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

  const handleFileAttach = async () => {
    setAttachError(null)
    if (!window.electronAPI?.chat?.pickAttachment) {
      setAttachError('Attaching files is not available in this build.')
      return
    }
    try {
      const result = await window.electronAPI.chat.pickAttachment()
      if (!result.success || !result.content) {
        if (result.message && result.message !== 'No file selected') {
          setAttachError(result.message)
        }
        return
      }
      setAttachment({ fileName: result.fileName || 'document', content: result.content })
    } catch (error) {
      logger.error('Failed to attach file:', error)
      setAttachError('Failed to read the selected file.')
    }
  }

  const handleVoiceRecord = () => {
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (!SpeechRecognitionCtor) {
      setAttachError('Voice dictation is not supported in this browser.')
      return
    }

    if (isRecording) {
      recognitionRef.current?.stop()
      return
    }

    const recognition: SpeechRecognitionInstance = new SpeechRecognitionCtor()
    recognition.lang = navigator.language || 'es-ES'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event: any) => {
      let finalTranscript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript
        }
      }
      if (finalTranscript) {
        setMessage((prev) => (prev ? `${prev} ${finalTranscript}` : finalTranscript).trim())
      }
    }
    recognition.onerror = (event: any) => {
      logger.error('Voice recognition error:', event.error)
      setAttachError('Voice dictation failed. Check microphone permissions.')
      setIsRecording(false)
    }
    recognition.onend = () => {
      setIsRecording(false)
      recognitionRef.current = null
    }

    recognitionRef.current = recognition
    setIsRecording(true)
    recognition.start()
  }

  // Stop any in-progress dictation if the component unmounts.
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
    }
  }, [])

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
    <div className="p-4 relative z-10">
      {attachment && (
        <div className="mb-2 flex items-center gap-2 text-xs bg-accent text-foreground rounded-lg px-3 py-1.5 w-fit">
          <FileText size={14} />
          <span>{attachment.fileName}</span>
          <button
            type="button"
            onClick={() => setAttachment(null)}
            className="text-muted-foreground hover:text-foreground"
            title="Remove attachment"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {attachError && (
        <div className="mb-2 text-xs text-destructive">{attachError}</div>
      )}
      <form onSubmit={handleSubmit} className="flex items-center space-x-2"
            onClick={(e) => {
              // If clicking on the form but not on a button, focus the textarea
              if (e.target === e.currentTarget) {
                textareaRef.current?.focus()
              }
            }}>
        {/* File attachment button */}
        <button
          type="button"
          onClick={handleFileAttach}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors flex items-center justify-center"
          title="Attach file"
        >
          <Paperclip size={20} />
        </button>

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

        {/* Voice recording button */}
        <button
          type="button"
          onClick={handleVoiceRecord}
          className={`p-2 rounded-lg transition-colors flex items-center justify-center ${isRecording
              ? 'text-destructive bg-destructive/20 hover:bg-destructive/30'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          title={isRecording ? 'Stop recording' : 'Start voice recording'}
        >
          <Mic size={20} />
        </button>

        {/* Send button */}
        <button
          type="submit"
          disabled={(!message.trim() && !attachment) || isLoading}
          className="p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          title="Send message"
        >
          <Send size={20} />
        </button>
      </form>
    </div>
  )
}