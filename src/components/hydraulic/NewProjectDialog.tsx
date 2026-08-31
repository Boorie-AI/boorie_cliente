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
      setError(t('newProject.errors.nameRequired'))
      return
    }
    
    if (!formData.location.country || !formData.location.region) {
      setError(t('newProject.errors.locationRequired'))
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
  
  // Sólo los valores: el nombre y la explicación de cada uno salen del
  // diccionario de idiomas, que es donde se traducen (#96).
  const projectTypes = ['design', 'analysis', 'optimization', 'troubleshooting'] as const
  const networkTypes = ['distribution', 'transmission', 'collection'] as const
  
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
              {t('newProject.title')}
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
                {t('newProject.sections.info')}
              </h3>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {t('newProject.fields.name')}
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
                  placeholder={t('newProject.placeholders.name')}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {t('newProject.fields.description')}
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
                  placeholder={t('newProject.placeholders.description')}
                />
              </div>
            </div>
            
            {/* Project Type */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-foreground">{t('newProject.sections.type')}</h3>
              <div className="grid grid-cols-2 gap-3">
                {projectTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFormData({ ...formData, type: type as ProjectType })}
                    className={cn(
                      "p-4 rounded-lg border text-left transition-all",
                      formData.type === type
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <div className="font-medium text-foreground mb-1">{t(`newProject.types.${type}.label`)}</div>
                    <div className="text-sm text-muted-foreground">{t(`newProject.types.${type}.description`)}</div>
                  </button>
                ))}
              </div>
            </div>
            
            {/* Network Type */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-foreground">{t('newProject.sections.network')}</h3>
              <div className="grid grid-cols-1 gap-3">
                {networkTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFormData({ ...formData, networkType: type as NetworkType })}
                    className={cn(
                      "p-4 rounded-lg border text-left transition-all",
                      formData.networkType === type
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <div className="font-medium text-foreground mb-1">{t(`newProject.networks.${type}.label`)}</div>
                    <div className="text-sm text-muted-foreground">{t(`newProject.networks.${type}.description`)}</div>
                  </button>
                ))}
              </div>
            </div>
            
            {/* Location */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                {t('newProject.sections.location')}
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    {t('newProject.fields.country')}
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
                    <option value="">{t('newProject.placeholders.country')}</option>
                    {countries.map((country) => (
                      <option key={country.code} value={country.name}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    {t('newProject.fields.region')}
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
                    placeholder={t('newProject.placeholders.region')}
                  />
                </div>
                
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-2">
                    {t('newProject.fields.city')}
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
                    placeholder={t('newProject.placeholders.city')}
                  />
                </div>
              </div>
              
              <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                <p>{t('newProject.regulationsNote')}</p>
              </div>
            </div>
            
            {/* Additional Project Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-foreground">{t('newProject.sections.details')}</h3>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {t('newProject.fields.status')}
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
                  <option value="planning">{t('newProject.status.planning')}</option>
                  <option value="design">{t('newProject.status.design')}</option>
                  <option value="review">{t('newProject.status.review')}</option>
                  <option value="approved">{t('newProject.status.approved')}</option>
                  <option value="construction">{t('newProject.status.construction')}</option>
                  <option value="completed">{t('newProject.status.completed')}</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {t('newProject.fields.startDate')}
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
                  {t('newProject.fields.budget')}
                </label>
                <input
                  type="number"
                  placeholder={t('newProject.placeholders.budget')}
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
                  {t('newProject.fields.manager')}
                </label>
                <input
                  type="text"
                  placeholder={t('newProject.placeholders.manager')}
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
                  {t('newProject.fields.notes')}
                </label>
                <textarea
                  rows={3}
                  placeholder={t('newProject.placeholders.notes')}
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
              {t('newProject.actions.cancel')}
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
              {creating ? t('newProject.actions.creating') : t('newProject.actions.create')}
            </button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  )
}