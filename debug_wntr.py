import wntr
import numpy as np
import pandas as pd

print(f"WNTR version: {wntr.__version__}")
print(f"NumPy version: {np.__version__}")
print(f"Pandas version: {pd.__version__}")

# Try loading the file with more detailed error handling
try:
    wn = wntr.network.WaterNetworkModel('data/Net1v3.inp')
    print("File loaded successfully!")
    print(f"Number of nodes: {len(wn.node_name_list)}")
    print(f"Number of links: {len(wn.link_name_list)}")
except Exception as e:
    print(f"Error: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()