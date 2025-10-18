const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing Electron for development...');

// Fix database path in main.js
const mainJsPath = path.join(__dirname, 'dist/electron/main.js');
if (fs.existsSync(mainJsPath)) {
  let content = fs.readFileSync(mainJsPath, 'utf8');
  
  // Replace the initDatabase function
  const oldDb = `        // Set the database URL to use the app's user data directory
        const dbPath = path_1.default.join(electron_1.app.getPath('userData'), 'boorie.db');
        logger_1.appLogger.info('Initializing database', { dbPath });
        // Set environment variable for Prisma
        process.env.DATABASE_URL = \`file:\${dbPath}\`;
        // Generate Prisma client
        const { execSync } = require('child_process');
        execSync('npx prisma generate', { stdio: 'inherit' });
        prisma = new client_1.PrismaClient();
        // Test the connection first
        await prisma.$connect();
        // Use Prisma db push to create/update database schema automatically
        execSync('npx prisma db push', { stdio: 'inherit' });`;
  
  const newDb = `        // Set the database URL based on environment
        const isDevelopment = !electron_1.app.isPackaged;
        const dbPath = isDevelopment 
            ? path_1.default.join(__dirname, '../../prisma/xavi9.db')
            : path_1.default.join(electron_1.app.getPath('userData'), 'boorie.db');
        
        logger_1.appLogger.info('Initializing database', { dbPath, isDevelopment });
        
        // Set environment variable for Prisma
        process.env.DATABASE_URL = \`file:\${dbPath}\`;
        
        // Initialize Prisma client
        prisma = new client_1.PrismaClient();
        
        // Test the connection
        await prisma.$connect();
        
        // Only run migrations in production
        if (!isDevelopment) {
            const { execSync } = require('child_process');
            execSync('npx prisma generate', { stdio: 'inherit' });
            execSync('npx prisma db push', { stdio: 'inherit' });
        }`;
  
  content = content.replace(oldDb, newDb);
  
  fs.writeFileSync(mainJsPath, content);
  console.log('✅ Fixed database initialization');
}

console.log('✨ Electron dev fixes applied!');