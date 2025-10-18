# Engineering Calculations Guide

## 📐 Overview

Boorie provides comprehensive hydraulic engineering calculation tools with integrated AI assistance, formula libraries, and automated validation. This guide covers all calculation modules and their practical applications.

## 🌊 Hydraulic Calculations

### 1. Pipe Flow Analysis

#### Darcy-Weisbach Equation
The fundamental equation for pipe flow calculations:

```typescript
interface DarcyWeisbachParams {
  diameter: number;      // m
  length: number;        // m
  roughness: number;     // m (absolute roughness)
  flow: number;          // m³/s
  viscosity: number;     // m²/s (kinematic viscosity)
  density: number;       // kg/m³
}

const calculateFrictionLoss = (params: DarcyWeisbachParams): number => {
  const { diameter, length, roughness, flow, viscosity } = params;
  
  // Calculate velocity
  const area = Math.PI * Math.pow(diameter / 2, 2);
  const velocity = flow / area;
  
  // Calculate Reynolds number
  const reynolds = (velocity * diameter) / viscosity;
  
  // Calculate friction factor using Colebrook-White equation
  const frictionFactor = calculateFrictionFactor(reynolds, roughness / diameter);
  
  // Calculate head loss
  const headLoss = frictionFactor * (length / diameter) * (Math.pow(velocity, 2) / (2 * 9.81));
  
  return headLoss; // m
};
```

#### Friction Factor Calculation
```typescript
const calculateFrictionFactor = (reynolds: number, relativeRoughness: number): number => {
  if (reynolds < 2000) {
    // Laminar flow
    return 64 / reynolds;
  } else if (reynolds < 4000) {
    // Transition zone - use interpolation
    const laminar = 64 / 2000;
    const turbulent = calculateTurbulentFriction(4000, relativeRoughness);
    return laminar + (turbulent - laminar) * (reynolds - 2000) / 2000;
  } else {
    // Turbulent flow - Colebrook-White equation
    return calculateTurbulentFriction(reynolds, relativeRoughness);
  }
};

const calculateTurbulentFriction = (reynolds: number, relativeRoughness: number): number => {
  // Iterative solution of Colebrook-White equation
  let f = 0.02; // Initial guess
  let f_prev = 0;
  let iterations = 0;
  
  while (Math.abs(f - f_prev) > 1e-6 && iterations < 100) {
    f_prev = f;
    const term1 = relativeRoughness / 3.7;
    const term2 = 2.51 / (reynolds * Math.sqrt(f));
    f = Math.pow(-2 * Math.log10(term1 + term2), -2);
    iterations++;
  }
  
  return f;
};
```

#### Hazen-Williams Equation
Alternative method for water flow in pipes:

```typescript
interface HazenWilliamsParams {
  diameter: number;      // m
  length: number;        // m
  flow: number;          // m³/s
  cValue: number;        // Hazen-Williams C coefficient
}

const calculateHazenWilliamsLoss = (params: HazenWilliamsParams): number => {
  const { diameter, length, flow, cValue } = params;
  
  // Convert to imperial units for H-W formula
  const diameterIn = diameter * 39.37; // inches
  const lengthFt = length * 3.281;     // feet
  const flowGpm = flow * 15850.3;      // gpm
  
  // Hazen-Williams equation
  const headLossFt = 4.52 * Math.pow(flowGpm, 1.85) * lengthFt / 
                     (Math.pow(cValue, 1.85) * Math.pow(diameterIn, 4.87));
  
  // Convert back to meters
  return headLossFt * 0.3048;
};
```

### 2. Pipe Sizing Calculations

#### Diameter Sizing for Given Flow and Velocity
```typescript
interface PipeSizingParams {
  flow: number;          // m³/s
  maxVelocity: number;   // m/s
  minVelocity: number;   // m/s
  availableDiameters: number[]; // m
}

const calculateOptimalDiameter = (params: PipeSizingParams): {
  diameter: number;
  velocity: number;
  economics: EconomicAnalysis;
} => {
  const { flow, maxVelocity, minVelocity, availableDiameters } = params;
  
  // Calculate minimum diameter for velocity constraint
  const minDiameter = Math.sqrt(4 * flow / (Math.PI * maxVelocity));
  const maxDiameter = Math.sqrt(4 * flow / (Math.PI * minVelocity));
  
  // Find suitable commercial diameters
  const suitableDiameters = availableDiameters.filter(d => 
    d >= minDiameter && d <= maxDiameter
  );
  
  if (suitableDiameters.length === 0) {
    throw new Error('No suitable diameter found for given constraints');
  }
  
  // Perform economic analysis for each diameter
  const analyses = suitableDiameters.map(diameter => {
    const velocity = flow / (Math.PI * Math.pow(diameter / 2, 2));
    const economics = performEconomicAnalysis(diameter, flow, velocity);
    return { diameter, velocity, economics };
  });
  
  // Select diameter with minimum lifecycle cost
  return analyses.reduce((best, current) => 
    current.economics.lifecycleCost < best.economics.lifecycleCost ? current : best
  );
};
```

#### Economic Analysis
```typescript
interface EconomicAnalysis {
  pipelineCapitalCost: number;   // $ 
  pumpingCapitalCost: number;    // $
  annualEnergyCost: number;      // $/year
  maintenanceCost: number;       // $/year
  lifecycleCost: number;         // $ (NPV)
}

const performEconomicAnalysis = (diameter: number, flow: number, velocity: number): EconomicAnalysis => {
  const pipeLength = 1000; // m (example)
  const designLife = 50;   // years
  const discountRate = 0.05;
  const energyCost = 0.12; // $/kWh
  const pumpEfficiency = 0.8;
  
  // Pipeline costs
  const pipeCostPerMeter = calculatePipeCost(diameter);
  const pipelineCapitalCost = pipeCostPerMeter * pipeLength;
  
  // Head loss and pumping costs
  const headLoss = calculateFrictionLoss({
    diameter,
    length: pipeLength,
    roughness: 0.0015, // PVC roughness
    flow,
    viscosity: 1e-6,
    density: 1000
  });
  
  const pumpPower = (flow * 1000 * 9.81 * headLoss) / (1000 * pumpEfficiency); // kW
  const pumpCapitalCost = pumpPower * 1500; // $/kW installed
  const annualEnergyCost = pumpPower * 8760 * energyCost; // 24/7 operation
  
  // Maintenance costs (% of capital cost)
  const maintenanceCost = (pipelineCapitalCost + pumpCapitalCost) * 0.02;
  
  // Calculate NPV
  const capitalCost = pipelineCapitalCost + pumpCapitalCost;
  const annualCost = annualEnergyCost + maintenanceCost;
  const presentValueAnnualCosts = annualCost * 
    ((1 - Math.pow(1 + discountRate, -designLife)) / discountRate);
  const lifecycleCost = capitalCost + presentValueAnnualCosts;
  
  return {
    pipelineCapitalCost,
    pumpingCapitalCost,
    annualEnergyCost,
    maintenanceCost,
    lifecycleCost
  };
};
```

### 3. Pump Calculations

#### Pump Selection and Analysis
```typescript
interface PumpRequirements {
  flow: number;          // m³/s
  totalHead: number;     // m
  efficiency: number;    // decimal (0.8 = 80%)
  speed: number;         // rpm
  fluidDensity: number;  // kg/m³
}

const calculatePumpPerformance = (requirements: PumpRequirements): {
  power: number;
  npsh: number;
  affinity: AffinityLaws;
} => {
  const { flow, totalHead, efficiency, speed, fluidDensity } = requirements;
  
  // Calculate hydraulic power
  const hydraulicPower = (flow * fluidDensity * 9.81 * totalHead) / 1000; // kW
  
  // Calculate brake power (shaft power)
  const brakePower = hydraulicPower / efficiency; // kW
  
  // Calculate motor power (including motor efficiency)
  const motorEfficiency = estimateMotorEfficiency(brakePower);
  const motorPower = brakePower / motorEfficiency; // kW
  
  // Calculate NPSH requirement (estimated)
  const npshRequired = calculateNPSHRequired(flow, speed);
  
  // Affinity laws for performance prediction
  const affinity = {
    flowRatio: (newSpeed: number) => newSpeed / speed,
    headRatio: (newSpeed: number) => Math.pow(newSpeed / speed, 2),
    powerRatio: (newSpeed: number) => Math.pow(newSpeed / speed, 3)
  };
  
  return {
    power: motorPower,
    npsh: npshRequired,
    affinity
  };
};
```

#### Pump Curve Analysis
```typescript
interface PumpCurve {
  flows: number[];       // m³/s
  heads: number[];       // m
  efficiencies: number[]; // decimal
  powers: number[];      // kW
}

const analyzePumpCurve = (curve: PumpCurve, systemCurve: SystemCurve): {
  operatingPoint: OperatingPoint;
  performanceMap: PerformanceMap;
} => {
  // Find intersection of pump curve and system curve
  const operatingPoint = findIntersection(curve, systemCurve);
  
  // Generate performance map
  const performanceMap = generatePerformanceMap(curve);
  
  return { operatingPoint, performanceMap };
};

interface OperatingPoint {
  flow: number;          // m³/s
  head: number;          // m
  efficiency: number;    // decimal
  power: number;         // kW
  stable: boolean;       // operating point stability
}

const findIntersection = (pumpCurve: PumpCurve, systemCurve: SystemCurve): OperatingPoint => {
  // Interpolate curves and find intersection
  let minDifference = Infinity;
  let operatingPoint: OperatingPoint | null = null;
  
  for (let i = 0; i < pumpCurve.flows.length - 1; i++) {
    const flow = pumpCurve.flows[i];
    const pumpHead = pumpCurve.heads[i];
    const systemHead = interpolateSystemHead(systemCurve, flow);
    
    const difference = Math.abs(pumpHead - systemHead);
    if (difference < minDifference) {
      minDifference = difference;
      operatingPoint = {
        flow,
        head: pumpHead,
        efficiency: pumpCurve.efficiencies[i],
        power: pumpCurve.powers[i],
        stable: checkStability(pumpCurve, i)
      };
    }
  }
  
  return operatingPoint!;
};
```

### 4. Tank and Reservoir Calculations

#### Storage Volume Calculations
```typescript
interface StorageRequirements {
  peakDemand: number;        // m³/s
  averageDemand: number;     // m³/s
  fireFlowDemand: number;    // m³/s
  fireFlowDuration: number;  // seconds
  emergencyStorage: number;  // hours of average demand
  operationalRange: number;  // m (between min and max levels)
}

const calculateStorageVolume = (requirements: StorageRequirements): {
  totalVolume: number;
  breakdown: VolumeBreakdown;
  dimensions: TankDimensions;
} => {
  const {
    peakDemand,
    averageDemand, 
    fireFlowDemand,
    fireFlowDuration,
    emergencyStorage,
    operationalRange
  } = requirements;
  
  // Calculate volume components
  const equalizationVolume = calculateEqualizationVolume(peakDemand, averageDemand);
  const fireVolume = fireFlowDemand * fireFlowDuration;
  const emergencyVolume = averageDemand * emergencyStorage * 3600; // convert hours to seconds
  const deadVolume = calculateDeadVolume(operationalRange);
  
  const totalVolume = equalizationVolume + fireVolume + emergencyVolume + deadVolume;
  
  // Calculate optimal dimensions
  const dimensions = optimizeTankDimensions(totalVolume, operationalRange);
  
  return {
    totalVolume,
    breakdown: {
      equalization: equalizationVolume,
      fire: fireVolume,
      emergency: emergencyVolume,
      dead: deadVolume
    },
    dimensions
  };
};
```

#### Tank Hydraulics
```typescript
interface TankDimensions {
  diameter: number;      // m
  height: number;        // m
  bottomElevation: number; // m
  overflowElevation: number; // m
  minLevel: number;      // m
  maxLevel: number;      // m
}

const calculateTankHydraulics = (tank: TankDimensions, demand: number[]): {
  levels: number[];
  inflows: number[];
  outflows: number[];
  residence: number;
} => {
  const area = Math.PI * Math.pow(tank.diameter / 2, 2);
  const levels: number[] = [];
  const inflows: number[] = [];
  const outflows: number[] = [];
  
  let currentLevel = tank.maxLevel; // Start full
  
  for (let hour = 0; hour < demand.length; hour++) {
    const hourlyDemand = demand[hour];
    
    // Determine inflow based on control strategy
    const inflow = determineInflow(currentLevel, tank, hourlyDemand);
    
    // Calculate level change
    const netFlow = inflow - hourlyDemand; // m³/s
    const levelChange = (netFlow * 3600) / area; // m/hour
    
    currentLevel = Math.max(tank.minLevel, 
                   Math.min(tank.maxLevel, currentLevel + levelChange));
    
    levels.push(currentLevel);
    inflows.push(inflow);
    outflows.push(hourlyDemand);
  }
  
  // Calculate average residence time
  const averageVolume = levels.reduce((sum, level) => 
    sum + area * (level - tank.bottomElevation), 0) / levels.length;
  const averageFlow = demand.reduce((sum, flow) => sum + flow, 0) / demand.length;
  const residence = averageVolume / (averageFlow * 3600); // hours
  
  return { levels, inflows, outflows, residence };
};
```

## ⚡ Energy Calculations

### 1. Pump Energy Analysis

#### Energy Consumption
```typescript
interface EnergyAnalysis {
  dailyConsumption: number;    // kWh/day
  annualConsumption: number;   // kWh/year
  peakDemand: number;          // kW
  loadFactor: number;          // decimal
  energyCost: number;          // $/year
  demandCharges: number;       // $/year
  totalElectricityCost: number; // $/year
}

const calculatePumpEnergyConsumption = (
  pumpData: PumpPerformanceData[],
  operatingSchedule: OperatingSchedule,
  electricityRates: ElectricityRates
): EnergyAnalysis => {
  
  let totalEnergy = 0; // kWh
  let peakPower = 0;   // kW
  
  // Calculate hourly energy consumption
  for (let hour = 0; hour < 8760; hour++) { // Full year
    const schedule = operatingSchedule.getHourlySchedule(hour);
    let hourlyPower = 0;
    
    for (const pump of schedule.activePumps) {
      const speed = pump.speed; // % of rated speed
      const flow = pump.flow;   // m³/s
      
      // Calculate power using affinity laws and efficiency curves
      const power = calculateVariableSpeedPower(pump, speed, flow);
      hourlyPower += power;
    }
    
    totalEnergy += hourlyPower; // kWh (already hourly)
    peakPower = Math.max(peakPower, hourlyPower);
  }
  
  const loadFactor = totalEnergy / (peakPower * 8760);
  
  // Calculate costs
  const energyCost = calculateEnergyCost(totalEnergy, electricityRates);
  const demandCharges = calculateDemandCharges(peakPower, electricityRates);
  
  return {
    dailyConsumption: totalEnergy / 365,
    annualConsumption: totalEnergy,
    peakDemand: peakPower,
    loadFactor,
    energyCost,
    demandCharges,
    totalElectricityCost: energyCost + demandCharges
  };
};
```

#### Variable Frequency Drive (VFD) Analysis
```typescript
interface VFDAnalysis {
  energySavings: number;     // kWh/year
  costSavings: number;       // $/year
  paybackPeriod: number;     // years
  vfdEfficiency: number;     // decimal
  harmonics: HarmonicsAnalysis;
}

const analyzeVFDSavings = (
  constantSpeedOperation: EnergyAnalysis,
  variableSpeedOperation: EnergyAnalysis,
  vfdCost: number
): VFDAnalysis => {
  
  const energySavings = constantSpeedOperation.annualConsumption - 
                       variableSpeedOperation.annualConsumption;
                       
  const costSavings = constantSpeedOperation.totalElectricityCost - 
                     variableSpeedOperation.totalElectricityCost;
                     
  const paybackPeriod = vfdCost / costSavings;
  
  // VFD efficiency typically 96-98%
  const vfdEfficiency = 0.97;
  
  const harmonics = analyzeHarmonics(variableSpeedOperation);
  
  return {
    energySavings,
    costSavings,
    paybackPeriod,
    vfdEfficiency,
    harmonics
  };
};
```

### 2. System Optimization

#### Multiple Pump Optimization
```typescript
interface PumpStation {
  pumps: Pump[];
  systemCurve: SystemCurve;
  demandPattern: number[];   // hourly demands
  energyRates: ElectricityRates;
}

const optimizePumpOperation = (station: PumpStation): {
  optimalSchedule: OperatingSchedule;
  energySavings: number;
  costSavings: number;
} => {
  
  const scenarios: OperatingScenario[] = [];
  
  // Generate all possible pump combinations
  for (let hour = 0; hour < 24; hour++) {
    const demand = station.demandPattern[hour];
    const combinations = generatePumpCombinations(station.pumps, demand);
    
    // Evaluate each combination
    const evaluations = combinations.map(combo => 
      evaluatePumpCombination(combo, station.systemCurve, demand)
    );
    
    // Select most efficient combination
    const optimal = evaluations.reduce((best, current) => 
      current.efficiency > best.efficiency ? current : best
    );
    
    scenarios.push(optimal);
  }
  
  const optimalSchedule = new OperatingSchedule(scenarios);
  
  // Calculate savings compared to base case
  const baseCase = generateBaseCase(station);
  const energySavings = baseCase.energyConsumption - optimalSchedule.energyConsumption;
  const costSavings = baseCase.operatingCost - optimalSchedule.operatingCost;
  
  return {
    optimalSchedule,
    energySavings,
    costSavings
  };
};
```

## 🧪 Water Quality Calculations

### 1. Chlorine Decay

#### First-Order Decay Model
```typescript
interface ChlorineDecayParams {
  initialConcentration: number;  // mg/L
  decayCoefficient: number;      // 1/day
  time: number;                  // days
  temperature: number;           // °C
  ph: number;                    // pH units
}

const calculateChlorineDecay = (params: ChlorineDecayParams): number => {
  const { initialConcentration, decayCoefficient, time, temperature, ph } = params;
  
  // Temperature correction (Q10 = 2.5 for chlorine)
  const tempCorrectionFactor = Math.pow(2.5, (temperature - 20) / 10);
  const correctedDecayCoeff = decayCoefficient * tempCorrectionFactor;
  
  // pH correction
  const phCorrectionFactor = calculatePHCorrection(ph);
  const finalDecayCoeff = correctedDecayCoeff * phCorrectionFactor;
  
  // First-order decay equation
  const finalConcentration = initialConcentration * Math.exp(-finalDecayCoeff * time);
  
  return Math.max(0, finalConcentration); // Cannot be negative
};

const calculatePHCorrection = (ph: number): number => {
  // Chlorine decay is faster at higher pH
  const basePH = 7.0;
  const phSensitivity = 0.5;
  return Math.exp(phSensitivity * (ph - basePH));
};
```

#### Bulk and Wall Decay
```typescript
interface WaterQualityModel {
  bulkDecayCoeff: number;    // 1/day
  wallDecayCoeff: number;    // m/day
  pipeRoughness: number;     // m
  diameter: number;          // m
  velocity: number;          // m/s
}

const calculateTotalDecay = (model: WaterQualityModel): number => {
  const { bulkDecayCoeff, wallDecayCoeff, pipeRoughness, diameter, velocity } = model;
  
  // Mass transfer coefficient for wall reactions
  const reynolds = calculateReynoldsNumber(velocity, diameter, 1e-6); // water kinematic viscosity
  const schmidt = 1000; // Schmidt number for chlorine in water
  const sherwood = 0.0149 * Math.pow(reynolds, 0.88) * Math.pow(schmidt, 0.33);
  
  const massTransferCoeff = (sherwood * 1e-9) / diameter; // Chlorine diffusivity ~1e-9 m²/s
  
  // Effective wall decay coefficient
  const effectiveWallDecay = (4 * massTransferCoeff * wallDecayCoeff) / 
                            (diameter * (massTransferCoeff + wallDecayCoeff));
  
  // Total decay coefficient
  return bulkDecayCoeff + effectiveWallDecay;
};
```

### 2. Water Age Calculation

#### Age Tracking in Networks
```typescript
interface WaterAgeModel {
  sourceAges: Map<string, number>;    // hours
  mixing: boolean;                    // perfect mixing assumption
  reactions: boolean;                 // include reaction effects
}

const calculateWaterAge = (
  networkResults: NetworkResults,
  model: WaterAgeModel
): Map<string, number> => {
  
  const nodeAges = new Map<string, number>();
  
  // Initialize source ages
  model.sourceAges.forEach((age, nodeId) => {
    nodeAges.set(nodeId, age);
  });
  
  // Topological sorting for upstream-to-downstream calculation
  const sortedNodes = topologicalSort(networkResults.network);
  
  for (const nodeId of sortedNodes) {
    if (model.sourceAges.has(nodeId)) {
      continue; // Skip source nodes
    }
    
    const incomingFlows = getIncomingFlows(nodeId, networkResults);
    
    if (incomingFlows.length === 0) {
      nodeAges.set(nodeId, 0); // Isolated node
      continue;
    }
    
    if (model.mixing) {
      // Perfect mixing
      const weightedAge = incomingFlows.reduce((sum, flow) => {
        const upstreamAge = nodeAges.get(flow.fromNode) || 0;
        const travelTime = flow.pipeLength / flow.velocity / 3600; // hours
        return sum + (upstreamAge + travelTime) * flow.flowRate;
      }, 0);
      
      const totalFlow = incomingFlows.reduce((sum, flow) => sum + flow.flowRate, 0);
      const avgAge = weightedAge / totalFlow;
      
      nodeAges.set(nodeId, avgAge);
    } else {
      // First-in-first-out (FIFO)
      const oldestAge = Math.max(...incomingFlows.map(flow => {
        const upstreamAge = nodeAges.get(flow.fromNode) || 0;
        const travelTime = flow.pipeLength / flow.velocity / 3600;
        return upstreamAge + travelTime;
      }));
      
      nodeAges.set(nodeId, oldestAge);
    }
  }
  
  return nodeAges;
};
```

## 🔬 Advanced Analysis

### 1. Pressure Surge Analysis

#### Water Hammer Calculations
```typescript
interface WaterHammerParams {
  pipeLength: number;        // m
  diameter: number;          // m
  thickness: number;         // m (pipe wall)
  elasticModulus: number;    // Pa (pipe material)
  bulkModulus: number;       // Pa (water)
  initialVelocity: number;   // m/s
  finalVelocity: number;     // m/s
  closureTime: number;       // s
}

const calculateWaterHammer = (params: WaterHammerParams): {
  waveSpeed: number;
  maxPressureRise: number;
  criticalTime: number;
} => {
  const {
    pipeLength,
    diameter,
    thickness,
    elasticModulus,
    bulkModulus,
    initialVelocity,
    finalVelocity,
    closureTime
  } = params;
  
  // Calculate wave speed (celerity)
  const denominator = 1 + (bulkModulus * diameter) / (elasticModulus * thickness);
  const waveSpeed = Math.sqrt(bulkModulus / (1000 * denominator)); // m/s
  
  // Critical closure time
  const criticalTime = 2 * pipeLength / waveSpeed; // s
  
  // Velocity change
  const velocityChange = Math.abs(finalVelocity - initialVelocity);
  
  // Joukowsky equation for pressure rise
  let pressureRise: number;
  
  if (closureTime <= criticalTime) {
    // Rapid closure - full water hammer
    pressureRise = 1000 * waveSpeed * velocityChange; // Pa
  } else {
    // Slow closure - reduced effect
    const ratio = criticalTime / closureTime;
    pressureRise = 1000 * waveSpeed * velocityChange * ratio; // Pa
  }
  
  return {
    waveSpeed,
    maxPressureRise: pressureRise / 1000, // Convert to kPa
    criticalTime
  };
};
```

#### Surge Protection
```typescript
interface SurgeProtectionDevice {
  type: 'air_chamber' | 'surge_tank' | 'relief_valve' | 'check_valve';
  capacity: number;      // m³ for tanks, m³/s for valves
  setPoint: number;      // kPa (opening pressure)
  location: string;      // node ID
}

const designSurgeProtection = (
  system: HydraulicSystem,
  surgeAnalysis: WaterHammerAnalysis
): SurgeProtectionDevice[] => {
  
  const devices: SurgeProtectionDevice[] = [];
  
  // Identify critical points (high pressure rise)
  const criticalNodes = surgeAnalysis.nodes.filter(node => 
    node.pressureRise > 150 // kPa threshold
  );
  
  for (const node of criticalNodes) {
    // Determine appropriate protection device
    if (node.pressureRise > 500) {
      // Very high pressure - air chamber or surge tank
      const tankVolume = calculateRequiredTankVolume(node, system);
      devices.push({
        type: 'surge_tank',
        capacity: tankVolume,
        setPoint: node.staticPressure + 50, // kPa
        location: node.id
      });
    } else if (node.pressureRise > 200) {
      // Moderate pressure - relief valve
      const reliefCapacity = calculateReliefCapacity(node, system);
      devices.push({
        type: 'relief_valve',
        capacity: reliefCapacity,
        setPoint: node.staticPressure + 100, // kPa
        location: node.id
      });
    }
  }
  
  return devices;
};
```

### 2. Network Reliability Analysis

#### Redundancy Assessment
```typescript
interface ReliabilityAnalysis {
  criticalComponents: string[];
  redundancyLevel: number;      // 0-1 scale
  availabilityFactor: number;   // 0-1 scale
  failureImpact: Map<string, number>; // component -> affected population
}

const analyzeNetworkReliability = (network: WaterNetwork): ReliabilityAnalysis => {
  const components = [...network.pipes, ...network.pumps, ...network.valves];
  const criticalComponents: string[] = [];
  const failureImpact = new Map<string, number>();
  
  // Analyze each component failure
  for (const component of components) {
    // Simulate component failure
    const failedNetwork = simulateComponentFailure(network, component.id);
    
    // Calculate impact
    const affectedNodes = findUnservedNodes(failedNetwork);
    const affectedPopulation = calculateAffectedPopulation(affectedNodes);
    
    failureImpact.set(component.id, affectedPopulation);
    
    // Mark as critical if affects >10% of population
    if (affectedPopulation > network.totalPopulation * 0.1) {
      criticalComponents.push(component.id);
    }
  }
  
  // Calculate overall redundancy
  const redundancyLevel = calculateRedundancyLevel(network, criticalComponents);
  const availabilityFactor = calculateAvailability(network, failureImpact);
  
  return {
    criticalComponents,
    redundancyLevel,
    availabilityFactor,
    failureImpact
  };
};
```

#### Monte Carlo Reliability Simulation
```typescript
interface MonteCarloParams {
  iterations: number;
  timeHorizon: number;      // years
  componentReliability: Map<string, ReliabilityData>;
}

interface ReliabilityData {
  failureRate: number;      // failures/year
  repairTime: number;       // hours
  maintenanceInterval: number; // years
}

const runMonteCarloReliability = (
  network: WaterNetwork,
  params: MonteCarloParams
): ReliabilityResults => {
  
  const results: SimulationResult[] = [];
  
  for (let iteration = 0; iteration < params.iterations; iteration++) {
    const timeline = generateFailureTimeline(network, params);
    const serviceability = analyzeServiceability(network, timeline, params.timeHorizon);
    
    results.push({
      availability: serviceability.averageAvailability,
      unservedDemand: serviceability.totalUnservedDemand,
      maxOutageDuration: serviceability.maxOutageDuration,
      numberOfFailures: timeline.length
    });
  }
  
  // Calculate statistics
  const meanAvailability = results.reduce((sum, r) => sum + r.availability, 0) / results.length;
  const meanUnservedDemand = results.reduce((sum, r) => sum + r.unservedDemand, 0) / results.length;
  
  return {
    meanAvailability,
    meanUnservedDemand,
    confidenceInterval: calculateConfidenceInterval(results),
    riskMetrics: calculateRiskMetrics(results)
  };
};
```

## 📊 Validation and Quality Assurance

### 1. Calculation Validation

#### Cross-Validation Methods
```typescript
interface ValidationMethods {
  alternativeFormulas: boolean;    // Use different equations
  dimensionalAnalysis: boolean;    // Check units consistency
  physicalLimits: boolean;        // Verify reasonable results
  benchmarkComparison: boolean;   // Compare with known solutions
}

const validateCalculationResults = (
  calculation: CalculationResult,
  methods: ValidationMethods
): ValidationReport => {
  
  const validationResults: ValidationResult[] = [];
  
  if (methods.alternativeFormulas) {
    // Use alternative calculation method
    const alternativeResult = performAlternativeCalculation(calculation);
    const deviation = Math.abs(calculation.result - alternativeResult) / calculation.result;
    
    validationResults.push({
      method: 'alternative_formula',
      passed: deviation < 0.05, // 5% tolerance
      deviation,
      comments: `Alternative method deviation: ${(deviation * 100).toFixed(2)}%`
    });
  }
  
  if (methods.dimensionalAnalysis) {
    // Check dimensional consistency
    const dimensionCheck = checkDimensions(calculation);
    validationResults.push({
      method: 'dimensional_analysis',
      passed: dimensionCheck.consistent,
      deviation: 0,
      comments: dimensionCheck.message
    });
  }
  
  if (methods.physicalLimits) {
    // Verify physical reasonableness
    const physicalCheck = checkPhysicalLimits(calculation);
    validationResults.push({
      method: 'physical_limits',
      passed: physicalCheck.reasonable,
      deviation: 0,
      comments: physicalCheck.message
    });
  }
  
  return {
    overallPassed: validationResults.every(r => r.passed),
    results: validationResults,
    confidence: calculateConfidenceLevel(validationResults)
  };
};
```

### 2. Error Propagation

#### Uncertainty Analysis
```typescript
interface UncertaintyInput {
  parameter: string;
  nominalValue: number;
  standardDeviation: number;
  distribution: 'normal' | 'uniform' | 'triangular';
}

const performUncertaintyAnalysis = (
  calculation: HydraulicCalculation,
  uncertainInputs: UncertaintyInput[]
): UncertaintyResult => {
  
  const monteCarloSamples = 10000;
  const results: number[] = [];
  
  for (let i = 0; i < monteCarloSamples; i++) {
    // Sample from input distributions
    const sampledInputs = uncertainInputs.map(input => ({
      parameter: input.parameter,
      value: sampleFromDistribution(input)
    }));
    
    // Run calculation with sampled inputs
    const modifiedCalculation = modifyCalculationInputs(calculation, sampledInputs);
    const result = executeCalculation(modifiedCalculation);
    results.push(result);
  }
  
  // Calculate statistics
  const mean = results.reduce((sum, r) => sum + r, 0) / results.length;
  const variance = results.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (results.length - 1);
  const standardDeviation = Math.sqrt(variance);
  
  // Calculate confidence intervals
  results.sort((a, b) => a - b);
  const p5 = results[Math.floor(0.05 * results.length)];
  const p95 = results[Math.floor(0.95 * results.length)];
  
  return {
    nominalResult: calculation.result,
    meanResult: mean,
    standardDeviation,
    coefficientOfVariation: standardDeviation / mean,
    confidenceInterval90: { lower: p5, upper: p95 },
    sensitivityAnalysis: performSensitivityAnalysis(calculation, uncertainInputs)
  };
};
```

---

**Next Steps**: Explore [Regional Standards](Regional-Standards.md) to understand how these calculations apply to different regulatory frameworks and local requirements.