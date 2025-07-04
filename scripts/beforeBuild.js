const { execSync } = require('child_process');
const path = require('path');

exports.default = async function(context) {
  console.log('Generating Prisma client...');
  
  try {
    // Generate Prisma client
    execSync('npx prisma generate', { 
      stdio: 'inherit',
      cwd: context.projectDir 
    });
    
    console.log('Prisma client generated successfully');
  } catch (error) {
    console.error('Failed to generate Prisma client:', error);
    throw error;
  }
};