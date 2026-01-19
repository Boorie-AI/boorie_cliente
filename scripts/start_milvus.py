from milvus import default_server
import time
import os
import sys

# Ensure data directory exists
data_dir = os.path.join(os.getcwd(), 'data')
if not os.path.exists(data_dir):
    os.makedirs(data_dir)

# Set the milvus-lite data path
# Note: milvus 2.3.x python package wrapper manages the server
default_server.set_base_dir(data_dir)

def start_server():
    try:
        print(f"Starting Milvus Lite server in {data_dir}...", flush=True)

        # Force localhost binding
        for component in ["proxy", "rootCoord", "queryCoord", "dataCoord", "indexCoord", "dataNode", "queryNode", "indexNode"]:
            default_server.config.set(f"{component}.ip", "127.0.0.1")
        
        # Start server
        default_server.start()
        
        # Default port is usually 19530
        print(f"Milvus Lite started successfully on port {default_server.listen_port}", flush=True)
        
        # Keep alive
        while True:
            time.sleep(1)
            
    except Exception as e:
        print(f"Error starting Milvus Lite: {e}")
        sys.exit(1)

if __name__ == "__main__":
    start_server()
