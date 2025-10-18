#!/usr/bin/env python3
"""
Script de prueba para verificar la funcionalidad WNTR
"""

import os
import sys
import json
from pathlib import Path

# Añadir el directorio de servicios al path
backend_path = Path(__file__).parent / 'backend' / 'services' / 'hydraulic'
sys.path.insert(0, str(backend_path))

try:
    from wntrService import WNTRService
    print("✓ WNTRService importado correctamente")
except ImportError as e:
    print(f"✗ Error al importar WNTRService: {e}")
    sys.exit(1)

def test_load_file(file_path):
    """Prueba cargar un archivo INP"""
    print(f"\n=== Probando carga de archivo: {file_path} ===")
    
    service = WNTRService()
    
    try:
        result = service.load_inp_file(file_path)
        
        if result['success']:
            print(f"✓ Archivo cargado exitosamente")
            print(f"  - Nombre: {result['data']['name']}")
            print(f"  - Nodos: {result['data']['summary']['junctions']} junctions, "
                  f"{result['data']['summary']['tanks']} tanks, "
                  f"{result['data']['summary']['reservoirs']} reservoirs")
            print(f"  - Enlaces: {result['data']['summary']['pipes']} pipes, "
                  f"{result['data']['summary']['pumps']} pumps, "
                  f"{result['data']['summary']['valves']} valves")
            
            # Verificar sistema de coordenadas
            coord_info = result['data'].get('coordinate_system', {})
            print(f"  - Sistema de coordenadas: {coord_info.get('type', 'unknown')}")
            if coord_info.get('type') == 'projected':
                center_x = coord_info.get('center_x')
                center_y = coord_info.get('center_y')
                coord_range = coord_info.get('range')
                
                if center_x is not None and center_y is not None:
                    print(f"    - Centro estimado: ({center_x:.2f}, {center_y:.2f})")
                if coord_range is not None:
                    print(f"    - Rango: {coord_range:.2f} unidades")
            
            return result['data']
        else:
            print(f"✗ Error al cargar archivo: {result['error']}")
            return None
            
    except Exception as e:
        import traceback
        print(f"✗ Excepción al cargar archivo: {e}")
        print(f"   Traceback: {traceback.format_exc()}")
        return None

def test_simulation(network_data):
    """Prueba ejecutar una simulación"""
    print(f"\n=== Probando simulación ===")
    
    if not network_data:
        print("✗ No hay datos de red para simular")
        return None
    
    service = WNTRService()
    
    try:
        # Simulación extendida para obtener series temporales
        result = service.run_simulation({'simulationType': 'extended'})
        
        if result['success']:
            print(f"✓ Simulación completada exitosamente")
            sim_data = result['data']
            
            # Verificar timestamps
            if 'timestamps' in sim_data:
                print(f"  - Pasos de tiempo: {len(sim_data['timestamps'])}")
                print(f"  - Duración: {sim_data['timestamps'][0]} a {sim_data['timestamps'][-1]} horas")
            
            # Verificar resultados de nodos
            if 'node_results' in sim_data:
                node_count = len(sim_data['node_results'])
                print(f"  - Resultados para {node_count} nodos")
                
                # Mostrar ejemplo de un nodo
                first_node = list(sim_data['node_results'].keys())[0]
                node_data = sim_data['node_results'][first_node]
                print(f"  - Ejemplo nodo '{first_node}':")
                if 'pressure' in node_data:
                    avg_pressure = sum(node_data['pressure']) / len(node_data['pressure'])
                    print(f"    - Presión promedio: {avg_pressure:.2f} m")
                
            # Verificar resultados de enlaces
            if 'link_results' in sim_data:
                link_count = len(sim_data['link_results'])
                print(f"  - Resultados para {link_count} enlaces")
                
            return sim_data
        else:
            print(f"✗ Error en simulación: {result['error']}")
            return None
            
    except Exception as e:
        print(f"✗ Excepción durante simulación: {e}")
        return None

def test_connectivity():
    """Prueba el análisis de conectividad"""
    print(f"\n=== Probando análisis de conectividad ===")
    
    service = WNTRService()
    
    try:
        result = service.analyze_connectivity()
        
        if result['success']:
            print(f"✓ Análisis de conectividad completado")
            conn_data = result['data']
            
            print(f"  - Nodos desconectados: {conn_data.get('disconnected_nodes', 0)}")
            print(f"  - Enlaces desconectados: {conn_data.get('disconnected_links', 0)}")
            
            return conn_data
        else:
            print(f"✗ Error en análisis: {result['error']}")
            return None
            
    except Exception as e:
        print(f"✗ Excepción durante análisis: {e}")
        return None

def main():
    """Función principal de pruebas"""
    print("=== PRUEBAS DE FUNCIONALIDAD WNTR ===")
    
    # Archivos de prueba
    test_files = [
        "test-files/simple-network.inp",
        "test-files/utm-network.inp",
        # Puedes añadir la ruta a TK_Lomas.inp si la tienes
    ]
    
    for file_path in test_files:
        if not os.path.exists(file_path):
            print(f"\n✗ Archivo no encontrado: {file_path}")
            continue
            
        # Cargar archivo
        network_data = test_load_file(file_path)
        
        if network_data:
            # Ejecutar simulación
            simulation_data = test_simulation(network_data)
            
            # Analizar conectividad
            connectivity_data = test_connectivity()
            
            # Guardar resultados para inspección
            output_file = file_path.replace('.inp', '_test_results.json')
            test_results = {
                'network': network_data,
                'simulation': simulation_data is not None,
                'connectivity': connectivity_data is not None
            }
            
            with open(output_file, 'w') as f:
                json.dump(test_results, f, indent=2, default=str)
            print(f"\n✓ Resultados guardados en: {output_file}")
    
    print("\n=== PRUEBAS COMPLETADAS ===")

if __name__ == "__main__":
    main()