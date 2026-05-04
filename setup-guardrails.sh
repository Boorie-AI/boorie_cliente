#!/bin/bash
# Boorie Guardrails (NVIDIA NeMo) — one-shot setup script.
#
# Installs:
#   1. nemoguardrails Python package (and its peer LangChain deps) into the
#      same venv used by WNTR (venv-wntr/).
#   2. langchain-ollama and langchain-nvidia-ai-endpoints so both judge
#      providers work out of the box.
#   3. Pulls nemotron-mini model from Ollama if `ollama` is on PATH and
#      the daemon is reachable on http://localhost:11434.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$ROOT/venv-wntr"

if [ ! -d "$VENV" ]; then
  echo "❌ venv-wntr not found at $VENV"
  echo "   Run ./setup-python-wntr.sh first."
  exit 1
fi

echo "📦 Installing NeMo Guardrails into venv-wntr..."
"$VENV/bin/pip" install --upgrade pip
"$VENV/bin/pip" install \
  "nemoguardrails>=0.10.0" \
  "langchain-ollama>=0.2.0" \
  "langchain-nvidia-ai-endpoints>=0.3.0"

echo "✅ Python packages installed."

if command -v ollama >/dev/null 2>&1; then
  if curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
    echo "🦙 Ollama is running. Pulling nemotron-mini..."
    ollama pull nemotron-mini || echo "⚠️  Could not pull nemotron-mini (continuing)."
  else
    echo "⚠️  Ollama daemon not running. Start it with: ollama serve"
    echo "    Then run: ollama pull nemotron-mini"
  fi
else
  echo "ℹ️  Ollama CLI not detected. Install from https://ollama.ai/download"
  echo "    Then run: ollama pull nemotron-mini"
fi

echo ""
echo "✨ Guardrails setup complete."
echo "   To use NVIDIA API Catalog instead of Ollama:"
echo "     export NVIDIA_API_KEY=nvapi-..."
echo "     and set the provider to 'nvidia-api' in Settings → AI Configuration."
