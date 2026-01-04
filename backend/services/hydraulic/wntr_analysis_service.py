
"""
WNTR Analysis Service for additional metrics: Topology, Criticality, Resilience
"""
import sys
import json
import os
import wntr
import networkx as nx
import wntr.metrics.economic
import wntr.metrics.hydraulic
import wntr.metrics.topographic
import warnings

# Suppress specific WNTR warnings that are informational only
warnings.filterwarnings('ignore', message='Changing the headloss formula from')
warnings.filterwarnings('ignore', message='Not all curves were used in')

class WNTRAnalysisService:
    def __init__(self):
        pass

    def _prepare_wntr_simulator(self, wn):
        """Prepare network for WNTRSimulator (fix incompatibilities)"""
        # 1. H-W Headloss (D-W not supported by WNTRSimulator)
        if str(wn.options.hydraulic.headloss).upper() in ['D-W', 'DARCY-WEISBACH', 'DW']:
            wn.options.hydraulic.headloss = 'H-W'
            
        # 2. GPVs -> Pipes (GPV not supported by WNTRSimulator)
        if len(wn.gpv_name_list) > 0:
            gpv_names = list(wn.gpv_name_list)
            for name in gpv_names:
                gpv = wn.get_link(name)
                u, v = gpv.start_node_name, gpv.end_node_name
                wn.remove_link(name)
                # Add proxy pipe: 1m length, 300mm diameter, 130 roughness (smooth H-W)
                wn.add_pipe(name, u, v, length=1.0, diameter=0.3, roughness=130, check_valve=False)
        
        # 3. Fix invalid timesteps (prevent 'float modulo' zero division errors)
        # Ensure hydraulic and report timesteps are valid (>=1 second)
        # Default to 1 hour (3600s) if 0 or missing
        try:
            if wn.options.time.hydraulic_timestep <= 0:
                wn.options.time.hydraulic_timestep = 3600.0
            if wn.options.time.report_timestep <= 0:
                wn.options.time.report_timestep = 3600.0
        except:
            # Fallback if attributes missing
            pass

        return wntr.sim.WNTRSimulator(wn)

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
            # Fallback: try loading original file if temp fix failed (though likely to fail same way)
            try:
                return wntr.network.WaterNetworkModel(inp_file)
            except Exception as e2:
                print(json.dumps({'success': False, 'error': str(e2)}))
                sys.exit(1)

    def analyze_topology(self, inp_file):
        """Analyze network topology"""
        try:
            wn = self.load_network(inp_file)
            
            # Create graph
            if hasattr(wn, 'to_graph'):
                G = wn.to_graph()
            else:
                G = wn.get_graph()
                
            uG = G.to_undirected()
            
            # --- Basic Metrics ---
            num_nodes = G.number_of_nodes()
            num_edges = G.number_of_edges()
            try:
                density = nx.density(G)
            except: density = 0.0
            
            # Avg Degree
            degrees = dict(G.degree())
            avg_degree = sum(degrees.values()) / len(degrees) if degrees else 0.0

            # --- Connectivity ---
            is_connected = nx.is_connected(uG)
            connected_components = nx.number_connected_components(uG)
            try:
                avg_clustering = nx.average_clustering(uG)
            except: avg_clustering = 0.0

            # --- Centrality (Lite) ---
            # Degree centrality is fast O(N)
            deg_centrality = nx.degree_centrality(G)
            max_deg_node = max(deg_centrality, key=deg_centrality.get) if deg_centrality else "N/A"

            # Skip expensive ones for large graphs (>500 nodes) to prevent timeout
            max_bet_node = "Skipped (>500 nodes)"
            max_close_node = "Skipped (>500 nodes)"
            
            if num_nodes <= 500:
                bet_centrality = nx.betweenness_centrality(G)
                max_bet_node = max(bet_centrality, key=bet_centrality.get) if bet_centrality else "N/A"
                
                close_centrality = nx.closeness_centrality(G)
                max_close_node = max(close_centrality, key=close_centrality.get) if close_centrality else "N/A"

            result = {
                'success': True,
                'data': {
                    'topology_metrics': {
                        'basic_metrics': {
                            'nodes': num_nodes,
                            'edges': num_edges,
                            'density': density,
                            'average_degree': avg_degree
                        },
                        'connectivity': {
                            'is_connected': is_connected,
                            'connected_components': connected_components,
                            'average_clustering': avg_clustering
                        },
                        'centrality': {
                            'most_critical_degree': max_deg_node,
                            'most_critical_betweenness': max_bet_node,
                            'most_critical_closeness': max_close_node
                        }
                    }
                }
            }
            print(json.dumps(result))
            
        except Exception as e:
            print(json.dumps({'success': False, 'error': str(e)}))

    def analyze_criticality(self, inp_file, options=None):
        """Identify critical nodes/links"""
        try:
            wn = self.load_network(inp_file)
            options = options or {}
            
            # Example criticality: pressure deficient nodes under normal conditions
            sim = self._prepare_wntr_simulator(wn)
            results = sim.run_sim()
            
            pressure = results.node['pressure']
            min_pressure_threshold = options.get('min_pressure', 10.0) # meters
            
            # Identifying nodes with pressure below threshold at any time step
            top_critical_nodes = []
            for node_name in wn.node_name_list:
                node_pressures = pressure.loc[:, node_name]
                min_p = float(node_pressures.min())
                mean_p = float(node_pressures.mean())
                
                if min_p < min_pressure_threshold:
                    # Calculate a score 0-1 based on deficit
                    deficit = min_pressure_threshold - min_p
                    score = min(deficit / 10.0, 1.0)
                    classification = "high" if score > 0.7 else "medium" if score > 0.3 else "low"
                    
                    # Tuple format expected by frontend: [id, data]
                    top_critical_nodes.append([
                        node_name,
                        {
                            "overall_score": score,
                            "classification": classification,
                            "min_pressure": min_p,
                            "mean_pressure": mean_p
                        }
                    ])
            
            # Sort by overall_score descending
            top_critical_nodes.sort(key=lambda x: x[1]['overall_score'], reverse=True)
            
            result = {
                'success': True,
                'data': {
                    'criticality_analysis': {
                        'top_critical_nodes': top_critical_nodes,
                        'top_critical_links': [] # Placeholder
                    }
                }
            }
            print(json.dumps(result))

        except Exception as e:
            print(json.dumps({'success': False, 'error': str(e)}))

    def calculate_resilience(self, inp_file, options=None):
        """Calculate resilience metrics"""
        try:
            wn = self.load_network(inp_file)
            
            # --- Hydraulic (Todini) ---
            sim = self._prepare_wntr_simulator(wn)
            results = sim.run_sim()
            
            head = results.node['head']
            pressure = results.node['pressure']
            demand = results.node['demand']
            flowrate = results.link['flowrate']
            
            todini = wntr.metrics.hydraulic.todini_index(head, pressure, demand, flowrate, wn, 30)
            hyd_score = float(todini.mean())
            
            # --- Topographic ---
            if hasattr(wn, 'to_graph'): G = wn.to_graph()
            else: G = wn.get_graph()
            uG = G.to_undirected()
            
            num_nodes = G.number_of_nodes()
            num_edges = G.number_of_edges()
            
            # Metrics
            try:
                alg_con = float(nx.algebraic_connectivity(uG)) if num_nodes < 500 else 0.1
            except: alg_con = 0.0
            
            degrees = [d for n,d in G.degree()]
            avg_deg = sum(degrees)/len(degrees) if degrees else 0.0
            
            try:
                link_density = nx.density(G)
            except: link_density = 0.0
            
            # Approximate meshedness (planar)
            meshedness = (num_edges - num_nodes + 1) / (2*num_nodes - 5) if num_nodes > 5 else 0.0
            meshedness = max(0.0, min(meshedness, 1.0))
            
            # Heuristic topo score
            topo_score = (min(alg_con, 1.0) + meshedness) / 2.0
            
            # --- Economic (Heuristic) ---
            est_cost = 0.0
            for link_name in wn.pipe_name_list:
                link = wn.get_link(link_name)
                # Cost ~ L * D^1.5 (generic formula)
                est_cost += (link.length * (link.diameter ** 1.5) * 100.0)
                
            econ_score = 0.8 # Placeholder for efficiency
            
            # --- Overall ---
            # Normalize hydraulic score (Todini can be > 1, cap at 1 for scoring)
            hyd_score_norm = min(max(hyd_score, 0.0), 1.0)
            overall = (topo_score * 0.3) + (hyd_score_norm * 0.4) + (econ_score * 0.3)
            
            classification = "excellent" if overall > 0.8 else "good" if overall > 0.6 else "fair" if overall > 0.4 else "poor"
            
            result = {
                'success': True,
                'data': {
                    'resilience_metrics': {
                        'topographic': {
                            'score': topo_score,
                            'algebraic_connectivity': alg_con,
                            'average_degree': avg_deg,
                            'link_density': link_density,
                            'meshedness_coefficient': meshedness
                        },
                        'hydraulic': {
                            'score': hyd_score_norm,
                            'todini_index': hyd_score
                        },
                        'economic': {
                            'score': econ_score,
                            'estimated_replacement_cost': est_cost,
                            'economic_efficiency': econ_score
                        },
                        'overall': {
                            'score': overall,
                            'classification': classification
                        }
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
    
    # Parse options if provided
    options = {}
    if len(sys.argv) > 3:
        try:
            options = json.loads(sys.argv[3])
        except:
            pass
            
    service = WNTRAnalysisService()
    
    if command == "analyze_topology":
        service.analyze_topology(inp_file)
    elif command == "analyze_criticality":
        service.analyze_criticality(inp_file, options)
    elif command == "calculate_resilience":
        service.calculate_resilience(inp_file, options)
    else:
        print(json.dumps({'success': False, 'error': f'Unknown command: {command}'}))
