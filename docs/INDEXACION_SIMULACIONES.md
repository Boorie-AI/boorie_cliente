# Indexación de los resultados de cada simulación en el RAG

Diseño y decisiones del issue [#41](https://github.com/Boorie-AI/boorie_cliente/issues/41).
Se apoya en sus dos prerrequisitos: [`VERSIONADO_INMUTABLE.md`](VERSIONADO_INMUTABLE.md)
(#38), que da la ejecución a la que atar cada documento, y
[`WISDOM_AMBITOS.md`](WISDOM_AMBITOS.md) (#39), que garantiza que lo indexado de un
proyecto no se vea desde otro.

## El problema

Simular y preguntar eran dos mundos separados. Los resultados se guardaban en la
base y ahí se quedaban, así que la pregunta que abre el issue —«¿qué problemas
encontró la última simulación?»— sólo podía contestarse abriendo la corrida a mano
y leyendo los números.

## Qué se indexa, y qué no

Cuatro documentos escritos por ejecución, no los resultados crudos:

| Documento | Qué contiene |
|---|---|
| `ejecutivo` | Qué se corrió: red, versión, tipo, duración, pasos, parámetros |
| `estadistico` | Rangos de presión, caudal y velocidad |
| `anomalias` | Elementos fuera de umbral, con el peor valor y cuánto duró |
| `comparacion` | En qué cambió respecto a la ejecución anterior comparable |

Indexar las series completas —un valor por nudo y por paso— sería caro y además
inútil para la recuperación semántica: nadie pregunta «¿cuál era la presión del
nudo J-217 en el paso 43?», y un vector calculado sobre una lista de números no se
parece a ninguna pregunta en lenguaje natural. Los números completos siguen en la
base y se consultan de forma estructurada.

Aun así se pueden indexar, porque lo pidió el **Ing. Luis Mora** al validar el
issue: en Cliente hace falta poder indexar resultados crudos para etapas de ajuste
fino. Es el ajuste «Indexar también las series completas», apagado por defecto.

| Pieza | Fichero |
|---|---|
| Anomalías y redacción de los documentos (módulo puro) | `backend/services/hydraulic/resumenSimulacion.ts` |
| Orquestación, estado, ajustes y ciclo de vida | `backend/services/hydraulic/indexacionSimulaciones.ts` |
| Enganche al guardado de la simulación y canales IPC | `electron/handlers/networkRepository.handler.ts` |
| Estado y reintento en el historial de la red | `src/components/hydraulic/HistorialRed.tsx` |
| Ajustes (etiqueta AVANZADO) | `src/components/settings/tabs/GeneralTab.tsx` |

## Decisiones

**La indexación no bloquea la simulación.** Una corrida terminada con su
indexación fallida es una corrida terminada. `encolar()` lanza el trabajo sin
esperarlo y el estado se guarda en la propia ejecución (`pendiente`, `indexando`,
`indexada`, `fallida`, `omitida`), que es lo que permite decirlo en el historial y
reintentarlo desde ahí.

**Reindexar es rehacer.** Primero se borra lo que hubiera de esa ejecución: un
reintento no puede dejar dos copias del mismo resumen compitiendo en las
búsquedas.

**El ciclo de vida se cierra a mano, no con la cascada de la base.** Al podar una
versión de red, sus documentos se borran explícitamente —filas y vectores— antes
del `deleteMany`. Dos razones:

- Milvus no sabe nada de la cascada de SQLite. Sus vectores hay que quitarlos o el
  índice sigue respondiendo con resúmenes de simulaciones que ya no existen.
- La columna `simulationRunId` se añade con `ALTER TABLE ADD COLUMN` en las
  instalaciones que actualizan, y SQLite no admite añadir la clave foránea con
  ella. Donde no esté, la cascada no ocurriría. Sigue declarada en el esquema como
  red de seguridad; el criterio lo cumple el borrado explícito.

**Los derivados no pasan por el filtro temático del agente.** Categoría y región
describen el corpus documental —hidráulica, bombeo, normativa de un país— y el
usuario los elige en el Wisdom Center pensando en eso. Lo que Boorie escribe de una
ejecución no es una temática que nadie vaya a marcar, así que con cualquier
categoría seleccionada desaparecería justo la respuesta que el issue pide. Su
confidencialidad no depende de ese filtro: la garantiza el ámbito (#39), que se
aplica antes y no se relaja nunca.

**Los ajustes se heredan hasta que se tocan.** En Ajustes → General se elige el
ámbito: los generales o los del proyecto activo. Un proyecto sin ajustes propios
muestra los generales y los sigue cuando cambian; el primer cambio hecho con el
ámbito de proyecto elegido crea su copia y lo desengancha, y «Volver a heredar»
borra esa copia. La diferencia entre heredar y haberse desenganchado no se puede
deducir de los valores —son los mismos hasta que uno cambia—, así que la pantalla
la dice y el canal de ajustes la devuelve aparte.

**Los umbrales son configurables porque la norma cambia con el país.** Los valores
por defecto son los que fijó Luis Mora: velocidad máxima 3 m/s, presión entre 14 y
70 m, y 7 m de mínima en acueductos rurales. No hay velocidad mínima a propósito
—es la única magnitud que dejó fuera, «siempre de discusión»— y fijarle un valor
por defecto llenaría el informe de anomalías que no lo son.

**No se juzga la presión de embalses ni depósitos.** WNTR devuelve una serie por
cada nodo, y en un embalse la presión es cero o próxima a cero por definición: su
carga es el nivel de agua. Sin este filtro, contra Net3 el informe abría
denunciando que «River» y «Lake» —las fuentes de las que se abastece la red— eran
sus peores problemas. Si no se puede leer la topología se juzgan todos, que es
preferible a callar anomalías reales.

## Cuatro fallos del pipeline agéntico que lo tapaban

Los documentos se indexaban bien y se recuperaban bien, y el agente seguía
contestando que no podía responder. Ninguno era de esta funcionalidad; todos se
tapaban entre sí.

1. **La búsqueda semántica estaba muerta en silencio.** `MilvusService.search` no
   enviaba `metric_type`. Con Milvus Lite la respuesta vuelve nula, el SDK revienta
   al leerla y el error se recoge arriba: cero resultados, sin traza.
2. **Los fragmentos llegaban sin `id`.** Milvus Lite no devuelve la clave primaria
   ni pidiéndola en `output_fields`, y el nodo de recuperación desempata por ese
   id: metía todos los resultados en el mismo `undefined`. Se usa el `chunkId` de
   la metainformación.
3. **El modelo local estaba fijado a `llama3.2:3b`**, una etiqueta que no existe en
   una instalación cualquiera —la imagen publicada se llama `llama3.2:latest`—. La
   API devolvía 404 en cada documento y el 404 se traducía en «no relevante».
   `backend/services/hydraulic/agentic/modeloLocal.ts` lo resuelve ahora entre los
   instalados, prefiriendo los rápidos; `OLLAMA_MODEL` manda si está puesto.
4. **El tope de respuesta se enviaba como `max_tokens`, que Ollama ignora** —su
   opción es `num_predict`—. El modelo escribía sin límite hasta pasarse de la
   espera de 60 s, y la respuesta terminada se perdía en el `catch`, que devolvía
   el texto de «no encontré nada» aunque hubiera fuentes.

Y dos cambios de criterio en el graduado, medidos sobre documentos reales:

- **El prompt pone el documento antes que la pregunta.** El anterior lo enterraba
  bajo el rol, el contexto del dominio y una lista de criterios sobre normativa y
  región: rechazaba 3 de 3 veces un informe que empieza por «PROBLEMAS DETECTADOS»,
  y quitarle sólo la línea de contexto o sólo el ejemplo final le daba la vuelta al
  veredicto. Un criterio que se mueve al borrar un adorno no es un criterio.
- **Un juez caído o que descarta todo ya no vacía el contexto.** Lo que llega al
  graduado pasó el umbral de similitud y el filtro de ámbito, así que se conservan
  los mejores y la respuesta sale con la confianza baja que le corresponde, en
  lugar de no salir.

### Lo que costaba, y lo que cuesta

Medido sobre datos reales, con inferencia por CPU:

| | antes | después |
|---|---|---|
| Graduado, por documento | 20,3 s | 2,2 s |
| Generación de la respuesta | 106 s | 36 s |
| Pregunta completa | 411 s, con texto de relleno | 162–239 s, con las anomalías reales |

El graduado pasa además a tandas de cuatro en vez de uno en uno, y el tope de
respuesta por defecto baja de 2000 a 800 tokens: hasta entonces no se aplicaba
nunca, y al aplicarlo de verdad es lo que decide cuánto espera el usuario.

Sigue siendo lento porque el graduado llama al modelo una vez por documento
recuperado. Bajar más ya es diseño —respuesta en streaming, o saltarse el juez
cuando la búsqueda viene muy segura—, no arreglo.

## La actualización de una instalación ya empaquetada

`ensureProductionSchema` añade con `ALTER TABLE` la columna `simulationRunId` de
`hydraulic_knowledge` y las dos de `simulation_runs` (`estadoIndexacion`,
`errorIndexacion`): `CREATE TABLE IF NOT EXISTS` no las agregaría en una base que
ya existe. Verificado sobre una base sin ellas — se añaden, repetir la migración
sólo avisa, y las ejecuciones anteriores quedan en `pendiente`.

Los documentos indexados antes de esta versión pueden mencionar embalses («Nudo
River») como si fueran nudos en déficit. El código actual los excluye; conviene
reindexar esas simulaciones desde el historial.

## Estado de los criterios de aceptación

| Criterio | Estado |
|---|---|
| Preguntar al agente devuelve las anomalías reales, citando la simulación | ✅ verificado en la aplicación |
| Documentos etiquetados con proyecto, versión de red y ejecución | ✅ en la base y en la metainformación del vector |
| Un fallo de indexación no invalida ni bloquea la simulación, y se comunica | ✅ estado en la ejecución y en el historial |
| Eliminar una versión no deja documentos huérfanos en el índice | ✅ base y almacén vectorial |

## Comprobado con piezas reales

`backend/services/hydraulic/indexacionSimulaciones.e2e.test.ts` ejercita la cadena
completa contra SQLite, Milvus Lite y embeddings de Ollama: indexar, etiquetar,
recuperar la respuesta a la pregunta del criterio, no ver nada desde otro proyecto,
reindexar sin duplicar y podar sin dejar huérfanos. Se salta sola donde no hay
entorno:

```bash
BOORIE_DATA_DIR=/ruta/datos ./venv-wntr/bin/python scripts/start_milvus.py &
BOORIE_DATA_DIR=/ruta/datos BOORIE_E2E_DB=/ruta/fresh.db \
  npx vitest run backend/services/hydraulic/indexacionSimulaciones.e2e.test.ts
```

## Fuera de alcance

- **El estado no se refresca solo** mientras la indexación está en curso: el
  historial lo lee al abrirse.
- **El tipo de simulación no se traduce.** Se guarda en la base al registrar la
  corrida («Simulación Hidráulica», «Calidad del Agua»), así que traducirlo pide
  mapear los tipos conocidos.
