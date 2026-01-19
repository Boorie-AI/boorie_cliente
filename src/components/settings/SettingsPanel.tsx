import { useTranslation } from 'react-i18next'
import { AIConfigurationPanel } from './AIConfigurationPanel'
import { SystemPromptPanel } from './SystemPromptPanel'
import { GeneralTab, AccountsTab } from './tabs'
import { MilvusInspector } from './MilvusInspector'
import { cn } from '@/utils/cn'
import * as Tabs from '@radix-ui/react-tabs'

export function SettingsPanel() {
  const { t } = useTranslation()

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="flex-1 flex flex-col overflow-hidden p-6">
        <div className="max-w-6xl mx-auto w-full flex flex-col h-full min-h-0">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-foreground mb-2">{t('settings.title')}</h1>
            <p className="text-muted-foreground">{t('settings.subtitle')}</p>
          </div>

          {/* Tabs Container */}
          <Tabs.Root defaultValue="general" className="flex-1 flex flex-col overflow-hidden min-h-0">
            {/* Tab List */}
            <Tabs.List className="flex space-x-1 bg-muted p-1 rounded-lg w-fit mb-6">
              <Tabs.Trigger
                value="general"
                className={cn(
                  "px-4 py-2 rounded-md text-sm font-medium transition-all",
                  "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
                  "data-[state=inactive]:text-muted-foreground hover:text-foreground"
                )}
              >
                {t('common.general')}
              </Tabs.Trigger>
              <Tabs.Trigger
                value="ai-config"
                className={cn(
                  "px-4 py-2 rounded-md text-sm font-medium transition-all",
                  "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
                  "data-[state=inactive]:text-muted-foreground hover:text-foreground"
                )}
              >
                {t('settings.aiConfiguration')}
              </Tabs.Trigger>
              <Tabs.Trigger
                value="accounts"
                className={cn(
                  "px-4 py-2 rounded-md text-sm font-medium transition-all",
                  "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
                  "data-[state=inactive]:text-muted-foreground hover:text-foreground"
                )}
              >
                {t('settings.accounts')}
              </Tabs.Trigger>
              <Tabs.Trigger
                value="system-prompt"
                className={cn(
                  "px-4 py-2 rounded-md text-sm font-medium transition-all",
                  "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
                  "data-[state=inactive]:text-muted-foreground hover:text-foreground"
                )}
              >
                System Prompt
              </Tabs.Trigger>
              <Tabs.Trigger
                value="milvus"
                className={cn(
                  "px-4 py-2 rounded-md text-sm font-medium transition-all",
                  "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
                  "data-[state=inactive]:text-muted-foreground hover:text-foreground"
                )}
              >
                Milvus Inspector
              </Tabs.Trigger>
            </Tabs.List>

            {/* Tab Content */}
            <Tabs.Content value="general" className="flex-1 overflow-hidden">
              <GeneralTab />
            </Tabs.Content>

            <Tabs.Content value="ai-config" className="flex-1 overflow-hidden">
              <AIConfigurationPanel />
            </Tabs.Content>

            <Tabs.Content value="accounts" className="flex-1 overflow-hidden">
              <AccountsTab />
            </Tabs.Content>

            <Tabs.Content value="system-prompt" className="flex-1 overflow-hidden">
              <SystemPromptPanel />
            </Tabs.Content>

            <Tabs.Content value="milvus" className="flex-1 overflow-hidden">
              <MilvusInspector />
            </Tabs.Content>
          </Tabs.Root>
        </div>
      </div>
    </div>
  )
}