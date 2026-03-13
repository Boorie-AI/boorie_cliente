# Guía de Cálculos de Ingeniería

## Descripción General

Boorie proporciona herramientas completas de cálculo de ingeniería hidráulica con asistencia AI integrada, bibliotecas de fórmulas y validación automatizada. Esta guía cubre todos los módulos de cálculo y sus aplicaciones prácticas.

## Cálculos Hidráulicos

### 1. Análisis de Flujo en Tuberías

#### Ecuación de Darcy-Weisbach
La ecuación fundamental para cálculos de flujo en tuberías:

```typescript
interface DarcyWeisbachParams {
  diameter: number;      // m
  length: number;        // m
  roughness: number;     // m (rugosidad absoluta)
  flow: number;          // m³/s
  viscosity: number;     // m²/s (viscosidad cinemática)
  density: number;       // kg/m³
}

const calculateFrictionLoss = (params: DarcyWeisbachParams): number => {
  const { diameter, length, roughness, flow, viscosity } = params;

  // Calcular velocidad
  const area = Math.PI * Math.pow(diameter / 2, 2);
  const velocity = flow / area;

  // Calcular número de Reynolds
  const reynolds = (velocity * diameter) / viscosity;

  // Calcular factor de fricción usando ecuación de Colebrook-White
  const frictionFactor = calculateFrictionFactor(reynolds, roughness / diameter);

  // Calcular pérdida de carga
  const headLoss = frictionFactor * (length / diameter) * (Math.pow(velocity, 2) / (2 * 9.81));

  return headLoss; // m
};
```

#### Cálculo del Factor de Fricción
```typescript
const calculateFrictionFactor = (reynolds: number, relativeRoughness: number): number => {
  if (reynolds < 2000) {
    // Flujo laminar
    return 64 / reynolds;
  } else if (reynolds < 4000) {
    // Zona de transición - usar interpolación
    const laminar = 64 / 2000;
    const turbulent = calculateTurbulentFriction(4000, relativeRoughness);
    return laminar + (turbulent - laminar) * (reynolds - 2000) / 2000;
  } else {
    // Flujo turbulento - ecuación de Colebrook-White
    return calculateTurbulentFriction(reynolds, relativeRoughness);
  }
};

const calculateTurbulentFriction = (reynolds: number, relativeRoughness: number): number => {
  // Solución iterativa de la ecuación de Colebrook-White
  let f = 0.02; // Estimación inicial
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

#### Ecuación de Hazen-Williams
Método alternativo para flujo de agua en tuberías:

```typescript
interface HazenWilliamsParams {
  diameter: number;      // m
  length: number;        // m
  flow: number;          // m³/s
  cValue: number;        // Coeficiente C de Hazen-Williams
}

const calculateHazenWilliamsLoss = (params: HazenWilliamsParams): number => {
  const { diameter, length, flow, cValue } = params;

  // Convertir a unidades imperiales para la fórmula H-W
  const diameterIn = diameter * 39.37; // pulgadas
  const lengthFt = length * 3.281;     // pies
  const flowGpm = flow * 15850.3;      // gpm

  // Ecuación de Hazen-Williams
  const headLossFt = 4.52 * Math.pow(flowGpm, 1.85) * lengthFt /
                     (Math.pow(cValue, 1.85) * Math.pow(diameterIn, 4.87));

  // Convertir de vuelta a metros
  return headLossFt * 0.3048;
};
```

### 2. Cálculos de Dimensionamiento de Tuberías

#### Dimensionamiento de Diámetro para Caudal y Velocidad Dados
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

  // Calcular diámetro mínimo para restricción de velocidad
  const minDiameter = Math.sqrt(4 * flow / (Math.PI * maxVelocity));
  const maxDiameter = Math.sqrt(4 * flow / (Math.PI * minVelocity));

  // Encontrar diámetros comerciales adecuados
  const suitableDiameters = availableDiameters.filter(d =>
    d >= minDiameter && d <= maxDiameter
  );

  if (suitableDiameters.length === 0) {
    throw new Error('No se encontró diámetro adecuado para las restricciones dadas');
  }

  // Realizar análisis económico para cada diámetro
  const analyses = suitableDiameters.map(diameter => {
    const velocity = flow / (Math.PI * Math.pow(diameter / 2, 2));
    const economics = performEconomicAnalysis(diameter, flow, velocity);
    return { diameter, velocity, economics };
  });

  // Seleccionar diámetro con costo mínimo de ciclo de vida
  return analyses.reduce((best, current) =>
    current.economics.lifecycleCost < best.economics.lifecycleCost ? current : best
  );
};
```

### 3. Cálculos de Bombas

#### Selección y Análisis de Bombas
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

  // Calcular potencia hidráulica
  const hydraulicPower = (flow * fluidDensity * 9.81 * totalHead) / 1000; // kW

  // Calcular potencia al freno (potencia en el eje)
  const brakePower = hydraulicPower / efficiency; // kW

  // Calcular potencia del motor (incluyendo eficiencia del motor)
  const motorEfficiency = estimateMotorEfficiency(brakePower);
  const motorPower = brakePower / motorEfficiency; // kW

  // Calcular requerimiento de NPSH (estimado)
  const npshRequired = calculateNPSHRequired(flow, speed);

  // Leyes de afinidad para predicción de rendimiento
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

#### Análisis de Curva de Bomba
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
  // Encontrar intersección de curva de bomba y curva del sistema
  const operatingPoint = findIntersection(curve, systemCurve);

  // Generar mapa de rendimiento
  const performanceMap = generatePerformanceMap(curve);

  return { operatingPoint, performanceMap };
};
```

### 4. Cálculos de Tanques y Reservorios

#### Cálculos de Volumen de Almacenamiento
```typescript
interface StorageRequirements {
  peakDemand: number;        // m³/s
  averageDemand: number;     // m³/s
  fireFlowDemand: number;    // m³/s
  fireFlowDuration: number;  // segundos
  emergencyStorage: number;  // horas de demanda promedio
  operationalRange: number;  // m (entre niveles mín y máx)
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

  // Calcular componentes de volumen
  const equalizationVolume = calculateEqualizationVolume(peakDemand, averageDemand);
  const fireVolume = fireFlowDemand * fireFlowDuration;
  const emergencyVolume = averageDemand * emergencyStorage * 3600;
  const deadVolume = calculateDeadVolume(operationalRange);

  const totalVolume = equalizationVolume + fireVolume + emergencyVolume + deadVolume;

  // Calcular dimensiones óptimas
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

## Cálculos Energéticos

### 1. Análisis Energético de Bombas

#### Consumo Energético
```typescript
interface EnergyAnalysis {
  dailyConsumption: number;    // kWh/día
  annualConsumption: number;   // kWh/año
  peakDemand: number;          // kW
  loadFactor: number;          // decimal
  energyCost: number;          // $/año
  demandCharges: number;       // $/año
  totalElectricityCost: number; // $/año
}
```

#### Análisis de Variador de Frecuencia (VFD)
```typescript
interface VFDAnalysis {
  energySavings: number;     // kWh/año
  costSavings: number;       // $/año
  paybackPeriod: number;     // años
  vfdEfficiency: number;     // decimal
  harmonics: HarmonicsAnalysis;
}
```

## Cálculos de Calidad del Agua

### 1. Decaimiento de Cloro

#### Modelo de Decaimiento de Primer Orden
```typescript
interface ChlorineDecayParams {
  initialConcentration: number;  // mg/L
  decayCoefficient: number;      // 1/día
  time: number;                  // días
  temperature: number;           // °C
  ph: number;                    // unidades de pH
}

const calculateChlorineDecay = (params: ChlorineDecayParams): number => {
  const { initialConcentration, decayCoefficient, time, temperature, ph } = params;

  // Corrección por temperatura (Q10 = 2.5 para cloro)
  const tempCorrectionFactor = Math.pow(2.5, (temperature - 20) / 10);
  const correctedDecayCoeff = decayCoefficient * tempCorrectionFactor;

  // Corrección por pH
  const phCorrectionFactor = calculatePHCorrection(ph);
  const finalDecayCoeff = correctedDecayCoeff * phCorrectionFactor;

  // Ecuación de decaimiento de primer orden
  const finalConcentration = initialConcentration * Math.exp(-finalDecayCoeff * time);

  return Math.max(0, finalConcentration); // No puede ser negativo
};
```

## Análisis Avanzado

### 1. Análisis de Sobrepresión

#### Cálculos de Golpe de Ariete
```typescript
interface WaterHammerParams {
  pipeLength: number;        // m
  diameter: number;          // m
  thickness: number;         // m (pared de la tubería)
  elasticModulus: number;    // Pa (material de la tubería)
  bulkModulus: number;       // Pa (agua)
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
    pipeLength, diameter, thickness,
    elasticModulus, bulkModulus,
    initialVelocity, finalVelocity, closureTime
  } = params;

  // Calcular velocidad de onda (celeridad)
  const denominator = 1 + (bulkModulus * diameter) / (elasticModulus * thickness);
  const waveSpeed = Math.sqrt(bulkModulus / (1000 * denominator)); // m/s

  // Tiempo crítico de cierre
  const criticalTime = 2 * pipeLength / waveSpeed; // s

  // Cambio de velocidad
  const velocityChange = Math.abs(finalVelocity - initialVelocity);

  // Ecuación de Joukowsky para sobrepresión
  let pressureRise: number;

  if (closureTime <= criticalTime) {
    // Cierre rápido - golpe de ariete completo
    pressureRise = 1000 * waveSpeed * velocityChange; // Pa
  } else {
    // Cierre lento - efecto reducido
    const ratio = criticalTime / closureTime;
    pressureRise = 1000 * waveSpeed * velocityChange * ratio; // Pa
  }

  return {
    waveSpeed,
    maxPressureRise: pressureRise / 1000, // Convertir a kPa
    criticalTime
  };
};
```

### 2. Análisis de Fiabilidad de la Red

#### Evaluación de Redundancia
```typescript
interface ReliabilityAnalysis {
  criticalComponents: string[];
  redundancyLevel: number;      // escala 0-1
  availabilityFactor: number;   // escala 0-1
  failureImpact: Map<string, number>; // componente -> población afectada
}
```

#### Simulación de Fiabilidad Monte Carlo
```typescript
interface MonteCarloParams {
  iterations: number;
  timeHorizon: number;      // años
  componentReliability: Map<string, ReliabilityData>;
}

interface ReliabilityData {
  failureRate: number;      // fallos/año
  repairTime: number;       // horas
  maintenanceInterval: number; // años
}
```

## Validación y Aseguramiento de Calidad

### 1. Validación de Cálculos

#### Métodos de Validación Cruzada
```typescript
interface ValidationMethods {
  alternativeFormulas: boolean;    // Usar ecuaciones diferentes
  dimensionalAnalysis: boolean;    // Verificar consistencia de unidades
  physicalLimits: boolean;        // Verificar resultados razonables
  benchmarkComparison: boolean;   // Comparar con soluciones conocidas
}
```

### 2. Propagación de Errores

#### Análisis de Incertidumbre
```typescript
interface UncertaintyInput {
  parameter: string;
  nominalValue: number;
  standardDeviation: number;
  distribution: 'normal' | 'uniform' | 'triangular';
}
```

---

**Próximos Pasos**: Explora [Estándares Regionales](Estandares-Regionales.md) para entender cómo estos cálculos se aplican a diferentes marcos regulatorios y requisitos locales.
