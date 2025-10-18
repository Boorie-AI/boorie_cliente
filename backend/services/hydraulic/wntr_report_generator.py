#!/usr/bin/env python3
"""
WNTR Report Generator
Generate comprehensive Markdown reports from WNTR simulation and analysis results
"""

import json
import sys
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
import os
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class WNTRReportGenerator:
    """
    Generate comprehensive Markdown reports from WNTR analysis results
    """
    
    def __init__(self):
        self.templates = self._load_templates()
    
    def _load_templates(self) -> Dict[str, str]:
        """Load report templates"""
        return {
            'simulation': self._get_simulation_template(),
            'analysis': self._get_analysis_template(),
            'scenario': self._get_scenario_template(),
            'resilience': self._get_resilience_template(),
            'comprehensive': self._get_comprehensive_template()
        }
    
    def generate_simulation_report(self, 
                                 project_data: Dict[str, Any],
                                 simulation_results: Dict[str, Any],
                                 output_path: Optional[str] = None) -> Dict[str, Any]:
        """
        Generate simulation report
        
        Args:
            project_data: Project information
            simulation_results: Simulation results data
            output_path: Optional output file path
        """
        try:
            template = self.templates['simulation']
            
            # Extract data for template
            project_name = project_data.get('name', 'Unnamed Project')
            network_name = project_data.get('network_file', 'Unknown Network')
            simulation_type = simulation_results.get('simulation_type', 'hydraulic')
            
            # Format simulation statistics
            stats = simulation_results.get('stats', {})
            pressure_stats = stats.get('pressure', {})
            flow_stats = stats.get('flow', {})
            velocity_stats = stats.get('velocity', {})
            
            # Generate report content
            report_content = template.format(
                project_name=project_name,
                date=datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                simulation_type=simulation_type.replace('_', ' ').title(),
                network_name=network_name,
                duration=f"{simulation_results.get('duration', 0) / 3600:.1f} hours",
                simulator=simulation_results.get('simulator', 'WNTR'),
                timesteps=simulation_results.get('timesteps', 0),
                
                # Pressure metrics
                avg_pressure=pressure_stats.get('average', 0),
                min_pressure=pressure_stats.get('minimum', 0),
                max_pressure=pressure_stats.get('maximum', 0),
                
                # Flow metrics
                avg_flow=flow_stats.get('average', 0),
                max_flow=flow_stats.get('maximum', 0),
                total_demand=flow_stats.get('total_demand', 0),
                
                # Velocity metrics
                avg_velocity=velocity_stats.get('average', 0),
                max_velocity=velocity_stats.get('maximum', 0),
                
                # Additional data
                simulation_config=self._format_simulation_config(simulation_results),
                technical_data=self._format_technical_data(simulation_results)
            )
            
            # Save report if output path provided
            if output_path:
                self._save_report(report_content, output_path)
            
            return {
                'success': True,
                'report_content': report_content,
                'report_path': output_path,
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error generating simulation report: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def generate_analysis_report(self,
                               project_data: Dict[str, Any],
                               topology_analysis: Dict[str, Any],
                               criticality_analysis: Dict[str, Any],
                               output_path: Optional[str] = None) -> Dict[str, Any]:
        """Generate network analysis report"""
        try:
            template = self.templates['analysis']
            
            project_name = project_data.get('name', 'Unnamed Project')
            
            # Extract topology metrics
            topology_metrics = topology_analysis.get('topology_metrics', {})
            basic_metrics = topology_metrics.get('basic_metrics', {})
            connectivity = topology_metrics.get('connectivity', {})
            centrality = topology_metrics.get('centrality', {})
            
            # Extract criticality data
            critical_nodes = criticality_analysis.get('criticality_analysis', {}).get('top_critical_nodes', [])
            critical_links = criticality_analysis.get('criticality_analysis', {}).get('top_critical_links', [])
            
            report_content = template.format(
                project_name=project_name,
                date=datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                
                # Basic metrics
                total_nodes=basic_metrics.get('nodes', 0),
                total_links=basic_metrics.get('edges', 0),
                network_density=basic_metrics.get('density', 0),
                avg_degree=basic_metrics.get('average_degree', 0),
                
                # Connectivity
                is_connected='Sí' if connectivity.get('is_connected', False) else 'No',
                connected_components=connectivity.get('connected_components', 0),
                clustering=connectivity.get('average_clustering', 0),
                avg_path_length=connectivity.get('average_path_length', 'N/A'),
                diameter=connectivity.get('diameter', 'N/A'),
                
                # Critical components
                top_critical_nodes=self._format_critical_components(critical_nodes[:5]),
                top_critical_links=self._format_critical_components(critical_links[:5]),
                
                # Additional analysis
                centrality_analysis=self._format_centrality_analysis(centrality),
                recommendations=self._generate_topology_recommendations(topology_metrics)
            )
            
            if output_path:
                self._save_report(report_content, output_path)
            
            return {
                'success': True,
                'report_content': report_content,
                'report_path': output_path,
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error generating analysis report: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def generate_scenario_report(self,
                               project_data: Dict[str, Any],
                               scenario_results: Dict[str, Any],
                               baseline_results: Optional[Dict[str, Any]] = None,
                               output_path: Optional[str] = None) -> Dict[str, Any]:
        """Generate disaster scenario report"""
        try:
            template = self.templates['scenario']
            
            project_name = project_data.get('name', 'Unnamed Project')
            scenario_type = scenario_results.get('scenario_type', 'unknown')
            severity = scenario_results.get('severity', 0)
            affected_components = scenario_results.get('affected_components', [])
            impact_analysis = scenario_results.get('impact_analysis', {})
            
            report_content = template.format(
                project_name=project_name,
                date=datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                
                # Scenario details
                disaster_type=scenario_type.replace('_', ' ').title(),
                severity=f"{severity * 100:.1f}%",
                affected_components=len(affected_components),
                components_list=', '.join(affected_components[:10]) + ('...' if len(affected_components) > 10 else ''),
                
                # Impact analysis
                impact_metrics=self._format_impact_metrics(impact_analysis),
                recovery_strategies=self._generate_recovery_strategies(scenario_type, impact_analysis),
                action_plan=self._generate_action_plan(scenario_type, severity, impact_analysis)
            )
            
            if output_path:
                self._save_report(report_content, output_path)
            
            return {
                'success': True,
                'report_content': report_content,
                'report_path': output_path,
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error generating scenario report: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def generate_resilience_report(self,
                                 project_data: Dict[str, Any],
                                 resilience_metrics: Dict[str, Any],
                                 output_path: Optional[str] = None) -> Dict[str, Any]:
        """Generate resilience analysis report"""
        try:
            template = self.templates['resilience']
            
            project_name = project_data.get('name', 'Unnamed Project')
            metrics = resilience_metrics.get('resilience_metrics', {})
            
            # Extract resilience scores
            topographic = metrics.get('topographic', {})
            hydraulic = metrics.get('hydraulic', {})
            economic = metrics.get('economic', {})
            overall = metrics.get('overall', {})
            
            report_content = template.format(
                project_name=project_name,
                date=datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                
                # Overall resilience
                overall_score=overall.get('score', 0),
                resilience_classification=overall.get('classification', 'unknown').title(),
                
                # Individual metrics
                topographic_metrics=self._format_topographic_metrics(topographic),
                hydraulic_metrics=self._format_hydraulic_metrics(hydraulic),
                economic_metrics=self._format_economic_metrics(economic),
                
                # Recommendations
                resilience_recommendations=self._generate_resilience_recommendations(metrics)
            )
            
            if output_path:
                self._save_report(report_content, output_path)
            
            return {
                'success': True,
                'report_content': report_content,
                'report_path': output_path,
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error generating resilience report: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def generate_comprehensive_report(self,
                                    project_data: Dict[str, Any],
                                    all_results: Dict[str, Any],
                                    output_path: Optional[str] = None) -> Dict[str, Any]:
        """Generate comprehensive report with all analyses"""
        try:
            template = self.templates['comprehensive']
            
            project_name = project_data.get('name', 'Unnamed Project')
            
            # Extract all data sections
            simulation_summary = self._create_simulation_summary(all_results.get('simulation', {}))
            analysis_summary = self._create_analysis_summary(all_results.get('analysis', {}))
            scenario_summary = self._create_scenario_summary(all_results.get('scenarios', []))
            resilience_summary = self._create_resilience_summary(all_results.get('resilience', {}))
            
            report_content = template.format(
                project_name=project_name,
                date=datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                
                # Summaries
                simulation_summary=simulation_summary,
                analysis_summary=analysis_summary,
                scenario_summary=scenario_summary,
                resilience_summary=resilience_summary,
                
                # Conclusions
                key_findings=self._generate_key_findings(all_results),
                recommendations=self._generate_comprehensive_recommendations(all_results)
            )
            
            if output_path:
                self._save_report(report_content, output_path)
            
            return {
                'success': True,
                'report_content': report_content,
                'report_path': output_path,
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error generating comprehensive report: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _save_report(self, content: str, file_path: str):
        """Save report to file"""
        try:
            # Create directory if it doesn't exist
            Path(file_path).parent.mkdir(parents=True, exist_ok=True)
            
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            
            logger.info(f"Report saved to: {file_path}")
            
        except Exception as e:
            logger.error(f"Error saving report: {str(e)}")
            raise
    
    def _format_simulation_config(self, results: Dict[str, Any]) -> str:
        """Format simulation configuration section"""
        config_items = []
        
        if 'simulation_type' in results:
            config_items.append(f"- **Tipo de simulación**: {results['simulation_type'].replace('_', ' ').title()}")
        
        if 'simulator' in results:
            config_items.append(f"- **Simulador**: {results['simulator']}")
        
        if 'duration' in results:
            duration_hours = results['duration'] / 3600
            config_items.append(f"- **Duración**: {duration_hours:.1f} horas")
        
        if 'timesteps' in results:
            config_items.append(f"- **Pasos de tiempo**: {results['timesteps']}")
        
        return '\n'.join(config_items) if config_items else "No hay información de configuración disponible."
    
    def _format_technical_data(self, results: Dict[str, Any]) -> str:
        """Format technical data section"""
        tech_data = []
        
        if 'stats' in results:
            stats = results['stats']
            tech_data.append("### Datos de Presión")
            if 'pressure' in stats:
                p = stats['pressure']
                tech_data.append(f"- Promedio: {p.get('average', 0):.2f} {p.get('unit', 'm')}")
                tech_data.append(f"- Mínimo: {p.get('minimum', 0):.2f} {p.get('unit', 'm')}")
                tech_data.append(f"- Máximo: {p.get('maximum', 0):.2f} {p.get('unit', 'm')}")
            
            tech_data.append("\n### Datos de Caudal")
            if 'flow' in stats:
                f = stats['flow']
                tech_data.append(f"- Promedio: {f.get('average', 0):.4f} {f.get('unit', 'm³/s')}")
                tech_data.append(f"- Máximo: {f.get('maximum', 0):.4f} {f.get('unit', 'm³/s')}")
                tech_data.append(f"- Demanda total: {f.get('total_demand', 0):.4f} {f.get('unit', 'm³/s')}")
        
        return '\n'.join(tech_data) if tech_data else "No hay datos técnicos disponibles."
    
    def _format_critical_components(self, components: List) -> str:
        """Format critical components list"""
        if not components:
            return "No hay componentes críticos identificados."
        
        formatted = []
        for i, (name, data) in enumerate(components, 1):
            score = data.get('overall_score', 0)
            classification = data.get('classification', 'unknown')
            formatted.append(f"{i}. **{name}** - Puntuación: {score:.2f} ({classification})")
        
        return '\n'.join(formatted)
    
    def _format_centrality_analysis(self, centrality: Dict) -> str:
        """Format centrality analysis"""
        if not centrality:
            return "No hay análisis de centralidad disponible."
        
        analysis = []
        
        if 'most_critical_betweenness' in centrality:
            analysis.append(f"- **Nodo más crítico (betweenness)**: {centrality['most_critical_betweenness']}")
        
        if 'most_critical_closeness' in centrality:
            analysis.append(f"- **Nodo más crítico (closeness)**: {centrality['most_critical_closeness']}")
        
        if 'most_critical_degree' in centrality:
            analysis.append(f"- **Nodo más crítico (degree)**: {centrality['most_critical_degree']}")
        
        return '\n'.join(analysis) if analysis else "No hay datos de centralidad disponibles."
    
    def _format_impact_metrics(self, impact: Dict) -> str:
        """Format impact metrics"""
        if not impact:
            return "No hay métricas de impacto disponibles."
        
        metrics = []
        
        if 'pressure_reduction_percent' in impact:
            metrics.append(f"- **Reducción de presión**: {impact['pressure_reduction_percent']:.1f}%")
        
        if 'flow_reduction_percent' in impact:
            metrics.append(f"- **Reducción de caudal**: {impact['flow_reduction_percent']:.1f}%")
        
        if 'demand_reduction_percent' in impact:
            metrics.append(f"- **Reducción de demanda satisfecha**: {impact['demand_reduction_percent']:.1f}%")
        
        if 'impact_severity' in impact:
            severity = impact['impact_severity']
            metrics.append(f"- **Severidad del impacto**: {severity.title()}")
        
        return '\n'.join(metrics)
    
    def _generate_topology_recommendations(self, metrics: Dict) -> str:
        """Generate topology-based recommendations"""
        recommendations = []
        
        basic = metrics.get('basic_metrics', {})
        connectivity = metrics.get('connectivity', {})
        
        density = basic.get('density', 0)
        if density < 0.1:
            recommendations.append("- Considerar aumentar la densidad de conexiones para mejorar la redundancia")
        
        is_connected = connectivity.get('is_connected', True)
        if not is_connected:
            recommendations.append("- **CRÍTICO**: La red tiene componentes desconectados que requieren atención inmediata")
        
        components = connectivity.get('connected_components', 1)
        if components > 1:
            recommendations.append(f"- La red tiene {components} componentes separados - considerar conexiones adicionales")
        
        clustering = connectivity.get('average_clustering', 0)
        if clustering < 0.3:
            recommendations.append("- Bajo coeficiente de clustering - considerar conexiones locales adicionales")
        
        return '\n'.join(recommendations) if recommendations else "- La topología de la red presenta un buen balance general"
    
    def _generate_recovery_strategies(self, scenario_type: str, impact: Dict) -> str:
        """Generate recovery strategies based on scenario"""
        strategies = []
        
        if scenario_type == 'pipe_breaks':
            strategies.extend([
                "- Implementar sistema de válvulas de aislamiento para minimizar áreas afectadas",
                "- Establecer rutas de bypass temporales",
                "- Mantener inventario de tuberías de repuesto para reparaciones rápidas"
            ])
        
        elif scenario_type == 'pump_failures':
            strategies.extend([
                "- Instalar bombas de respaldo en estaciones críticas",
                "- Implementar sistema de monitoreo en tiempo real de bombas",
                "- Establecer contratos de mantenimiento preventivo"
            ])
        
        elif scenario_type == 'power_outage':
            strategies.extend([
                "- Instalar generadores de emergencia en estaciones de bombeo críticas",
                "- Implementar sistema de almacenamiento de energía (baterías)",
                "- Desarrollar procedimientos de operación manual"
            ])
        
        elif scenario_type == 'tank_damage':
            strategies.extend([
                "- Implementar sistema de monitoreo estructural de tanques",
                "- Establecer procedimientos de aislamiento rápido",
                "- Mantener capacidad de almacenamiento distribuida"
            ])
        
        else:
            strategies.append("- Desarrollar planes específicos de respuesta basados en el tipo de escenario")
        
        return '\n'.join(strategies)
    
    def _generate_action_plan(self, scenario_type: str, severity: float, impact: Dict) -> str:
        """Generate action plan"""
        plan = []
        
        # Immediate actions (0-24 hours)
        plan.append("### Acciones Inmediatas (0-24 horas)")
        plan.append("1. Activar protocolo de emergencia")
        plan.append("2. Evaluar extensión del daño")
        plan.append("3. Implementar medidas de aislamiento")
        plan.append("4. Comunicar a usuarios afectados")
        
        # Short-term actions (1-7 days)
        plan.append("\n### Acciones a Corto Plazo (1-7 días)")
        if scenario_type in ['pipe_breaks', 'tank_damage']:
            plan.append("1. Procurar materiales de reparación")
            plan.append("2. Coordinar equipos de reparación")
            plan.append("3. Implementar suministro temporal")
        elif scenario_type in ['pump_failures', 'power_outage']:
            plan.append("1. Reparar o reemplazar equipos dañados")
            plan.append("2. Restablecer suministro eléctrico")
            plan.append("3. Verificar funcionamiento de sistemas")
        
        # Long-term actions (1+ weeks)
        plan.append("\n### Acciones a Largo Plazo (1+ semanas)")
        plan.append("1. Realizar reparaciones permanentes")
        plan.append("2. Actualizar planes de contingencia")
        plan.append("3. Implementar mejoras de resiliencia")
        plan.append("4. Capacitar personal en nuevos procedimientos")
        
        return '\n'.join(plan)
    
    def _format_topographic_metrics(self, metrics: Dict) -> str:
        """Format topographic metrics"""
        if not metrics:
            return "No hay métricas topográficas disponibles."
        
        formatted = []
        
        if 'algebraic_connectivity' in metrics:
            formatted.append(f"- **Conectividad algebraica**: {metrics['algebraic_connectivity']:.4f}")
        
        if 'average_degree' in metrics:
            formatted.append(f"- **Grado promedio**: {metrics['average_degree']:.2f}")
        
        if 'link_density' in metrics:
            formatted.append(f"- **Densidad de enlaces**: {metrics['link_density']:.4f}")
        
        if 'meshedness_coefficient' in metrics:
            formatted.append(f"- **Coeficiente de malla**: {metrics['meshedness_coefficient']:.4f}")
        
        if 'score' in metrics:
            formatted.append(f"- **Puntuación topográfica**: {metrics['score']:.3f}")
        
        return '\n'.join(formatted)
    
    def _format_hydraulic_metrics(self, metrics: Dict) -> str:
        """Format hydraulic metrics"""
        if not metrics:
            return "No hay métricas hidráulicas disponibles."
        
        formatted = []
        
        if 'pressure_satisfaction' in metrics:
            formatted.append(f"- **Satisfacción de presión**: {metrics['pressure_satisfaction']:.1%}")
        
        if 'demand_satisfaction' in metrics:
            formatted.append(f"- **Satisfacción de demanda**: {metrics['demand_satisfaction']:.1%}")
        
        if 'flow_reliability' in metrics:
            formatted.append(f"- **Confiabilidad de flujo**: {metrics['flow_reliability']:.1%}")
        
        if 'score' in metrics:
            formatted.append(f"- **Puntuación hidráulica**: {metrics['score']:.3f}")
        
        return '\n'.join(formatted)
    
    def _format_economic_metrics(self, metrics: Dict) -> str:
        """Format economic metrics"""
        if not metrics:
            return "No hay métricas económicas disponibles."
        
        formatted = []
        
        if 'estimated_replacement_cost' in metrics:
            cost = metrics['estimated_replacement_cost']
            formatted.append(f"- **Costo estimado de reemplazo**: ${cost:,.0f}")
        
        if 'economic_efficiency' in metrics:
            formatted.append(f"- **Eficiencia económica**: {metrics['economic_efficiency']:.3f}")
        
        if 'score' in metrics:
            formatted.append(f"- **Puntuación económica**: {metrics['score']:.3f}")
        
        return '\n'.join(formatted)
    
    def _generate_resilience_recommendations(self, metrics: Dict) -> str:
        """Generate resilience recommendations"""
        recommendations = []
        
        overall = metrics.get('overall', {})
        score = overall.get('score', 0)
        classification = overall.get('classification', 'unknown')
        
        if score < 0.4:
            recommendations.append("- **CRÍTICO**: La resiliencia de la red requiere mejoras inmediatas")
        elif score < 0.6:
            recommendations.append("- La resiliencia de la red necesita mejoras significativas")
        elif score < 0.8:
            recommendations.append("- La resiliencia de la red es buena pero puede optimizarse")
        else:
            recommendations.append("- La red presenta excelente resiliencia")
        
        # Specific recommendations based on individual metrics
        topographic = metrics.get('topographic', {})
        if topographic.get('score', 0) < 0.5:
            recommendations.append("- Mejorar la conectividad topológica añadiendo enlaces redundantes")
        
        hydraulic = metrics.get('hydraulic', {})
        if hydraulic.get('score', 0) < 0.5:
            recommendations.append("- Optimizar el rendimiento hidráulico del sistema")
        
        economic = metrics.get('economic', {})
        if economic.get('score', 0) < 0.5:
            recommendations.append("- Evaluar la eficiencia económica y considerar inversiones estratégicas")
        
        return '\n'.join(recommendations)
    
    def _create_simulation_summary(self, simulation_data: Dict) -> str:
        """Create simulation summary"""
        if not simulation_data:
            return "No se realizaron simulaciones."
        
        summary = ["### Resumen de Simulación"]
        
        sim_type = simulation_data.get('simulation_type', 'unknown')
        summary.append(f"- **Tipo**: {sim_type.replace('_', ' ').title()}")
        
        if 'stats' in simulation_data:
            stats = simulation_data['stats']
            if 'pressure' in stats:
                avg_pressure = stats['pressure'].get('average', 0)
                summary.append(f"- **Presión promedio**: {avg_pressure:.2f} m")
        
        return '\n'.join(summary)
    
    def _create_analysis_summary(self, analysis_data: Dict) -> str:
        """Create analysis summary"""
        if not analysis_data:
            return "No se realizó análisis de red."
        
        summary = ["### Resumen de Análisis"]
        
        if 'topology_metrics' in analysis_data:
            basic = analysis_data['topology_metrics'].get('basic_metrics', {})
            summary.append(f"- **Nodos**: {basic.get('nodes', 0)}")
            summary.append(f"- **Enlaces**: {basic.get('edges', 0)}")
            summary.append(f"- **Densidad**: {basic.get('density', 0):.4f}")
        
        return '\n'.join(summary)
    
    def _create_scenario_summary(self, scenarios_data: List) -> str:
        """Create scenarios summary"""
        if not scenarios_data:
            return "No se analizaron escenarios de desastre."
        
        summary = ["### Resumen de Escenarios"]
        summary.append(f"- **Escenarios analizados**: {len(scenarios_data)}")
        
        for scenario in scenarios_data[:3]:  # Show first 3
            scenario_type = scenario.get('scenario_type', 'unknown')
            severity = scenario.get('severity', 0)
            summary.append(f"- {scenario_type.replace('_', ' ').title()}: {severity:.1%} severidad")
        
        return '\n'.join(summary)
    
    def _create_resilience_summary(self, resilience_data: Dict) -> str:
        """Create resilience summary"""
        if not resilience_data:
            return "No se calcularon métricas de resiliencia."
        
        summary = ["### Resumen de Resiliencia"]
        
        if 'resilience_metrics' in resilience_data:
            overall = resilience_data['resilience_metrics'].get('overall', {})
            score = overall.get('score', 0)
            classification = overall.get('classification', 'unknown')
            summary.append(f"- **Puntuación general**: {score:.3f}")
            summary.append(f"- **Clasificación**: {classification.title()}")
        
        return '\n'.join(summary)
    
    def _generate_key_findings(self, all_results: Dict) -> str:
        """Generate key findings"""
        findings = []
        
        # Simulation findings
        if 'simulation' in all_results:
            findings.append("- Simulación hidráulica completada exitosamente")
        
        # Analysis findings
        if 'analysis' in all_results:
            analysis = all_results['analysis']
            if 'topology_metrics' in analysis:
                connectivity = analysis['topology_metrics'].get('connectivity', {})
                if not connectivity.get('is_connected', True):
                    findings.append("- **IMPORTANTE**: La red presenta componentes desconectados")
        
        # Resilience findings
        if 'resilience' in all_results:
            resilience = all_results['resilience']
            if 'resilience_metrics' in resilience:
                overall = resilience['resilience_metrics'].get('overall', {})
                score = overall.get('score', 0)
                if score < 0.5:
                    findings.append("- La resiliencia de la red requiere atención")
                elif score > 0.8:
                    findings.append("- La red presenta excelente resiliencia")
        
        return '\n'.join(findings) if findings else "- Análisis completado sin hallazgos críticos"
    
    def _generate_comprehensive_recommendations(self, all_results: Dict) -> str:
        """Generate comprehensive recommendations"""
        recommendations = []
        
        # Priority recommendations
        recommendations.append("### Recomendaciones Prioritarias")
        recommendations.append("1. Implementar monitoreo continuo del sistema")
        recommendations.append("2. Desarrollar planes de contingencia actualizados")
        recommendations.append("3. Realizar mantenimiento preventivo regular")
        
        # Technical recommendations
        recommendations.append("\n### Recomendaciones Técnicas")
        recommendations.append("1. Optimizar la configuración de bombas y válvulas")
        recommendations.append("2. Considerar mejoras en la redundancia del sistema")
        recommendations.append("3. Implementar sistemas de detección temprana de fallas")
        
        return '\n'.join(recommendations)
    
    def _get_simulation_template(self) -> str:
        """Get simulation report template"""
        return """# Reporte de Simulación Hidráulica - {project_name}

## Información General
- **Fecha**: {date}
- **Tipo de Simulación**: {simulation_type}
- **Red Analizada**: {network_name}
- **Duración de Simulación**: {duration}
- **Simulador**: {simulator}
- **Pasos de tiempo**: {timesteps}

## Configuración de Simulación
{simulation_config}

## Resultados Principales

### Métricas de Rendimiento
- **Presión Promedio**: {avg_pressure:.2f} m
- **Presión Mínima**: {min_pressure:.2f} m
- **Presión Máxima**: {max_pressure:.2f} m
- **Caudal Promedio**: {avg_flow:.4f} m³/s
- **Caudal Máximo**: {max_flow:.4f} m³/s
- **Demanda Total**: {total_demand:.4f} m³/s
- **Velocidad Promedio**: {avg_velocity:.3f} m/s
- **Velocidad Máxima**: {max_velocity:.3f} m/s

## Datos Técnicos Detallados
{technical_data}

## Conclusiones
- La simulación se completó exitosamente
- Los resultados muestran el comportamiento hidráulico de la red bajo las condiciones especificadas
- Se recomienda revisar los puntos de presión mínima para optimización

---
*Reporte generado automáticamente por Boorie - WNTR Analysis System*
"""
    
    def _get_analysis_template(self) -> str:
        """Get analysis report template"""
        return """# Reporte de Análisis de Red - {project_name}

## Información General
- **Fecha**: {date}
- **Red Analizada**: {project_name}

## Métricas de Topología

### Métricas Básicas
- **Total de Nodos**: {total_nodes}
- **Total de Enlaces**: {total_links}
- **Densidad de Red**: {network_density:.4f}
- **Grado Promedio**: {avg_degree:.2f}

### Análisis de Conectividad
- **Red Conectada**: {is_connected}
- **Componentes Conectados**: {connected_components}
- **Coeficiente de Clustering**: {clustering:.4f}
- **Longitud de Camino Promedio**: {avg_path_length}
- **Diámetro de Red**: {diameter}

## Análisis de Criticidad

### Componentes Críticos - Nodos
{top_critical_nodes}

### Componentes Críticos - Enlaces
{top_critical_links}

## Análisis de Centralidad
{centrality_analysis}

## Recomendaciones
{recommendations}

---
*Reporte generado automáticamente por Boorie - WNTR Analysis System*
"""
    
    def _get_scenario_template(self) -> str:
        """Get scenario report template"""
        return """# Análisis de Escenarios de Desastre - {project_name}

## Información General
- **Fecha**: {date}

## Escenario Analizado
- **Tipo de Desastre**: {disaster_type}
- **Severidad**: {severity}
- **Componentes Afectados**: {affected_components}
- **Lista de Componentes**: {components_list}

## Impacto en el Sistema
### Métricas de Impacto
{impact_metrics}

## Estrategias de Recuperación
{recovery_strategies}

## Plan de Acción Recomendado
{action_plan}

---
*Reporte generado automáticamente por Boorie - WNTR Analysis System*
"""
    
    def _get_resilience_template(self) -> str:
        """Get resilience report template"""
        return """# Análisis de Resiliencia - {project_name}

## Información General
- **Fecha**: {date}

## Resiliencia General
- **Puntuación de Resiliencia**: {overall_score:.3f}
- **Clasificación**: {resilience_classification}

## Métricas Detalladas

### Resiliencia Topográfica
{topographic_metrics}

### Resiliencia Hidráulica
{hydraulic_metrics}

### Resiliencia Económica
{economic_metrics}

## Recomendaciones para Mejorar Resiliencia
{resilience_recommendations}

---
*Reporte generado automáticamente por Boorie - WNTR Analysis System*
"""
    
    def _get_comprehensive_template(self) -> str:
        """Get comprehensive report template"""
        return """# Reporte Integral de Análisis WNTR - {project_name}

## Información General
- **Fecha**: {date}
- **Proyecto**: {project_name}

## Resumen Ejecutivo

{simulation_summary}

{analysis_summary}

{scenario_summary}

{resilience_summary}

## Hallazgos Clave
{key_findings}

## Recomendaciones Generales
{recommendations}

---
*Reporte integral generado automáticamente por Boorie - WNTR Analysis System*

*Para obtener detalles completos, consulte los reportes individuales de cada análisis.*
"""

def main():
    """CLI interface for report generator"""
    if len(sys.argv) < 3:
        print(json.dumps({'success': False, 'error': 'Usage: python wntr_report_generator.py <report_type> <data_json> [output_path]'}))
        sys.exit(1)
    
    report_type = sys.argv[1]
    data_json = sys.argv[2]
    output_path = sys.argv[3] if len(sys.argv) > 3 else None
    
    try:
        data = json.loads(data_json)
        generator = WNTRReportGenerator()
        
        project_data = data.get('project', {})
        
        if report_type == 'simulation':
            simulation_results = data.get('simulation_results', {})
            result = generator.generate_simulation_report(project_data, simulation_results, output_path)
            
        elif report_type == 'analysis':
            topology_analysis = data.get('topology_analysis', {})
            criticality_analysis = data.get('criticality_analysis', {})
            result = generator.generate_analysis_report(project_data, topology_analysis, criticality_analysis, output_path)
            
        elif report_type == 'scenario':
            scenario_results = data.get('scenario_results', {})
            baseline_results = data.get('baseline_results')
            result = generator.generate_scenario_report(project_data, scenario_results, baseline_results, output_path)
            
        elif report_type == 'resilience':
            resilience_metrics = data.get('resilience_metrics', {})
            result = generator.generate_resilience_report(project_data, resilience_metrics, output_path)
            
        elif report_type == 'comprehensive':
            all_results = data.get('all_results', {})
            result = generator.generate_comprehensive_report(project_data, all_results, output_path)
            
        else:
            result = {'success': False, 'error': f'Unknown report type: {report_type}'}
        
        print(json.dumps(result, indent=2))
        
    except json.JSONDecodeError:
        print(json.dumps({'success': False, 'error': 'Invalid JSON data'}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))
        sys.exit(1)

if __name__ == '__main__':
    main()