import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChatLayout } from '@/components/chat/ChatLayout'
import { CustomTopBar } from '@/components/CustomTopBar'
import { GlobalErrorTracker } from '@/components/GlobalErrorTracker'
import { ProjectMismatchDialog } from '@/components/project/ProjectMismatchDialog'
import { MigracionAvisoDialog } from '@/components/project/MigracionAvisoDialog'
import { Onboarding } from '@/components/Onboarding'
import { DialogoDescargo } from '@/components/descargo/DialogoDescargo'
import { SetupWizard } from '@/components/setup/SetupWizard'
import { useAppStore } from '@/stores/appStore'
import { useProjectStore } from '@/stores/projectStore'
import { migrateProjectAssets } from '@/services/migration/migrateProjectAssets'
import { cargarModelosRAG } from '@/config/modelosRAG'
import { cn } from '@/utils/cn'
import './i18n' // Initialize i18n

function App() {
  const { t } = useTranslation()
  const { initializeApp, isInitialized, theme } = useAppStore()
  const restoreActiveProject = useProjectStore(s => s.restoreActiveProject)
  const [setupChecked, setSetupChecked] = useState(false)
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [setupSkipped, setSetupSkipped] = useState(false)
  const [informeMigracion, setInformeMigracion] = useState<Awaited<ReturnType<typeof migrateProjectAssets>> | null>(null)

  // El proyecto activo se restaura aquí, y no en el store, porque hace falta
  // que window.electronAPI exista para releerlo de la base de datos. Si el
  // proyecto se borró entre sesiones, el store descarta el id sin romper nada.
  //
  // Las dos cargas van juntas porque la vista restaurada sólo se puede validar
  // cuando ya se sabe si hay proyecto: sin él, arrancar en la red hidráulica
  // dejaría al usuario en un aviso en vez de en Proyectos (#35).
  useEffect(() => {
    Promise.all([initializeApp(), restoreActiveProject()]).then(() => {
      const proyecto = useProjectStore.getState()
      useAppStore.getState().ajustarVistaInicial({
        hayProyecto: proyecto.currentProjectId !== null,
        hayRed: (proyecto.currentProject?.networkCount ?? 0) > 0,
      })
    })
  }, [initializeApp, restoreActiveProject])

  // Las redes y calculos que vivian en localStorage pasan a la base de datos
  // (#31). Se hace despues de restaurar el proyecto y una sola vez: el modulo
  // lleva su propio marcador y nunca borra los datos originales.
  useEffect(() => {
    migrateProjectAssets()
      .then(informe => {
        if (informe.ejecutada) setInformeMigracion(informe)
      })
      .catch(error => console.error('Fallo la migracion del almacenamiento local:', error))
  }, [])

  // Qué modelo responde y si el desplegable se enseña (#49). Se pregunta al
  // arrancar porque `createNewConversation` es sincrónico: sin esto, la primera
  // conversación se guardaba con lo que hubiera quedado en localStorage —vimos
  // «llama3.1:8b»— aunque la respuesta ya la diera el Nemotron fijado.
  useEffect(() => {
    cargarModelosRAG()
  }, [])

  // First-run check: if Python deps are missing, show the SetupWizard.
  useEffect(() => {
    const api = (window as any).electronAPI?.setup
    if (!api) { setSetupChecked(true); return }
    api.status()
      .then((s: any) => {
        setSetupNeeded(!s?.ready)
        setSetupChecked(true)
      })
      .catch(() => {
        // Fail-soft: si no podemos consultar, no bloqueamos.
        setSetupChecked(true)
      })
  }, [])

  useEffect(() => {
    // Apply theme to document
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [theme])

  if (!isInitialized) {
    return (
      <div className={cn(
        "flex items-center justify-center h-screen",
        "bg-gradient-to-br from-background via-background to-muted",
        "text-foreground"
      )}>
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto"></div>
            <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-primary/60 rounded-full animate-spin mx-auto animation-delay-75"></div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">{t('app.initializing')}</h2>
            <p className="text-muted-foreground">{t('app.initializingDesc')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
      <GlobalErrorTracker />
      <CustomTopBar />
      {/* Antes que nada y por encima de todo: hasta que se acepte, no se usa
          Boorie (#108). Va aquí y no dentro del contenido para que ninguna
          vista pueda quedar por delante. */}
      <DialogoDescargo />
      <div className="flex-1 min-h-0 relative">
        <ChatLayout />
        <Onboarding />
        {/* Único en la raíz: cualquier vista puede abrir una conversación. */}
        <ProjectMismatchDialog />
        <MigracionAvisoDialog informe={informeMigracion} onClose={() => setInformeMigracion(null)} />
        {setupChecked && setupNeeded && !setupSkipped && (
          <SetupWizard onComplete={() => { setSetupNeeded(false); setSetupSkipped(true) }} />
        )}
      </div>
    </div>
  )
}

export default App