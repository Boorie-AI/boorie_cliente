/**
 * WNTR Simulation Service - TypeScript Wrapper
 * Integrates advanced WNTR simulation capabilities with Electron backend
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { createLogger } from '../../utils/logger';

const logger = createLogger('WNTRSimulationService');

export interface SimulationConfig {
  simulation_type: 'demand_driven' | 'pressure_driven';
  duration: number; // seconds
  timestep: number; // seconds
  simulator: 'wntr' | 'epanet';
  pdd_parameters?: {
    required_pressure: number;
    minimum_pressure: number;
    pressure_exponent: number;
  };
}

export interface WaterQualityConfig {
  type: 'age' | 'trace' | 'chemical';
  source_node?: string;
  injection?: {
    node: string;
    start_time: number;
    end_time: number;
    concentration: number;
  };
}

export interface ScenarioConfig {
  type: 'pipe_breaks' | 'pump_failures' | 'power_outage' | 'tank_damage';
  severity: number; // 0-1
  affected_components?: string[];
}

export interface SimulationResults {
  success: boolean;
  simulation_type?: string;
  simulator?: string;
  duration?: number;
  timesteps?: number;
  stats?: {
    pressure: {
      average: number;
      minimum: number;
      maximum: number;
      unit: string;
    };
    flow: {
      average: number;
      maximum: number;
      total_demand: number;
      unit: string;
    };
    velocity: {
      average: number;
      maximum: number;
      unit: string;
    };
  };
  timestamp?: string;
  error?: string;
}

export class WNTRSimulationService {
  private pythonPath: string;
  private servicePath: string;

  constructor() {
    // Get Python path from environment or use default
    this.pythonPath = process.env.PYTHON_PATH || 'python3';
    this.servicePath = path.join(__dirname, 'wntr_simulation_service.py');
  }

  /**
   * Run hydraulic simulation
   */
  async runHydraulicSimulation(
    networkFile: string,
    config: SimulationConfig = {
      simulation_type: 'demand_driven',
      duration: 24 * 3600, // 24 hours
      timestep: 3600, // 1 hour
      simulator: 'wntr'
    }
  ): Promise<SimulationResults> {
    try {
      logger.info(`Running hydraulic simulation for ${networkFile}`);
      
      const result = await this.executePythonService(
        'run_hydraulic',
        [networkFile, JSON.stringify(config)]
      );

      logger.info('Hydraulic simulation completed');
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Hydraulic simulation failed:', errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Run water quality simulation
   */
  async runWaterQualitySimulation(
    networkFile: string,
    config: WaterQualityConfig = { type: 'age' }
  ): Promise<SimulationResults> {
    try {
      logger.info(`Running water quality simulation for ${networkFile}`);
      
      const result = await this.executePythonService(
        'run_water_quality',
        [networkFile, JSON.stringify(config)]
      );

      logger.info('Water quality simulation completed');
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"; logger.error('Water quality simulation failed:', errorMessage);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Run disaster scenario simulation
   */
  async runScenarioSimulation(
    networkFile: string,
    config: ScenarioConfig
  ): Promise<SimulationResults & {
    scenario_type?: string;
    severity?: number;
    affected_components?: string[];
    impact_analysis?: {
      pressure_reduction_percent: number;
      flow_reduction_percent: number;
      demand_reduction_percent: number;
      impact_severity: 'low' | 'medium' | 'high';
    };
  }> {
    try {
      logger.info(`Running scenario simulation: ${config.type} for ${networkFile}`);
      
      const result = await this.executePythonService(
        'run_scenario',
        [networkFile, JSON.stringify(config)]
      );

      logger.info('Scenario simulation completed');
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"; logger.error('Scenario simulation failed:', errorMessage);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Load network and get basic information
   */
  async loadNetwork(networkFile: string): Promise<{
    success: boolean;
    message?: string;
    stats?: {
      nodes: number;
      links: number;
      junctions: number;
      reservoirs: number;
      tanks: number;
      pipes: number;
      pumps: number;
      valves: number;
    };
    error?: string;
  }> {
    try {
      logger.info(`Loading network file: ${networkFile}`);
      
      const result = await this.executePythonService(
        'load_network',
        [networkFile]
      );

      logger.info('Network loaded successfully');
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"; logger.error('Failed to load network:', errorMessage);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
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

      // Set timeout for long-running simulations
      const timeout = setTimeout(() => {
        pythonProcess.kill();
        reject(new Error('Simulation timeout'));
      }, 300000); // 5 minutes

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
   * Get available simulation types
   */
  getAvailableSimulationTypes(): string[] {
    return ['demand_driven', 'pressure_driven'];
  }

  /**
   * Get available simulators
   */
  getAvailableSimulators(): string[] {
    return ['wntr', 'epanet'];
  }

  /**
   * Get available water quality analysis types
   */
  getAvailableWaterQualityTypes(): string[] {
    return ['age', 'trace', 'chemical'];
  }

  /**
   * Get available disaster scenario types
   */
  getAvailableScenarioTypes(): string[] {
    return ['pipe_breaks', 'pump_failures', 'power_outage', 'tank_damage'];
  }
}