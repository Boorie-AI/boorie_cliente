#!/usr/bin/env python3
import wntr

# Load the model
wn = wntr.network.WaterNetworkModel('data/Net1v3.inp')
print(f"Model loaded: {len(wn.node_name_list)} nodes")

# Test junction iteration
print("\nTesting junctions:")
for i, (name, junction) in enumerate(wn.nodes(wntr.network.Junction)):
    print(f"Junction {i}: {name}")
    print(f"  Coordinates: {junction.coordinates}")
    print(f"  Base demand: {junction.base_demand}")
    print(f"  Elevation: {junction.elevation}")
    
    # Test the problematic checks
    if junction.coordinates:
        print(f"  Has coordinates: {bool(junction.coordinates)}")
        print(f"  X: {junction.coordinates[0]}")
        print(f"  Y: {junction.coordinates[1]}")
    
    # Test demand timeseries
    print(f"  Demand timeseries list: {junction.demand_timeseries_list}")
    if junction.demand_timeseries_list:
        print(f"  Number of demands: {len(junction.demand_timeseries_list)}")
    
    if i >= 2:  # Just test first few
        break