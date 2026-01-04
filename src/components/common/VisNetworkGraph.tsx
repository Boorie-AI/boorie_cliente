import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Network } from 'vis-network';

export interface GraphData {
    nodes: any[];
    edges: any[];
}

export interface VisNetworkGraphProps {
    graph: GraphData;
    options?: any;
    events?: Record<string, (params: any) => void>;
    getNetwork?: (network: Network) => void;
    style?: React.CSSProperties;
}

const VisNetworkGraph = forwardRef((props: VisNetworkGraphProps, ref) => {
    const { graph, options, events, getNetwork, style } = props;
    const containerRef = useRef<HTMLDivElement>(null);
    const networkRef = useRef<Network | null>(null);

    // Expose the network instance via ref to match react-vis-network-graph API
    useImperativeHandle(ref, () => ({
        Network: networkRef.current
    }), [networkRef.current]);

    useEffect(() => {
        let network: Network | null = null;
        if (containerRef.current && !networkRef.current) {
            // Initialize network
            network = new Network(containerRef.current, graph, options || {});
            networkRef.current = network;

            if (getNetwork) {
                getNetwork(network);
            }

            // Bind events
            if (events) {
                Object.entries(events).forEach(([eventName, callback]) => {
                    network?.on(eventName as any, callback);
                });
            }
        } else if (networkRef.current) {
            // Update existing network
            network = networkRef.current;

            // Update options
            if (options) {
                network.setOptions(options);
            }

            // Update data
            network.setData(graph);

            // Rebind events:
            if (events) {
                Object.keys(events).forEach(eventName => {
                    network?.off(eventName as any);
                    network?.on(eventName as any, events[eventName]);
                });
            }
        }

        // Cleanup on unmount handled by separate effect
    }, [graph, options, events, getNetwork]);

    // Separate effect for teardown
    useEffect(() => {
        return () => {
            if (networkRef.current) {
                networkRef.current.destroy();
                networkRef.current = null;
            }
        };
    }, []);

    return <div ref={containerRef} style={style || { width: '100%', height: '100%' }} />;
});

VisNetworkGraph.displayName = 'VisNetworkGraph';

export default VisNetworkGraph;
