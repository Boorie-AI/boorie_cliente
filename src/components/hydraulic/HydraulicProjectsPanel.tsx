import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus,
  Search,
  FolderOpen,
  Calendar,
  MapPin,
  MoreVertical,
  Edit,
  Trash2,
  FileText,
  Calculator
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { hydraulicService } from '@/services/hydraulic/hydraulicService'
import { HydraulicProject, ProjectType, ProjectStatus } from '@/types/hydraulic'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { NewProjectDialog } from './NewProjectDialog'
import { EditProjectDialog } from './EditProjectDialog'
import { ProjectDetailView } from './ProjectDetailView'
import { WNTRSimulationWizard } from './WNTRSimulationWizard'
import { WNTRAnalysisPanel } from './WNTRAnalysisPanel'

interface ProjectSummary {
  id: string
  name: string
  type: ProjectType
  status: ProjectStatus
  location: {
    country: string
    region: string
    city?: string
  }
  updatedAt: Date
}

export function HydraulicProjectsPanel() {
  const { t } = useTranslation()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedType, setSelectedType] = useState<ProjectType | 'all'>('all')
  const [selectedStatus, setSelectedStatus] = useState<ProjectStatus | 'all'>('all')
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false)
  const [editingProject, setEditingProject] = useState<HydraulicProject | null>(null)
  const [viewingProjectId, setViewingProjectId] = useState<string | null>(null)
  const [showWNTRWizard, setShowWNTRWizard] = useState(false)
  const [showWNTRAnalysis, setShowWNTRAnalysis] = useState(false)
  
  useEffect(() => {
    loadProjects()
  }, [])
  
  const loadProjects = async () => {
    try {
      setLoading(true)
      const projectList = await hydraulicService.listProjects()
      setProjects(projectList)
    } catch (error) {
      console.error('Failed to load projects:', error)
    } finally {
      setLoading(false)
    }
  }
  
  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.location.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.location.region.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesType = selectedType === 'all' || project.type === selectedType
    const matchesStatus = selectedStatus === 'all' || project.status === selectedStatus
    
    return matchesSearch && matchesType && matchesStatus
  })
  
  const getStatusColor = (status: ProjectStatus) => {
    const colors: Record<ProjectStatus, string> = {
      planning: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
      design: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400',
      review: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
      approved: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
      construction: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400',
      completed: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
      maintenance: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-400'
    }
    return colors[status]
  }
  
  const getTypeIcon = (type: ProjectType) => {
    switch (type) {
      case 'design':
        return <FileText className="w-4 h-4" />
      case 'analysis':
        return <Calculator className="w-4 h-4" />
      case 'optimization':
        return <MoreVertical className="w-4 h-4" />
      case 'troubleshooting':
        return <Edit className="w-4 h-4" />
    }
  }
  
  const handleEditProject = async (projectId: string) => {
    try {
      const project = await hydraulicService.getProject(projectId)
      setEditingProject(project)
    } catch (error) {
      console.error('Failed to load project for editing:', error)
      alert('Failed to load project: ' + (error as Error).message)
    }
  }
  
  const handleDeleteProject = async (projectId: string) => {
    if (confirm('Are you sure you want to delete this project?')) {
      try {
        await hydraulicService.deleteProject(projectId)
        await loadProjects()
      } catch (error) {
        console.error('Failed to delete project:', error)
        alert('Failed to delete project: ' + (error as Error).message)
      }
    }
  }
  
  // Show project details if viewing a project
  if (viewingProjectId) {
    return (
      <ProjectDetailView
        projectId={viewingProjectId}
        onBack={() => setViewingProjectId(null)}
      />
    )
  }
  
  return (
    <div className="flex-1 flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold text-foreground">Hydraulic Projects</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setShowWNTRAnalysis(true)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-blue-600 text-white hover:bg-blue-700",
                "transition-colors"
              )}
            >
              <Calculator className="w-4 h-4" />
              WNTR Analysis
            </button>
            <button
              onClick={() => setShowWNTRWizard(true)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-green-600 text-white hover:bg-green-700",
                "transition-colors"
              )}
            >
              <FileText className="w-4 h-4" />
              WNTR Simulation
            </button>
            <Dialog.Root open={showNewProjectDialog} onOpenChange={setShowNewProjectDialog}>
              <Dialog.Trigger asChild>
                <button className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg",
                  "bg-primary text-primary-foreground hover:bg-primary/90",
                  "transition-colors"
                )}>
                  <Plus className="w-4 h-4" />
                  New Project
                </button>
              </Dialog.Trigger>
              <NewProjectDialog onClose={() => setShowNewProjectDialog(false)} onProjectCreated={loadProjects} />
            </Dialog.Root>
          </div>
        </div>
        
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(
                "w-full pl-10 pr-4 py-2 rounded-lg",
                "bg-input border border-border",
                "focus:outline-none focus:ring-2 focus:ring-ring",
                "placeholder:text-muted-foreground"
              )}
            />
          </div>
          
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as ProjectType | 'all')}
            className={cn(
              "px-4 py-2 rounded-lg",
              "bg-input border border-border",
              "focus:outline-none focus:ring-2 focus:ring-ring"
            )}
          >
            <option value="all">All Types</option>
            <option value="design">Design</option>
            <option value="analysis">Analysis</option>
            <option value="optimization">Optimization</option>
            <option value="troubleshooting">Troubleshooting</option>
          </select>
          
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as ProjectStatus | 'all')}
            className={cn(
              "px-4 py-2 rounded-lg",
              "bg-input border border-border",
              "focus:outline-none focus:ring-2 focus:ring-ring"
            )}
          >
            <option value="all">All Status</option>
            <option value="planning">Planning</option>
            <option value="design">Design</option>
            <option value="review">Review</option>
            <option value="approved">Approved</option>
            <option value="construction">Construction</option>
            <option value="completed">Completed</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>
      </div>
      
      {/* Projects Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Loading projects...</div>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <FolderOpen className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No projects found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || selectedType !== 'all' || selectedStatus !== 'all'
                ? 'Try adjusting your filters'
                : 'Create your first hydraulic project to get started'}
            </p>
            {!searchQuery && selectedType === 'all' && selectedStatus === 'all' && (
              <button
                onClick={() => setShowNewProjectDialog(true)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg",
                  "bg-primary text-primary-foreground hover:bg-primary/90",
                  "transition-colors"
                )}
              >
                <Plus className="w-4 h-4" />
                Create First Project
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                className={cn(
                  "p-4 rounded-lg border border-border",
                  "bg-card hover:bg-accent/50",
                  "transition-colors cursor-pointer",
                  "group relative"
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {getTypeIcon(project.type)}
                    <h3 className="font-medium text-foreground">{project.name}</h3>
                  </div>
                  
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button className={cn(
                        "p-1 rounded opacity-0 group-hover:opacity-100",
                        "hover:bg-accent transition-all",
                        "focus:opacity-100 focus:outline-none"
                      )}>
                        <MoreVertical className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </DropdownMenu.Trigger>
                    
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        className={cn(
                          "min-w-[160px] bg-popover rounded-lg shadow-lg",
                          "border border-border p-1 z-50"
                        )}
                      >
                        <DropdownMenu.Item
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 text-sm",
                            "hover:bg-accent rounded cursor-pointer",
                            "focus:bg-accent focus:outline-none"
                          )}
                          onClick={() => setViewingProjectId(project.id)}
                        >
                          <FolderOpen className="w-4 h-4" />
                          Open
                        </DropdownMenu.Item>
                        
                        <DropdownMenu.Item
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 text-sm",
                            "hover:bg-accent rounded cursor-pointer",
                            "focus:bg-accent focus:outline-none"
                          )}
                          onClick={() => handleEditProject(project.id)}
                        >
                          <Edit className="w-4 h-4" />
                          Edit
                        </DropdownMenu.Item>
                        
                        <DropdownMenu.Separator className="my-1 h-px bg-border" />
                        
                        <DropdownMenu.Item
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 text-sm",
                            "hover:bg-accent rounded cursor-pointer",
                            "focus:bg-accent focus:outline-none",
                            "text-destructive"
                          )}
                          onClick={() => handleDeleteProject(project.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="w-3 h-3" />
                    <span>
                      {project.location.city && `${project.location.city}, `}
                      {project.location.region}, {project.location.country}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "px-2 py-1 text-xs font-medium rounded-full",
                      getStatusColor(project.status)
                    )}>
                      {project.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Edit Project Dialog */}
      {editingProject && (
        <Dialog.Root open={!!editingProject} onOpenChange={() => setEditingProject(null)}>
          <EditProjectDialog
            project={editingProject}
            onClose={() => setEditingProject(null)}
            onProjectUpdated={() => {
              setEditingProject(null)
              loadProjects()
            }}
          />
        </Dialog.Root>
      )}

      {/* WNTR Dialogs */}
      <Dialog.Root open={showWNTRWizard} onOpenChange={setShowWNTRWizard}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Dialog.Content className="fixed inset-0 z-50 overflow-hidden">
            <div className="h-full w-full p-4">
              <WNTRSimulationWizard 
                onSimulationComplete={(results) => {
                  console.log('Simulation completed:', results)
                  setShowWNTRWizard(false)
                }}
              />
              <Dialog.Close asChild>
                <button 
                  className="absolute top-4 right-4 p-2 rounded-lg bg-black/10 hover:bg-black/20"
                  onClick={() => setShowWNTRWizard(false)}
                >
                  ✕
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={showWNTRAnalysis} onOpenChange={setShowWNTRAnalysis}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Dialog.Content className="fixed inset-0 z-50 overflow-auto">
            <div className="min-h-full w-full p-4">
              <div className="bg-white rounded-lg max-w-6xl mx-auto">
                <div className="p-6">
                  <WNTRAnalysisPanel 
                    onAnalysisComplete={(results) => {
                      console.log('Analysis completed:', results)
                    }}
                  />
                </div>
                <Dialog.Close asChild>
                  <button 
                    className="absolute top-4 right-4 p-2 rounded-lg bg-black/10 hover:bg-black/20"
                    onClick={() => setShowWNTRAnalysis(false)}
                  >
                    ✕
                  </button>
                </Dialog.Close>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}