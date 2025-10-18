/**
 * WNTR Report Service - TypeScript Wrapper
 * Integrates report generation capabilities with project management system
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { createLogger } from '../../utils/logger';

const logger = createLogger('WNTRReportService');
import { SimulationResults } from './simulationService';
import { TopologyMetrics, CriticalityAnalysis, ResilienceMetrics } from './analysisService';

export interface ProjectData {
  id: string;
  name: string;
  description?: string;
  network_file: string;
  created_at: string;
  updated_at: string;
}

export interface ReportGenerationResult {
  success: boolean;
  report_content?: string;
  report_path?: string;
  timestamp?: string;
  error?: string;
}

export interface ComprehensiveReportData {
  project: ProjectData;
  simulation?: SimulationResults;
  topology_analysis?: TopologyMetrics;
  criticality_analysis?: CriticalityAnalysis;
  resilience_metrics?: ResilienceMetrics;
  scenarios?: any[];
}

export class WNTRReportService {
  private pythonPath: string;
  private servicePath: string;
  private reportsDirectory: string;

  constructor(reportsDirectory?: string) {
    // Get Python path from environment or use default
    this.pythonPath = process.env.PYTHON_PATH || 'python3';
    this.servicePath = path.join(__dirname, 'wntr_report_generator.py');
    this.reportsDirectory = reportsDirectory || path.join(process.cwd(), 'reports');
  }

  /**
   * Generate simulation report
   */
  async generateSimulationReport(
    projectData: ProjectData,
    simulationResults: SimulationResults,
    customFileName?: string
  ): Promise<ReportGenerationResult> {
    try {
      logger.info(`Generating simulation report for project ${projectData.name}`);
      
      // Ensure reports directory exists
      await this.ensureReportsDirectory();
      
      // Generate output file path
      const fileName = customFileName || 
        `simulation_report_${projectData.id}_${Date.now()}.md`;
      const outputPath = path.join(this.reportsDirectory, fileName);
      
      const reportData = {
        project: projectData,
        simulation_results: simulationResults
      };
      
      const result = await this.executePythonService(
        'simulation',
        [JSON.stringify(reportData), outputPath]
      );

      if (result.success) {
        logger.info(`Simulation report generated: ${outputPath}`);
        
        // Store report metadata in database if needed
        await this.storeReportMetadata({
          projectId: projectData.id,
          type: 'simulation',
          filePath: outputPath,
          title: `Simulation Report - ${projectData.name}`,
          generatedAt: new Date()
        });
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"; logger.error('Failed to generate simulation report:', errorMessage);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate network analysis report
   */
  async generateAnalysisReport(
    projectData: ProjectData,
    topologyAnalysis: TopologyMetrics,
    criticalityAnalysis: CriticalityAnalysis,
    customFileName?: string
  ): Promise<ReportGenerationResult> {
    try {
      logger.info(`Generating analysis report for project ${projectData.name}`);
      
      await this.ensureReportsDirectory();
      
      const fileName = customFileName || 
        `analysis_report_${projectData.id}_${Date.now()}.md`;
      const outputPath = path.join(this.reportsDirectory, fileName);
      
      const reportData = {
        project: projectData,
        topology_analysis: { topology_metrics: topologyAnalysis },
        criticality_analysis: { criticality_analysis: criticalityAnalysis }
      };
      
      const result = await this.executePythonService(
        'analysis',
        [JSON.stringify(reportData), outputPath]
      );

      if (result.success) {
        logger.info(`Analysis report generated: ${outputPath}`);
        
        await this.storeReportMetadata({
          projectId: projectData.id,
          type: 'analysis',
          filePath: outputPath,
          title: `Network Analysis Report - ${projectData.name}`,
          generatedAt: new Date()
        });
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"; logger.error('Failed to generate analysis report:', errorMessage);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate scenario analysis report
   */
  async generateScenarioReport(
    projectData: ProjectData,
    scenarioResults: any,
    baselineResults?: SimulationResults,
    customFileName?: string
  ): Promise<ReportGenerationResult> {
    try {
      logger.info(`Generating scenario report for project ${projectData.name}`);
      
      await this.ensureReportsDirectory();
      
      const fileName = customFileName || 
        `scenario_report_${projectData.id}_${Date.now()}.md`;
      const outputPath = path.join(this.reportsDirectory, fileName);
      
      const reportData = {
        project: projectData,
        scenario_results: scenarioResults,
        baseline_results: baselineResults
      };
      
      const result = await this.executePythonService(
        'scenario',
        [JSON.stringify(reportData), outputPath]
      );

      if (result.success) {
        logger.info(`Scenario report generated: ${outputPath}`);
        
        await this.storeReportMetadata({
          projectId: projectData.id,
          type: 'scenario',
          filePath: outputPath,
          title: `Scenario Analysis Report - ${projectData.name}`,
          generatedAt: new Date()
        });
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"; logger.error('Failed to generate scenario report:', errorMessage);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate resilience analysis report
   */
  async generateResilienceReport(
    projectData: ProjectData,
    resilienceMetrics: ResilienceMetrics,
    customFileName?: string
  ): Promise<ReportGenerationResult> {
    try {
      logger.info(`Generating resilience report for project ${projectData.name}`);
      
      await this.ensureReportsDirectory();
      
      const fileName = customFileName || 
        `resilience_report_${projectData.id}_${Date.now()}.md`;
      const outputPath = path.join(this.reportsDirectory, fileName);
      
      const reportData = {
        project: projectData,
        resilience_metrics: { resilience_metrics: resilienceMetrics }
      };
      
      const result = await this.executePythonService(
        'resilience',
        [JSON.stringify(reportData), outputPath]
      );

      if (result.success) {
        logger.info(`Resilience report generated: ${outputPath}`);
        
        await this.storeReportMetadata({
          projectId: projectData.id,
          type: 'resilience',
          filePath: outputPath,
          title: `Resilience Analysis Report - ${projectData.name}`,
          generatedAt: new Date()
        });
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"; logger.error('Failed to generate resilience report:', errorMessage);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate comprehensive report with all analyses
   */
  async generateComprehensiveReport(
    reportData: ComprehensiveReportData,
    customFileName?: string
  ): Promise<ReportGenerationResult> {
    try {
      logger.info(`Generating comprehensive report for project ${reportData.project.name}`);
      
      await this.ensureReportsDirectory();
      
      const fileName = customFileName || 
        `comprehensive_report_${reportData.project.id}_${Date.now()}.md`;
      const outputPath = path.join(this.reportsDirectory, fileName);
      
      const pythonData = {
        project: reportData.project,
        all_results: {
          simulation: reportData.simulation,
          analysis: reportData.topology_analysis,
          resilience: reportData.resilience_metrics,
          scenarios: reportData.scenarios || []
        }
      };
      
      const result = await this.executePythonService(
        'comprehensive',
        [JSON.stringify(pythonData), outputPath]
      );

      if (result.success) {
        logger.info(`Comprehensive report generated: ${outputPath}`);
        
        await this.storeReportMetadata({
          projectId: reportData.project.id,
          type: 'comprehensive',
          filePath: outputPath,
          title: `Comprehensive Analysis Report - ${reportData.project.name}`,
          generatedAt: new Date()
        });
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"; logger.error('Failed to generate comprehensive report:', errorMessage);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get report content by file path
   */
  async getReportContent(filePath: string): Promise<{
    success: boolean;
    content?: string;
    error?: string;
  }> {
    try {
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.reportsDirectory, filePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      
      return {
        success: true,
        content
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"; logger.error('Failed to read report content:', errorMessage);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * List all reports for a project
   */
  async listProjectReports(projectId: string): Promise<{
    success: boolean;
    reports?: Array<{
      id: string;
      type: string;
      title: string;
      filePath: string;
      generatedAt: Date;
    }>;
    error?: string;
  }> {
    try {
      // This would typically query a database
      // For now, we'll scan the reports directory
      const reports = await this.scanReportsDirectory(projectId);
      
      return {
        success: true,
        reports
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"; logger.error('Failed to list project reports:', errorMessage);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Delete a report file
   */
  async deleteReport(filePath: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.reportsDirectory, filePath);
      await fs.unlink(fullPath);
      
      // Also remove from database metadata if exists
      await this.removeReportMetadata(fullPath);
      
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"; logger.error('Failed to delete report:', errorMessage);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Export report for download
   */
  async exportReport(filePath: string): Promise<{
    success: boolean;
    fileName?: string;
    content?: Buffer;
    mimeType?: string;
    error?: string;
  }> {
    try {
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.reportsDirectory, filePath);
      const content = await fs.readFile(fullPath);
      const fileName = path.basename(fullPath);
      
      return {
        success: true,
        fileName,
        content,
        mimeType: 'text/markdown'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"; logger.error('Failed to export report:', errorMessage);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Execute Python service with specified command and arguments
   */
  private async executePythonService(reportType: string, args: string[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      const pythonArgs = [this.servicePath, reportType, ...args];
      
      logger.debug(`Executing: ${this.pythonPath} ${pythonArgs.join(' ')}`);
      
      const pythonProcess = spawn(this.pythonPath, pythonArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (parseError) {
            logger.error('Failed to parse Python service response:', parseError);
            logger.error('Raw stdout:', stdout);
            reject(new Error(`Invalid JSON response: ${parseError}`));
          }
        } else {
          logger.error(`Python service exited with code ${code}`);
          logger.error('stderr:', stderr);
          logger.error('stdout:', stdout);
          reject(new Error(`Python service failed with code ${code}: ${stderr}`));
        }
      });

      pythonProcess.on('error', (error) => {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"; logger.error('Failed to start Python service:', errorMessage);
        reject(error);
      });

      // Set timeout for report generation
      const timeout = setTimeout(() => {
        pythonProcess.kill();
        reject(new Error('Report generation timeout'));
      }, 60000); // 1 minute

      pythonProcess.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * Ensure reports directory exists
   */
  private async ensureReportsDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.reportsDirectory, { recursive: true });
    } catch (error) {
      if ((error as any).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Store report metadata (would typically use database)
   */
  private async storeReportMetadata(metadata: {
    projectId: string;
    type: string;
    filePath: string;
    title: string;
    generatedAt: Date;
  }): Promise<void> {
    // TODO: Implement database storage for report metadata
    // This could integrate with the existing Prisma database
    logger.debug('Report metadata stored:', metadata);
  }

  /**
   * Remove report metadata (would typically use database)
   */
  private async removeReportMetadata(filePath: string): Promise<void> {
    // TODO: Implement database removal for report metadata
    logger.debug('Report metadata removed for:', filePath);
  }

  /**
   * Scan reports directory for project files
   */
  private async scanReportsDirectory(projectId: string): Promise<Array<{
    id: string;
    type: string;
    title: string;
    filePath: string;
    generatedAt: Date;
  }>> {
    try {
      const files = await fs.readdir(this.reportsDirectory);
      const projectFiles = files.filter(file => 
        file.includes(projectId) && file.endsWith('.md')
      );
      
      const reports = await Promise.all(
        projectFiles.map(async (file) => {
          const filePath = path.join(this.reportsDirectory, file);
          const stats = await fs.stat(filePath);
          
          // Extract type from filename
          let type = 'unknown';
          if (file.includes('simulation')) type = 'simulation';
          else if (file.includes('analysis')) type = 'analysis';
          else if (file.includes('scenario')) type = 'scenario';
          else if (file.includes('resilience')) type = 'resilience';
          else if (file.includes('comprehensive')) type = 'comprehensive';
          
          return {
            id: file.replace('.md', ''),
            type,
            title: file.replace('.md', '').replace(/_/g, ' '),
            filePath,
            generatedAt: stats.mtime
          };
        })
      );
      
      return reports.sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"; logger.error('Failed to scan reports directory:', errorMessage);
      return [];
    }
  }

  /**
   * Get available report types
   */
  getAvailableReportTypes(): string[] {
    return [
      'simulation',
      'analysis',
      'scenario',
      'resilience',
      'comprehensive'
    ];
  }

  /**
   * Get reports directory path
   */
  getReportsDirectory(): string {
    return this.reportsDirectory;
  }
}