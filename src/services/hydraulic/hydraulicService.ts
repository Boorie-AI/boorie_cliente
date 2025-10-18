import { 
  HydraulicContext,
  HydraulicProject,
  HydraulicFormula,
  CalculationResult
} from '@/types/hydraulic'

export class HydraulicService {
  // Query classification and context processing
  async classifyQuery(
    query: string, 
    context?: Partial<HydraulicContext>
  ): Promise<any> {
    const result = await window.electronAPI.hydraulic.classifyQuery(query, context)
    if (!result.success) {
      throw new Error(result.error || 'Failed to classify query')
    }
    return result.data
  }
  
  async extractParameters(query: string): Promise<any> {
    const result = await window.electronAPI.hydraulic.extractParameters(query)
    if (!result.success) {
      throw new Error(result.error || 'Failed to extract parameters')
    }
    return result.data
  }
  
  async identifyRegulations(context: HydraulicContext): Promise<string[]> {
    const result = await window.electronAPI.hydraulic.identifyRegulations(context)
    if (!result.success) {
      throw new Error(result.error || 'Failed to identify regulations')
    }
    return result.data
  }
  
  // Calculations
  async calculate(
    formulaId: string,
    inputs: Record<string, { value: number; unit: string }>
  ): Promise<CalculationResult> {
    console.log('HydraulicService.calculate called with:', { formulaId, inputs })
    const result = await window.electronAPI.hydraulic.calculate(formulaId, inputs)
    console.log('HydraulicService.calculate result:', result)
    
    if (!result.success) {
      console.error('Calculation failed:', result.error)
      throw new Error(result.error || 'Calculation failed')
    }
    
    if (!result.data) {
      console.error('No data in result:', result)
      throw new Error('No data returned from calculation')
    }
    
    return result.data
  }
  
  async getFormulas(): Promise<HydraulicFormula[]> {
    const result = await window.electronAPI.hydraulic.getFormulas()
    if (!result.success) {
      throw new Error(result.error || 'Failed to get formulas')
    }
    return result.data
  }
  
  async getFormulasByCategory(category: string): Promise<HydraulicFormula[]> {
    const result = await window.electronAPI.hydraulic.getFormulasByCategory(category)
    if (!result.success) {
      throw new Error(result.error || 'Failed to get formulas by category')
    }
    return result.data
  }
  
  // Knowledge search
  async searchKnowledge(
    query: string,
    options?: {
      category?: 'hydraulics' | 'regulations' | 'best-practices'
      region?: string
      language?: string
      limit?: number
    }
  ): Promise<any[]> {
    const result = await window.electronAPI.hydraulic.searchKnowledge(query, options)
    if (!result.success) {
      throw new Error(result.error || 'Knowledge search failed')
    }
    return result.data
  }
  
  async getRegulations(region: string): Promise<any[]> {
    const result = await window.electronAPI.hydraulic.getRegulations(region)
    if (!result.success) {
      throw new Error(result.error || 'Failed to get regulations')
    }
    return result.data
  }
  
  // Project management
  async createProject(
    projectData: Partial<HydraulicProject>
  ): Promise<HydraulicProject> {
    const result = await window.electronAPI.hydraulic.createProject(projectData)
    if (!result.success) {
      throw new Error(result.error || 'Failed to create project')
    }
    return result.data
  }
  
  async getProject(projectId: string): Promise<HydraulicProject> {
    const result = await window.electronAPI.hydraulic.getProject(projectId)
    if (!result.success) {
      throw new Error(result.error || 'Failed to get project')
    }
    return result.data
  }
  
  async listProjects(): Promise<any[]> {
    const result = await window.electronAPI.hydraulic.listProjects()
    if (!result.success) {
      throw new Error(result.error || 'Failed to list projects')
    }
    return result.data
  }
  
  async updateProject(
    projectId: string,
    updates: Partial<HydraulicProject>
  ): Promise<HydraulicProject> {
    const result = await window.electronAPI.hydraulic.updateProject(projectId, updates)
    if (!result.success) {
      throw new Error(result.error || 'Failed to update project')
    }
    return result.data
  }
  
  async deleteProject(projectId: string): Promise<void> {
    const result = await window.electronAPI.hydraulic.deleteProject(projectId)
    if (!result.success) {
      throw new Error(result.error || 'Failed to delete project')
    }
  }
  
  async saveCalculation(
    projectId: string,
    calculation: any
  ): Promise<any> {
    const result = await window.electronAPI.hydraulic.saveCalculation(projectId, calculation)
    if (!result.success) {
      throw new Error(result.error || 'Failed to save calculation')
    }
    return result.data
  }
  
  // Enhanced chat for hydraulic context
  async enhancedChat(
    message: string,
    context: HydraulicContext
  ): Promise<{
    enhancedPrompt: string
    metadata: any
    searchResults: any[]
  }> {
    const result = await window.electronAPI.hydraulic.enhancedChat(message, context)
    if (!result.success) {
      throw new Error(result.error || 'Enhanced chat failed')
    }
    return result.data
  }
}

// Export singleton instance
export const hydraulicService = new HydraulicService()