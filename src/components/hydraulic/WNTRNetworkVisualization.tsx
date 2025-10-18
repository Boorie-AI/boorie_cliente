import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  Map, Network, Layers, Settings, Play, Pause, SkipForward, 
  SkipBack, Maximize2, Download, Eye, EyeOff, Zap, Target,
  Activity, Droplets, Gauge, TrendingUp, BarChart3
} from 'lucide-react';

interface WNTRNetworkVisualizationProps {
  networkData: any;
  simulationResults?: any;
  analysisResults?: any;
  onVisualizationChange?: (settings: VisualizationSettings) => void;
}

interface VisualizationSettings {
  viewMode: 'map' | 'network' | 'hybrid';
  colorBy: 'type' | 'pressure' | 'flow' | 'velocity' | 'criticality' | 'age';
  showLabels: boolean;
  showDirections: boolean;
  nodeSize: number;
  linkWidth: number;
  transparency: number;
  timeStep: number;
  animationSpeed: number;
  showLegend: boolean;
  layerVisibility: {
    nodes: boolean;
    pipes: boolean;
    pumps: boolean;
    valves: boolean;
    tanks: boolean;
    reservoirs: boolean;
  };
}

export const WNTRNetworkVisualization: React.FC<WNTRNetworkVisualizationProps> = ({
  networkData,
  simulationResults,
  analysisResults,
  onVisualizationChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeStep, setCurrentTimeStep] = useState(0);
  const [selectedElement, setSelectedElement] = useState<any>(null);
  const [viewSettings, setViewSettings] = useState<VisualizationSettings>({
    viewMode: 'network',
    colorBy: 'type',
    showLabels: true,
    showDirections: false,
    nodeSize: 8,
    linkWidth: 2,
    transparency: 0.8,
    timeStep: 0,
    animationSpeed: 1,
    showLegend: true,
    layerVisibility: {
      nodes: true,
      pipes: true,
      pumps: true,
      valves: true,
      tanks: true,
      reservoirs: true
    }
  });

  // Color schemes for different parameters
  const colorSchemes = {
    type: {
      junction: '#3B82F6',
      tank: '#EF4444',
      reservoir: '#10B981',
      pipe: '#6B7280',
      pump: '#DC2626',
      valve: '#0891B2'
    },
    pressure: {
      low: '#DC2626',    // Red for low pressure
      normal: '#10B981', // Green for normal
      high: '#F97316'    // Orange for high pressure
    },
    flow: {
      none: '#94A3B8',   // Gray for no flow
      low: '#3B82F6',    // Blue for low flow
      medium: '#10B981', // Green for medium
      high: '#EF4444'    // Red for high flow
    },
    criticality: {
      low: '#10B981',    // Green for low criticality
      medium: '#F59E0B', // Yellow for medium
      high: '#EF4444'    // Red for high criticality
    }
  };

  // Update visualization settings
  const updateSettings = useCallback((newSettings: Partial<VisualizationSettings>) => {
    setViewSettings(prev => {
      const updated = { ...prev, ...newSettings };
      if (onVisualizationChange) {
        onVisualizationChange(updated);
      }
      return updated;
    });
  }, [onVisualizationChange]);

  // Get color for an element based on current coloring scheme
  const getElementColor = useCallback((element: any, type: 'node' | 'link') => {
    const { colorBy } = viewSettings;
    
    if (colorBy === 'type') {
      return colorSchemes.type[element.type as keyof typeof colorSchemes.type] || '#6B7280';
    }
    
    if (colorBy === 'pressure' && simulationResults?.node_results?.[element.id] && type === 'node') {
      const pressure = simulationResults.node_results[element.id].pressure;
      if (pressure < 20) return colorSchemes.pressure.low;
      if (pressure > 80) return colorSchemes.pressure.high;
      return colorSchemes.pressure.normal;
    }
    
    if (colorBy === 'flow' && simulationResults?.link_results?.[element.id] && type === 'link') {
      const flow = Math.abs(simulationResults.link_results[element.id].flowrate || 0);
      if (flow < 0.1) return colorSchemes.flow.none;
      if (flow < 1.0) return colorSchemes.flow.low;
      if (flow < 5.0) return colorSchemes.flow.medium;
      return colorSchemes.flow.high;
    }
    
    if (colorBy === 'criticality' && analysisResults?.criticality) {
      const criticality = type === 'node' 
        ? analysisResults.criticality.node_criticality?.[element.id] 
        : analysisResults.criticality.pipe_criticality?.[element.id];
      
      if (criticality !== undefined) {
        if (criticality < 0.3) return colorSchemes.criticality.low;
        if (criticality < 0.7) return colorSchemes.criticality.medium;
        return colorSchemes.criticality.high;
      }
    }
    
    return colorSchemes.type[element.type as keyof typeof colorSchemes.type] || '#6B7280';
  }, [viewSettings, simulationResults, analysisResults]);

  // Network rendering effect
  useEffect(() => {
    if (!canvasRef.current || !networkData) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    // Clear canvas
    ctx.clearRect(0, 0, rect.width, rect.height);
    
    // Render network
    renderNetwork(ctx, rect.width, rect.height);
    
  }, [networkData, viewSettings, simulationResults, currentTimeStep]);

  // Network rendering function
  const renderNetwork = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!networkData?.nodes || !networkData?.links) return;
    
    const nodes = networkData.nodes;
    const links = networkData.links;
    
    // Calculate bounds
    const xCoords = nodes.map((n: any) => n.x).filter((x: number) => x !== undefined);
    const yCoords = nodes.map((n: any) => n.y).filter((y: number) => y !== undefined);
    
    if (xCoords.length === 0 || yCoords.length === 0) {
      // No coordinates available, show message
      ctx.fillStyle = '#6B7280';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No coordinates available in network file', width / 2, height / 2);
      return;
    }
    
    const minX = Math.min(...xCoords);
    const maxX = Math.max(...xCoords);
    const minY = Math.min(...yCoords);
    const maxY = Math.max(...yCoords);
    
    const padding = 40;
    const scaleX = (width - 2 * padding) / (maxX - minX || 1);
    const scaleY = (height - 2 * padding) / (maxY - minY || 1);
    const scale = Math.min(scaleX, scaleY);
    
    // Center the network
    const offsetX = padding + (width - 2 * padding - (maxX - minX) * scale) / 2;
    const offsetY = padding + (height - 2 * padding - (maxY - minY) * scale) / 2;
    
    // Transform coordinates
    const transform = (x: number, y: number) => ({
      x: offsetX + (x - minX) * scale,
      y: offsetY + (maxY - y) * scale // Flip Y axis
    });
    
    // Draw links first (so they appear under nodes)
    links.forEach((link: any) => {
      if (!viewSettings.layerVisibility[link.type + 's']) return;
      
      const fromNode = nodes.find((n: any) => n.id === link.from);
      const toNode = nodes.find((n: any) => n.id === link.to);
      
      if (!fromNode || !toNode) return;
      
      const from = transform(fromNode.x, fromNode.y);
      const to = transform(toNode.x, toNode.y);
      
      // Get link color
      let color = colorSchemes.type[link.type as keyof typeof colorSchemes.type] || '#6B7280';
      
      if (viewSettings.colorBy === 'flow' && simulationResults?.link_results) {
        const linkResult = simulationResults.link_results[link.id];
        if (linkResult) {
          const flow = Math.abs(linkResult.flowrate || 0);
          if (flow === 0) color = colorSchemes.flow.none;
          else if (flow < 0.1) color = colorSchemes.flow.low;
          else if (flow < 1.0) color = colorSchemes.flow.medium;
          else color = colorSchemes.flow.high;
        }
      }
      
      // Draw link
      ctx.strokeStyle = color;
      ctx.lineWidth = viewSettings.linkWidth;
      ctx.globalAlpha = viewSettings.transparency;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      
      // Draw direction arrow for pumps
      if (link.type === 'pump' && viewSettings.showDirections) {
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        const arrowSize = 8;
        
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(midX, midY);
        ctx.lineTo(
          midX - arrowSize * Math.cos(angle - Math.PI / 6),
          midY - arrowSize * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          midX - arrowSize * Math.cos(angle + Math.PI / 6),
          midY - arrowSize * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
      }
    });
    
    // Draw nodes
    nodes.forEach((node: any) => {
      if (!viewSettings.layerVisibility[node.type + 's']) return;
      
      const pos = transform(node.x, node.y);
      
      // Get node color
      let color = colorSchemes.type[node.type as keyof typeof colorSchemes.type] || '#3B82F6';
      
      if (viewSettings.colorBy === 'pressure' && simulationResults?.node_results) {
        const nodeResult = simulationResults.node_results[node.id];
        if (nodeResult) {
          const pressure = nodeResult.pressure || 0;
          if (pressure < 20) color = colorSchemes.pressure.low;
          else if (pressure < 40) color = colorSchemes.pressure.normal;
          else color = colorSchemes.pressure.high;
        }
      }
      
      // Draw node
      ctx.fillStyle = color;
      ctx.globalAlpha = viewSettings.transparency;
      ctx.beginPath();
      
      if (node.type === 'tank') {
        // Draw tank as rectangle
        const size = viewSettings.nodeSize;
        ctx.fillRect(pos.x - size/2, pos.y - size/2, size, size);
      } else if (node.type === 'reservoir') {
        // Draw reservoir as triangle
        const size = viewSettings.nodeSize;
        ctx.moveTo(pos.x, pos.y - size/2);
        ctx.lineTo(pos.x - size/2, pos.y + size/2);
        ctx.lineTo(pos.x + size/2, pos.y + size/2);
        ctx.closePath();
        ctx.fill();
      } else {
        // Draw junction as circle
        ctx.arc(pos.x, pos.y, viewSettings.nodeSize / 2, 0, 2 * Math.PI);
        ctx.fill();
      }
      
      // Draw labels
      if (viewSettings.showLabels) {
        ctx.fillStyle = '#000000';
        ctx.globalAlpha = 1;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(node.id, pos.x, pos.y + viewSettings.nodeSize + 12);
      }
    });
    
    ctx.globalAlpha = 1;
  };

  // Animation controls
  const playAnimation = useCallback(() => {
    if (!simulationResults?.timestamps) return;
    
    setIsPlaying(true);
    const interval = setInterval(() => {
      setCurrentTimeStep(prev => {
        const next = prev + 1;
        if (next >= simulationResults.timestamps.length) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });
    }, 1000 / viewSettings.animationSpeed);
    
    return () => clearInterval(interval);
  }, [simulationResults, viewSettings.animationSpeed]);

  const pauseAnimation = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const resetAnimation = useCallback(() => {
    setIsPlaying(false);
    setCurrentTimeStep(0);
  }, []);

  // Export visualization
  const exportVisualization = useCallback(async (format: 'png' | 'svg' | 'json') => {
    if (!canvasRef.current || !networkData) return;
    
    try {
      switch (format) {
        case 'png':
          const canvas = canvasRef.current;
          const link = document.createElement('a');
          link.download = `${networkData.name}_visualization.png`;
          link.href = canvas.toDataURL();
          link.click();
          break;
          
        case 'json':
          const visualizationData = {
            network: networkData,
            settings: viewSettings,
            timestamp: new Date().toISOString(),
            currentTimeStep,
            simulationResults: simulationResults ? {
              timestamp: simulationResults.timestamps?.[currentTimeStep],
              node_results: simulationResults.node_results,
              link_results: simulationResults.link_results
            } : null
          };
          
          const blob = new Blob([JSON.stringify(visualizationData, null, 2)], { 
            type: 'application/json' 
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${networkData.name}_visualization.json`;
          a.click();
          URL.revokeObjectURL(url);
          break;
      }
    } catch (error) {
      console.error('Export failed:', error);
    }
  }, [networkData, viewSettings, currentTimeStep, simulationResults]);

  const renderVisualizationCanvas = () => (
    <div className="relative w-full h-96 bg-muted/10 rounded-lg border">
      <canvas
        ref={canvasRef}
        className="w-full h-full rounded-lg"
        style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)' }}
      />
      
      {/* Overlay Controls */}
      <div className="absolute top-4 right-4 space-y-2">
        <Button size="sm" variant="outline" className="bg-background/80">
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button 
          size="sm" 
          variant="outline" 
          className="bg-background/80"
          onClick={() => exportVisualization('png')}
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Network Info Overlay */}
      {networkData && (
        <div className="absolute bottom-4 left-4 bg-background/90 rounded-lg p-3 text-sm">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="font-mono font-bold">{networkData.summary.junctions}</div>
              <div className="text-xs text-muted-foreground">Junctions</div>
            </div>
            <div>
              <div className="font-mono font-bold">{networkData.summary.pipes}</div>
              <div className="text-xs text-muted-foreground">Pipes</div>
            </div>
            <div>
              <div className="font-mono font-bold">{networkData.summary.pumps}</div>
              <div className="text-xs text-muted-foreground">Pumps</div>
            </div>
          </div>
        </div>
      )}
      
      {/* Time Step Info */}
      {simulationResults?.timestamps && (
        <div className="absolute bottom-4 right-4 bg-background/90 rounded-lg p-3 text-sm">
          <div className="text-center">
            <div className="font-mono font-bold">
              {simulationResults.timestamps[currentTimeStep]?.toFixed(1) || '0.0'}h
            </div>
            <div className="text-xs text-muted-foreground">
              Step {currentTimeStep + 1} / {simulationResults.timestamps.length}
            </div>
          </div>
        </div>
      )}
      
      {/* Selection Info */}
      {selectedElement && (
        <div className="absolute top-4 left-4 bg-background/95 rounded-lg p-4 max-w-sm shadow-lg">
          <h4 className="font-semibold mb-2">{selectedElement.type}: {selectedElement.id}</h4>
          <div className="space-y-1 text-sm">
            {selectedElement.elevation !== undefined && (
              <div className="flex justify-between">
                <span>Elevation:</span>
                <span className="font-mono">{selectedElement.elevation} m</span>
              </div>
            )}
            {simulationResults?.node_results?.[selectedElement.id]?.pressure !== undefined && (
              <div className="flex justify-between">
                <span>Pressure:</span>
                <span className="font-mono">
                  {simulationResults.node_results[selectedElement.id].pressure.toFixed(2)} m
                </span>
              </div>
            )}
            {simulationResults?.link_results?.[selectedElement.id]?.flowrate !== undefined && (
              <div className="flex justify-between">
                <span>Flow:</span>
                <span className="font-mono">
                  {simulationResults.link_results[selectedElement.id].flowrate.toFixed(4)} L/s
                </span>
              </div>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedElement(null)}
            className="mt-2 h-6 text-xs"
          >
            Close
          </Button>
        </div>
      )}
    </div>
  );

  const renderLegend = () => {
    if (!viewSettings.showLegend) return null;
    
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Legend</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {viewSettings.colorBy === 'type' && (
            <div className="space-y-2">
              <div className="text-xs font-medium">Component Types</div>
              {Object.entries(colorSchemes.type).map(([type, color]) => (
                <div key={type} className="flex items-center gap-2 text-xs">
                  <div 
                    className="w-3 h-3 rounded" 
                    style={{ backgroundColor: color }}
                  />
                  <span className="capitalize">{type}</span>
                </div>
              ))}
            </div>
          )}
          
          {viewSettings.colorBy === 'pressure' && simulationResults && (
            <div className="space-y-2">
              <div className="text-xs font-medium">Pressure (m)</div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: colorSchemes.pressure.low }} />
                  <span>Low (&lt; 20m)</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: colorSchemes.pressure.normal }} />
                  <span>Normal (20-80m)</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: colorSchemes.pressure.high }} />
                  <span>High (&gt; 80m)</span>
                </div>
              </div>
            </div>
          )}
          
          {viewSettings.colorBy === 'flow' && simulationResults && (
            <div className="space-y-2">
              <div className="text-xs font-medium">Flow Rate (L/s)</div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: colorSchemes.flow.none }} />
                  <span>None (&lt; 0.1)</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: colorSchemes.flow.low }} />
                  <span>Low (0.1-1.0)</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: colorSchemes.flow.medium }} />
                  <span>Medium (1.0-5.0)</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: colorSchemes.flow.high }} />
                  <span>High (&gt; 5.0)</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderAnimationControls = () => {
    if (!simulationResults?.timestamps) return null;
    
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Animation Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={resetAnimation}
            >
              <SkipBack className="h-4 w-4" />
            </Button>
            
            <Button
              size="sm"
              onClick={isPlaying ? pauseAnimation : playAnimation}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCurrentTimeStep(simulationResults.timestamps.length - 1)}
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="space-y-2">
            <Label className="text-xs">Time Step: {currentTimeStep + 1} / {simulationResults.timestamps.length}</Label>
            <input
              type="range"
              value={currentTimeStep}
              onChange={(e) => setCurrentTimeStep(parseInt(e.target.value))}
              max={simulationResults.timestamps.length - 1}
              step={1}
              className="w-full"
            />
          </div>
          
          <div className="space-y-2">
            <Label className="text-xs">Animation Speed: {viewSettings.animationSpeed}x</Label>
            <input
              type="range"
              value={viewSettings.animationSpeed}
              onChange={(e) => updateSettings({ animationSpeed: parseFloat(e.target.value) })}
              min={0.1}
              max={5}
              step={0.1}
              className="w-full"
            />
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full">
      {/* Main Visualization */}
      <div className="lg:col-span-3 space-y-4">
        {/* Visualization Controls */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                Network Visualization
              </div>
              <div className="flex items-center gap-2">
                <Select value={viewSettings.viewMode} onValueChange={(value) => updateSettings({ viewMode: value as any })}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="map">Map View</SelectItem>
                    <SelectItem value="network">Network View</SelectItem>
                    <SelectItem value="hybrid">Hybrid View</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={viewSettings.colorBy} onValueChange={(value) => updateSettings({ colorBy: value as any })}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="type">By Type</SelectItem>
                    <SelectItem value="pressure">By Pressure</SelectItem>
                    <SelectItem value="flow">By Flow</SelectItem>
                    <SelectItem value="velocity">By Velocity</SelectItem>
                    <SelectItem value="criticality">By Criticality</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {renderVisualizationCanvas()}
          </CardContent>
        </Card>
      </div>

      {/* Side Panel */}
      <div className="space-y-4">
        {/* Display Settings */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Display Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Node Size: {viewSettings.nodeSize}</Label>
              <input
                type="range"
                value={viewSettings.nodeSize}
                onChange={(e) => updateSettings({ nodeSize: parseInt(e.target.value) })}
                min={2}
                max={20}
                step={1}
                className="w-full"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs">Link Width: {viewSettings.linkWidth}</Label>
              <input
                type="range"
                value={viewSettings.linkWidth}
                onChange={(e) => updateSettings({ linkWidth: parseInt(e.target.value) })}
                min={1}
                max={10}
                step={1}
                className="w-full"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs">Transparency: {(viewSettings.transparency * 100).toFixed(0)}%</Label>
              <input
                type="range"
                value={viewSettings.transparency}
                onChange={(e) => updateSettings({ transparency: parseFloat(e.target.value) })}
                min={0.1}
                max={1}
                step={0.1}
                className="w-full"
              />
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Show Labels</Label>
                <input
                  type="checkbox"
                  checked={viewSettings.showLabels}
                  onChange={(e) => updateSettings({ showLabels: e.target.checked })}
                  className="rounded"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label className="text-xs">Show Directions</Label>
                <input
                  type="checkbox"
                  checked={viewSettings.showDirections}
                  onChange={(e) => updateSettings({ showDirections: e.target.checked })}
                  className="rounded"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label className="text-xs">Show Legend</Label>
                <input
                  type="checkbox"
                  checked={viewSettings.showLegend}
                  onChange={(e) => updateSettings({ showLegend: e.target.checked })}
                  className="rounded"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Layer Visibility */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Layer Visibility
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(viewSettings.layerVisibility).map(([layer, visible]) => (
              <div key={layer} className="flex items-center justify-between">
                <Label className="text-xs capitalize">{layer}</Label>
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={(e) => 
                    updateSettings({ 
                      layerVisibility: { 
                        ...viewSettings.layerVisibility, 
                        [layer]: e.target.checked 
                      } 
                    })
                  }
                  className="rounded"
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Animation Controls */}
        {renderAnimationControls()}

        {/* Legend */}
        {renderLegend()}

        {/* Export Options */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportVisualization('png')}
              className="w-full"
            >
              Export PNG
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportVisualization('json')}
              className="w-full"
            >
              Export Data
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};