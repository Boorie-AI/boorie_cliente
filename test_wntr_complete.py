#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend/services/hydraulic'))

from wntrService import wntr_service

# Test with different files
test_files = [
    'data/Net1v3.inp',
    'data/TK-Lomas.inp',
    'data/TK_Lomas2.inp',
    'test-network.inp'
]

for test_file in test_files:
    if os.path.exists(test_file):
        print(f"\n{'='*60}")
        print(f"Testing file: {test_file}")
        print(f"{'='*60}")
        
        try:
            result = wntr_service.load_inp_file(test_file)
            if result['success']:
                data = result['data']
                print(f"✓ Successfully loaded!")
                print(f"  Name: {data['name']}")
                print(f"  Nodes: {data['summary']['junctions'] + data['summary']['tanks'] + data['summary']['reservoirs']}")
                print(f"  Links: {data['summary']['pipes'] + data['summary']['pumps'] + data['summary']['valves']}")
            else:
                print(f"✗ Failed to load: {result['error']}")
                if 'details' in result:
                    print(f"  Details: {result['details']}")
        except Exception as e:
            print(f"✗ Exception: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
    else:
        print(f"\nFile not found: {test_file}")