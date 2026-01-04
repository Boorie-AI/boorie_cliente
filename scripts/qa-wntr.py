
"""
QA Script for WNTR functionality in Boorie
This script tests all python microservices for hydraulic analysis:
1. wntr_analysis_service.py (Topology, Criticality, Resilience)
2. wntr_simulation_service.py (Hydraulic Simulation)
"""
import sys
import os
import json
import subprocess
import time

# Configuration
DIST_PATH = "./dist/backend/services/hydraulic"
FILES_TO_TEST = [
    "wntr_analysis_service.py",
    "wntr_simulation_service.py"
]

# Defines a test case with inputs and expected output checks
class TestCase:
    def __init__(self, service_file, command, inp_file, options=None, expected_keys=None):
        self.service_file = service_file
        self.command = command
        self.inp_file = inp_file
        self.options = options
        self.expected_keys = expected_keys or []

def run_test(test_case):
    print(f"\n--- Testing {test_case.command} on {test_case.service_file} ---")
    
    script_path = os.path.join(DIST_PATH, test_case.service_file)
    if not os.path.exists(script_path):
        print(f"❌ FAIL: Script not found at {script_path}")
        return False

    # Check if INP file exists
    if not os.path.exists(test_case.inp_file):
        print(f"❌ FAIL: Test INP file not found at {test_case.inp_file}")
        # Try to find a valid .inp file in data/ or current directory
        # This is just a helper for the user to know which file was missing
        return False

    python_executable = "python3"
    venv_python = "./venv-wntr/bin/python3"
    if os.path.exists(venv_python):
        python_executable = venv_python
    
    args = [python_executable, script_path, test_case.command, test_case.inp_file]
    if test_case.options:
        args.append(json.dumps(test_case.options))

    # Prepare environment to avoid macOS code signing issues with EPANET
    env = os.environ.copy()
    env["DYLD_LIBRARY_PATH"] = ""
    env["PYTHONUNBUFFERED"] = "1"
    # Also ensure we use the venv paths if applicable
    if "venv" in args[0]:
         # Simple heuristic: add venv/bin to path
         venv_bin = os.path.dirname(args[0])
         env["PATH"] = f"{venv_bin}:{env.get('PATH', '')}"

    start_time = time.time()
    try:
        result = subprocess.run(args, capture_output=True, text=True, env=env)
        duration = time.time() - start_time
    except Exception as e:
        print(f"❌ FAIL: Execution error: {e}")
        return False

    if result.returncode != 0:
        print(f"❌ FAIL: Process exited with code {result.returncode}")
        print("Stderr:", result.stderr)
        return False

    # Check for suppression of warnings (simple check: stdout should be just JSON)
    stdout = result.stdout.strip()
    if not stdout:
        print("❌ FAIL: No output received")
        return False
        
    try:
        # Should be pure JSON
        data = json.loads(stdout)
    except json.JSONDecodeError:
        print("❌ FAIL: Output is not valid JSON")
        print("Output start:", stdout[:100])
        return False

    if not data.get("success"):
        print(f"❌ FAIL: Service reported failure: {data.get('error')}")
        return False
        
    # Verify expected structure
    result_data = data.get("data", {})
    missing_keys = [k for k in test_case.expected_keys if k not in result_data]
    
    if missing_keys:
        print(f"❌ FAIL: Missing expected keys in data: {missing_keys}")
        return False

    print(f"✅ PASS ({duration:.2f}s)")
    return True

def main():
    # Find a suitable INP file to test against
    potential_files = [
        "data/TK-Lomas.inp", 
        "data/TK_Lomas2.inp", 
        "data/SoloChamiseroMedioConPatronComercial-07p1.inp"
    ]
    
    test_file = None
    if len(sys.argv) > 1:
        test_file = sys.argv[1]
        if not os.path.exists(test_file):
            print(f"⚠️ Specified output file {test_file} not found.")
            test_file = None

    if not test_file:
        for f in potential_files:
            if os.path.exists(f):
                test_file = f
                break
            
    if not test_file:
        print("⚠️ No input file found for testing. Please ensure 'data/TK-Lomas.inp' or similar exists.")
        sys.exit(1)
        
    print(f"Using test file: {test_file}")

    tests = [
        # Topology Analysis
        TestCase(
            "wntr_analysis_service.py", 
            "analyze_topology", 
            test_file,
            expected_keys=["topology_metrics"]
        ),
        # Criticality Analysis
        TestCase(
            "wntr_analysis_service.py", 
            "analyze_criticality", 
            test_file,
            options={"min_pressure": 15},
            expected_keys=["criticality_analysis"]
        ),
        # Resilience Analysis
        TestCase(
            "wntr_analysis_service.py", 
            "calculate_resilience", 
            test_file,
            expected_keys=["resilience_metrics"]
        ),
        # Hydraulic Simulation
        TestCase(
            "wntr_simulation_service.py", 
            "run_hydraulic", 
            test_file,
            options={"duration": 24, "timestep": 1},
            expected_keys=["node_results", "timestamps"]
        ),
        # Water Quality Simulation
        TestCase(
            "wntr_simulation_service.py", 
            "run_water_quality", 
            test_file,
            options={"duration": 24, "timestep": 1, "parameter": "age"},
            expected_keys=["node_results", "timestamps"]
        ),
        # Scenario Simulation
        TestCase(
            "wntr_simulation_service.py", 
            "run_scenario", 
            test_file,
            options={"duration": 24, "scenario_type": "pipe_closure", "components": []},
            expected_keys=["node_results", "timestamps"]
        ),
    ]

    passed = 0
    for test in tests:
        if run_test(test):
            passed += 1
            
    print(f"\nSUMMARY: {passed}/{len(tests)} tests passed.")
    if passed == len(tests):
        print("🚀 All WNTR services are functional!")
    else:
        print("⚠️ Some services failed. Check logs above.")
        sys.exit(1)

if __name__ == "__main__":
    main()
