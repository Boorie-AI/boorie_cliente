#!/usr/bin/env python3
"""
Boorie embedded Milvus Lite — la base vectorial está dentro de la app.

Sin Docker. Arranca milvus-lite en gRPC TCP en el primer puerto libre a
partir de 19530, persiste a `data/boorie-milvus/boorie.db` y escribe el
puerto efectivo en `data/boorie-milvus/port` para que el cliente
TypeScript (`backend/services/milvus.service.ts`) sepa dónde conectar.

Esta misma instancia es la BD vectorial compartida para:
  - RAG (colección hydraulic_knowledge)
  - Memoria persistente de agentes (colección agent_memory)
  - Red agéntica / conversaciones (colección conversations)
  - Guardrails (colección guardrail_violations_vec, opcional)
"""
from __future__ import annotations

import os
import signal
import socket
import sys
import time
from pathlib import Path


def find_free_port(start: int = 19530, end: int = 19550) -> int:
    for port in range(start, end + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError(f"No free port in range {start}-{end}")


def main() -> int:
    try:
        from milvus_lite.server_manager import Server
    except Exception as e:
        print(f"[milvus] milvus-lite no instalado: {e}", flush=True)
        print("[milvus] ejecuta:  ./venv-wntr/bin/pip install milvus-lite", flush=True)
        # Quedamos en idle — la app cae a fail-soft (search devuelve [] sin spam).
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            return 0
        return 0

    project_root = Path(__file__).resolve().parent.parent
    db_dir = project_root / "data" / "boorie-milvus"
    db_dir.mkdir(parents=True, exist_ok=True)
    db_file = db_dir / "boorie.db"
    port_file = db_dir / "port"

    port = find_free_port(19530, 19550)
    address = f"127.0.0.1:{port}"

    print(f"[milvus] DB:      {db_file}", flush=True)
    print(f"[milvus] Address: {address}", flush=True)

    server = Server(db_file=str(db_file), address=address)
    if not server.init():
        print("[milvus] Server.init() falló", flush=True)
        return 1
    if not server.start():
        print("[milvus] Server.start() falló", flush=True)
        return 1

    # Publicar el puerto efectivo para que MilvusService lo lea.
    port_file.write_text(str(port), encoding="utf-8")

    print(f"[milvus] Milvus Lite listo en {address} (port file: {port_file})", flush=True)

    # Esperar señales de terminación y parar limpiamente.
    stop = {"flag": False}

    def _signal(_sig, _frame):
        stop["flag"] = True

    signal.signal(signal.SIGINT, _signal)
    signal.signal(signal.SIGTERM, _signal)

    try:
        while not stop["flag"]:
            time.sleep(1)
    finally:
        try:
            if port_file.exists():
                port_file.unlink()
        except Exception:
            pass
        try:
            server._p and server._p.terminate()  # type: ignore[attr-defined]
        except Exception:
            pass

    return 0


if __name__ == "__main__":
    sys.exit(main())
