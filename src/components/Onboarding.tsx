import { motion } from 'framer-motion'
import { useAppStore } from '@/stores/appStore'
import { useTranslation } from 'react-i18next'
import {
    ChevronRight,
    ChevronLeft,
    CheckCircle2,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { ONBOARDING_STEPS } from '@/config/onboardingPasos'


export function Onboarding() {
    const { t } = useTranslation()
    const {
        showOnboarding,
        onboardingStep,
        setOnboardingStep,
        completeOnboarding,
        setCurrentView,
        setSettingsTab
    } = useAppStore()

    if (!showOnboarding) return null

    const step = ONBOARDING_STEPS[onboardingStep]
    const isLastStep = onboardingStep === ONBOARDING_STEPS.length - 1

    const handleNext = () => {
        if (isLastStep) {
            completeOnboarding()
        } else {
            const nextStep = onboardingStep + 1
            setOnboardingStep(nextStep)
            const nextAction = ONBOARDING_STEPS[nextStep].action
            if (nextAction === 'settings') {
                setCurrentView('settings')
                setSettingsTab('ai-config')
            } else if (nextAction) {
                setCurrentView(nextAction as any)
            }
        }
    }

    const handlePrev = () => {
        if (onboardingStep > 0) {
            const prevStep = onboardingStep - 1
            setOnboardingStep(prevStep)
            const prevAction = ONBOARDING_STEPS[prevStep].action
            if (prevAction === 'settings') {
                setCurrentView('settings')
                setSettingsTab('ai-config')
            } else if (prevAction) {
                setCurrentView(prevAction as any)
            } else {
                setCurrentView('chat')
            }
        }
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className={cn(
                    "relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden",
                    "flex flex-col"
                )}
            >
                <div className={cn("h-32 bg-gradient-to-br flex items-center justify-center", step.color)}>
                    <div className="bg-background p-4 rounded-2xl shadow-sm border border-border/50">
                        {step.icon}
                    </div>
                </div>

                <div className="p-8 text-center space-y-4">
                    <h2 className="text-2xl font-bold text-foreground">
                        {t(step.title)}
                    </h2>
                    <p className="text-muted-foreground leading-relaxed">
                        {t(step.description)}
                    </p>
                </div>

                <div className="px-8 pb-8 pt-4 flex flex-col space-y-4">
                    <div className="flex justify-center space-x-1.5">
                        {ONBOARDING_STEPS.map((_, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "h-1.5 rounded-full transition-all duration-300",
                                    onboardingStep === i ? "w-8 bg-primary" : "w-1.5 bg-muted"
                                )}
                            />
                        ))}
                    </div>

                    <div className="flex items-center justify-between mt-4">
                        <button
                            onClick={handlePrev}
                            disabled={onboardingStep === 0}
                            className="flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent transition-colors disabled:opacity-30"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            <span>{t('common.previous')}</span>
                        </button>

                        <button
                            onClick={handleNext}
                            className="flex items-center space-x-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
                        >
                            <span>{isLastStep ? t('common.finish') : t('common.next')}</span>
                            {isLastStep ? <CheckCircle2 className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                    </div>

                    <button
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors self-center mt-2"
                        onClick={completeOnboarding}
                    >
                        {t('common.skipOnboarding')}
                    </button>
                </div>
            </motion.div>
        </div>
    )
}
