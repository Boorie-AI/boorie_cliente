#!/usr/bin/env python3
"""Stub para `npm run dev`.

El proyecto antes lanzaba un servidor Milvus Lite local desde aquí, pero
ahora la app se conecta a un Milvus externo (127.0.0.1:19530) o cae a
fail-open si no está disponible. Este script existe únicamente para que
`scripts/dev-runner.js` no escupa un error de "file not found".

Si necesitas Milvus en local: `docker compose up -d` con el `data/`
existente, o instala milvus-lite y ajusta este script.
"""
from __future__ import annotations

import sys
import time


def main() -> int:
    try:
        # Intento opcional: si milvus-lite está instalado, lo arrancamos.
        from milvus import default_server  # type: ignore

        default_server.start()
        print(f"Milvus Lite running on port {default_server.listen_port}", flush=True)
        try:
            while True:
                time.sleep(60)
        except KeyboardInterrupt:
            pass
        finally:
            default_server.stop()
        return 0
    except Exception:
        # No hay milvus-lite — quedamos en idle para que dev-runner no
        # marque el proceso como caído. La app conectará al Milvus
        # externo o usará fail-open.
        print("[milvus-stub] milvus-lite no instalado; usando Milvus externo o fail-open.", flush=True)
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            return 0
        return 0


if __name__ == "__main__":
    sys.exit(main())
