#!/usr/bin/env python3
import wntr
import json

def load_inp_minimal(file_path):
    try:
        print(f"Loading {file_path}...")
        wn = wntr.network.WaterNetworkModel(file_path)
        print(f"Loaded successfully")
        
        # Minimal data extraction
        data = {
            'name': file_path,
            'summary': {
                'nodes': len(wn.node_name_list),
                'links': len(wn.link_name_list)
            },
            'nodes': [],
            'links': []
        }
        
        # Simple node extraction
        for name in wn.node_name_list:
            node = wn.get_node(name)
            node_info = {
                'id': name,
                'type': node.node_type
            }
            data['nodes'].append(node_info)
        
        # Simple link extraction  
        for name in wn.link_name_list:
            link = wn.get_link(name)
            link_info = {
                'id': name,
                'type': link.link_type,
                'start': link.start_node_name,
                'end': link.end_node_name
            }
            data['links'].append(link_info)
        
        return {'success': True, 'data': data}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {'success': False, 'error': str(e)}

if __name__ == "__main__":
    result = load_inp_minimal('data/Net1v3.inp')
    print(json.dumps(result, indent=2))