// Document Progress Bar - Shows processing progress for documents

import React from 'react'
import { useTranslation } from 'react-i18next'
import { DocumentProgress } from '@/stores/ragStore'

interface DocumentProgressBarProps {
  progress: DocumentProgress
  className?: string
}

export function DocumentProgressBar({ progress, className = '' }: DocumentProgressBarProps) {
  const { t } = useTranslation()
  
  const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
  
  const getPhaseText = (phase: string) => {
    switch (phase) {
      case 'chunking':
        return t('rag.progress.chunking')
      case 'embedding':
        return t('rag.progress.embedding')
      case 'completed':
        return t('rag.progress.completed')
      default:
        return t('rag.progress.processing')
    }
  }
  
  const getPhaseColor = (phase: string) => {
    switch (phase) {
      case 'chunking':
        return 'bg-blue-500'
      case 'embedding':
        return 'bg-yellow-500'
      case 'completed':
        return 'bg-green-500'
      default:
        return 'bg-primary'
    }
  }
  
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground font-medium">
          {getPhaseText(progress.phase)}
        </span>
        <span className="text-muted-foreground">
          {progress.current}/{progress.total} ({percentage}%)
        </span>
      </div>
      
      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
        <div 
          className={`h-full transition-all duration-300 ease-out rounded-full ${getPhaseColor(progress.phase)}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      
      {progress.message && (
        <p className="text-xs text-muted-foreground">
          {progress.message}
        </p>
      )}
      
      {progress.phase === 'completed' && (
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
          <CheckIcon className="w-4 h-4" />
          <span>{t('rag.progress.completedMessage')}</span>
        </div>
      )}
    </div>
  )
}

// Icon component
const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)