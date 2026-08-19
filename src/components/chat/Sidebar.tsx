import { useAppStore } from '@/stores/appStore'
import { useChatStore } from '@/stores/chatStore'
import { useProjectStore } from '@/stores/projectStore'
import { usePreferencesStore } from '@/stores/preferencesStore'
import { useTranslation } from 'react-i18next'
import {
  MessageSquare,
  MessagesSquare,
  Settings,
  FileText,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Calculator,
  Network,
  Play,
  Lock
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { usePrecondiciones } from '@/hooks/usePrecondiciones'
import {
  BLOQUES,
  itemsDelBloque,
  itemActivo,
  pendientesItem,
  type ItemNavegacion,
} from '@/config/navegacion'
import { claveMotivo } from '@/config/precondiciones'
import * as Tooltip from '@radix-ui/react-tooltip'
import boorieIconDark from '@/assets/boorie_icon_dark.png'
import boorieIconLight from '@/assets/boorie_icon_light.png'

const ICONOS: Record<string, typeof MessageSquare> = {
  projects: FolderOpen,
  red: Network,
  simulaciones: Play,
  chatProyecto: MessageSquare,
  calculator: Calculator,
  chatGeneral: MessagesSquare,
  wisdom: FileText,
  settings: Settings,
}

export function Sidebar() {
  const { t } = useTranslation()
  const { estado } = usePrecondiciones()
  const {
    currentView,
    ambitoChat,
    seccionRed,
    setCurrentView,
    sidebarCollapsed,
    toggleSidebar
  } = useAppStore()

  const { conversations, setActiveConversation, activeConversationId } = useChatStore()
  const currentProjectId = useProjectStore(s => s.currentProjectId)
  const nombreProyecto = useProjectStore(s => s.currentProject?.name)
  const { theme } = usePreferencesStore()

  const donde = { vista: currentView, ambitoChat, seccionRed }

  // Las conversaciones que se listan son las del ámbito en el que estás, no
  // todas: el proyecto activo es global (#31), así que un árbol con todos los
  // proyectos ofrecía un atajo para trabajar fuera del proyecto activo.
  const conversacionesDelAmbito = conversations.filter(conv =>
    ambitoChat === 'proyecto'
      ? conv.projectId === currentProjectId
      : !conv.projectId
  )

  const irA = (item: ItemNavegacion) => {
    setCurrentView(item.vista, {
      ambitoChat: item.ambitoChat,
      seccionRed: item.seccion ?? null,
    })
  }

  const ItemBoton = ({ item }: { item: ItemNavegacion }) => {
    const Icono = ICONOS[item.id] ?? FileText
    const activo = itemActivo(item, donde)
    const etiqueta = t(item.etiqueta)
    // Se atenúa, no se oculta ni se bloquea: ocultarlo haría la aplicación
    // menos descubrible, y bloquearlo dejaría al usuario sin forma de llegar a
    // la pantalla que le explica qué falta (#33).
    const motivo = claveMotivo(pendientesItem(item, estado))
    const bloqueada = motivo !== null
    const ayuda = bloqueada ? `${etiqueta} — ${t(motivo)}` : etiqueta

    return (
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            onClick={() => irA(item)}
            // Sin aria-disabled: el ítem sigue siendo accionable a propósito y
            // marcarlo como deshabilitado sería mentir al lector de pantalla.
            title={bloqueada ? ayuda : undefined}
            aria-label={bloqueada ? ayuda : undefined}
            className={cn(
              "w-full flex items-center rounded-lg transition-all duration-200",
              "hover:bg-accent hover:text-accent-foreground",
              item.hijoDelProyecto && !sidebarCollapsed ? "py-2 pl-6 pr-3" : "p-3",
              activo
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground",
              bloqueada && !activo && "opacity-50",
              sidebarCollapsed && "justify-center"
            )}
          >
            <Icono size={item.hijoDelProyecto ? 16 : 20} />
            {!sidebarCollapsed && (
              <span className={cn("ml-3", item.hijoDelProyecto ? "text-sm" : "font-medium")}>
                {etiqueta}
              </span>
            )}
            {!sidebarCollapsed && bloqueada && (
              <Lock size={12} className="ml-auto opacity-70" aria-hidden />
            )}
          </button>
        </Tooltip.Trigger>
        {(sidebarCollapsed || bloqueada) && (
          <Tooltip.Content side="right" className="px-2 py-1 bg-popover text-popover-foreground text-sm rounded-md border border-border shadow-md max-w-xs">
            {ayuda}
          </Tooltip.Content>
        )}
      </Tooltip.Root>
    )
  }

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

        {/* Navegación en tres bloques: lo que pertenece al proyecto, lo que es
            independiente de él y lo que es del sistema (#35). */}
        <div className="p-3 space-y-4 flex-shrink-0">
          {BLOQUES.map(bloque => (
            <div key={bloque.id} className="space-y-1">
              {!sidebarCollapsed && (
                <h2 className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider px-3 pb-1">
                  {t(bloque.titulo)}
                </h2>
              )}

              {itemsDelBloque(bloque.id)
                .filter(item => !item.hijoDelProyecto)
                .map(item => <ItemBoton key={item.id} item={item} />)}

              {bloque.id === 'proyectos' && (
                currentProjectId ? (
                  <>
                    {/* El nombre del proyecto activo es visible desde cualquier
                        vista, que es un criterio de aceptación del issue. */}
                    {!sidebarCollapsed && (
                      <div className="px-3 pt-1 pb-0.5 text-xs font-medium text-foreground/80 truncate"
                        title={nombreProyecto}>
                        {nombreProyecto ?? t('sidebar.proyectoActivo')}
                      </div>
                    )}
                    {itemsDelBloque('proyectos')
                      .filter(item => item.hijoDelProyecto)
                      .map(item => <ItemBoton key={item.id} item={item} />)}
                  </>
                ) : (
                  !sidebarCollapsed && (
                    <p className="px-3 py-1 text-xs text-muted-foreground/70">
                      {t('sidebar.sinProyecto')}
                    </p>
                  )
                )
              )}
            </div>
          ))}
        </div>

        {/* Conversaciones del ámbito en el que está el chat */}
        {currentView === 'chat' && !sidebarCollapsed && (
          <div className="flex-1 flex flex-col p-3 overflow-hidden border-t border-border/50">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 mb-3 mt-2 flex-shrink-0">
              {t(ambitoChat === 'proyecto' ? 'sidebar.chatsDelProyecto' : 'sidebar.recentChats')}
            </h3>
            <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-border">
              <div className="space-y-1">
                {conversacionesDelAmbito.map((conversation) => (
                  <button
                    key={conversation.id}
                    onClick={() => setActiveConversation(conversation.id)}
                    className={cn(
                      "w-full text-left p-2 pl-3 rounded-lg transition-all duration-200 text-sm",
                      conversation.id === activeConversationId
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <div className="truncate">
                      {conversation.title || t('sidebar.nuevaConversacion')}
                    </div>
                    <div className="text-xs text-muted-foreground/70 mt-0.5">
                      {new Date(conversation.updatedAt).toLocaleDateString()}
                    </div>
                  </button>
                ))}

                {conversacionesDelAmbito.length === 0 && (
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
