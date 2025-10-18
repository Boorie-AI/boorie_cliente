import { useState, useEffect } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { hydraulicService } from '@/services/hydraulic/hydraulicService'
import { HydraulicProject } from '@/types/hydraulic'
import { cn } from '@/utils/cn'
import { FolderOpen, X } from 'lucide-react'
import * as Select from '@radix-ui/react-select'
import { ChevronDown, Check } from 'lucide-react'

interface ProjectSelectorProps {
  selectedProjectId?: string
  onProjectSelect: (projectId: string | undefined) => void
  className?: string
}

export function ProjectSelector({ selectedProjectId, onProjectSelect, className }: ProjectSelectorProps) {
  const [projects, setProjects] = useState<HydraulicProject[]>([])
  const [loading, setLoading] = useState(true)
  const activeConversationId = useChatStore(state => state.activeConversationId)
  const conversations = useChatStore(state => state.conversations)
  const activeConversation = conversations.find(c => c.id === activeConversationId)
  
  useEffect(() => {
    loadProjects()
  }, [])
  
  const loadProjects = async () => {
    try {
      setLoading(true)
      const projectList = await hydraulicService.listProjects()
      setProjects(projectList)
    } catch (error) {
      console.error('Failed to load projects:', error)
    } finally {
      setLoading(false)
    }
  }
  
  const currentProjectId = selectedProjectId || activeConversation?.projectId
  const currentProject = projects.find(p => p.id === currentProjectId)
  
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Select.Root value={currentProjectId || 'none'} onValueChange={(value) => {
        onProjectSelect(value === 'none' ? undefined : value)
      }}>
        <Select.Trigger className={cn(
          "inline-flex items-center justify-between gap-2 px-3 py-2 rounded-lg",
          "bg-card border border-border/50 text-sm",
          "hover:bg-accent/50 hover:border-border transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "min-w-[200px]"
        )}>
          <div className="flex items-center gap-2">
            <FolderOpen size={14} className="text-muted-foreground" />
            <Select.Value>
              {currentProject?.name || "No project selected"}
            </Select.Value>
          </div>
          <ChevronDown size={14} className="text-muted-foreground" />
        </Select.Trigger>
        
        <Select.Portal>
          <Select.Content className={cn(
            "overflow-hidden rounded-lg border border-border bg-popover shadow-lg",
            "z-50 min-w-[200px] animate-in fade-in-0 zoom-in-95"
          )}>
            <Select.ScrollUpButton className="flex h-6 cursor-default items-center justify-center bg-popover text-muted-foreground">
              <ChevronDown size={14} className="rotate-180" />
            </Select.ScrollUpButton>
            
            <Select.Viewport className="p-1">
              <Select.Item
                value="none"
                className={cn(
                  "relative flex items-center gap-2 rounded px-3 py-2 text-sm",
                  "cursor-pointer select-none outline-none",
                  "hover:bg-accent hover:text-accent-foreground",
                  "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                )}
              >
                <Select.ItemText>No project</Select.ItemText>
                <Select.ItemIndicator className="ml-auto">
                  <Check size={14} />
                </Select.ItemIndicator>
              </Select.Item>
              
              {projects.length > 0 && (
                <Select.Separator className="my-1 h-px bg-border" />
              )}
              
              {loading ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  Loading projects...
                </div>
              ) : projects.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No projects available
                </div>
              ) : (
                projects.map(project => (
                  <Select.Item
                    key={project.id}
                    value={project.id}
                    className={cn(
                      "relative flex items-center gap-2 rounded px-3 py-2 text-sm",
                      "cursor-pointer select-none outline-none",
                      "hover:bg-accent hover:text-accent-foreground",
                      "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                    )}
                  >
                    <Select.ItemText>
                      <div>
                        <div className="font-medium">{project.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {project.location?.city || project.location?.region}
                        </div>
                      </div>
                    </Select.ItemText>
                    <Select.ItemIndicator className="ml-auto">
                      <Check size={14} />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))
              )}
            </Select.Viewport>
            
            <Select.ScrollDownButton className="flex h-6 cursor-default items-center justify-center bg-popover text-muted-foreground">
              <ChevronDown size={14} />
            </Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      
      {currentProjectId && currentProjectId !== 'none' && (
        <button
          onClick={() => onProjectSelect(undefined)}
          className={cn(
            "p-1.5 rounded-lg text-muted-foreground",
            "hover:bg-accent/50 hover:text-foreground transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          )}
          title="Clear project selection"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}