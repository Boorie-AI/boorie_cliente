import { useAppStore } from '@/stores/appStore'
import { useChatStore } from '@/stores/chatStore'
import { usePreferencesStore } from '@/stores/preferencesStore'
import { useTranslation } from 'react-i18next'
import {
  MessageSquare,
  Settings,
  FileText,
  Mail,
  Calendar,
  ListTodo,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Calculator
} from 'lucide-react'
import { cn } from '@/utils/cn'
import * as Tooltip from '@radix-ui/react-tooltip'
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

  const menuItems = [
    { id: 'chat', icon: MessageSquare, label: t('sidebar.chat'), view: 'chat' as const },
    { id: 'projects', icon: FolderOpen, label: 'Projects', view: 'projects' as const },
    { id: 'calculator', icon: Calculator, label: 'Calculator', view: 'calculator' as const },
    { id: 'rag', icon: FileText, label: t('sidebar.documents'), view: 'rag' as const },
    { id: 'email', icon: Mail, label: t('sidebar.email'), view: 'email' as const },
    { id: 'calendar', icon: Calendar, label: t('sidebar.calendar'), view: 'calendar' as const },
    { id: 'todo', icon: ListTodo, label: t('sidebar.todo'), view: 'todo' as const },
    { id: 'settings', icon: Settings, label: t('sidebar.settings'), view: 'settings' as const },
  ]

  return (
    <Tooltip.Provider>
      <div
        className={cn(
          "fixed left-0 top-0 h-full bg-card border-r border-border/50 transition-all duration-300 z-10",
          "backdrop-blur-xl bg-card/95",
          sidebarCollapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/50">
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
        <div className="p-3 space-y-1">
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
          <div className="flex-1 flex flex-col p-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 mb-3 flex-shrink-0">
              {t('sidebar.recentChats')}
            </h3>
            <div className="flex-1 overflow-y-auto max-h-[calc(100vh-400px)] pr-1">
              <div className="space-y-1">
                {conversations.slice(0, 20).map((conversation) => (
                  <button
                    key={conversation.id}
                    onClick={() => setActiveConversation(conversation.id)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg transition-all duration-200",
                      "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      "hover:shadow-sm"
                    )}
                  >
                    <div className="truncate text-sm font-medium">
                      {conversation.title || 'New Conversation'}
                    </div>
                    <div className="text-xs text-muted-foreground/70 mt-1">
                      {new Date(conversation.updatedAt).toLocaleDateString()}
                    </div>
                  </button>
                ))}

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
      </div>
    </Tooltip.Provider>
  )
}