#!/usr/bin/env python3
"""
Hydraulic Calculator Service
Provides calculations for hydraulic engineering formulas
"""
import json
import math
import sys
from typing import Dict, List, Any, Tuple, Optional
from dataclasses import dataclass, asdict
from enum import Enum


class FormulaCategory(Enum):
    HEAD_LOSS = "head_loss"
    FLOW = "flow"
    PUMP = "pump"
    TANK_SIZING = "tank_sizing"
    WATER_HAMMER = "water_hammer"


@dataclass
class CalculationResult:
    value: float
    unit: str


@dataclass
class IntermediateStep:
    description: str
    formula: str
    result: float


@dataclass
class CalculationResponse:
    result: Dict[str, Any]
    inputs: Dict[str, Dict[str, Any]]
    intermediate_steps: List[Dict[str, Any]]
    warnings: List[str]
    recommendations: List[str]
    
    def to_dict(self):
        return {
            'result': self.result,
            'inputs': self.inputs,
            'intermediateSteps': self.intermediate_steps,
            'warnings': self.warnings,
            'recommendations': self.recommendations
        }


class HydraulicCalculator:
    """Main calculator class for hydraulic formulas"""
    
    def __init__(self):
        self.gravity = 9.81  # m/s²
        self.water_density = 1000  # kg/m³ at 20°C
        self.kinematic_viscosity = 1.003e-6  # m²/s at 20°C
        
    def get_formulas(self) -> List[Dict[str, Any]]:
        """Return all available formulas"""
        return [
            # Head Loss Formulas
            {
                'id': 'darcy_weisbach',
                'name': 'Darcy-Weisbach Head Loss',
                'category': FormulaCategory.HEAD_LOSS.value,
                'equation': 'hf = f × (L/D) × (V²/2g)',
                'parameters': [
                    {
                        'symbol': 'f',
                        'name': 'Friction Factor',
                        'description': 'Darcy friction factor (dimensionless)',
                        'units': ['-'],
                        'range': {'min': 0.008, 'max': 0.1}
                    },
                    {
                        'symbol': 'L',
                        'name': 'Pipe Length',
                        'description': 'Length of the pipe',
                        'units': ['m', 'ft', 'km'],
                        'defaultValue': 100
                    },
                    {
                        'symbol': 'D',
                        'name': 'Pipe Diameter',
                        'description': 'Internal diameter of the pipe',
                        'units': ['m', 'mm', 'in', 'ft'],
                        'defaultValue': 0.15
                    },
                    {
                        'symbol': 'V',
                        'name': 'Velocity',
                        'description': 'Flow velocity in the pipe',
                        'units': ['m/s', 'ft/s'],
                        'range': {'min': 0.1, 'max': 5}
                    }
                ]
            },
            {
                'id': 'hazen_williams',
                'name': 'Hazen-Williams Head Loss',
                'category': FormulaCategory.HEAD_LOSS.value,
                'equation': 'hf = 10.67 × L × Q^1.852 / (C^1.852 × D^4.871)',
                'parameters': [
                    {
                        'symbol': 'L',
                        'name': 'Pipe Length',
                        'description': 'Length of the pipe',
                        'units': ['m', 'ft', 'km'],
                        'defaultValue': 100
                    },
                    {
                        'symbol': 'Q',
                        'name': 'Flow Rate',
                        'description': 'Volumetric flow rate',
                        'units': ['m³/s', 'L/s', 'gpm'],
                        'defaultValue': 0.05
                    },
                    {
                        'symbol': 'C',
                        'name': 'C Coefficient',
                        'description': 'Hazen-Williams roughness coefficient',
                        'units': ['-'],
                        'defaultValue': 130,
                        'range': {'min': 80, 'max': 150}
                    },
                    {
                        'symbol': 'D',
                        'name': 'Pipe Diameter',
                        'description': 'Internal diameter of the pipe',
                        'units': ['m', 'mm', 'in'],
                        'defaultValue': 0.15
                    }
                ]
            },
            # Flow Formulas
            {
                'id': 'continuity_equation',
                'name': 'Continuity Equation',
                'category': FormulaCategory.FLOW.value,
                'equation': 'Q = A × V',
                'parameters': [
                    {
                        'symbol': 'A',
                        'name': 'Cross-sectional Area',
                        'description': 'Flow cross-sectional area',
                        'units': ['m²', 'cm²', 'ft²'],
                        'defaultValue': 0.0177
                    },
                    {
                        'symbol': 'V',
                        'name': 'Velocity',
                        'description': 'Flow velocity',
                        'units': ['m/s', 'ft/s'],
                        'defaultValue': 2
                    }
                ]
            },
            {
                'id': 'orifice_flow',
                'name': 'Orifice Flow',
                'category': FormulaCategory.FLOW.value,
                'equation': 'Q = Cd × A × √(2gh)',
                'parameters': [
                    {
                        'symbol': 'Cd',
                        'name': 'Discharge Coefficient',
                        'description': 'Orifice discharge coefficient',
                        'units': ['-'],
                        'defaultValue': 0.62,
                        'range': {'min': 0.5, 'max': 0.8}
                    },
                    {
                        'symbol': 'A',
                        'name': 'Orifice Area',
                        'description': 'Area of the orifice',
                        'units': ['m²', 'cm²', 'in²'],
                        'defaultValue': 0.005
                    },
                    {
                        'symbol': 'h',
                        'name': 'Head',
                        'description': 'Head above orifice centerline',
                        'units': ['m', 'ft'],
                        'defaultValue': 2
                    }
                ]
            },
            # Pump Formulas
            {
                'id': 'pump_power',
                'name': 'Pump Power',
                'category': FormulaCategory.PUMP.value,
                'equation': 'P = ρgQH / η',
                'parameters': [
                    {
                        'symbol': 'Q',
                        'name': 'Flow Rate',
                        'description': 'Volumetric flow rate',
                        'units': ['m³/s', 'L/s', 'gpm'],
                        'defaultValue': 0.05
                    },
                    {
                        'symbol': 'H',
                        'name': 'Total Head',
                        'description': 'Total dynamic head',
                        'units': ['m', 'ft'],
                        'defaultValue': 30
                    },
                    {
                        'symbol': 'η',
                        'name': 'Efficiency',
                        'description': 'Overall pump efficiency (0-1)',
                        'units': ['-'],
                        'defaultValue': 0.75,
                        'range': {'min': 0.4, 'max': 0.9}
                    }
                ]
            },
            # Tank Sizing
            {
                'id': 'tank_volume',
                'name': 'Cylindrical Tank Volume',
                'category': FormulaCategory.TANK_SIZING.value,
                'equation': 'V = π × D²/4 × H',
                'parameters': [
                    {
                        'symbol': 'D',
                        'name': 'Tank Diameter',
                        'description': 'Internal diameter of the tank',
                        'units': ['m', 'ft'],
                        'defaultValue': 3
                    },
                    {
                        'symbol': 'H',
                        'name': 'Tank Height',
                        'description': 'Height of water in tank',
                        'units': ['m', 'ft'],
                        'defaultValue': 4
                    }
                ]
            },
            # Water Hammer
            {
                'id': 'water_hammer_pressure',
                'name': 'Water Hammer Pressure',
                'category': FormulaCategory.WATER_HAMMER.value,
                'equation': 'ΔP = ρ × c × ΔV',
                'parameters': [
                    {
                        'symbol': 'c',
                        'name': 'Wave Speed',
                        'description': 'Pressure wave speed in pipe',
                        'units': ['m/s', 'ft/s'],
                        'defaultValue': 1200,
                        'range': {'min': 900, 'max': 1400}
                    },
                    {
                        'symbol': 'ΔV',
                        'name': 'Velocity Change',
                        'description': 'Change in flow velocity',
                        'units': ['m/s', 'ft/s'],
                        'defaultValue': 2
                    }
                ]
            }
        ]
    
    def calculate(self, formula_id: str, inputs: Dict[str, Dict[str, Any]]) -> CalculationResponse:
        """Perform calculation for the specified formula"""
        
        # Convert units to SI
        si_inputs = self._convert_to_si(inputs)
        
        # Route to appropriate calculation method
        if formula_id == 'darcy_weisbach':
            return self._calculate_darcy_weisbach(si_inputs)
        elif formula_id == 'hazen_williams':
            return self._calculate_hazen_williams(si_inputs)
        elif formula_id == 'continuity_equation':
            return self._calculate_continuity(si_inputs)
        elif formula_id == 'orifice_flow':
            return self._calculate_orifice_flow(si_inputs)
        elif formula_id == 'pump_power':
            return self._calculate_pump_power(si_inputs)
        elif formula_id == 'tank_volume':
            return self._calculate_tank_volume(si_inputs)
        elif formula_id == 'water_hammer_pressure':
            return self._calculate_water_hammer(si_inputs)
        else:
            raise ValueError(f"Unknown formula ID: {formula_id}")
    
    def _convert_to_si(self, inputs: Dict[str, Dict[str, Any]]) -> Dict[str, float]:
        """Convert all inputs to SI units"""
        si_values = {}
        
        for param, data in inputs.items():
            value = data['value']
            unit = data['unit']
            
            # Length conversions
            if unit == 'ft':
                value *= 0.3048
            elif unit == 'km':
                value *= 1000
            elif unit == 'mm':
                value /= 1000
            elif unit == 'in':
                value *= 0.0254
            elif unit == 'cm':
                value /= 100
            
            # Area conversions
            elif unit == 'cm²':
                value /= 10000
            elif unit == 'ft²':
                value *= 0.092903
            elif unit == 'in²':
                value *= 0.00064516
            
            # Flow rate conversions
            elif unit == 'L/s':
                value /= 1000
            elif unit == 'gpm':
                value *= 0.00006309
            
            # Velocity conversions
            elif unit == 'ft/s':
                value *= 0.3048
                
            si_values[param] = value
            
        return si_values
    
    def _calculate_darcy_weisbach(self, inputs: Dict[str, float]) -> CalculationResponse:
        """Calculate head loss using Darcy-Weisbach equation"""
        f = inputs['f']
        L = inputs['L']
        D = inputs['D']
        V = inputs['V']
        
        # Calculate head loss
        hf = f * (L / D) * (V**2 / (2 * self.gravity))
        
        # Calculate Reynolds number
        Re = V * D / self.kinematic_viscosity
        
        # Prepare response
        steps = [
            IntermediateStep(
                description="Calculate velocity head",
                formula=f"V²/(2g) = {V}²/(2×{self.gravity})",
                result=V**2 / (2 * self.gravity)
            ),
            IntermediateStep(
                description="Calculate L/D ratio",
                formula=f"L/D = {L}/{D}",
                result=L/D
            ),
            IntermediateStep(
                description="Calculate Reynolds number",
                formula=f"Re = VD/ν = {V}×{D}/{self.kinematic_viscosity}",
                result=Re
            )
        ]
        
        warnings = []
        recommendations = []
        
        # Check velocity
        if V < 0.6:
            warnings.append("Velocity is low. Risk of sedimentation.")
        elif V > 3:
            warnings.append("Velocity is high. Risk of erosion and noise.")
            
        # Check Reynolds number
        if Re < 2000:
            recommendations.append("Flow is laminar. Consider using f = 64/Re.")
        elif Re > 4000:
            recommendations.append("Flow is turbulent. Verify friction factor using Moody diagram or Colebrook equation.")
            
        return CalculationResponse(
            result={'value': hf, 'unit': 'm'},
            inputs=inputs,
            intermediate_steps=[asdict(step) for step in steps],
            warnings=warnings,
            recommendations=recommendations
        )
    
    def _calculate_hazen_williams(self, inputs: Dict[str, float]) -> CalculationResponse:
        """Calculate head loss using Hazen-Williams equation"""
        L = inputs['L']
        Q = inputs['Q']
        C = inputs['C']
        D = inputs['D']
        
        # Calculate head loss (SI units)
        hf = 10.67 * L * (Q**1.852) / (C**1.852 * D**4.871)
        
        # Calculate velocity for checks
        A = math.pi * D**2 / 4
        V = Q / A
        
        steps = [
            IntermediateStep(
                description="Calculate pipe area",
                formula=f"A = π×D²/4 = π×{D}²/4",
                result=A
            ),
            IntermediateStep(
                description="Calculate velocity",
                formula=f"V = Q/A = {Q}/{A}",
                result=V
            )
        ]
        
        warnings = []
        recommendations = []
        
        # Material-based C value checks
        if C < 100:
            warnings.append("Low C value indicates old or rough pipes.")
        elif C > 140:
            recommendations.append("High C value - ensure it matches pipe material.")
            
        # Velocity checks
        if V < 0.6:
            warnings.append("Low velocity - risk of sedimentation.")
        elif V > 3:
            warnings.append("High velocity - risk of erosion.")
            
        return CalculationResponse(
            result={'value': hf, 'unit': 'm'},
            inputs=inputs,
            intermediate_steps=[asdict(step) for step in steps],
            warnings=warnings,
            recommendations=recommendations
        )
    
    def _calculate_continuity(self, inputs: Dict[str, float]) -> CalculationResponse:
        """Calculate flow rate using continuity equation"""
        A = inputs['A']
        V = inputs['V']
        
        Q = A * V
        
        # Calculate equivalent diameter
        D_equiv = math.sqrt(4 * A / math.pi)
        
        steps = [
            IntermediateStep(
                description="Calculate flow rate",
                formula=f"Q = A×V = {A}×{V}",
                result=Q
            ),
            IntermediateStep(
                description="Calculate equivalent diameter",
                formula=f"D = √(4A/π) = √(4×{A}/π)",
                result=D_equiv
            )
        ]
        
        warnings = []
        recommendations = []
        
        if V < 0.3:
            warnings.append("Very low velocity - check for stagnation.")
        elif V > 5:
            warnings.append("Very high velocity - check pipe rating.")
            
        return CalculationResponse(
            result={'value': Q, 'unit': 'm³/s'},
            inputs=inputs,
            intermediate_steps=[asdict(step) for step in steps],
            warnings=warnings,
            recommendations=recommendations
        )
    
    def _calculate_orifice_flow(self, inputs: Dict[str, float]) -> CalculationResponse:
        """Calculate flow through an orifice"""
        Cd = inputs['Cd']
        A = inputs['A']
        h = inputs['h']
        
        # Calculate flow rate
        Q = Cd * A * math.sqrt(2 * self.gravity * h)
        
        # Calculate velocity through orifice
        V = math.sqrt(2 * self.gravity * h)
        
        steps = [
            IntermediateStep(
                description="Calculate theoretical velocity",
                formula=f"V = √(2gh) = √(2×{self.gravity}×{h})",
                result=V
            ),
            IntermediateStep(
                description="Calculate theoretical flow",
                formula=f"Q_theo = A×V = {A}×{V}",
                result=A * V
            )
        ]
        
        warnings = []
        recommendations = []
        
        if h < 0.1:
            warnings.append("Very low head - results may be inaccurate.")
        
        if Cd < 0.6:
            recommendations.append("Low discharge coefficient - check for sharp edges.")
        
        return CalculationResponse(
            result={'value': Q, 'unit': 'm³/s'},
            inputs=inputs,
            intermediate_steps=[asdict(step) for step in steps],
            warnings=warnings,
            recommendations=recommendations
        )
    
    def _calculate_pump_power(self, inputs: Dict[str, float]) -> CalculationResponse:
        """Calculate pump power requirement"""
        Q = inputs['Q']
        H = inputs['H']
        η = inputs['η']
        
        # Calculate hydraulic power
        P_hydraulic = self.water_density * self.gravity * Q * H
        
        # Calculate shaft power
        P_shaft = P_hydraulic / η
        
        # Convert to kW
        P_kW = P_shaft / 1000
        
        steps = [
            IntermediateStep(
                description="Calculate hydraulic power",
                formula=f"P_hyd = ρgQH = {self.water_density}×{self.gravity}×{Q}×{H}",
                result=P_hydraulic
            ),
            IntermediateStep(
                description="Calculate shaft power",
                formula=f"P_shaft = P_hyd/η = {P_hydraulic}/{η}",
                result=P_shaft
            )
        ]
        
        warnings = []
        recommendations = []
        
        if η < 0.5:
            warnings.append("Low pump efficiency - consider pump replacement.")
        
        if P_kW > 100:
            recommendations.append("High power requirement - consider multiple pumps.")
            
        # Motor size recommendation
        motor_size = P_kW * 1.15  # 15% safety factor
        recommendations.append(f"Recommended motor size: {motor_size:.1f} kW")
        
        return CalculationResponse(
            result={'value': P_kW, 'unit': 'kW'},
            inputs=inputs,
            intermediate_steps=[asdict(step) for step in steps],
            warnings=warnings,
            recommendations=recommendations
        )
    
    def _calculate_tank_volume(self, inputs: Dict[str, float]) -> CalculationResponse:
        """Calculate cylindrical tank volume"""
        D = inputs['D']
        H = inputs['H']
        
        # Calculate volume
        V = math.pi * D**2 / 4 * H
        
        # Calculate surface area
        A_surface = math.pi * D**2 / 4
        
        # Convert to liters for practical use
        V_liters = V * 1000
        
        steps = [
            IntermediateStep(
                description="Calculate tank area",
                formula=f"A = π×D²/4 = π×{D}²/4",
                result=A_surface
            ),
            IntermediateStep(
                description="Calculate volume in m³",
                formula=f"V = A×H = {A_surface}×{H}",
                result=V
            ),
            IntermediateStep(
                description="Convert to liters",
                formula=f"V = {V}×1000",
                result=V_liters
            )
        ]
        
        warnings = []
        recommendations = []
        
        # Aspect ratio check
        aspect_ratio = H / D
        if aspect_ratio < 0.5:
            warnings.append("Tank is very wide - check structural design.")
        elif aspect_ratio > 3:
            warnings.append("Tank is very tall - check stability.")
            
        # Practical recommendations
        recommendations.append(f"Total capacity: {V_liters:.0f} liters")
        recommendations.append(f"Effective volume (95%): {V_liters * 0.95:.0f} liters")
        
        return CalculationResponse(
            result={'value': V, 'unit': 'm³'},
            inputs=inputs,
            intermediate_steps=[asdict(step) for step in steps],
            warnings=warnings,
            recommendations=recommendations
        )
    
    def _calculate_water_hammer(self, inputs: Dict[str, float]) -> CalculationResponse:
        """Calculate water hammer pressure rise"""
        c = inputs['c']
        ΔV = inputs['ΔV']
        
        # Calculate pressure rise
        ΔP = self.water_density * c * ΔV
        
        # Convert to bar for practical use
        ΔP_bar = ΔP / 100000
        
        # Calculate head rise
        ΔH = ΔP / (self.water_density * self.gravity)
        
        steps = [
            IntermediateStep(
                description="Calculate pressure rise in Pa",
                formula=f"ΔP = ρ×c×ΔV = {self.water_density}×{c}×{ΔV}",
                result=ΔP
            ),
            IntermediateStep(
                description="Convert to bar",
                formula=f"ΔP = {ΔP}/100000",
                result=ΔP_bar
            ),
            IntermediateStep(
                description="Calculate head rise",
                formula=f"ΔH = ΔP/(ρg) = {ΔP}/({self.water_density}×{self.gravity})",
                result=ΔH
            )
        ]
        
        warnings = []
        recommendations = []
        
        if ΔP_bar > 10:
            warnings.append("High pressure surge - risk of pipe damage!")
            recommendations.append("Consider installing surge protection devices.")
            
        if ΔV > 1:
            recommendations.append("Large velocity change - use slow-closing valves.")
            
        # Critical time calculation
        L_critical = c * 2  # Assuming 2 second valve closure
        recommendations.append(f"Critical pipe length: {L_critical:.0f} m")
        
        return CalculationResponse(
            result={'value': ΔP_bar, 'unit': 'bar'},
            inputs=inputs,
            intermediate_steps=[asdict(step) for step in steps],
            warnings=warnings,
            recommendations=recommendations
        )


def main():
    """Main entry point for CLI usage"""
    calculator = HydraulicCalculator()
    
    if len(sys.argv) < 2:
        print(json.dumps({
            'success': False,
            'error': 'No command specified'
        }))
        return
    
    command = sys.argv[1]
    
    try:
        if command == 'formulas':
            # Return available formulas
            result = {
                'success': True,
                'data': calculator.get_formulas()
            }
            print(json.dumps(result))
            
        elif command == 'calculate':
            if len(sys.argv) < 4:
                print(json.dumps({
                    'success': False,
                    'error': 'Missing formula_id and inputs'
                }))
                return
                
            formula_id = sys.argv[2]
            inputs = json.loads(sys.argv[3])
            
            # Perform calculation
            response = calculator.calculate(formula_id, inputs)
            
            result = {
                'success': True,
                'data': response.to_dict()
            }
            print(json.dumps(result))
            
        else:
            print(json.dumps({
                'success': False,
                'error': f'Unknown command: {command}'
            }))
            
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e)
        }))


if __name__ == '__main__':
    main()