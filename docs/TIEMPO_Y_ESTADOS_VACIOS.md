# Eje temporal real y estados vacíos que se explican

Diseño y decisiones de los bugs [#45](https://github.com/Boorie-AI/boorie_cliente/issues/45)
y [#46](https://github.com/Boorie-AI/boorie_cliente/issues/46). Continúa
[`VISOR_CANONICO.md`](VISOR_CANONICO.md) (#37) y
[`PRECONDICIONES_NAVEGACION.md`](PRECONDICIONES_NAVEGACION.md) (#33).

## #45 — El reloj no era el de la simulación

El eje temporal salía de dos constantes escritas a mano:

```js
const baseTime = new Date('2025-10-09T00:00:00')   // una fecha inventada
const hoursToAdd = visualizationSettings.timeStep   // una hora fija por paso
```

Para un modelo que reporta cada 15 minutos, el reloj de la interfaz avanzaba
**cuatro veces más rápido que la simulación**, y la fecha no correspondía a nada
—se mostraba además con zona horaria australiana—. Las marcas del eje eran
`00:00` a `22:00` fijas, al margen de la duración y del paso del modelo.

Y el dato bueno estaba delante todo el tiempo: `timestamps` es el índice de los
resultados de WNTR, **en segundos** desde el arranque, y el `.inp` declara su
propia hora de inicio en `start_clocktime`. Criterio del Ing. Luis Mora recogido
en el issue: «eso se define en EPANET; Boorie sólo debe leer ese paso temporal».

| Pieza | Fichero |
|---|---|
| Eje temporal (módulo puro) | `src/services/network/lineaTiempo.ts` |
| Hook único, con la reproducción | `src/hooks/useSimulationTimeline.ts` |
| Barra de transporte | `src/components/hydraulic/WNTRAdvancedMapViewer.tsx` |
| Gráficas y estado de bombas | `src/components/hydraulic/WNTRAdvancedVisualizerPanel.tsx` |

### Decisiones

**Sin hora declarada se muestra tiempo transcurrido, con su signo: `+04:15:00`.**
Es lo que pedía el criterio de aceptación, y es lo honesto. Un `start_clocktime`
a cero no significa «medianoche»: significa que nadie puso una hora. Enseñar
`00:15` sería indistinguible de una hora real del día.

**No se añade una fecha de proyecto configurable.** El criterio la menciona, pero
el del Ing. Luis Mora la contradice y manda: el valor lo define el `.inp`. Añadir
un campo de fecha en el proyecto sería inventarse un dato que el modelo ya trae o
deliberadamente no trae. Si aparece la necesidad, es una funcionalidad aparte.

**La reproducción va por reloj real, no por `setInterval`.** El bucle anterior
sumaba un paso cada `1000/velocidad` ms; cada repintado lento se comía tiempo y
el retraso se acumulaba, así que la velocidad efectiva dependía de lo cargada que
estuviera la red. Ahora el paso se calcula a partir del tiempo transcurrido de
verdad, con `requestAnimationFrame`. Se mantiene la convención de un segundo de
reloj por paso de reporte a 1×.

**Un modelo de un solo paso no enseña reproductor.** Es lo que devuelve WNTR en
modo `single`: `timestamps = [0]`. La barra desaparece entera en vez de ofrecer
un transporte que no lleva a ninguna parte.

**La duración se lee del último paso, no de la opción declarada.** Una simulación
que se corta antes de tiempo debe decir lo que duró, no lo que pretendía durar.

### El repintado, que era la mitad del bug

`addNetworkToMap` no tenía `currentTimeStep` entre sus dependencias, así que la
simbología se calculaba con el paso capturado cuando se creó el callback: mover
la barra cambiaba el reloj y **no repintaba el mapa**. Estaba anotado como aviso
de `react-hooks/exhaustive-deps` desde antes. Las escalas de color se conservan
—son las mismas franjas de presión y el mismo grosor por caudal, con su leyenda
en el panel—, que es lo que pedía Luis Mora al redefinir los datos cargados.

### El hook único

El issue pedía extraerlo y consumirlo desde los cinco componentes que duplicaban
la lógica temporal. **Dos de esos cinco ya no existen**: `WNTRSimulationViewer` y
`WNTRNetworkVisualization`, que retiró #37 por muertos. De los tres que quedan, la
barra de transporte y el panel leen del mismo `useSimulationTimeline`, y
`WNTRMapViewer` recibe el paso vigente por props: no tiene eje propio, sólo pinta
el paso que le dan.

### Verificación

`src/services/network/lineaTiempo.test.ts` cubre el caso exacto del criterio de
aceptación: 24 h con paso de reporte de 15 minutos, comprobando los **97 pasos uno
a uno** contra el valor esperado. Además: paso de reporte no redondo (7 min),
reconstrucción del eje cuando no llegan `timestamps`, hora de reloj declarada,
cruce de medianoche con indicación de día, y estado estacionario.

Comprobado en la aplicación con `Net3 2.inp`, 24 h y paso de 15 min: la barra dice
`+00:00:00 · paso 1 de 97 · cada 15 min · duración 24:00:00 · tiempo transcurrido`,
y avanzar cuatro pasos da `+01:00:00 · paso 5 de 97` —antes habrían sido cuatro
horas—.

## #46 — Pantallas que no explicaban qué faltaba

La infraestructura de precondiciones existía desde #33: una tabla central de
requisitos, el menú que atenúa lo que no se puede usar y un aviso accionable
encima de la vista. La auditoría de este bug encontró **un hueco concreto**, y el
resto de las vistas cumpliendo.

**El hueco.** El aviso se resolvía por *vista*, y «Simulaciones» y «Red WNTR»
llevan a la misma vista. Sólo la primera exige red cargada —la de red no la exige
a propósito: es donde se importa el `.inp`—. Resultado: quien pulsaba
«Simulaciones» sin red, que sale con candado pero sigue siendo accionable a
propósito para que pueda llegar a la explicación, aterrizaba en la pantalla de
importar sin que nada dijera qué había pasado ni por qué no estaba en
simulaciones. Ahora el aviso se resuelve por el **ítem** que el usuario pulsó, y
dice «"Simulaciones" necesita una red cargada» con el botón que lo resuelve.

**Lo que ya estaba bien**, comprobado recorriendo la aplicación:

| Situación | Resultado |
|---|---|
| Sin proyecto activo | Abre en Proyectos con la lista; el menú dice «Sin proyecto activo» y no pinta los hijos del proyecto |
| Calculadora sin proyecto | Funciona, como pedía el criterio explícito de Luis Mora |
| Chat general sin proyecto | Bienvenida con «Start New Chat» y la nota de que la conversación no se ata a ningún proyecto |
| Wisdom Center sin proyecto | Funciona: es global |
| Red WNTR con proyecto y sin red | Tarjeta del proyecto con el área de importar |

### Decisión

**Los ítems bloqueados siguen siendo pulsables.** Es la decisión de #33 y se
mantiene: bloquear el botón dejaría al usuario sin forma de llegar a la pantalla
que le explica qué falta. Lo que se arregla es que esa pantalla, ahora sí,
explique.

## Lo que se rescató de los visores retirados

### La lección, primero

La auditoría de #37 clasificó los nueve visores por si alguien los importaba, y
esa pregunta estaba bien: ninguno se renderizaba. Pero **clasificar un componente
no es inventariar lo que sabe hacer**, y se borraron 4.700 líneas sin repasar
capacidad por capacidad qué se iba con ellas. Que fueran inalcanzables para el
usuario no significa que no tuvieran nada dentro.

Se vio porque el issue #45 nombraba cinco componentes y dos ya no existían, y al
ir a mirar qué hacían aparecieron dos capacidades que el visor canónico no tenía.
La regla que queda: antes de retirar código muerto, listar sus capacidades y
decidir una por una, no en bloque.

### El resultado

Al revisar si los componentes merecían volver, la respuesta fue que no —`WNTRSimulationViewer` era un segundo visor Mapbox con sus propias
definiciones `proj4` codificadas a mano, y `WNTRNetworkVisualization` dibujaba a
mano sobre un `canvas` 2D sin desplazamiento ni zoom—, pero sí tenían **capacidades que
faltaban**.

Vuelven dos: la **simbología** (`src/services/network/simbologia.ts`), con cinco
opciones —tipo de elemento, presión, demanda, caudal y velocidad— compartidas por
el mapa, el esquema y la leyenda del panel; y el **filtrado por tipo de elemento**
(`src/services/network/capas.ts`).

**Lo que no vuelve es cómo calculaban la escala.** Usaban máximos fijos escritos a
mano: caudal 0–200 L/s, velocidad 0–2 m/s, demanda 0–50 L/s. Es el mismo defecto
que los husos codificados de #48: funciona con las redes con las que se probó y
satura en el color más alto para cualquier otra. Aquí la escala sale de los datos
del paso mostrado, y la leyenda declara el rango real —comprobado con `Net3 2`:
«Escala de esta red en este paso: 0.00 a 2.84 m/s», que con el máximo fijo de 2
habría quedado plana por arriba—.

**Filtrar por tipo de elemento vuelve también.** `src/services/network/capas.ts`
enciende y apaga nudos de consumo, depósitos, embalses, tuberías, bombas y
válvulas, con el contador de cada tipo al lado; un tipo que la red no tiene sale
deshabilitado en vez de escondido, para que se vea que existe y que esta red no
lo usa. Con miles de nudos es lo que permite mirar sólo las bombas, o el trazado
sin la nube de acometidas.

En el mapa, nudos y tramos se filtran de forma independiente. En el esquema no
puede ser: un tramo necesita sus dos extremos para dibujarse, así que ocultar un
tipo de nudo se lleva los tramos que lo tocan. El panel lo dice cuando estás en
esa vista, en lugar de dejar que parezca un fallo.

**La presión es la excepción, a propósito.** Sus cortes siguen siendo absolutos
—20 y 80 m— porque tienen un criterio de servicio que no depende de la red:
escalarla al máximo de cada modelo escondería justamente los nudos por debajo del
mínimo. La leyenda distingue los dos casos.

## El reproductor se quedaba muerto tras cualquier salto

Lo encontró el cliente con la secuencia más corta posible: **«stop» y luego
«play»**, y ya no arrancaba. El botón no tenía la culpa.

El avance se calcula con el reloj real, y para distinguir un avance propio de un
salto del usuario se guarda el último paso emitido: si el paso vigente no es ése,
alguien ha movido la barra y hay que recolocar el origen del reloj. Lo que
faltaba era **darlo por emitido al recolocar**. Sin esa línea, la condición
seguía cumpliéndose en todos los fotogramas: el origen se recolocaba sesenta
veces por segundo, nunca llegaba a acumularse un paso entero y la reproducción no
volvía a emitir jamás.

Afectaba a los cuatro caminos que mueven el paso por fuera —«stop», ir al
principio, ir al final y arrastrar la barra—, no sólo al que se reportó. Queda
cubierto en `useSimulationTimeline.test.ts`, con los fotogramas y el reloj
sustituidos para poder mandar sobre los dos; las tres pruebas del salto fallan
sin el arreglo.

## Fuera de alcance

****El acumulado de retraso en el repintado.**** El issue #45 lo dejaba como
«revisión adicional pendiente». La reproducción por reloj real lo elimina como
causa —el paso ya no depende de cuántos ticks se hayan podido servir—, pero no se
ha medido el coste de repintar una red grande paso a paso. Si aparece, es un
problema de rendimiento del mapa, no del eje temporal.
