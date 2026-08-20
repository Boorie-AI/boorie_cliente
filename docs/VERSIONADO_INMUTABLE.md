# Versionado inmutable de redes y simulaciones

Diseño y decisiones del issue [#38](https://github.com/Boorie-AI/boorie_cliente/issues/38).
Es prerrequisito de la indexación de simulaciones en el RAG por versión
([#41](https://github.com/Boorie-AI/boorie_cliente/issues/41)).

## Lo que decían los datos antes de empezar

El issue parte de que «sólo se conserva la última simulación» porque
`HydraulicNetwork.simulationResults` se sobrescribe. Sobre una base real eso
resultó ser **medio cierto**, y la mitad que falla cambia el objetivo:

| | |
|---|---|
| Base de datos | 30,3 MB |
| De los cuales, resultados de simulación | **21,4 MB en 40 filas** |
| `simulationResults` en las cinco redes | **vacío** |

Los resultados no se guardan en ese campo: la aplicación escribe en
`hydraulic_calculations`, que **ya acumula histórico**. Lo que falta no es
conservar, es saber **sobre qué estado de la red se calculó cada resultado**. Y no
hay ninguna retención, que es lo que ya costaba 21 MB con una red de 97 nudos —la
misma simulación sobre una de 3.358 rondaría los 80 MB—.

## El modelo

`HydraulicNetwork` sigue siendo **el estado vigente**: lo que se abre, se pinta y
se simula. El historial vive aparte y no se reescribe nunca.

```
HydraulicProject
  └─ HydraulicNetwork          ← contenedor: el estado de ahora
       └─ NetworkVersion       ← copias congeladas, sólo se añaden
            └─ SimulationRun   ← cada ejecución, atada a la versión con la que corrió
```

| Pieza | Fichero |
|---|---|
| Reglas puras: retención y comparación | `backend/services/hydraulic/versionado.ts` |
| Persistencia | `backend/services/hydraulic/networkVersions.ts` |
| Canales IPC | `network-version:*` en `networkRepository.handler.ts` |
| Interfaz del historial | `src/components/hydraulic/HistorialRed.tsx` |
| Instantáneas de proyecto | `src/components/hydraulic/InstantaneasProyecto.tsx` |
| Ajuste de retención | `src/components/settings/tabs/GeneralTab.tsx` |
| Formato de intercambio | `backend/services/hydraulic/intercambio.ts` |
| Esquema y DDL de producción | `prisma/schema.prisma`, `electron/main.ts` |

## Decisiones

**La restricción `@@unique([projectId, name])` se conserva, no se elimina.** El
issue ofrecía las dos opciones y ésta es la buena. Con la red como contenedor,
reimportar un `.inp` corregido crea una versión de **la misma fila**, no una
segunda red: la restricción deja de estorbar y pasa a significar lo correcto —un
nombre identifica una red, no uno de sus estados—. Lo que había que cambiar no era
el esquema sino la conducta, que era rechazar el guardado con un error.

**Versionado explícito, más automático antes de pisar datos.** El ingeniero guarda
una versión y le pone una nota. Además, Boorie versiona solo antes de reimportar
un `.inp` sobre una red existente y antes de restaurar. El automático en cada
cambio genera un historial de ruido que nadie consulta.

**Restaurar guarda antes el estado vigente.** Restaurar es una operación
destructiva como cualquier otra: sin esa copia, quien restaura por error pierde
justamente aquello a lo que querría volver. El historial lo deja escrito con su
nota, «Estado anterior a restaurar la versión N».

**Retención: hitos siempre, más las 10 últimas sin marcar.** Configurable en
`app_settings` (`retencion.versionesSinMarcar`); si no hay ajuste, rige el valor
por defecto. La más reciente se conserva siempre, aunque la política sea cero:
quedarse sin ninguna versión convertiría la retención en una forma de perder el
historial entero. La poda corre al añadir, que es cuando el historial crece.

**`hydraulic_calculations` no se migra, y es deliberado.** De los 40 resultados
guardados en una base real, **29 no registran ningún `networkId`** —su campo
`inputs` está vacío— y 11 sí. Atribuirles una versión sería inventarse justamente
la trazabilidad que falta. Se quedan donde están, intactos, y las simulaciones
nuevas se registran además en `SimulationRun`, atadas a la versión con la que
corrieron. El criterio «la migración preserva el 100 %» se cumple no tocándolos.

**El diff compara la red, no lo que se calculó sobre ella.** La lista de campos es
explícita: comparar el objeto entero marcaría como «modificado» cualquier nudo que
llevara dentro su presión de la última simulación. Y `100` y `100.0` no son un
cambio de diámetro: un `.inp` reescrito cambia el formato de los números, y
señalarlo llenaría el diff de ruido que esconde los cambios de verdad.

## Migración

Cada red sin versiones recibe la suya, marcada como `migracion`, con la nota
«Estado inicial, anterior al historial de versiones». Corre en cada arranque y es
idempotente —sólo mira las redes que no tienen ninguna—, así que también cubre las
instalaciones que actualicen más tarde. No bloquea el inicio: una base grande no
debe retrasar la ventana.

El índice único se creó a mano sobre la base existente en lugar de dejar que
`prisma db push` reconstruyera la tabla: avisaba de posible pérdida de datos, y
crear el índice directamente no puede perder filas. Se comprobó antes que no
hubiera nombres duplicados por proyecto.

## Estado de los criterios de aceptación

| Criterio | Estado |
|---|---|
| Reimportar un `.inp` modificado crea una versión nueva sin destruir la anterior | Hecho. Antes el guardado se rechazaba con un error. |
| Ver el historial y restaurar cualquier versión previa | Hecho, con nota, hito, comparación con la anterior y restauración con respaldo. |
| Cada resultado trazable a la versión exacta y a sus parámetros | Hecho para las simulaciones nuevas. Las 40 anteriores no lo son: los datos para atribuirlas no existen (ver arriba). |
| Ninguna operación normal destruye datos históricos | Hecho. Restaurar y reimportar versionan antes; la retención sólo poda lo no marcado por encima del tope. |
| La migración preserva el 100 % de proyectos, redes y resultados | Hecho, verificado por conteo antes y después: 5 proyectos, 5 redes, 40 cálculos, 11 conversaciones, 434 fragmentos. |
| Versionado del proyecto (punto 4) | Hecho: instantáneas que anotan qué versión de cada red estaba vigente. |
| Comparación entre versiones y entre simulaciones (punto 5) | Hecho: diff de red entre versiones y comparación de magnitudes entre ejecuciones. |
| Política de retención configurable (punto 6) | Hecho, en Ajustes. |

## Comprobado en la aplicación

Con la base real: las 5 redes recibieron su versión 1 al arrancar. Sobre
`Net3 2.inp` se guardó una versión con nota, se marcó como hito, se comparó con la
anterior —«Sin cambios en la red», que es lo correcto porque nada había cambiado—
y se restauró la versión 2, que dejó en el historial la `v3` con la nota «Estado
anterior a restaurar la versión 2».

## Instantáneas de proyecto

Responden a «¿cómo estaba este proyecto en la entrega de marzo?» a nivel de
proyecto, no de red. Una instantánea **no copia nada**: anota qué versión de cada
red estaba vigente, y esas versiones ya son inmutables. Congelar un proyecto
entero cuesta unas pocas filas.

```
ProjectSnapshot ──< ProjectSnapshotEntry >── NetworkVersion
```

**Una versión sujeta por una instantánea no se puede podar.** Es la consecuencia
que hacía falta atar: sin ella, la retención podía dejar una instantánea apuntando
al vacío. Cuenta como intocable igual que un hito, pero por un motivo distinto —el
hito lo decide el ingeniero; esto lo impone la integridad de algo que sí quiso
conservar—.

Restaurar una instantánea restaura cada red por separado, y cada restauración
congela antes su estado vigente: volver a marzo no puede costar perder lo de hoy.

Comprobado sobre la base real con la política puesta a cero: de las cuatro
versiones de `Net3 2.inp`, se podó la `v1` y sobrevivieron la `v2` (hito), la `v3`
(sujeta por la instantánea «Entrega de marzo») y la `v4` (la más reciente).

## Comparar dos ejecuciones de simulación

Tiene sentido entre versiones distintas de la red —«¿qué le hizo a las presiones
cambiar ese diámetro?»— y también entre dos ejecuciones de la misma versión con
parámetros distintos. Se comparan presión y demanda en los nudos, caudal y
velocidad en los tramos, sobre el mismo paso de tiempo: cuánto se movió cada
magnitud, cuántos elementos subieron y bajaron, y los que más cambiaron.

**Sólo se comparan los elementos presentes en las dos ejecuciones.** Si la red
cambió entremedias, los nudos nuevos no tienen con qué compararse, y contarlos
como «cambio cero» falsearía las medias hacia abajo. Se listan aparte.

## La retención, en Ajustes

`Configuración → General → Historial de versiones` expone cuántas versiones sin
marcar se conservan por red. Se guarda en `app_settings` con la clave
`retencion.versionesSinMarcar`; sin ajuste, rigen 10. La pantalla dice lo que la
política no toca nunca: los hitos, las versiones sujetas por una instantánea y la
más reciente.

## Exportar e importar entre instalaciones

Un paquete `.boorie.json` lleva uno o varios estados de red con lo necesario para
reconstruirlos en otra máquina: los datos, el `.inp`, el sistema de coordenadas y
de dónde salieron. Se exporta una versión desde su historial, o el conjunto que
congeló una instantánea.

**El formato lleva su propia versión.** `boorie.red/1`. Un Boorie más antiguo que
reciba un paquete futuro tiene que reconocer que no lo entiende y decirlo, en
lugar de leerlo a medias y crear una red incompleta.

**Y lleva una suma de comprobación.** Un fichero truncado a mitad de copia, o
editado a mano, produciría una red silenciosamente distinta de la que se exportó
—y eso, en un modelo hidráulico, no se nota hasta que alguien toma una decisión
con él—. Si la suma no cuadra no se importa nada.

**Los identificadores no se reutilizan.** En la instalación de destino podrían
chocar con registros que no tienen nada que ver. Se guardan como procedencia
dentro de la nota de la versión —«Importada de Boorie 1.12.0 · proyecto "X" ·
versión 4 de origen»—, que es lo que sirve para rastrearla; todo lo demás nace con
identificadores nuevos. Una red que ya existe con ese nombre recibe una versión
más en lugar de duplicarse, que es la misma semántica que reimportar un `.inp`.

**Los resultados de simulación no viajan en el paquete.** Un solo resultado de
calidad sobre una red grande ronda los 80 MB; el paquete es el estado de la red,
que es lo que hace falta para reconstruirla y volver a calcular.

### Un fallo que sólo apareció al probarlo de verdad

Los tests pasaban y el primer intento real falló: un paquete recién exportado no
validaba su propia suma. `JSON.stringify` **descarta las claves cuyo valor es
`undefined`**, así que una red sin sistema de coordenadas se guardaba sin esa
clave, y al releerla la suma calculada sobre el objeto original —que sí la tenía,
puesta a `undefined`— ya no cuadraba. Los datos del test tenían todos los campos
llenos y por eso no lo veían. La suma descarta ahora esas claves igual que hace
`JSON.stringify`, y hay un test con los campos opcionales vacíos.

Comprobado de extremo a extremo contra la base real: exportar la `v4` de
`Net3 2.inp` da un paquete de 101 KB, importarlo en el proyecto
`villa_100_casas` crea la red allí, y un paquete con un valor cambiado a mano se
rechaza sin importar nada.

## Fuera de alcance

**Llevar los resultados de simulación en el paquete**, por su tamaño (ver arriba).

**Resolver conflictos al importar**: una red con el mismo nombre recibe una
versión más, sin preguntar. Es lo coherente con el resto del versionado —nada se
pierde, todo queda en el historial—, pero no hay diálogo de «esto ya existe, ¿qué
hago?».

