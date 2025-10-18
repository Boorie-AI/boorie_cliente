const { ipcRenderer } = require('electron');

// Test Darcy-Weisbach calculation
async function testCalculator() {
  try {
    console.log('Testing Darcy-Weisbach calculation...');
    
    const result = await window.electronAPI.hydraulic.calculate('darcy-weisbach', {
      flowRate: 100,    // m³/h
      diameter: 0.2,    // m
      length: 1000,     // m
      roughness: 0.1    // mm
    });
    
    console.log('Calculation result:', result);
  } catch (error) {
    console.error('Calculation failed:', error);
  }
}

// For browser console testing
window.testCalculator = testCalculator;