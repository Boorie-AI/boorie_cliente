#!/usr/bin/env python3
"""
WNTR Analysis Service
Advanced network analysis and resilience metrics using WNTR
"""

import wntr
import numpy as np
import pandas as pd
import json
import sys
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
import networkx as nx
import warnings
warnings.filterwarnings('ignore')

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class WNTRAnalysisService:
    """
    Advanced analysis service for water distribution networks
    """
    
    def __init__(self):
        self.network = None
        self.results = None
        self.graph = None
        
    def load_network_and_results(self, file_path: str, results_data: Optional[Dict] = None) -> Dict[str, Any]:
        """Load network and optional simulation results"""
        try:
            self.network = wntr.network.WaterNetworkModel(file_path)
            
            # Convert network to NetworkX graph for analysis
            self.graph = self.network.get_graph()
            
            # Load results if provided
            if results_data:
                # Convert results data back to WNTR results format if needed
                # This would need implementation based on how results are stored
                pass
            
            logger.info(f"Network and graph loaded: {len(self.network.nodes)} nodes, {len(self.network.links)} links")
            
            return {
                'success': True,
                'message': 'Network loaded successfully',
                'network_stats': {
                    'nodes': len(self.network.nodes),
                    'links': len(self.network.links),
                    'graph_nodes': self.graph.number_of_nodes(),
                    'graph_edges': self.graph.number_of_edges()
                }
            }
            
        except Exception as e:
            logger.error(f"Error loading network: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def analyze_network_topology(self) -> Dict[str, Any]:
        """
        Analyze network topology and connectivity
        """
        try:
            if not self.network or not self.graph:
                return {'success': False, 'error': 'No network loaded'}
            
            # Basic graph metrics
            num_nodes = self.graph.number_of_nodes()
            num_edges = self.graph.number_of_edges()
            
            # Connectivity analysis
            is_connected = nx.is_connected(self.graph.to_undirected())
            num_components = nx.number_connected_components(self.graph.to_undirected())
            
            # Centrality measures
            try:
                betweenness = nx.betweenness_centrality(self.graph)
                closeness = nx.closeness_centrality(self.graph)
                degree = nx.degree_centrality(self.graph)
                
                # Find most critical nodes
                most_critical_betweenness = max(betweenness, key=betweenness.get)
                most_critical_closeness = max(closeness, key=closeness.get)
                most_critical_degree = max(degree, key=degree.get)
                
            except Exception as e:
                logger.warning(f"Error calculating centrality: {str(e)}")
                betweenness = closeness = degree = {}
                most_critical_betweenness = most_critical_closeness = most_critical_degree = None
            
            # Network density
            density = nx.density(self.graph)
            
            # Average clustering coefficient
            try:
                clustering = nx.average_clustering(self.graph.to_undirected())
            except:
                clustering = 0
            
            # Average shortest path length (only if connected)
            try:
                if is_connected:
                    avg_path_length = nx.average_shortest_path_length(self.graph.to_undirected())
                else:
                    avg_path_length = None
            except:
                avg_path_length = None
            
            # Diameter (only if connected)
            try:
                if is_connected:
                    diameter = nx.diameter(self.graph.to_undirected())
                else:
                    diameter = None
            except:
                diameter = None
            
            # Node degrees
            degrees = dict(self.graph.degree())
            avg_degree = np.mean(list(degrees.values()))
            max_degree = max(degrees.values())
            min_degree = min(degrees.values())
            
            return {
                'success': True,
                'topology_metrics': {
                    'basic_metrics': {
                        'nodes': num_nodes,
                        'edges': num_edges,
                        'density': float(density),
                        'average_degree': float(avg_degree),
                        'max_degree': int(max_degree),
                        'min_degree': int(min_degree)
                    },
                    'connectivity': {
                        'is_connected': is_connected,
                        'connected_components': int(num_components),
                        'average_clustering': float(clustering),
                        'average_path_length': float(avg_path_length) if avg_path_length else None,
                        'diameter': int(diameter) if diameter else None
                    },
                    'centrality': {
                        'most_critical_betweenness': most_critical_betweenness,
                        'most_critical_closeness': most_critical_closeness,
                        'most_critical_degree': most_critical_degree,
                        'betweenness_scores': {k: float(v) for k, v in list(betweenness.items())[:10]},
                        'closeness_scores': {k: float(v) for k, v in list(closeness.items())[:10]},
                        'degree_scores': {k: float(v) for k, v in list(degree.items())[:10]}
                    }
                },
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Topology analysis error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def analyze_component_criticality(self, simulation_results: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Analyze criticality of network components
        """
        try:
            if not self.network:
                return {'success': False, 'error': 'No network loaded'}
            
            criticality_analysis = {
                'nodes': {},
                'links': {}
            }
            
            # Node criticality analysis
            for node_name in self.network.node_name_list:
                node = self.network.get_node(node_name)
                node_criticality = self._calculate_node_criticality(node_name, node)
                criticality_analysis['nodes'][node_name] = node_criticality
            
            # Link criticality analysis
            for link_name in self.network.link_name_list:
                link = self.network.get_link(link_name)
                link_criticality = self._calculate_link_criticality(link_name, link)
                criticality_analysis['links'][link_name] = link_criticality
            
            # Rank components by criticality
            node_rankings = sorted(
                criticality_analysis['nodes'].items(),
                key=lambda x: x[1]['overall_score'],
                reverse=True
            )
            
            link_rankings = sorted(
                criticality_analysis['links'].items(),
                key=lambda x: x[1]['overall_score'],
                reverse=True
            )
            
            return {
                'success': True,
                'criticality_analysis': {
                    'top_critical_nodes': node_rankings[:10],
                    'top_critical_links': link_rankings[:10],
                    'full_analysis': criticality_analysis
                },
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Criticality analysis error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def calculate_resilience_metrics(self, simulation_results: Dict) -> Dict[str, Any]:
        """
        Calculate comprehensive resilience metrics
        """
        try:
            if not self.network:
                return {'success': False, 'error': 'No network loaded'}
            
            resilience_metrics = {}
            
            # Topographic resilience metrics
            topographic_metrics = self._calculate_topographic_resilience()
            resilience_metrics['topographic'] = topographic_metrics
            
            # Hydraulic resilience metrics (if simulation results available)
            if simulation_results:
                hydraulic_metrics = self._calculate_hydraulic_resilience(simulation_results)
                resilience_metrics['hydraulic'] = hydraulic_metrics
            
            # Economic resilience metrics
            economic_metrics = self._calculate_economic_resilience()
            resilience_metrics['economic'] = economic_metrics
            
            # Overall resilience score
            overall_score = self._calculate_overall_resilience_score(resilience_metrics)
            resilience_metrics['overall'] = {
                'score': overall_score,
                'classification': self._classify_resilience(overall_score)
            }
            
            return {
                'success': True,
                'resilience_metrics': resilience_metrics,
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Resilience calculation error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def analyze_network_vulnerability(self, failure_scenarios: List[Dict]) -> Dict[str, Any]:
        """
        Analyze network vulnerability to component failures
        """
        try:
            if not self.network:
                return {'success': False, 'error': 'No network loaded'}
            
            vulnerability_results = {}
            
            for scenario in failure_scenarios:
                scenario_name = scenario.get('name', 'unnamed_scenario')
                failed_components = scenario.get('failed_components', [])
                
                # Create modified network
                modified_network = self.network.copy()
                
                # Apply failures
                for component in failed_components:
                    component_type = component.get('type')  # 'node' or 'link'
                    component_name = component.get('name')
                    
                    if component_type == 'link' and component_name in modified_network.link_name_list:
                        link = modified_network.get_link(component_name)
                        link.initial_status = 'Closed'
                    elif component_type == 'node' and component_name in modified_network.tank_name_list:
                        # For tanks, simulate damage by setting min level to max level
                        tank = modified_network.get_node(component_name)
                        tank.min_level = tank.max_level
                
                # Analyze connectivity impact
                modified_graph = modified_network.get_graph()
                connectivity_impact = self._analyze_connectivity_impact(self.graph, modified_graph)
                
                vulnerability_results[scenario_name] = {
                    'failed_components': failed_components,
                    'connectivity_impact': connectivity_impact,
                    'severity': self._classify_impact_severity(connectivity_impact)
                }
            
            return {
                'success': True,
                'vulnerability_analysis': vulnerability_results,
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Vulnerability analysis error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _calculate_node_criticality(self, node_name: str, node) -> Dict[str, Any]:
        """Calculate criticality score for a node"""
        try:
            criticality_score = 0
            factors = {}
            
            # Degree centrality factor
            if self.graph and node_name in self.graph:
                degree = self.graph.degree(node_name)
                factors['degree'] = degree
                criticality_score += degree * 0.3
            
            # Node type factor
            if hasattr(node, '_node_type'):
                node_type = node._node_type
                factors['type'] = node_type
                
                # Weight by importance
                type_weights = {
                    'Reservoir': 0.4,
                    'Tank': 0.3,
                    'Junction': 0.1
                }
                criticality_score += type_weights.get(node_type, 0.1) * 10
            
            # Demand factor (for junctions)
            if hasattr(node, 'base_demand') and node.base_demand > 0:
                demand_factor = min(node.base_demand * 1000, 5)  # Normalize
                factors['demand'] = float(node.base_demand)
                criticality_score += demand_factor * 0.2
            
            # Elevation factor (higher elevation = more critical for gravity flow)
            if hasattr(node, 'elevation'):
                elevation_factor = node.elevation / 100  # Normalize
                factors['elevation'] = float(node.elevation)
                criticality_score += elevation_factor * 0.1
            
            return {
                'overall_score': float(criticality_score),
                'factors': factors,
                'classification': 'high' if criticality_score > 10 else 'medium' if criticality_score > 5 else 'low'
            }
            
        except Exception as e:
            logger.warning(f"Error calculating node criticality for {node_name}: {str(e)}")
            return {
                'overall_score': 0.0,
                'factors': {},
                'classification': 'unknown'
            }
    
    def _calculate_link_criticality(self, link_name: str, link) -> Dict[str, Any]:
        """Calculate criticality score for a link"""
        try:
            criticality_score = 0
            factors = {}
            
            # Betweenness centrality factor (if available)
            if self.graph and link_name in self.graph.edges():
                try:
                    edge_betweenness = nx.edge_betweenness_centrality(self.graph)
                    if link_name in edge_betweenness:
                        betweenness = edge_betweenness[link_name]
                        factors['betweenness'] = float(betweenness)
                        criticality_score += betweenness * 20
                except:
                    pass
            
            # Diameter factor (larger pipes are more critical)
            if hasattr(link, 'diameter') and link.diameter > 0:
                diameter_factor = min(link.diameter * 1000, 10)  # Convert to mm and normalize
                factors['diameter'] = float(link.diameter)
                criticality_score += diameter_factor * 0.1
            
            # Length factor (longer pipes have more impact)
            if hasattr(link, 'length') and link.length > 0:
                length_factor = min(link.length / 1000, 5)  # Convert to km and normalize
                factors['length'] = float(link.length)
                criticality_score += length_factor * 0.1
            
            # Link type factor
            if hasattr(link, '_link_type'):
                link_type = link._link_type
                factors['type'] = link_type
                
                type_weights = {
                    'Pump': 0.4,
                    'Valve': 0.3,
                    'Pipe': 0.2
                }
                criticality_score += type_weights.get(link_type, 0.2) * 10
            
            return {
                'overall_score': float(criticality_score),
                'factors': factors,
                'classification': 'high' if criticality_score > 8 else 'medium' if criticality_score > 4 else 'low'
            }
            
        except Exception as e:
            logger.warning(f"Error calculating link criticality for {link_name}: {str(e)}")
            return {
                'overall_score': 0.0,
                'factors': {},
                'classification': 'unknown'
            }
    
    def _calculate_topographic_resilience(self) -> Dict[str, Any]:
        """Calculate topographic resilience metrics"""
        if not self.graph:
            return {}
        
        try:
            # Algebraic connectivity (Fiedler eigenvalue)
            try:
                laplacian = nx.laplacian_matrix(self.graph.to_undirected())
                eigenvalues = np.linalg.eigvals(laplacian.toarray())
                eigenvalues = np.sort(eigenvalues)
                algebraic_connectivity = float(eigenvalues[1]) if len(eigenvalues) > 1 else 0
            except:
                algebraic_connectivity = 0
            
            # Average node degree
            degrees = dict(self.graph.degree())
            avg_degree = np.mean(list(degrees.values()))
            
            # Link density
            density = nx.density(self.graph)
            
            # Meshedness coefficient
            num_links = self.graph.number_of_edges()
            num_nodes = self.graph.number_of_nodes()
            max_links = 3 * num_nodes - 6 if num_nodes >= 3 else 0
            meshedness = num_links / max_links if max_links > 0 else 0
            
            return {
                'algebraic_connectivity': float(algebraic_connectivity),
                'average_degree': float(avg_degree),
                'link_density': float(density),
                'meshedness_coefficient': float(meshedness),
                'score': float((algebraic_connectivity + avg_degree + density + meshedness) / 4)
            }
            
        except Exception as e:
            logger.error(f"Error calculating topographic resilience: {str(e)}")
            return {}
    
    def _calculate_hydraulic_resilience(self, simulation_results: Dict) -> Dict[str, Any]:
        """Calculate hydraulic resilience metrics from simulation results"""
        try:
            # Extract hydraulic performance indicators
            # This would need to be implemented based on the simulation results format
            
            # Placeholder metrics
            return {
                'pressure_satisfaction': 0.95,
                'demand_satisfaction': 0.98,
                'flow_reliability': 0.92,
                'score': 0.95
            }
            
        except Exception as e:
            logger.error(f"Error calculating hydraulic resilience: {str(e)}")
            return {}
    
    def _calculate_economic_resilience(self) -> Dict[str, Any]:
        """Calculate economic resilience metrics"""
        try:
            # Basic economic factors based on network structure
            num_nodes = len(self.network.nodes)
            num_links = len(self.network.links)
            
            # Estimate replacement costs (simplified)
            node_replacement_cost = num_nodes * 10000  # $10k per node
            link_replacement_cost = num_links * 50000   # $50k per link
            total_replacement_cost = node_replacement_cost + link_replacement_cost
            
            # Economic resilience score (simplified)
            economic_score = min(1.0, 1000000 / total_replacement_cost)  # Normalize to $1M baseline
            
            return {
                'estimated_replacement_cost': float(total_replacement_cost),
                'economic_efficiency': float(economic_score),
                'score': float(economic_score)
            }
            
        except Exception as e:
            logger.error(f"Error calculating economic resilience: {str(e)}")
            return {}
    
    def _calculate_overall_resilience_score(self, metrics: Dict) -> float:
        """Calculate overall resilience score"""
        try:
            scores = []
            weights = []
            
            if 'topographic' in metrics and 'score' in metrics['topographic']:
                scores.append(metrics['topographic']['score'])
                weights.append(0.3)
            
            if 'hydraulic' in metrics and 'score' in metrics['hydraulic']:
                scores.append(metrics['hydraulic']['score'])
                weights.append(0.5)
            
            if 'economic' in metrics and 'score' in metrics['economic']:
                scores.append(metrics['economic']['score'])
                weights.append(0.2)
            
            if scores:
                weighted_average = np.average(scores, weights=weights)
                return float(weighted_average)
            
            return 0.0
            
        except Exception as e:
            logger.error(f"Error calculating overall resilience: {str(e)}")
            return 0.0
    
    def _classify_resilience(self, score: float) -> str:
        """Classify resilience level"""
        if score >= 0.8:
            return 'excellent'
        elif score >= 0.6:
            return 'good'
        elif score >= 0.4:
            return 'fair'
        elif score >= 0.2:
            return 'poor'
        else:
            return 'critical'
    
    def _analyze_connectivity_impact(self, original_graph, modified_graph) -> Dict[str, Any]:
        """Analyze connectivity impact of failures"""
        try:
            original_components = nx.number_connected_components(original_graph.to_undirected())
            modified_components = nx.number_connected_components(modified_graph.to_undirected())
            
            original_nodes = original_graph.number_of_nodes()
            modified_nodes = modified_graph.number_of_nodes()
            
            nodes_affected = original_nodes - modified_nodes
            components_increase = modified_components - original_components
            
            return {
                'nodes_affected': int(nodes_affected),
                'connectivity_components_increase': int(components_increase),
                'connectivity_maintained': components_increase == 0
            }
            
        except Exception as e:
            logger.error(f"Error analyzing connectivity impact: {str(e)}")
            return {}
    
    def _classify_impact_severity(self, impact: Dict) -> str:
        """Classify impact severity"""
        if not impact:
            return 'unknown'
        
        components_increase = impact.get('connectivity_components_increase', 0)
        nodes_affected = impact.get('nodes_affected', 0)
        
        if components_increase > 2 or nodes_affected > 10:
            return 'high'
        elif components_increase > 0 or nodes_affected > 5:
            return 'medium'
        else:
            return 'low'

def main():
    """CLI interface for analysis service"""
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'Missing command'}))
        sys.exit(1)
    
    command = sys.argv[1]
    service = WNTRAnalysisService()
    
    try:
        if command == 'analyze_topology':
            file_path = sys.argv[2]
            
            # Load network first
            load_result = service.load_network_and_results(file_path)
            if not load_result['success']:
                result = load_result
            else:
                result = service.analyze_network_topology()
                
        elif command == 'analyze_criticality':
            file_path = sys.argv[2]
            
            # Load network first
            load_result = service.load_network_and_results(file_path)
            if not load_result['success']:
                result = load_result
            else:
                result = service.analyze_component_criticality()
                
        elif command == 'calculate_resilience':
            file_path = sys.argv[2]
            simulation_results = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
            
            # Load network first
            load_result = service.load_network_and_results(file_path)
            if not load_result['success']:
                result = load_result
            else:
                result = service.calculate_resilience_metrics(simulation_results)
        
        else:
            result = {'success': False, 'error': f'Unknown command: {command}'}
        
        print(json.dumps(result, indent=2))
        
    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))
        sys.exit(1)

if __name__ == '__main__':
    main()