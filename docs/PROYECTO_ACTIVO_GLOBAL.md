# Proyecto activo global y escenarios de red

Diseño y decisiones de la funcionalidad pedida en el [issue #31](https://github.com/Boorie-AI/boorie_cliente/issues/31), la tarea habilitadora nº 0 del informe de apreciaciones.

## El problema

No existía un proyecto activo global. `useProjectStore` estaba escrito y **ningún componente lo importaba**; en su lugar, cada vista guardaba el proyecto en su propio estado local y lo perdía al desmontarse. Por eso el chat no sabía en qué proyecto estaba el usuario y no había dónde exigir «al menos una red» de forma coherente.

Además, redes y cálculos vivían en la clave `wntr_project_assets` de `localStorage`, no en las tablas `HydraulicNetwork` y `HydraulicCalculation`, invisibles para el resto de la aplicación.

## Lo que se construye

| Fase | Contenido |
|---|---|
| 1 | Proyecto activo global en `useProjectStore`, persistido y compartido por todas las vistas |
| 2 | Aviso al abrir una conversación que pertenece a otro proyecto |
| 3 | Redes y cálculos pasan a la base de datos, con migración del almacenamiento local |
| 4 | Jerarquía madre/hija de escenarios en el esquema |
| 5 | La esqueletización puede guardarse como escenario de la red madre |

## Decisiones

### 1. Se persiste sólo el id, y el proyecto se rehidrata de la base de datos

`currentProjectId` es la única cosa que se guarda. El objeto completo se vuelve a pedir con `restoreActiveProject()`.

Guardar el objeto serviría datos obsoletos si el proyecto cambió de nombre o de contenido entre sesiones. Y si se borró, el id se descarta en lugar de dejar la aplicación apuntando a algo que no existe.

**El issue daba por hecho que esto ya funcionaba** («persistencia de `currentProjectId`, línea 265»). No funcionaba: el fichero sólo importaba `devtools`, nunca `persist`, así que ese `partialize` se pasaba como opción de devtools y se ignoraba en silencio. El código *parecía* persistir. El criterio de aceptación de restaurar el proyecto al reabrir habría fallado igual después de enchufar el store.

### 2. La restauración se dispara desde la raíz, no desde el store

`restoreActiveProject()` la llama `App.tsx`, y no `onRehydrateStorage`, porque necesita que `window.electronAPI` exista para releer de la base de datos.

### 3. Seleccionar un proyecto ya no carga su red en el backend

`syncAllSections` llamaba a `loadNetworkFromProject`, que carga un `.inp` en el backend de WNTR. Se ha quitado: **seleccionar proyecto fija contexto, cargar una red es una acción explícita**.

Cargarla por detrás deja el backend simulando una red distinta de la que el usuario ve. Es la clase de desincronización que costó la retirada de la v1.5.1-rc.7 y el fallo del resaltado de nudos. Como el store no tenía ningún importador, el cambio no rompió nada.

### 4. La discrepancia chat / proyecto se pregunta, no se resuelve sola

Al abrir una conversación de otro proyecto, se pregunta. Conmutar por cuenta propia cambiaría el contexto de la red y del Wisdom Center sin que el usuario lo pida; no conmutar dejaría al LLM respondiendo con el contexto de otro proyecto. Las dos opciones son defendibles, así que decide quien está delante.

**La detección vive en `chatStore.setActiveConversation`**, que es el punto único. Hay cinco sitios en la interfaz que abren conversaciones (`Sidebar` ×2, `ProjectConversationsList`, `ProjectDetailView`), y repartir la comprobación entre ellos es exactamente lo que produjo el problema que arregla este issue.

### 5. La migración no puede perder datos

Cuatro reglas, todas cubiertas con tests, porque aquí un error se ve como «he perdido mis redes»:

1. **La clave original nunca se borra.** El control de si ya se migró vive en una clave marcadora aparte.
2. **Una red sin su `.inp` no se descarta.** El overlay guardaba la ruta del fichero, no su contenido, y `fileContent` es obligatorio. Si el usuario movió o borró el `.inp`, la red se guarda con sus datos parseados y queda marcada como incompleta: se ve en el mapa pero no se puede simular. Perder la red sería peor que no poder simularla.
3. **El marcador se escribe aunque haya fallos**, para no duplicar lo migrado en cada arranque. El detalle queda en el informe.
4. **Si el overlay está corrupto, no se marca**, para no dar por migrado algo que no se pudo leer.

Y una guarda contra ejecuciones concurrentes: el marcador se escribe al final, así que dos llamadas simultáneas verían ambas «sin migrar». Pasa de verdad — `React.StrictMode` invoca los efectos dos veces en desarrollo — y se detectó ejecutándolo: cuatro redes donde debían haber dos.

### 6. Una red ya guardada no es un fallo

El overlay acumulaba copias de la misma red, porque el código antiguo la reañadía en cada carga: 13 copias de `newport.inp` en un proyecto. El informe decía «14 redes no se pudieron guardar» cuando 13 ya estaban dentro.

El duplicado se marca en el handler, con el código `P2002` de Prisma, en lugar de comparar cadenas de error en el renderer.

### 7. El `.inp` se lee y se escribe en el proceso principal

`network-repo:save` acepta una ruta y lee el fichero él mismo. Exponer un lector de ficheros genérico al renderer sería un agujero innecesario en una aplicación con aislamiento de contexto.

> Nota: `readFile` está expuesto en `preload.ts` y **no tiene handler** en el proceso principal, así que llamarlo falla con «No handler registered for read-file». Conviene retirarlo antes de que alguien lo use.

### 8. `network-repo:load` materializa el `.inp` en un temporal

Devuelve los datos y la ruta de un fichero temporal con el contenido guardado, para poder cargarlo en el backend de WNTR con el canal que ya existe.

El efecto secundario es una mejora: la fuente pasa a ser la base de datos, así que **una red guardada sigue abriéndose aunque el usuario haya movido o borrado el `.inp` original**. Antes eso la rompía.

### 9. `onDelete: SetNull` en la jerarquía, no `Cascade`

Borrar la red original no debe llevarse por delante los escenarios derivados, que pueden tener resultados que el usuario quiere conservar. Se quedan como raíz, y el listado los muestra como tales en vez de ocultarlos.

### 10. Se mantiene «guardar como proyecto aparte»

La esqueletización puede guardarse como escenario hijo (acción principal) o como proyecto independiente. Lo segundo es el comportamiento que el cliente validó en el rc.9, y hay análisis que se organizan así.

### 11. La ruta de resultados la elige el usuario

`resultsPath` toma la carpeta donde el usuario guardó el `.inp` del escenario. No la impone la aplicación.

## Fallos latentes encontrados por el camino

Ninguno estaba en el issue. Los cuatro se arreglan en esta rama:

| Fallo | Consecuencia |
|---|---|
| `projectStore` no aplicaba `persist` | Nada se persistía, aunque el código lo aparentara |
| `ChatArea` tenía su propio `selectedProjectId` | Se podía estar en un proyecto en WNTR y en otro en el chat, sin aviso |
| El `.inp` se buscaba comparando nombres entre las redes guardadas | Con dos redes homónimas devolvía la equivocada; con una red sin guardar, el backend simulaba la anterior |
| `hydraulic:save-calculation` exigía la forma de la calculadora de fórmulas | Cualquier otro llamante fallaba con «Cannot read properties of undefined (reading 'value')»; los 29 cálculos de la migración fallaban |

También se cerraron los cuatro avisos de `react-hooks/exhaustive-deps` del componente. No son cosméticos: un closure obsoleto en los callbacks de análisis y simulación significa simular la red equivocada.

## Verificación

Todo lo relevante se comprobó ejecutando la aplicación, no sólo con tests:

- El proyecto se comparte entre vistas y se restaura al reabrir.
- El aviso de discrepancia muestra los dos nombres correctos y conmutar propaga a la vista WNTR.
- Migración sobre datos reales (16 redes en 4 proyectos, 29 cálculos): **4 redes, 12 ya existentes, 0 incompletas, 0 fallidas, 29/29 cálculos**, con el overlay intacto.
- La jerarquía se recorre en los dos sentidos, y al borrar la madre la hija sobrevive con `parentId` a `null`.
- Esqueletizar y guardar como escenario crea la hija, y la lista muestra la madre con 7 nudos y debajo el escenario con 3.

## Fuera de alcance

| No se hace | Motivo |
|---|---|
| Interfaz para reubicar el `.inp` de una red incompleta | Se marca y se explica; reimportarla ya funciona |
| Migrar el overlay de equipos distintos | La clave es local a cada instalación |
| Unificar `ProjectData` (store) y `Project` (vista) | Son formas distintas por motivos reales: una viene de la base de datos, la otra compone la vista. Unificarlas es un refactor aparte |
| Retirar `docs/wiki` o el `readFile` muerto del preload | Ajenos a este issue, anotados para no perderlos |

## Nota para la revisión

El issue describe el problema sólo en `WNTRMainInterface`. En realidad había **tres** sitios con estado de proyecto propio, y el chat no es que le faltara el dato: **tenía otro**. Y daba por funcionando una persistencia que no existía. Merece la pena tenerlo presente al valorar el alcance frente a lo pedido.
