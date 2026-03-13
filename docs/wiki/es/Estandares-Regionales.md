# Guía de Estándares Regionales

## Descripción General

Boorie soporta múltiples estándares y regulaciones regionales para proyectos de ingeniería hidráulica. Esta guía cubre los principales estándares internacionales, nacionales y locales con orientación práctica de implementación.

## Estándares de México

### 1. NOM-127-SSA1-2021 (Calidad del Agua)

#### Descripción General
- **Nombre Completo**: Norma Oficial Mexicana NOM-127-SSA1-2021, Agua para uso y consumo humano
- **Autoridad**: Secretaría de Salud (SSA)
- **Alcance**: Estándares de calidad del agua potable y requisitos de monitoreo

#### Requisitos Clave

**Parámetros Físicos y Químicos**
```typescript
interface NOM127WaterQuality {
  physical: {
    turbidity: { max: 1.0, units: 'NTU' };
    color: { max: 15, units: 'UC' };
    odor: { requirement: 'no_objetable' };
    taste: { requirement: 'no_objetable' };
  };
  chemical: {
    ph: { min: 6.5, max: 8.5 };
    totalDissolvedSolids: { max: 1000, units: 'mg/L' };
    chloride: { max: 250, units: 'mg/L' };
    sulfate: { max: 400, units: 'mg/L' };
    fluoride: { max: 1.5, units: 'mg/L' };
    nitrate: { max: 10, units: 'mg/L' };
  };
  disinfection: {
    freeChlorine: { min: 0.2, max: 1.5, units: 'mg/L' };
    combinedChlorine: { max: 3.0, units: 'mg/L' };
  };
}
```

**Requisitos de Presión**
```typescript
interface NOM127PressureStandards {
  residential: {
    minimum: 20, // metros (>= 1.5 kg/cm²)
    maximum: 50, // metros (<= 5.0 kg/cm²)
    units: 'm'
  };
  commercial: {
    minimum: 25, // metros
    maximum: 50, // metros
    units: 'm'
  };
  industrial: {
    minimum: 30, // metros (varía según el proceso)
    maximum: 70, // metros
    units: 'm'
  };
}
```

#### Implementación en Boorie
```typescript
const validateNOM127Compliance = (networkResults: NetworkResults): ComplianceReport => {
  const violations: Violation[] = [];

  // Verificar cumplimiento de presión
  for (const node of networkResults.nodes) {
    const pressure = node.pressure; // metros

    if (pressure < 20) {
      violations.push({
        type: 'pressure_low',
        nodeId: node.id,
        actual: pressure,
        required: 20,
        severity: 'critical',
        standard: 'NOM-127-SSA1'
      });
    }

    if (pressure > 50) {
      violations.push({
        type: 'pressure_high',
        nodeId: node.id,
        actual: pressure,
        required: 50,
        severity: 'warning',
        standard: 'NOM-127-SSA1'
      });
    }
  }

  return generateComplianceReport(violations, 'NOM-127-SSA1');
};
```

### 2. NOM-001-CONAGUA-2011 (Sistemas de Distribución de Agua)

#### Criterios de Diseño
```typescript
interface NOM001DesignCriteria {
  pipeSizing: {
    minDiameter: 100, // mm para tuberías de distribución
    maxVelocity: 3.0, // m/s
    minVelocity: 0.3, // m/s (para prevenir sedimentación)
  };
  storage: {
    regulationCapacity: 0.25, // 25% de la demanda diaria máxima
    fireReserve: 2.0, // horas a tasa de flujo contra incendio
    emergencyReserve: 24.0, // horas a demanda promedio
  };
  pumping: {
    redundancy: 'N+1', // Al menos una bomba de respaldo
    efficiency: 0.75, // Mínimo 75% en el punto de operación
    variableSpeed: true, // VFD requerido para eficiencia energética
  };
}
```

### 3. Manual CNA (Comisión Nacional del Agua)

#### Estándares de Cálculo de Demanda
```typescript
interface CNADemandStandards {
  residential: {
    dotation: {
      rural: 100,      // L/persona/día
      urban: 150,      // L/persona/día
      metropolitan: 200 // L/persona/día
    };
    peakFactors: {
      daily: 1.2,      // Máximo diario / Promedio diario
      hourly: 2.5      // Máximo horario / Promedio horario
    };
  };
  commercial: {
    office: 6,         // L/m²/día
    retail: 5,         // L/m²/día
    restaurant: 40,    // L/m²/día
    hotel: 300         // L/habitación/día
  };
  industrial: {
    light: 0.5,        // L/s/hectárea
    medium: 1.0,       // L/s/hectárea
    heavy: 2.0         // L/s/hectárea
  };
}
```

## Estándares de Colombia

### 1. RAS 2000 (Reglamento Técnico del Sector de Agua Potable y Saneamiento Básico)

#### Parámetros de Diseño
```typescript
interface RAS2000Standards {
  pressure: {
    minimum: 15, // metros (áreas rurales)
    minimumUrban: 20, // metros (áreas urbanas)
    maximum: 60, // metros
    fireFlow: 10, // metros mínimo durante flujo contra incendio
  };
  velocity: {
    minimum: 0.3, // m/s
    maximum: 5.0, // m/s (distribución)
    transmission: 3.0, // m/s (tuberías de conducción)
  };
  storage: {
    compensation: 0.15, // 15% de la demanda diaria máxima
    emergency: 0.25, // 25% de la demanda diaria máxima
    fireReserve: 'por_nivel_de_riesgo', // Varía según riesgo de incendio
  };
}
```

#### Modelos de Crecimiento Poblacional
```typescript
const calculateColombianPopulationGrowth = (
  currentPopulation: number,
  historicalData: PopulationData[],
  designPeriod: number
): PopulationProjection => {

  // RAS 2000 recomienda múltiples métodos
  const methods = {
    arithmetic: calculateArithmeticGrowth(currentPopulation, historicalData, designPeriod),
    geometric: calculateGeometricGrowth(currentPopulation, historicalData, designPeriod),
    exponential: calculateExponentialGrowth(currentPopulation, historicalData, designPeriod),
    logistic: calculateLogisticGrowth(currentPopulation, historicalData, designPeriod)
  };

  // Seleccionar el método más apropiado basado en correlación R²
  const bestMethod = Object.entries(methods).reduce((best, [name, projection]) =>
    projection.correlation > best.correlation ? { name, ...projection } : best
  );

  return {
    method: bestMethod.name,
    currentPopulation,
    projectedPopulation: bestMethod.projectedPopulation,
    designPeriod,
    growthRate: bestMethod.growthRate,
    confidence: bestMethod.correlation
  };
};
```

### 2. Decreto 1594/1984 (Estándares de Calidad del Agua)

#### Parámetros de Calidad del Agua
```typescript
interface ColombianWaterQuality {
  physical: {
    turbidity: { max: 2, units: 'NTU' };
    color: { max: 15, units: 'UC' };
    temperature: { max: 30, units: '°C' };
  };
  chemical: {
    ph: { min: 6.5, max: 9.0 };
    alkalinity: { min: 30, units: 'mg/L CaCO3' };
    hardness: { max: 300, units: 'mg/L CaCO3' };
    iron: { max: 0.3, units: 'mg/L' };
    manganese: { max: 0.1, units: 'mg/L' };
  };
  bacteriological: {
    totalColiforms: { max: 0, units: 'CFU/100mL' };
    fecalColiforms: { max: 0, units: 'CFU/100mL' };
    ecoli: { max: 0, units: 'CFU/100mL' };
  };
}
```

## Estándares de España

### 1. CTE DB-HS (Código Técnico de la Edificación - Salubridad)

#### Requisitos de Instalación
```typescript
interface CTEHSRequirements {
  pressure: {
    minimum: 100, // kPa (10 metros)
    maximum: 500, // kPa (50 metros)
    residual: 100, // kPa en el punto más desfavorable
  };
  flow: {
    simultaneity: calculateSimultaneityFactor,
    minFlowRates: {
      washbasin: 0.1,    // L/s
      bathtub: 0.2,      // L/s
      shower: 0.15,      // L/s
      toilet: 0.1,       // L/s
      kitchen_sink: 0.15, // L/s
      washing_machine: 0.15 // L/s
    };
  };
  materials: {
    copper: { roughness: 0.0015, maxVelocity: 2.0 },
    steel: { roughness: 0.045, maxVelocity: 2.5 },
    pvc: { roughness: 0.0015, maxVelocity: 2.0 },
    pe: { roughness: 0.007, maxVelocity: 2.0 }
  };
}
```

#### Cálculo del Factor de Simultaneidad
```typescript
const calculateSimultaneityFactor = (numFixtures: number): number => {
  // Fórmula CTE DB-HS para simultaneidad
  if (numFixtures <= 5) {
    return 1.0;
  } else if (numFixtures <= 10) {
    return 0.8;
  } else if (numFixtures <= 15) {
    return 0.7;
  } else if (numFixtures <= 20) {
    return 0.6;
  } else {
    return Math.max(0.45, 1 / Math.sqrt(numFixtures - 10));
  }
};
```

### 2. Estándares UNE

#### UNE-EN 805 (Sistemas de Abastecimiento de Agua)
```typescript
interface UNE805Standards {
  designLife: {
    pipes: 50,         // años mínimo
    pumps: 15,         // años
    valves: 25,        // años
    instrumentation: 10 // años
  };
  safetyFactors: {
    structural: 2.0,   // Para espesor de pared de tubería
    hydraulic: 1.5,    // Para cálculos de capacidad
    pressure: 1.25     // Para clasificación de presión
  };
  testPressure: {
    factor: 1.5,       // x presión máxima de operación
    duration: 2.0,     // horas mínimo
    allowableLeakage: 0.1 // L/s/km/bar
  };
}
```

## Estándares de Estados Unidos

### 1. Estándares AWWA (American Water Works Association)

#### AWWA C900 (Tubería de Presión PVC)
```typescript
interface AWWAC900Standards {
  pressureClasses: {
    DR25: { pressure: 160, thickness: 'thin' },  // psi
    DR21: { pressure: 200, thickness: 'medium' }, // psi
    DR18: { pressure: 235, thickness: 'thick' },  // psi
    DR14: { pressure: 305, thickness: 'extra_thick' } // psi
  };
}
```

### 2. Estándares EPA

#### Ley de Agua Potable Segura (SDWA)
```typescript
interface EPAWaterQuality {
  primaryStandards: { // Basados en salud
    arsenic: { mcl: 0.010, units: 'mg/L' },
    lead: { actionLevel: 0.015, units: 'mg/L' },
    nitrate: { mcl: 10, units: 'mg/L' },
    totalColiforms: { mcl: 0, units: 'CFU/100mL' },
    turbidity: { tt: 1.0, units: 'NTU' }
  };
  secondaryStandards: { // Estéticos
    chloride: { smcl: 250, units: 'mg/L' },
    iron: { smcl: 0.3, units: 'mg/L' },
    ph: { smcl: { min: 6.5, max: 8.5 } },
    sulfate: { smcl: 250, units: 'mg/L' },
    tds: { smcl: 500, units: 'mg/L' }
  };
}
```

## Estándares Internacionales

### 1. Estándares ISO

#### ISO 24510 (Actividades de Servicio en Abastecimiento de Agua Potable)
```typescript
interface ISO24510Framework {
  serviceObjectives: {
    accessibility: 'acceso_universal',
    availability: { target: 0.99, units: 'fracción' }, // 99% de disponibilidad
    continuity: { target: 24, units: 'horas/día' },
    quality: 'cumplimiento_con_estándares_de_salud',
    quantity: 'adecuada_para_salud_y_dignidad',
    regularity: 'patrones_de_servicio_predecibles'
  };
}
```

### 2. Directrices OMS

#### Directrices de Calidad del Agua Potable de la OMS
```typescript
interface WHOWaterQuality {
  healthBased: {
    microbiological: {
      ecoli: { guideline: 0, units: 'CFU/100mL' },
      enterococci: { guideline: 0, units: 'CFU/100mL' }
    };
    chemical: {
      arsenic: { guideline: 0.01, units: 'mg/L' },
      fluoride: { guideline: 1.5, units: 'mg/L' },
      lead: { guideline: 0.01, units: 'mg/L' },
      mercury: { guideline: 0.006, units: 'mg/L' },
      nitrate: { guideline: 50, units: 'mg/L' }
    };
  };
}
```

## Implementación en Boorie

### 1. Interfaz de Selección de Estándares

```typescript
const configureProjectStandards = (projectLocation: Location): StandardsConfiguration => {
  // Detectar automáticamente estándares aplicables según ubicación
  const primaryStandard = detectPrimaryStandard(projectLocation);

  // Sugerir estándares adicionales si aplica
  const secondaryStandards = suggestSecondaryStandards(projectLocation, primaryStandard);

  return {
    primary: primaryStandard,
    secondary: secondaryStandards,
    customParameters: []
  };
};
```

### 2. Verificación de Cumplimiento

```typescript
const performComplianceCheck = (
  analysisResults: AnalysisResults,
  standards: StandardsConfiguration
): ComplianceReport => {

  const allViolations: Violation[] = [];

  // Verificar estándar primario
  const primaryViolations = checkStandardCompliance(analysisResults, standards.primary);
  allViolations.push(...primaryViolations);

  // Verificar estándares secundarios
  if (standards.secondary) {
    for (const standard of standards.secondary) {
      const secondaryViolations = checkStandardCompliance(analysisResults, standard);
      allViolations.push(...secondaryViolations);
    }
  }

  return {
    overallCompliance: allViolations.length === 0,
    violations: allViolations,
    recommendations: generateComplianceRecommendations(allViolations),
    certificationEligible: evaluateCertificationEligibility(allViolations)
  };
};
```

## Mejores Prácticas

### 1. Criterios de Selección de Estándares

#### Consideraciones por Tipo de Proyecto
- **Suministro Municipal de Agua**: Estándares nacionales (NOM, RAS, CTE)
- **Aplicaciones Industriales**: Estándares específicos de la industria + nacionales
- **Sistemas Rurales**: Estándares simplificados con relajaciones apropiadas
- **Sistemas de Emergencia**: Estándares temporales con requisitos de monitoreo

#### Consideraciones Geográficas
- **Regiones Fronterizas**: Considerar estándares de países vecinos
- **Proyectos Internacionales**: Usar los estándares más restrictivos aplicables
- **Áreas Remotas**: Adaptar estándares a condiciones y recursos locales

### 2. Documentación de Cumplimiento

#### Documentación Requerida
```typescript
interface ComplianceDocumentation {
  designMemorial: {
    standardsApplied: string[];
    justifications: string[];
    calculations: CalculationReference[];
    assumptions: string[];
  };
  complianceMatrix: {
    requirement: string;
    standard: string;
    compliance: 'cumple' | 'no_cumple' | 'no_aplica';
    evidence: string;
  }[];
}
```

### 3. Monitoreo Continuo de Cumplimiento

#### Estrategia de Implementación
- **Monitoreo en Tiempo Real**: Parámetros clave con umbrales de alarma
- **Evaluación Periódica**: Revisiones de cumplimiento programadas
- **Gestión de Documentación**: Mantener base de datos de estándares actualizada
- **Programas de Capacitación**: Mantener al equipo actualizado sobre cambios en estándares

---

**Próximos Pasos**: Explora [Mejores Prácticas](Mejores-Practicas.md) para implementar estos estándares de manera efectiva en proyectos reales de ingeniería hidráulica.
