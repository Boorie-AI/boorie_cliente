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
