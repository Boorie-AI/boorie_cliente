#!/usr/bin/env python3
"""
WNTR Simulation Service
Advanced simulation capabilities for water distribution networks using WNTR
"""

import wntr
import numpy as np
import pandas as pd
import json
import sys
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class WNTRSimulationService:
    """
    Advanced simulation service using WNTR capabilities
    """
    
    def __init__(self):
        self.network = None
        self.results = None
        
    def load_network(self, file_path: str) -> Dict[str, Any]:
        """Load EPANET network file"""
        try:
            self.network = wntr.network.WaterNetworkModel(file_path)
            logger.info(f"Network loaded: {len(self.network.nodes)} nodes, {len(self.network.links)} links")
            
            return {
                'success': True,
                'message': 'Network loaded successfully',
                'stats': {
                    'nodes': len(self.network.nodes),
                    'links': len(self.network.links),
                    'junctions': len(self.network.junction_name_list),
                    'reservoirs': len(self.network.reservoir_name_list),
                    'tanks': len(self.network.tank_name_list),
                    'pipes': len(self.network.pipe_name_list),
                    'pumps': len(self.network.pump_name_list),
                    'valves': len(self.network.valve_name_list)
                }
            }
        except Exception as e:
            logger.error(f"Error loading network: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def run_hydraulic_simulation(self, simulation_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run hydraulic simulation with specified configuration
        
        Args:
            simulation_config: Configuration including simulation_type, duration, timestep, etc.
        """
        try:
            if not self.network:
                return {'success': False, 'error': 'No network loaded'}
            
            # Configure simulation
            sim_type = simulation_config.get('simulation_type', 'demand_driven')
            duration = simulation_config.get('duration', 24 * 3600)  # 24 hours default
            timestep = simulation_config.get('timestep', 3600)  # 1 hour default
            
            # Set simulation options
            self.network.options.time.duration = duration
            self.network.options.time.hydraulic_timestep = timestep
            
            # Configure demand model
            if sim_type == 'pressure_driven':
                self.network.options.hydraulic.demand_model = 'PDD'
                
                # PDD parameters
                pdd_config = simulation_config.get('pdd_parameters', {})
                required_pressure = pdd_config.get('required_pressure', 20.0)  # meters
                minimum_pressure = pdd_config.get('minimum_pressure', 0.0)
                pressure_exponent = pdd_config.get('pressure_exponent', 0.5)
                
                # Apply PDD to all junctions
                for junction_name in self.network.junction_name_list:
                    junction = self.network.get_node(junction_name)
                    junction.minimum_pressure = minimum_pressure
                    junction.required_pressure = required_pressure
                    junction.pressure_exponent = pressure_exponent
            else:
                self.network.options.hydraulic.demand_model = 'DD'
            
            # Select simulator
            simulator_type = simulation_config.get('simulator', 'wntr')
            if simulator_type == 'epanet':
                sim = wntr.sim.EpanetSimulator(self.network)
            else:
                sim = wntr.sim.WNTRSimulator(self.network)
            
            logger.info(f"Running {sim_type} simulation with {simulator_type} simulator")
            
            # Run simulation
            self.results = sim.run_sim()
            
            # Calculate summary statistics
            stats = self._calculate_simulation_stats()
            
            return {
                'success': True,
                'message': 'Simulation completed successfully',
                'simulation_type': sim_type,
                'simulator': simulator_type,
                'duration': duration,
                'timesteps': len(self.results.time),
                'stats': stats,
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Simulation error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def run_water_quality_simulation(self, wq_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run water quality simulation
        
        Args:
            wq_config: Water quality simulation configuration
        """
        try:
            if not self.network:
                return {'success': False, 'error': 'No network loaded'}
            
            # Configure water quality simulation
            wq_type = wq_config.get('type', 'age')  # 'age', 'trace', 'chemical'
            
            if wq_type == 'age':
                # Water age simulation
                self.network.options.quality.parameter = 'AGE'
                
            elif wq_type == 'trace':
                # Source tracing
                source_node = wq_config.get('source_node')
                if source_node and source_node in self.network.node_name_list:
                    self.network.options.quality.parameter = 'TRACE'
                    self.network.options.quality.trace_node = source_node
                else:
                    return {'success': False, 'error': 'Invalid or missing source node for trace'}
                    
            elif wq_type == 'chemical':
                # Chemical transport
                self.network.options.quality.parameter = 'CHEMICAL'
                
                # Add source injection if specified
                injection_config = wq_config.get('injection', {})
                if injection_config:
                    node_name = injection_config.get('node')
                    start_time = injection_config.get('start_time', 0)
                    end_time = injection_config.get('end_time', 3600)
                    concentration = injection_config.get('concentration', 1.0)
                    
                    if node_name in self.network.node_name_list:
                        # Add source injection pattern
                        pattern_name = f"injection_{node_name}"
                        injection_pattern = wntr.network.elements.Pattern(
                            pattern_name, 
                            multipliers=[concentration if start_time <= t <= end_time else 0 
                                       for t in range(0, int(self.network.options.time.duration), 
                                                    int(self.network.options.time.pattern_timestep))]
                        )
                        self.network.add_pattern(pattern_name, injection_pattern)
                        
                        # Add source
                        source = wntr.network.elements.Source(
                            f"source_{node_name}", 
                            node_name, 
                            'CONCEN', 
                            concentration, 
                            pattern_name
                        )
                        self.network.add_source(f"source_{node_name}", source)
            
            # Run EPANET simulation (required for water quality)
            sim = wntr.sim.EpanetSimulator(self.network)
            self.results = sim.run_sim()
            
            # Calculate water quality statistics
            wq_stats = self._calculate_water_quality_stats(wq_type)
            
            return {
                'success': True,
                'message': 'Water quality simulation completed',
                'wq_type': wq_type,
                'stats': wq_stats,
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Water quality simulation error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def run_scenario_simulation(self, scenario_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run disaster scenario simulation
        
        Args:
            scenario_config: Disaster scenario configuration
        """
        try:
            if not self.network:
                return {'success': False, 'error': 'No network loaded'}
            
            scenario_type = scenario_config.get('type', 'pipe_breaks')
            severity = scenario_config.get('severity', 0.1)  # 10% default
            
            # Create network copy for scenario
            scenario_network = self.network.copy()
            
            if scenario_type == 'pipe_breaks':
                # Simulate pipe breaks
                pipe_names = list(scenario_network.pipe_name_list)
                num_breaks = max(1, int(len(pipe_names) * severity))
                broken_pipes = np.random.choice(pipe_names, num_breaks, replace=False)
                
                for pipe_name in broken_pipes:
                    # Close pipe by setting status to closed
                    pipe = scenario_network.get_link(pipe_name)
                    pipe.initial_status = 'Closed'
                
                affected_components = list(broken_pipes)
                
            elif scenario_type == 'pump_failures':
                # Simulate pump failures
                pump_names = list(scenario_network.pump_name_list)
                if pump_names:
                    num_failures = max(1, int(len(pump_names) * severity))
                    failed_pumps = np.random.choice(pump_names, 
                                                  min(num_failures, len(pump_names)), 
                                                  replace=False)
                    
                    for pump_name in failed_pumps:
                        pump = scenario_network.get_link(pump_name)
                        pump.initial_status = 'Closed'
                    
                    affected_components = list(failed_pumps)
                else:
                    affected_components = []
                    
            elif scenario_type == 'power_outage':
                # Simulate power outage affecting all pumps
                affected_components = []
                for pump_name in scenario_network.pump_name_list:
                    pump = scenario_network.get_link(pump_name)
                    pump.initial_status = 'Closed'
                    affected_components.append(pump_name)
                    
            elif scenario_type == 'tank_damage':
                # Simulate tank damage
                tank_names = list(scenario_network.tank_name_list)
                if tank_names:
                    num_damaged = max(1, int(len(tank_names) * severity))
                    damaged_tanks = np.random.choice(tank_names, 
                                                   min(num_damaged, len(tank_names)), 
                                                   replace=False)
                    
                    for tank_name in damaged_tanks:
                        # Simulate tank damage by setting minimum level to maximum
                        tank = scenario_network.get_node(tank_name)
                        tank.min_level = tank.max_level
                    
                    affected_components = list(damaged_tanks)
                else:
                    affected_components = []
            
            # Run simulation with damaged network
            sim = wntr.sim.WNTRSimulator(scenario_network)
            scenario_results = sim.run_sim()
            
            # Compare with baseline if available
            impact_analysis = None
            if self.results is not None:
                impact_analysis = self._calculate_scenario_impact(self.results, scenario_results)
            
            return {
                'success': True,
                'message': 'Scenario simulation completed',
                'scenario_type': scenario_type,
                'severity': severity,
                'affected_components': affected_components,
                'impact_analysis': impact_analysis,
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Scenario simulation error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _calculate_simulation_stats(self) -> Dict[str, Any]:
        """Calculate simulation statistics"""
        if not self.results:
            return {}
        
        try:
            # Pressure statistics
            pressure_data = self.results.node['pressure']
            avg_pressure = float(pressure_data.mean().mean())
            min_pressure = float(pressure_data.min().min())
            max_pressure = float(pressure_data.max().max())
            
            # Flow statistics
            flowrate_data = self.results.link['flowrate']
            avg_flow = float(flowrate_data.abs().mean().mean())
            max_flow = float(flowrate_data.abs().max().max())
            
            # Velocity statistics
            velocity_data = self.results.link['velocity']
            avg_velocity = float(velocity_data.abs().mean().mean())
            max_velocity = float(velocity_data.abs().max().max())
            
            # Demand satisfaction (for PDD)
            demand_data = self.results.node['demand']
            total_demand = float(demand_data.sum().sum())
            
            return {
                'pressure': {
                    'average': avg_pressure,
                    'minimum': min_pressure,
                    'maximum': max_pressure,
                    'unit': 'm'
                },
                'flow': {
                    'average': avg_flow,
                    'maximum': max_flow,
                    'total_demand': total_demand,
                    'unit': 'm³/s'
                },
                'velocity': {
                    'average': avg_velocity,
                    'maximum': max_velocity,
                    'unit': 'm/s'
                }
            }
            
        except Exception as e:
            logger.error(f"Error calculating stats: {str(e)}")
            return {}
    
    def _calculate_water_quality_stats(self, wq_type: str) -> Dict[str, Any]:
        """Calculate water quality statistics"""
        if not self.results or 'quality' not in self.results.node:
            return {}
        
        try:
            quality_data = self.results.node['quality']
            
            stats = {
                'average': float(quality_data.mean().mean()),
                'minimum': float(quality_data.min().min()),
                'maximum': float(quality_data.max().max()),
                'type': wq_type
            }
            
            if wq_type == 'age':
                stats['unit'] = 'hours'
                stats['average_age_hours'] = stats['average'] / 3600
            elif wq_type in ['trace', 'chemical']:
                stats['unit'] = 'mg/L'
            
            return stats
            
        except Exception as e:
            logger.error(f"Error calculating water quality stats: {str(e)}")
            return {}
    
    def _calculate_scenario_impact(self, baseline_results, scenario_results) -> Dict[str, Any]:
        """Calculate impact of scenario compared to baseline"""
        try:
            # Pressure impact
            baseline_pressure = baseline_results.node['pressure'].mean().mean()
            scenario_pressure = scenario_results.node['pressure'].mean().mean()
            pressure_reduction = float((baseline_pressure - scenario_pressure) / baseline_pressure * 100)
            
            # Flow impact
            baseline_flow = baseline_results.link['flowrate'].abs().mean().mean()
            scenario_flow = scenario_results.link['flowrate'].abs().mean().mean()
            flow_reduction = float((baseline_flow - scenario_flow) / baseline_flow * 100)
            
            # Demand satisfaction impact
            baseline_demand = baseline_results.node['demand'].sum().sum()
            scenario_demand = scenario_results.node['demand'].sum().sum()
            demand_reduction = float((baseline_demand - scenario_demand) / baseline_demand * 100)
            
            return {
                'pressure_reduction_percent': pressure_reduction,
                'flow_reduction_percent': flow_reduction,
                'demand_reduction_percent': demand_reduction,
                'impact_severity': 'high' if pressure_reduction > 20 else 'medium' if pressure_reduction > 10 else 'low'
            }
            
        except Exception as e:
            logger.error(f"Error calculating scenario impact: {str(e)}")
            return {}
    
    def get_results_summary(self) -> Dict[str, Any]:
        """Get summary of last simulation results"""
        if not self.results:
            return {'success': False, 'error': 'No simulation results available'}
        
        try:
            summary = {
                'success': True,
                'simulation_time': len(self.results.time),
                'nodes': len(self.results.node.columns),
                'links': len(self.results.link.columns),
                'available_metrics': {
                    'node': list(self.results.node.keys()),
                    'link': list(self.results.link.keys())
                }
            }
            
            return summary
            
        except Exception as e:
            logger.error(f"Error getting results summary: {str(e)}")
            return {'success': False, 'error': str(e)}

def main():
    """CLI interface for simulation service"""
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'Missing command'}))
        sys.exit(1)
    
    command = sys.argv[1]
    service = WNTRSimulationService()
    
    try:
        if command == 'load_network':
            file_path = sys.argv[2]
            result = service.load_network(file_path)
            
        elif command == 'run_hydraulic':
            file_path = sys.argv[2]
            config = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
            
            # Load network first
            load_result = service.load_network(file_path)
            if not load_result['success']:
                result = load_result
            else:
                result = service.run_hydraulic_simulation(config)
                
        elif command == 'run_water_quality':
            file_path = sys.argv[2]
            config = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
            
            # Load network first
            load_result = service.load_network(file_path)
            if not load_result['success']:
                result = load_result
            else:
                result = service.run_water_quality_simulation(config)
                
        elif command == 'run_scenario':
            file_path = sys.argv[2]
            config = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
            
            # Load network first
            load_result = service.load_network(file_path)
            if not load_result['success']:
                result = load_result
            else:
                result = service.run_scenario_simulation(config)
        
        else:
            result = {'success': False, 'error': f'Unknown command: {command}'}
        
        print(json.dumps(result, indent=2))
        
    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))
        sys.exit(1)

if __name__ == '__main__':
    main()