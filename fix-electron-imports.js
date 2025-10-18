#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const glob = require('glob').sync;

// Files to fix
const filesToFix = [
  'dist/electron/main.js',
  'dist/electron/handlers/index.js',
  'dist/electron/handlers/conversation.handler.js',
  'dist/electron/handlers/auth.handler.js',
  'dist/electron/handlers/chat.handler.js',
  'dist/electron/handlers/database.handler.js',
  'dist/electron/handlers/hydraulic.handler.js',
  'dist/electron/handlers/rag.handler.js',
  'dist/electron/handlers/settings.handler.js',
  'dist/electron/handlers/window.handler.js',
  'dist/electron/handlers/wntr.handler.js',
  'dist/electron/services/authService.js',
  'dist/electron/services/windowService.js'
];

// Fix patterns
const fixes = [
  // Fix main.js imports
  {
    file: 'dist/electron/main.js',
    replacements: [
      { from: "require('../backend/services')", to: "require('./backend/services')" },
      { from: "require('../backend/utils/logger')", to: "require('./backend/utils/logger')" },
      { from: "from '../backend/services'", to: "from './backend/services'" },
      { from: "from '../backend/utils/logger'", to: "from './backend/utils/logger'" }
    ]
  },
  // Fix all handler files
  ...filesToFix.filter(f => f.includes('/handlers/')).map(file => ({
    file,
    replacements: [
      { from: "require('../../backend/", to: "require('../backend/" },
      { from: "from '../../backend/", to: "from '../backend/" }
    ]
  }))
];

// Apply fixes
fixes.forEach(({ file, replacements }) => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    let modified = false;
    
    replacements.forEach(({ from, to }) => {
      if (content.includes(from)) {
        content = content.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), to);
        modified = true;
        console.log(`Fixed in ${file}: ${from} -> ${to}`);
      }
    });
    
    if (modified) {
      fs.writeFileSync(file, content);
      console.log(`✓ Updated ${file}`);
    }
  } else {
    console.log(`⚠️  File not found: ${file}`);
  }
});

console.log('Import fix completed!');