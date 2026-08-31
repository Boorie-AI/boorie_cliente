import {
  HydraulicFormula,
  CalculationResult,
  FormulaParameter,
  AvisoDelMotor
} from '../../../src/types/hydraulic'

/**
 * Un aviso del motor no es una frase: es una clave del diccionario y, si lleva
 * cifras, sus datos. El motor no sabe en qué idioma se va a leer (#96).
 */
const aviso = (clave: string, datos?: Record<string, string | number>): AvisoDelMotor =>
  datos ? { clave: `calc.msg.${clave}`, datos } : { clave: `calc.msg.${clave}` }

export class HydraulicCalculationEngine {
  private formulas: Map<string, HydraulicFormula>
  private unitConverter: UnitConverter
  
  constructor() {
    this.unitConverter = new UnitConverter()
    this.formulas = new Map()
    this.initializeFormulas()
  }
  
  private initializeFormulas() {
    // Darcy-Weisbach formula for head loss
    this.formulas.set('darcy-weisbach', {
      id: 'darcy-weisbach',
      nameKey: 'calc.formula.darcyWeisbach',
      category: 'head_loss',
      equation: 'hf = f * (L/D) * (V²/2g)',
      parameters: [
        {
          symbol: 'f',
          nameKey: 'calc.param.frictionFactor',
          descriptionKey: 'calc.paramDesc.frictionFactor',
          units: ['dimensionless'],
          range: { min: 0.008, max: 0.1 }
        },
        {
          symbol: 'L',
          nameKey: 'calc.param.pipeLength',
          descriptionKey: 'calc.paramDesc.pipeLength',
          units: ['m', 'ft'],
          range: { min: 0, max: 100000 }
        },
        {
          symbol: 'D',
          nameKey: 'calc.param.pipeDiameter',
          descriptionKey: 'calc.paramDesc.pipeDiameter',
          units: ['m', 'mm', 'in'],
          range: { min: 0.01, max: 10 }
        },
        {
          symbol: 'V',
          nameKey: 'calc.param.velocity',
          descriptionKey: 'calc.paramDesc.velocity',
          units: ['m/s', 'ft/s'],
          range: { min: 0, max: 10 }
        }
      ],
      units: {
        length: 'meters',
        flow: 'm3/s',
        pressure: 'mH2O',
        diameter: 'mm'
      }
    })
    
    // Hazen-Williams formula
    this.formulas.set('hazen-williams', {
      id: 'hazen-williams',
      nameKey: 'calc.formula.hazenWilliams',
      category: 'head_loss',
      equation: 'hf = 10.67 * (Q/C)^1.852 * L / D^4.8704',
      parameters: [
        {
          symbol: 'Q',
          nameKey: 'calc.param.flowRate',
          descriptionKey: 'calc.paramDesc.flowRate',
          units: ['l/s', 'm³/s', 'gpm'],
          range: { min: 0, max: 10 }
        },
        {
          symbol: 'C',
          nameKey: 'calc.param.hazenC',
          descriptionKey: 'calc.paramDesc.hazenC',
          units: ['dimensionless'],
          defaultValue: 140,
          range: { min: 50, max: 150 }
        },
        {
          symbol: 'L',
          nameKey: 'calc.param.pipeLength',
          descriptionKey: 'calc.paramDesc.pipeLength',
          units: ['m', 'ft'],
          range: { min: 0, max: 100000 }
        },
        {
          symbol: 'D',
          nameKey: 'calc.param.pipeDiameter',
          descriptionKey: 'calc.paramDesc.pipeDiameter',
          units: ['m', 'mm', 'in'],
          range: { min: 0.01, max: 10 }
        }
      ],
      units: {
        length: 'meters',
        flow: 'm3/s',
        pressure: 'mH2O',
        diameter: 'mm'
      }
    })
    
    // Colebrook-White formula for friction factor
    this.formulas.set('colebrook-white', {
      id: 'colebrook-white',
      nameKey: 'calc.formula.colebrook',
      category: 'flow',
      equation: '1/√f = -2 * log10(ε/(3.7*D) + 2.51/(Re*√f))',
      parameters: [
        {
          symbol: 'Re',
          nameKey: 'calc.param.reynolds',
          descriptionKey: 'calc.paramDesc.reynolds',
          units: ['dimensionless'],
          range: { min: 2000, max: 1e8 }
        },
        {
          symbol: 'ε',
          nameKey: 'calc.param.roughness',
          descriptionKey: 'calc.paramDesc.roughness',
          units: ['m', 'mm'],
          defaultValue: 0.0015,
          range: { min: 0, max: 0.05 }
        },
        {
          symbol: 'D',
          nameKey: 'calc.param.pipeDiameter',
          descriptionKey: 'calc.paramDesc.pipeDiameter',
          units: ['m', 'mm'],
          range: { min: 0.01, max: 10 }
        }
      ],
      units: {
        length: 'meters',
        flow: 'm3/s',
        pressure: 'mH2O',
        diameter: 'mm'
      }
    })
    
    // Water hammer - Joukowsky equation
    this.formulas.set('water-hammer', {
      id: 'water-hammer',
      nameKey: 'calc.formula.waterHammer',
      category: 'water_hammer',
      equation: 'ΔP = ρ * c * ΔV',
      parameters: [
        {
          symbol: 'ρ',
          nameKey: 'calc.param.waterDensity',
          descriptionKey: 'calc.paramDesc.waterDensity',
          units: ['kg/m³'],
          defaultValue: 1000,
          range: { min: 990, max: 1010 }
        },
        {
          symbol: 'c',
          nameKey: 'calc.param.waveSpeed',
          descriptionKey: 'calc.paramDesc.waveSpeed',
          units: ['m/s'],
          defaultValue: 1200,
          range: { min: 200, max: 1500 }
        },
        {
          symbol: 'ΔV',
          nameKey: 'calc.param.velocityChange',
          descriptionKey: 'calc.paramDesc.velocityChange',
          units: ['m/s'],
          range: { min: 0, max: 10 }
        }
      ],
      units: {
        length: 'meters',
        flow: 'm3/s',
        pressure: 'kPa',
        diameter: 'mm'
      }
    })
    
    // Tank sizing formula
    this.formulas.set('tank-volume', {
      id: 'tank-volume',
      nameKey: 'calc.formula.tankVolume',
      category: 'tank_sizing',
      equation: 'V = Qmax * t + Vfire + Vemergency',
      parameters: [
        {
          symbol: 'Qmax',
          nameKey: 'calc.param.maxHourlyDemand',
          descriptionKey: 'calc.paramDesc.maxHourlyDemand',
          units: ['l/s', 'm³/h', 'gpm'],
          range: { min: 0, max: 10000 }
        },
        {
          symbol: 't',
          nameKey: 'calc.param.regulationTime',
          descriptionKey: 'calc.paramDesc.regulationTime',
          units: ['h'],
          defaultValue: 4,
          range: { min: 2, max: 24 }
        },
        {
          symbol: 'Vfire',
          nameKey: 'calc.param.fireReserve',
          descriptionKey: 'calc.paramDesc.fireReserve',
          units: ['m³', 'L'],
          defaultValue: 0,
          range: { min: 0, max: 5000 }
        },
        {
          symbol: 'Vemergency',
          nameKey: 'calc.param.emergencyReserve',
          descriptionKey: 'calc.paramDesc.emergencyReserve',
          units: ['m³', 'L'],
          defaultValue: 0,
          range: { min: 0, max: 5000 }
        }
      ],
      units: {
        length: 'meters',
        flow: 'm3/s',
        pressure: 'mH2O',
        diameter: 'mm'
      }
    })
    
    // Pump power calculation
    this.formulas.set('pump-power', {
      id: 'pump-power',
      nameKey: 'calc.formula.pumpPower',
      category: 'pump',
      equation: 'P = (ρ * g * Q * H) / (η * 1000)',
      parameters: [
        {
          symbol: 'ρ',
          nameKey: 'calc.param.waterDensity',
          descriptionKey: 'calc.paramDesc.waterDensity',
          units: ['kg/m³'],
          defaultValue: 1000,
          range: { min: 990, max: 1010 }
        },
        {
          symbol: 'g',
          nameKey: 'calc.param.gravity',
          descriptionKey: 'calc.paramDesc.gravity',
          units: ['m/s²'],
          defaultValue: 9.81,
          range: { min: 9.78, max: 9.82 }
        },
        {
          symbol: 'Q',
          nameKey: 'calc.param.flowRate',
          descriptionKey: 'calc.paramDesc.flowRate',
          units: ['l/s', 'm³/s'],
          range: { min: 0, max: 10 }
        },
        {
          symbol: 'H',
          nameKey: 'calc.param.totalHead',
          descriptionKey: 'calc.paramDesc.totalHead',
          units: ['m', 'ft'],
          range: { min: 0, max: 1000 }
        },
        {
          symbol: 'η',
          nameKey: 'calc.param.efficiency',
          descriptionKey: 'calc.paramDesc.efficiency',
          units: ['decimal'],
          defaultValue: 0.75,
          range: { min: 0.4, max: 0.9 }
        }
      ],
      units: {
        length: 'meters',
        flow: 'm3/s',
        pressure: 'mH2O',
        diameter: 'mm'
      }
    })
  }
  
  calculate(
    formulaId: string,
    inputs: Record<string, { value: number; unit: string }>
  ): CalculationResult {
    const formula = this.formulas.get(formulaId)
    if (!formula) {
      throw new Error(`Formula ${formulaId} not found`)
    }
    
    // Validate inputs
    const validation = this.validateInputs(formula, inputs)
    if (!validation.isValid) {
      throw new Error(`Invalid inputs: ${validation.errors.join(', ')}`)
    }
    
    // Convert units to standard SI
    const standardInputs = this.convertToStandardUnits(formula, inputs)
    
    // Perform calculation based on formula
    const result = this.performCalculation(formula, standardInputs)
    
    // Generate warnings and recommendations
    const warnings = this.checkWarnings(formula, standardInputs, result)
    const recommendations = this.generateRecommendations(formula, standardInputs, result)
    
    return {
      formula: formulaId,
      inputs,
      result,
      warnings,
      recommendations,
      intermediateSteps: result.steps
    }
  }
  
  private validateInputs(
    formula: HydraulicFormula,
    inputs: Record<string, { value: number; unit: string }>
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = []
    
    // Check required parameters
    for (const param of formula.parameters) {
      if (!param.defaultValue && !inputs[param.symbol]) {
        errors.push(`Missing required parameter: ${param.symbol}`)
      }
    }
    
    // Validate ranges
    for (const [symbol, input] of Object.entries(inputs)) {
      const param = formula.parameters.find(p => p.symbol === symbol)
      if (param && param.range) {
        if (input.value < param.range.min || input.value > param.range.max) {
          errors.push(
            `${symbol} = ${input.value} is outside the valid range [${param.range.min}, ${param.range.max}]`
          )
        }
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    }
  }
  
  private convertToStandardUnits(
    formula: HydraulicFormula,
    inputs: Record<string, { value: number; unit: string }>
  ): Record<string, number> {
    const standardInputs: Record<string, number> = {}
    
    for (const [symbol, input] of Object.entries(inputs)) {
      const param = formula.parameters.find(p => p.symbol === symbol)
      if (param) {
        // Convert to SI units
        standardInputs[symbol] = this.unitConverter.convert(
          input.value,
          input.unit,
          this.getStandardUnit(param)
        )
      }
    }
    
    // Add default values for missing optional parameters
    for (const param of formula.parameters) {
      if (param.defaultValue && !standardInputs[param.symbol]) {
        standardInputs[param.symbol] = param.defaultValue
      }
    }
    
    return standardInputs
  }
  
  private getStandardUnit(param: FormulaParameter): string {
    // Infer type from units
    if (param.units.includes('m') || param.units.includes('ft')) return 'm'
    if (param.units.includes('m³/s') || param.units.includes('l/s')) return 'm³/s'
    if (param.units.includes('m/s') || param.units.includes('ft/s')) return 'm/s'
    if (param.units.includes('Pa') || param.units.includes('kPa')) return 'Pa'
    if (param.units.includes('kg/m³')) return 'kg/m³'
    
    return param.units[0] // Default to first unit if no match
  }
  
  private performCalculation(
    formula: HydraulicFormula,
    inputs: Record<string, number>
  ): { value: number; unit: string; steps?: any[] } {
    switch (formula.id) {
      case 'darcy-weisbach':
        return this.calculateDarcyWeisbach(inputs)
      
      case 'hazen-williams':
        return this.calculateHazenWilliams(inputs)
      
      case 'colebrook-white':
        return this.calculateColebrookWhite(inputs)
      
      case 'water-hammer':
        return this.calculateWaterHammer(inputs)
      
      case 'tank-volume':
        return this.calculateTankVolume(inputs)
      
      case 'pump-power':
        return this.calculatePumpPower(inputs)
      
      default:
        throw new Error(`Calculation not implemented for ${formula.id}`)
    }
  }
  
  private calculateDarcyWeisbach(inputs: Record<string, number>) {
    const { f, L, D, V } = inputs
    const g = 9.81 // gravitational acceleration
    
    const steps = [
      {
        descriptionKey: 'calc.step.velocityHead',
        formula: 'V²/(2g)',
        result: (V * V) / (2 * g),
        unit: 'm'
      },
      {
        descriptionKey: 'calc.step.ldRatio',
        formula: 'L/D',
        result: L / D,
        // Una relación entre dos longitudes no tiene unidad, y decir que la
        // tiene sería peor que no decir nada.
        unit: ''
      },
      {
        descriptionKey: 'calc.step.headLoss',
        formula: 'hf = f × (L/D) × (V²/2g)',
        result: f * (L / D) * (V * V) / (2 * g),
        unit: 'm'
      }
    ]
    
    const hf = f * (L / D) * (V * V) / (2 * g)
    
    return {
      value: hf,
      unit: 'm',
      steps
    }
  }
  
  private calculateHazenWilliams(inputs: Record<string, number>) {
    const { Q, C, L, D } = inputs
    
    // Convert to consistent units (SI)
    const steps = [
      {
        descriptionKey: 'calc.step.hazenWilliams',
        formula: 'hf = 10.67 × (Q/C)^1.852 × L / D^4.8704',
        result: 10.67 * Math.pow(Q / C, 1.852) * L / Math.pow(D, 4.8704),
        unit: 'm'
      }
    ]
    
    const hf = 10.67 * Math.pow(Q / C, 1.852) * L / Math.pow(D, 4.8704)
    
    return {
      value: hf,
      unit: 'm',
      steps
    }
  }
  
  private calculateColebrookWhite(inputs: Record<string, number>) {
    const { Re, ε, D } = inputs
    
    // Iterative solution for friction factor
    let f = 0.02 // Initial guess
    let f_old = 0
    let iterations = 0
    const maxIterations = 100
    const tolerance = 1e-6
    
    const steps = []
    
    while (Math.abs(f - f_old) > tolerance && iterations < maxIterations) {
      f_old = f
      const term1 = ε / (3.7 * D)
      const term2 = 2.51 / (Re * Math.sqrt(f))
      f = Math.pow(1 / (-2 * Math.log10(term1 + term2)), 2)
      
      iterations++
      
      if (iterations === 1 || iterations % 10 === 0 || Math.abs(f - f_old) <= tolerance) {
        steps.push({
          description: `Iteration ${iterations}`,
          formula: '1/√f = -2 × log10(ε/(3.7×D) + 2.51/(Re×√f))',
          result: f,
          // El factor de fricción es adimensional.
          unit: ''
        })
      }
    }
    
    return {
      value: f,
      unit: 'dimensionless',
      steps
    }
  }
  
  private calculateWaterHammer(inputs: Record<string, number>) {
    const { ρ, c, ΔV } = inputs
    
    const steps = [
      {
        descriptionKey: 'calc.step.joukowsky',
        formula: 'ΔP = ρ × c × ΔV',
        result: ρ * c * ΔV,
        unit: 'Pa'
      },
      {
        descriptionKey: 'calc.step.toKpa',
        formula: 'ΔP / 1000',
        result: (ρ * c * ΔV) / 1000,
        unit: 'kPa'
      }
    ]
    
    const ΔP = ρ * c * ΔV // Pascals
    
    return {
      value: ΔP / 1000, // Convert to kPa
      unit: 'kPa',
      steps
    }
  }
  
  private calculateTankVolume(inputs: Record<string, number>) {
    const { Qmax, t, Vfire = 0, Vemergency = 0 } = inputs
    
    const steps = [
      {
        descriptionKey: 'calc.step.regulationVolume',
        formula: 'Vreg = Qmax × t',
        result: Qmax * t,
        unit: 'm³'
      },
      {
        descriptionKey: 'calc.step.addFire',
        formula: 'Vreg + Vfire',
        result: Qmax * t + Vfire,
        unit: 'm³'
      },
      {
        descriptionKey: 'calc.step.addEmergency',
        formula: 'Vreg + Vfire + Vemergency',
        result: Qmax * t + Vfire + Vemergency,
        unit: 'm³'
      }
    ]
    
    const V = Qmax * t + Vfire + Vemergency
    
    return {
      value: V,
      unit: 'm³',
      steps
    }
  }
  
  private calculatePumpPower(inputs: Record<string, number>) {
    const { ρ, g, Q, H, η } = inputs
    
    const steps = [
      {
        descriptionKey: 'calc.step.hydraulicPower',
        formula: 'Phyd = ρ × g × Q × H',
        result: ρ * g * Q * H,
        unit: 'W'
      },
      {
        descriptionKey: 'calc.step.applyEfficiency',
        formula: 'P = Phyd / η',
        result: (ρ * g * Q * H) / η,
        unit: 'W'
      },
      {
        descriptionKey: 'calc.step.toKw',
        formula: 'P / 1000',
        result: (ρ * g * Q * H) / (η * 1000),
        unit: 'kW'
      }
    ]
    
    const P = (ρ * g * Q * H) / (η * 1000) // kW
    
    return {
      value: P,
      unit: 'kW',
      steps
    }
  }
  
  private checkWarnings(
    formula: HydraulicFormula,
    inputs: Record<string, number>,
    result: { value: number; unit: string }
  ): AvisoDelMotor[] {
    const warnings: AvisoDelMotor[] = []
    
    // Formula-specific warnings
    switch (formula.id) {
      case 'darcy-weisbach':
      case 'hazen-williams': {
        const velocity = inputs.V || (inputs.Q ? (inputs.Q * 4) / (Math.PI * inputs.D * inputs.D) : 0)
        if (velocity > 3) {
          warnings.push(aviso('highVelocityDiameter', { velocidad: velocity.toFixed(2) }))
        }
        if (velocity < 0.6) {
          warnings.push(aviso('lowVelocityValue', { velocidad: velocity.toFixed(2) }))
        }
        break
      }
      
      case 'water-hammer':
        if (result.value > 1000) {
          warnings.push(aviso('extremeSurge', { kpa: result.value.toFixed(0) }))
        }
        break
      
      case 'pump-power':
        if (inputs.η < 0.6) {
          warnings.push(aviso('lowEfficiencyValue', { pct: (inputs.η * 100).toFixed(0) }))
        }
        break
    }
    
    return warnings
  }
  
  private generateRecommendations(
    formula: HydraulicFormula,
    inputs: Record<string, number>,
    result: { value: number; unit: string }
  ): AvisoDelMotor[] {
    const recommendations: AvisoDelMotor[] = []
    
    switch (formula.id) {
      case 'darcy-weisbach':
      case 'hazen-williams':
        if (result.value > 10) {
          recommendations.push(aviso('largerDiameter'))
          recommendations.push(aviso('boosterPumps'))
        }
        break
      
      case 'water-hammer':
        recommendations.push(aviso('airChambers'))
        recommendations.push(aviso('slowValves'))
        break
      
      case 'tank-volume':
        recommendations.push(aviso('localRegulations'))
        recommendations.push(aviso('futureDemand'))
        break
    }
    
    return recommendations
  }
  
  // Get all available formulas
  getAvailableFormulas(): HydraulicFormula[] {
    return Array.from(this.formulas.values())
  }
  
  // Get formulas by category
  getFormulasByCategory(category: string): HydraulicFormula[] {
    return Array.from(this.formulas.values()).filter(f => f.category === category)
  }
}

// Unit conversion utility
class UnitConverter {
  private conversionFactors: Map<string, Map<string, number>>
  
  constructor() {
    this.conversionFactors = new Map()
    this.initializeConversions()
  }
  
  private initializeConversions() {
    // Length conversions (to meters)
    this.addConversion('length', {
      'm': 1,
      'mm': 0.001,
      'cm': 0.01,
      'km': 1000,
      'ft': 0.3048,
      'in': 0.0254,
      'mi': 1609.344
    })
    
    // Flow conversions (to m³/s)
    this.addConversion('flow', {
      'm³/s': 1,
      'm3/s': 1,
      'l/s': 0.001,
      // La grafía anterior sigue reconociéndose: hay cálculos guardados con ella.
      'L/s': 0.001,
      'm³/h': 1/3600,
      'm3/h': 1/3600,
      'gpm': 0.0000630902,
      'cfs': 0.0283168466
    })
    
    // Pressure conversions (to Pa)
    this.addConversion('pressure', {
      'Pa': 1,
      'kPa': 1000,
      'bar': 100000,
      'psi': 6894.757,
      'mH2O': 9806.65,
      'mca': 9806.65,
      'm.c.a.': 9806.65
    })
    
    // Time conversions (to seconds)
    this.addConversion('time', {
      's': 1,
      'min': 60,
      'h': 3600,
      'day': 86400
    })
  }
  
  private addConversion(category: string, factors: Record<string, number>) {
    this.conversionFactors.set(category, new Map(Object.entries(factors)))
  }
  
  convert(value: number, fromUnit: string, toUnit: string): number {
    if (fromUnit === toUnit) return value
    
    // Find conversion category
    for (const [, factors] of this.conversionFactors) {
      if (factors.has(fromUnit) && factors.has(toUnit)) {
        const fromFactor = factors.get(fromUnit)!
        const toFactor = factors.get(toUnit)!
        return value * fromFactor / toFactor
      }
    }
    
    // If no conversion found, return original value
    console.warn(`No conversion found from ${fromUnit} to ${toUnit}`)
    return value
  }
}