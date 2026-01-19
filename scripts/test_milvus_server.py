from milvus import default_server
from pymilvus import connections, utility
import time
import os
import sys

# Ensure data directory exists
data_dir = os.path.join(os.getcwd(), 'data')
if not os.path.exists(data_dir):
    os.makedirs(data_dir)

# Set the milvus-lite data path
default_server.set_base_dir(data_dir)

def start_server():
    try:
        print(f"Starting Milvus Lite server in {data_dir}...")
        # Clean up previous lock files if any
        
        default_server.start()
        
        # Initial connection to verify
        # Default port is usually 19530
        print(f"Milvus Lite started successfully on port {default_server.listen_port}")
        
        # Keep alive
        while True:
            time.sleep(1)
            
    except Exception as e:
        print(f"Error starting Milvus Lite: {e}")
        sys.exit(1)

if __name__ == "__main__":
    start_server()
