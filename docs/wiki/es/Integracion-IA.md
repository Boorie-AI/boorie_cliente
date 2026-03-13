# Guía de Integración AI

Boorie integra múltiples proveedores AI para ofrecer asistencia consciente del contexto para tareas de ingeniería hidráulica. Esta guía cubre la configuración, el uso y los flujos de trabajo avanzados.

## Proveedores AI Soportados

### Modelos OpenAI GPT
**Ideal para**: Consultas generales de ingeniería hidráulica, generación de código, documentación

- **Modelos**: GPT-4 Turbo, GPT-4, GPT-3.5 Turbo
- **Fortalezas**: Conocimiento amplio, excelente razonamiento, generación de código
- **Casos de Uso**: Cálculos de diseño, resolución de problemas, documentación
- **Clave API**: Requerida desde [OpenAI Platform](https://platform.openai.com)

```typescript
// Configuración
{
  provider: 'openai',
  apiKey: 'sk-your-openai-api-key',
  model: 'gpt-4-turbo-preview',
  maxTokens: 4000,
  temperature: 0.1
}
```

### Anthropic Claude
**Ideal para**: Escritura técnica, análisis complejo, cumplimiento regulatorio

- **Modelos**: Claude-3 Opus, Claude-3 Sonnet, Claude-3 Haiku
- **Fortalezas**: Precisión técnica, contexto extenso, enfocado en seguridad
- **Casos de Uso**: Generación de informes, cumplimiento de estándares, análisis detallado
- **Clave API**: Requerida desde [Anthropic Console](https://console.anthropic.com)

```typescript
// Configuración
{
  provider: 'anthropic',
  apiKey: 'sk-ant-your-anthropic-key',
  model: 'claude-3-sonnet-20240229',
  maxTokens: 4000,
  temperature: 0
}
```

### Google Gemini
**Ideal para**: Análisis multimodal, interpretación de datos visuales

- **Modelos**: Gemini Pro, Gemini Pro Vision
- **Fortalezas**: Capacidades multimodales, integración con servicios de Google
- **Casos de Uso**: Análisis de imágenes, interpretación de diagramas, visualización de datos
- **Clave API**: Requerida desde [Google AI Studio](https://aistudio.google.com)

```typescript
// Configuración
{
  provider: 'google',
  apiKey: 'your-google-api-key',
  model: 'gemini-pro',
  safetySettings: 'block_few'
}
```

### OpenRouter
**Ideal para**: Acceso a múltiples modelos, optimización de costos

- **Modelos**: Todos los modelos principales a través de una API
- **Fortalezas**: Variedad de modelos, precios competitivos, API unificada
- **Casos de Uso**: Comparación de modelos, escalado rentable
- **Clave API**: Requerida desde [OpenRouter](https://openrouter.ai)

```typescript
// Configuración
{
  provider: 'openrouter',
  apiKey: 'sk-or-your-openrouter-key',
  model: 'anthropic/claude-3-sonnet',
  baseURL: 'https://openrouter.ai/api/v1'
}
```

### Ollama (AI Local)
**Ideal para**: Proyectos sensibles a la privacidad, uso sin conexión

- **Modelos**: Llama 2, Mistral, CodeLlama, modelos personalizados
- **Fortalezas**: Privacidad total, sin costos de API, personalizable
- **Casos de Uso**: Proyectos confidenciales, entornos aislados
- **Configuración**: Instalar [Ollama](https://ollama.com) localmente

```typescript
// Configuración
{
  provider: 'ollama',
  baseURL: 'http://localhost:11434',
  model: 'llama2:7b',
  temperature: 0.1
}
```

## Configuración

### 1. Configuración de Proveedores

#### En los Ajustes de la Aplicación
1. Navega a **Ajustes** -> **Proveedores AI**
2. Haz clic en **Añadir Proveedor**
3. Selecciona el tipo de proveedor
4. Introduce las credenciales API
5. Prueba la conexión
6. Establece como predeterminado (opcional)

#### Variables de Entorno
```env
# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_MODEL=gpt-4-turbo-preview

# Anthropic
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
ANTHROPIC_MODEL=claude-3-sonnet-20240229

# Google
GOOGLE_API_KEY=your-google-api-key
GOOGLE_MODEL=gemini-pro

# OpenRouter
OPENROUTER_API_KEY=sk-or-your-openrouter-key
OPENROUTER_MODEL=anthropic/claude-3-sonnet

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2:7b
```

### 2. Parámetros del Modelo

#### Ajustes de Temperatura
- **0.0-0.2**: Cálculos precisos, respuestas factuales
- **0.3-0.7**: Equilibrio entre creatividad y precisión
- **0.8-1.0**: Soluciones creativas, lluvia de ideas

#### Gestión de Ventana de Contexto
- **Contexto Corto** (1K-4K tokens): Cálculos rápidos
- **Contexto Medio** (8K-16K tokens): Análisis estándar
- **Contexto Largo** (32K+ tokens): Informes exhaustivos

#### Seguridad y Filtrado
- **Estricto**: Máxima seguridad, mínimos falsos positivos
- **Moderado**: Enfoque equilibrado (recomendado)
- **Mínimo**: Máxima capacidad, discreción del usuario

## Interfaz de Chat

### 1. Chat Básico
```
Usuario: Calcula la pérdida por fricción en una tubería de 300mm de diámetro con 150 L/s de caudal

AI: Te ayudaré a calcular la pérdida por fricción de tu tubería.

Parámetros dados:
- Diámetro de tubería: 300 mm (0.3 m)
- Caudal: 150 L/s (0.15 m³/s)

Usando la ecuación de Darcy-Weisbach:
hf = f × (L/D) × (V²/2g)

Primero, calculemos la velocidad:
Área = π × (D/2)² = π × (0.15)² = 0.0707 m²
Velocidad = Q/A = 0.15/0.0707 = 2.12 m/s

[Continúa con cálculo detallado...]
```

### 2. Respuestas Conscientes del Contexto
Boorie proporciona contexto automático sobre:

#### Datos del Proyecto Actual
- Topología de red y componentes
- Resultados recientes de simulación
- Especificaciones y restricciones del proyecto
- Miembros del equipo y permisos

#### Estándares Regionales
- Regulaciones y códigos locales
- Especificaciones de materiales
- Requisitos de seguridad
- Guías de diseño

#### Historial de Cálculos
- Resultados de análisis previos
- Variaciones de parámetros
- Comparaciones de rendimiento
- Sugerencias de optimización

### 3. Funciones Avanzadas de Chat

#### Conversaciones Multi-turno
```
Usuario: Analiza la distribución de presión en Red-01

AI: He analizado la distribución de presión en tu red. Estos son los hallazgos principales:

1. Presión mínima: 15.2 m en Nodo J-45
2. Presión máxima: 87.3 m en Nodo J-12
3. 3 nodos por debajo de la presión mínima (20 m)

¿Te gustaría que sugiera soluciones para las áreas de baja presión?

Usuario: Sí, enfócate en las soluciones más rentables

AI: Basándome en un análisis de rentabilidad, estas son mis recomendaciones:

1. Instalar bomba de refuerzo en Nodo J-40 (€15,000)
   - Beneficios: Mejora la presión para 12 nodos
   - ROI: 3.2 años

2. Aumentar diámetro de tubería de J-23 a J-45 (€8,500)
   - Beneficios: Reduce pérdida de carga en 8.3 m
   - ROI: 2.1 años (recomendado)

[Continúa con análisis detallado...]
```

#### Integración de Documentos
- Subir documentos técnicos para análisis AI
- Referenciar estándares y regulaciones
- Extraer datos de planos y especificaciones
- Generar informes de cumplimiento

## Herramientas Potenciadas por AI

### 1. Asistente de Diseño Inteligente

#### Optimización de Dimensionamiento de Tuberías
```
Usuario: Optimiza los tamaños de tubería para costo mínimo manteniendo 20m de presión mínima

Respuesta AI:
Optimizaré los tamaños de tubería de tu red usando un enfoque de algoritmo genético:

Costo actual de la red: €145,230
Costo optimizado de la red: €128,940 (reducción del 11.3%)

Cambios recomendados:
- Tubería P-01: 400mm → 350mm (ahorro €3,200)
- Tubería P-15: 250mm → 300mm (costo €2,100, mejora presión)
- Tubería P-23: 200mm → 250mm (costo €1,800, elimina cuello de botella)

Ahorro neto: €16,290
Cumplimiento de presión: 100% (todos los nodos > 20m)
```

#### Selección de Bombas
```
Usuario: Selecciona la bomba óptima para la Estación PS-02 con demanda variable

Respuesta AI:
Basándome en tus patrones de demanda y análisis de curva del sistema:

Bomba Recomendada: Grundfos NBE 125-250
- Rango de caudal: 50-200 L/s
- Rango de altura: 35-65 m
- Eficiencia: 82% en el punto de operación
- Compatible con variador de frecuencia

Análisis de rendimiento:
- Eficiencia máxima: 84% a 150 L/s, 45m
- Costo energético anual: €8,450
- Período de recuperación: 4.2 años vs. velocidad fija
```

### 2. Analítica Predictiva

#### Pronóstico de Demanda
- Análisis de consumo histórico
- Proyecciones de crecimiento poblacional
- Impacto del desarrollo industrial
- Consideraciones de cambio climático

#### Programación de Mantenimiento
- Modelos de envejecimiento de componentes
- Análisis de probabilidad de fallo
- Optimización costo-beneficio
- Planificación de asignación de recursos

#### Monitoreo de Rendimiento
- Detección de desviaciones en tiempo real
- Análisis de tendencias de eficiencia
- Optimización del consumo energético
- Identificación de pérdidas de agua

### 3. Cumplimiento Regulatorio

#### Verificación de Estándares
```
Usuario: Verifica el cumplimiento NOM-127-SSA1 para conexiones residenciales

Respuesta AI:
Análisis de Cumplimiento NOM-127-SSA1:

CUMPLE:
- Presión mínima: 22.5 m (requerido: 20 m)
- Presión máxima: 48.3 m (límite: 50 m)
- Continuidad del servicio: 99.2% (requerido: 95%)

ATENCIÓN REQUERIDA:
- Cloro residual: 0.18 mg/L en Nodo J-67 (mín: 0.2 mg/L)
- Pico de turbidez detectado el 15-03-2024

RECOMENDACIONES:
1. Instalar cloración automática en Nodo J-60
2. Revisar sistema de filtración en Planta WTP-01
3. Implementar monitoreo continuo en puntos críticos

Documentación generada y guardada en la carpeta de cumplimiento del proyecto.
```

#### Generación de Informes
- Informes de cumplimiento automatizados
- Resúmenes de rendimiento
- Documentación de diseño
- Presentaciones regulatorias

## Integración de Analíticas

### 1. Eventos de Microsoft Clarity

Boorie rastrea el uso de AI para optimización:

```typescript
// Seguimiento de interacción AI
trackAIUsage({
  provider: 'openai',
  model: 'gpt-4-turbo',
  query_type: 'hydraulic_calculation',
  response_time: 1250,
  tokens_used: 850,
  success: true,
  user_satisfaction: 'high'
});
```

### 2. Métricas de Rendimiento
- Calificaciones de calidad de respuesta
- Tasas de completitud de consultas
- Patrones de participación del usuario
- Analíticas de adopción de funciones

### 3. Información de Optimización
- Modelos AI más efectivos por tipo de tarea
- Patrones comunes de consulta
- Análisis de errores y mejoras
- Optimización del uso de recursos

## Seguridad y Privacidad

### 1. Protección de Datos
- Claves API encriptadas con el llavero del SO
- Datos del proyecto nunca enviados a proveedores AI sin consentimiento
- Opciones de procesamiento local disponibles
- Cumplimiento GDPR/CCPA

### 2. Controles de Privacidad

#### Ajustes de Compartición de Datos
```typescript
// Configuración de privacidad
{
  shareProjectData: false,        // Nunca compartir detalles del proyecto
  shareCalculationInputs: true,   // Permitir parámetros de cálculo
  shareResults: false,           // Nunca compartir resultados de simulación
  anonymizeQueries: true,        // Eliminar información identificativa
  localProcessingOnly: false     // Usar AI en la nube con controles de privacidad
}
```

#### Registro de Auditoría
- Todas las interacciones AI registradas
- Consentimiento de compartición de datos rastreado
- Historial de consultas con controles de retención
- Opciones de exportar/eliminar datos personales

### 3. Funciones Empresariales
- Integración de inicio de sesión único (SSO)
- Monitoreo y límites de uso de API
- Controles de privacidad a nivel de equipo
- Informes de cumplimiento

## Flujos de Trabajo Avanzados

### 1. Conjunto Multi-Modelo

Usar múltiples proveedores AI para análisis complejo:

```typescript
// Ejemplo: Flujo de trabajo de revisión de diseño
const designReview = await Promise.all([
  openai.analyze(network, 'structural_analysis'),
  claude.analyze(network, 'compliance_check'),
  gemini.analyze(networkImage, 'visual_inspection')
]);

const consolidatedReport = await openai.synthesize(designReview);
```

### 2. Entrenamiento de Modelos Personalizados

Para organizaciones con necesidades específicas:

#### Adaptación de Dominio
- Ajuste fino de modelos con estándares de la empresa
- Terminología y cálculos personalizados
- Conocimiento regulatorio regional
- Patrones de proyectos históricos

#### Modelos Personalizados de Ollama
```bash
# Crear modelo personalizado de ingeniería hidráulica
ollama create hydraulic-engineer -f ./Modelfile

# Contenido del Modelfile
FROM llama2:7b
SYSTEM You are a hydraulic engineering expert specializing in water distribution systems. You follow Mexican NOM standards and use metric units.
```

### 3. Integración API

Para usuarios avanzados e integraciones:

```typescript
// Uso directo de API
import { BoorieAI } from 'boorie-ai-sdk';

const ai = new BoorieAI({
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY
});

const analysis = await ai.analyzeNetwork({
  network: networkData,
  analysisType: 'pressure_optimization',
  constraints: {
    minPressure: 20,
    maxVelocity: 3.0,
    budget: 100000
  }
});
```

## Solución de Problemas

### Problemas Comunes

#### Fallos de Conexión API
1. **Verificar Clave API**: Comprobar formato y permisos de la clave
2. **Conectividad de Red**: Probar conexión a internet
3. **Límites de Tasa**: Monitorear cuotas de uso
4. **Estado del Servicio**: Verificar páginas de estado del proveedor

#### Calidad de Respuesta Deficiente
1. **Gestión de Contexto**: Proporcionar consultas claras y específicas
2. **Selección de Modelo**: Usar el modelo apropiado para el tipo de tarea
3. **Ajuste de Parámetros**: Ajustar temperatura y longitud de contexto
4. **Ingeniería de Prompts**: Refinar la estructura de la consulta

#### Problemas de Rendimiento
1. **Optimización de Modelo**: Elegir modelos más rápidos para tareas simples
2. **Caché**: Habilitar caché de respuestas para consultas repetidas
3. **Procesamiento por Lotes**: Agrupar consultas similares
4. **Procesamiento Local**: Usar Ollama para privacidad y velocidad

### Herramientas de Depuración

#### Inspector de Respuestas AI
- Ver respuestas API sin procesar
- Analizar uso de tokens
- Verificar tiempos de respuesta
- Validar parámetros del modelo

#### Optimizador de Consultas
- Sugerir mejoras en consultas
- Identificar ineficiencias de contexto
- Recomendar alternativas de modelo
- Optimizar relación costo/rendimiento

## Mejores Prácticas

### 1. Diseño de Consultas
- Ser específico sobre requisitos y restricciones
- Incluir contexto relevante (unidades, estándares, ubicación)
- Pedir explicaciones paso a paso
- Solicitar múltiples alternativas de solución

### 2. Selección de Modelo
- **Cálculos rápidos**: GPT-3.5 Turbo, Claude Haiku
- **Análisis complejo**: GPT-4, Claude Sonnet/Opus
- **Análisis visual**: Gemini Pro Vision
- **Sensible a la privacidad**: Modelos locales de Ollama

### 3. Optimización de Costos
- Usar contexto más corto para consultas simples
- Cachear cálculos solicitados frecuentemente
- Agrupar consultas similares
- Monitorear uso con analíticas

### 4. Aseguramiento de Calidad
- Siempre verificar cálculos AI de forma independiente
- Cruzar referencias con estándares y regulaciones
- Revisar sugerencias con ingenieros experimentados
- Mantener el juicio profesional en la toma de decisiones

---

**Próximos Pasos**: Explora [Integración WNTR](Integracion-WNTR.md) para combinar las perspectivas de AI con modelado hidráulico avanzado.
