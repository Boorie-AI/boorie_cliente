import { useState, useEffect } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { hydraulicService } from '@/services/hydraulic/hydraulicService'
import { HydraulicProject } from '@/types/hydraulic'
import { cn } from '@/utils/cn'
import { 
  MessageSquare, 
  Calendar, 
  MoreVertical, 
  Send,
  FolderPlus,
  X
} from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Dialog from '@radix-ui/react-dialog'

interface ProjectConversationsListProps {
  projectId?: string
  currentConversationId?: string
}

export function ProjectConversationsList({ projectId, currentConversationId }: ProjectConversationsListProps) {
  const { conversations, setActiveConversation, updateConversation } = useChatStore()
  const [projects, setProjects] = useState<HydraulicProject[]>([])
  const [selectedProject, setSelectedProject] = useState<HydraulicProject | null>(null)
  const [showMoveDialog, setShowMoveDialog] = useState(false)
  const [movingConversationId, setMovingConversationId] = useState<string | null>(null)
  
  useEffect(() => {
    loadProjects()
  }, [])
  
  useEffect(() => {
    if (projectId && projects.length > 0) {
      const project = projects.find(p => p.id === projectId)
      setSelectedProject(project || null)
    }
  }, [projectId, projects])
  
  const loadProjects = async () => {
    try {
      const projectList = await hydraulicService.listProjects()
      setProjects(projectList)
    } catch (error) {
      console.error('Failed to load projects:', error)
    }
  }
  
  // Filter conversations based on selected project
  const projectConversations = projectId 
    ? conversations.filter(c => c.projectId === projectId)
    : conversations.filter(c => !c.projectId)
    
  const handleMoveConversation = (conversationId: string) => {
    setMovingConversationId(conversationId)
    setShowMoveDialog(true)
  }
  
  const confirmMoveConversation = (targetProjectId: string | null) => {
    if (movingConversationId) {
      updateConversation(movingConversationId, { 
        projectId: targetProjectId || undefined 
      })
    }
    setShowMoveDialog(false)
    setMovingConversationId(null)
  }
  
  if (!projectId && !projectConversations.length) {
    return null
  }
  
  return (
    <div className="w-64 h-full border-l border-border bg-card/50 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderPlus size={18} className="text-muted-foreground" />
            <h3 className="font-semibold text-foreground">
              {selectedProject ? selectedProject.name : 'General Conversations'}
            </h3>
          </div>
          <span className="text-xs bg-muted px-2 py-1 rounded-full">
            {projectConversations.length}
          </span>
        </div>
        {selectedProject && (
          <p className="text-xs text-muted-foreground mt-1">
            {selectedProject.location?.city || selectedProject.location?.region}
          </p>
        )}
      </div>
      
      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {projectConversations.map((conversation) => {
          const isActive = conversation.id === currentConversationId
          
          return (
            <div
              key={conversation.id}
              className={cn(
                "group relative rounded-lg transition-all",
                isActive && "bg-accent/50"
              )}
            >
              <button
                onClick={() => setActiveConversation(conversation.id)}
                className={cn(
                  "w-full text-left p-3 rounded-lg",
                  "hover:bg-accent/30 transition-colors",
                  isActive && "bg-transparent hover:bg-accent/50"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <MessageSquare size={14} className="text-muted-foreground flex-shrink-0" />
                      <h4 className="text-sm font-medium truncate text-foreground">
                        {conversation.title}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <Calendar size={12} />
                      <span>{new Date(conversation.updatedAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>{conversation.messages.length} messages</span>
                    </div>
                  </div>
                  
                  {/* Actions Menu */}
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          "p-1 rounded opacity-0 group-hover:opacity-100",
                          "hover:bg-accent transition-all",
                          "focus:opacity-100 focus:outline-none"
                        )}
                      >
                        <MoreVertical size={14} />
                      </button>
                    </DropdownMenu.Trigger>
                    
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        className={cn(
                          "min-w-[160px] bg-popover rounded-lg p-1 shadow-lg",
                          "border border-border animate-in fade-in-0 zoom-in-95"
                        )}
                        sideOffset={5}
                      >
                        <DropdownMenu.Item
                          onClick={() => handleMoveConversation(conversation.id)}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded",
                            "text-sm cursor-pointer outline-none",
                            "hover:bg-accent hover:text-accent-foreground"
                          )}
                        >
                          <Send size={14} />
                          {projectId ? 'Move to Another Project' : 'Assign to Project'}
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>
              </button>
            </div>
          )
        })}
        
        {projectConversations.length === 0 && (
          <div className="text-center py-8">
            <MessageSquare size={32} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              No conversations in this project
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Start a new chat to add it here
            </p>
          </div>
        )}
      </div>
      
      {/* Move Conversation Dialog */}
      <Dialog.Root open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 animate-in fade-in-0" />
          <Dialog.Content className={cn(
            "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
            "w-[400px] max-h-[85vh] bg-card rounded-lg shadow-lg",
            "animate-in fade-in-0 zoom-in-95 duration-200"
          )}>
            <div className="p-6">
              <Dialog.Title className="text-lg font-semibold mb-4">
                {projectId ? 'Move to Another Project' : 'Assign to Project'}
              </Dialog.Title>
              
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {!projectId && (
                  <button
                    onClick={() => confirmMoveConversation(null)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg",
                      "hover:bg-accent transition-colors",
                      "border border-border"
                    )}
                  >
                    <div className="font-medium">Keep in General</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Don't assign to any project
                    </div>
                  </button>
                )}
                
                {projects.map((project) => {
                  if (project.id === projectId) return null
                  
                  return (
                    <button
                      key={project.id}
                      onClick={() => confirmMoveConversation(project.id)}
                      className={cn(
                        "w-full text-left p-3 rounded-lg",
                        "hover:bg-accent transition-colors",
                        "border border-border"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{project.name}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {project.location?.city || project.location?.region}
                          </div>
                        </div>
                        <Send size={16} className="text-muted-foreground" />
                      </div>
                    </button>
                  )
                })}
                
                {projectId && (
                  <button
                    onClick={() => confirmMoveConversation(null)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg",
                      "hover:bg-accent transition-colors",
                      "border border-border"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">Remove from Project</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Move to general conversations
                        </div>
                      </div>
                      <X size={16} className="text-muted-foreground" />
                    </div>
                  </button>
                )}
              </div>
              
              <div className="flex justify-end gap-2 mt-6">
                <Dialog.Close asChild>
                  <button className={cn(
                    "px-4 py-2 rounded-lg text-sm",
                    "bg-secondary text-secondary-foreground",
                    "hover:bg-secondary/80 transition-colors"
                  )}>
                    Cancel
                  </button>
                </Dialog.Close>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}