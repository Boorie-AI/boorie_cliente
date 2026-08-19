import {
    Bot,
    Database,
    Calculator,
    FolderTree,
    Network,
    Settings,
} from 'lucide-react'

/**
 * Pasos del recorrido de primer uso (#33).
 *
 * Viven fuera del componente para poder testear el recorrido sin montar la
 * interfaz, y porque exportarlos desde el componente rompe el fast refresh.
 */
export const ONBOARDING_STEPS = [
    {
        title: 'onboarding.welcome.title',
        description: 'onboarding.welcome.desc',
        icon: <Bot className="w-12 h-12 text-primary" />,
        color: 'from-blue-500/20 to-cyan-500/20',
    },
    {
        title: 'onboarding.ai.setup',
        description: 'onboarding.ai.setupDesc',
        icon: <Settings className="w-12 h-12 text-blue-500" />,
        color: 'from-blue-500/20 to-purple-500/20',
        action: 'settings',
    },
    {
        title: 'onboarding.rag.title',
        description: 'onboarding.rag.desc',
        icon: <Database className="w-12 h-12 text-amber-500" />,
        color: 'from-amber-500/20 to-orange-500/20',
        action: 'rag',
    },
    {
        title: 'onboarding.projects.title',
        description: 'onboarding.projects.desc',
        icon: <FolderTree className="w-12 h-12 text-emerald-500" />,
        color: 'from-emerald-500/20 to-teal-500/20',
        action: 'projects',
    },
    {
        title: 'onboarding.calculator.title',
        description: 'onboarding.calculator.desc',
        icon: <Calculator className="w-12 h-12 text-rose-500" />,
        color: 'from-rose-500/20 to-red-500/20',
        action: 'calculator',
    },
    // El recorrido terminaba en la calculadora y dejaba al usuario nuevo sin
    // proyecto ni red, que es justo lo que hace falta para el resto de la
    // aplicación (#33). Este paso cierra el circuito.
    {
        title: 'onboarding.red.title',
        description: 'onboarding.red.desc',
        icon: <Network className="w-12 h-12 text-cyan-500" />,
        color: 'from-cyan-500/20 to-blue-500/20',
        action: 'wntr',
    }
]
