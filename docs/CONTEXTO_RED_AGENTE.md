# La red activa en el contexto del agente

Diseño y decisiones de la funcionalidad pedida en el [issue #34](https://github.com/Boorie-AI/boorie_cliente/issues/34), punto 5 del informe de apreciaciones.

## El problema, precisado

El issue dice que «el chat no recibe ningún contexto de la red». No es exacto, y el matiz importa: `buildProjectContext` ya existía en `chatStore` e inyectaba proyecto, ubicación y lista de cálculos. Sobre la red decía esto, y sólo esto:

```
Network model: loaded (EPANET .inp data available for this project)
```

Eso es **peor que no decir nada**. El modelo sabe que existe una red, no tiene una sola cifra sobre ella, y nada le impide rellenar el hueco. En la base de pruebas hay una conversación real que lo enseña: a la pregunta «¿cómo puedo mejorar el flujo de agua en la junta 3?» el agente respondió consejos genéricos sobre limpiar una junta mecánica, sin enterarse de que J3 es un nudo de una red de cinco.

## Lo que se construye

| Pieza | Fichero |
|---|---|
| Resumen y formato (módulo puro) | `backend/services/hydraulic/networkContext.ts` |
| Lectura de datos y cita de simulación | `network-repo:context` en `electron/handlers/networkRepository.handler.ts` |
| Inyección en el prompt | `buildProjectContext` en `src/stores/chatStore.ts` |
| Indicador en la interfaz | `src/components/chat/RedEnContexto.tsx` |

## Qué entra en el resumen

Decidido con Rayne antes de implementar, que es lo que el issue pedía cerrar:

```
=== RED HIDRÁULICA ACTIVA ===
Red: villa_100_casas.inp
Nudos de consumo: 5 · Depósitos: 1 · Embalses: 1
Tuberías: 6 · Bombas: 0 · Válvulas: 0
Longitud total de tubería: 1.03 km
Demanda base total: 1.16 L/s
Diámetros: de 50 a 100 mm
Coordenadas: geográficas (lat/lon)
Última simulación guardada: «Interrupción de Servicio (PDA): P2» (2026-08-18)
=== FIN RED HIDRÁULICA ===
```

Son unas doce líneas, fijas: no crecen con el tamaño de la red.

## Decisiones

### 1. Tres de los campos que pedía el issue no existían

Medido sobre las cuatro redes guardadas antes de escribir código:

| Campo | Dónde estaba |
|---|---|
| Contadores | `HydraulicNetwork.summary`, tal cual |
| Longitud total | **No existía**: se suma `networkData.links[].length` |
| Demanda total | **No existía**: se suma `networkData.nodes[].demand` |
| CRS | `epsg` viene a `null` en las cuatro; sólo hay `geographic`/`projected` |

Se declara lo que se sabe («geográficas (lat/lon)») en vez de inventar un código EPSG.

### 2. La última simulación no sale de donde el issue decía

El issue pide citar `HydraulicNetwork.simulationResults`. Esa columna está **vacía en las cuatro redes**, y la causa es concreta: el handler que la escribe, `network-repo:save-simulation`, está expuesto en el preload y **no lo llama nadie**. Es el mismo patrón de infraestructura construida y sin conectar que ya arrastraban `useProjectStore` y `NetworkRepositoryService`.

Los datos reales están en `HydraulicCalculation`, con el id de la red dentro del JSON de `inputs`. De ahí se lee la última simulación, así que la funcionalidad cita lo que el usuario ha ejecutado de verdad en lugar de una columna que nunca se rellenó.

### 3. El contexto se inyecta también en los chats sin proyecto

`buildProjectContext` sólo se llamaba si la conversación tenía `projectId`. Después de #31 el proyecto es global, así que un chat «General» no recibía nada aunque hubiera una red cargada delante. Ahora se usa el proyecto de la conversación o, si no tiene, el proyecto activo.

### 4. Sin proyecto no hay «estado degradado»: hay chat general

Sin proyecto seleccionado, Boorie está en **chat general**. Es un modo con sus propias reglas, no una versión rota del otro: responde con conocimiento general de ingeniería hidráulica y con la documentación del Wisdom Center, pero **no admite preguntas sobre redes que no tiene delante**. Esas reglas se inyectan explícitamente:

```
=== CHAT GENERAL ===
No hay ningún proyecto ni red hidráulica cargados: esto es el chat general.
Responde con conocimiento general de ingeniería hidráulica y con la documentación
de la base de conocimiento cuando venga adjunta al mensaje.
No describas ninguna red concreta ni des cifras de «la red del usuario»: no hay ninguna
a la vista, y tampoco inventes ejemplos numéricos que puedan confundirse con ella.
Si preguntan por su red, por sus nudos o por sus resultados, dilo con claridad e
indícales que abran un proyecto e importen su archivo .inp para poder responder con datos.
Mantente dentro del ámbito de la aplicación: ingeniería hidráulica y redes de agua.
=== FIN CHAT GENERAL ===
```

**Esto se inyecta siempre, haya proyecto o no.** La primera versión sólo lo hacía cuando había proyecto, y eso dejaba el caso general sin ninguna instrucción. Se probó preguntando «resume mi red hidráulica» sin proyecto: `llama3.2` no inventó cifras como propias del usuario —pidió más información—, pero incluyó un «Ejemplo» con 5 tuberías y 500 metros que un usuario distraído puede leer como su red. Que se portara razonablemente era disposición del modelo, no una garantía del prompt; de ahí la prohibición explícita de los ejemplos numéricos.

El RAG es ortogonal: `enhancePromptWithRAG` ya se aplica a cada mensaje según la configuración de Wisdom de la conversación, con proyecto o sin él.

### 5. Las demandas negativas no se suman

Una demanda base negativa modela una entrada de agua, no un consumo; sumarla daría una demanda total menor que la real. Mismo caso que en [`POBLACION_AFECTADA_PDA.md`](POBLACION_AFECTADA_PDA.md).

## Verificación

El criterio de aceptación pide que las cifras coincidan con el panel de la red. Se comprobó en la aplicación: el panel muestra 5 nudos, 1 depósito, 1 embalse, 6 tuberías, 0 bombas y 0 válvulas para `villa_100_casas.inp`, y el contexto inyectado dice exactamente eso.

Los tests contrastan además el resumen contra las redes realmente guardadas en `prisma/hydraulic.db`, no sólo contra objetos de prueba.

## El segundo nivel: herramientas

El resumen son doce líneas fijas y no sirve para responder sobre un nudo concreto: en `Net3 2.inp` hay 92 nudos y 117 tramos. El issue proponía un segundo nivel bajo demanda, y está implementado:

| Pieza | Fichero |
|---|---|
| Las dos herramientas y su ejecutor (módulo puro) | `backend/services/hydraulic/agentTools.ts` |
| Traducción a los dialectos de cada proveedor | `backend/services/ai/toolWire.ts` |
| El bucle de vueltas | `electron/handlers/chat.handler.ts` |

`consultar_elemento(id)` devuelve un nudo con sus tramos conectados, o un tramo con sus extremos. `listar_elementos(tipo, ordenar_por, límite)` responde agregados, con tope de 50 y aviso explícito cuando recorta.

**El bucle se cierra dentro de una sola llamada a `chat:send-message`.** Los turnos intermedios no salen del handler, así que la conversación guardada sigue siendo texto plano: ni Prisma, ni el render, ni el tipo `ChatMessage` cambian. El precio es que en el turno siguiente el modelo ya no ve los resultados salvo por lo que escribió en su respuesta.

### El texto depende del proveedor

`formatearContextoRed` recibe un `conHerramientas` que decide su cierre, y no es cosmética:

- **Con herramientas**: «no estimes lo que puedes mirar», empujando a consultar.
- **Sin ellas**: «no puedes consultar nudos ni tramos concretos», que es la verdad.

Prometer una consulta que el proveedor no puede hacer le pide al modelo justo la invención que el resto del bloque trata de evitar. Quien decide es `proveedorSoportaHerramientas` en `toolWire.ts`, **la misma función que usa el despacho de `chat.handler` para cargar la red**: si divergieran, el prompt prometería lo que el código no ofrece. El parámetro va a `false` por defecto, así que un llamante que no sepa el proveedor no promete nada.

Google queda fuera porque usa `functionDeclarations`, otro dialecto. En el resto —Anthropic, OpenAI, OpenRouter, NVIDIA y Ollama— si la API rechaza las herramientas se reintenta sin ellas, en lugar de mantener una lista blanca de modelos que envejecería mal.

## Fuera de alcance

Google, por el dialecto. Y las herramientas de escritura —lanzar una simulación desde el chat—: aquí sólo se lee.
