import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  FileText,
  Calculator,
  Users,
  Calendar,
  MapPin,
  Edit,
  Trash2,
  Plus,
  Download,
  Clock
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { hydraulicService } from '@/services/hydraulic/hydraulicService'
import { HydraulicProject, ProjectStatus } from '@/types/hydraulic'
import * as Tabs from '@radix-ui/react-tabs'

interface ProjectDetailViewProps {
  projectId: string
  onBack: () => void
}

export function ProjectDetailView({ projectId, onBack }: ProjectDetailViewProps) {
  const { t } = useTranslation()
  const [project, setProject] = useState<HydraulicProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  
  useEffect(() => {
    loadProject()
  }, [projectId])
  
  const loadProject = async () => {
    try {
      setLoading(true)
      const projectData = await hydraulicService.getProject(projectId)
      setProject(projectData)
    } catch (error) {
      console.error('Failed to load project:', error)
      alert('Failed to load project: ' + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }
  
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
  
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-muted-foreground">Loading project...</div>
      </div>
    )
  }
  
  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h3 className="text-lg font-medium text-foreground mb-2">Project not found</h3>
          <button
            onClick={onBack}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg",
              "bg-secondary text-secondary-foreground hover:bg-secondary/80",
              "transition-colors"
            )}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Projects
          </button>
        </div>
      </div>
    )
  }
  
  return (
    <div className="flex-1 flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border">
        <div className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={onBack}
              className={cn(
                "p-2 rounded-lg hover:bg-accent transition-colors"
              )}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-2xl font-semibold text-foreground">{project.name}</h1>
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  <span>
                    {project.location.city && `${project.location.city}, `}
                    {project.location.region}, {project.location.country}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
                </div>
                <span className={cn(
                  "px-2 py-1 text-xs font-medium rounded-full",
                  getStatusColor(project.status)
                )}>
                  {project.status}
                </span>
              </div>
            </div>
          </div>
          
          {/* Tabs */}
          <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
            <Tabs.List className="flex gap-1 border-b border-border -mb-px">
              <Tabs.Trigger
                value="overview"
                className={cn(
                  "px-4 py-2 text-sm font-medium transition-colors",
                  "border-b-2 border-transparent",
                  activeTab === 'overview'
                    ? "text-primary border-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Overview
              </Tabs.Trigger>
              <Tabs.Trigger
                value="calculations"
                className={cn(
                  "px-4 py-2 text-sm font-medium transition-colors",
                  "border-b-2 border-transparent flex items-center gap-2",
                  activeTab === 'calculations'
                    ? "text-primary border-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Calculator className="w-4 h-4" />
                Calculations ({project.calculations.length})
              </Tabs.Trigger>
              <Tabs.Trigger
                value="documents"
                className={cn(
                  "px-4 py-2 text-sm font-medium transition-colors",
                  "border-b-2 border-transparent flex items-center gap-2",
                  activeTab === 'documents'
                    ? "text-primary border-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <FileText className="w-4 h-4" />
                Documents ({project.documents.length})
              </Tabs.Trigger>
              <Tabs.Trigger
                value="team"
                className={cn(
                  "px-4 py-2 text-sm font-medium transition-colors",
                  "border-b-2 border-transparent flex items-center gap-2",
                  activeTab === 'team'
                    ? "text-primary border-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Users className="w-4 h-4" />
                Team ({project.team.length})
              </Tabs.Trigger>
            </Tabs.List>
          </Tabs.Root>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'overview' && (
          <div className="max-w-4xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-card rounded-lg border border-border p-4">
                <h3 className="font-semibold text-foreground mb-3">Project Information</h3>
                <dl className="space-y-2">
                  <div>
                    <dt className="text-sm text-muted-foreground">Type</dt>
                    <dd className="font-medium capitalize">{project.type}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Network Type</dt>
                    <dd className="font-medium capitalize">
                      {project.network?.options.units || 'Not specified'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Created</dt>
                    <dd className="font-medium">{new Date(project.createdAt).toLocaleDateString()}</dd>
                  </div>
                </dl>
              </div>
              
              <div className="bg-card rounded-lg border border-border p-4">
                <h3 className="font-semibold text-foreground mb-3">Regulations</h3>
                {project.regulations.length > 0 ? (
                  <ul className="space-y-1">
                    {project.regulations.map((reg, index) => (
                      <li key={index} className="text-sm">
                        <span className="font-medium">{reg.code}</span>
                        {reg.name && <span className="text-muted-foreground"> - {reg.name}</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No regulations applied</p>
                )}
              </div>
              
              {project.description && (
                <div className="bg-card rounded-lg border border-border p-4 md:col-span-2">
                  <h3 className="font-semibold text-foreground mb-3">Description</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {project.description}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
        
        {activeTab === 'calculations' && (
          <div className="max-w-4xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Calculations</h3>
              <button className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "transition-colors"
              )}>
                <Plus className="w-4 h-4" />
                New Calculation
              </button>
            </div>
            
            {project.calculations.length > 0 ? (
              <div className="space-y-3">
                {project.calculations.map((calc) => (
                  <div
                    key={calc.id}
                    className="bg-card rounded-lg border border-border p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium text-foreground">{calc.name}</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Type: {calc.type} • {new Date(calc.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      {calc.verified && (
                        <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400 px-2 py-1 rounded-full">
                          Verified
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Calculator className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No calculations yet</p>
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'documents' && (
          <div className="max-w-4xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Documents</h3>
              <button className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "transition-colors"
              )}>
                <Plus className="w-4 h-4" />
                Upload Document
              </button>
            </div>
            
            {project.documents.length > 0 ? (
              <div className="space-y-3">
                {project.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="bg-card rounded-lg border border-border p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium text-foreground">{doc.title}</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Type: {doc.type} • {new Date(doc.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <button className="p-2 rounded hover:bg-accent transition-colors">
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No documents uploaded</p>
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'team' && (
          <div className="max-w-4xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Team Members</h3>
              <button className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "transition-colors"
              )}>
                <Plus className="w-4 h-4" />
                Add Member
              </button>
            </div>
            
            {project.team.length > 0 ? (
              <div className="space-y-3">
                {project.team.map((member) => (
                  <div
                    key={member.id}
                    className="bg-card rounded-lg border border-border p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-foreground">User {member.userId}</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Role: {member.role} • Joined {new Date(member.joinedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No team members yet</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}