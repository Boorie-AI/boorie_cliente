import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, FileText, Play, Settings, BarChart3, Download } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface WNTRSimulationWizardProps {
  projectId?: string;
  onSimulationComplete?: (results: any) => void;
}

interface SimulationConfig {
  type: 'hydraulic' | 'water_quality' | 'scenario';
  duration: number;
  timestep: number;
  demandMultiplier: number;
  patternStart: string;
}

interface WaterQualityConfig {
  parameter: 'age' | 'trace' | 'chemical';
  sourceNode?: string;
  initialConcentration?: number;
  decayCoeff?: number;
}

interface ScenarioConfig {
  type: 'pipe_closure' | 'pump_failure' | 'tank_overflow' | 'contamination' | 'earthquake';
  startTime: number;
  duration: number;
  components: string[];
  severity?: number;
}

export const WNTRSimulationWizard: React.FC<WNTRSimulationWizardProps> = ({
  projectId,
  onSimulationComplete
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig>({
    type: 'hydraulic',
    duration: 24,
    timestep: 1,
    demandMultiplier: 1.0,
    patternStart: '00:00:00'
  });
  const [waterQualityConfig, setWaterQualityConfig] = useState<WaterQualityConfig>({
    parameter: 'age'
  });
  const [scenarioConfig, setScenarioConfig] = useState<ScenarioConfig>({
    type: 'pipe_closure',
    startTime: 0,
    duration: 1,
    components: []
  });
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<any>(null);
  const [networkFile, setNetworkFile] = useState<string>('');

  const steps = [
    { id: 'setup', title: 'Configuración', icon: Settings },
    { id: 'simulation', title: 'Simulación', icon: Play },
    { id: 'results', title: 'Resultados', icon: BarChart3 }
  ];

  const runSimulation = useCallback(async () => {
    if (!networkFile) {
      alert('Por favor seleccione un archivo de red');
      return;
    }

    setIsRunning(true);
    setProgress(0);

    try {
      let result;
      
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      switch (simulationConfig.type) {
        case 'hydraulic':
          result = await window.electronAPI.wntr.runHydraulicSimulation({
            network_file: networkFile,
            duration: simulationConfig.duration,
            timestep: simulationConfig.timestep,
            demand_multiplier: simulationConfig.demandMultiplier,
            pattern_start: simulationConfig.patternStart
          });
          break;

        case 'water_quality':
          result = await window.electronAPI.wntr.runWaterQualitySimulation({
            network_file: networkFile,
            parameter: waterQualityConfig.parameter,
            duration: simulationConfig.duration,
            timestep: simulationConfig.timestep,
            source_node: waterQualityConfig.sourceNode,
            initial_concentration: waterQualityConfig.initialConcentration,
            decay_coeff: waterQualityConfig.decayCoeff
          });
          break;

        case 'scenario':
          result = await window.electronAPI.wntr.runScenarioSimulation({
            network_file: networkFile,
            scenario_type: scenarioConfig.type,
            start_time: scenarioConfig.startTime,
            duration: scenarioConfig.duration,
            components: scenarioConfig.components,
            severity: scenarioConfig.severity
          });
          break;
      }

      clearInterval(progressInterval);
      setProgress(100);
      setResults(result);
      setCurrentStep(2);
      
      if (onSimulationComplete) {
        onSimulationComplete(result);
      }
    } catch (error) {
      console.error('Error en simulación:', error);
      alert('Error al ejecutar la simulación');
    } finally {
      setIsRunning(false);
    }
  }, [networkFile, simulationConfig, waterQualityConfig, scenarioConfig, onSimulationComplete]);

  const generateReport = async () => {
    if (!results) return;

    try {
      const reportData = await window.electronAPI.wntr.generateSimulationReport({
        project_id: projectId || 'default',
        simulation_type: simulationConfig.type,
        config: {
          ...simulationConfig,
          ...(simulationConfig.type === 'water_quality' ? waterQualityConfig : {}),
          ...(simulationConfig.type === 'scenario' ? scenarioConfig : {})
        },
        results: results,
        network_file: networkFile
      });

      const blob = new Blob([reportData.content], { type: 'text/markdown' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportData.filename}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generando reporte:', error);
      alert('Error al generar el reporte');
    }
  };

  const selectNetworkFile = async () => {
    try {
      const result = await window.electronAPI.dialog.showOpenDialog({
        filters: [{ name: 'EPANET Files', extensions: ['inp'] }],
        properties: ['openFile']
      });

      if (!result.canceled && result.filePaths.length > 0) {
        setNetworkFile(result.filePaths[0]);
      }
    } catch (error) {
      console.error('Error seleccionando archivo:', error);
    }
  };

  const renderSetupStep = () => (
    <div className="space-y-6">
      <div className="space-y-4">
        <Label>Archivo de Red</Label>
        <div className="flex gap-2">
          <Input 
            value={networkFile.split('/').pop() || ''} 
            placeholder="Seleccione archivo .inp"
            readOnly
            className="flex-1"
          />
          <Button onClick={selectNetworkFile} variant="outline">
            Seleccionar
          </Button>
        </div>
      </div>

      <Tabs 
        value={simulationConfig.type} 
        onValueChange={(value) => setSimulationConfig(prev => ({ ...prev, type: value as any }))}
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="hydraulic">Hidráulica</TabsTrigger>
          <TabsTrigger value="water_quality">Calidad de Agua</TabsTrigger>
          <TabsTrigger value="scenario">Escenarios</TabsTrigger>
        </TabsList>

        <TabsContent value="hydraulic" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Duración (horas)</Label>
              <Input 
                type="number" 
                value={simulationConfig.duration}
                onChange={(e) => setSimulationConfig(prev => ({ ...prev, duration: parseFloat(e.target.value) }))}
              />
            </div>
            <div>
              <Label>Paso de tiempo (horas)</Label>
              <Input 
                type="number" 
                step="0.25"
                value={simulationConfig.timestep}
                onChange={(e) => setSimulationConfig(prev => ({ ...prev, timestep: parseFloat(e.target.value) }))}
              />
            </div>
            <div>
              <Label>Multiplicador de demanda</Label>
              <Input 
                type="number" 
                step="0.1"
                value={simulationConfig.demandMultiplier}
                onChange={(e) => setSimulationConfig(prev => ({ ...prev, demandMultiplier: parseFloat(e.target.value) }))}
              />
            </div>
            <div>
              <Label>Inicio de patrón</Label>
              <Input 
                value={simulationConfig.patternStart}
                onChange={(e) => setSimulationConfig(prev => ({ ...prev, patternStart: e.target.value }))}
                placeholder="HH:MM:SS"
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="water_quality" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Parámetro</Label>
              <Select 
                value={waterQualityConfig.parameter} 
                onValueChange={(value) => setWaterQualityConfig(prev => ({ ...prev, parameter: value as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="age">Edad del agua</SelectItem>
                  <SelectItem value="trace">Trazador</SelectItem>
                  <SelectItem value="chemical">Químico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nodo fuente</Label>
              <Input 
                value={waterQualityConfig.sourceNode || ''}
                onChange={(e) => setWaterQualityConfig(prev => ({ ...prev, sourceNode: e.target.value }))}
                placeholder="ID del nodo"
              />
            </div>
            {waterQualityConfig.parameter !== 'age' && (
              <>
                <div>
                  <Label>Concentración inicial</Label>
                  <Input 
                    type="number"
                    value={waterQualityConfig.initialConcentration || ''}
                    onChange={(e) => setWaterQualityConfig(prev => ({ ...prev, initialConcentration: parseFloat(e.target.value) }))}
                  />
                </div>
                <div>
                  <Label>Coeficiente de decaimiento</Label>
                  <Input 
                    type="number"
                    step="0.01"
                    value={waterQualityConfig.decayCoeff || ''}
                    onChange={(e) => setWaterQualityConfig(prev => ({ ...prev, decayCoeff: parseFloat(e.target.value) }))}
                  />
                </div>
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="scenario" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tipo de escenario</Label>
              <Select 
                value={scenarioConfig.type} 
                onValueChange={(value) => setScenarioConfig(prev => ({ ...prev, type: value as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pipe_closure">Cierre de tubería</SelectItem>
                  <SelectItem value="pump_failure">Falla de bomba</SelectItem>
                  <SelectItem value="tank_overflow">Desbordamiento de tanque</SelectItem>
                  <SelectItem value="contamination">Contaminación</SelectItem>
                  <SelectItem value="earthquake">Terremoto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Severidad</Label>
              <Input 
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={scenarioConfig.severity || ''}
                onChange={(e) => setScenarioConfig(prev => ({ ...prev, severity: parseFloat(e.target.value) }))}
              />
            </div>
            <div>
              <Label>Tiempo de inicio (horas)</Label>
              <Input 
                type="number"
                value={scenarioConfig.startTime}
                onChange={(e) => setScenarioConfig(prev => ({ ...prev, startTime: parseFloat(e.target.value) }))}
              />
            </div>
            <div>
              <Label>Duración (horas)</Label>
              <Input 
                type="number"
                value={scenarioConfig.duration}
                onChange={(e) => setScenarioConfig(prev => ({ ...prev, duration: parseFloat(e.target.value) }))}
              />
            </div>
          </div>
          <div>
            <Label>Componentes afectados (separados por coma)</Label>
            <Input 
              value={scenarioConfig.components.join(', ')}
              onChange={(e) => setScenarioConfig(prev => ({ 
                ...prev, 
                components: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
              }))}
              placeholder="PIPE-1, PUMP-2, TANK-3"
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );

  const renderSimulationStep = () => (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">
            {isRunning ? 'Ejecutando simulación...' : 'Listo para ejecutar'}
          </h3>
          <p className="text-sm text-gray-600">
            Tipo: {simulationConfig.type === 'hydraulic' ? 'Hidráulica' : 
                  simulationConfig.type === 'water_quality' ? 'Calidad de Agua' : 'Escenarios'}
          </p>
        </div>

        {isRunning && (
          <div className="space-y-2">
            <Progress value={progress} className="w-full" />
            <p className="text-sm text-gray-500">{progress}% completado</p>
          </div>
        )}

        <Button 
          onClick={runSimulation} 
          disabled={isRunning || !networkFile}
          size="lg"
          className="w-full"
        >
          <Play className="mr-2 h-4 w-4" />
          {isRunning ? 'Ejecutando...' : 'Ejecutar Simulación'}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <strong>Archivo:</strong>
          <p className="truncate">{networkFile.split('/').pop()}</p>
        </div>
        <div>
          <strong>Duración:</strong>
          <p>{simulationConfig.duration} horas</p>
        </div>
      </div>
    </div>
  );

  const renderResultsStep = () => (
    <div className="space-y-6">
      {results ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Estado</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="outline" className="text-green-600">
                  {results.status === 'success' ? 'Exitoso' : 'Error'}
                </Badge>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tiempo de ejecución</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold">
                  {results.execution_time?.toFixed(2) || 'N/A'}s
                </p>
              </CardContent>
            </Card>
          </div>

          {results.summary && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Resumen de resultados</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(results.summary).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <span className="text-sm font-medium">{key}:</span>
                    <span className="text-sm">{String(value)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="flex gap-2">
            <Button onClick={generateReport} className="flex-1">
              <FileText className="mr-2 h-4 w-4" />
              Generar Reporte
            </Button>
            <Button onClick={() => setIsOpen(false)} variant="outline" className="flex-1">
              Cerrar
            </Button>
          </div>
        </>
      ) : (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No hay resultados disponibles. Execute una simulación primero.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <Play className="mr-2 h-4 w-4" />
          Asistente de Simulación WNTR
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Asistente de Simulación WNTR</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex items-center space-x-4">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = currentStep === index;
              const isCompleted = currentStep > index;
              
              return (
                <div key={step.id} className="flex items-center">
                  <div className={`
                    flex items-center justify-center w-8 h-8 rounded-full border-2
                    ${isActive ? 'border-blue-500 bg-blue-500 text-white' : 
                      isCompleted ? 'border-green-500 bg-green-500 text-white' : 
                      'border-gray-300 text-gray-500'}
                  `}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className={`ml-2 text-sm ${isActive ? 'font-semibold' : ''}`}>
                    {step.title}
                  </span>
                  {index < steps.length - 1 && (
                    <div className="w-8 h-px bg-gray-300 mx-4" />
                  )}
                </div>
              );
            })}
          </div>

          <div className="border rounded-lg p-6">
            {currentStep === 0 && renderSetupStep()}
            {currentStep === 1 && renderSimulationStep()}
            {currentStep === 2 && renderResultsStep()}
          </div>

          {currentStep < 2 && (
            <div className="flex justify-between">
              <Button 
                variant="outline" 
                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0}
              >
                Anterior
              </Button>
              <Button 
                onClick={() => setCurrentStep(Math.min(2, currentStep + 1))}
                disabled={currentStep === 1 && !results}
              >
                {currentStep === 1 ? 'Ver Resultados' : 'Siguiente'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};