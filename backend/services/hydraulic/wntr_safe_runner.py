#!/usr/bin/env python3
"""
Safe runner for WNTR operations on macOS with system Python
This script attempts to handle code signing issues by isolating imports
"""
import sys
import json
import subprocess
import os

def run_wntr_command():
    """Run WNTR command in a subprocess to avoid code signing crashes"""
    if len(sys.argv) < 3:
        print(json.dumps({
            'success': False,
            'error': 'Invalid arguments'
        }))
        return
    
    # Get the directory of this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    wntr_script = os.path.join(script_dir, 'wntrService.py')
    
    # Run the actual WNTR script as a subprocess
    try:
        # Use the same Python interpreter
        result = subprocess.run(
            [sys.executable, wntr_script] + sys.argv[1:],
            capture_output=True,
            text=True,
            env={**os.environ, 'PYTHONPATH': script_dir}
        )
        
        if result.returncode == 0:
            # Parse and return the JSON output
            try:
                output = json.loads(result.stdout)
                print(json.dumps(output))
            except json.JSONDecodeError:
                print(json.dumps({
                    'success': False,
                    'error': 'Failed to parse WNTR output',
                    'details': result.stdout
                }))
        else:
            print(json.dumps({
                'success': False,
                'error': 'WNTR script failed',
                'details': result.stderr or result.stdout
            }))
            
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e)
        }))

if __name__ == "__main__":
    run_wntr_command()