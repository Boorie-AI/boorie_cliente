/**
 * WNTR Resilience Service - TypeScript Wrapper
 * Skeletonization, service-interruption simulation, resilience indicators
 * and seismic fragility curves (epic #26: "Rutinas de resiliencia WNTR").
 */

import { spawn } from 'child_process';
import { createLogger } from '../../utils/logger';

const logger = createLogger('WNTRResilienceService');

export interface SkeletonizeResult {
  success: boolean;
  data?: {
    before: { junctions: number; tanks: number; reservoirs: number; pipes: number; pumps: number; valves: number };
    after: { junctions: number; tanks: number; reservoirs: number; pipes: number; pumps: number; valves: number };
    reduction: { pipes_pct: number; junctions_pct: number };
    pipe_diameter_threshold_mm: number;
    inp_content: string;
  };
  error?: string;
}

export interface ComponentFailureInput {
  id: string;
  type?: 'pipe' | 'pump' | 'valve';
}

export interface SimulateFailureResult {
  success: boolean;
  data?: {
    status: string;
    execution_time: number;
    failed_components: string[];
    failure_start_hours: number;
    restore_hours: number | null;
    duration_hours: number;
    min_pressure_threshold: number;
    affected_nodes: Array<{
      id: string;
      min_pressure: number;
      baseline_min_pressure: number;
      pressure_drop: number;
      outage_hours: number;
    }>;
    affected_node_count: number;
    total_junction_count: number;
    node_results: Record<string, { pressure: number[] }>;
    link_results: Record<string, { flowrate: number[] }>;
    timestamps: number[];
  };
  error?: string;
}

export interface ResilienceSnapshot {
  todini_index: number;
  network_entropy: number;
  hydraulic_redundancy: number;
  serviceability: {
    pressure_serviceability: number;
    junctions_meeting_pressure: number;
    total_junctions: number;
  };
}

export interface ResilienceIndicatorsResult {
  success: boolean;
  data?: {
    before: ResilienceSnapshot;
    after?: ResilienceSnapshot;
    delta?: {
      todini_index: number;
      network_entropy: number;
      hydraulic_redundancy: number;
      pressure_serviceability: number;
    };
  };
  error?: string;
}

export interface FragilityCurveResult {
  success: boolean;
  data?: {
    hazard_type: string;
    material: string;
    median_pgv: number;
    beta: number;
    intensities: number[];
    pipe_failure_probability: number[];
    expected_failed_pipes: number[];
    pipe_count: number;
    total_length_km: number;
    methodology: string;
  };
  error?: string;
}

export class WNTRResilienceService {
  private pythonPath: string;
  private servicePath: string;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { findPythonPath } = require('./pythonDetector');
    this.pythonPath = findPythonPath();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { resolvePythonScriptPath } = require('./pythonScriptPath');
    this.servicePath = resolvePythonScriptPath('wntr_resilience_service.py');
  }

  async skeletonizeNetwork(networkFile: string, options?: {
    pipe_diameter_threshold_mm?: number;
    branch_trim?: boolean;
    series_pipe_merge?: boolean;
    parallel_pipe_merge?: boolean;
  }): Promise<SkeletonizeResult> {
    return this.executePythonService('skeletonize', networkFile, options);
  }

  async simulateComponentFailure(networkFile: string, options: {
    components: ComponentFailureInput[];
    duration_hours?: number;
    failure_start_hours?: number;
    restore_hours?: number;
    min_pressure_threshold?: number;
  }): Promise<SimulateFailureResult> {
    return this.executePythonService('simulate_failure', networkFile, options);
  }

  async calculateResilienceIndicators(networkFile: string, options?: {
    duration_hours?: number;
    min_pressure_threshold?: number;
    failed_components?: ComponentFailureInput[];
    failure_start_hours?: number;
  }): Promise<ResilienceIndicatorsResult> {
    return this.executePythonService('resilience_indicators', networkFile, options);
  }

  async generateFragilityCurve(networkFile: string, options?: {
    hazard_type?: string;
    material?: 'CI' | 'AC' | 'STEEL' | 'DI' | 'PVC' | 'HDPE' | 'CONCRETE' | 'DEFAULT';
    max_intensity?: number;
    steps?: number;
    beta?: number;
  }): Promise<FragilityCurveResult> {
    return this.executePythonService('fragility_curve', networkFile, options);
  }

  private async executePythonService(command: string, networkFile: string, options?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const args = [this.servicePath, command, networkFile];
      if (options) {
        args.push(JSON.stringify(options));
      }

      logger.debug(`Executing: ${this.pythonPath} ${args.join(' ')}`);

      const pythonProcess = spawn(this.pythonPath, args, {
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

      const timeout = setTimeout(() => {
        pythonProcess.kill();
        reject(new Error('Resilience analysis timeout'));
      }, 180000); // 3 minutes - extended-period simulations can be slow

      pythonProcess.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          try {
            resolve(JSON.parse(stdout));
          } catch (parseError) {
            logger.error('Failed to parse Python service response:', parseError);
            logger.error('Raw stdout:', stdout);
            reject(new Error(`Invalid JSON response: ${parseError}`));
          }
        } else {
          logger.error(`Python service exited with code ${code}`);
          logger.error('stderr:', stderr);
          reject(new Error(`Python service failed with code ${code}: ${stderr}`));
        }
      });

      pythonProcess.on('error', (error) => {
        logger.error('Failed to start Python service:', error instanceof Error ? error.message : 'Unknown error');
        reject(error);
      });
    });
  }
}
