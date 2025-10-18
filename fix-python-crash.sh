#!/bin/bash

echo "=== Fixing Python Code Signature Issues ==="

# Option 1: Install Python via Homebrew (Recommended)
echo "Option 1: Install Python with Homebrew"
echo "Run these commands:"
echo "  brew install python@3.11"
echo "  python3.11 -m venv venv"
echo "  source venv/bin/activate"
echo "  pip install wntr numpy scipy pandas"

# Option 2: Use pyenv for Python management
echo ""
echo "Option 2: Install Python with pyenv"
echo "Run these commands:"
echo "  brew install pyenv"
echo "  pyenv install 3.11.0"
echo "  pyenv local 3.11.0"
echo "  python -m venv venv"
echo "  source venv/bin/activate"
echo "  pip install wntr numpy scipy pandas"

# Option 3: Disable library validation (temporary fix)
echo ""
echo "Option 3: Disable library validation (TEMPORARY - NOT RECOMMENDED FOR PRODUCTION)"
echo "Add to your shell profile:"
echo "  export DYLD_LIBRARY_PATH=/usr/local/lib"
echo "  export PYTHONDONTWRITEBYTECODE=1"

# Option 4: Re-sign the Python binary (Advanced)
echo ""
echo "Option 4: Re-sign Python binary (Advanced users only)"
echo "  sudo codesign --force --deep --sign - /Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/Python3"

echo ""
echo "After installing Python, update the WNTR service to use the correct Python path."