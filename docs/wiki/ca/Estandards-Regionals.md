# Guia d'Estàndards Regionals

## Descripció General

Boorie suporta múltiples estàndards i regulacions regionals per a projectes d'enginyeria hidràulica. Aquesta guia cobreix els principals estàndards internacionals, nacionals i locals amb orientació pràctica d'implementació.

## Estàndards de Mèxic

### 1. NOM-127-SSA1-2021 (Qualitat de l'Aigua)

- **Nom Complet**: Norma Oficial Mexicana NOM-127-SSA1-2021, Agua para uso y consumo humano
- **Autoritat**: Secretaría de Salud (SSA)
- **Abast**: Estàndards de qualitat de l'aigua potable i requisits de monitoratge

#### Requisits Clau

**Paràmetres Físics i Químics**
```typescript
interface NOM127WaterQuality {
  physical: {
    turbidity: { max: 1.0, units: 'NTU' };
    color: { max: 15, units: 'UC' };
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
  };
}
```

**Requisits de Pressió**
```typescript
interface NOM127PressureStandards {
  residential: { minimum: 20, maximum: 50, units: 'm' };
  commercial: { minimum: 25, maximum: 50, units: 'm' };
  industrial: { minimum: 30, maximum: 70, units: 'm' };
}
```

### 2. NOM-001-CONAGUA-2011 (Sistemes de Distribució d'Aigua)

```typescript
interface NOM001DesignCriteria {
  pipeSizing: {
    minDiameter: 100,  // mm
    maxVelocity: 3.0,  // m/s
    minVelocity: 0.3,  // m/s
  };
  storage: {
    regulationCapacity: 0.25,  // 25% de la demanda diària màxima
    fireReserve: 2.0,          // hores
    emergencyReserve: 24.0,    // hores
  };
  pumping: {
    redundancy: 'N+1',
    efficiency: 0.75,
    variableSpeed: true,
  };
}
```

### 3. Manual CNA (Comissió Nacional de l'Aigua)

```typescript
interface CNADemandStandards {
  residential: {
    dotation: {
      rural: 100,       // L/persona/dia
      urban: 150,
      metropolitan: 200
    };
    peakFactors: { daily: 1.2, hourly: 2.5 };
  };
}
```

## Estàndards de Colòmbia

### 1. RAS 2000

```typescript
interface RAS2000Standards {
  pressure: {
    minimum: 15,       // metres (àrees rurals)
    minimumUrban: 20,  // metres (àrees urbanes)
    maximum: 60,       // metres
    fireFlow: 10,      // metres mínim durant flux contra incendi
  };
  velocity: {
    minimum: 0.3,      // m/s
    maximum: 5.0,      // m/s
    transmission: 3.0, // m/s
  };
}
```

### 2. Decret 1594/1984 (Estàndards de Qualitat de l'Aigua)

```typescript
interface ColombianWaterQuality {
  physical: {
    turbidity: { max: 2, units: 'NTU' };
    color: { max: 15, units: 'UC' };
  };
  chemical: {
    ph: { min: 6.5, max: 9.0 };
    hardness: { max: 300, units: 'mg/L CaCO3' };
  };
  bacteriological: {
    totalColiforms: { max: 0, units: 'CFU/100mL' };
    ecoli: { max: 0, units: 'CFU/100mL' };
  };
}
```

## Estàndards d'Espanya

### 1. CTE DB-HS (Codi Tècnic de l'Edificació - Salubritat)

```typescript
interface CTEHSRequirements {
  pressure: {
    minimum: 100, // kPa (10 metres)
    maximum: 500, // kPa (50 metres)
    residual: 100, // kPa al punt més desfavorable
  };
  flow: {
    minFlowRates: {
      washbasin: 0.1,    // L/s
      bathtub: 0.2,
      shower: 0.15,
      toilet: 0.1,
      kitchen_sink: 0.15,
      washing_machine: 0.15
    };
  };
}
```

#### Càlcul del Factor de Simultaneïtat
```typescript
const calculateSimultaneityFactor = (numFixtures: number): number => {
  if (numFixtures <= 5) return 1.0;
  else if (numFixtures <= 10) return 0.8;
  else if (numFixtures <= 15) return 0.7;
  else if (numFixtures <= 20) return 0.6;
  else return Math.max(0.45, 1 / Math.sqrt(numFixtures - 10));
};
```

### 2. Estàndards UNE

#### UNE-EN 805 (Sistemes d'Abastament d'Aigua)
```typescript
interface UNE805Standards {
  designLife: { pipes: 50, pumps: 15, valves: 25, instrumentation: 10 };
  safetyFactors: { structural: 2.0, hydraulic: 1.5, pressure: 1.25 };
  testPressure: { factor: 1.5, duration: 2.0, allowableLeakage: 0.1 };
}
```

## Estàndards Internacionals

### 1. Estàndards ISO

#### ISO 24510 (Activitats de Servei en Abastament d'Aigua Potable)
```typescript
interface ISO24510Framework {
  serviceObjectives: {
    accessibility: 'accés_universal',
    availability: { target: 0.99, units: 'fracció' },
    continuity: { target: 24, units: 'hores/dia' },
    quality: 'compliment_amb_estàndards_de_salut'
  };
}
```

### 2. Directrius OMS

```typescript
interface WHOWaterQuality {
  healthBased: {
    microbiological: {
      ecoli: { guideline: 0, units: 'CFU/100mL' }
    };
    chemical: {
      arsenic: { guideline: 0.01, units: 'mg/L' },
      fluoride: { guideline: 1.5, units: 'mg/L' },
      lead: { guideline: 0.01, units: 'mg/L' },
      nitrate: { guideline: 50, units: 'mg/L' }
    };
  };
}
```

## Implementació a Boorie

### 1. Selecció d'Estàndards

```typescript
const configureProjectStandards = (projectLocation: Location) => {
  const primaryStandard = detectPrimaryStandard(projectLocation);
  const secondaryStandards = suggestSecondaryStandards(projectLocation, primaryStandard);
  return { primary: primaryStandard, secondary: secondaryStandards };
};
```

### 2. Verificació de Compliment

```typescript
const performComplianceCheck = (
  analysisResults: AnalysisResults,
  standards: StandardsConfiguration
): ComplianceReport => {
  const allViolations: Violation[] = [];

  const primaryViolations = checkStandardCompliance(analysisResults, standards.primary);
  allViolations.push(...primaryViolations);

  return {
    overallCompliance: allViolations.length === 0,
    violations: allViolations,
    recommendations: generateComplianceRecommendations(allViolations)
  };
};
```

## Millors Pràctiques

### 1. Criteris de Selecció d'Estàndards

- **Subministrament Municipal d'Aigua**: Estàndards nacionals (NOM, RAS, CTE)
- **Aplicacions Industrials**: Estàndards específics de la indústria + nacionals
- **Sistemes Rurals**: Estàndards simplificats amb relaxacions apropiades
- **Projectes Internacionals**: Usar els estàndards més restrictius aplicables

### 2. Monitoratge Continu de Compliment

- **Monitoratge en Temps Real**: Paràmetres clau amb llindars d'alarma
- **Avaluació Periòdica**: Revisions de compliment programades
- **Gestió de Documentació**: Mantenir base de dades d'estàndards actualitzada
- **Programes de Capacitació**: Mantenir l'equip actualitzat sobre canvis en estàndards

---

**Propers Passos**: Explora [Millors Pràctiques](Millors-Practiques.md) per implementar aquests estàndards de manera efectiva en projectes reals d'enginyeria hidràulica.
