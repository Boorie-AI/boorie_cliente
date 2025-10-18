/**
 * WNTR Analysis Service - TypeScript Wrapper
 * Integrates advanced WNTR analysis capabilities with Electron backend
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { createLogger } from '../../utils/logger';

const logger = createLogger('WNTRAnalysisService');

export interface TopologyMetrics {
  basic_metrics: {
    nodes: number;
    edges: number;
    density: number;
    average_degree: number;
    max_degree: number;
    min_degree: number;
  };
  connectivity: {
    is_connected: boolean;
    connected_components: number;
    average_clustering: number;
    average_path_length: number | null;
    diameter: number | null;
  };
  centrality: {
    most_critical_betweenness: string | null;
    most_critical_closeness: string | null;
    most_critical_degree: string | null;
    betweenness_scores: Record<string, number>;
    closeness_scores: Record<string, number>;
    degree_scores: Record<string, number>;
  };
}

export interface CriticalityAnalysis {
  nodes: Record<string, ComponentCriticality>;
  links: Record<string, ComponentCriticality>;
}

export interface ComponentCriticality {
  overall_score: number;
  factors: Record<string, any>;
  classification: 'low' | 'medium' | 'high' | 'unknown';
}

export interface ResilienceMetrics {
  topographic: {
    algebraic_connectivity: number;
    average_degree: number;
    link_density: number;
    meshedness_coefficient: number;
    score: number;
  };
  hydraulic?: {
    pressure_satisfaction: number;
    demand_satisfaction: number;
    flow_reliability: number;
    score: number;
  };
  economic: {
    estimated_replacement_cost: number;
    economic_efficiency: number;
    score: number;
  };
  overall: {
    score: number;
    classification: 'critical' | 'poor' | 'fair' | 'good' | 'excellent';
  };
}

export interface VulnerabilityScenario {
  name: string;
  failed_components: Array<{
    type: 'node' | 'link';
    name: string;
  }>;
}

export interface VulnerabilityAnalysis {
  [scenarioName: string]: {
    failed_components: Array<{
      type: 'node' | 'link';
      name: string;
    }>;
    connectivity_impact: {
      nodes_affected: number;
      connectivity_components_increase: number;
      connectivity_maintained: boolean;
    };
    severity: 'low' | 'medium' | 'high';
  };
}

export class WNTRAnalysisService {
  private pythonPath: string;
  private servicePath: string;

  constructor() {
    // Get Python path from environment or use default
    this.pythonPath = process.env.PYTHON_PATH || 'python3';
    this.servicePath = path.join(__dirname, 'wntr_analysis_service.py');
  }

  /**
   * Analyze network topology and connectivity
   */
  async analyzeNetworkTopology(networkFile: string): Promise<{
    success: boolean;
    topology_metrics?: TopologyMetrics;
    timestamp?: string;
    error?: string;
  }> {
    try {
      logger.info(`Analyzing network topology for ${networkFile}`);
      
      const result = await this.executePythonService(
        'analyze_topology',
        [networkFile]
      );

      if (result.success) {
        logger.info('Network topology analysis completed');
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"; logger.error('Network topology analysis failed:', errorMessage);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Analyze component criticality
   */
  async analyzeComponentCriticality(
    networkFile: string,
    simulationResults?: any
  ): Promise<{
    success: boolean;
    criticality_analysis?: {
      top_critical_nodes: Array<[string, ComponentCriticality]>;
      top_critical_links: Array<[string, ComponentCriticality]>;
      full_analysis: CriticalityAnalysis;
    };
    timestamp?: string;
    error?: string;
  }> {
    try {
      logger.info(`Analyzing component criticality for ${networkFile}`);
      
      const args = [networkFile];
      if (simulationResults) {
        args.push(JSON.stringify(simulationResults));
      }
      
      const result = await this.executePythonService(
        'analyze_criticality',
        args
      );

      if (result.success) {
        logger.info('Component criticality analysis completed');
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"; logger.error('Component criticality analysis failed:', errorMessage);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Calculate network resilience metrics
   */
  async calculateResilienceMetrics(
    networkFile: string,
    simulationResults?: any
  ): Promise<{
    success: boolean;
    resilience_metrics?: ResilienceMetrics;
    timestamp?: string;
    error?: string;
  }> {
    try {
      logger.info(`Calculating resilience metrics for ${networkFile}`);
      
      const args = [networkFile];
      if (simulationResults) {
        args.push(JSON.stringify(simulationResults));
      }
      
      const result = await this.executePythonService(
        'calculate_resilience',
        args
      );

      if (result.success) {
        logger.info('Resilience metrics calculation completed');
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"; logger.error('Resilience metrics calculation failed:', errorMessage);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Analyze network vulnerability to component failures
   */
  async analyzeNetworkVulnerability(
    networkFile: string,
    scenarios: VulnerabilityScenario[]
  ): Promise<{
    success: boolean;
    vulnerability_analysis?: VulnerabilityAnalysis;
    timestamp?: string;
    error?: string;
  }> {
    try {
      logger.info(`Analyzing network vulnerability for ${networkFile}`);
      
      const result = await this.executePythonService(
        'analyze_vulnerability',
        [networkFile, JSON.stringify(scenarios)]
      );

      if (result.success) {
        logger.info('Network vulnerability analysis completed');
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"; logger.error('Network vulnerability analysis failed:', errorMessage);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Perform comprehensive network analysis
   */
  async performComprehensiveAnalysis(
    networkFile: string,
    simulationResults?: any
  ): Promise<{
    success: boolean;
    topology?: TopologyMetrics;
    criticality?: CriticalityAnalysis;
    resilience?: ResilienceMetrics;
    error?: string;
    timestamp?: string;
  }> {
    try {
      logger.info(`Performing comprehensive analysis for ${networkFile}`);
      
      // Run all analyses in parallel for better performance
      const [topologyResult, criticalityResult, resilienceResult] = await Promise.allSettled([
        this.analyzeNetworkTopology(networkFile),
        this.analyzeComponentCriticality(networkFile, simulationResults),
        this.calculateResilienceMetrics(networkFile, simulationResults)
      ]);

      const result: any = {
        success: true,
        timestamp: new Date().toISOString()
      };

      // Process topology results
      if (topologyResult.status === 'fulfilled' && topologyResult.value.success) {
        result.topology = topologyResult.value.topology_metrics;
      } else {
        logger.warn('Topology analysis failed:', 
          topologyResult.status === 'fulfilled' 
            ? topologyResult.value.error 
            : topologyResult.reason
        );
      }

      // Process criticality results
      if (criticalityResult.status === 'fulfilled' && criticalityResult.value.success) {
        result.criticality = criticalityResult.value.criticality_analysis?.full_analysis;
      } else {
        logger.warn('Criticality analysis failed:', 
          criticalityResult.status === 'fulfilled' 
            ? criticalityResult.value.error 
            : criticalityResult.reason
        );
      }

      // Process resilience results
      if (resilienceResult.status === 'fulfilled' && resilienceResult.value.success) {
        result.resilience = resilienceResult.value.resilience_metrics;
      } else {
        logger.warn('Resilience analysis failed:', 
          resilienceResult.status === 'fulfilled' 
            ? resilienceResult.value.error 
            : resilienceResult.reason
        );
      }

      // Check if at least one analysis succeeded
      if (!result.topology && !result.criticality && !result.resilience) {
        result.success = false;
        result.error = 'All analyses failed';
      }

      logger.info('Comprehensive analysis completed');
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"; logger.error('Comprehensive analysis failed:', errorMessage);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate analysis recommendations based on results
   */
  generateRecommendations(
    topology?: TopologyMetrics,
    criticality?: CriticalityAnalysis,
    resilience?: ResilienceMetrics
  ): string[] {
    const recommendations: string[] = [];

    // Topology-based recommendations
    if (topology) {
      const { connectivity, basic_metrics } = topology;
      
      if (!connectivity.is_connected) {
        recommendations.push('CRÍTICO: La red tiene componentes desconectados que requieren conexión inmediata');
      }
      
      if (connectivity.connected_components > 1) {
        recommendations.push(`La red tiene ${connectivity.connected_components} componentes separados - considerar conexiones adicionales`);
      }
      
      if (basic_metrics.density < 0.1) {
        recommendations.push('Considerar aumentar la densidad de conexiones para mejorar la redundancia');
      }
      
      if (connectivity.average_clustering < 0.3) {
        recommendations.push('Bajo coeficiente de clustering - considerar conexiones locales adicionales');
      }
    }

    // Criticality-based recommendations
    if (criticality) {
      // Find high criticality components
      const highCriticalityNodes = Object.entries(criticality.nodes)
        .filter(([_, data]) => data.classification === 'high')
        .length;
      
      const highCriticalityLinks = Object.entries(criticality.links)
        .filter(([_, data]) => data.classification === 'high')
        .length;

      if (highCriticalityNodes > 0) {
        recommendations.push(`${highCriticalityNodes} nodos críticos identificados - implementar redundancia y monitoreo especial`);
      }
      
      if (highCriticalityLinks > 0) {
        recommendations.push(`${highCriticalityLinks} enlaces críticos identificados - considerar rutas alternativas`);
      }
    }

    // Resilience-based recommendations
    if (resilience) {
      const { overall, topographic, economic } = resilience;
      
      if (overall.score < 0.4) {
        recommendations.push('CRÍTICO: La resiliencia de la red requiere mejoras inmediatas');
      } else if (overall.score < 0.6) {
        recommendations.push('La resiliencia de la red necesita mejoras significativas');
      }
      
      if (topographic.score < 0.5) {
        recommendations.push('Mejorar la conectividad topológica añadiendo enlaces redundantes');
      }
      
      if (economic.economic_efficiency < 0.3) {
        recommendations.push('Evaluar la eficiencia económica y considerar inversiones estratégicas');
      }
    }

    // General recommendations if no specific issues found
    if (recommendations.length === 0) {
      recommendations.push('La red presenta un buen balance general - mantener monitoreo regular');
      recommendations.push('Implementar programa de mantenimiento preventivo');
      recommendations.push('Considerar análisis de escenarios de desastre para preparación');
    }

    return recommendations;
  }

  /**
   * Execute Python service with specified command and arguments
   */
  private async executePythonService(command: string, args: string[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      const pythonArgs = [this.servicePath, command, ...args];
      
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

      // Set timeout for long-running analyses
      const timeout = setTimeout(() => {
        pythonProcess.kill();
        reject(new Error('Analysis timeout'));
      }, 180000); // 3 minutes

      pythonProcess.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * Validate network file exists and is readable
   */
  async validateNetworkFile(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath, fs.constants.R_OK);
      const stats = await fs.stat(filePath);
      return stats.isFile() && filePath.toLowerCase().endsWith('.inp');
    } catch {
      return false;
    }
  }

  /**
   * Get available analysis types
   */
  getAvailableAnalysisTypes(): string[] {
    return [
      'topology',
      'criticality', 
      'resilience',
      'vulnerability',
      'comprehensive'
    ];
  }
}