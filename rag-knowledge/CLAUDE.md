# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Boorie is an AI-powered hydraulic engineering agent that integrates WNTR (Water Network Tool for Resilience) with LLMs to assist engineers in managing urban water networks. Currently, this repository contains documentation only - the actual implementation code has not been added yet.

## Technology Stack

- **Language**: Python 3.8 to <3.12
- **Core Dependencies**: 
  - WNTR for hydraulic modeling
  - LiteLLM for LLM integration
  - FastAPI for deployment
- **Domain**: Hydraulic engineering, water network management

## Development Commands

Since the codebase is not yet implemented, the following commands are expected based on the documentation:

```bash
# Create virtual environment
python -m venv env
source env/bin/activate  # On macOS/Linux
# or
env\Scripts\activate  # On Windows

# Install from PyPI (when available)
pip install boorie

# For development (when code is added)
pip install -e .
```

## Project Architecture

Based on the documentation, Boorie should implement:

1. **Context-Aware Stages**: The agent operates across different project phases:
   - Preliminary Assessment
   - Network Analysis (using WNTR)
   - Problem Identification
   - Solution Design
   - Optimization
   - Implementation
   - Monitoring and Adjustment

2. **Key Integration Points**:
   - WNTR integration for hydraulic modeling
   - LiteLLM for flexible LLM provider support
   - FastAPI for API deployment
   - Tool system for accessing hydraulic infrastructure catalogs

## Important Notes

- The repository is currently documentation-only
- Installation instructions mention availability via PyPI
- Supports both open-source and proprietary LLMs through LiteLLM
- Bilingual documentation (English/Spanish)
- Apache License 2.0