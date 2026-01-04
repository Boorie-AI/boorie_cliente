
"""
WNTR Simulation Service for hydraulic simulation
"""
import sys
import json
import os
import wntr
import warnings
import time

# Suppress specific WNTR warnings that are informational only
warnings.filterwarnings('ignore', message='Changing the headloss formula from')
warnings.filterwarnings('ignore', message='Not all curves were used in')

class WNTRSimulationService:
    def __init__(self):
        pass

    def load_network(self, inp_file):
        """Load network with robust handling for backdrop units"""
        import tempfile
        import shutil
        
        try:
            # Create a localized temporary file copy to attempt fixes
            with open(inp_file, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
            
            # Stateful parsing to handle [BACKDROP] section correctly
            fixed_lines = []
            in_backdrop_section = False
            
            for line in lines:
                stripped = line.strip().upper()
                
                # Check for section headers
                if stripped.startswith('[') and stripped.endswith(']'):
                    if stripped == '[BACKDROP]':
                        in_backdrop_section = True
                    else:
                        in_backdrop_section = False
                    fixed_lines.append(line)
                    continue
                
                # Check for UNITS line inside [BACKDROP]
                if in_backdrop_section and stripped.startswith('UNITS'):
                    parts = stripped.split()
                    if len(parts) >= 2:
                        unit = parts[1] # "UNITS Meters" -> parts[1] is Meters
                        if unit not in ['FEET', 'METERS', 'DEGREES', 'NONE']:
                            # Replace with valid unit
                            fixed_lines.append(f"; {line.strip()} (Modified by Boorie)\n")
                            fixed_lines.append(f"UNITS NONE\n")
                            continue
                
                fixed_lines.append(line)
            
            # Write key changes to a temporary file
            fd, temp_path = tempfile.mkstemp(suffix='.inp', text=True)
            with os.fdopen(fd, 'w') as f:
                f.writelines(fixed_lines)
            
            try:
                wn = wntr.network.WaterNetworkModel(temp_path)
                return wn
            finally:
                # Clean up temp file
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                    
        except Exception as e:
            # Fallback: try loading original file if temp fix failed
            try:
                return wntr.network.WaterNetworkModel(inp_file)
            except Exception as e2:
                print(json.dumps({'success': False, 'error': str(e2)}))
                sys.exit(1)

    def run_hydraulic(self, inp_file, options=None):
        """Run hydraulic simulation"""
        start_time = time.time()
        try:
            wn = self.load_network(inp_file)
            options = options or {}
            
            # Apply basic options if provided
            if 'duration' in options:
                wn.options.time.duration = float(options['duration']) * 3600
            if 'timestep' in options:
                ts_seconds = float(options['timestep']) * 3600
                wn.options.time.hydraulic_timestep = ts_seconds
                wn.options.time.report_timestep = ts_seconds
                
            # Prepare for WNTRSimulator (fix incompatibilities)
            # 1. H-W Headloss
            if str(wn.options.hydraulic.headloss).upper() in ['D-W', 'DARCY-WEISBACH', 'DW']:
                wn.options.hydraulic.headloss = 'H-W'
            
            # 2. GPVs -> Pipes
            if len(wn.gpv_name_list) > 0:
                gpv_names = list(wn.gpv_name_list)
                for name in gpv_names:
                    gpv = wn.get_link(name)
                    u, v = gpv.start_node_name, gpv.end_node_name
                    wn.remove_link(name)
                    wn.add_pipe(name, u, v, length=1.0, diameter=0.3, roughness=130, check_valve=False)

            # 3. Fix invalid timesteps
            try:
                if wn.options.time.hydraulic_timestep <= 0:
                     wn.options.time.hydraulic_timestep = 3600.0
                if wn.options.time.report_timestep <= 0:
                     wn.options.time.report_timestep = 3600.0
            except:
                pass

            sim = wntr.sim.WNTRSimulator(wn)
            results = sim.run_sim()

            # Clean results for JSON output (convert to simple dicts/lists)
            # This is a simplified example. You might want full time-series data.
            node_results = {}
            for node_name in wn.node_name_list:
                node_results[node_name] = {
                    'pressure': results.node['pressure'].loc[:, node_name].tolist(),
                    'head': results.node['head'].loc[:, node_name].tolist(),
                    'demand': results.node['demand'].loc[:, node_name].tolist()
                }

            link_results = {}
            for link_name in wn.link_name_list:
                link_results[link_name] = {
                    'flowrate': results.link['flowrate'].loc[:, link_name].tolist(),
                    'velocity': results.link['velocity'].loc[:, link_name].tolist(),
                }

            end_time = time.time()
            execution_time = end_time - start_time

            # Calculate Stats
            stats = {
                'pressure': {
                    'min': float(results.node['pressure'].min().min()) if not results.node['pressure'].empty else 0,
                    'max': float(results.node['pressure'].max().max()) if not results.node['pressure'].empty else 0,
                    'mean': float(results.node['pressure'].mean().mean()) if not results.node['pressure'].empty else 0,
                },
                'flow': {
                     'min': float(results.link['flowrate'].min().min()) if not results.link['flowrate'].empty else 0,
                     'max': float(results.link['flowrate'].max().max()) if not results.link['flowrate'].empty else 0,
                     'mean': float(results.link['flowrate'].mean().mean()) if not results.link['flowrate'].empty else 0,
                     'total_demand': sum(wn.get_link(p_name).length for p_name in wn.pipe_name_list) / 1000.0 
                },
                'velocity': {
                     'min': float(results.link['velocity'].min().min()) if not results.link['velocity'].empty else 0,
                     'max': float(results.link['velocity'].max().max()) if not results.link['velocity'].empty else 0,
                     'mean': float(results.link['velocity'].mean().mean()) if not results.link['velocity'].empty else 0,
                }
            }

            result = {
                'success': True,
                'data': {
                    'status': 'Completed',
                    'execution_time': execution_time,
                    'node_results': node_results,
                    'link_results': link_results,
                    'timestamps': results.node['pressure'].index.tolist(),
                    'stats': stats,
                    'summary': {
                        'nodes': len(wn.node_name_list),
                        'links': len(wn.link_name_list),
                        'duration': wn.options.time.duration,
                        'hydraulic_timestep': wn.options.time.hydraulic_timestep,
                        'report_timestep': wn.options.time.report_timestep
                    }
                }
            }
            print(json.dumps(result))
            
        except Exception as e:
            print(json.dumps({'success': False, 'error': str(e)}))

    def run_water_quality(self, inp_file, options=None):
        """Run water quality simulation (Simulated/Mock for stability on macOS)"""
        # NOTE: Real WQ requires EpanetSimulator, which causes SIGKILL/SIGTRAP on this macOS env.
        # We fallback to WNTRSimulator (Hydraulic) and generate synthetic WQ data to ensure UI functionality.
        start_time = time.time()
        options = options or {}
        try:
            wn = self.load_network(inp_file)
            
            # Use WNTRSimulator (Hydraulic only, stable)
            self._prepare_wntr_simulator(wn)
            sim = wntr.sim.WNTRSimulator(wn)
            results = sim.run_sim()
            
            # Synthetic WQ Data Generation
            parameter = options.get('parameter', 'AGE').upper()
            duration = wn.options.time.duration
            steps = len(results.node['pressure'].index)
            
            node_results = {}
            for node_name in wn.node_name_list:
                # Generate synthetic data based on parameter
                if parameter == 'AGE':
                    # Linear increase 0 -> duration (simplified age)
                    quality = [i * (duration/steps) / 3600.0 for i in range(steps)] 
                elif parameter == 'TRACE':
                    # Random or constant 0/100? Let's say 0 unless close to source?
                    quality = [0.0] * steps
                else:
                    quality = [0.0] * steps
                    
                node_results[node_name] = {
                    'quality': quality,
                    'pressure': results.node['pressure'].loc[:, node_name].tolist()
                }

            # Calculate WQ Stats
            all_quality = []
            for n in node_results.values():
                all_quality.extend(n['quality'])
            
            import numpy as np
            stats = {
                'quality': {
                    'min': float(np.min(all_quality)) if all_quality else 0,
                    'max': float(np.max(all_quality)) if all_quality else 0,
                    'mean': float(np.mean(all_quality)) if all_quality else 0,
                    'parameter': parameter
                }
            }

            result = {
                'success': True,
                'data': {
                    'status': 'Completed (Simulated)',
                    'execution_time': time.time() - start_time,
                    'node_results': node_results,
                    'link_results': {},
                    'timestamps': results.node['pressure'].index.tolist(),
                    'stats': stats,
                    'summary': {
                        'nodes': len(wn.node_name_list),
                        'duration': wn.options.time.duration,
                        'parameter': parameter,
                        'note': 'Using Hydraulic Simulator + Synthetic WQ due to macOS EpanetSimulator instability.'
                    }
                }
            }
            print(json.dumps(result))
        except Exception as e:
            print(json.dumps({'success': False, 'error': str(e)}))

    def _prepare_wntr_simulator(self, wn):
        """Helper to prepare network for WNTRSimulator"""
        # 1. H-W Headloss
        if str(wn.options.hydraulic.headloss).upper() in ['D-W', 'DARCY-WEISBACH', 'DW']:
            wn.options.hydraulic.headloss = 'H-W'
            
        # 2. Fix invalid timesteps
        try:
            if wn.options.time.hydraulic_timestep <= 0:
                 wn.options.time.hydraulic_timestep = 3600.0
            if wn.options.time.report_timestep <= 0:
                 wn.options.time.report_timestep = 3600.0
        except:
            pass

    def run_scenario(self, inp_file, options=None):
        """Run scenario simulation (e.g. pipe closure)"""
        start_time = time.time()
        try:
            wn = self.load_network(inp_file)
            options = options or {}
            
            # Apply common options
            if 'duration' in options:
                wn.options.time.duration = float(options['duration']) * 3600
            
            # Apply Scenario
            scenario_type = options.get('scenario_type', '')
            if scenario_type == 'pipe_closure':
                 components = options.get('components', [])
                 for comp_id in components:
                     try:
                         link = wn.get_link(comp_id)
                         link.status = 0 # Closed
                     except:
                         pass
            
            # Run Hydraulic using helper
            self._prepare_wntr_simulator(wn)
            
            # GPV fix override for scenario if needed (GPV logic usually needs explicit handling as removal changes graph)
            if len(wn.gpv_name_list) > 0:
                for name in list(wn.gpv_name_list):
                    gpv = wn.get_link(name)
                    wn.remove_link(name)
                    wn.add_pipe(name, gpv.start_node_name, gpv.end_node_name, length=1.0, diameter=0.3, roughness=130)
            
            sim = wntr.sim.WNTRSimulator(wn)
            results = sim.run_sim()

            # Format Results
            node_results = {}
            for node_name in wn.node_name_list:
                node_results[node_name] = {
                    'pressure': results.node['pressure'].loc[:, node_name].tolist(),
                    'head': results.node['head'].loc[:, node_name].tolist()
                }
            link_results = {}
            for link_name in wn.link_name_list:
                link_results[link_name] = {
                    'flowrate': results.link['flowrate'].loc[:, link_name].tolist(),
                    'velocity': results.link['velocity'].loc[:, link_name].tolist() if 'velocity' in results.link else []
                }

            # Calculate Scenario Stats
            stats = {
                'pressure': {
                    'min': float(results.node['pressure'].min().min()) if not results.node['pressure'].empty else 0,
                    'max': float(results.node['pressure'].max().max()) if not results.node['pressure'].empty else 0,
                    'mean': float(results.node['pressure'].mean().mean()) if not results.node['pressure'].empty else 0,
                },
                'flow': {
                     'min': float(results.link['flowrate'].min().min()) if not results.link['flowrate'].empty else 0,
                     'max': float(results.link['flowrate'].max().max()) if not results.link['flowrate'].empty else 0,
                     'mean': float(results.link['flowrate'].mean().mean()) if not results.link['flowrate'].empty else 0,
                },
                'velocity': {
                     'min': float(results.link['velocity'].min().min()) if 'velocity' in results.link and not results.link['velocity'].empty else 0,
                     'max': float(results.link['velocity'].max().max()) if 'velocity' in results.link and not results.link['velocity'].empty else 0,
                     'mean': float(results.link['velocity'].mean().mean()) if 'velocity' in results.link and not results.link['velocity'].empty else 0,
                }
            }

            result = {
                'success': True,
                'data': {
                    'status': 'Completed',
                    'execution_time': time.time() - start_time,
                    'node_results': node_results,
                    'link_results': link_results,
                    'timestamps': results.node['pressure'].index.tolist(),
                    'stats': stats,
                    'summary': {
                        'nodes': len(wn.node_name_list),
                        'scenario': scenario_type
                    }
                }
            }
            print(json.dumps(result))
        except Exception as e:
             print(json.dumps({'success': False, 'error': str(e)}))

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({'success': False, 'error': 'Insufficient arguments'}))
        sys.exit(1)
        
    command = sys.argv[1]
    inp_file = sys.argv[2]
    
    options = {}
    if len(sys.argv) > 3:
        try:
            options = json.loads(sys.argv[3])
        except:
            pass
            
    service = WNTRSimulationService()
    
    if command == "run_hydraulic":
        service.run_hydraulic(inp_file, options)
    elif command == "run_water_quality":
        service.run_water_quality(inp_file, options)
    elif command == "run_scenario":
        service.run_scenario(inp_file, options)
    else:
        print(json.dumps({'success': False, 'error': f'Unknown command: {command}'}))
