# Implementation Plan: Inline Results Display

## Overview
Based on your request, we have refactored the sidebar to display simulation results directly under the **"Run All Simulations"** button, creating a seamless workflow. The separate "Results" tab has been removed to simplify navigation.

## Changes Implemented

### 1. UI Refactor
- **Consolidated Controls**:
  - **Simulate Tab**: Replaced individual type selectors with a single **"Run All Simulations"** button.
  - **Analyze Tab**: Replaced individual analysis selector with a single **"Run All Analyses"** button.
- **Sequential Execution**:
  - **Simulations**: Hydraulic -> Water Quality -> Scenario.
  - **Analyses**: Topology -> Criticality -> Resilience.
- **Inline Results**:
  - **Simulate Tab**: Hydraulic, Quality, and Scenario result cards appear immediately below the button.
  - **Analyze Tab**: Topology, Criticality, and Resilience result cards appear immediately below the button.
- **Removed**: The dedicated "Results" tab has been completely removed from the sidebar navigation.
- **Relocated**: Analysis results (Topology, etc.) were moved to the **Analyze** tab, following the same direct feedback pattern (Button -> Progress -> Results).
- **Map Visualization**:
  - **Legend**: Added a "Reference" legend for map colors (Pressure levels, Critical nodes).
  - **Cleaner UI**: Removed overlapping labels for clearer view.
  - **Time Control**: Enabled time-step visualization for simulation results.

## Instructions
1. **Reload**: Reload the application to apply the changes.
2. **Navigate**: Go to the **WNTR Network** section.
3. **Load File**: Load your standard `.inp` network file (e.g., `Net3.inp`).
4. **Run Simulations**:
   - Go to **Simulate** tab -> Click **"Run All Simulations"**.
   - Verify 3 result cards appear inline.
5. **Run Analyses**:
   - Go to **Analyze** tab -> Click **"Run All Analyses"**.
   - Verify Topology, Criticality, and Resilience result cards appear inline.
