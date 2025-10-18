#!/usr/bin/env node
/**
 * Test para verificar que el IPC WNTR funciona correctamente
 */

const { spawn } = require('child_process');
const path = require('path');

async function testWNTRIPC() {
    console.log('🧪 TESTING WNTR IPC FUNCTIONALITY');
    console.log('=' * 50);
    
    // Simular los handlers IPC de Electron
    const testHandlers = async () => {
        try {
            // Importar el wrapper WNTR
            const { wntrWrapper } = require('./dist/electron/backend/services/hydraulic/wntrWrapper.js');
            
            console.log('\n1️⃣  TESTING FILE LOADING');
            
            // Probar carga de archivo
            const testFile = './data/Net1v3.inp';
            console.log(`📁 Loading file: ${testFile}`);
            
            const loadResult = await wntrWrapper.loadINPFile(testFile);
            
            if (loadResult.success) {
                console.log('✅ File loaded successfully');
                const data = loadResult.data;
                console.log(`📊 Network summary:`);
                console.log(`   - Nodes: ${data.nodes.length} (${data.summary.junctions}J, ${data.summary.tanks}T, ${data.summary.reservoirs}R)`);
                console.log(`   - Links: ${data.links.length} (${data.summary.pipes}P, ${data.summary.pumps}B, ${data.summary.valves}V)`);
                
                // Verificar coordenadas
                const nodesWithCoords = data.nodes.filter(n => n.x !== 0 || n.y !== 0);
                console.log(`   - Nodes with coordinates: ${nodesWithCoords.length}/${data.nodes.length}`);
                
                console.log('\n2️⃣  TESTING SIMULATION');
                
                // Probar simulación
                const simResult = await wntrWrapper.runSimulation(testFile, 'single');
                
                if (simResult.success) {
                    console.log('✅ Simulation successful');
                    const simData = simResult.data;
                    console.log(`📊 Simulation results:`);
                    console.log(`   - Node results: ${Object.keys(simData.node_results).length}`);
                    console.log(`   - Link results: ${Object.keys(simData.link_results).length}`);
                    
                    // Mostrar ejemplo de resultados
                    const firstNode = Object.keys(simData.node_results)[0];
                    const firstNodeData = simData.node_results[firstNode];
                    console.log(`   - Example node '${firstNode}': pressure=${firstNodeData.pressure?.toFixed(2)}, demand=${firstNodeData.demand?.toFixed(3)}`);
                    
                    console.log('\n✅ IPC FUNCTIONALITY CONFIRMED');
                    console.log('🎯 BOTH LOADING AND SIMULATION WORK');
                    console.log('\n💡 If UI still not working, check:');
                    console.log('   1. Data flow from IPC to React components');
                    console.log('   2. WNTRMainInterface state management');
                    console.log('   3. Canvas rendering in WNTRNetworkVisualization');
                    
                } else {
                    console.log(`❌ Simulation failed: ${simResult.error}`);
                }
                
            } else {
                console.log(`❌ File loading failed: ${loadResult.error}`);
            }
            
        } catch (error) {
            console.error('❌ Error testing IPC:', error.message);
        }
    };
    
    await testHandlers();
}

testWNTRIPC().catch(console.error);