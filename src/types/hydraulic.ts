// Core hydraulic engineering types

export type ProjectType = 'design' | 'analysis' | 'optimization' | 'troubleshooting'
export type NetworkType = 'distribution' | 'transmission' | 'collection'
export type AnalysisType = 'hydraulic' | 'water_quality' | 'resilience' | 'energy'

export interface HydraulicContext {
  projectType: ProjectType
  networkType: NetworkType
  region: string
  regulations: string[]
  components: ComponentType[]
  constraints: Constraint[]
}

export interface ComponentType {
  id: string
  type: 'pipe' | 'pump' | 'valve' | 'tank' | 'reservoir' | 'junction'
  properties: Record<string, any>
}

export interface Constraint {
  type: 'pressure' | 'velocity' | 'head_loss' | 'flow' | 'budget'
  min?: number
  max?: number
  units: string
}

export interface HydraulicFormula {
  id: string
  name: string
  category: 'head_loss' | 'pump' | 'flow' | 'water_hammer' | 'tank_sizing'
  equation: string
  parameters: FormulaParameter[]
  units: UnitSystem
}

export interface FormulaParameter {
  symbol: string
  name: string
  description: string
  units: string[]
  defaultValue?: number
  range?: { min: number; max: number }
}

export interface UnitSystem {
  length: 'meters' | 'feet'
  flow: 'm3/s' | 'L/s' | 'gpm' | 'cfs'
  pressure: 'mH2O' | 'kPa' | 'psi' | 'bar'
  diameter: 'mm' | 'inches'
}

export interface CalculationResult {
  formula: string
  inputs: Record<string, { value: number; unit: string }>
  result: { value: number; unit: string }
  intermediateSteps?: Step[]
  warnings?: string[]
  recommendations?: string[]
}

export interface Step {
  description: string
  formula: string
  result: number
}

export interface WNTRModel {
  nodes: WNTRNode[]
  links: WNTRLink[]
  patterns: Pattern[]
  curves: Curve[]
  controls: Control[]
  options: WNTROptions
}

export interface WNTRNode {
  id: string
  type: 'junction' | 'tank' | 'reservoir'
  coordinates: [number, number]
  elevation: number
  demand?: number
  pattern?: string
}

export interface WNTRLink {
  id: string
  type: 'pipe' | 'pump' | 'valve'
  startNode: string
  endNode: string
  properties: LinkProperties
}

export interface LinkProperties {
  length?: number
  diameter?: number
  roughness?: number
  status?: 'open' | 'closed'
  setting?: number
}

export interface Pattern {
  id: string
  type: 'demand' | 'energy' | 'head'
  multipliers: number[]
  timeStep: number
}

export interface Curve {
  id: string
  type: 'pump' | 'efficiency' | 'volume' | 'head_loss'
  points: [number, number][]
}

export interface Control {
  id: string
  type: 'simple' | 'rule'
  condition: string
  action: string
}

export interface WNTROptions {
  units: 'SI' | 'US'
  headloss: 'H-W' | 'D-W' | 'C-M'
  hydraulics: {
    trials: number
    accuracy: number
    unbalanced: 'stop' | 'continue'
    pattern: string
  }
  time: {
    duration: number
    hydraulicTimestep: number
    qualityTimestep: number
    reportTimestep: number
    reportStart: number
  }
  report: {
    status: boolean
    summary: boolean
    energy: boolean
  }
}

export interface HydraulicProject {
  id: string
  name: string
  description?: string
  type: ProjectType
  location: {
    country: string
    region: string
    city?: string
    coordinates?: [number, number]
  }
  regulations: Regulation[]
  network?: WNTRModel
  documents: ProjectDocument[]
  calculations: HydraulicCalculation[]
  timeline: Timeline
  team: TeamMember[]
  status: ProjectStatus
  createdAt: Date
  updatedAt: Date
}

export interface Regulation {
  id: string
  code: string
  name: string
  country: string
  category: 'water_quality' | 'design_standards' | 'operation' | 'safety'
  requirements: Requirement[]
  effectiveDate: Date
  version: string
}

export interface Requirement {
  id: string
  parameter: string
  condition: string
  value: string | number
  units?: string
}

export interface ProjectDocument {
  id: string
  projectId: string
  type: 'calculation_memory' | 'technical_spec' | 'report' | 'plan' | 'regulation_compliance'
  title: string
  content: string
  metadata: {
    author: string
    version: string
    status: 'draft' | 'review' | 'approved'
    approvedBy?: string
    approvalDate?: Date
  }
  attachments?: Attachment[]
  createdAt: Date
  updatedAt: Date
}

export interface HydraulicCalculation {
  id: string
  projectId: string
  type: string
  name: string
  inputs: Record<string, any>
  results: CalculationResult
  verified: boolean
  verifiedBy?: string
  notes?: string
  createdAt: Date
}

export interface Timeline {
  phases: Phase[]
  milestones: Milestone[]
  currentPhase: string
}

export interface Phase {
  id: string
  name: string
  startDate: Date
  endDate: Date
  status: 'pending' | 'in_progress' | 'completed' | 'delayed'
  deliverables: string[]
}

export interface Milestone {
  id: string
  name: string
  date: Date
  achieved: boolean
  description: string
}

export interface TeamMember {
  id: string
  userId: string
  role: 'project_manager' | 'design_engineer' | 'reviewer' | 'client' | 'contractor'
  permissions: Permission[]
  joinedAt: Date
}

export interface Permission {
  resource: 'project' | 'calculations' | 'documents' | 'network' | 'team'
  actions: ('read' | 'write' | 'delete' | 'approve')[]
}

export type ProjectStatus = 'planning' | 'design' | 'review' | 'approved' | 'construction' | 'completed' | 'maintenance'

export interface Attachment {
  id: string
  filename: string
  type: string
  size: number
  url: string
  uploadedAt: Date
}

// RAG Document types
export interface HydraulicDocument {
  id: string
  category: 'hydraulics' | 'regulations' | 'best-practices'
  subcategory: string
  region: string[]
  secondaryCategories?: string[]
  title: string
  content: string
  metadata: {
    formulas?: HydraulicFormula[]
    tables?: DataTable[]
    figures?: Figure[]
    examples?: Example[]
    references: Reference[]
    keywords: string[]
    language: string
  }
  embeddings?: number[]
  lastUpdated: Date
  version: string
}

export interface DataTable {
  id: string
  title: string
  headers: string[]
  rows: (string | number)[][]
  units?: string[]
  notes?: string
}

export interface Figure {
  id: string
  title: string
  type: 'diagram' | 'chart' | 'photo' | 'schematic'
  url: string
  caption: string
}

export interface Example {
  id: string
  title: string
  description: string
  problem: string
  solution: string
  calculations?: CalculationResult[]
}

export interface Reference {
  id: string
  type: 'standard' | 'book' | 'article' | 'regulation' | 'manual'
  title: string
  authors?: string[]
  organization?: string
  year?: number
  url?: string
  accessDate?: Date
}