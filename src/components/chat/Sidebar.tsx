import { useAppStore } from '@/stores/appStore'
import { useChatStore } from '@/stores/chatStore'
import { usePreferencesStore } from '@/stores/preferencesStore'
import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import {
  MessageSquare,
  Settings,
  FileText,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Calculator,
  Network,
  ChevronDown
} from 'lucide-react'
import { cn } from '@/utils/cn'
import * as Tooltip from '@radix-ui/react-tooltip'
import * as Collapsible from '@radix-ui/react-collapsible'
import { hydraulicService } from '@/services/hydraulic/hydraulicService'
import { HydraulicProject } from '@/types/hydraulic'
import boorieIconDark from '@/assets/boorie_icon_dark.png'
import boorieIconLight from '@/assets/boorie_icon_light.png'

export function Sidebar() {
  const { t } = useTranslation()
  const {
    currentView,
    setCurrentView,
    sidebarCollapsed,
    toggleSidebar
  } = useAppStore()

  const { conversations, setActiveConversation } = useChatStore()
  const { theme } = usePreferencesStore()
  const [projects, setProjects] = useState<HydraulicProject[]>([])
  const [projectsOpen, setProjectsOpen] = useState<Record<string, boolean>>({})
  const [generalOpen, setGeneralOpen] = useState(true)

  useEffect(() => {
    if (currentView === 'chat') {
      loadProjects()
    }
  }, [currentView])

  const loadProjects = async () => {
    try {
      const projectList = await hydraulicService.listProjects()
      setProjects(projectList)
    } catch (error) {
      console.error('Failed to load projects:', error)
    }
  }

  // Group conversations by project
  const conversationsByProject = conversations.reduce((acc, conv) => {
    const projectId = conv.projectId || 'general'
    if (!acc[projectId]) {
      acc[projectId] = []
    }
    acc[projectId].push(conv)
    return acc
  }, {} as Record<string, typeof conversations>)

  const toggleProject = (projectId: string) => {
    setProjectsOpen(prev => ({ ...prev, [projectId]: !prev[projectId] }))
  }

  const menuItems = [
    { id: 'chat', icon: MessageSquare, label: t('sidebar.chat'), view: 'chat' as const },
    { id: 'projects', icon: FolderOpen, label: 'Projects', view: 'projects' as const },
    { id: 'calculator', icon: Calculator, label: 'Calculator', view: 'calculator' as const },
    { id: 'wntr', icon: Network, label: 'WNTR Network', view: 'wntr' as const },
    { id: 'rag', icon: FileText, label: 'Wisdom Center', view: 'rag' as const },
    { id: 'settings', icon: Settings, label: t('sidebar.settings'), view: 'settings' as const },
  ]

  return (
    <Tooltip.Provider>
      <div
        className={cn(
          "fixed left-0 top-0 h-full bg-card border-r border-border/50 transition-all duration-300 z-10",
          "backdrop-blur-xl bg-card/95 flex flex-col",
          sidebarCollapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/50 flex-shrink-0">
          {!sidebarCollapsed && (
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center">
                <img
                  src={theme === 'dark' ? boorieIconLight : boorieIconDark}
                  alt="Boorie"
                  className="w-6 h-6 rounded-lg object-contain"
                />
              </div>
              <h1 className="text-lg font-semibold text-foreground">Boorie</h1>
            </div>
          )}
          {sidebarCollapsed && (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mx-auto">
              <img
                src={theme === 'dark' ? boorieIconDark : boorieIconLight}
                alt="Boorie"
                className="w-8 h-8 rounded-lg object-contain"
              />
            </div>
          )}
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                onClick={toggleSidebar}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  "hover:bg-accent text-muted-foreground hover:text-foreground",
                  sidebarCollapsed && "mx-auto"
                )}
              >
                {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content side="right" className="px-2 py-1 bg-popover text-popover-foreground text-sm rounded-md border border-border shadow-md">
              {sidebarCollapsed ? t('sidebar.expandSidebar') : t('sidebar.collapseSidebar')}
            </Tooltip.Content>
          </Tooltip.Root>
        </div>

        {/* Navigation */}
        <div className="p-3 space-y-1 flex-shrink-0">
          {menuItems.map((item) => {
            const isActive = currentView === item.view
            return (
              <Tooltip.Root key={item.id}>
                <Tooltip.Trigger asChild>
                  <button
                    onClick={() => setCurrentView(item.view)}
                    className={cn(
                      "w-full flex items-center p-3 rounded-lg transition-all duration-200",
                      "hover:bg-accent hover:text-accent-foreground",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground",
                      sidebarCollapsed && "justify-center"
                    )}
                  >
                    <item.icon size={20} />
                    {!sidebarCollapsed && <span className="ml-3 font-medium">{item.label}</span>}
                  </button>
                </Tooltip.Trigger>
                {sidebarCollapsed && (
                  <Tooltip.Content side="right" className="px-2 py-1 bg-popover text-popover-foreground text-sm rounded-md border border-border shadow-md">
                    {item.label}
                  </Tooltip.Content>
                )}
              </Tooltip.Root>
            )
          })}
        </div>

        {/* Chat History (only show when chat is active and sidebar is expanded) */}
        {currentView === 'chat' && !sidebarCollapsed && (
          <div className="flex-1 flex flex-col p-3 overflow-hidden">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 mb-3 flex-shrink-0">
              {t('sidebar.recentChats')}
            </h3>
            <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-border">
              <div className="space-y-2">
                {/* General conversations (no project) */}
                {conversationsByProject.general && conversationsByProject.general.length > 0 && (
                  <Collapsible.Root open={generalOpen} onOpenChange={setGeneralOpen}>
                    <Collapsible.Trigger className={cn(
                      "w-full flex items-center justify-between p-2 rounded-lg",
                      "text-sm font-medium text-muted-foreground",
                      "hover:bg-accent/50 transition-colors"
                    )}>
                      <span>General Chats</span>
                      <ChevronDown
                        size={14}
                        className={cn("transition-transform", generalOpen && "rotate-180")}
                      />
                    </Collapsible.Trigger>
                    <Collapsible.Content className="mt-1">
                      <div className="ml-2 space-y-1">
                        {conversationsByProject.general.map((conversation) => (
                          <button
                            key={conversation.id}
                            onClick={() => setActiveConversation(conversation.id)}
                            className={cn(
                              "w-full text-left p-2 pl-4 rounded-lg transition-all duration-200",
                              "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                              "hover:shadow-sm text-sm"
                            )}
                          >
                            <div className="truncate">
                              {conversation.title || 'New Conversation'}
                            </div>
                            <div className="text-xs text-muted-foreground/70 mt-0.5">
                              {new Date(conversation.updatedAt).toLocaleDateString()}
                            </div>
                          </button>
                        ))}
                      </div>
                    </Collapsible.Content>
                  </Collapsible.Root>
                )}

                {/* Project-specific conversations */}
                {projects.map((project) => {
                  const projectConversations = conversationsByProject[project.id] || []
                  if (projectConversations.length === 0) return null

                  const isOpen = projectsOpen[project.id] ?? false

                  return (
                    <Collapsible.Root
                      key={project.id}
                      open={isOpen}
                      onOpenChange={() => toggleProject(project.id)}
                    >
                      <Collapsible.Trigger className={cn(
                        "w-full flex items-center justify-between p-2 rounded-lg",
                        "text-sm font-medium text-muted-foreground",
                        "hover:bg-accent/50 transition-colors"
                      )}>
                        <div className="flex items-center gap-2 min-w-0">
                          <FolderOpen size={14} />
                          <span className="truncate">{project.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                            {projectConversations.length}
                          </span>
                          <ChevronDown
                            size={14}
                            className={cn("transition-transform", isOpen && "rotate-180")}
                          />
                        </div>
                      </Collapsible.Trigger>
                      <Collapsible.Content className="mt-1">
                        <div className="ml-2 space-y-1">
                          {projectConversations.map((conversation) => (
                            <button
                              key={conversation.id}
                              onClick={() => setActiveConversation(conversation.id)}
                              className={cn(
                                "w-full text-left p-2 pl-8 rounded-lg transition-all duration-200",
                                "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                                "hover:shadow-sm text-sm"
                              )}
                            >
                              <div className="truncate">
                                {conversation.title || 'New Conversation'}
                              </div>
                              <div className="text-xs text-muted-foreground/70 mt-0.5">
                                {new Date(conversation.updatedAt).toLocaleDateString()}
                              </div>
                            </button>
                          ))}
                        </div>
                      </Collapsible.Content>
                    </Collapsible.Root>
                  )
                })}

                {conversations.length === 0 && (
                  <div className="px-3 py-6 text-center">
                    <div className="text-muted-foreground/60 text-sm">
                      {t('sidebar.noConversations')}
                    </div>
                    <div className="text-xs text-muted-foreground/40 mt-1">
                      {t('sidebar.startNewChat')}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer / Credits */}
        {!sidebarCollapsed && (
          <div className="mt-auto p-4 border-t border-border/40 bg-accent/5">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 block mb-2">
                Created By
              </span>
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground/80 hover:text-foreground transition-colors cursor-default">
                  Dr. PHP Luis Mora
                </p>
                <p className="text-[11px] font-medium text-muted-foreground/80 hover:text-foreground transition-colors cursor-default">
                  Javier Molina
                </p>
                <p className="text-[11px] font-medium text-muted-foreground/80 hover:text-foreground transition-colors cursor-default">
                  Cristina Cruz
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Tooltip.Provider>
  )
}