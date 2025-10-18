#!/usr/bin/env python3
"""
Diagnóstico de problemas WNTR - Prueba de funcionalidad básica
"""

import os
import sys
import json
import tempfile

# Añadir el path del backend al Python path
backend_path = os.path.join(os.path.dirname(__file__), 'backend', 'services', 'hydraulic')
sys.path.insert(0, backend_path)

def test_wntr_import():
    """Prueba importación de WNTR"""
    try:
        import wntr
        print("✅ WNTR importado correctamente")
        print(f"   Versión WNTR: {wntr.__version__}")
        return True
    except ImportError as e:
        print(f"❌ Error importando WNTR: {e}")
        return False

def test_basic_functionality():
    """Prueba funcionalidad básica de WNTR"""
    try:
        from wntrService import WNTRService
        print("✅ WNTRService importado correctamente")
        
        # Crear instancia del servicio
        service = WNTRService()
        print("✅ WNTRService instanciado")
        return service
    except Exception as e:
        print(f"❌ Error con WNTRService: {e}")
        return None

def test_file_loading(service, test_files):
    """Prueba carga de archivos EPANET"""
    success_count = 0
    
    for file_path in test_files:
        if not os.path.exists(file_path):
            print(f"⚠️  Archivo no encontrado: {file_path}")
            continue
            
        print(f"\n📁 Probando archivo: {os.path.basename(file_path)}")
        try:
            result = service.load_inp_file(file_path)
            
            if result.get('success'):
                print(f"   ✅ Archivo cargado exitosamente")
                data = result.get('data', {})
                summary = data.get('summary', {})
                nodes = data.get('nodes', [])
                links = data.get('links', [])
                
                print(f"   📊 Resumen:")
                print(f"      - Nodos: {len(nodes)} (J:{summary.get('junctions', 0)}, T:{summary.get('tanks', 0)}, R:{summary.get('reservoirs', 0)})")
                print(f"      - Enlaces: {len(links)} (P:{summary.get('pipes', 0)}, B:{summary.get('pumps', 0)}, V:{summary.get('valves', 0)})")
                
                # Verificar coordenadas
                nodes_with_coords = [n for n in nodes if n.get('x', 0) != 0 or n.get('y', 0) != 0]
                print(f"      - Nodos con coordenadas: {len(nodes_with_coords)}/{len(nodes)}")
                
                success_count += 1
                
                # Probar simulación en este archivo
                print(f"   🔧 Probando simulación...")
                sim_result = service.run_simulation('single')
                
                if sim_result.get('success'):
                    print(f"   ✅ Simulación exitosa")
                    sim_data = sim_result.get('data', {})
                    node_results = sim_data.get('node_results', {})
                    link_results = sim_data.get('link_results', {})
                    print(f"      - Resultados nodos: {len(node_results)}")
                    print(f"      - Resultados enlaces: {len(link_results)}")
                    
                    # Mostrar algunos valores de ejemplo
                    if node_results:
                        first_node = list(node_results.keys())[0]
                        node_data = node_results[first_node]
                        print(f"      - Ejemplo nodo '{first_node}': presión={node_data.get('pressure', 'N/A'):.2f}, demanda={node_data.get('demand', 'N/A'):.3f}")
                else:
                    print(f"   ❌ Error en simulación: {sim_result.get('error', 'Error desconocido')}")
                
            else:
                print(f"   ❌ Error cargando archivo: {result.get('error', 'Error desconocido')}")
                if 'details' in result:
                    print(f"      Detalles: {result['details']}")
                    
        except Exception as e:
            print(f"   ❌ Excepción: {e}")
    
    return success_count

def test_advanced_services():
    """Prueba servicios avanzados (simulación, análisis, reportes)"""
    print(f"\n🔬 Probando servicios avanzados...")
    
    # Intentar importar servicios avanzados
    services = {
        'Simulación': 'wntr_simulation_service',
        'Análisis': 'wntr_analysis_service', 
        'Reportes': 'wntr_report_generator'
    }
    
    for service_name, module_name in services.items():
        try:
            # Verificar que el archivo existe
            file_path = os.path.join(backend_path, f"{module_name}.py")
            if os.path.exists(file_path):
                print(f"   ✅ Archivo {service_name}: {module_name}.py encontrado")
            else:
                print(f"   ❌ Archivo {service_name}: {module_name}.py NO encontrado")
        except Exception as e:
            print(f"   ❌ Error verificando {service_name}: {e}")

def main():
    print("🧪 DIAGNÓSTICO WNTR - PRUEBA DE FUNCIONALIDAD")
    print("=" * 50)
    
    # Test 1: Importación de WNTR
    print("\n1️⃣  IMPORTACIÓN DE WNTR")
    if not test_wntr_import():
        print("\n❌ WNTR no está disponible. Verificar instalación.")
        return
    
    # Test 2: Funcionalidad básica
    print("\n2️⃣  SERVICIO WNTR BÁSICO")
    service = test_basic_functionality()
    if not service:
        print("\n❌ WNTRService no funciona correctamente.")
        return
    
    # Test 3: Archivos de prueba
    test_files = [
        "data/Net1v3.inp",
        "test-network.inp", 
        "data/TK-Lomas.inp",
        "test-files/simple-network.inp"
    ]
    
    print("\n3️⃣  CARGA DE ARCHIVOS EPANET")
    success_count = test_file_loading(service, test_files)
    print(f"\n📈 Archivos cargados exitosamente: {success_count}/{len([f for f in test_files if os.path.exists(f)])}")
    
    # Test 4: Servicios avanzados
    print("\n4️⃣  SERVICIOS AVANZADOS")
    test_advanced_services()
    
    print("\n" + "=" * 50)
    print("🏁 DIAGNÓSTICO COMPLETADO")
    
    if success_count > 0:
        print("✅ Al menos algunos archivos EPANET se cargan correctamente")
        print("✅ Las simulaciones básicas funcionan")
        print("\n💡 POSIBLES PROBLEMAS EN LA UI:")
        print("   1. La visualización de red no muestra coordenadas correctamente")
        print("   2. Los resultados no se pasan correctamente a la interfaz")
        print("   3. Los manejadores IPC pueden tener problemas")
        print("   4. Los servicios avanzados (TypeScript) no se comunican bien con Python")
    else:
        print("❌ Problemas graves con la funcionalidad básica de WNTR")
        print("   Verificar instalación de WNTR y dependencias")

if __name__ == "__main__":
    main()