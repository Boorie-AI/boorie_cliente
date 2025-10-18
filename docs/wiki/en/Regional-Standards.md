# Regional Standards Guide

## 🌍 Overview

Boorie supports multiple regional standards and regulations for hydraulic engineering projects. This guide covers major international, national, and local standards with practical implementation guidance.

## 🇲🇽 Mexico Standards

### 1. NOM-127-SSA1-2021 (Water Quality)

#### Overview
- **Full Name**: Norma Oficial Mexicana NOM-127-SSA1-2021, Agua para uso y consumo humano
- **Authority**: Secretaría de Salud (SSA)
- **Scope**: Drinking water quality standards and monitoring requirements

#### Key Requirements

**Physical and Chemical Parameters**
```typescript
interface NOM127WaterQuality {
  physical: {
    turbidity: { max: 1.0, units: 'NTU' };
    color: { max: 15, units: 'UC' };
    odor: { requirement: 'non_objectionable' };
    taste: { requirement: 'non_objectionable' };
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

**Pressure Requirements**
```typescript
interface NOM127PressureStandards {
  residential: {
    minimum: 20, // meters (≥ 1.5 kg/cm²)
    maximum: 50, // meters (≤ 5.0 kg/cm²)
    units: 'm'
  };
  commercial: {
    minimum: 25, // meters
    maximum: 50, // meters
    units: 'm'
  };
  industrial: {
    minimum: 30, // meters (varies by process)
    maximum: 70, // meters
    units: 'm'
  };
}
```

#### Implementation in Boorie
```typescript
const validateNOM127Compliance = (networkResults: NetworkResults): ComplianceReport => {
  const violations: Violation[] = [];
  
  // Check pressure compliance
  for (const node of networkResults.nodes) {
    const pressure = node.pressure; // meters
    
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
  
  // Check chlorine residual
  for (const node of networkResults.qualityNodes) {
    const chlorine = node.chlorineConcentration;
    
    if (chlorine < 0.2) {
      violations.push({
        type: 'chlorine_low',
        nodeId: node.id,
        actual: chlorine,
        required: 0.2,
        severity: 'critical',
        standard: 'NOM-127-SSA1'
      });
    }
  }
  
  return generateComplianceReport(violations, 'NOM-127-SSA1');
};
```

### 2. NOM-001-CONAGUA-2011 (Water Distribution Systems)

#### Design Criteria
```typescript
interface NOM001DesignCriteria {
  pipeSizing: {
    minDiameter: 100, // mm for distribution mains
    maxVelocity: 3.0, // m/s
    minVelocity: 0.3, // m/s (to prevent sedimentation)
  };
  storage: {
    regulationCapacity: 0.25, // 25% of max daily demand
    fireReserve: 2.0, // hours at fire flow rate
    emergencyReserve: 24.0, // hours at average demand
  };
  pumping: {
    redundancy: 'N+1', // At least one backup pump
    efficiency: 0.75, // Minimum 75% at duty point
    variableSpeed: true, // VFD required for energy efficiency
  };
}
```

#### Hydraulic Analysis Requirements
```typescript
const performNOM001Analysis = (network: WaterNetwork): AnalysisResults => {
  const analyses: AnalysisResult[] = [];
  
  // 1. Static pressure analysis
  const staticAnalysis = analyzeStaticPressure(network);
  analyses.push(staticAnalysis);
  
  // 2. Peak hour demand analysis
  const peakHourDemand = network.averageDemand * 2.5; // Peak factor
  const peakAnalysis = analyzeNetwork(network, peakHourDemand);
  analyses.push(peakAnalysis);
  
  // 3. Fire flow analysis
  const fireFlowRate = calculateFireFlowRate(network.area, network.occupancyType);
  const fireAnalysis = analyzeFireFlow(network, fireFlowRate);
  analyses.push(fireAnalysis);
  
  // 4. Minimum hour analysis (storage filling)
  const minHourDemand = network.averageDemand * 0.5; // Minimum factor
  const storageAnalysis = analyzeStorageFilling(network, minHourDemand);
  analyses.push(storageAnalysis);
  
  return {
    analyses,
    compliance: evaluateNOM001Compliance(analyses),
    recommendations: generateNOM001Recommendations(analyses)
  };
};
```

### 3. CNA Manual (National Water Commission)

#### Demand Calculation Standards
```typescript
interface CNADemandStandards {
  residential: {
    dotation: {
      rural: 100,      // L/person/day
      urban: 150,      // L/person/day
      metropolitan: 200 // L/person/day
    };
    peakFactors: {
      daily: 1.2,      // Max daily / Average daily
      hourly: 2.5      // Max hourly / Average hourly
    };
  };
  commercial: {
    office: 6,         // L/m²/day
    retail: 5,         // L/m²/day
    restaurant: 40,    // L/m²/day
    hotel: 300         // L/room/day
  };
  industrial: {
    light: 0.5,        // L/s/hectare
    medium: 1.0,       // L/s/hectare
    heavy: 2.0         // L/s/hectare
  };
}
```

## 🇨🇴 Colombia Standards

### 1. RAS 2000 (Reglamento Técnico del Sector de Agua Potable y Saneamiento Básico)

#### Design Parameters
```typescript
interface RAS2000Standards {
  pressure: {
    minimum: 15, // meters (rural areas)
    minimumUrban: 20, // meters (urban areas)
    maximum: 60, // meters
    fireFlow: 10, // meters minimum during fire flow
  };
  velocity: {
    minimum: 0.3, // m/s
    maximum: 5.0, // m/s (distribution)
    transmission: 3.0, // m/s (transmission mains)
  };
  storage: {
    compensation: 0.15, // 15% of max daily demand
    emergency: 0.25, // 25% of max daily demand
    fireReserve: 'per_risk_level', // Varies by fire risk
  };
}
```

#### Population Growth Models
```typescript
const calculateColombianPopulationGrowth = (
  currentPopulation: number,
  historicalData: PopulationData[],
  designPeriod: number
): PopulationProjection => {
  
  // RAS 2000 recommends multiple methods
  const methods = {
    arithmetic: calculateArithmeticGrowth(currentPopulation, historicalData, designPeriod),
    geometric: calculateGeometricGrowth(currentPopulation, historicalData, designPeriod),
    exponential: calculateExponentialGrowth(currentPopulation, historicalData, designPeriod),
    logistic: calculateLogisticGrowth(currentPopulation, historicalData, designPeriod)
  };
  
  // Select most appropriate method based on R² correlation
  const bestMethod = Object.entries(methods).reduce((best, [name, projection]) => 
    projection.correlation > best.correlation ? { name, ...projection } : best
  );
  
  // Apply saturation limits
  const saturatedPopulation = Math.min(bestMethod.projectedPopulation, 
                                     calculateSaturationPopulation(currentPopulation));
  
  return {
    method: bestMethod.name,
    currentPopulation,
    projectedPopulation: saturatedPopulation,
    designPeriod,
    growthRate: bestMethod.growthRate,
    confidence: bestMethod.correlation
  };
};
```

### 2. Decree 1594/1984 (Water Quality Standards)

#### Water Quality Parameters
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

## 🇪🇸 Spain Standards

### 1. CTE DB-HS (Código Técnico de la Edificación - Salubridad)

#### Installation Requirements
```typescript
interface CTEHSRequirements {
  pressure: {
    minimum: 100, // kPa (10 meters)
    maximum: 500, // kPa (50 meters)
    residual: 100, // kPa at most unfavorable point
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

#### Simultaneity Factor Calculation
```typescript
const calculateSimultaneityFactor = (numFixtures: number): number => {
  // CTE DB-HS formula for simultaneity
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

### 2. UNE Standards

#### UNE-EN 805 (Water Supply Systems)
```typescript
interface UNE805Standards {
  designLife: {
    pipes: 50,         // years minimum
    pumps: 15,         // years
    valves: 25,        // years
    instrumentation: 10 // years
  };
  safetyFactors: {
    structural: 2.0,   // For pipe wall thickness
    hydraulic: 1.5,    // For capacity calculations
    pressure: 1.25     // For pressure ratings
  };
  testPressure: {
    factor: 1.5,       // × maximum operating pressure
    duration: 2.0,     // hours minimum
    allowableLeakage: 0.1 // L/s/km/bar
  };
}
```

## 🇺🇸 United States Standards

### 1. AWWA Standards (American Water Works Association)

#### AWWA C900 (PVC Pressure Pipe)
```typescript
interface AWWAC900Standards {
  pressureClasses: {
    DR25: { pressure: 160, thickness: 'thin' },  // psi
    DR21: { pressure: 200, thickness: 'medium' }, // psi
    DR18: { pressure: 235, thickness: 'thick' },  // psi
    DR14: { pressure: 305, thickness: 'extra_thick' } // psi
  };
  bendingRadius: {
    minimum: (diameter: number) => diameter * 25, // × diameter
    deflection: 0.05 // 5% maximum
  };
  installation: {
    minimumCover: 0.6, // meters
    maximumCover: 6.0, // meters
    bedding: 'class_B' // ASTM D2321
  };
}
```

#### AWWA M32 (Distribution System Requirements)
```typescript
interface AWWAM32Distribution {
  pressure: {
    normal: { min: 35, max: 80 }, // psi (24-55 m)
    fire: { min: 20 },             // psi (14 m) residual
    static: { max: 150 }           // psi (105 m)
  };
  velocity: {
    transmission: { max: 8 },      // ft/s (2.4 m/s)
    distribution: { max: 10 },     // ft/s (3.0 m/s)
    service: { max: 15 }           // ft/s (4.6 m/s)
  };
  storage: {
    equalization: 0.25,            // 25% of peak demand
    fire: 'per_insurance_requirements',
    emergency: 'per_local_codes'
  };
}
```

### 2. EPA Standards

#### Safe Drinking Water Act (SDWA)
```typescript
interface EPAWaterQuality {
  primaryStandards: { // Health-based
    arsenic: { mcl: 0.010, units: 'mg/L' },
    lead: { actionLevel: 0.015, units: 'mg/L' },
    nitrate: { mcl: 10, units: 'mg/L' },
    totalColiforms: { mcl: 0, units: 'CFU/100mL' },
    turbidity: { tt: 1.0, units: 'NTU' }
  };
  secondaryStandards: { // Aesthetic
    chloride: { smcl: 250, units: 'mg/L' },
    iron: { smcl: 0.3, units: 'mg/L' },
    ph: { smcl: { min: 6.5, max: 8.5 } },
    sulfate: { smcl: 250, units: 'mg/L' },
    tds: { smcl: 500, units: 'mg/L' }
  };
}
```

## 🌐 International Standards

### 1. ISO Standards

#### ISO 24510 (Service Activities in Drinking Water Supply)
```typescript
interface ISO24510Framework {
  serviceObjectives: {
    accessibility: 'universal_access',
    availability: { target: 0.99, units: 'fraction' }, // 99% uptime
    continuity: { target: 24, units: 'hours/day' },
    quality: 'compliance_with_health_standards',
    quantity: 'adequate_for_health_and_dignity',
    regularity: 'predictable_service_patterns'
  };
  performanceIndicators: {
    coverage: 'population_served / total_population',
    adequacy: 'volume_supplied / volume_needed',
    efficiency: 'revenue_water / system_input_volume',
    sustainability: 'renewable_resources / total_resources'
  };
}
```

#### ISO 5667 (Water Quality Sampling)
```typescript
interface ISO5667SamplingProtocol {
  frequency: {
    continuous: ['turbidity', 'chlorine_residual'],
    daily: ['bacteriological'],
    weekly: ['chemical_basic'],
    monthly: ['chemical_comprehensive'],
    annual: ['heavy_metals', 'pesticides']
  };
  locations: {
    source: 'raw_water_intake',
    treatment: 'post_treatment',
    distribution: 'representative_points',
    consumer: 'tap_samples'
  };
  preservation: {
    bacteriological: { temperature: 4, time: 24, units: '°C, hours' },
    chemical: { preservative: 'as_required', time: 'varies' },
    metals: { acidification: 'HNO3_to_pH_2' }
  };
}
```

### 2. WHO Guidelines

#### WHO Drinking Water Quality Guidelines
```typescript
interface WHOWaterQuality {
  healthBased: {
    microbiological: {
      ecoli: { guideline: 0, units: 'CFU/100mL' },
      enterococci: { guideline: 0, units: 'CFU/100mL' },
      coliphages: { guideline: 0, units: 'PFU/100mL' }
    };
    chemical: {
      arsenic: { guideline: 0.01, units: 'mg/L' },
      fluoride: { guideline: 1.5, units: 'mg/L' },
      lead: { guideline: 0.01, units: 'mg/L' },
      mercury: { guideline: 0.006, units: 'mg/L' },
      nitrate: { guideline: 50, units: 'mg/L' }
    };
    radiological: {
      grossAlpha: { guideline: 0.5, units: 'Bq/L' },
      grossBeta: { guideline: 1.0, units: 'Bq/L' }
    }
  };
  aesthetic: {
    taste: 'acceptable_to_consumers',
    odor: 'acceptable_to_consumers',
    color: { guideline: 15, units: 'TCU' }
  };
}
```

## 🛠️ Implementation in Boorie

### 1. Standards Selection Interface

```typescript
interface StandardsConfiguration {
  primary: RegionalStandard;
  secondary?: RegionalStandard[];
  customParameters?: CustomStandard[];
}

const configureProjectStandards = (projectLocation: Location): StandardsConfiguration => {
  // Auto-detect applicable standards based on location
  const primaryStandard = detectPrimaryStandard(projectLocation);
  
  // Suggest additional standards if applicable
  const secondaryStandards = suggestSecondaryStandards(projectLocation, primaryStandard);
  
  return {
    primary: primaryStandard,
    secondary: secondaryStandards,
    customParameters: []
  };
};
```

### 2. Compliance Checking

```typescript
const performComplianceCheck = (
  analysisResults: AnalysisResults,
  standards: StandardsConfiguration
): ComplianceReport => {
  
  const allViolations: Violation[] = [];
  
  // Check primary standard
  const primaryViolations = checkStandardCompliance(analysisResults, standards.primary);
  allViolations.push(...primaryViolations);
  
  // Check secondary standards
  if (standards.secondary) {
    for (const standard of standards.secondary) {
      const secondaryViolations = checkStandardCompliance(analysisResults, standard);
      allViolations.push(...secondaryViolations);
    }
  }
  
  // Generate recommendations
  const recommendations = generateComplianceRecommendations(allViolations);
  
  return {
    overallCompliance: allViolations.length === 0,
    violations: allViolations,
    recommendations,
    certificationEligible: evaluateCertificationEligibility(allViolations)
  };
};
```

### 3. Multi-Standard Reporting

```typescript
const generateMultiStandardReport = (
  project: HydraulicProject,
  analysisResults: AnalysisResults,
  standards: StandardsConfiguration
): StandardsReport => {
  
  const sections: ReportSection[] = [];
  
  // Executive summary
  sections.push(generateExecutiveSummary(project, analysisResults, standards));
  
  // Standard-specific analyses
  for (const standard of [standards.primary, ...(standards.secondary || [])]) {
    sections.push(generateStandardAnalysis(analysisResults, standard));
  }
  
  // Comparative analysis
  if (standards.secondary && standards.secondary.length > 0) {
    sections.push(generateComparativeAnalysis(analysisResults, standards));
  }
  
  // Recommendations and conclusions
  sections.push(generateRecommendations(analysisResults, standards));
  
  return {
    project,
    standards,
    sections,
    generatedAt: new Date(),
    version: '1.0'
  };
};
```

### 4. Standards Database

```typescript
interface StandardsDatabase {
  standards: Map<string, RegionalStandard>;
  updates: StandardUpdate[];
  locale: string;
}

const loadStandardsDatabase = async (locale: string): Promise<StandardsDatabase> => {
  // Load standards from local database and check for updates
  const localStandards = await loadLocalStandards(locale);
  const updates = await checkForStandardsUpdates(localStandards);
  
  // Apply any available updates
  const updatedStandards = await applyStandardsUpdates(localStandards, updates);
  
  return {
    standards: updatedStandards,
    updates,
    locale
  };
};
```

## 📚 Best Practices

### 1. Standards Selection Criteria

#### Project Type Considerations
- **Municipal Water Supply**: National standards (NOM, RAS, CTE)
- **Industrial Applications**: Industry-specific standards + national
- **Rural Systems**: Simplified standards with appropriate relaxations
- **Emergency Systems**: Temporary standards with monitoring requirements

#### Geographic Considerations
- **Border Regions**: Consider standards from neighboring countries
- **International Projects**: Use most restrictive applicable standards
- **Remote Areas**: Adapt standards for local conditions and resources

### 2. Compliance Documentation

#### Required Documentation
```typescript
interface ComplianceDocumentation {
  designMemorial: {
    standardsApplied: string[];
    justifications: string[];
    calculations: CalculationReference[];
    assumptions: string[];
  };
  analysisReports: {
    hydraulicAnalysis: AnalysisReport;
    qualityAnalysis?: QualityReport;
    reliabilityAnalysis?: ReliabilityReport;
  };
  complianceMatrix: {
    requirement: string;
    standard: string;
    compliance: 'compliant' | 'non_compliant' | 'not_applicable';
    evidence: string;
  }[];
  certifications: {
    professionalSeal: boolean;
    thirdPartyReview?: boolean;
    regulatoryApproval?: boolean;
  };
}
```

### 3. Continuous Compliance Monitoring

#### Implementation Strategy
- **Real-time Monitoring**: Key parameters with alarm thresholds
- **Periodic Assessment**: Scheduled compliance reviews
- **Documentation Management**: Maintain current standards database
- **Training Programs**: Keep team updated on standard changes

---

**Next Steps**: Explore [Best Practices](Best-Practices.md) for implementing these standards effectively in real-world hydraulic engineering projects.