# Reproyección geodésica real de coordenadas (EPSG/UTM)

Diseño y decisiones del issue [#36](https://github.com/Boorie-AI/boorie_cliente/issues/36).
Cubre también el mínimo del bug hermano [#48](https://github.com/Boorie-AI/boorie_cliente/issues/48),
que denuncia el mismo código desde el otro lado.

## El problema

Boorie enseñaba un EPSG para cada red cargada y la dibujaba sobre la ortofoto,
dando la impresión de que la georreferenciación era correcta. El EPSG no salía de
ningún dato: se adivinaba.

Había dos escaleras de heurísticas independientes, una en cada lado de la
aplicación:

- `wntrService.py`, `_get_coordinate_info`: detectaba «coordenadas tipo UTM» por
  magnitud y deducía el huso por rangos de X codificados a mano para América
  Latina, con un caso especial por nombre de fichero para Cartagena.
- `WNTRMapViewer.tsx`, `detectCoordinateSystem`: unas 200 líneas con la misma
  idea y distintos umbrales, incluidos casos por nombre de fichero
  (`tk-lomas`, `cartagena`, `mexico`) y un `else` final que asumía UTM 18N.

Las dos podían dar respuestas distintas para la misma red. Y la del visor nunca
devolvía «no lo sé»: su último `return` situaba en el Caribe colombiano cualquier
red que no encajara en ningún rango.

### Por qué adivinar no puede funcionar

La X de una coordenada UTM es la distancia al meridiano central **de su huso**, y
el mismo número es válido en los 60. `842.913 m` es un punto legítimo en
Cartagena, en Valencia y en Sídney. No existe la heurística correcta: los rangos
por país acertaban con las redes con las que se probaron porque *ya se sabía* de
qué país eran.

Esa es la causa de fondo de #48, y es la razón de que la solución no sea afinar
la heurística sino sustituirla por una declaración del ingeniero.

## Cómo queda

```
.inp  ──►  lector Python            ──►  tipo (geográfico/proyectado), límites,
                                          unidades. EPSG sólo si es demostrable
                                          (rango lon/lat → EPSG:4326).
                                              │
                                              ▼
          HydraulicNetwork.coordinateSystem   declared_epsg  ◄── selector de la UI
                                              │
                                              ▼
          @/services/geo/crs (proj4)     ──►  reproyección a WGS84 para pintar
                                              │
                                              ▼
                                          validación de cordura contra el país
                                          declarado en el proyecto
```

Lo declarado manda sobre lo detectado, siempre. Sin EPSG resuelto **la red no se
dibuja**: la cabecera del visor explica por qué y ofrece el botón para
declararlo.

| Pieza | Fichero |
|---|---|
| Motor de reproyección y catálogo (módulo puro) | `src/services/geo/crs.ts` |
| Selector explícito de EPSG | `src/components/hydraulic/CRSSelector.tsx` |
| Visor de mapa: resolución, aviso y repintado | `src/components/hydraulic/WNTRMapViewer.tsx` |
| Persistencia del EPSG declarado | `backend/services/hydraulic/networkRepository.ts` (`declararCRS`) |
| Canal IPC | `network-repo:declare-crs` |
| Lector del `.inp` sin heurísticas de huso | `backend/services/hydraulic/wntrService.py` |

## Decisiones

**proj4js, no pyproj.** El issue proponía añadir `pyproj` al entorno WNTR. Se
descarta por dos motivos, uno funcional y otro de riesgo. El funcional manda: el
criterio de aceptación pide que cambiar el EPSG recoloque la red *sin recargar el
.inp*, y con `pyproj` cada cambio sería un viaje a Python más un reparseo del
fichero. El de riesgo es el que ya estaba anotado en el propio issue — una
dependencia Python nueva hay que validarla en macOS, Windows y Linux, y el
proyecto arrastra incidencias conocidas con NumPy/SciPy en macOS. `proj4` ya era
dependencia del proyecto (`package.json`) y ya se usaba en el visor. Python
conserva el papel de *lector*: describe lo que ve en el fichero, no transforma.

**Un solo motor, un solo sitio.** Las definiciones `proj4.defs(...)` estaban
repartidas por los visores, cada uno con su lista. Dos visores podían tener
definiciones distintas del mismo EPSG. Ahora viven en `src/services/geo/crs.ts` y
se registran bajo demanda.

**Los 120 husos UTM se generan, no se escriben.** La fórmula es la misma para
todos (`+proj=utm +zone=N [+south] +datum=WGS84`); una tabla a mano sólo aporta
ocasiones de equivocarse. A eso se añaden los sistemas nacionales con origen
propio, que sí hay que declarar: MAGNA-SIRGAS (Colombia), ETRS89 y ED50 / UTM
(España) e ITRF2008 / LCC (México).

**El selector acepta cualquier EPSG, no sólo los del catálogo.** La lista es una
comodidad para buscar; escribir `25830` o `EPSG:25830` funciona igual. Una lista
cerrada volvería a ser el problema de los rangos codificados a mano, sólo que en
la interfaz.

**«No está georreferenciada» es una respuesta válida.** El selector la ofrece
explícitamente y se persiste como `declared_epsg: null`. Una red de un modelo
sintético con coordenadas locales no tiene EPSG, y forzar a inventarle uno sería
volver al punto de partida.

**Validación de cordura por envolvente del país, no por línea de costa.** Tras
reproyectar se comprueba que el centroide cae dentro de la envolvente del país
declarado en `HydraulicProject.location`. Es deliberadamente grosero: una
envolvente incluye mar y países vecinos. Sirve para lo que importa —cazar el huso
o el hemisferio equivocados, que desplazan la red cientos de kilómetros— sin
arrastrar datos cartográficos. El aviso no bloquea: el ingeniero puede tener
razón y el país del proyecto estar mal puesto.

**El `.inp` guardado no se toca nunca.** `declararCRS` escribe metadatos, no
coordenadas. La ida y vuelta sin pérdida del criterio de aceptación no se
consigue reproyectando de vuelta al exportar, sino no habiendo reproyectado nunca
el fichero: la reproyección existe sólo para pintar. Hay un test que lo fija.

**El sistema se escribe en dos sitios a propósito, y se actualizan juntos.** La
columna `coordinateSystem` y la copia dentro de `networkData` ya existían
duplicadas antes de este cambio; el mapa lee una y el repositorio la otra.
`declararCRS` escribe las dos en la misma transacción, porque actualizar sólo una
dejaría la red pintándose con el sistema anterior hasta la siguiente recarga.

**Sin migración de base de datos.** `HydraulicNetwork.coordinateSystem` ya existía
como TEXT con JSON dentro; los campos nuevos (`declared_epsg`, `declared_at`,
`requires_user_crs`) caben ahí. Las redes ya guardadas quedan sin declarar, que es
la lectura correcta: nadie confirmó su EPSG.

## Verificación

Los puntos de control de `src/services/geo/crs.test.ts` **no salen de proj4**: se
derivan de la definición de cada EPSG, que fija dónde cae su falso origen.
Comprobar proj4 con proj4 no demostraría nada.

- En el meridiano central de un huso UTM, `X = 500.000` tiene que devolver
  exactamente su longitud (`-183 + 6n`: el huso 18 es `-75`, el 30 es `-3`).
- El falso origen de MAGNA-SIRGAS Bogotá (`1.000.000, 1.000.000`) tiene que caer
  en 4°35′46,3215″N / 74°04′39,0285″W, que es su origen oficial.
- El falso este de México ITRF2008 / LCC (`2.500.000`) tiene que caer en el
  meridiano `-102`.
- Ida y vuelta en cuatro sistemas: error submilimétrico (el criterio pedía < 2 m).
- La misma coordenada de Cartagena declarada en el huso 14 o en el hemisferio sur
  dispara el aviso de cordura; declarada en el 18N, no.

## Comprobado en la aplicación

Ciclo completo con la base real, sobre `Net3 2.inp` (red sintética, coordenadas
proyectadas de 8 a 45 unidades) y sobre una red geográfica:

- Abrir la red proyectada → el mapa queda vacío y la cabecera avisa: «Esta red no
  se puede situar en el mapa: las coordenadas están proyectadas. El valor de X no
  identifica el huso…», con el enlace para declararlo. Antes de este cambio esa
  misma red se dibujaba sin decir nada.
- Declarar `EPSG:32615` → el selector previsualiza el centroide antes de aceptar
  («el centro de la red cae en 0.00014, -97.48851»), la red se pinta y la
  cabecera pasa a «Declarado: EPSG:32615 — WGS 84 / UTM 15N».
- Cambiar a `EPSG:32718` sin volver a cargar el `.inp` → la red se recoloca y el
  mapa se reencuadra (de -97,49 a -165,23).
- Comprobado en SQLite que `declared_epsg` queda escrito **en las dos copias**,
  la columna `coordinateSystem` y `networkData.coordinate_system`.
- Red geográfica → se reconoce sola, sin declarar nada, y la cabecera lo etiqueta
  «Sugerido: EPSG:4326 … (sin confirmar)», que es lo que es.

## Estado de los criterios de aceptación

| Criterio | Estado |
|---|---|
| Red en EPSG:32618 superpuesta con error < ~2 m | Reproyección exacta verificada contra puntos de control; el error de la ida y vuelta es submilimétrico. Falta el contraste sobre ortofoto con una red real con puntos de control — es lo que el issue pide a Javier. |
| Cambiar el EPSG reposiciona sin recargar el `.inp` | Hecho y comprobado en la aplicación. La reproyección depende de los nudos ya en memoria y del EPSG, no del fichero. |
| Red sin coordenadas o con EPSG desconocido informa en vez de dibujar | Hecho y comprobado en la aplicación. No se pintan capas y la cabecera explica el motivo con la acción para resolverlo. |
| Ida y vuelta del `.inp` sin pérdida | Hecho por construcción: el `fileContent` guardado no se modifica al declarar el CRS. |
| Retirar los casos codificados a mano | Hecho en los dos lados (Python y visor de mapa). |

## Fuera de alcance

**Los visores muertos.** `WNTRIntermediateViewer` y `WNTRSimulationViewer`
conservan su propia detección heurística y, el primero, un posicionamiento por
escalado de límites —justo lo que denuncia #48—. No se han tocado porque no los
importa nadie: `WNTRMainInterface` → `WNTRAdvancedMapViewer` → `WNTRMapViewer` es
la única cadena viva. Retirarlos es el issue #37, y arreglar código muerto para
borrarlo después sería trabajo perdido.

**EPSG por defecto a nivel de proyecto.** Hoy se declara por red. Un valor
heredado del proyecto tiene sentido cuando un proyecto tenga varias redes de la
misma zona, pero heredar un EPSG es otra forma de darlo por supuesto, y conviene
verlo funcionar declarándolo explícitamente antes de añadir herencia.

**Reproyección inversa al exportar.** El módulo expone
`crearTransformadorInverso` y está probado, pero no hay ningún flujo de
exportación de `.inp` en la aplicación que la necesite: el fichero se guarda y se
devuelve tal cual. Se usará cuando exista una exportación que genere coordenadas
nuevas.
