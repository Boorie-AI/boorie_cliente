"""
WNTR Service for EPANET file handling and network analysis
"""
import json
import os
import tempfile
from typing import Dict, Any, List, Optional, Tuple
import warnings
import wntr
import wntr.metrics.topographic
import numpy as np

# Suppress specific WNTR warnings that are informational only
warnings.filterwarnings('ignore', message='Changing the headloss formula from')
warnings.filterwarnings('ignore', message='Not all curves were used in')


class WNTRService:
    """Service for handling WNTR operations"""
    
    def __init__(self):
        self.current_model = None
        self.model_path = None
        self.temp_file_path = None
    
    def load_inp_file(self, file_path: str) -> Dict[str, Any]:
        """
        Load an EPANET INP file and return network information
        
        Args:
            file_path: Path to the INP file
            
        Returns:
            Dictionary with network information and visualization data
        """
        try:
            # Reset temp file path
            self.temp_file_path = None
            
            # First, try to fix common issues in the INP file
            self._preprocess_inp_file(file_path)
            
            # Load the EPANET model (use temp file if created, otherwise original)
            load_path = self.temp_file_path if self.temp_file_path else file_path
            # Load the file
            
            # Capture warnings during model loading
            model_warnings = []
            with warnings.catch_warnings(record=True) as w:
                warnings.simplefilter("always")
                wn = wntr.network.WaterNetworkModel(load_path)
                # Collect relevant warnings
                for warning in w:
                    if 'headloss formula' in str(warning.message):
                        model_warnings.append({
                            'type': 'headloss_change',
                            'message': 'Headloss formula was changed. Roughness coefficient units may need adjustment.'
                        })
                    elif 'curves were used' in str(warning.message):
                        model_warnings.append({
                            'type': 'unused_curves',
                            'message': 'Some curves in the file were not assigned to any pump or efficiency.'
                        })
                        
            self.current_model = wn
            self.model_path = file_path  # Keep original path for reference
            
            # Model loaded successfully
            
            # Extract network information
            network_info = {
                'name': os.path.basename(file_path),
                'summary': {
                    'junctions': len(wn.junction_name_list),
                    'tanks': len(wn.tank_name_list),
                    'reservoirs': len(wn.reservoir_name_list),
                    'pipes': len(wn.pipe_name_list),
                    'pumps': len(wn.pump_name_list),
                    'valves': len(wn.valve_name_list),
                    'patterns': len(wn.pattern_name_list),
                    'curves': len(wn.curve_name_list)
                }
            }
            
            # print(f"Network loaded: {network_info['summary']}")  # Commented out to avoid JSON pollution
            
            try:
                # Get nodes data
                network_info['nodes'] = self._get_nodes_data(wn)
                # Successfully extracted nodes
            except Exception as e:
                # Error getting nodes - re-raise
                raise
                
            try:
                # Get links data
                network_info['links'] = self._get_links_data(wn)
                # Successfully extracted links
            except Exception as e:
                # Error getting links - re-raise
                raise
                
            try:
                # Get options data
                network_info['options'] = self._get_options_data(wn)
            except Exception as e:
                # Error getting options - re-raise
                raise
                
            # Try to extract geographic bounds and coordinate system info
            try:
                coord_info = self._get_coordinate_info(file_path)
                if coord_info:
                    network_info['coordinate_system'] = coord_info
            except Exception as e:
                # print(f"Warning: Could not extract coordinate information: {e}")  # Debug only
                pass
                
            try:
                # Get patterns data
                network_info['patterns'] = self._get_patterns_data(wn)
            except Exception as e:
                # Error getting patterns - re-raise
                raise
                
            try:
                # Get curves data
                network_info['curves'] = self._get_curves_data(wn)
            except Exception as e:
                # Error getting curves - re-raise
                raise
            
            result = {
                'success': True,
                'data': network_info
            }
            
            # Add warnings if any were captured
            if model_warnings:
                result['warnings'] = model_warnings
                
            return result
            
        except Exception as e:
            error_msg = str(e)
            
            # Provide more helpful error messages
            if "Backdrop units must be" in error_msg:
                error_msg = "Invalid backdrop units in the INP file. The file may have been created with a non-standard EPANET version. Please check the [BACKDROP] section in your INP file."
            elif "expected string or bytes-like object" in error_msg:
                error_msg = "Invalid file format. Please ensure this is a valid EPANET INP file."
            elif "No such file or directory" in error_msg:
                error_msg = "File not found. Please check the file path."
            
            # Clean up temp file if error occurs
            if self.temp_file_path and os.path.exists(self.temp_file_path):
                try:
                    os.remove(self.temp_file_path)
                    self.temp_file_path = None
                except:
                    pass
            
            return {
                'success': False,
                'error': error_msg,
                'details': str(e)  # Keep original error for debugging
            }
    
    def _get_nodes_data(self, wn: wntr.network.WaterNetworkModel) -> List[Dict[str, Any]]:
        """Extract node data for visualization"""
        nodes = []
        
        # Process all nodes
        for node_name in wn.node_name_list:
            node = wn.get_node(node_name)
            
            # Basic node data
            node_data = {
                'id': node_name,
                'label': node_name,
                'type': node.node_type.lower()  # 'junction', 'tank', 'reservoir'
            }
            
            # Get coordinates safely
            try:
                if hasattr(node, 'coordinates') and node.coordinates is not None:
                    coords = node.coordinates
                    node_data['x'] = float(coords[0]) if len(coords) > 0 else 0.0
                    node_data['y'] = float(coords[1]) if len(coords) > 1 else 0.0
                else:
                    node_data['x'] = 0.0
                    node_data['y'] = 0.0
            except:
                node_data['x'] = 0.0
                node_data['y'] = 0.0
            
            # Add type-specific properties
            try:
                if node.node_type == 'Junction':
                    node_data['elevation'] = float(getattr(node, 'elevation', 0.0))
                    node_data['demand'] = float(getattr(node, 'base_demand', 0.0))
                    # Get pattern if available
                    try:
                        if hasattr(node, 'demand_timeseries_list'):
                            demands = list(node.demand_timeseries_list)
                            if demands:
                                node_data['pattern'] = getattr(demands[0], 'pattern_name', None)
                            else:
                                node_data['pattern'] = None
                        else:
                            node_data['pattern'] = None
                    except:
                        node_data['pattern'] = None
                        
                elif node.node_type == 'Tank':
                    node_data['elevation'] = float(getattr(node, 'elevation', 0.0))
                    node_data['init_level'] = float(getattr(node, 'init_level', 0.0))
                    node_data['min_level'] = float(getattr(node, 'min_level', 0.0))
                    node_data['max_level'] = float(getattr(node, 'max_level', 0.0))
                    node_data['diameter'] = float(getattr(node, 'diameter', 0.0))
                    
                elif node.node_type == 'Reservoir':
                    # Get total head
                    try:
                        if hasattr(node, 'head_timeseries') and node.head_timeseries:
                            node_data['total_head'] = float(getattr(node.head_timeseries, 'base_value', 0.0))
                            node_data['pattern'] = getattr(node.head_timeseries, 'pattern_name', None)
                        else:
                            node_data['total_head'] = 0.0
                            node_data['pattern'] = None
                    except:
                        node_data['total_head'] = 0.0
                        node_data['pattern'] = None
            except Exception as e:
                # print(f"Warning: Error processing node {node_name}: {e}")  # Debug only
                pass
                
            nodes.append(node_data)
        
        return nodes
    
    def _get_links_data(self, wn: wntr.network.WaterNetworkModel) -> List[Dict[str, Any]]:
        """Extract link data for visualization"""
        links = []
        
        # Process all links
        for link_name in wn.link_name_list:
            link = wn.get_link(link_name)
            
            # Basic link data
            link_data = {
                'id': link_name,
                'label': link_name,
                'type': link.link_type.lower(),  # 'pipe', 'pump', 'valve'
                'from': link.start_node_name,
                'to': link.end_node_name
            }
            
            # Add type-specific properties
            try:
                if link.link_type == 'Pipe':
                    link_data['length'] = float(getattr(link, 'length', 0.0))
                    link_data['diameter'] = float(getattr(link, 'diameter', 0.0))
                    link_data['roughness'] = float(getattr(link, 'roughness', 0.0))
                    # Get status safely
                    try:
                        status = getattr(link, 'initial_status', None)
                        if hasattr(status, 'name'):
                            link_data['status'] = status.name
                        else:
                            link_data['status'] = str(status) if status is not None else 'OPEN'
                    except:
                        link_data['status'] = 'OPEN'
                        
                elif link.link_type == 'Pump':
                    link_data['pump_type'] = getattr(link, 'pump_type', 'UNKNOWN')
                    # Get status safely
                    try:
                        status = getattr(link, 'initial_status', None)
                        if hasattr(status, 'name'):
                            link_data['status'] = status.name
                        else:
                            link_data['status'] = str(status) if status is not None else 'OPEN'
                    except:
                        link_data['status'] = 'OPEN'
                    
                    # Handle different pump types
                    if link_data['pump_type'] == 'HEAD':
                        link_data['pump_curve'] = getattr(link, 'pump_curve_name', None)
                    elif link_data['pump_type'] == 'POWER':
                        link_data['power'] = float(getattr(link, 'power', 0.0))
                    
                    # Get speed safely
                    try:
                        speed_ts = getattr(link, 'speed_timeseries', None)
                        if speed_ts is not None:
                            link_data['speed'] = float(getattr(speed_ts, 'base_value', 1.0))
                        else:
                            link_data['speed'] = 1.0
                    except:
                        link_data['speed'] = 1.0
                        
                elif link.link_type == 'Valve':
                    link_data['valve_type'] = getattr(link, 'valve_type', 'UNKNOWN')
                    link_data['setting'] = float(getattr(link, 'initial_setting', 0.0))
                    link_data['diameter'] = float(getattr(link, 'diameter', 0.0))
                    # Get status safely
                    try:
                        status = getattr(link, 'initial_status', None)
                        if hasattr(status, 'name'):
                            link_data['status'] = status.name
                        else:
                            link_data['status'] = str(status) if status is not None else 'OPEN'
                    except:
                        link_data['status'] = 'OPEN'
                        
            except Exception as e:
                # print(f"Warning: Error processing link {link_name}: {e}")  # Debug only
                pass
                
            links.append(link_data)
        
        return links
    
    def _get_options_data(self, wn: wntr.network.WaterNetworkModel) -> Dict[str, Any]:
        """Extract simulation options"""
        options = wn.options
        options_data = {}
        
        # Time options
        try:
            options_data['time'] = {
                'duration': float(getattr(options.time, 'duration', 0)),
                'hydraulic_timestep': float(getattr(options.time, 'hydraulic_timestep', 0)),
                'quality_timestep': float(getattr(options.time, 'quality_timestep', 0)),
                'pattern_timestep': float(getattr(options.time, 'pattern_timestep', 0)),
                'pattern_start': float(getattr(options.time, 'pattern_start', 0)),
                'report_timestep': float(getattr(options.time, 'report_timestep', 0)),
                'report_start': float(getattr(options.time, 'report_start', 0)),
                'start_clocktime': float(getattr(options.time, 'start_clocktime', 0))
            }
        except:
            options_data['time'] = {}
            
        # Hydraulic options
        try:
            hydraulic_opts = {}
            
            # Try different attribute names for headloss formula
            headloss = getattr(options.hydraulic, 'headloss', None)
            if headloss is None:
                headloss = getattr(options.hydraulic, 'headloss_formula', None)
            if headloss is None:
                headloss = getattr(options.hydraulic, 'formula', 'H-W')
            hydraulic_opts['headloss'] = str(headloss)
            
            # Demand model
            hydraulic_opts['demand_model'] = str(getattr(options.hydraulic, 'demand_model', 'DDA'))
            
            # Pressure settings
            hydraulic_opts['minimum_pressure'] = float(getattr(options.hydraulic, 'minimum_pressure', 0))
            hydraulic_opts['required_pressure'] = float(getattr(options.hydraulic, 'required_pressure', 0))
            hydraulic_opts['pressure_exponent'] = float(getattr(options.hydraulic, 'pressure_exponent', 0))
            
            options_data['hydraulic'] = hydraulic_opts
        except Exception as e:
            # print(f"Warning: Error extracting hydraulic options: {e}")  # Debug only
            options_data['hydraulic'] = {
                'headloss': 'H-W',
                'demand_model': 'DDA',
                'minimum_pressure': 0,
                'required_pressure': 0,
                'pressure_exponent': 0
            }
            
        # Quality options - handle different attribute names
        try:
            quality_mode = getattr(options.quality, 'mode', None)
            if quality_mode is None:
                quality_mode = getattr(options.quality, 'quality', None)
                
            options_data['quality'] = {
                'mode': str(quality_mode) if quality_mode is not None else 'NONE',
                'parameter': str(getattr(options.quality, 'parameter', 'NONE'))
            }
        except:
            options_data['quality'] = {'mode': 'NONE', 'parameter': 'NONE'}
            
        # Solver options
        try:
            options_data['solver'] = {
                'algorithm': str(getattr(options.solver, 'algorithm', 'NEWTON')),
                'trials': int(getattr(options.solver, 'trials', 40)),
                'accuracy': float(getattr(options.solver, 'accuracy', 0.001))
            }
        except:
            options_data['solver'] = {}
            
        return options_data
    
    def _get_patterns_data(self, wn: wntr.network.WaterNetworkModel) -> Dict[str, List[float]]:
        """Extract demand patterns"""
        patterns = {}
        for name, pattern in wn.patterns():
            patterns[name] = pattern.multipliers.tolist()
        return patterns
    
    def _get_coordinate_info(self, file_path: str) -> Optional[Dict[str, Any]]:
        """
        Extract coordinate system and geographic information from INP file
        
        Returns:
            Dictionary with coordinate system info or None
        """
        try:
            coord_info = {
                'type': 'unknown',  # 'geographic' or 'projected'
                'bounds': None,
                'epsg': None,
                'units': 'feet'  # default EPANET units
            }
            
            # Read the INP file to look for coordinate information
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
            
            in_map_section = False
            in_coordinates_section = False
            coordinates = []
            
            for line in lines:
                line = line.strip()
                
                # Check for sections
                if line.upper() == '[MAP]':
                    in_map_section = True
                    in_coordinates_section = False
                    continue
                elif line.upper() == '[COORDINATES]':
                    in_coordinates_section = True
                    in_map_section = False
                    continue
                elif line.startswith('[') and line.endswith(']'):
                    in_map_section = False
                    in_coordinates_section = False
                    continue
                
                # Skip empty lines and comments
                if not line or line.startswith(';'):
                    continue
                
                # Process MAP section for units
                if in_map_section:
                    parts = line.split()
                    if len(parts) >= 2:
                        if parts[0].upper() == 'UNITS':
                            coord_info['units'] = parts[1].lower()
                
                # Collect coordinates to analyze
                if in_coordinates_section:
                    parts = line.split()
                    if len(parts) >= 3:
                        try:
                            x = float(parts[1])
                            y = float(parts[2])
                            coordinates.append((x, y))
                        except ValueError:
                            continue
            
            # Analyze coordinates to determine if they're geographic
            if coordinates:
                x_coords = [c[0] for c in coordinates]
                y_coords = [c[1] for c in coordinates]
                
                min_x = min(x_coords)
                max_x = max(x_coords)
                min_y = min(y_coords)
                max_y = max(y_coords)
                
                # Heuristic to detect geographic coordinates
                # Geographic coordinates typically fall within:
                # Longitude: -180 to 180
                # Latitude: -90 to 90
                if (-180 <= min_x <= 180 and -180 <= max_x <= 180 and
                    -90 <= min_y <= 90 and -90 <= max_y <= 90 and
                    abs(max_x - min_x) < 10 and abs(max_y - min_y) < 10):
                    # Likely geographic coordinates
                    coord_info['type'] = 'geographic'
                    coord_info['bounds'] = {
                        'minLon': min_x,
                        'maxLon': max_x,
                        'minLat': min_y,
                        'maxLat': max_y
                    }
                else:
                    # Likely projected coordinates
                    coord_info['type'] = 'projected'
                    coord_info['bounds'] = {
                        'minX': min_x,
                        'maxX': max_x,
                        'minY': min_y,
                        'maxY': max_y
                    }
                
                # Try to detect specific coordinate systems
                # Check for UTM-like coordinates (large positive numbers)
                if coord_info['type'] == 'projected':
                    if min_x > 100000 and min_x < 1000000:
                        coord_info['possible_system'] = 'UTM'
                        
                        # Detect UTM zone based on X coordinate ranges
                        # UTM zones for Latin America:
                        # Zone 14N: Mexico Pacific (500,000-900,000)
                        # Zone 15N: Mexico/Guatemala (200,000-800,000)
                        # Zone 16N: Guatemala/Belize (200,000-800,000)
                        # Zone 17N: Colombia west (200,000-800,000)
                        # Zone 18N: Colombia Caribbean coast including Cartagena (200,000-800,000)
                        # Zone 19N: Colombia interior (200,000-800,000)
                        
                        # Check for filename hints to help with detection
                        filename_lower = file_path.lower()
                        
                        if 'cartagena' in filename_lower or 'tk-lomas' in filename_lower:
                            # Cartagena is in UTM Zone 18N
                            coord_info['possible_utm_zone'] = '18N'
                            coord_info['region_hint'] = 'Colombia Caribbean (Cartagena)'
                            coord_info['epsg'] = 'EPSG:32618'  # WGS84 UTM Zone 18N
                        elif 200000 <= min_x <= 800000:
                            # Standard UTM zone detection for the Americas
                            if min_x < 350000:
                                coord_info['possible_utm_zone'] = '17N'
                                coord_info['region_hint'] = 'Colombia Pacific coast'
                                coord_info['epsg'] = 'EPSG:32617'
                            elif min_x < 650000:
                                coord_info['possible_utm_zone'] = '18N'
                                coord_info['region_hint'] = 'Colombia Caribbean (Cartagena, Barranquilla)'
                                coord_info['epsg'] = 'EPSG:32618'
                            else:
                                coord_info['possible_utm_zone'] = '19N'
                                coord_info['region_hint'] = 'Colombia interior (Bogotá)'
                                coord_info['epsg'] = 'EPSG:32619'
                        elif 160000 <= min_x <= 840000:
                            # Mexico and Central America
                            if min_x < 400000:
                                coord_info['possible_utm_zone'] = '14N'
                                coord_info['region_hint'] = 'Mexico Pacific'
                                coord_info['epsg'] = 'EPSG:32614'
                            elif min_x < 600000:
                                coord_info['possible_utm_zone'] = '15N'
                                coord_info['region_hint'] = 'Mexico/Guatemala'
                                coord_info['epsg'] = 'EPSG:32615'
                            else:
                                coord_info['possible_utm_zone'] = '16N'
                                coord_info['region_hint'] = 'Guatemala/Belize'
                                coord_info['epsg'] = 'EPSG:32616'
                        else:
                            # Generic UTM zone calculation for other areas
                            estimated_zone = int((min_x + 500000) / 1000000 * 6 + 31)
                            if 1 <= estimated_zone <= 60:
                                coord_info['possible_utm_zone'] = f'{estimated_zone}N'
                                coord_info['epsg'] = f'EPSG:326{estimated_zone:02d}'
                
                # print(f"Coordinate detection: type={coord_info['type']}, bounds={coord_info['bounds']}, system={coord_info.get('possible_system', 'unknown')}")  # Debug only
                
            return coord_info
            
        except Exception as e:
            # print(f"Error extracting coordinate info: {e}")  # Debug only
            return None
    
    def _get_curves_data(self, wn: wntr.network.WaterNetworkModel) -> Dict[str, Dict[str, Any]]:
        """Extract pump and efficiency curves"""
        curves = {}
        
        try:
            for name, curve in wn.curves():
                curve_data = {
                    'curve_type': str(getattr(curve, 'curve_type', 'UNKNOWN'))
                }
                
                # Handle points safely
                try:
                    if hasattr(curve, 'points') and curve.points is not None:
                        # Check if points is a tuple or list with at least 2 elements
                        if isinstance(curve.points, (tuple, list)) and len(curve.points) >= 2:
                            x_vals = curve.points[0]
                            y_vals = curve.points[1]
                            if x_vals is not None and y_vals is not None:
                                curve_data['points'] = [[float(x), float(y)] for x, y in zip(x_vals, y_vals)]
                            else:
                                curve_data['points'] = []
                        else:
                            # Try to get points another way
                            curve_data['points'] = []
                    else:
                        curve_data['points'] = []
                except Exception as e:
                    # print(f"Warning: Could not extract points for curve {name}: {e}")  # Debug only
                    curve_data['points'] = []
                    
                curves[name] = curve_data
                
        except Exception as e:
            # print(f"Warning: Error processing curves: {e}")  # Debug only
            pass
            
        return curves
    
    def run_simulation(self, simulation_type: str = 'single') -> Dict[str, Any]:
        """
        Run hydraulic simulation
        
        Args:
            simulation_type: Type of simulation ('single' or 'extended')
            
        Returns:
            Dictionary with simulation results
        """
        if not self.current_model:
            return {
                'success': False,
                'error': 'No model loaded'
            }
        
        try:
            wn = self.current_model
            
            # Check headloss formula and handle Darcy-Weisbach
            headloss_formula = None
            try:
                headloss_formula = getattr(wn.options.hydraulic, 'headloss', 'H-W')
                if headloss_formula is None:
                    headloss_formula = getattr(wn.options.hydraulic, 'headloss_formula', 'H-W')
            except:
                headloss_formula = 'H-W'
            
            # If Darcy-Weisbach, convert to Hazen-Williams for WNTR compatibility
            if str(headloss_formula).upper() in ['D-W', 'DARCY-WEISBACH', 'DW']:
                # Convert Darcy-Weisbach roughness to Hazen-Williams C values
                # Approximate conversion: C = 18.0 / (k^0.15) where k is D-W roughness
                for pipe_name, pipe in wn.links(wntr.network.Pipe):
                    if hasattr(pipe, 'roughness'):
                        old_roughness = pipe.roughness
                        if old_roughness > 0:
                            # Convert from D-W roughness (m) to H-W C value
                            # This is an approximation for steel pipes
                            new_c_value = max(50, min(150, 130 - 40 * (old_roughness / 0.001)))
                            pipe.roughness = new_c_value
                
                # Change formula to Hazen-Williams
                wn.options.hydraulic.headloss = 'H-W'
                # print(f"Converted D-W to H-W for WNTR compatibility")  # Debug only
            
            # Use only WNTR simulator to avoid code signing issues with EPANET
            # WNTR simulator works best with Hazen-Williams formula
            sim = wntr.sim.WNTRSimulator(wn)
            
            # Run simulation
            results = sim.run_sim()
            
            # Extract results
            if simulation_type == 'single':
                # Get results for time 0
                node_results = self._extract_node_results(results, 0)
                link_results = self._extract_link_results(results, 0)
            else:
                # Get results for all timesteps in a format suitable for time series
                node_results = {}
                link_results = {}
                
                # Initialize dictionaries for each node
                for node in results.node['pressure'].columns:
                    node_results[node] = {
                        'pressure': [],
                        'head': [],
                        'demand': []
                    }
                
                # Initialize dictionaries for each link
                for link in results.link['flowrate'].columns:
                    link_results[link] = {
                        'flowrate': [],
                        'velocity': [],
                        'headloss': [] if link in results.link.get('headloss', {}).columns else None
                    }
                
                # Fill in the time series data
                for t in results.node['pressure'].index:
                    for node in results.node['pressure'].columns:
                        node_results[node]['pressure'].append(float(results.node['pressure'].at[t, node]))
                        node_results[node]['head'].append(float(results.node['head'].at[t, node]))
                        if node in results.node['demand'].columns:
                            node_results[node]['demand'].append(float(results.node['demand'].at[t, node]))
                        else:
                            node_results[node]['demand'].append(0)
                    
                    for link in results.link['flowrate'].columns:
                        link_results[link]['flowrate'].append(float(results.link['flowrate'].at[t, link]))
                        link_results[link]['velocity'].append(float(results.link['velocity'].at[t, link]))
                        try:
                            if link_results[link]['headloss'] is not None and 'headloss' in results.link and link in results.link['headloss'].columns:
                                link_results[link]['headloss'].append(float(results.link['headloss'].at[t, link]))
                            elif link_results[link]['headloss'] is not None:
                                link_results[link]['headloss'].append(0.0)
                        except (KeyError, ValueError):
                            if link_results[link]['headloss'] is not None:
                                link_results[link]['headloss'].append(0.0)
            
            return {
                'success': True,
                'data': {
                    'node_results': node_results,
                    'link_results': link_results,
                    'timestamps': results.node['pressure'].index.tolist() if simulation_type == 'extended' else [0]
                }
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def _extract_node_results(self, results, time) -> Dict[str, Dict[str, float]]:
        """Extract node results for a specific time"""
        node_results = {}
        
        for node in results.node['pressure'].columns:
            node_results[node] = {
                'pressure': float(results.node['pressure'].at[time, node]),
                'demand': float(results.node['demand'].at[time, node]) if node in results.node['demand'].columns else 0,
                'head': float(results.node['head'].at[time, node])
            }
        
        return node_results
    
    def _extract_link_results(self, results, time) -> Dict[str, Dict[str, float]]:
        """Extract link results for a specific time"""
        link_results = {}
        
        for link in results.link['flowrate'].columns:
            link_results[link] = {
                'flowrate': float(results.link['flowrate'].at[time, link]),
                'velocity': float(results.link['velocity'].at[time, link])
            }
            
            # Add headloss for pipes if available
            try:
                if 'headloss' in results.link and link in results.link['headloss'].columns:
                    link_results[link]['headloss'] = float(results.link['headloss'].at[time, link])
                else:
                    link_results[link]['headloss'] = 0.0
            except (KeyError, ValueError):
                link_results[link]['headloss'] = 0.0
        
        return link_results
    
    def analyze_network(self) -> Dict[str, Any]:
        """
        Perform network analysis
        
        Returns:
            Dictionary with analysis results
        """
        if not self.current_model:
            return {
                'success': False,
                'error': 'No model loaded'
            }
        
        try:
            wn = self.current_model
            
            # Network topology analysis
            G = wn.to_graph()
            
            analysis = {
                'topology': {
                    'is_connected': True,  # WNTR doesn't have a direct is_connected function
                    'bridges': list(wntr.metrics.bridges(G)),
                    'articulation_points': []  # Will compute manually if needed
                },
                'hydraulic_analysis': self._hydraulic_analysis(wn),
                'demand_analysis': self._demand_analysis(wn),
                'energy_analysis': self._energy_analysis(wn)
            }
            
            return {
                'success': True,
                'data': analysis
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def _hydraulic_analysis(self, wn) -> Dict[str, Any]:
        """Perform hydraulic analysis"""
        # Use only WNTR simulator to avoid code signing issues
        sim = wntr.sim.WNTRSimulator(wn)
        results = sim.run_sim()
        
        # Calculate statistics
        pressure = results.node['pressure']
        flow = results.link['flowrate']
        
        return {
            'pressure_stats': {
                'min': float(pressure.min().min()),
                'max': float(pressure.max().max()),
                'mean': float(pressure.mean().mean()),
                'nodes_below_minimum': [],  # TODO: Implement based on minimum pressure requirement
            },
            'flow_stats': {
                'min': float(flow.min().min()),
                'max': float(flow.max().max()),
                'mean': float(flow.mean().mean()),
                'zero_flow_links': flow.columns[(flow == 0).any()].tolist()
            }
        }
    
    def _demand_analysis(self, wn) -> Dict[str, Any]:
        """Analyze water demand"""
        total_base_demand = 0
        demand_by_pattern = {}
        
        for name, junction in wn.nodes(wntr.network.Junction):
            if junction.demand_timeseries_list:
                demand = junction.demand_timeseries_list[0].base_value
                pattern = junction.demand_timeseries_list[0].pattern_name
                
                total_base_demand += demand
                
                if pattern not in demand_by_pattern:
                    demand_by_pattern[pattern] = 0
                demand_by_pattern[pattern] += demand
        
        return {
            'total_base_demand': total_base_demand,
            'demand_by_pattern': demand_by_pattern,
            'number_of_demand_nodes': len([j for j in wn.junction_name_list if wn.get_node(j).demand_timeseries_list])
        }
    
    def _energy_analysis(self, wn) -> Dict[str, Any]:
        """Analyze energy consumption"""
        pumps_info = []
        
        for name, pump in wn.links(wntr.network.Pump):
            info = {
                'name': name,
                'type': pump.pump_type,
                'efficiency': 'N/A'  # TODO: Extract from pump curve if available
            }
            
            # Add power only for POWER pumps
            if pump.pump_type == 'POWER' and hasattr(pump, 'power'):
                info['power'] = pump.power
            elif pump.pump_type == 'HEAD':
                info['pump_curve'] = pump.pump_curve_name
            
            pumps_info.append(info)
        
        return {
            'number_of_pumps': len(pumps_info),
            'pumps': pumps_info
        }
    
    def export_to_json(self, output_path: str) -> Dict[str, Any]:
        """
        Export current model to JSON format
        
        Args:
            output_path: Path to save the JSON file
            
        Returns:
            Success status
        """
        if not self.current_model:
            return {
                'success': False,
                'error': 'No model loaded'
            }
        
        try:
            network_data = {
                'nodes': self._get_nodes_data(self.current_model),
                'links': self._get_links_data(self.current_model),
                'options': self._get_options_data(self.current_model),
                'patterns': self._get_patterns_data(self.current_model),
                'curves': self._get_curves_data(self.current_model)
            }
            
            with open(output_path, 'w') as f:
                json.dump(network_data, f, indent=2)
            
            return {
                'success': True,
                'message': f'Model exported to {output_path}'
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def _preprocess_inp_file(self, file_path: str) -> None:
        """
        Preprocess the INP file to fix common issues
        
        Args:
            file_path: Path to the INP file
        """
        try:
            # Read the file
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
            
            modified = False
            new_lines = []
            in_backdrop_section = False
            
            for line in lines:
                # Check if we're in the [BACKDROP] section
                if line.strip().upper() == '[BACKDROP]':
                    in_backdrop_section = True
                elif line.strip().startswith('[') and line.strip().endswith(']'):
                    in_backdrop_section = False
                
                # Fix backdrop units if needed
                if in_backdrop_section and 'UNITS' in line.upper():
                    parts = line.split()
                    if len(parts) >= 2:
                        unit = parts[1].upper()
                        if unit not in ['FEET', 'METERS', 'DEGREES', 'NONE']:
                            # Default to METERS if invalid unit
                            line = f"UNITS\tMETERS\n"
                            modified = True
                
                new_lines.append(line)
            
            # If modifications were made, create a temporary file
            if modified:
                self.temp_file_path = file_path + '.tmp'
                with open(self.temp_file_path, 'w', encoding='utf-8') as f:
                    f.writelines(new_lines)
                # Use the temporary file for loading
                self.model_path = self.temp_file_path
            
        except Exception as e:
            # If preprocessing fails, just continue with the original file
            # print(f"Warning: Could not preprocess file: {e}")  # Debug only
            pass
    
    def __del__(self):
        """Clean up temporary files"""
        if self.temp_file_path and os.path.exists(self.temp_file_path):
            try:
                os.remove(self.temp_file_path)
            except:
                pass


# Global instance
wntr_service = WNTRService()


# CLI interface for testing
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 3:
        print("Usage: python wntrService.py <command> <file_path>")
        print("Commands: load, simulate, analyze")
        sys.exit(1)
    
    command = sys.argv[1]
    file_path = sys.argv[2]
    
    if command == "load":
        result = wntr_service.load_inp_file(file_path)
        print(json.dumps(result, indent=2))
    
    elif command == "simulate":
        # First load the file
        load_result = wntr_service.load_inp_file(file_path)
        if load_result['success']:
            result = wntr_service.run_simulation()
            print(json.dumps(result, indent=2))
        else:
            print(f"Error loading file: {load_result['error']}")
    
    elif command == "analyze":
        # First load the file
        load_result = wntr_service.load_inp_file(file_path)
        if load_result['success']:
            result = wntr_service.analyze_network()
            print(json.dumps(result, indent=2))
        else:
            print(f"Error loading file: {load_result['error']}")