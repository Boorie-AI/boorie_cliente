from pymilvus import connections, utility
import time

print("Connecting to Milvus...")
try:
    connections.connect(host='::1', port='19530')
    print("Connected!")
    
    print("Listing collections...")
    collections = utility.list_collections()
    print(f"Collections: {collections}")
    
except Exception as e:
    print(f"Error: {e}")
