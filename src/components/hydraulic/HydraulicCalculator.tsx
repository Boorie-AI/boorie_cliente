import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useClarity } from '@/components/ClarityProvider'
import {
  Calculator,
  Info,
  AlertCircle,
  CheckCircle,
  Copy,
  Save,
  FileText,
  Activity,
  Droplets,
  Gauge,
  Waves,
  Zap,
  TrendingUp,
  Network,
  RefreshCw,
  Code2,
  FlaskConical,
  ArrowRight
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { hydraulicService } from '@/services/hydraulic/hydraulicService'
import { HydraulicFormula, CalculationResult, FormulaParameter } from '@/types/hydraulic'
import * as Tabs from '@radix-ui/react-tabs'
import * as Tooltip from '@radix-ui/react-tooltip'
import * as Progress from '@radix-ui/react-progress'

export function HydraulicCalculator() {
  const { t } = useTranslation()
  const { trackEvent, isReady: clarityReady } = useClarity()
  const [formulas, setFormulas] = useState<HydraulicFormula[]>([])
  const [selectedFormula, setSelectedFormula] = useState<HydraulicFormula | null>(null)
  const [inputs, setInputs] = useState<Record<string, { value: string; unit: string }>>({})
  const [result, setResult] = useState<CalculationResult | null>(null)
  const [calculating, setCalculating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string>('head_loss')
  const [selectedFormulaIndex, setSelectedFormulaIndex] = useState<number>(0)
  
  useEffect(() => {
    loadFormulas()
  }, [])
  
  const loadFormulas = async () => {
    try {
      const formulaList = await hydraulicService.getFormulas()
      setFormulas(formulaList)
      
      // Select first formula by default
      if (formulaList.length > 0) {
        const defaultFormula = formulaList.find(f => f.category === activeCategory) || formulaList[0]
        selectFormula(defaultFormula)
      }
    } catch (error) {
      console.error('Failed to load formulas:', error)
    }
  }
  
  const selectFormula = (formula: HydraulicFormula) => {
    setSelectedFormula(formula)
    setResult(null)
    setError(null)
    
    // Initialize inputs with default values
    const initialInputs: Record<string, { value: string; unit: string }> = {}
    formula.parameters.forEach(param => {
      initialInputs[param.symbol] = {
        value: param.defaultValue?.toString() || '',
        unit: param.units[0]
      }
    })
    setInputs(initialInputs)
  }
  
  const handleCalculate = async () => {
    if (!selectedFormula) return
    
    console.log('Starting calculation for formula:', selectedFormula.id)
    console.log('Current inputs:', inputs)
    
    // Track calculation start
    if (clarityReady) {
      trackEvent('hydraulic_calculation_started', {
        formula_id: selectedFormula.id,
        formula_name: selectedFormula.name,
        category: selectedFormula.category,
        input_count: Object.keys(inputs).length
      });
    }
    
    // Validate inputs
    const missingInputs = selectedFormula.parameters
      .filter(p => !p.defaultValue && !inputs[p.symbol]?.value)
      .map(p => p.name)
    
    if (missingInputs.length > 0) {
      setError(`Missing required inputs: ${missingInputs.join(', ')}`)
      return
    }
    
    try {
      setCalculating(true)
      setError(null)
      
      // Convert string values to numbers
      const numericInputs: Record<string, { value: number; unit: string }> = {}
      for (const [key, input] of Object.entries(inputs)) {
        const value = parseFloat(input.value)
        if (isNaN(value)) {
          throw new Error(`Invalid value for ${key}`)
        }
        numericInputs[key] = { value, unit: input.unit }
      }
      
      console.log('Numeric inputs:', numericInputs)
      
      const calculationResult = await hydraulicService.calculate(
        selectedFormula.id,
        numericInputs
      )
      
      console.log('Calculation result:', calculationResult)
      
      if (!calculationResult) {
        throw new Error('No result returned from calculation')
      }
      
      setResult(calculationResult)
      
      // Track successful calculation
      if (clarityReady) {
        trackEvent('hydraulic_calculation_completed', {
          formula_id: selectedFormula.id,
          formula_name: selectedFormula.name,
          category: selectedFormula.category,
          result_value: calculationResult.result.value,
          result_unit: calculationResult.result.unit,
          success: true
        });
      }
    } catch (err) {
      console.error('Calculation error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Calculation failed';
      setError(errorMessage)
      
      // Track calculation error
      if (clarityReady) {
        trackEvent('hydraulic_calculation_error', {
          formula_id: selectedFormula?.id,
          formula_name: selectedFormula?.name,
          category: selectedFormula?.category,
          error_message: errorMessage,
          success: false
        });
      }
    } finally {
      setCalculating(false)
    }
  }
  
  const handleInputChange = (symbol: string, field: 'value' | 'unit', value: string) => {
    setInputs({
      ...inputs,
      [symbol]: {
        ...inputs[symbol],
        [field]: value
      }
    })
    // Clear result when input changes
    setResult(null)
  }
  
  const copyResult = () => {
    if (!result) return
    
    const text = `${selectedFormula?.name}\n` +
      `Result: ${result.result.value.toFixed(4)} ${result.result.unit}\n` +
      `Formula: ${selectedFormula?.equation}\n\n` +
      `Inputs:\n${Object.entries(result.inputs)
        .map(([key, val]) => `${key} = ${val.value} ${val.unit}`)
        .join('\n')}`
    
    navigator.clipboard.writeText(text)
  }
  
  const categories = [
    { 
      id: 'head_loss', 
      name: 'Head Loss', 
      icon: Droplets,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-950/30',
      description: 'Darcy-Weisbach, Hazen-Williams, and minor losses'
    },
    { 
      id: 'flow', 
      name: 'Flow', 
      icon: Waves,
      color: 'text-cyan-600 dark:text-cyan-400',
      bgColor: 'bg-cyan-50 dark:bg-cyan-950/30',
      description: 'Flow rate, velocity, and continuity calculations'
    },
    { 
      id: 'pump', 
      name: 'Pumps', 
      icon: Activity,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-950/30',
      description: 'Power, efficiency, and pump curves'
    },
    { 
      id: 'tank_sizing', 
      name: 'Tanks', 
      icon: Gauge,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-950/30',
      description: 'Volume, dimensions, and retention time'
    },
    { 
      id: 'water_hammer', 
      name: 'Water Hammer', 
      icon: Zap,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-950/30',
      description: 'Pressure surge and transient analysis'
    }
  ]
  
  const formulasByCategory = formulas.reduce((acc, formula) => {
    if (!acc[formula.category]) acc[formula.category] = []
    acc[formula.category].push(formula)
    return acc
  }, {} as Record<string, HydraulicFormula[]>)
  
  const currentCategory = categories.find(c => c.id === activeCategory)!
  const currentFormulas = formulasByCategory[activeCategory] || []
  
  // When category changes, select first formula
  useEffect(() => {
    if (currentFormulas.length > 0 && !currentFormulas.find(f => f.id === selectedFormula?.id)) {
      setSelectedFormulaIndex(0)
      selectFormula(currentFormulas[0])
    }
  }, [activeCategory, formulas])
  
  return (
    <div className="flex-1 flex flex-col bg-background h-full">
      {/* Fixed Header */}
      <div className="border-b border-border bg-background">
        {/* Title Bar */}
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Calculator className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Hydraulic Calculator
              </h1>
              <p className="text-sm text-muted-foreground">
                Professional engineering calculations powered by Python
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-100/80 dark:bg-emerald-950/30">
              <Code2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Python Engine</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-100/80 dark:bg-blue-950/30">
              <FlaskConical className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">Scientific</span>
            </div>
          </div>
        </div>
        
        {/* Category Navigation */}
        <div className="flex gap-0 px-6 bg-muted/20">
          {categories.map((category) => {
            const Icon = category.icon
            const isActive = activeCategory === category.id
            return (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={cn(
                  "px-6 py-4 flex items-center gap-3 border-b-3 transition-all",
                  "hover:bg-accent/50",
                  isActive
                    ? "border-primary text-primary bg-background font-semibold"
                    : "border-transparent text-muted-foreground"
                )}
              >
                <Icon className={cn("w-5 h-5", isActive && category.color)} />
                <span>{category.name}</span>
              </button>
            )
          })}
        </div>
      </div>
      
      {/* Full Screen Content Area with overflow hidden */}
      <div className="flex-1 flex p-6 gap-6 bg-muted/10 overflow-hidden">
        {/* Formula Selector */}
        <div className="w-80 bg-card rounded-xl border border-border shadow-sm flex flex-col h-full">
          <div className="p-4 border-b border-border flex-shrink-0">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <currentCategory.icon className={cn("w-5 h-5", currentCategory.color)} />
              {currentCategory.name} Formulas
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {currentCategory.description}
            </p>
          </div>
          
          <div className="flex-1 p-4 overflow-y-auto scrollbar-visible">
            <div className="space-y-2">
              {currentFormulas.map((formula, index) => (
                <button
                  key={formula.id}
                  onClick={() => {
                    setSelectedFormulaIndex(index)
                    selectFormula(formula)
                  }}
                  className={cn(
                    "w-full p-4 rounded-lg text-left transition-all",
                    "border-2",
                    selectedFormulaIndex === index
                      ? "bg-primary text-primary-foreground border-primary shadow-lg"
                      : "bg-background hover:bg-accent border-border hover:border-primary/50"
                  )}
                >
                  <div className="font-semibold mb-1">{formula.name}</div>
                  <div className={cn(
                    "text-sm font-mono",
                    selectedFormulaIndex === index
                      ? "text-primary-foreground/90"
                      : "text-muted-foreground"
                  )}>
                    {formula.equation}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {/* Main Calculation Area */}
        <div className="flex-1 bg-card rounded-xl border border-border shadow-sm flex h-full">
          {selectedFormula ? (
            <div className="flex-1 flex">
              {/* Input Panel */}
              <div className="flex-1 border-r border-border overflow-hidden flex flex-col">
                <div className="flex-1 p-8 overflow-y-auto scrollbar-visible">
                  <div className="max-w-2xl mx-auto">
                    <div className="mb-8">
                      <h2 className="text-2xl font-bold text-foreground mb-2">
                        {selectedFormula.name}
                      </h2>
                      <div className="font-mono text-xl text-primary bg-primary/10 px-4 py-2 rounded-lg inline-block">
                        {selectedFormula.equation}
                      </div>
                    </div>
                  
                  <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                      <Droplets className="w-5 h-5 text-primary" />
                      Input Parameters
                    </h3>
                    
                    <div className="grid gap-6">
                      {selectedFormula.parameters.map((param) => (
                        <div key={param.symbol} className="bg-muted/50 p-6 rounded-lg border border-border">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex-1">
                              <label className="text-base font-semibold text-foreground flex items-center gap-2">
                                <span className="text-primary font-mono text-lg bg-primary/10 px-2 py-1 rounded">
                                  {param.symbol}
                                </span>
                                {param.name}
                              </label>
                              <p className="text-sm text-muted-foreground mt-1">
                                {param.description}
                              </p>
                              {param.range && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Valid range: {param.range.min} - {param.range.max}
                                </p>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex gap-3">
                            <input
                              type="number"
                              value={inputs[param.symbol]?.value || ''}
                              onChange={(e) => handleInputChange(param.symbol, 'value', e.target.value)}
                              className={cn(
                                "flex-1 px-4 py-3 rounded-lg text-base",
                                "bg-background border-2 border-border",
                                "focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary",
                                "placeholder:text-muted-foreground"
                              )}
                              placeholder={param.defaultValue?.toString() || 'Enter value'}
                              step="any"
                            />
                            
                            <select
                              value={inputs[param.symbol]?.unit || param.units[0]}
                              onChange={(e) => handleInputChange(param.symbol, 'unit', e.target.value)}
                              className={cn(
                                "px-4 py-3 rounded-lg text-base font-medium",
                                "bg-background border-2 border-border",
                                "focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                              )}
                            >
                              {param.units.map((unit) => (
                                <option key={unit} value={unit}>{unit}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <button
                      onClick={handleCalculate}
                      disabled={calculating}
                      className={cn(
                        "w-full py-4 rounded-lg font-semibold text-lg",
                        "bg-primary text-primary-foreground",
                        "hover:bg-primary/90 transition-all",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        "flex items-center justify-center gap-3",
                        "sticky bottom-0 shadow-lg"
                      )}
                    >
                      {calculating ? (
                        <>
                          <RefreshCw className="w-5 h-5 animate-spin" />
                          Calculating with Python...
                        </>
                      ) : (
                        <>
                          <Calculator className="w-5 h-5" />
                          Calculate
                          <ArrowRight className="w-5 h-5" />
                        </>
                      )}
                    </button>
                  </div>
                  </div>
                </div>
              </div>
              
              {/* Results Panel */}
              <div className="w-96 bg-muted/20 flex flex-col">
                <div className="p-8 pb-4">
                  <h3 className="text-lg font-semibold text-foreground">
                    Results
                  </h3>
                </div>
                <div className="flex-1 px-8 pb-8 overflow-y-auto scrollbar-visible">
                
                {error && (
                  <div className="p-4 rounded-lg bg-destructive/10 text-destructive flex items-start gap-2 mb-4">
                    <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                
                {result ? (
                  <div className="space-y-6">
                    <div className="bg-card p-6 rounded-lg border border-border">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-semibold text-foreground">Calculation Result</h4>
                        <div className="flex gap-2">
                          <button
                            onClick={copyResult}
                            className="p-2 rounded hover:bg-accent transition-colors"
                            title="Copy result"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="text-3xl font-bold text-primary">
                        {result.result.value.toFixed(4)} {result.result.unit}
                      </div>
                    </div>
                    
                    {result.intermediateSteps && result.intermediateSteps.length > 0 && (
                      <div className="bg-card p-6 rounded-lg border border-border">
                        <h4 className="font-semibold text-foreground mb-4">Calculation Steps</h4>
                        <div className="space-y-3">
                          {result.intermediateSteps.map((step, index) => (
                            <div key={index} className="text-sm">
                              <div className="text-muted-foreground">{step.description}</div>
                              <div className="font-mono text-foreground bg-muted px-2 py-1 rounded mt-1">
                                {step.formula} = {step.result.toFixed(4)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {result.warnings && result.warnings.length > 0 && (
                      <div className="bg-yellow-500/10 p-4 rounded-lg border border-yellow-500/20">
                        <h4 className="font-semibold text-yellow-700 dark:text-yellow-400 mb-2 flex items-center gap-2">
                          <AlertCircle className="w-5 h-5" />
                          Warnings
                        </h4>
                        <ul className="list-disc list-inside space-y-1 text-sm">
                          {result.warnings.map((warning, index) => (
                            <li key={index} className="text-yellow-700 dark:text-yellow-400">
                              {warning}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {result.recommendations && result.recommendations.length > 0 && (
                      <div className="bg-green-500/10 p-4 rounded-lg border border-green-500/20">
                        <h4 className="font-semibold text-green-700 dark:text-green-400 mb-2 flex items-center gap-2">
                          <CheckCircle className="w-5 h-5" />
                          Recommendations
                        </h4>
                        <ul className="list-disc list-inside space-y-1 text-sm">
                          {result.recommendations.map((rec, index) => (
                            <li key={index} className="text-green-700 dark:text-green-400">
                              {rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                      <Calculator className="w-12 h-12 mb-3 opacity-50" />
                      <p className="text-sm text-center">
                        Enter values and click Calculate to see results
                      </p>
                    </div>
                    
                    {/* Placeholder sections to ensure scrollbar visibility */}
                    <div className="bg-card/50 p-6 rounded-lg border border-border/50">
                      <h4 className="font-semibold text-muted-foreground/50 mb-2">Calculation History</h4>
                      <p className="text-sm text-muted-foreground/40">Previous calculations will appear here</p>
                    </div>
                    
                    <div className="bg-card/50 p-6 rounded-lg border border-border/50">
                      <h4 className="font-semibold text-muted-foreground/50 mb-2">Quick Reference</h4>
                      <p className="text-sm text-muted-foreground/40">Formula documentation and tips</p>
                    </div>
                    
                    <div className="bg-card/50 p-6 rounded-lg border border-border/50">
                      <h4 className="font-semibold text-muted-foreground/50 mb-2">Export Options</h4>
                      <p className="text-sm text-muted-foreground/40">Save and export your calculations</p>
                    </div>
                  </div>
                )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <currentCategory.icon className={cn("w-16 h-16 mx-auto mb-4", currentCategory.color)} />
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  Select a {currentCategory.name} Formula
                </h3>
                <p className="text-muted-foreground">
                  Choose a formula from the left panel to begin
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}