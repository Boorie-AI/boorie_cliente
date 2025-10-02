import { ipcMain } from 'electron'
import { ServiceContainer } from '../../backend/services'
import { HydraulicContextProcessor } from '../../backend/services/hydraulic/contextProcessor'
import { HydraulicCalculationEngine } from '../../backend/services/hydraulic/calculationEngine'
import { HydraulicRAGService } from '../../backend/services/hydraulic/ragService'
import { 
  HydraulicContext, 
  HydraulicProject,
  CalculationResult 
} from '../../src/types/hydraulic'
import { appLogger } from '../../backend/utils/logger'

export class HydraulicHandler {
  private services: ServiceContainer
  private contextProcessor: HydraulicContextProcessor
  private calculationEngine: HydraulicCalculationEngine
  private ragService: HydraulicRAGService
  
  constructor(services: ServiceContainer) {
    this.services = services
    this.contextProcessor = new HydraulicContextProcessor()
    this.calculationEngine = new HydraulicCalculationEngine()
    this.ragService = new HydraulicRAGService(services.database.prisma)
    
    this.registerHandlers()
  }
  
  private registerHandlers() {
    appLogger.info('Registering hydraulic IPC handlers')
    
    // Context processing
    ipcMain.handle('hydraulic:classify-query', async (_, query: string, context?: Partial<HydraulicContext>) => {
      try {
        const classification = await this.contextProcessor.classifyQuery(query, context)
        return { success: true, data: classification }
      } catch (error) {
        appLogger.error('Query classification failed', error as Error)
        return { success: false, error: (error as Error).message }
      }
    })
    
    ipcMain.handle('hydraulic:extract-parameters', async (_, query: string) => {
      try {
        const parameters = await this.contextProcessor.extractParameters(query)
        return { success: true, data: parameters }
      } catch (error) {
        appLogger.error('Parameter extraction failed', error as Error)
        return { success: false, error: (error as Error).message }
      }
    })
    
    ipcMain.handle('hydraulic:identify-regulations', async (_, context: HydraulicContext) => {
      try {
        const regulations = await this.contextProcessor.identifyApplicableRegulations(context)
        return { success: true, data: regulations }
      } catch (error) {
        appLogger.error('Regulation identification failed', error as Error)
        return { success: false, error: (error as Error).message }
      }
    })
    
    // Calculations
    ipcMain.handle('hydraulic:calculate', async (_, formulaId: string, inputs: Record<string, { value: number; unit: string }>) => {
      try {
        const result = this.calculationEngine.calculate(formulaId, inputs)
        
        // Save calculation to database if in a project context
        // This would be enhanced to associate with active project
        
        return { success: true, data: result }
      } catch (error) {
        appLogger.error('Calculation failed', error as Error)
        return { success: false, error: (error as Error).message }
      }
    })
    
    ipcMain.handle('hydraulic:get-formulas', async () => {
      try {
        const formulas = this.calculationEngine.getAvailableFormulas()
        return { success: true, data: formulas }
      } catch (error) {
        appLogger.error('Get formulas failed', error as Error)
        return { success: false, error: (error as Error).message }
      }
    })
    
    ipcMain.handle('hydraulic:get-formulas-by-category', async (_, category: string) => {
      try {
        const formulas = this.calculationEngine.getFormulasByCategory(category)
        return { success: true, data: formulas }
      } catch (error) {
        appLogger.error('Get formulas by category failed', error as Error)
        return { success: false, error: (error as Error).message }
      }
    })
    
    // RAG search
    ipcMain.handle('hydraulic:search-knowledge', async (_, query: string, options?: any) => {
      try {
        const results = await this.ragService.search(query, options)
        return { success: true, data: results }
      } catch (error) {
        appLogger.error('Knowledge search failed', error as Error)
        return { success: false, error: (error as Error).message }
      }
    })
    
    ipcMain.handle('hydraulic:get-regulations', async (_, region: string) => {
      try {
        const regulations = await this.ragService.getRegulations(region)
        return { success: true, data: regulations }
      } catch (error) {
        appLogger.error('Get regulations failed', error as Error)
        return { success: false, error: (error as Error).message }
      }
    })
    
    // Project management
    ipcMain.handle('hydraulic:create-project', async (_, projectData: Partial<HydraulicProject>) => {
      try {
        const project = await this.services.database.prisma.hydraulicProject.create({
          data: {
            name: projectData.name!,
            description: projectData.description,
            type: projectData.type!,
            networkType: projectData.network?.options.units || 'distribution',
            location: JSON.stringify(projectData.location),
            status: 'planning',
            regulations: JSON.stringify(projectData.regulations || []),
            wntrModel: projectData.network ? JSON.stringify(projectData.network) : null,
            metadata: JSON.stringify({
              timeline: projectData.timeline,
              createdBy: 'current-user' // TODO: Get from auth context
            })
          }
        })
        
        return { success: true, data: project }
      } catch (error) {
        appLogger.error('Create project failed', error as Error)
        return { success: false, error: (error as Error).message }
      }
    })
    
    ipcMain.handle('hydraulic:get-project', async (_, projectId: string) => {
      try {
        const project = await this.services.database.prisma.hydraulicProject.findUnique({
          where: { id: projectId },
          include: {
            calculations: true,
            documents: true,
            teamMembers: true
          }
        })
        
        if (!project) {
          throw new Error('Project not found')
        }
        
        // Transform database model to domain model
        const hydraulicProject: HydraulicProject = {
          id: project.id,
          name: project.name,
          description: project.description || undefined,
          type: project.type as any,
          location: JSON.parse(project.location),
          regulations: JSON.parse(project.regulations).map((r: any) => ({
            id: r,
            code: r,
            name: r,
            country: '',
            category: 'design_standards',
            requirements: [],
            effectiveDate: new Date(),
            version: '1.0'
          })),
          network: project.wntrModel ? JSON.parse(project.wntrModel) : undefined,
          documents: project.documents.map((d: any) => ({
            id: d.id,
            projectId: d.projectId,
            type: d.type as any,
            title: d.title,
            content: d.content,
            metadata: JSON.parse(d.metadata),
            createdAt: d.createdAt,
            updatedAt: d.updatedAt
          })),
          calculations: project.calculations.map((c: any) => ({
            id: c.id,
            projectId: c.projectId,
            type: c.type,
            name: c.name,
            inputs: JSON.parse(c.inputs),
            results: JSON.parse(c.results),
            verified: c.verified,
            verifiedBy: c.verifiedBy || undefined,
            notes: c.notes || undefined,
            createdAt: c.createdAt
          })),
          timeline: JSON.parse(project.metadata || '{}').timeline || {
            phases: [],
            milestones: [],
            currentPhase: ''
          },
          team: project.teamMembers.map((tm: any) => ({
            id: tm.id,
            userId: tm.userId,
            role: tm.role as any,
            permissions: JSON.parse(tm.permissions),
            joinedAt: tm.joinedAt
          })),
          status: project.status as any,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt
        }
        
        return { success: true, data: hydraulicProject }
      } catch (error) {
        appLogger.error('Get project failed', error as Error)
        return { success: false, error: (error as Error).message }
      }
    })
    
    ipcMain.handle('hydraulic:list-projects', async () => {
      try {
        const projects = await this.services.database.prisma.hydraulicProject.findMany({
          orderBy: { updatedAt: 'desc' }
        })
        
        const projectList = projects.map(p => ({
          id: p.id,
          name: p.name,
          type: p.type,
          status: p.status,
          location: JSON.parse(p.location),
          updatedAt: p.updatedAt
        }))
        
        return { success: true, data: projectList }
      } catch (error) {
        appLogger.error('List projects failed', error as Error)
        return { success: false, error: (error as Error).message }
      }
    })
    
    ipcMain.handle('hydraulic:update-project', async (_, projectId: string, updates: Partial<HydraulicProject>) => {
      try {
        const updateData: any = {}
        
        if (updates.name) updateData.name = updates.name
        if (updates.description) updateData.description = updates.description
        if (updates.type) updateData.type = updates.type
        if (updates.status) updateData.status = updates.status
        if (updates.location) updateData.location = JSON.stringify(updates.location)
        if (updates.regulations) updateData.regulations = JSON.stringify(updates.regulations)
        if (updates.network) updateData.wntrModel = JSON.stringify(updates.network)
        
        const updated = await this.services.database.prisma.hydraulicProject.update({
          where: { id: projectId },
          data: updateData
        })
        
        return { success: true, data: updated }
      } catch (error) {
        appLogger.error('Update project failed', error as Error)
        return { success: false, error: (error as Error).message }
      }
    })
    
    ipcMain.handle('hydraulic:save-calculation', async (_, projectId: string, calculation: Omit<CalculationResult, 'id'> & { type: string; name: string }) => {
      try {
        const saved = await this.services.database.prisma.hydraulicCalculation.create({
          data: {
            projectId,
            type: calculation.type,
            name: calculation.name,
            inputs: JSON.stringify(calculation.inputs),
            results: JSON.stringify({
              value: calculation.result.value,
              unit: calculation.result.unit,
              steps: calculation.intermediateSteps
            }),
            formulas: JSON.stringify([calculation.formula]),
            notes: calculation.recommendations?.join('\n')
          }
        })
        
        return { success: true, data: saved }
      } catch (error) {
        appLogger.error('Save calculation failed', error as Error)
        return { success: false, error: (error as Error).message }
      }
    })
    
    ipcMain.handle('hydraulic:enhanced-chat', async (_, message: string, context: HydraulicContext) => {
      try {
        // 1. Classify the query
        const classification = await this.contextProcessor.classifyQuery(message, context)
        
        // 2. Search relevant knowledge
        const searchResults = await this.ragService.search(message, {
          category: this.mapQueryTypeToCategory(classification.type),
          region: context.region,
          limit: 3
        })
        
        // 3. Build enhanced prompt with context
        const enhancedPrompt = this.buildEnhancedPrompt(
          message,
          classification,
          searchResults,
          context
        )
        
        // 4. Prepare response metadata
        const metadata = {
          queryType: classification.type,
          confidence: classification.confidence,
          workflow: classification.suggestedWorkflow,
          parameters: classification.parameters,
          relevantDocs: searchResults.map(r => ({
            title: r.document.title,
            category: r.document.category,
            score: r.score
          })),
          regulations: await this.contextProcessor.identifyApplicableRegulations(context)
        }
        
        return {
          success: true,
          data: {
            enhancedPrompt,
            metadata,
            searchResults: searchResults.map(r => ({
              content: r.relevantChunks.join('\n\n'),
              highlights: r.highlights
            }))
          }
        }
      } catch (error) {
        appLogger.error('Enhanced chat failed', error as Error)
        return { success: false, error: (error as Error).message }
      }
    })
    
    appLogger.success('Hydraulic handlers registered successfully')
  }
  
  private mapQueryTypeToCategory(queryType: string): 'hydraulics' | 'regulations' | 'best-practices' | undefined {
    const mapping: Record<string, 'hydraulics' | 'regulations' | 'best-practices'> = {
      'design_new_network': 'hydraulics',
      'analyze_existing': 'hydraulics',
      'calculate_parameter': 'hydraulics',
      'check_compliance': 'regulations',
      'optimize_system': 'best-practices',
      'troubleshoot_problem': 'best-practices'
    }
    
    return mapping[queryType]
  }
  
  private buildEnhancedPrompt(
    originalMessage: string,
    classification: any,
    searchResults: any[],
    context: HydraulicContext
  ): string {
    const sections: string[] = []
    
    // System context
    sections.push(`You are a hydraulic engineering assistant with expertise in water distribution networks.`)
    sections.push(`Current context:\n${this.contextProcessor.formatContextForLLM(context)}`)
    
    // Query classification
    sections.push(`\nQuery type: ${classification.type} (confidence: ${(classification.confidence * 100).toFixed(0)}%)`)
    
    if (classification.parameters && Object.keys(classification.parameters).length > 0) {
      sections.push(`Extracted parameters: ${JSON.stringify(classification.parameters, null, 2)}`)
    }
    
    // Relevant knowledge
    if (searchResults.length > 0) {
      sections.push(`\nRelevant technical knowledge:`)
      searchResults.forEach((result, index) => {
        sections.push(`\n--- Document ${index + 1}: ${result.document.title} ---`)
        sections.push(result.relevantChunks.slice(0, 2).join('\n'))
      })
    }
    
    // Original query
    sections.push(`\nUser query: ${originalMessage}`)
    
    // Instructions based on query type
    sections.push(`\nPlease provide a technical response that:`)
    
    switch (classification.type) {
      case 'design_new_network':
        sections.push(`- Explains the design methodology step by step`)
        sections.push(`- Provides specific calculations with formulas`)
        sections.push(`- Considers local regulations: ${context.regulations.join(', ')}`)
        sections.push(`- Suggests optimal pipe sizes and materials`)
        break
        
      case 'calculate_parameter':
        sections.push(`- Shows the complete calculation process`)
        sections.push(`- Uses appropriate formulas (Darcy-Weisbach, Hazen-Williams, etc.)`)
        sections.push(`- Provides intermediate steps`)
        sections.push(`- Validates results against typical ranges`)
        break
        
      case 'check_compliance':
        sections.push(`- References specific regulatory requirements`)
        sections.push(`- Compares design/operation parameters against standards`)
        sections.push(`- Identifies any non-compliance issues`)
        sections.push(`- Suggests corrective actions if needed`)
        break
        
      case 'troubleshoot_problem':
        sections.push(`- Analyzes potential causes systematically`)
        sections.push(`- Provides diagnostic steps`)
        sections.push(`- Suggests immediate and long-term solutions`)
        sections.push(`- Considers safety and operational continuity`)
        break
    }
    
    sections.push(`\nAlways include units in calculations and reference applicable standards.`)
    
    return sections.join('\n')
  }
  
  cleanup() {
    // Cleanup if needed
    appLogger.info('Hydraulic handler cleanup completed')
  }
}