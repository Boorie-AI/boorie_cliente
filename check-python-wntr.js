const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Check Python environment for WNTR compatibility
 */
function checkPythonEnvironment() {
  console.log('Checking Python environment for WNTR...');
  
  // Check if .env file exists and has PYTHON_PATH
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const pythonPathMatch = envContent.match(/PYTHON_PATH=(.+)/);
    if (pythonPathMatch) {
      const pythonPath = pythonPathMatch[1].trim();
      if (fs.existsSync(pythonPath)) {
        try {
          // Test if this Python has WNTR
          execSync(`${pythonPath} -c "import wntr; import numpy; import scipy"`, { stdio: 'pipe' });
          console.log(`✓ Python environment OK: ${pythonPath}`);
          return { success: true, pythonPath };
        } catch (e) {
          console.warn(`Python at ${pythonPath} doesn't have WNTR installed`);
        }
      }
    }
  }
  
  // Try to find a suitable Python
  const possiblePaths = [
    './venv-wntr/bin/python3',
    '../venv-wntr/bin/python3',
    `${process.env.HOME}/repositorio/boorie_cliente/venv-wntr/bin/python3`,
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
  ];
  
  for (const pythonPath of possiblePaths) {
    if (fs.existsSync(pythonPath)) {
      try {
        execSync(`${pythonPath} -c "import wntr; import numpy; import scipy"`, { stdio: 'pipe' });
        console.log(`✓ Found Python with WNTR at: ${pythonPath}`);
        
        // Update .env file
        const envContent = `PYTHON_PATH=${path.resolve(pythonPath)}\n`;
        fs.writeFileSync(envPath, envContent);
        
        return { success: true, pythonPath: path.resolve(pythonPath) };
      } catch (e) {
        // Continue to next path
      }
    }
  }
  
  // No suitable Python found
  console.error('\n⚠️  WARNING: No Python environment with WNTR found!');
  console.error('\nWNTR features will not work properly.');
  console.error('\nTo fix this issue, run:');
  console.error('  ./setup-python-wntr.sh');
  console.error('\nOr manually install WNTR in a Python environment and set PYTHON_PATH in .env\n');
  
  return { success: false };
}

module.exports = { checkPythonEnvironment };

// Run check if called directly
if (require.main === module) {
  const result = checkPythonEnvironment();
  process.exit(result.success ? 0 : 1);
}