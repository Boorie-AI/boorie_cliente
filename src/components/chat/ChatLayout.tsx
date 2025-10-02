import { useAppStore } from '@/stores/appStore'
import { Sidebar } from './Sidebar'
import { ChatArea } from './ChatArea'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { RAGPanel } from '@/components/rag/RAGPanel'
import { EmailPanel } from '@/components/email/EmailPanel'
import { CalendarPanel } from '@/components/calendar/CalendarPanel'
import { TodoPanel } from '../todo/TodoPanel'
import { HydraulicProjectsPanel } from '@/components/hydraulic/HydraulicProjectsPanel'
import { HydraulicCalculator } from '@/components/hydraulic/HydraulicCalculator'
import { cn } from '@/utils/cn'

export function ChatLayout() {
  const { currentView, sidebarCollapsed } = useAppStore()

  const renderMainContent = () => {
    switch (currentView) {
      case 'chat':
        return <ChatArea />
      case 'settings':
        return <SettingsPanel />
      case 'rag':
        return <RAGPanel />
      case 'email':
        return <EmailPanel />
      case 'calendar':
        return <CalendarPanel />
      case 'todo':
        return <TodoPanel />
      case 'projects':
        return <HydraulicProjectsPanel />
      case 'calculator':
        return <HydraulicCalculator />
      default:
        return <ChatArea />
    }
  }

  return (
    <div className="flex h-full w-full bg-background">
      <Sidebar />
      <div
        className={cn(
          "flex-1 flex flex-col transition-all duration-300 ease-in-out h-full min-h-0",
          "border-l border-border/50",
          sidebarCollapsed ? "ml-16" : "ml-64"
        )}
      >
        {renderMainContent()}
      </div>
    </div>
  )
}