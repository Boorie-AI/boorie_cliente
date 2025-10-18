#!/bin/bash

# Quick script to run Boorie with WNTR-enabled Python

echo "🚀 Running Boorie with WNTR-enabled Python..."
echo ""

# Set Python path to the existing virtual environment with WNTR
export PYTHON_PATH="/Users/islacreativa/repositorio/uruguay_wihisper/venv/bin/python3"

echo "Using Python: $PYTHON_PATH"
echo ""

# Run the development environment
npm run dev