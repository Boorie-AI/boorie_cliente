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

## Comprobado en la aplicación

Con la base real: las 5 redes recibieron su versión 1 al arrancar. Sobre
`Net3 2.inp` se guardó una versión con nota, se marcó como hito, se comparó con la
anterior —«Sin cambios en la red», que es lo correcto porque nada había cambiado—
y se restauró la versión 2, que dejó en el historial la `v3` con la nota «Estado
anterior a restaurar la versión 2».

## Fuera de alcance

**Versionado del proyecto** como instantánea del conjunto de versiones de red
activas (punto 4 del issue). Responde a «¿cómo estaba este proyecto en la entrega
de marzo?» a nivel de proyecto, no de red. El modelo lo admite —bastaría una
entidad que apunte a un conjunto de `NetworkVersion`— pero no se construye aquí.

**Exportar e importar versiones entre instalaciones** (punto 3 de las decisiones
pendientes). Descartado para esta entrega; el modelo queda preparado con
identificadores estables y número de versión.

**El control de retención en la interfaz de Ajustes.** La política se lee de
`app_settings` y se puede cambiar ahí, pero no hay pantalla que la exponga.

**Comparar resultados entre dos simulaciones** (parte del punto 5). Se compara la
red entre versiones; comparar dos ejecuciones es otra funcionalidad.
