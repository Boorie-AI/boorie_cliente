import {
  HydraulicFormula,
  CalculationResult,
  FormulaParameter,
  UnitSystem
} from '../../../src/types/hydraulic'

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
      name: 'Darcy-Weisbach Head Loss',
      category: 'head_loss',
      equation: 'hf = f * (L/D) * (V²/2g)',
      parameters: [
        {
          symbol: 'f',
          name: 'Friction factor',
          description: 'Darcy friction factor (dimensionless)',
          units: ['dimensionless'],
          range: { min: 0.008, max: 0.1 }
        },
        {
          symbol: 'L',
          name: 'Pipe length',
          description: 'Length of the pipe',
          units: ['m', 'ft'],
          range: { min: 0, max: 100000 }
        },
        {
          symbol: 'D',
          name: 'Pipe diameter',
          description: 'Internal diameter of the pipe',
          units: ['m', 'mm', 'in'],
          range: { min: 0.01, max: 10 }
        },
        {
          symbol: 'V',
          name: 'Flow velocity',
          description: 'Average flow velocity',
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
      name: 'Hazen-Williams Head Loss',
      category: 'head_loss',
      equation: 'hf = 10.67 * (Q/C)^1.852 * L / D^4.8704',
      parameters: [
        {
          symbol: 'Q',
          name: 'Flow rate',
          description: 'Volumetric flow rate',
          units: ['m³/s', 'L/s', 'gpm'],
          range: { min: 0, max: 10 }
        },
        {
          symbol: 'C',
          name: 'Hazen-Williams coefficient',
          description: 'Roughness coefficient',
          units: ['dimensionless'],
          defaultValue: 140,
          range: { min: 50, max: 150 }
        },
        {
          symbol: 'L',
          name: 'Pipe length',
          description: 'Length of the pipe',
          units: ['m', 'ft'],
          range: { min: 0, max: 100000 }
        },
        {
          symbol: 'D',
          name: 'Pipe diameter',
          description: 'Internal diameter',
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
      name: 'Colebrook-White Friction Factor',
      category: 'flow',
      equation: '1/√f = -2 * log10(ε/(3.7*D) + 2.51/(Re*√f))',
      parameters: [
        {
          symbol: 'Re',
          name: 'Reynolds number',
          description: 'Reynolds number',
          units: ['dimensionless'],
          range: { min: 2000, max: 1e8 }
        },
        {
          symbol: 'ε',
          name: 'Roughness',
          description: 'Absolute roughness',
          units: ['m', 'mm'],
          defaultValue: 0.0015,
          range: { min: 0, max: 0.05 }
        },
        {
          symbol: 'D',
          name: 'Diameter',
          description: 'Pipe diameter',
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
      name: 'Water Hammer (Joukowsky)',
      category: 'water_hammer',
      equation: 'ΔP = ρ * c * ΔV',
      parameters: [
        {
          symbol: 'ρ',
          name: 'Water density',
          description: 'Density of water',
          units: ['kg/m³'],
          defaultValue: 1000,
          range: { min: 990, max: 1010 }
        },
        {
          symbol: 'c',
          name: 'Wave speed',
          description: 'Pressure wave speed',
          units: ['m/s'],
          defaultValue: 1200,
          range: { min: 200, max: 1500 }
        },
        {
          symbol: 'ΔV',
          name: 'Velocity change',
          description: 'Change in flow velocity',
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
      name: 'Tank Volume Calculation',
      category: 'tank_sizing',
      equation: 'V = Qmax * t + Vfire + Vemergency',
      parameters: [
        {
          symbol: 'Qmax',
          name: 'Maximum hourly demand',
          description: 'Peak hour demand',
          units: ['m³/h', 'L/s', 'gpm'],
          range: { min: 0, max: 10000 }
        },
        {
          symbol: 't',
          name: 'Regulation time',
          description: 'Hours of regulation',
          units: ['h'],
          defaultValue: 4,
          range: { min: 2, max: 24 }
        },
        {
          symbol: 'Vfire',
          name: 'Fire reserve',
          description: 'Volume for fire protection',
          units: ['m³', 'L'],
          defaultValue: 0,
          range: { min: 0, max: 5000 }
        },
        {
          symbol: 'Vemergency',
          name: 'Emergency reserve',
          description: 'Emergency storage volume',
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
      name: 'Pump Power Requirement',
      category: 'pump',
      equation: 'P = (ρ * g * Q * H) / (η * 1000)',
      parameters: [
        {
          symbol: 'ρ',
          name: 'Water density',
          description: 'Density of water',
          units: ['kg/m³'],
          defaultValue: 1000,
          range: { min: 990, max: 1010 }
        },
        {
          symbol: 'g',
          name: 'Gravity',
          description: 'Gravitational acceleration',
          units: ['m/s²'],
          defaultValue: 9.81,
          range: { min: 9.78, max: 9.82 }
        },
        {
          symbol: 'Q',
          name: 'Flow rate',
          description: 'Pump flow rate',
          units: ['m³/s', 'L/s'],
          range: { min: 0, max: 10 }
        },
        {
          symbol: 'H',
          name: 'Total head',
          description: 'Total dynamic head',
          units: ['m', 'ft'],
          range: { min: 0, max: 1000 }
        },
        {
          symbol: 'η',
          name: 'Efficiency',
          description: 'Pump efficiency',
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
        errors.push(`Missing required parameter: ${param.name} (${param.symbol})`)
      }
    }
    
    // Validate ranges
    for (const [symbol, input] of Object.entries(inputs)) {
      const param = formula.parameters.find(p => p.symbol === symbol)
      if (param && param.range) {
        if (input.value < param.range.min || input.value > param.range.max) {
          errors.push(
            `${param.name} (${symbol}) value ${input.value} is outside valid range [${param.range.min}, ${param.range.max}]`
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
    // Map parameter types to standard SI units
    const standardUnits: Record<string, string> = {
      'length': 'm',
      'diameter': 'm',
      'flow': 'm³/s',
      'velocity': 'm/s',
      'pressure': 'Pa',
      'density': 'kg/m³',
      'dimensionless': 'dimensionless'
    }
    
    // Infer type from units
    if (param.units.includes('m') || param.units.includes('ft')) return 'm'
    if (param.units.includes('m³/s') || param.units.includes('L/s')) return 'm³/s'
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
        description: 'Calculate velocity head',
        formula: 'V²/(2g)',
        result: (V * V) / (2 * g)
      },
      {
        description: 'Calculate L/D ratio',
        formula: 'L/D',
        result: L / D
      },
      {
        description: 'Calculate head loss',
        formula: 'hf = f × (L/D) × (V²/2g)',
        result: f * (L / D) * (V * V) / (2 * g)
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
        description: 'Apply Hazen-Williams formula',
        formula: 'hf = 10.67 × (Q/C)^1.852 × L / D^4.8704',
        result: 10.67 * Math.pow(Q / C, 1.852) * L / Math.pow(D, 4.8704)
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
          result: f
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
        description: 'Apply Joukowsky equation',
        formula: 'ΔP = ρ × c × ΔV',
        result: ρ * c * ΔV
      },
      {
        description: 'Convert to kPa',
        formula: 'ΔP / 1000',
        result: (ρ * c * ΔV) / 1000
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
        description: 'Calculate regulation volume',
        formula: 'Vreg = Qmax × t',
        result: Qmax * t
      },
      {
        description: 'Add fire reserve',
        formula: 'Vreg + Vfire',
        result: Qmax * t + Vfire
      },
      {
        description: 'Add emergency reserve',
        formula: 'Vreg + Vfire + Vemergency',
        result: Qmax * t + Vfire + Vemergency
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
        description: 'Calculate hydraulic power',
        formula: 'Phyd = ρ × g × Q × H',
        result: ρ * g * Q * H
      },
      {
        description: 'Apply efficiency',
        formula: 'P = Phyd / η',
        result: (ρ * g * Q * H) / η
      },
      {
        description: 'Convert to kW',
        formula: 'P / 1000',
        result: (ρ * g * Q * H) / (η * 1000)
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
  ): string[] {
    const warnings: string[] = []
    
    // Formula-specific warnings
    switch (formula.id) {
      case 'darcy-weisbach':
      case 'hazen-williams':
        const velocity = inputs.V || (inputs.Q ? (inputs.Q * 4) / (Math.PI * inputs.D * inputs.D) : 0)
        if (velocity > 3) {
          warnings.push(`High velocity (${velocity.toFixed(2)} m/s). Consider increasing pipe diameter to reduce head loss and prevent erosion.`)
        }
        if (velocity < 0.6) {
          warnings.push(`Low velocity (${velocity.toFixed(2)} m/s). Risk of sedimentation.`)
        }
        break
      
      case 'water-hammer':
        if (result.value > 1000) {
          warnings.push(`Extreme pressure surge (${result.value.toFixed(0)} kPa). Install surge protection devices.`)
        }
        break
      
      case 'pump-power':
        if (inputs.η < 0.6) {
          warnings.push(`Low pump efficiency (${(inputs.η * 100).toFixed(0)}%). Consider pump replacement or maintenance.`)
        }
        break
    }
    
    return warnings
  }
  
  private generateRecommendations(
    formula: HydraulicFormula,
    inputs: Record<string, number>,
    result: { value: number; unit: string }
  ): string[] {
    const recommendations: string[] = []
    
    switch (formula.id) {
      case 'darcy-weisbach':
      case 'hazen-williams':
        if (result.value > 10) {
          recommendations.push('Consider using a larger diameter pipe to reduce head loss')
          recommendations.push('Evaluate the possibility of adding booster pumps')
        }
        break
      
      case 'water-hammer':
        recommendations.push('Install air chambers or surge tanks near critical points')
        recommendations.push('Use slow-closing valves to reduce velocity changes')
        break
      
      case 'tank-volume':
        recommendations.push('Verify local regulations for minimum storage requirements')
        recommendations.push('Consider future demand growth in sizing')
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
    for (const [category, factors] of this.conversionFactors) {
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