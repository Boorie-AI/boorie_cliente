#!/usr/bin/env python3
import wntr

# Load the model
wn = wntr.network.WaterNetworkModel('data/Net1v3.inp')

# Test coordinate checks
junction = list(wn.nodes(wntr.network.Junction))[0][1]
print(f"Junction coordinates: {junction.coordinates}")
print(f"Type: {type(junction.coordinates)}")

# Test different conditions
print(f"\nTesting conditions:")
print(f"junction.coordinates is not None: {junction.coordinates is not None}")
print(f"bool(junction.coordinates): {bool(junction.coordinates)}")

# Try the actual check
try:
    if junction.coordinates:
        print("Coordinates exist (using if junction.coordinates)")
except Exception as e:
    print(f"Error with 'if junction.coordinates': {e}")

# Try with explicit check
try:
    if junction.coordinates is not None:
        print("Coordinates exist (using if junction.coordinates is not None)")
except Exception as e:
    print(f"Error with 'if junction.coordinates is not None': {e}")