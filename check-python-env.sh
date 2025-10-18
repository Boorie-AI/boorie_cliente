#!/bin/bash

echo "=== Python Environment Check ==="
echo ""

# Check available Python installations
echo "Available Python installations:"
echo "------------------------------"

# Check common Python locations
locations=(
    "/opt/homebrew/bin/python3"
    "/usr/local/bin/python3"
    "$HOME/.pyenv/shims/python3"
    "/usr/bin/python3"
    "$(which python3 2>/dev/null)"
)

for loc in "${locations[@]}"; do
    if [ -f "$loc" ] && [ -x "$loc" ]; then
        echo "✓ Found: $loc"
        echo "  Version: $($loc --version 2>&1)"
        # Check if it's signed
        codesign -v "$loc" 2>&1 | sed 's/^/  /'
        echo ""
    fi
done

# Check current Python
echo ""
echo "Current Python (python3):"
echo "------------------------"
which python3
python3 --version

# Check if we can import the problem libraries
echo ""
echo "Testing problematic imports:"
echo "---------------------------"
python3 -c "
import sys
print(f'Python executable: {sys.executable}')
print(f'Python version: {sys.version}')
print()

try:
    import numpy
    print('✓ numpy imported successfully')
except Exception as e:
    print(f'✗ numpy import failed: {e}')

try:
    import scipy
    print('✓ scipy imported successfully')
except Exception as e:
    print(f'✗ scipy import failed: {e}')

try:
    import wntr
    print('✓ wntr imported successfully')
except Exception as e:
    print(f'✗ wntr import failed: {e}')
"

echo ""
echo "Recommendations:"
echo "---------------"
echo "1. Install Python via Homebrew: brew install python@3.11"
echo "2. Create a new virtual environment with the Homebrew Python"
echo "3. Set PYTHON_PATH environment variable to the correct Python"
echo ""
echo "Example:"
echo "  export PYTHON_PATH=/opt/homebrew/bin/python3"
echo "  npm run dev"