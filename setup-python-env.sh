#!/bin/bash

# Script to set up Python environment for WNTR
echo "Setting up Python environment for WNTR..."

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed"
    echo "Please install Python 3 using: brew install python@3.11"
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
else
    echo "Virtual environment already exists"
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip

# Install required packages
echo "Installing WNTR and dependencies..."
pip install wntr numpy

# Test installation
echo "Testing WNTR installation..."
python -c "import wntr; import numpy; print('WNTR version:', wntr.__version__); print('NumPy version:', numpy.__version__)"

echo ""
echo "Setup complete!"
echo ""
echo "To use this environment with Boorie, add this to your .bashrc, .zshrc, or set it before running the app:"
echo "export PYTHON_PATH=\"$(pwd)/venv/bin/python3\""
echo ""
echo "Or run Boorie with:"
echo "PYTHON_PATH=\"$(pwd)/venv/bin/python3\" npm run dev"