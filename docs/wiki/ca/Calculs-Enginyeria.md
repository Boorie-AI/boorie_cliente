# Guia de Càlculs d'Enginyeria

## Descripció General

Boorie proporciona eines completes de càlcul d'enginyeria hidràulica amb assistència AI integrada, biblioteques de fórmules i validació automatitzada. Aquesta guia cobreix tots els mòduls de càlcul i les seves aplicacions pràctiques.

## Càlculs Hidràulics

### 1. Anàlisi de Flux en Canonades

#### Equació de Darcy-Weisbach
L'equació fonamental per a càlculs de flux en canonades:

```typescript
interface DarcyWeisbachParams {
  diameter: number;      // m
  length: number;        // m
  roughness: number;     // m (rugositat absoluta)
  flow: number;          // m³/s
  viscosity: number;     // m²/s (viscositat cinemàtica)
  density: number;       // kg/m³
}

const calculateFrictionLoss = (params: DarcyWeisbachParams): number => {
  const { diameter, length, roughness, flow, viscosity } = params;

  // Calcular velocitat
  const area = Math.PI * Math.pow(diameter / 2, 2);
  const velocity = flow / area;

  // Calcular nombre de Reynolds
  const reynolds = (velocity * diameter) / viscosity;

  // Calcular factor de fricció usant equació de Colebrook-White
  const frictionFactor = calculateFrictionFactor(reynolds, roughness / diameter);

  // Calcular pèrdua de càrrega
  const headLoss = frictionFactor * (length / diameter) * (Math.pow(velocity, 2) / (2 * 9.81));

  return headLoss; // m
};
```

#### Equació de Hazen-Williams
Mètode alternatiu per a flux d'aigua en canonades:

```typescript
interface HazenWilliamsParams {
  diameter: number;      // m
  length: number;        // m
  flow: number;          // m³/s
  cValue: number;        // Coeficient C de Hazen-Williams
}

const calculateHazenWilliamsLoss = (params: HazenWilliamsParams): number => {
  const { diameter, length, flow, cValue } = params;

  const diameterIn = diameter * 39.37;
  const lengthFt = length * 3.281;
  const flowGpm = flow * 15850.3;

  const headLossFt = 4.52 * Math.pow(flowGpm, 1.85) * lengthFt /
                     (Math.pow(cValue, 1.85) * Math.pow(diameterIn, 4.87));

  return headLossFt * 0.3048;
};
```

### 2. Càlculs de Dimensionament de Canonades

```typescript
interface PipeSizingParams {
  flow: number;          // m³/s
  maxVelocity: number;   // m/s
  minVelocity: number;   // m/s
  availableDiameters: number[]; // m
}

const calculateOptimalDiameter = (params: PipeSizingParams) => {
  const { flow, maxVelocity, minVelocity, availableDiameters } = params;

  const minDiameter = Math.sqrt(4 * flow / (Math.PI * maxVelocity));
  const maxDiameter = Math.sqrt(4 * flow / (Math.PI * minVelocity));

  const suitableDiameters = availableDiameters.filter(d =>
    d >= minDiameter && d <= maxDiameter
  );

  // Seleccionar diàmetre amb cost mínim de cicle de vida
  return analyses.reduce((best, current) =>
    current.economics.lifecycleCost < best.economics.lifecycleCost ? current : best
  );
};
```

### 3. Càlculs de Bombes

#### Selecció i Anàlisi de Bombes
```typescript
interface PumpRequirements {
  flow: number;          // m³/s
  totalHead: number;     // m
  efficiency: number;    // decimal (0.8 = 80%)
  speed: number;         // rpm
  fluidDensity: number;  // kg/m³
}

const calculatePumpPerformance = (requirements: PumpRequirements) => {
  const { flow, totalHead, efficiency, speed, fluidDensity } = requirements;

  // Potència hidràulica
  const hydraulicPower = (flow * fluidDensity * 9.81 * totalHead) / 1000; // kW

  // Potència al fre
  const brakePower = hydraulicPower / efficiency; // kW

  // Lleis d'afinitat
  const affinity = {
    flowRatio: (newSpeed: number) => newSpeed / speed,
    headRatio: (newSpeed: number) => Math.pow(newSpeed / speed, 2),
    powerRatio: (newSpeed: number) => Math.pow(newSpeed / speed, 3)
  };

  return { power: brakePower, affinity };
};
```

### 4. Càlculs de Dipòsits i Embassaments

```typescript
interface StorageRequirements {
  peakDemand: number;        // m³/s
  averageDemand: number;     // m³/s
  fireFlowDemand: number;    // m³/s
  fireFlowDuration: number;  // segons
  emergencyStorage: number;  // hores de demanda promig
}

const calculateStorageVolume = (requirements: StorageRequirements) => {
  const equalizationVolume = calculateEqualizationVolume(
    requirements.peakDemand, requirements.averageDemand);
  const fireVolume = requirements.fireFlowDemand * requirements.fireFlowDuration;
  const emergencyVolume = requirements.averageDemand * requirements.emergencyStorage * 3600;

  const totalVolume = equalizationVolume + fireVolume + emergencyVolume;

  return { totalVolume, breakdown: { equalizationVolume, fireVolume, emergencyVolume } };
};
```

## Càlculs Energètics

### 1. Anàlisi Energètica de Bombes

```typescript
interface EnergyAnalysis {
  dailyConsumption: number;    // kWh/dia
  annualConsumption: number;   // kWh/any
  peakDemand: number;          // kW
  loadFactor: number;          // decimal
  energyCost: number;          // $/any
  totalElectricityCost: number; // $/any
}
```

### 2. Anàlisi de Variador de Freqüència (VFD)
```typescript
interface VFDAnalysis {
  energySavings: number;     // kWh/any
  costSavings: number;       // $/any
  paybackPeriod: number;     // anys
  vfdEfficiency: number;     // decimal
}
```

## Càlculs de Qualitat de l'Aigua

### 1. Decaïment de Clor

```typescript
interface ChlorineDecayParams {
  initialConcentration: number;  // mg/L
  decayCoefficient: number;      // 1/dia
  time: number;                  // dies
  temperature: number;           // °C
  ph: number;
}

const calculateChlorineDecay = (params: ChlorineDecayParams): number => {
  const { initialConcentration, decayCoefficient, time, temperature } = params;

  // Correcció per temperatura (Q10 = 2.5 per a clor)
  const tempCorrectionFactor = Math.pow(2.5, (temperature - 20) / 10);
  const correctedDecayCoeff = decayCoefficient * tempCorrectionFactor;

  // Equació de decaïment de primer ordre
  const finalConcentration = initialConcentration * Math.exp(-correctedDecayCoeff * time);

  return Math.max(0, finalConcentration);
};
```

## Anàlisi Avançada

### 1. Anàlisi de Sobrepressió

#### Càlculs de Cop d'Ariet
```typescript
interface WaterHammerParams {
  pipeLength: number;        // m
  diameter: number;          // m
  thickness: number;         // m
  elasticModulus: number;    // Pa
  bulkModulus: number;       // Pa
  initialVelocity: number;   // m/s
  finalVelocity: number;     // m/s
  closureTime: number;       // s
}

const calculateWaterHammer = (params: WaterHammerParams) => {
  const { pipeLength, diameter, thickness, elasticModulus, bulkModulus,
          initialVelocity, finalVelocity, closureTime } = params;

  // Velocitat d'ona (celeritat)
  const denominator = 1 + (bulkModulus * diameter) / (elasticModulus * thickness);
  const waveSpeed = Math.sqrt(bulkModulus / (1000 * denominator));

  // Temps crític de tancament
  const criticalTime = 2 * pipeLength / waveSpeed;

  // Equació de Joukowsky
  const velocityChange = Math.abs(finalVelocity - initialVelocity);
  let pressureRise: number;

  if (closureTime <= criticalTime) {
    pressureRise = 1000 * waveSpeed * velocityChange;
  } else {
    const ratio = criticalTime / closureTime;
    pressureRise = 1000 * waveSpeed * velocityChange * ratio;
  }

  return {
    waveSpeed,
    maxPressureRise: pressureRise / 1000, // kPa
    criticalTime
  };
};
```

### 2. Anàlisi de Fiabilitat de la Xarxa

```typescript
interface ReliabilityAnalysis {
  criticalComponents: string[];
  redundancyLevel: number;      // escala 0-1
  availabilityFactor: number;   // escala 0-1
  failureImpact: Map<string, number>;
}
```

## Validació i Assegurament de Qualitat

### 1. Mètodes de Validació Creuada
- **Fórmules alternatives**: Usar equacions diferents
- **Anàlisi dimensional**: Verificar consistència d'unitats
- **Límits físics**: Verificar resultats raonables
- **Comparació amb benchmarks**: Comparar amb solucions conegudes

### 2. Anàlisi d'Incertesa
```typescript
interface UncertaintyInput {
  parameter: string;
  nominalValue: number;
  standardDeviation: number;
  distribution: 'normal' | 'uniform' | 'triangular';
}
```

---

**Propers Passos**: Explora [Estàndards Regionals](Estandards-Regionals.md) per entendre com aquests càlculs s'apliquen a diferents marcs regulatoris i requisits locals.
