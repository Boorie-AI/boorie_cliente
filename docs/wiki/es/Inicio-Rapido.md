# Guía de Inicio Rápido

Bienvenido a Boorie! Esta guía te ayudará a comenzar con el cliente de escritorio AI avanzado para ingenieros hidráulicos en solo unos minutos.

## Primer Lanzamiento

### 1. Iniciar Boorie
- **macOS**: Abre la carpeta Aplicaciones y haz doble clic en Boorie.app
- **Windows**: Haz doble clic en Boorie.exe
- **Linux**: Ejecuta `./boorie` desde el directorio de instalación

### 2. Asistente de Configuración Inicial
En el primer lanzamiento, Boorie te guiará a través del proceso de configuración:

1. **Pantalla de Bienvenida**: Introducción a las funciones de Boorie
2. **Selección de Idioma**: Elige tu idioma preferido (EN/ES/CA)
3. **Configuración de Proveedor AI**: Configura tus proveedores AI (opcional)
4. **Configuración WNTR**: Configura el entorno Python para análisis hidráulico
5. **Consentimiento de Analíticas**: Elige tus preferencias de privacidad

## Configurar Proveedores AI

### Configuración Rápida
1. Haz clic en **Ajustes** en la esquina superior derecha
2. Navega a la pestaña **Proveedores AI**
3. Elige tu proveedor preferido:

#### OpenAI (Recomendado para principiantes)
```
API Key: sk-your-openai-api-key
Model: gpt-4-turbo-preview
```

#### Anthropic Claude (Mejor para escritura técnica)
```
API Key: sk-ant-your-anthropic-key
Model: claude-3-sonnet-20240229
```

#### Google Gemini (Bueno para análisis multimodal)
```
API Key: your-google-api-key
Model: gemini-pro
```

#### OpenRouter (Acceso a múltiples modelos)
```
API Key: sk-or-your-openrouter-key
Model: anthropic/claude-3-sonnet
```

#### Ollama (AI Local, enfocado en privacidad)
```
URL: http://localhost:11434
Model: llama2 (o cualquier modelo local)
```

### Probar Conexión AI
1. Haz clic en **Probar Conexión** junto a tu proveedor configurado
2. Deberías ver una marca verde si es exitoso
3. Si falla, verifica tu clave API y la conexión de red

## Tu Primer Proyecto Hidráulico

### 1. Crear un Nuevo Proyecto
1. Haz clic en **Nuevo Proyecto** en el panel principal
2. Completa los detalles del proyecto:
   - **Nombre**: Mi Primera Red de Agua
   - **Tipo**: Sistema de Distribución de Agua
   - **Ubicación**: Tu ciudad/región
   - **Descripción**: Aprendiendo los conceptos básicos de Boorie

3. Haz clic en **Crear Proyecto**

### 2. Importar una Red de Ejemplo
Boorie incluye archivos EPANET de ejemplo para aprendizaje:

1. Haz clic en **Importar Red** en tu proyecto
2. Navega a la carpeta `test-files/` en la instalación
3. Selecciona `simple-network.inp` o `mexico-city-network.inp`
4. Haz clic en **Abrir**

### 3. Visualizar la Red
Después de importar:
1. La red aparecerá en el **Visor de Red**
2. Usa el ratón para:
   - **Desplazar**: Haz clic y arrastra
   - **Zoom**: Rueda del ratón o gesto de pellizco
   - **Seleccionar**: Haz clic en nodos o tuberías
3. Prueba diferentes modos de vista:
   - **Vista Topológica**: Diseño esquemático
   - **Vista Geográfica**: Basada en mapa (si hay coordenadas disponibles)

## Ejecutar Tu Primer Análisis

### 1. Simulación Hidráulica Básica
1. Haz clic en **Análisis** -> **Simulación Hidráulica**
2. Configura los ajustes de simulación:
   - **Duración**: 24 horas (predeterminado)
   - **Paso de Tiempo**: 1 hora
   - **Solucionador**: EPANET (predeterminado)
3. Haz clic en **Ejecutar Simulación**

### 2. Ver Resultados
Después de que la simulación se complete:
1. El **Panel de Resultados** se abre automáticamente
2. Explora diferentes tipos de resultados:
   - **Presión**: Valores de presión en nodos
   - **Caudal**: Tasas de flujo en tuberías
   - **Velocidad**: Velocidades de flujo
   - **Pérdida de Carga**: Pérdidas por fricción

### 3. Exportar Resultados
1. Haz clic en **Exportar** en el panel de Resultados
2. Elige el formato:
   - **JSON**: Para análisis adicional
   - **CSV**: Para aplicaciones de hojas de cálculo
   - **PDF**: Para informes

## Chatear con AI Sobre Tu Red

### 1. Abrir Chat AI
1. Haz clic en el icono de **Chat** en la barra lateral izquierda
2. Selecciona tu proveedor AI configurado
3. Inicia una conversación sobre tu proyecto hidráulico

### 2. Preguntas de Ejemplo para Probar
```
Analiza la distribución de presión en esta red
```

```
¿Cuáles son los posibles problemas con la tubería P-101?
```

```
Sugiere mejoras para la eficiencia de la bomba
```

```
Genera un informe resumen para este análisis
```

### 3. Respuestas Conscientes del Contexto
Boorie proporciona automáticamente contexto sobre:
- Datos actuales de la red
- Resultados recientes de simulación
- Especificaciones del proyecto
- Estándares regionales (si están configurados)

## Cálculos Básicos

### 1. Calculadora de Dimensionamiento de Tuberías
1. Navega a **Herramientas** -> **Calculadora Hidráulica**
2. Selecciona **Dimensionamiento de Tuberías**
3. Introduce parámetros:
   - **Caudal**: 100 L/s
   - **Límite de Velocidad**: 2.0 m/s
   - **Material**: PVC
4. Haz clic en **Calcular**
5. Revisa el diámetro de tubería recomendado

### 2. Selección de Bomba
1. Selecciona la calculadora de **Selección de Bomba**
2. Introduce los requisitos del sistema:
   - **Caudal**: 150 L/s
   - **Altura**: 50 m
   - **Eficiencia**: 80%
3. Visualiza la curva de la bomba y los requisitos de potencia

### 3. Dimensionamiento de Tanque
1. Elige la calculadora de **Volumen de Tanque**
2. Especifica los patrones de demanda y requisitos de almacenamiento
3. Obtén las dimensiones optimizadas del tanque

## Gestión de Proyectos

### 1. Añadir Documentos
1. Ve a **Proyecto** -> **Documentos**
2. Haz clic en **Subir Documento**
3. Añade archivos relevantes:
   - Especificaciones técnicas
   - Planos de diseño
   - Documentos regulatorios
   - Fotos

### 2. Colaboración en Equipo
1. Navega a **Proyecto** -> **Equipo**
2. Añade miembros del equipo con direcciones de correo electrónico
3. Establece permisos:
   - **Visor**: Acceso de solo lectura
   - **Editor**: Puede modificar el proyecto
   - **Administrador**: Control total del proyecto

### 3. Control de Versiones
1. Todos los cambios se rastrean automáticamente
2. Visualiza el historial del proyecto en **Proyecto** -> **Historial**
3. Restaura versiones anteriores si es necesario

## Personalización

### 1. Ajustes de Idioma
1. Ve a **Ajustes** -> **General**
2. Selecciona tu idioma preferido:
   - **English**: Estándares internacionales
   - **Español**: Estándares latinoamericanos
   - **Català**: Estándares europeos

### 2. Estándares Regionales
1. Navega a **Ajustes** -> **Estándares**
2. Elige tu región:
   - **México**: Estándares NOM
   - **Colombia**: Regulaciones técnicas
   - **España**: Estándares UNE
   - **Internacional**: Estándares ISO

### 3. Tema y Visualización
1. **Ajustes** -> **Apariencia**
2. Elige tema:
   - **Claro**: Tema profesional predeterminado
   - **Oscuro**: Reducción de fatiga visual
   - **Auto**: Sigue la preferencia del sistema

## Soluciones Rápidas de Problemas

### Problemas Comunes

#### El Proveedor AI No Responde
1. Verifica la conexión a internet
2. Comprueba que la clave API sea correcta
3. Verifica el estado del servicio del proveedor
4. Prueba con un proveedor diferente

#### El Análisis WNTR Falla
1. Verifica el entorno Python: `./check-python-wntr.js`
2. Comprueba el formato del archivo de red
3. Busca datos inválidos de nodos/tuberías
4. Prueba primero con un archivo de ejemplo

#### La Red No Se Muestra
1. Verifica el formato del archivo (debe ser .inp)
2. Comprueba que existan datos de coordenadas
3. Intenta hacer zoom hacia afuera (la red puede ser muy pequeña/grande)
4. Busca errores de importación en la consola

#### Problemas de Rendimiento
1. Cierra aplicaciones innecesarias
2. Verifica la RAM disponible (4GB mínimo)
3. Reduce el tamaño de la red para pruebas
4. Desactiva funciones innecesarias temporalmente

### Obtener Ayuda
- [Documentación Completa](Home.md)
- [Reportar Problemas](https://github.com/Boorie-AI/boorie_cliente/issues)
- [Chat de la Comunidad](https://discord.gg/boorie)
- [Soporte por Email](mailto:support@boorie.com)

## Próximos Pasos

### Explorar Funciones Avanzadas
1. **[Integración WNTR](Integracion-WNTR.md)**: Profundiza en el análisis de redes de agua
2. **[Integración AI](Integracion-IA.md)**: Flujos de trabajo avanzados con AI
3. **[Gestión de Proyectos](Gestion-Proyectos.md)**: Gestión de proyectos complejos

### Aprende Ingeniería Hidráulica con Boorie
1. **[Cálculos de Ingeniería](Calculos-Ingenieria.md)**: Referencia de fórmulas
2. **[Estándares Regionales](Estandares-Regionales.md)**: Guías de cumplimiento
3. **[Mejores Prácticas](Mejores-Practicas.md)**: Flujos de trabajo profesionales

### Únete a la Comunidad
1. **[Contribuir](Contribuir.md)**: Ayuda a mejorar Boorie
2. **[Discusiones](https://github.com/Boorie-AI/boorie_cliente/discussions)**: Haz preguntas
3. **[Discord](https://discord.gg/boorie)**: Soporte de la comunidad en tiempo real

---

**¡Felicidades!** Has completado la guía de inicio rápido. Ahora estás listo para usar Boorie en proyectos profesionales de ingeniería hidráulica.

**Tiempo estimado de finalización**: 15-30 minutos

**Lo que has aprendido**:
- Navegación básica de Boorie
- Configuración de proveedor AI
- Creación y gestión de proyectos
- Importación y visualización de redes
- Conceptos básicos de simulación hidráulica
- Análisis con asistencia AI
- Solución de problemas básica
