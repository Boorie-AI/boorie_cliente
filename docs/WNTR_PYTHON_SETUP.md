# WNTR Python Environment Setup

## Problem

On macOS, using the system Python (located at `/Library/Developer/CommandLineTools/...` or `/usr/bin/python3`) with third-party compiled libraries like NumPy, SciPy, and WNTR can cause code signing issues. This results in crashes with errors like:

```
Exception Type: EXC_BAD_ACCESS (SIGKILL (Code Signature Invalid))
Termination Reason: Namespace CODESIGNING, Code 2, Invalid Page
```

## Solution

The application now includes automatic Python environment detection and setup scripts to ensure WNTR works correctly without code signing issues.

### Automatic Setup (Recommended)

1. Run the setup script:
   ```bash
   ./setup-python-wntr.sh
   ```

   This script will:
   - Create a virtual environment specifically for WNTR
   - Install all required packages (numpy, scipy, pandas, networkx, matplotlib, wntr)
   - Configure the `.env` file with the correct `PYTHON_PATH`
   - Create an activation script for manual use

2. The application will automatically use this environment when you run it.

### Manual Setup

If you prefer to set up your own Python environment:

1. **Install Python** (avoid system Python on macOS):
   - Via Homebrew: `brew install python@3.11`
   - Via pyenv: `pyenv install 3.11.0`
   - Via Miniconda/Anaconda

2. **Create a virtual environment**:
   ```bash
   python3 -m venv venv-wntr
   source venv-wntr/bin/activate
   ```

3. **Install required packages**:
   ```bash
   pip install numpy scipy pandas networkx matplotlib wntr
   ```

4. **Set the Python path** in `.env` file:
   ```
   PYTHON_PATH=/path/to/your/venv-wntr/bin/python3
   ```

### Environment Variables

The application uses these environment variables:

- `PYTHON_PATH`: Path to the Python executable with WNTR installed
- `PYTHONPATH`: Automatically set to include the WNTR service directory
- `PYTHONUNBUFFERED`: Set to `1` for better output handling

### How It Works

1. **Python Path Detection**: The `wntrWrapper.ts` checks for Python in this order:
   - Environment variable `PYTHON_PATH`
   - Virtual environments in common locations
   - Homebrew Python installations
   - pyenv installations
   - Conda installations

2. **Package Verification**: The wrapper verifies that the found Python has WNTR and NumPy installed before using it.

3. **Code Signing Mitigation**: The wrapper:
   - Avoids using system Python on macOS
   - Clears `DYLD_LIBRARY_PATH` to prevent library conflicts
   - Uses proper spawn options to avoid forking issues

### Troubleshooting

#### "Python process was killed (SIGKILL)" error

This indicates you're using system Python with code signing issues. Solution:
1. Run `./setup-python-wntr.sh`
2. Restart the application

#### "No module named 'wntr'" error

The Python environment doesn't have WNTR installed. Solution:
1. Activate the correct environment
2. Run `pip install wntr`
3. Update `PYTHON_PATH` in `.env`

#### "Failed to spawn Python process" error

The Python path is incorrect or the executable doesn't exist. Solution:
1. Check the `PYTHON_PATH` in `.env`
2. Ensure the path points to a valid Python executable

### Development Tips

- Always use a virtual environment for Python packages
- Avoid using system Python on macOS for scientific computing
- Keep the `.env` file updated with the correct `PYTHON_PATH`
- Run `node check-python-wntr.js` to verify your setup

### Additional Resources

- [WNTR Documentation](https://wntr.readthedocs.io/)
- [Python Virtual Environments](https://docs.python.org/3/tutorial/venv.html)
- [macOS Code Signing](https://developer.apple.com/documentation/security/code_signing_services)