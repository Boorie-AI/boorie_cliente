# Hydraulic Calculator - Python Integration

## Overview

The hydraulic calculator has been enhanced with Python backend integration for scientific accuracy and professional-grade calculations.

## Features

### 1. Python-Powered Calculations
- **Accurate Scientific Computing**: Leverages NumPy and SciPy for precise calculations
- **Industry-Standard Formulas**: Implements ASHRAE, ASPE, and international standards
- **Unit Conversions**: Automatic handling of metric and imperial units

### 2. Available Calculations

#### Head Loss
- **Darcy-Weisbach**: Complete friction factor calculation with Reynolds number
- **Hazen-Williams**: Standard implementation with C-factor recommendations
- **Minor Losses**: K-factors for fittings and valves

#### Flow Calculations
- **Continuity Equation**: Q = A × V with area calculations
- **Orifice Flow**: Discharge coefficient considerations
- **Weir Flow**: Various weir types (rectangular, V-notch, etc.)

#### Pump Analysis
- **Power Calculations**: Hydraulic and shaft power with efficiency
- **NPSH**: Available and required NPSH calculations
- **Pump Curves**: Affinity laws and operating point determination

#### Tank Sizing
- **Volume Calculations**: Cylindrical, rectangular, and spherical tanks
- **Retention Time**: Based on flow rates and usage patterns
- **Emergency Storage**: Fire protection and backup supply

#### Water Hammer
- **Pressure Surge**: Joukowsky equation implementation
- **Wave Speed**: Material and fluid property considerations
- **Mitigation**: Surge tank and air chamber sizing

### 3. Enhanced User Interface

#### Visual Improvements
- Gradient headers with professional styling
- Icon-based category navigation
- Animated calculation feedback
- Color-coded results and warnings

#### User Experience
- Real-time input validation
- Step-by-step calculation display
- Copy-to-clipboard functionality
- Project integration for saving results

### 4. Integration Features

#### WNTR Compatibility
- Seamless integration with water network models
- Parameter extraction from network analysis
- Result application to network elements

#### Multi-Language Support
- English, Spanish, and Catalan interfaces
- Localized formula descriptions
- Regional standard compliance

### 5. Technical Architecture

```
Frontend (React/TypeScript)
    ↓
IPC Handler (Electron)
    ↓
Calculator Wrapper (TypeScript)
    ↓
Python Calculator Service
    ↓
Scientific Libraries (NumPy/SciPy)
```

## Usage Example

1. **Select Category**: Choose from head loss, flow, pumps, tanks, or water hammer
2. **Pick Formula**: Select the specific calculation needed
3. **Enter Parameters**: Input values with automatic unit detection
4. **View Results**: Get detailed results with intermediate steps
5. **Apply Recommendations**: Follow suggestions for optimization

## Benefits

1. **Accuracy**: Scientific-grade calculations with proper numerical methods
2. **Reliability**: Fallback to JavaScript if Python unavailable
3. **Transparency**: Shows all calculation steps and assumptions
4. **Compliance**: Follows international engineering standards
5. **Integration**: Works seamlessly with WNTR network analysis

## Future Enhancements

- [ ] Graph generation for pump curves and system curves
- [ ] Optimization algorithms for pipe sizing
- [ ] Cost analysis integration
- [ ] Energy efficiency calculations
- [ ] Real-time sensor data integration
- [ ] Machine learning for predictive analysis