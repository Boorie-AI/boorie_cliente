#!/usr/bin/env python3
"""
Boorie Guardrails Service — NVIDIA NeMo Guardrails sidecar.

Stdio JSON protocol (one JSON object per line on stdin, one JSON
response per line on stdout). Designed to be spawned by the Electron
main process the same way as wntrService.py.

Commands accepted on stdin:
  {"id": <int>, "cmd": "validate_input",      "payload": {...}}
  {"id": <int>, "cmd": "validate_retrieval",  "payload": {...}}
  {"id": <int>, "cmd": "validate_output",     "payload": {...}}
  {"id": <int>, "cmd": "validate_execution",  "payload": {...}}
  {"id": <int>, "cmd": "ping"}
  {"id": <int>, "cmd": "shutdown"}

Each response has the shape:
  {"id": <int>, "ok": bool, "result": {...} | None, "error": str | None}

Result objects from validate_* always have:
  {"allow": bool, "reason": str, "severity": "low"|"medium"|"high"|"critical",
   "judge_model": str, "judge_provider": str}
"""

from __future__ import annotations

import json
import os
import sys
import traceback
from pathlib import Path
from typing import Any, Dict, Optional


# --- Lazy imports ----------------------------------------------------------
# We do not import nemoguardrails at module top-level so that a startup
# without the package installed still gives a useful error per request
# rather than a hard crash.

_RAILS = None  # cached LLMRails instance
_RAILS_INIT_ERROR: Optional[str] = None
_CONFIG_PATH = Path(__file__).parent / "rails"
_JUDGE_MODEL = os.environ.get("BOORIE_GUARDRAILS_MODEL", "nemotron-mini")
_JUDGE_PROVIDER = os.environ.get("BOORIE_GUARDRAILS_PROVIDER", "ollama")


def _ensure_rails():
    """Build the NeMo Guardrails app once, lazily."""
    global _RAILS, _RAILS_INIT_ERROR
    if _RAILS is not None or _RAILS_INIT_ERROR is not None:
        return

    try:
        from nemoguardrails import LLMRails, RailsConfig

        if not _CONFIG_PATH.exists():
            raise RuntimeError(
                f"Guardrails config dir not found: {_CONFIG_PATH}"
            )
        config = RailsConfig.from_path(str(_CONFIG_PATH))
        _RAILS = LLMRails(config)
    except Exception as e:  # noqa: BLE001
        _RAILS_INIT_ERROR = (
            f"Failed to initialize NeMo Guardrails: {e}\n{traceback.format_exc()}"
        )


def _make_result(
    allow: bool,
    reason: str,
    severity: str = "low",
) -> Dict[str, Any]:
    return {
        "allow": allow,
        "reason": reason,
        "severity": severity,
        "judge_model": _JUDGE_MODEL,
        "judge_provider": _JUDGE_PROVIDER,
    }


def _run_rail(rail_name: str, messages):
    """Execute a NeMo rails turn and translate the bot reply into a verdict.

    NeMo conventions used in our Colang flows:
      - When a rail blocks, the bot says a message starting with "BLOCK:".
      - When a rail warns (advisory), the bot says "WARN:".
      - Otherwise the bot says "ALLOW".
    """
    _ensure_rails()
    if _RAILS is None:
        return _make_result(
            allow=True,
            reason=f"guardrails-disabled: {_RAILS_INIT_ERROR or 'rails not initialized'}",
            severity="low",
        )

    response = _RAILS.generate(messages=messages)
    text = (response or {}).get("content", "") if isinstance(response, dict) else str(response)
    text = (text or "").strip()
    upper = text.upper()

    if upper.startswith("BLOCK"):
        reason = text.split(":", 1)[1].strip() if ":" in text else "blocked"
        severity = "high" if rail_name in ("input", "output") else "medium"
        return _make_result(False, reason, severity)
    if upper.startswith("WARN"):
        reason = text.split(":", 1)[1].strip() if ":" in text else "warning"
        return _make_result(True, reason, "low")
    return _make_result(True, "ok", "low")


# --- Command handlers -------------------------------------------------------

def cmd_ping(_payload):
    return {"pong": True, "model": _JUDGE_MODEL, "provider": _JUDGE_PROVIDER}


def cmd_validate_input(payload):
    user_text = (payload or {}).get("text", "")
    if not user_text:
        return _make_result(True, "empty input", "low")
    return _run_rail(
        "input",
        [{"role": "user", "content": f"[RAIL=input]\n{user_text}"}],
    )


def cmd_validate_retrieval(payload):
    query = (payload or {}).get("query", "")
    chunks = (payload or {}).get("chunks", [])
    if not chunks:
        return _make_result(True, "no chunks to validate", "low")
    serialized = "\n---\n".join(c[:600] for c in chunks)
    return _run_rail(
        "retrieval",
        [
            {
                "role": "user",
                "content": (
                    f"[RAIL=retrieval]\nQUERY: {query}\nCHUNKS:\n{serialized}"
                ),
            }
        ],
    )


def cmd_validate_output(payload):
    user_text = (payload or {}).get("user", "")
    answer = (payload or {}).get("answer", "")
    context = (payload or {}).get("context", "")
    if not answer:
        return _make_result(True, "empty answer", "low")
    return _run_rail(
        "output",
        [
            {
                "role": "user",
                "content": (
                    f"[RAIL=output]\nUSER_QUESTION: {user_text}\n"
                    f"CONTEXT: {context[:2000]}\nANSWER: {answer}"
                ),
            }
        ],
    )


def cmd_validate_execution(payload):
    tool = (payload or {}).get("tool", "")
    params = (payload or {}).get("params", {})
    return _run_rail(
        "execution",
        [
            {
                "role": "user",
                "content": (
                    f"[RAIL=execution]\nTOOL: {tool}\nPARAMS: {json.dumps(params)[:2000]}"
                ),
            }
        ],
    )


HANDLERS = {
    "ping": cmd_ping,
    "validate_input": cmd_validate_input,
    "validate_retrieval": cmd_validate_retrieval,
    "validate_output": cmd_validate_output,
    "validate_execution": cmd_validate_execution,
}


def main() -> int:
    # Line-buffered stdout so the parent process sees responses promptly
    sys.stdout.reconfigure(line_buffering=True)  # type: ignore[attr-defined]

    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue
        try:
            req = json.loads(raw)
        except json.JSONDecodeError as e:
            sys.stdout.write(json.dumps({
                "id": None, "ok": False, "result": None,
                "error": f"invalid JSON: {e}",
            }) + "\n")
            continue

        req_id = req.get("id")
        cmd = req.get("cmd")
        payload = req.get("payload") or {}

        if cmd == "shutdown":
            sys.stdout.write(json.dumps({"id": req_id, "ok": True, "result": {"bye": True}}) + "\n")
            return 0

        handler = HANDLERS.get(cmd)
        if handler is None:
            sys.stdout.write(json.dumps({
                "id": req_id, "ok": False, "result": None,
                "error": f"unknown cmd: {cmd}",
            }) + "\n")
            continue

        try:
            result = handler(payload)
            sys.stdout.write(json.dumps({"id": req_id, "ok": True, "result": result}) + "\n")
        except Exception as e:  # noqa: BLE001
            sys.stdout.write(json.dumps({
                "id": req_id, "ok": False, "result": None,
                "error": f"{e}\n{traceback.format_exc()}",
            }) + "\n")

    return 0


if __name__ == "__main__":
    sys.exit(main())
