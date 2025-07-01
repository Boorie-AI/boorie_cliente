import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@/utils/cn'

interface ConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'destructive' | 'default'
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default'
}: ConfirmationModalProps) {
  if (!isOpen) return null

  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in-0"
      onClick={handleBackdropClick}
    >
      <div className={cn(
        "bg-card border border-border rounded-lg shadow-lg max-w-md w-full mx-4",
        "animate-in zoom-in-95 duration-200"
      )}>
        <div className="flex items-center justify-between p-6 pb-4">
          <div className="flex items-center space-x-3">
            {variant === 'destructive' && (
              <div className="flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
            )}
            <h2 className="text-lg font-semibold text-foreground">
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-accent"
          >
            <X size={18} />
          </button>
        </div>
        
        <div className="px-6 pb-6">
          <p className="text-muted-foreground mb-6">
            {message}
          </p>
          
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-md border border-border",
                "text-foreground bg-background hover:bg-accent hover:text-accent-foreground",
                "transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              )}
            >
              {cancelText}
            </button>
            <button
              onClick={handleConfirm}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                variant === 'destructive' 
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}