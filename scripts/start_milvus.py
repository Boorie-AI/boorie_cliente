#!/usr/bin/env python3
"""
Boorie embedded Milvus Lite — la base vectorial está dentro de la app.

Sin Docker. Arranca milvus-lite en gRPC TCP, persiste a
`data/boorie-milvus/boorie.db` y escribe el puerto efectivo en
`data/boorie-milvus/port` para que el cliente TypeScript
(`backend/services/milvus.service.ts`) sepa dónde conectar.

milvus-lite >=3 corre el servidor gRPC in-process (hilos, sin subproceso
C++ de ~200MB) y elige él mismo un puerto libre: `start_and_get_uri()`
devuelve `http://127.0.0.1:{puerto}`. No podemos imponer el puerto, así
que publicamos el que nos devuelve. Requiere `pymilvus` instalado —
milvus_lite.adapter.grpc importa `pymilvus.grpc_gen`.

Esta misma instancia es la BD vectorial compartida para:
  - RAG (colección hydraulic_knowledge)
  - Memoria persistente de agentes (colección agent_memory)
  - Red agéntica / conversaciones (colección conversations)
  - Guardrails (colección guardrail_violations_vec, opcional)
"""
from __future__ import annotations

import faulthandler
import os
import platform
import signal
import sys
import threading
from importlib import metadata
from pathlib import Path
from urllib.parse import urlparse

PAQUETES_NATIVOS = ("milvus-lite", "pymilvus", "faiss-cpu", "pyarrow", "numpy", "grpcio")


def _versiones() -> str:
    partes = [f"Python {platform.python_version()} ({platform.platform()})"]
    for nombre in PAQUETES_NATIVOS:
        try:
            partes.append(f"{nombre} {metadata.version(nombre)}")
        except metadata.PackageNotFoundError:
            partes.append(f"{nombre} ausente")
    return ", ".join(partes)


def _parar_al_cerrar_la_entrada(stop: threading.Event) -> None:
    """Boorie pide parar cerrándonos la entrada estándar.

    En Windows no hay SIGTERM: kill() es TerminateProcess y Milvus moría sin
    cerrar su WAL. Cerrar la entrada funciona igual en todos los sistemas, y
    también llega si Boorie muere sin avisar. Sólo cuando lo lanza Boorie: a
    mano, con la entrada en /dev/null, pararía nada más arrancar.
    """
    if os.environ.get("BOORIE_MILVUS_PARAR_CON_STDIN") != "1":
        return

    def _leer() -> None:
        try:
            while sys.stdin.readline():
                pass
        except Exception:  # noqa: BLE001 — una entrada rota también es la orden de parar
            pass
        stop.set()

    threading.Thread(target=_leer, name="parar-con-stdin", daemon=True).start()


def main() -> int:
    # Un abort() en código nativo (faiss, pyarrow) no deja traza de Python: el
    # proceso desaparece con 0xC0000409 en Windows. Esto vuelca dónde estaba.
    faulthandler.enable()
    print(f"[milvus] {_versiones()}", flush=True)

    stop = threading.Event()
    _parar_al_cerrar_la_entrada(stop)

    try:
        from milvus_lite.server_manager import server_manager_instance
    except Exception as e:
        print(f"[milvus] milvus-lite no importable: {e}", flush=True)
        print(
            "[milvus] ejecuta:  ./venv-wntr/bin/pip install 'milvus-lite>=3' pymilvus",
            flush=True,
        )
        # Quedamos en idle — la app cae a fail-soft (search devuelve [] sin spam).
        try:
            stop.wait()
        except KeyboardInterrupt:
            pass
        return 0

    # En dev, los datos viven junto al repo (data/boorie-milvus). En la app
    # empaquetada, Resources/ no es escribible, así que Electron pasa
    # BOORIE_DATA_DIR apuntando a app.getPath('userData').
    data_root = os.environ.get("BOORIE_DATA_DIR")
    if data_root:
        db_dir = Path(data_root) / "boorie-milvus"
    else:
        project_root = Path(__file__).resolve().parent.parent
        db_dir = project_root / "data" / "boorie-milvus"
    db_dir.mkdir(parents=True, exist_ok=True)
    db_file = db_dir / "boorie.db"
    port_file = db_dir / "port"

    print(f"[milvus] DB:      {db_file}", flush=True)

    # milvus-lite elige el puerto; nos devuelve http://127.0.0.1:{puerto}.
    try:
        uri = server_manager_instance.start_and_get_uri(str(db_file))
    except Exception as e:  # noqa: BLE001 — cualquier fallo debe ser fail-soft
        print(f"[milvus] start_and_get_uri() lanzó: {e}", flush=True)
        uri = None
    if not uri:
        print("[milvus] no se pudo arrancar el servidor Milvus Lite", flush=True)
        return 1

    port = urlparse(uri).port
    if not port:
        print(f"[milvus] URI sin puerto reconocible: {uri}", flush=True)
        return 1
    address = f"127.0.0.1:{port}"

    # Publicar el puerto efectivo para que MilvusService lo lea.
    port_file.write_text(str(port), encoding="utf-8")

    print(f"[milvus] Milvus Lite listo en {address} (port file: {port_file})", flush=True)

    # Esperar señales de terminación y parar limpiamente.
    def _signal(_sig, _frame):
        stop.set()

    signal.signal(signal.SIGINT, _signal)
    signal.signal(signal.SIGTERM, _signal)

    try:
        # Con plazo para que las señales lleguen: un wait() sin plazo no las atiende.
        while not stop.wait(1):
            pass
    finally:
        try:
            if port_file.exists():
                port_file.unlink()
        except Exception:
            pass
        try:
            # El servidor vive en hilos de este proceso: release_all() los para.
            server_manager_instance.release_all()
            print("[milvus] parado", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"[milvus] release_all() lanzó: {e}", flush=True)

    return 0


if __name__ == "__main__":
    sys.exit(main())
