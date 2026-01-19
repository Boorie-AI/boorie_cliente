try:
    from milvus_lite.server import MilvusServer
    print("Found milvus_lite.server.MilvusServer")
except ImportError:
    print("milvus_lite.server not found")

try:
    from milvus import default_server
    print("Found milvus.default_server")
except ImportError:
    print("milvus.default_server not found")
