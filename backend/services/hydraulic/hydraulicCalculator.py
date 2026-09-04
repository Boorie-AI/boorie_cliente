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


class RangoInvalido(ValueError):
    """
    Un dato fuera de rango, con sus avisos traducibles.

    La frase en ingles se conserva para el registro y para quien llame por CLI,
    pero lo que llega a la interfaz son `avisos`: la aplicacion va en tres
    idiomas y el motor no sabe en cual se va a leer (#96). Sin esto, activar la
    comprobacion de rangos (#128) hacia aparecer «is outside the valid range»
    en un panel en castellano.
    """

    def __init__(self, mensaje: str, avisos: List[Dict[str, Any]]):
        super().__init__(mensaje)
        self.avisos = avisos


def aviso(clave: str, **datos) -> Dict[str, Any]:
    """
    Un aviso no es una frase, es una clave y sus datos: el motor no sabe en qué
    idioma se va a leer. Quien lo enseña lo traduce (#96).
    """
    salida: Dict[str, Any] = {'clave': f'calc.msg.{clave}'}
    if datos:
        salida['datos'] = datos
    return salida


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
    """
    Un paso del cálculo, con **su** unidad (#89).

    No vale la del resultado final: en Darcy-Weisbach la altura de velocidad va
    en metros, la relación L/D no tiene unidad y el número de Reynolds tampoco.
    Los pasos son donde se comprueba un cálculo, y un número suelto no se
    comprueba. Vacía cuando la magnitud es adimensional, que es más honesto que
    inventarle una.
    """
    description_key: str
    formula: str
    result: float
    unit: str = ''

    def to_dict(self):
        # El nombre que espera la interfaz, en camelCase como el resto del JSON.
        return {'descriptionKey': self.description_key, 'formula': self.formula,
                'result': self.result, 'unit': self.unit}


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
                'nameKey': 'calc.formula.darcyWeisbach',
                'category': FormulaCategory.HEAD_LOSS.value,
                'equation': 'hf = f × (L/D) × (V²/2g)',
                'parameters': [
                    {
                        'symbol': 'f',
                        'nameKey': 'calc.param.frictionFactor',
                        'descriptionKey': 'calc.paramDesc.frictionFactor',
                        'units': ['-'],
                        'range': {'min': 0.008, 'max': 0.1}
                    },
                    {
                        'symbol': 'L',
                        'nameKey': 'calc.param.pipeLength',
                        'descriptionKey': 'calc.paramDesc.pipeLength',
                        'units': ['m', 'ft', 'km'],
                        'defaultValue': 100,
                        'range': {'min': 0, 'max': 100000}
                    },
                    {
                        'symbol': 'D',
                        'nameKey': 'calc.param.pipeDiameter',
                        'descriptionKey': 'calc.paramDesc.pipeDiameter',
                        'units': ['m', 'mm', 'in', 'ft'],
                        'defaultValue': 0.15,
                        'range': {'min': 0.01, 'max': 10}
                    },
                    {
                        'symbol': 'V',
                        'nameKey': 'calc.param.velocity',
                        'descriptionKey': 'calc.paramDesc.velocityPipe',
                        'units': ['m/s', 'ft/s'],
                        'range': {'min': 0, 'max': 10}
                    }
                ]
            },
            {
                'id': 'hazen_williams',
                'nameKey': 'calc.formula.hazenWilliams',
                'category': FormulaCategory.HEAD_LOSS.value,
                'equation': 'hf = 10.67 × L × Q^1.852 / (C^1.852 × D^4.871)',
                'parameters': [
                    {
                        'symbol': 'L',
                        'nameKey': 'calc.param.pipeLength',
                        'descriptionKey': 'calc.paramDesc.pipeLength',
                        'units': ['m', 'ft', 'km'],
                        'defaultValue': 100,
                        'range': {'min': 0, 'max': 100000}
                    },
                    {
                        'symbol': 'Q',
                        'nameKey': 'calc.param.flowRate',
                        'descriptionKey': 'calc.paramDesc.flowRate',
                        'units': ['l/s', 'm³/s', 'gpm'],
                        'defaultValue': 0.05,
                        'range': {'min': 0, 'max': 10}
                    },
                    {
                        'symbol': 'C',
                        'nameKey': 'calc.param.hazenC',
                        'descriptionKey': 'calc.paramDesc.hazenC',
                        'units': ['-'],
                        'defaultValue': 130,
                        'range': {'min': 50, 'max': 150}
                    },
                    {
                        'symbol': 'D',
                        'nameKey': 'calc.param.pipeDiameter',
                        'descriptionKey': 'calc.paramDesc.pipeDiameter',
                        'units': ['m', 'mm', 'in'],
                        'defaultValue': 0.15,
                        'range': {'min': 0.01, 'max': 10}
                    }
                ]
            },
            # Flow Formulas
            {
                'id': 'continuity_equation',
                'nameKey': 'calc.formula.continuity',
                'category': FormulaCategory.FLOW.value,
                'equation': 'Q = A × V',
                'parameters': [
                    {
                        'symbol': 'A',
                        'nameKey': 'calc.param.area',
                        'descriptionKey': 'calc.paramDesc.area',
                        'units': ['m²', 'cm²', 'ft²'],
                        'defaultValue': 0.0177
                    },
                    {
                        'symbol': 'V',
                        'nameKey': 'calc.param.velocity',
                        'descriptionKey': 'calc.paramDesc.velocity',
                        'units': ['m/s', 'ft/s'],
                        'defaultValue': 2,
                        'range': {'min': 0, 'max': 10}
                    }
                ]
            },
            {
                'id': 'orifice_flow',
                'nameKey': 'calc.formula.orifice',
                'category': FormulaCategory.FLOW.value,
                'equation': 'Q = Cd × A × √(2gh)',
                'parameters': [
                    {
                        'symbol': 'Cd',
                        'nameKey': 'calc.param.dischargeCoef',
                        'descriptionKey': 'calc.paramDesc.dischargeCoef',
                        'units': ['-'],
                        'defaultValue': 0.62,
                        'range': {'min': 0.5, 'max': 0.8}
                    },
                    {
                        'symbol': 'A',
                        'nameKey': 'calc.param.orificeArea',
                        'descriptionKey': 'calc.paramDesc.orificeArea',
                        'units': ['m²', 'cm²', 'in²'],
                        'defaultValue': 0.005
                    },
                    {
                        'symbol': 'h',
                        'nameKey': 'calc.param.head',
                        'descriptionKey': 'calc.paramDesc.head',
                        'units': ['m', 'ft'],
                        'defaultValue': 2
                    }
                ]
            },
            # Pump Formulas
            {
                'id': 'pump_power',
                'nameKey': 'calc.formula.pumpPower',
                'category': FormulaCategory.PUMP.value,
                'equation': 'P = ρgQH / η',
                'parameters': [
                    {
                        'symbol': 'Q',
                        'nameKey': 'calc.param.flowRate',
                        'descriptionKey': 'calc.paramDesc.flowRate',
                        'units': ['l/s', 'm³/s', 'gpm'],
                        'defaultValue': 0.05,
                        'range': {'min': 0, 'max': 10}
                    },
                    {
                        'symbol': 'H',
                        'nameKey': 'calc.param.totalHead',
                        'descriptionKey': 'calc.paramDesc.totalHead',
                        'units': ['m', 'ft'],
                        'defaultValue': 30,
                        'range': {'min': 0, 'max': 1000}
                    },
                    {
                        'symbol': 'η',
                        'nameKey': 'calc.param.efficiency',
                        'descriptionKey': 'calc.paramDesc.efficiency',
                        'units': ['-'],
                        'defaultValue': 0.75,
                        'range': {'min': 0.4, 'max': 0.9}
                    }
                ]
            },
            # Tank Sizing
            {
                'id': 'tank_volume',
                'nameKey': 'calc.formula.tankVolume',
                'category': FormulaCategory.TANK_SIZING.value,
                'equation': 'V = π × D²/4 × H',
                'parameters': [
                    {
                        'symbol': 'D',
                        'nameKey': 'calc.param.tankDiameter',
                        'descriptionKey': 'calc.paramDesc.tankDiameter',
                        'units': ['m', 'ft'],
                        'defaultValue': 3
                    },
                    {
                        'symbol': 'H',
                        'nameKey': 'calc.param.tankHeight',
                        'descriptionKey': 'calc.paramDesc.tankHeight',
                        'units': ['m', 'ft'],
                        'defaultValue': 4
                    }
                ]
            },
            # Water Hammer
            {
                'id': 'water_hammer_pressure',
                'nameKey': 'calc.formula.waterHammer',
                'category': FormulaCategory.WATER_HAMMER.value,
                'equation': 'ΔP = ρ × c × ΔV',
                'parameters': [
                    {
                        'symbol': 'c',
                        'nameKey': 'calc.param.waveSpeed',
                        'descriptionKey': 'calc.paramDesc.waveSpeed',
                        'units': ['m/s', 'ft/s'],
                        'defaultValue': 1200,
                        # 900-1400 es la banda de un material concreto, no el
                        # limite fisico. El motor de JavaScript admite 200-1500.
                        'range': {'min': 200, 'max': 1500}
                    },
                    {
                        'symbol': 'ΔV',
                        'nameKey': 'calc.param.velocityChange',
                        'descriptionKey': 'calc.paramDesc.velocityChange',
                        'units': ['m/s', 'ft/s'],
                        'defaultValue': 2,
                        'range': {'min': 0, 'max': 10}
                    }
                ]
            }
        ]
    
    def calculate(self, formula_id: str, inputs: Dict[str, Dict[str, Any]]) -> CalculationResponse:
        """Perform calculation for the specified formula"""

        # Convert units to SI
        si_inputs = self._convert_to_si(inputs)

        # Y despues de convertir, comprobar el rango. Este calculador no lo
        # comprobaba en absoluto (#128): aceptaba un diametro de 20 m y
        # devolvia una cifra, mientras el motor de JavaScript lo rechazaba, asi
        # que el mismo dato daba dos comportamientos segun si Python estaba
        # instalado. Despues y no antes por el #122: el rango esta escrito en
        # unidad estandar y el desplegable ofrece mm y pulgadas, asi que
        # comprobarlo sobre el valor crudo dejaba fuera un diametro de 300 mm.
        fuera, avisos = self._fuera_de_rango(formula_id, si_inputs)
        if fuera:
            raise RangoInvalido('Invalid inputs: ' + ', '.join(fuera), avisos)
        
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
    
    # La unidad en la que estan escritos el rango y la formula: la primera de
    # las del desplegable con equivalente en el SI. Mismo criterio que
    # `unidadEstandarDe` en unidadesDeCalculo.ts, y hay una prueba que exige que
    # los dos lados no se separen.
    _ESTANDAR = [
        (('m', 'ft'), 'm'),
        (('m³/s', 'l/s'), 'm³/s'),
        (('m/s', 'ft/s'), 'm/s'),
        (('Pa', 'kPa'), 'Pa'),
        (('kg/m³',), 'kg/m³'),
        (('m²', 'cm²'), 'm²'),
    ]

    def _unidad_estandar(self, parametro: Dict[str, Any]) -> str:
        unidades = parametro.get('units') or ['']
        for candidatas, estandar in self._ESTANDAR:
            if any(u in unidades for u in candidatas):
                return estandar
        return unidades[0]

    def _fuera_de_rango(self, formula_id: str, si_inputs: Dict[str, float]):
        """
        Los parametros que se salen de su rango: la frase para el registro y el
        aviso traducible para la interfaz.
        """
        formula = next((f for f in self.get_formulas() if f['id'] == formula_id), None)
        if not formula:
            return [], []

        errores = []
        avisos = []
        for parametro in formula['parameters']:
            rango = parametro.get('range')
            simbolo = parametro['symbol']
            if not rango or simbolo not in si_inputs:
                continue
            valor = si_inputs[simbolo]
            if valor < rango['min'] or valor > rango['max']:
                # El valor se dice en la unidad del rango y no en la que
                # escribio el usuario: si no, el mensaje enfrenta dos numeros
                # que no se comparan.
                unidad = self._unidad_estandar(parametro)
                cifra = f'{valor:g}'
                errores.append(
                    f"{simbolo} = {cifra} {unidad} is outside the valid range "
                    f"[{rango['min']}, {rango['max']}]"
                )
                avisos.append(aviso(
                    'outOfRange',
                    symbol=simbolo, value=cifra, unit=unidad,
                    min=rango['min'], max=rango['max'],
                ))
        return errores, avisos

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
            elif unit in ('l/s', 'L/s'):  # la grafía anterior sigue valiendo
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
                description_key="calc.step.velocityHead",
                formula=f"V²/(2g) = {V}²/(2×{self.gravity})",
                result=V**2 / (2 * self.gravity),
                unit="m"
            ),
            IntermediateStep(
                description_key="calc.step.ldRatio",
                formula=f"L/D = {L}/{D}",
                result=L/D,
                unit=""
            ),
            IntermediateStep(
                description_key="calc.step.reynolds",
                formula=f"Re = VD/ν = {V}×{D}/{self.kinematic_viscosity}",
                result=Re,
                unit=""
            )
        ]
        
        warnings = []
        recommendations = []
        
        # Check velocity
        if V < 0.6:
            warnings.append(aviso("lowVelocitySediment"))
        elif V > 3:
            warnings.append(aviso("highVelocityErosion"))
            
        # Check Reynolds number
        if Re < 2000:
            recommendations.append(aviso("laminar"))
        elif Re > 4000:
            recommendations.append(aviso("turbulent"))
            
        return CalculationResponse(
            result={'value': hf, 'unit': 'm'},
            inputs=inputs,
            intermediate_steps=[step.to_dict() for step in steps],
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
                description_key="calc.step.pipeArea",
                formula=f"A = π×D²/4 = π×{D}²/4",
                result=A,
                unit="m²"
            ),
            IntermediateStep(
                description_key="calc.step.velocity",
                formula=f"V = Q/A = {Q}/{A}",
                result=V,
                unit="m/s"
            )
        ]
        
        warnings = []
        recommendations = []
        
        # Material-based C value checks
        if C < 100:
            warnings.append(aviso("lowC"))
        elif C > 140:
            recommendations.append(aviso("highC"))
            
        # Velocity checks
        if V < 0.6:
            warnings.append(aviso("lowVelocitySediment"))
        elif V > 3:
            warnings.append(aviso("highVelocityErosion"))
            
        return CalculationResponse(
            result={'value': hf, 'unit': 'm'},
            inputs=inputs,
            intermediate_steps=[step.to_dict() for step in steps],
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
                description_key="calc.step.flowRate",
                formula=f"Q = A×V = {A}×{V}",
                result=Q,
                unit="m³/s"
            ),
            IntermediateStep(
                description_key="calc.step.toLps",
                formula=f"Q × 1000 = {Q}×1000",
                result=Q * 1000,
                unit="l/s"
            ),
            IntermediateStep(
                description_key="calc.step.equivalentDiameter",
                formula=f"D = √(4A/π) = √(4×{A}/π)",
                result=D_equiv,
                unit="m"
            )
        ]
        
        warnings = []
        recommendations = []
        
        if V < 0.3:
            warnings.append(aviso("lowVelocityStagnation"))
        elif V > 5:
            warnings.append(aviso("highVelocityRating"))
            
        return CalculationResponse(
            # En l/s, como el resto de la aplicación (#89 · H3). El paso anterior
            # deja la conversión a la vista para que la cifra siga siendo
            # comprobable.
            result={'value': Q * 1000, 'unit': 'l/s'},
            inputs=inputs,
            intermediate_steps=[step.to_dict() for step in steps],
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
                description_key="calc.step.theoreticalVelocity",
                formula=f"V = √(2gh) = √(2×{self.gravity}×{h})",
                result=V,
                unit="m/s"
            ),
            IntermediateStep(
                description_key="calc.step.theoreticalFlow",
                formula=f"Q_theo = A×V = {A}×{V}",
                result=A * V,
                unit="m³/s"
            ),
            IntermediateStep(
                description_key="calc.step.dischargeAndLps",
                formula=f"Q = Cd×A×V×1000 = {Cd}×{A}×{V}×1000",
                result=Q * 1000,
                unit="l/s"
            )
        ]
        
        warnings = []
        recommendations = []
        
        if h < 0.1:
            warnings.append(aviso("lowHead"))
        
        if Cd < 0.6:
            recommendations.append(aviso("lowDischargeCoef"))
        
        return CalculationResponse(
            # En l/s, como el resto de la aplicación (#89 · H3).
            result={'value': Q * 1000, 'unit': 'l/s'},
            inputs=inputs,
            intermediate_steps=[step.to_dict() for step in steps],
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
                description_key="calc.step.hydraulicPower",
                formula=f"P_hyd = ρgQH = {self.water_density}×{self.gravity}×{Q}×{H}",
                result=P_hydraulic,
                unit="W"
            ),
            IntermediateStep(
                description_key="calc.step.shaftPower",
                formula=f"P_shaft = P_hyd/η = {P_hydraulic}/{η}",
                result=P_shaft,
                unit="W"
            )
        ]
        
        warnings = []
        recommendations = []
        
        if η < 0.5:
            warnings.append(aviso("lowPumpEfficiency"))
        
        if P_kW > 100:
            recommendations.append(aviso("highPower"))
            
        # Motor size recommendation
        motor_size = P_kW * 1.15  # 15% safety factor
        recommendations.append(aviso('motorSize', kw=f'{motor_size:.1f}'))
        
        return CalculationResponse(
            result={'value': P_kW, 'unit': 'kW'},
            inputs=inputs,
            intermediate_steps=[step.to_dict() for step in steps],
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
                description_key="calc.step.tankArea",
                formula=f"A = π×D²/4 = π×{D}²/4",
                result=A_surface,
                unit="m²"
            ),
            IntermediateStep(
                description_key="calc.step.volumeM3",
                formula=f"V = A×H = {A_surface}×{H}",
                result=V,
                unit="m³"
            ),
            IntermediateStep(
                description_key="calc.step.toLiters",
                formula=f"V = {V}×1000",
                result=V_liters,
                unit="L"
            )
        ]
        
        warnings = []
        recommendations = []
        
        # Aspect ratio check
        aspect_ratio = H / D
        if aspect_ratio < 0.5:
            warnings.append(aviso("tankWide"))
        elif aspect_ratio > 3:
            warnings.append(aviso("tankTall"))
            
        # Practical recommendations
        recommendations.append(aviso('totalCapacity', litros=f'{V_liters:.0f}'))
        recommendations.append(aviso('effectiveVolume', litros=f'{V_liters * 0.95:.0f}'))
        
        return CalculationResponse(
            result={'value': V, 'unit': 'm³'},
            inputs=inputs,
            intermediate_steps=[step.to_dict() for step in steps],
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
                description_key="calc.step.pressureRisePa",
                formula=f"ΔP = ρ×c×ΔV = {self.water_density}×{c}×{ΔV}",
                result=ΔP,
                unit="Pa"
            ),
            IntermediateStep(
                description_key="calc.step.toBar",
                formula=f"ΔP = {ΔP}/100000",
                result=ΔP_bar,
                unit="bar"
            ),
            IntermediateStep(
                description_key="calc.step.headRise",
                formula=f"ΔH = ΔP/(ρg) = {ΔP}/({self.water_density}×{self.gravity})",
                result=ΔH,
                unit="m"
            )
        ]
        
        warnings = []
        recommendations = []
        
        if ΔP_bar > 10:
            warnings.append(aviso("surgeDamage"))
            recommendations.append(aviso("surgeProtection"))
            
        if ΔV > 1:
            recommendations.append(aviso("slowValves"))
            
        # Critical time calculation
        L_critical = c * 2  # Assuming 2 second valve closure
        recommendations.append(aviso('criticalLength', metros=f'{L_critical:.0f}'))
        
        return CalculationResponse(
            result={'value': ΔP_bar, 'unit': 'bar'},
            inputs=inputs,
            intermediate_steps=[step.to_dict() for step in steps],
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
        salida = {
            'success': False,
            'error': str(e)
        }
        # Los avisos traducibles viajan aparte de la frase, para que la interfaz
        # pueda escribirlos en el idioma en que se esta leyendo.
        if isinstance(e, RangoInvalido):
            salida['avisos'] = e.avisos
        print(json.dumps(salida))


if __name__ == '__main__':
    main()