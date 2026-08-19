# Visor de mapa canónico

Auditoría, decisiones y retirada del issue [#37](https://github.com/Boorie-AI/boorie_cliente/issues/37).
Continúa [`REPROYECCION_CRS.md`](REPROYECCION_CRS.md) (#36), que es lo que hace que
el visor canónico pueda situar la red de verdad.

## La auditoría

El issue nombraba nueve visores con responsabilidades solapadas. El primer
hallazgo es que **sólo tres estaban vivos**: todo lo demás era código que no
renderizaba nadie.

| Componente | Líneas | ¿Lo importa alguien? | Clasificación |
|---|---:|---|---|
| `WNTRAdvancedMapViewer` | 349 | `WNTRMainInterface` | **Canónico** — armazón, dueño de los ajustes |
| `WNTRMapViewer` | 1 643 | el anterior | **Canónico** — mapa Mapbox |
| `WNTRAdvancedVisualizerPanel` | 424 | el anterior | **Canónico** — panel único |
| `WNTRNetworkViewer` | 806 | nadie | **Complementario** — era el único visor topológico |
| `EarthSphere3D` | 249 | nadie | **Se conserva** por petición expresa (ver abajo) |
| `WNTRSimulationViewer` | 1 393 | nadie | Redundante — retirado |
| `WNTRIntermediateViewer` | 503 | nadie | Redundante — retirado |
| `WNTRNetworkVisualization` | 788 | nadie | Redundante — retirado |
| `WNTRResultsViewer` | 540 | nadie | Redundante — retirado |
| `WNTRSimpleViewer` | 331 | nadie | Redundante — retirado |
| `WNTRDebugViewer` | 78 | nadie | Redundante — retirado |
| `WNTRUIStatus` | 213 | nadie | Redundante — retirado |
| `WNTRViewer` | 4 | nadie | Alias de `WNTRMainInterface` — retirado |
| `WNTRAdvancedViewer.tsx.bak` | — | nadie | Copia de seguridad en el repositorio — retirada |

La cadena viva es una sola:

```
WNTRMainInterface
  └─ WNTRAdvancedMapViewer        ← dueño de los ajustes y del paso de tiempo
       ├─ WNTRMapViewer           ← vista «Mapa» (Mapbox + reproyección real)
       ├─ NetworkTopologyView     ← vista «Esquema» (vis-network)
       └─ WNTRAdvancedVisualizerPanel  ← panel único de ajustes
```

## Por qué la retirada no necesita fases

El issue pedía retirar por fases: marcar obsoleto, verificar que no hay pérdida
funcional, eliminar. Esa cadencia protege contra borrar algo que alguien usa, y
aquí la comprobación es directa: ninguno de los retirados aparece en un `import`
de la aplicación. Las únicas menciones que quedaban eran cadenas de texto dentro
de `WNTRUIStatus` —una pantalla de estado que enumeraba nombres de fichero— y un
comentario en `declarations.d.ts`. No hay nada que degradar durante un ciclo: no
se renderizan.

Lo que sí exigía trabajo previo era **rescatar lo que sólo existía en un visor
muerto**, que es de donde sale la mitad de este cambio.

## Lo que había que rescatar antes de borrar

**El visor topológico.** Era `WNTRNetworkViewer`, y con él se iba la única forma
de ver una red que no se puede situar sobre el mapa. Ese caso no es teórico: tras
#36, una red sin sistema de coordenadas declarado no se dibuja —a propósito, para
no mentir sobre su posición—, así que sin esquema no quedaba **ninguna** vista. El
criterio «una red sin coordenadas sigue siendo visualizable» no se cumplía.

Se rescata como `NetworkTopologyView`, sobre `src/services/network/topologia.ts`,
que es un módulo puro y con pruebas. Dos correcciones respecto al original:

- **El escalado.** El original multiplicaba las coordenadas por 10. Eso sirve para
  el rango con el que se probó y para ninguno más: una red de 40 unidades de lado
  salía del tamaño de un sello. Ahora se normaliza al lienzo conservando la
  proporción, y hay un test que compara dos redes con la misma forma y tres
  órdenes de magnitud de diferencia.
- **La red sin coordenadas.** El original fijaba los nudos y desactivaba la física
  siempre, así que un `.inp` sin `[COORDINATES]` —o con todas a cero, que también
  los hay— salía como un ovillo en un punto. Ahora, cuando no hay coordenadas
  utilizables, el reparto lo hace el propio visor.

## El panel único

El issue pedía que todos los ajustes se controlen desde un solo panel. Estaban en
tres sitios, y **la mayoría no hacía nada**:

| Ajuste | Dónde estaba | Qué hacía |
|---|---|---|
| Estilo base, opacidad, tamaño de nudo, grosor de tramo, etiquetas | Diálogo propio dentro de `WNTRMapViewer` | El estilo base y las etiquetas sí; **la opacidad no llegaba al mapa** |
| «Mapa de presiones» (dos interruptores para el mismo estado) | Panel lateral | Nada: la red se coloreaba por presión estuvieran encendidos o apagados |
| Rangos de presión y caudal | Panel lateral | Nada: no salían del panel |
| Posición manual («pincha el mapa para colocar tu red») | Diálogo del mapa | Guardaba el punto y no lo usaba |
| Control temporal | Barra inferior **y** tarjeta del panel | Los dos, con distintos controles cada uno |
| «Reset View» | Pestaña *Layers* de `WNTRMainInterface` | Abría el diálogo de elegir fichero |

Ahora hay un único objeto de ajustes (`ajustesVisor.ts`) con un único dueño, el
armazón, del que leen el mapa, el esquema y el panel. El panel es un componente
controlado: ya no puede tener una opinión propia que no llegue a ninguna parte.

## Decisiones

**El control temporal se queda en la barra inferior, no en el panel.** El issue lo
lista entre lo que debe consolidarse, y se consolida: pasa de estar en dos sitios a
estar en uno. Se elige la barra porque es el sitio bueno para desplazarse por el
tiempo y porque es la copia que estaba conectada al mapa; la velocidad de
reproducción, que sólo existía en la tarjeta del panel, baja con ella. La
distinción que se aplica es entre *configurar* —el panel— y *reproducir* —la
barra—; duplicarlo era el problema real, no en cuál de los dos vivía.

**La posición manual se retira, no se muda.** Colocar la red pinchando el mapa es
la georreferenciación a ojo que #36 eliminó. Además nunca llegó a funcionar:
guardaba la coordenada del clic y no la usaba para nada.

**Los rangos de presión y caudal no se recuperan.** Eran dos deslizadores que se
autorrellenaban con el mínimo y el máximo de la simulación y no salían del panel.
En su lugar hay un selector de simbología —por tipo, por presión, por caudal— que
sí llega al dibujo, con su leyenda. Una escala de color configurable es una
funcionalidad que hay que diseñar, no un control que se pueda reconectar.

**La pestaña «Layers» desaparece.** Su contenido era un párrafo diciendo que los
controles estaban en el visor y un botón «Reset View» que abría el diálogo de
abrir fichero. Con el panel único, la pestaña sobra. `SeccionRed` pierde el valor
`'layers'`, que ningún ítem del menú usaba.

**El botón «Test Network» se retira.** Inyectaba una red inventada de tres nudos
directamente en el estado interno del mapa, sin pasar por el armazón: el panel
seguía contando los nudos de la red anterior mientras el mapa pintaba otra. Era
además la prueba de que el mapa tenía su propia copia de la red; ahora la red que
se carga desde el mapa sube al armazón, así que las dos vistas y el panel hablan
siempre de la misma.

**`EarthSphere3D` se conserva, con una salvedad que conviene decir.** Luis Mora
pidió mantenerlo entendiendo que «esa funcionalidad se puede activar para mapas de
redes con coordenadas geográficas». El componente no hace eso: dibuja una esfera
decorativa en un `canvas` 2D y encima escribe los contadores de la red. No
representa la red sobre un globo, y hoy no lo renderiza nadie. Se conserva el
fichero porque así se pidió, pero como pantalla de bienvenida sin usar, no como
visor pendiente de activar.

## Estado de los criterios de aceptación

| Criterio | Estado |
|---|---|
| Existe un único visor principal documentado como canónico | Hecho. `WNTRAdvancedMapViewer` y su cadena, documentados aquí. |
| Todos los ajustes de mapa se controlan desde un solo panel | Hecho, y los que no funcionaban ahora funcionan. |
| Una red sin coordenadas sigue siendo visualizable | Hecho. Antes de este cambio no se cumplía: el visor topológico era código muerto. |
| Retirar los redundantes no elimina ninguna capacidad que el canónico no cubra | Hecho. Lo único que sólo existía en un visor muerto era el esquema, rescatado antes de borrarlo. |

## Comprobado en la aplicación

Con la base real y la red `Net3 2.inp` (proyectada, sin EPSG declarado):

- El aviso de «esta red no se puede situar en el mapa» ofrece ahora dos salidas,
  declarar el sistema o ver el esquema.
- «Ver el esquema de la red» pinta la red con sus coordenadas del fichero y avisa
  de que no está georreferenciada.
- El panel enseña Vista, Dibujo y Simbología, y en la vista de esquema esconde los
  ajustes que sólo tienen sentido sobre el mapa.
- El deslizador de opacidad, que antes no llegaba al mapa, cambia visiblemente la
  red dibujada (comprobado a 0,2 frente a 0,9).
- La pestaña «Layers» ya no aparece.

## Tres fallos que aparecieron al probarlo con una red real

Salieron probando la aplicación con `Net6-EPANET-2p2-pump38x1p32-ok.inp`, de 3 358
nudos y 3 892 tramos. Ninguno se veía con la red de 97 nudos con la que se
desarrolló, y los tres eran de este cambio.

**El esquema salía en blanco con redes grandes.** El contenedor de vis-network
llevaba `h-full`, así que su alto dependía del contenido; vis dimensiona su lienzo
a partir del alto del contenedor, y los dos se realimentaban. Con 3 358 nudos el
lienzo llegó a medir 943 × 48 346 px y no se veía nada. Ahora el contenedor es
`absolute inset-0` dentro de uno `relative`, con alto propio.

**El esquema no se encuadraba.** vis-network ajusta la vista al terminar de
estabilizar, y con las coordenadas del fichero no hay estabilización: la red se
dibujaba fuera del encuadre inicial. Se llama a `fit()` explícitamente.

**El mapa podía pisar la vista elegida.** Al mapa se le pasaba el objeto de
ajustes entero, y su copia incluía `vista`. Cuando el mapa se corrige a sí mismo
—el estilo satélite cayendo a calles— devolvía el objeto completo con el `vista`
que tuviera capturado, deshaciendo el cambio a esquema que el usuario acababa de
hacer. Ahora se le entrega y se le acepta sólo su trozo (`soloAjustesDelMapa`).

## Lo que salió al probarlo maximizado y con el mapa base

**El visor se salía de su hueco.** `WNTRAdvancedMapViewer` pedía `h-screen`, es
decir 100 vh, dentro del hueco que deja la barra superior de la aplicación
—`h-[calc(100vh-65px)]`, 935 px en una ventana de 1000—. Se salía 33 px por
arriba, y ahí es justo donde está la fila de botones: al maximizar, desaparecían.
Medido en la aplicación antes y después. Ahora es `h-full`.

**Cambiar el mapa base se llevaba la red.** `setStyle` de Mapbox retira todas las
fuentes y capas propias, y nadie las volvía a poner: el `style.load` sólo
reiniciaba la bandera de «cambio en curso». Con el selector de mapa base metido en
el panel, el fallo pasó de escondido a estar a un clic. Ahora se repinta la red al
cargar el estilo nuevo.

**El satélite no era «incompatible con su sistema».** El visor lo desactivaba
para todo el mundo en el arranque, con la comprobación real comentada y un TODO
al lado, y luego mostraba ese mensaje. Además la comprobación que había —cuando
se activase— trataba `mesa` como renderizado por software, y Mesa es la pila
gráfica estándar de Linux: habría dejado sin satélite a cualquier equipo Linux con
aceleración de verdad. Ahora se comprueba de verdad
(`src/utils/webgl.ts`), sólo se descartan los renderizadores por software de
verdad (`llvmpipe`, `swrast`, `softpipe`), la opción se deshabilita con su motivo
cuando no puede ser, y la marca que se guardaba se escribe sólo si el satélite
tumba la aplicación de verdad —con clave nueva, porque la anterior la escribía el
código viejo en el primer arranque de cualquier equipo—.

## Fuera de alcance

**El control temporal no refleja el tiempo real del modelo.** La barra rotula las
horas de 00:00 a 22:00 y arranca de una fecha fija, independientemente de la
duración y el paso que tenga la simulación. Es el bug #45 y no se toca aquí: este
cambio se limita a dejar un solo control temporal, no a arreglarlo.

**`WNTRAnalysisPanel` y `WNTRSimulationWizard`.** También están muertos —nadie los
importa— y solapan con las pestañas de análisis y simulación de
`WNTRMainInterface`. No son visores, así que quedan fuera de la lista del issue.
Se dejan anotados aquí: son 1 112 líneas más de código sin usar.
