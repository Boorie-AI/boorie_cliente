# Guía de Pruebas Visuales - WNTR Viewer

## Archivos de Prueba Disponibles

1. **simple-network.inp** - Red simple con coordenadas cartesianas
   - 4 nodos, 1 tanque, 1 reservorio
   - Coordenadas simples (0-300)
   - Ideal para pruebas básicas

2. **utm-network.inp** - Red con coordenadas UTM
   - 6 nodos, 1 tanque, 1 reservorio, 1 bomba
   - Coordenadas UTM (similar a TK_Lomas)
   - Prueba la conversión de coordenadas

3. **mexico-city-network.inp** - Red con coordenadas geográficas
   - Nodos en ubicaciones reales de CDMX
   - Coordenadas geográficas (lat/lon)
   - Visualización sobre el mapa real

## Pasos para Probar

### 1. Carga de Archivo
1. Abrir la aplicación Boorie
2. Ir a la sección "WNTR" en el menú lateral
3. Click en "Load INP File"
4. Seleccionar uno de los archivos de prueba
5. Verificar que aparezca el resumen de la red en el panel izquierdo

### 2. Visualización del Mapa
- **Coordenadas Geográficas (mexico-city-network.inp)**:
  - La red debe aparecer sobre el mapa de Ciudad de México
  - Los nodos deben estar en las ubicaciones correctas (Polanco, Condesa, etc.)
  
- **Coordenadas UTM (utm-network.inp)**:
  - Click en "Center on Network" si no aparece
  - La red debe centrarse automáticamente
  
- **Coordenadas Simples (simple-network.inp)**:
  - La red aparecerá en una ubicación predeterminada
  - Usar zoom para ajustar la vista

### 3. Simulación
1. Click en "Run Simulation"
2. Esperar a que complete (indicador de carga)
3. Verificar que aparezcan los controles de tiempo

### 4. Animación
- **Play/Pause**: Iniciar/detener la animación
- **Reset**: Volver al tiempo 0
- **Slider**: Mover manualmente el tiempo
- **Velocidad**: Cambiar velocidad de animación (0.5x, 1x, 2x, 4x)

### 5. Parámetros de Visualización
Cambiar entre:
- **Pressure** (Presión) - Para nodos
- **Head** (Carga) - Para nodos
- **Flow Rate** (Caudal) - Para tuberías
- **Velocity** (Velocidad) - Para tuberías

### 6. Interacción
- **Click en nodos/tuberías**: Seleccionar elementos
- **Panel inferior**: Ver gráficos de series temporales
- **Leyenda**: Verificar escala de colores
- **Labels**: Mostrar/ocultar etiquetas

### 7. Verificación de Resultados

#### Colores esperados:
- **Azul**: Valores bajos
- **Verde**: Valores medios-bajos
- **Amarillo**: Valores medios-altos
- **Rojo**: Valores altos

#### Elementos especiales:
- **Reservorios**: Verde (#10B981)
- **Tanques**: Rojo (#EF4444)
- **Bombas**: Línea más gruesa cuando está activa

## Problemas Comunes y Soluciones

1. **"No se ve nada"**
   - Verificar que Mapbox token esté configurado
   - Click en "Center on Network"
   - Revisar la consola del navegador (F12)

2. **Red no aparece después de cargar**
   - Verificar coordenadas en el archivo INP
   - Probar con un archivo diferente
   - Revisar el resumen de la red en el panel

3. **Simulación falla**
   - Verificar que el archivo INP sea válido
   - Revisar mensajes de error
   - Intentar con archivo más simple

4. **Gráficos no aparecen**
   - Seleccionar elementos primero
   - Esperar a que se carguen los componentes
   - Verificar que la simulación haya completado

## Resultados Esperados

### mexico-city-network.inp
- Red visible sobre mapa de CDMX
- Presiones entre 20-100m
- Flujos variables según patrón diario
- Válvula PRV1 reduciendo presión

### utm-network.inp
- Conversión correcta de coordenadas UTM
- Bomba activa aumentando presión
- Patrón de demanda visible en animación

### simple-network.inp
- Visualización básica funcional
- Gradiente de presión desde reservorio
- Llenado/vaciado del tanque

## Notas Adicionales

- Los archivos de prueba están en `/test-files/`
- Los resultados de simulación se pueden exportar (futuro)
- La animación muestra 24 horas de operación
- Los patrones de demanda afectan presiones y flujos