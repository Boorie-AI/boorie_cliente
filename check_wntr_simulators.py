#!/usr/bin/env python3
"""Check available WNTR simulators and test with different headloss formulas"""
import wntr
import os

print("=== WNTR Simulator Check ===")
print(f"WNTR version: {wntr.__version__}")

# Check if EPANET is available
try:
    import wntr.sim.epanet
    print("✓ EPANET module available")
    
    # Check for EPANET binary
    epanet_path = wntr.epanet.io._get_epanet_path()
    if epanet_path and os.path.exists(epanet_path):
        print(f"✓ EPANET binary found at: {epanet_path}")
    else:
        print("✗ EPANET binary not found")
except Exception as e:
    print(f"✗ EPANET module error: {e}")

# Test with different INP files
test_files = [
    'data/Net1v3.inp',
    'data/TK-Lomas.inp',
    'data/TK_Lomas2.inp'
]

for test_file in test_files:
    if os.path.exists(test_file):
        print(f"\n=== Testing {test_file} ===")
        try:
            wn = wntr.network.WaterNetworkModel(test_file)
            print(f"Model loaded: {len(wn.node_name_list)} nodes, {len(wn.link_name_list)} links")
            print(f"Headloss formula: {wn.options.hydraulic.headloss}")
            
            # Test WNTR simulator
            try:
                sim = wntr.sim.WNTRSimulator(wn)
                results = sim.run_sim()
                print("✓ WNTR simulator: SUCCESS")
            except Exception as e:
                print(f"✗ WNTR simulator: {e}")
            
            # Test EPANET simulator
            try:
                sim = wntr.sim.EpanetSimulator(wn)
                results = sim.run_sim()
                print("✓ EPANET simulator: SUCCESS")
            except Exception as e:
                print(f"✗ EPANET simulator: {e}")
                
        except Exception as e:
            print(f"Error loading model: {e}")