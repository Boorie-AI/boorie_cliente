
"""
WNTR Simulation Service for hydraulic simulation
"""
import sys
import json
import os
import wntr
import warnings
import time
import numpy as np

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

    # Unidad de cada parámetro de calidad, para que la interfaz no tenga que
    # adivinarla. La edad sale de EPANET en segundos y se entrega en horas, que
    # es como se lee un tiempo de residencia; el trazador es un porcentaje del
    # caudal que viene del nudo trazado.
    QUALITY_UNITS = {'AGE': 'h', 'TRACE': '%', 'CHEMICAL': 'mg/L'}

    def run_water_quality(self, inp_file, options=None):
        """
        Simulación de calidad del agua con el motor de EPANET.

        Aquí no había simulación: se corría el modelo hidráulico y la calidad se
        fabricaba a mano —para la edad, una recta de cero a la duración, idéntica
        en todos los nudos; para el resto, ceros—, y se presentaba junto a las
        cifras reales con un «Completed». La razón escrita era que el
        EpanetSimulator se caía en macOS, pero el sustituto se aplicaba en las
        tres plataformas.

        La calidad la resuelve EPANET y sólo EPANET: el WNTRSimulator no
        transporta solutos. Así que se usa el que hay, y **si falla se dice**, en
        lugar de rellenar el hueco con un número que parece una medida. Es el
        mismo criterio que gobierna el motor de escenarios: ninguna cifra sale de
        una estimación.
        """
        start_time = time.time()
        options = options or {}
        try:
            wn = self.load_network(inp_file)

            if 'duration' in options:
                wn.options.time.duration = float(options['duration']) * 3600
            if 'timestep' in options:
                ts_seconds = float(options['timestep']) * 3600
                wn.options.time.hydraulic_timestep = ts_seconds
                wn.options.time.report_timestep = ts_seconds

            parameter = str(options.get('parameter', 'AGE')).upper()
            if parameter not in self.QUALITY_UNITS:
                print(json.dumps({
                    'success': False,
                    'error': f'Parámetro de calidad desconocido: {parameter}. Admitidos: '
                             + ', '.join(sorted(self.QUALITY_UNITS)),
                }))
                return

            wn.options.quality.parameter = parameter
            if parameter == 'CHEMICAL':
                # Sin sustancia declarada en el fichero —ni fuentes de calidad ni
                # calidad inicial en ningún nudo— EPANET devuelve ceros en toda la
                # red. Un cero que sólo significa «aquí no había nada que simular»
                # es lo mismo que enseñaba el relleno de antes.
                hay_fuentes = len(wn.source_name_list) > 0
                hay_inicial = any(wn.get_node(n).initial_quality for n in wn.node_name_list)
                if not hay_fuentes and not hay_inicial:
                    print(json.dumps({
                        'success': False,
                        'error': 'Esta red no declara ninguna sustancia: no tiene fuentes de calidad '
                                 'ni calidad inicial en sus nudos, así que la simulación química '
                                 'daría cero en toda la red. Se declara en el fichero .inp, '
                                 'en las secciones [SOURCES] y [QUALITY].',
                    }))
                    return

            if parameter == 'TRACE':
                # Sin nudo trazado no hay nada que trazar, y EPANET devolvería
                # ceros en toda la red sin decir por qué.
                trace_node = options.get('trace_node')
                if not trace_node:
                    print(json.dumps({
                        'success': False,
                        'error': 'Para trazar hace falta decir desde qué nudo se traza (`trace_node`).',
                    }))
                    return
                if trace_node not in wn.node_name_list:
                    print(json.dumps({
                        'success': False,
                        'error': f'El nudo a trazar «{trace_node}» no existe en la red.',
                    }))
                    return
                wn.options.quality.trace_node = trace_node

            # El paso de calidad es propio y más fino que el hidráulico; en cero,
            # EPANET no transporta nada.
            if wn.options.time.quality_timestep <= 0:
                wn.options.time.quality_timestep = 300.0

            results = wntr.sim.EpanetSimulator(wn).run_sim()

            quality = results.node['quality']
            if parameter == 'AGE':
                quality = quality / 3600.0

            pressure = results.node['pressure']
            node_results = {}
            for node_name in wn.node_name_list:
                node_results[node_name] = {
                    'quality': quality.loc[:, node_name].tolist(),
                    'pressure': pressure.loc[:, node_name].tolist(),
                }

            valores = quality.to_numpy()
            stats = {
                'quality': {
                    'min': float(np.min(valores)) if valores.size else 0.0,
                    'max': float(np.max(valores)) if valores.size else 0.0,
                    'mean': float(np.mean(valores)) if valores.size else 0.0,
                    'parameter': parameter,
                    'unit': self.QUALITY_UNITS[parameter],
                }
            }

            print(json.dumps({
                'success': True,
                'data': {
                    'status': 'Completed',
                    'execution_time': time.time() - start_time,
                    'node_results': node_results,
                    'link_results': {},
                    'timestamps': quality.index.tolist(),
                    'stats': stats,
                    'summary': {
                        'nodes': len(wn.node_name_list),
                        'duration': wn.options.time.duration,
                        'parameter': parameter,
                        'unit': self.QUALITY_UNITS[parameter],
                        'simulator': 'EpanetSimulator',
                    }
                }
            }))
        except Exception as e:
            # El motivo se entrega tal cual: en macOS, donde este simulador ha
            # dado problemas, es lo único que distingue «esta red no se puede
            # simular» de «este equipo no puede».
            print(json.dumps({
                'success': False,
                'error': f'No se pudo simular la calidad del agua: {e}',
            }))

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
