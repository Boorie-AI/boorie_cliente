import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Calculator,
  Info,
  AlertCircle,
  CheckCircle,
  Copy,
  Save,
  FileText
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { hydraulicService } from '@/services/hydraulic/hydraulicService'
import { HydraulicFormula, CalculationResult, FormulaParameter } from '@/types/hydraulic'
import * as Tabs from '@radix-ui/react-tabs'
import * as Tooltip from '@radix-ui/react-tooltip'

export function HydraulicCalculator() {
  const { t } = useTranslation()
  const [formulas, setFormulas] = useState<HydraulicFormula[]>([])
  const [selectedFormula, setSelectedFormula] = useState<HydraulicFormula | null>(null)
  const [inputs, setInputs] = useState<Record<string, { value: string; unit: string }>>({})
  const [result, setResult] = useState<CalculationResult | null>(null)
  const [calculating, setCalculating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string>('head_loss')
  
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
      
      const calculationResult = await hydraulicService.calculate(
        selectedFormula.id,
        numericInputs
      )
      
      setResult(calculationResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Calculation failed')
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
    { id: 'head_loss', name: 'Head Loss', icon: '💧' },
    { id: 'flow', name: 'Flow', icon: '🌊' },
    { id: 'pump', name: 'Pumps', icon: '⚙️' },
    { id: 'tank_sizing', name: 'Tanks', icon: '🏗️' },
    { id: 'water_hammer', name: 'Water Hammer', icon: '🔨' }
  ]
  
  const formulasByCategory = formulas.reduce((acc, formula) => {
    if (!acc[formula.category]) acc[formula.category] = []
    acc[formula.category].push(formula)
    return acc
  }, {} as Record<string, HydraulicFormula[]>)
  
  return (
    <div className="flex-1 flex flex-col h-full bg-background">
      <div className="border-b border-border p-6">
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <Calculator className="w-6 h-6" />
          Hydraulic Calculator
        </h1>
        <p className="text-muted-foreground mt-1">
          Professional hydraulic calculations with industry-standard formulas
        </p>
      </div>
      
      <Tabs.Root
        value={activeCategory}
        onValueChange={setActiveCategory}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <Tabs.List className="flex gap-2 p-4 border-b border-border overflow-x-auto">
          {categories.map((category) => (
            <Tabs.Trigger
              key={category.id}
              value={category.id}
              className={cn(
                "px-4 py-2 rounded-lg flex items-center gap-2",
                "hover:bg-accent transition-colors",
                "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              )}
            >
              <span>{category.icon}</span>
              {category.name}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        
        {categories.map((category) => (
          <Tabs.Content
            key={category.id}
            value={category.id}
            className="flex-1 flex overflow-hidden"
          >
            <div className="flex flex-1 overflow-hidden">
              {/* Formula Selection */}
              <div className="w-64 border-r border-border p-4 overflow-y-auto">
                <h3 className="font-medium text-foreground mb-3">Select Formula</h3>
                <div className="space-y-2">
                  {formulasByCategory[category.id]?.map((formula) => (
                    <button
                      key={formula.id}
                      onClick={() => selectFormula(formula)}
                      className={cn(
                        "w-full p-3 rounded-lg text-left transition-colors",
                        "hover:bg-accent",
                        selectedFormula?.id === formula.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-card"
                      )}
                    >
                      <div className="font-medium text-sm">{formula.name}</div>
                      <div className="text-xs opacity-80 mt-1 font-mono">
                        {formula.equation}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Calculation Area */}
              <div className="flex-1 overflow-y-auto">
                {selectedFormula ? (
                  <div className="p-6 space-y-6">
                    {/* Formula Header */}
                    <div className="bg-card p-4 rounded-lg border border-border">
                      <h2 className="text-xl font-semibold text-foreground mb-2">
                        {selectedFormula.name}
                      </h2>
                      <div className="font-mono text-lg text-primary">
                        {selectedFormula.equation}
                      </div>
                    </div>
                    
                    {/* Input Parameters */}
                    <div className="space-y-4">
                      <h3 className="font-medium text-foreground">Input Parameters</h3>
                      {selectedFormula.parameters.map((param) => (
                        <div key={param.symbol} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-foreground">
                              {param.name} ({param.symbol})
                            </label>
                            <Tooltip.Provider>
                              <Tooltip.Root>
                                <Tooltip.Trigger asChild>
                                  <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                  <Tooltip.Content
                                    className="bg-popover px-3 py-2 rounded-lg shadow-lg max-w-xs text-sm"
                                    sideOffset={5}
                                  >
                                    <p>{param.description}</p>
                                    {param.range && (
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        Range: {param.range.min} - {param.range.max}
                                      </p>
                                    )}
                                  </Tooltip.Content>
                                </Tooltip.Portal>
                              </Tooltip.Root>
                            </Tooltip.Provider>
                          </div>
                          
                          <div className="flex gap-2">
                            <input
                              type="number"
                              value={inputs[param.symbol]?.value || ''}
                              onChange={(e) => handleInputChange(param.symbol, 'value', e.target.value)}
                              className={cn(
                                "flex-1 px-3 py-2 rounded-lg",
                                "bg-input border border-border",
                                "focus:outline-none focus:ring-2 focus:ring-ring",
                                "placeholder:text-muted-foreground"
                              )}
                              placeholder={param.defaultValue?.toString() || 'Enter value'}
                              step="any"
                            />
                            
                            <select
                              value={inputs[param.symbol]?.unit || param.units[0]}
                              onChange={(e) => handleInputChange(param.symbol, 'unit', e.target.value)}
                              className={cn(
                                "px-3 py-2 rounded-lg",
                                "bg-input border border-border",
                                "focus:outline-none focus:ring-2 focus:ring-ring"
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
                    
                    {/* Calculate Button */}
                    <button
                      onClick={handleCalculate}
                      disabled={calculating}
                      className={cn(
                        "w-full py-3 rounded-lg font-medium",
                        "bg-primary text-primary-foreground",
                        "hover:bg-primary/90 transition-colors",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        "flex items-center justify-center gap-2"
                      )}
                    >
                      <Calculator className="w-5 h-5" />
                      {calculating ? 'Calculating...' : 'Calculate'}
                    </button>
                    
                    {/* Error Display */}
                    {error && (
                      <div className="p-4 rounded-lg bg-destructive/10 text-destructive flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 mt-0.5" />
                        <span>{error}</span>
                      </div>
                    )}
                    
                    {/* Result Display */}
                    {result && (
                      <div className="space-y-4">
                        <div className="bg-card p-4 rounded-lg border border-border">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="font-medium text-foreground">Result</h3>
                            <div className="flex gap-2">
                              <button
                                onClick={copyResult}
                                className="p-2 rounded-lg hover:bg-accent transition-colors"
                                title="Copy result"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                              <button
                                className="p-2 rounded-lg hover:bg-accent transition-colors"
                                title="Save to project"
                              >
                                <Save className="w-4 h-4" />
                              </button>
                              <button
                                className="p-2 rounded-lg hover:bg-accent transition-colors"
                                title="Generate report"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          
                          <div className="text-2xl font-bold text-primary">
                            {result.result.value.toFixed(4)} {result.result.unit}
                          </div>
                        </div>
                        
                        {/* Calculation Steps */}
                        {result.intermediateSteps && result.intermediateSteps.length > 0 && (
                          <div className="bg-card p-4 rounded-lg border border-border">
                            <h3 className="font-medium text-foreground mb-3">Calculation Steps</h3>
                            <div className="space-y-2">
                              {result.intermediateSteps.map((step, index) => (
                                <div key={index} className="text-sm">
                                  <div className="text-muted-foreground">{step.description}</div>
                                  <div className="font-mono text-foreground">
                                    {step.formula} = {step.result.toFixed(4)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Warnings */}
                        {result.warnings && result.warnings.length > 0 && (
                          <div className="bg-yellow-500/10 p-4 rounded-lg border border-yellow-500/20">
                            <h3 className="font-medium text-yellow-700 dark:text-yellow-400 mb-2 flex items-center gap-2">
                              <AlertCircle className="w-5 h-5" />
                              Warnings
                            </h3>
                            <ul className="list-disc list-inside space-y-1 text-sm">
                              {result.warnings.map((warning, index) => (
                                <li key={index} className="text-yellow-700 dark:text-yellow-400">
                                  {warning}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {/* Recommendations */}
                        {result.recommendations && result.recommendations.length > 0 && (
                          <div className="bg-green-500/10 p-4 rounded-lg border border-green-500/20">
                            <h3 className="font-medium text-green-700 dark:text-green-400 mb-2 flex items-center gap-2">
                              <CheckCircle className="w-5 h-5" />
                              Recommendations
                            </h3>
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
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Select a formula to begin calculations
                  </div>
                )}
              </div>
            </div>
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </div>
  )
}