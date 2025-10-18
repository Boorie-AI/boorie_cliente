import { Conversation, useChatStore } from '@/stores/chatStore'
import { Edit2, MoreVertical, Trash2, Copy, Download, Plus, FolderOpen, FolderPlus } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useOnClickOutside } from '@/hooks/useOnClickOutside'
import { cn } from '@/utils/cn'
import { ModelSelector } from './ModelSelector'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { ProjectSelector } from './ProjectSelector'
import { NewProjectDialog } from '@/components/hydraulic/NewProjectDialog'
import * as Dialog from '@radix-ui/react-dialog'

interface ChatHeaderProps {
  conversation: Conversation
}

export function ChatHeader({ conversation }: ChatHeaderProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(conversation.title)
  const [showMenu, setShowMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false)
  const { updateConversationTitle, deleteConversation, createNewConversation, updateConversation } = useChatStore()
  
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close menu when clicking outside
  useOnClickOutside(menuRef, () => setShowMenu(false))

  // Close menu on ESC key
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowMenu(false)
        if (isEditing) {
          setTitle(conversation.title)
          setIsEditing(false)
        }
      }
    }

    document.addEventListener('keydown', handleEscKey)
    return () => document.removeEventListener('keydown', handleEscKey)
  }, [isEditing, conversation.title])

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleSaveTitle = () => {
    if (title.trim() && title !== conversation.title) {
      updateConversationTitle(conversation.id, title.trim())
    }
    setIsEditing(false)
  }

  const handleProjectChange = (projectId: string | undefined) => {
    // Update the conversation with the new projectId
    useChatStore.getState().updateConversation(conversation.id, { projectId })
  }
  
  const handleProjectCreated = (newProject: any) => {
    // After creating a new project, assign it to this conversation
    if (newProject?.id) {
      updateConversation(conversation.id, { projectId: newProject.id })
    }
    setShowNewProjectDialog(false)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveTitle()
    } else if (e.key === 'Escape') {
      setTitle(conversation.title)
      setIsEditing(false)
    }
  }

  const handleDeleteConversation = () => {
    setShowDeleteConfirm(true)
    setShowMenu(false)
  }

  const confirmDeleteConversation = () => {
    deleteConversation(conversation.id)
  }

  const handleCopyConversation = async () => {
    try {
      const text = conversation.messages
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n\n')
      
      await navigator.clipboard.writeText(text)
      // You could add a toast notification here
    } catch (error) {
      console.error('Failed to copy conversation:', error)
    }
    setShowMenu(false)
  }

  const handleExportConversation = () => {
    const dataStr = JSON.stringify(conversation, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `conversation-${conversation.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`
    link.click()
    URL.revokeObjectURL(url)
    setShowMenu(false)
  }

  return (
    <div className="flex items-center justify-between p-4">
      <div className="flex items-center space-x-3 flex-1 min-w-0">
        <button
          onClick={() => createNewConversation(conversation.projectId)}
          className={cn(
            "flex items-center space-x-2 px-3 py-2 rounded-lg border border-border/50",
            "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            "transition-all duration-200 hover:border-border",
            "bg-card/50 hover:bg-accent/50 flex-shrink-0"
          )}
          title="Start a new conversation"
        >
          <Plus size={16} />
          <span className="text-sm font-medium">New Chat</span>
        </button>
        
        <ProjectSelector
          selectedProjectId={conversation.projectId}
          onProjectSelect={handleProjectChange}
        />
        
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={handleKeyPress}
            className={cn(
              "flex-1 bg-input border border-border rounded-lg px-3 py-2",
              "text-foreground placeholder-muted-foreground",
              "focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            )}
            placeholder="Enter conversation title..."
          />
        ) : (
          <h2 
            className={cn(
              "text-lg font-semibold text-foreground cursor-pointer hover:text-foreground/80",
              "flex-1 truncate transition-colors"
            )}
            onClick={() => setIsEditing(true)}
            title="Click to edit title"
          >
            {conversation.title}
          </h2>
        )}
      </div>

      <div className="flex items-center space-x-3">
        <ModelSelector />
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className={cn(
              "p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg",
              "transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              showMenu && "bg-accent text-foreground"
            )}
          >
            <MoreVertical size={18} />
          </button>
          
          {showMenu && (
            <div className={cn(
              "absolute right-0 top-full mt-2 w-48 bg-popover border border-border rounded-lg shadow-lg z-50",
              "py-1 animate-in fade-in-0 zoom-in-95"
            )}>
              <button
                onClick={() => {
                  setIsEditing(true)
                  setShowMenu(false)
                }}
                className="w-full flex items-center px-4 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Edit2 size={16} className="mr-3" />
                Rename
              </button>
              
              <button
                onClick={handleCopyConversation}
                className="w-full flex items-center px-4 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Copy size={16} className="mr-3" />
                Copy to Clipboard
              </button>
              
              <button
                onClick={handleExportConversation}
                className="w-full flex items-center px-4 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Download size={16} className="mr-3" />
                Export as JSON
              </button>
              
              <div className="h-px bg-border my-1" />
              
              <button
                onClick={() => {
                  setShowNewProjectDialog(true)
                  setShowMenu(false)
                }}
                className="w-full flex items-center px-4 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <FolderPlus size={16} className="mr-3" />
                Create New Project
              </button>
              
              <div className="h-px bg-border my-1" />
              
              <button
                onClick={handleDeleteConversation}
                className="w-full flex items-center px-4 py-2 text-sm text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
              >
                <Trash2 size={16} className="mr-3" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDeleteConversation}
        title="Delete Conversation"
        message="Are you sure you want to delete this conversation? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />
      
      <Dialog.Root open={showNewProjectDialog} onOpenChange={setShowNewProjectDialog}>
        <NewProjectDialog
          onClose={() => setShowNewProjectDialog(false)}
          onProjectCreated={handleProjectCreated}
        />
      </Dialog.Root>
    </div>
  )
}