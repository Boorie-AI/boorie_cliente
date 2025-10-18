#!/bin/bash

# Setup script for WNTR Python environment
# This script creates a proper Python environment to avoid macOS code signing issues

echo "=== Boorie WNTR Python Setup ==="
echo ""

# Detect Python installation
PYTHON_CMD=""
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "Error: Python not found. Please install Python 3.8 or higher."
    exit 1
fi

echo "Found Python: $($PYTHON_CMD --version)"

# Check if we're on macOS and using system Python
if [[ "$OSTYPE" == "darwin"* ]]; then
    PYTHON_PATH=$(which $PYTHON_CMD)
    if [[ "$PYTHON_PATH" == "/usr/bin/python3" ]] || [[ "$PYTHON_PATH" == "/Library/Developer/CommandLineTools"* ]]; then
        echo ""
        echo "WARNING: You're using macOS system Python which can cause code signing issues."
        echo "It's recommended to install Python via Homebrew or use pyenv."
        echo ""
        read -p "Do you want to continue anyway? (not recommended) [y/N]: " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo ""
            echo "To install Python via Homebrew:"
            echo "  brew install python@3.11"
            echo ""
            echo "Or install pyenv:"
            echo "  brew install pyenv"
            echo "  pyenv install 3.11.0"
            echo "  pyenv global 3.11.0"
            echo ""
            exit 1
        fi
    fi
fi

# Create virtual environment
VENV_DIR="./venv-wntr"
echo ""
echo "Creating virtual environment in $VENV_DIR..."

if [ -d "$VENV_DIR" ]; then
    echo "Virtual environment already exists. Removing old one..."
    rm -rf "$VENV_DIR"
fi

$PYTHON_CMD -m venv "$VENV_DIR"

# Activate virtual environment
echo "Activating virtual environment..."
source "$VENV_DIR/bin/activate"

# Upgrade pip
echo ""
echo "Upgrading pip..."
pip install --upgrade pip

# Install required packages
echo ""
echo "Installing required packages..."
echo "This may take a few minutes..."

# Install packages one by one to better handle errors
packages=(
    "numpy>=1.20"
    "scipy>=1.7"
    "pandas>=1.3"
    "networkx>=2.6"
    "matplotlib>=3.4"
    "wntr>=0.5.0"
)

for package in "${packages[@]}"; do
    echo "Installing $package..."
    if ! pip install "$package"; then
        echo "Error: Failed to install $package"
        echo "You may need to install additional system dependencies."
        exit 1
    fi
done

echo ""
echo "Testing WNTR installation..."
if python -c "import wntr; print(f'WNTR version: {wntr.__version__}')"; then
    echo "✓ WNTR installed successfully!"
else
    echo "✗ WNTR installation test failed"
    exit 1
fi

# Create activation script
echo ""
echo "Creating activation script..."
cat > activate-wntr.sh << 'EOF'
#!/bin/bash
# Activate WNTR virtual environment for Boorie

VENV_DIR="./venv-wntr"

if [ ! -d "$VENV_DIR" ]; then
    echo "Virtual environment not found. Please run setup-python-wntr.sh first."
    exit 1
fi

source "$VENV_DIR/bin/activate"
export PYTHON_PATH="$VENV_DIR/bin/python3"

echo "WNTR environment activated!"
echo "Python path: $PYTHON_PATH"
python --version
EOF

chmod +x activate-wntr.sh

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    echo "PYTHON_PATH=$PWD/$VENV_DIR/bin/python3" > .env
else
    # Update existing .env file
    echo "Updating .env file..."
    if grep -q "PYTHON_PATH" .env; then
        # Update existing PYTHON_PATH
        sed -i.bak "s|PYTHON_PATH=.*|PYTHON_PATH=$PWD/$VENV_DIR/bin/python3|" .env
        rm .env.bak
    else
        # Add PYTHON_PATH
        echo "PYTHON_PATH=$PWD/$VENV_DIR/bin/python3" >> .env
    fi
fi

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "The WNTR Python environment has been set up successfully."
echo ""
echo "To use this environment:"
echo "1. The .env file has been updated with PYTHON_PATH"
echo "2. Or you can manually activate it: source activate-wntr.sh"
echo "3. Or set the environment variable: export PYTHON_PATH=$PWD/$VENV_DIR/bin/python3"
echo ""
echo "Your application should now use this Python environment automatically."
echo ""