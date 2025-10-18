import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as Dialog from '@radix-ui/react-dialog'
import { X, MapPin, FileText } from 'lucide-react'
import { cn } from '@/utils/cn'
import { hydraulicService } from '@/services/hydraulic/hydraulicService'
import { ProjectType, NetworkType } from '@/types/hydraulic'

interface NewProjectDialogProps {
  onClose: () => void
  onProjectCreated: (project?: any) => void
}

export function NewProjectDialog({ onClose, onProjectCreated }: NewProjectDialogProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'design' as ProjectType,
    networkType: 'distribution' as NetworkType,
    location: {
      country: '',
      region: '',
      city: ''
    },
    status: 'planning' as any
  })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name.trim()) {
      setError('Project name is required')
      return
    }
    
    if (!formData.location.country || !formData.location.region) {
      setError('Country and region are required')
      return
    }
    
    try {
      setCreating(true)
      setError(null)
      
      const newProject = await hydraulicService.createProject({
        ...formData,
        regulations: [] // Will be populated based on location
      })
      
      onProjectCreated(newProject)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setCreating(false)
    }
  }
  
  const projectTypes = [
    { value: 'design', label: 'New Network Design', description: 'Design a new water distribution network' },
    { value: 'analysis', label: 'Network Analysis', description: 'Analyze an existing network' },
    { value: 'optimization', label: 'System Optimization', description: 'Optimize network performance' },
    { value: 'troubleshooting', label: 'Problem Solving', description: 'Diagnose and solve network issues' }
  ]
  
  const networkTypes = [
    { value: 'distribution', label: 'Distribution Network', description: 'Secondary network for end users' },
    { value: 'transmission', label: 'Transmission Main', description: 'Primary water transmission lines' },
    { value: 'collection', label: 'Collection System', description: 'Wastewater collection network' }
  ]
  
  const countries = [
    { code: 'MX', name: 'México' },
    { code: 'CO', name: 'Colombia' },
    { code: 'ES', name: 'España' },
    { code: 'CL', name: 'Chile' },
    { code: 'AR', name: 'Argentina' },
    { code: 'PE', name: 'Perú' }
  ]
  
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
      <Dialog.Content className={cn(
        "fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2",
        "bg-background border border-border rounded-xl shadow-xl",
        "w-full max-w-2xl max-h-[85vh] overflow-hidden z-50",
        "flex flex-col"
      )}>
        <form onSubmit={handleSubmit} className="flex flex-col h-full max-h-[85vh]">
          {/* Header - Fixed */}
          <div className="flex items-center justify-between p-6 border-b border-border flex-shrink-0">
            <Dialog.Title className="text-xl font-semibold text-foreground">
              Create New Hydraulic Project
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className={cn(
                  "p-2 rounded-lg hover:bg-accent",
                  "transition-colors"
                )}
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>
          
          {/* Content - Scrollable */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}
            
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Project Information
              </h3>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Project Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={cn(
                    "w-full px-4 py-2 rounded-lg",
                    "bg-input border border-border",
                    "focus:outline-none focus:ring-2 focus:ring-ring",
                    "placeholder:text-muted-foreground"
                  )}
                  placeholder="e.g., Downtown Water Distribution Upgrade"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className={cn(
                    "w-full px-4 py-2 rounded-lg",
                    "bg-input border border-border",
                    "focus:outline-none focus:ring-2 focus:ring-ring",
                    "placeholder:text-muted-foreground",
                    "resize-none"
                  )}
                  placeholder="Brief description of the project objectives and scope..."
                />
              </div>
            </div>
            
            {/* Project Type */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-foreground">Project Type *</h3>
              <div className="grid grid-cols-2 gap-3">
                {projectTypes.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, type: type.value as ProjectType })}
                    className={cn(
                      "p-4 rounded-lg border text-left transition-all",
                      formData.type === type.value
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <div className="font-medium text-foreground mb-1">{type.label}</div>
                    <div className="text-sm text-muted-foreground">{type.description}</div>
                  </button>
                ))}
              </div>
            </div>
            
            {/* Network Type */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-foreground">Network Type *</h3>
              <div className="grid grid-cols-1 gap-3">
                {networkTypes.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, networkType: type.value as NetworkType })}
                    className={cn(
                      "p-4 rounded-lg border text-left transition-all",
                      formData.networkType === type.value
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <div className="font-medium text-foreground mb-1">{type.label}</div>
                    <div className="text-sm text-muted-foreground">{type.description}</div>
                  </button>
                ))}
              </div>
            </div>
            
            {/* Location */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Project Location
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Country *
                  </label>
                  <select
                    value={formData.location.country}
                    onChange={(e) => setFormData({
                      ...formData,
                      location: { ...formData.location, country: e.target.value }
                    })}
                    className={cn(
                      "w-full px-4 py-2 rounded-lg",
                      "bg-input border border-border",
                      "focus:outline-none focus:ring-2 focus:ring-ring"
                    )}
                  >
                    <option value="">Select country...</option>
                    {countries.map((country) => (
                      <option key={country.code} value={country.name}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    State/Region *
                  </label>
                  <input
                    type="text"
                    value={formData.location.region}
                    onChange={(e) => setFormData({
                      ...formData,
                      location: { ...formData.location, region: e.target.value }
                    })}
                    className={cn(
                      "w-full px-4 py-2 rounded-lg",
                      "bg-input border border-border",
                      "focus:outline-none focus:ring-2 focus:ring-ring",
                      "placeholder:text-muted-foreground"
                    )}
                    placeholder="e.g., CDMX, Antioquia"
                  />
                </div>
                
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-2">
                    City
                  </label>
                  <input
                    type="text"
                    value={formData.location.city}
                    onChange={(e) => setFormData({
                      ...formData,
                      location: { ...formData.location, city: e.target.value }
                    })}
                    className={cn(
                      "w-full px-4 py-2 rounded-lg",
                      "bg-input border border-border",
                      "focus:outline-none focus:ring-2 focus:ring-ring",
                      "placeholder:text-muted-foreground"
                    )}
                    placeholder="e.g., Mexico City, Bogotá"
                  />
                </div>
              </div>
              
              <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                <p>Based on your location, relevant hydraulic regulations will be automatically applied to your project.</p>
              </div>
            </div>
            
            {/* Additional Project Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-foreground">Additional Details</h3>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Project Status
                </label>
                <select
                  value={formData.status || 'planning'}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className={cn(
                    "w-full px-4 py-2 rounded-lg",
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
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Expected Start Date
                </label>
                <input
                  type="date"
                  className={cn(
                    "w-full px-4 py-2 rounded-lg",
                    "bg-input border border-border",
                    "focus:outline-none focus:ring-2 focus:ring-ring"
                  )}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Project Budget (USD)
                </label>
                <input
                  type="number"
                  placeholder="e.g., 1000000"
                  className={cn(
                    "w-full px-4 py-2 rounded-lg",
                    "bg-input border border-border",
                    "focus:outline-none focus:ring-2 focus:ring-ring",
                    "placeholder:text-muted-foreground"
                  )}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Project Manager
                </label>
                <input
                  type="text"
                  placeholder="Name of the project manager"
                  className={cn(
                    "w-full px-4 py-2 rounded-lg",
                    "bg-input border border-border",
                    "focus:outline-none focus:ring-2 focus:ring-ring",
                    "placeholder:text-muted-foreground"
                  )}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Additional Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Any additional information about the project..."
                  className={cn(
                    "w-full px-4 py-2 rounded-lg",
                    "bg-input border border-border",
                    "focus:outline-none focus:ring-2 focus:ring-ring",
                    "placeholder:text-muted-foreground",
                    "resize-none"
                  )}
                />
              </div>
            </div>
          </div>
          
          {/* Footer - Fixed */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-border flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={creating}
              className={cn(
                "px-4 py-2 rounded-lg",
                "border border-border hover:bg-accent",
                "transition-colors",
                "disabled:opacity-50"
              )}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className={cn(
                "px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:bg-primary/90 transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {creating ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  )
}