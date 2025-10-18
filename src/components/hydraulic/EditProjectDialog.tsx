import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { cn } from '@/utils/cn'
import * as Dialog from '@radix-ui/react-dialog'
import { HydraulicProject, ProjectType, NetworkType, ProjectStatus } from '@/types/hydraulic'
import { hydraulicService } from '@/services/hydraulic/hydraulicService'

interface EditProjectDialogProps {
  project: HydraulicProject
  onClose: () => void
  onProjectUpdated: () => void
}

export function EditProjectDialog({ project, onClose, onProjectUpdated }: EditProjectDialogProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: project.name,
    description: project.description || '',
    type: project.type,
    networkType: project.network?.options.units || 'distribution',
    status: project.status,
    location: {
      country: project.location.country,
      region: project.location.region,
      city: project.location.city || ''
    }
  })
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      setLoading(true)
      
      await hydraulicService.updateProject(project.id, {
        name: formData.name,
        description: formData.description,
        type: formData.type,
        status: formData.status,
        location: formData.location
      })
      
      onProjectUpdated()
      onClose()
    } catch (error) {
      console.error('Failed to update project:', error)
      alert('Failed to update project: ' + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
      <Dialog.Content className={cn(
        "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
        "w-full max-w-lg max-h-[90vh] overflow-y-auto",
        "bg-background rounded-lg shadow-xl",
        "p-6 z-50"
      )}>
        <div className="flex items-center justify-between mb-6">
          <Dialog.Title className="text-xl font-semibold text-foreground">
            Edit Project
          </Dialog.Title>
          <Dialog.Close asChild>
            <button
              className="p-2 rounded-lg hover:bg-accent transition-colors"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </button>
          </Dialog.Close>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Project Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Project Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={cn(
                "w-full px-3 py-2 rounded-lg",
                "bg-input border border-border",
                "focus:outline-none focus:ring-2 focus:ring-ring",
                "placeholder:text-muted-foreground"
              )}
              placeholder="Enter project name"
              required
            />
          </div>
          
          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className={cn(
                "w-full px-3 py-2 rounded-lg",
                "bg-input border border-border",
                "focus:outline-none focus:ring-2 focus:ring-ring",
                "placeholder:text-muted-foreground",
                "resize-none"
              )}
              placeholder="Project description"
              rows={3}
            />
          </div>
          
          {/* Project Type */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Project Type
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as ProjectType })}
              className={cn(
                "w-full px-3 py-2 rounded-lg",
                "bg-input border border-border",
                "focus:outline-none focus:ring-2 focus:ring-ring"
              )}
            >
              <option value="design">Design</option>
              <option value="analysis">Analysis</option>
              <option value="optimization">Optimization</option>
              <option value="troubleshooting">Troubleshooting</option>
            </select>
          </div>
          
          {/* Project Status */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Status
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as ProjectStatus })}
              className={cn(
                "w-full px-3 py-2 rounded-lg",
                "bg-input border border-border",
                "focus:outline-none focus:ring-2 focus:ring-ring"
              )}
            >
              <option value="planning">Planning</option>
              <option value="design">Design</option>
              <option value="review">Review</option>
              <option value="approved">Approved</option>
              <option value="construction">Construction</option>
              <option value="completed">Completed</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>
          
          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Location
            </label>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={formData.location.country}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  location: { ...formData.location, country: e.target.value }
                })}
                className={cn(
                  "px-3 py-2 rounded-lg",
                  "bg-input border border-border",
                  "focus:outline-none focus:ring-2 focus:ring-ring",
                  "placeholder:text-muted-foreground"
                )}
                placeholder="Country"
                required
              />
              <input
                type="text"
                value={formData.location.region}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  location: { ...formData.location, region: e.target.value }
                })}
                className={cn(
                  "px-3 py-2 rounded-lg",
                  "bg-input border border-border",
                  "focus:outline-none focus:ring-2 focus:ring-ring",
                  "placeholder:text-muted-foreground"
                )}
                placeholder="State/Region"
                required
              />
              <input
                type="text"
                value={formData.location.city}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  location: { ...formData.location, city: e.target.value }
                })}
                className={cn(
                  "px-3 py-2 rounded-lg",
                  "bg-input border border-border",
                  "focus:outline-none focus:ring-2 focus:ring-ring",
                  "placeholder:text-muted-foreground"
                )}
                placeholder="City"
              />
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "flex-1 px-4 py-2 rounded-lg",
                "bg-secondary text-secondary-foreground",
                "hover:bg-secondary/80 transition-colors"
              )}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={cn(
                "flex-1 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:bg-primary/90 transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {loading ? 'Updating...' : 'Update Project'}
            </button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  )
}