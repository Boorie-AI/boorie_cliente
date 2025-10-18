#!/bin/bash

echo "=== Installing Python via Homebrew ==="
echo ""
echo "This script will install Python 3.11 using Homebrew to avoid macOS code signing issues."
echo ""

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    echo "Homebrew not found. Installing Homebrew first..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    # Add Homebrew to PATH for Apple Silicon Macs
    if [[ -f "/opt/homebrew/bin/brew" ]]; then
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
fi

# Install Python 3.11
echo "Installing Python 3.11..."
brew install python@3.11

# Get the Python path
if [[ -f "/opt/homebrew/bin/python3.11" ]]; then
    PYTHON_PATH="/opt/homebrew/bin/python3.11"
elif [[ -f "/usr/local/bin/python3.11" ]]; then
    PYTHON_PATH="/usr/local/bin/python3.11"
else
    echo "Error: Could not find installed Python 3.11"
    exit 1
fi

echo "Python installed at: $PYTHON_PATH"

# Create virtual environment with the new Python
echo ""
echo "Creating virtual environment..."
$PYTHON_PATH -m venv venv-wntr

# Activate and install packages
source venv-wntr/bin/activate
pip install --upgrade pip
pip install numpy scipy pandas networkx matplotlib wntr

# Update .env file
echo "PYTHON_PATH=$PWD/venv-wntr/bin/python3" > .env

echo ""
echo "=== Installation Complete! ==="
echo ""
echo "Python 3.11 has been installed via Homebrew and a virtual environment has been created."
echo "The .env file has been updated with the correct PYTHON_PATH."
echo ""
echo "Please restart your Electron application for the changes to take effect."