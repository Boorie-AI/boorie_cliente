# La calidad del agua se simula

Sale de la revisión de las cifras que enseña la aplicación, la que se hizo tras
dos versiones seguidas corrigiendo unidades ([#79](https://github.com/Boorie-AI/boorie_cliente/issues/79)).
Fue el primer hallazgo y el único que no era de rótulos; se abrió aparte como
[#83](https://github.com/Boorie-AI/boorie_cliente/issues/83).

## Lo que había

`run_water_quality` no simulaba la calidad. Corría el modelo **hidráulico** y
después fabricaba la calidad a mano:

```python
# Linear increase 0 -> duration (simplified age)
quality = [i * (duration/steps) / 3600.0 for i in range(steps)]
```

Una recta de cero a la duración de la simulación, **idéntica en todos los
nudos**. Para el trazador y para el resto de parámetros, ceros. No hay
transporte, ni mezcla en los depósitos, ni tiempos de residencia: no hay
simulación.

Y se presentaba como si la hubiera: misma tarjeta que la hidráulica, mismo
`Status: Completed`, y como única advertencia una nota al pie, en inglés y en
gris —«Using Hydraulic Simulator + Synthetic WQ due to macOS EpanetSimulator
instability»—. En la red de ejemplo `Net3` daba una edad media de 83,88 h; la
real es de 6,09 h.

Estaba así **desde la primera versión**, enero de 2026. Todas las publicadas han
enseñado esa cifra, y cada «Run All Simulations» la ha guardado en el proyecto
como una simulación más.

## Por qué no valía

El criterio que gobierna el motor de escenarios y el de energía es que ninguna
cifra salga de una estimación no simulada: por eso las narraciones citan la
ejecución de la que salen y por eso la no convergencia se reporta en vez de
silenciarse. Ésta era la única cifra del producto que lo incumplía, y además la
que más fácil resultaba llevarse a un informe: un número redondo con aspecto de
medida.

## Lo que hay ahora

La calidad la resuelve EPANET y sólo EPANET —el `WNTRSimulator` no transporta
solutos—, así que se usa el simulador que hay:

| Parámetro | Unidad | Notas |
|---|---|---|
| `AGE` | h | EPANET la da en segundos; se entrega en horas, que es como se lee un tiempo de residencia |
| `TRACE` | % | Exige `trace_node`; sin él se rechaza en vez de devolver ceros |
| `CHEMICAL` | mg/L | Según lo que declare el `.inp` |

La unidad viaja en el resultado (`stats.quality.unit`), así que la interfaz no
tiene que adivinarla: la tarjeta dice **«AGE (h)»** en lugar de «PARAMETER: AGE».

**Y si falla, se dice.** El motivo escrito en el código era una inestabilidad del
`EpanetSimulator` en macOS —plausible: es el mismo tipo de problema con binarios
nativos sin firmar que ya documenta `WNTR_PYTHON_SETUP.md`—, pero el sustituto se
aplicaba en las tres plataformas. Ahora se intenta siempre, y cuando no se puede,
la tarjeta enseña el motivo en vez de un número. Las otras dos simulaciones del
ciclo se guardan igual: no dependen de ésta.

Medido sobre las redes del repositorio: `Net3` en 0,1 s, `Chamisero`
(132 nudos) en 5,4 s. En `Net3`, la edad del último paso va de 0 a 24 h con
**84 valores distintos entre 97 nudos** — lo que el sustituto no podía dar, que
era exactamente uno.

## Qué se puede pedir desde la pantalla

Los tres parámetros, no sólo la edad: un desplegable junto a la duración y el
paso. Cuando se elige el trazador aparece un segundo selector con **los embalses
y los depósitos** de la red cargada —de donde sale el agua—; trazar desde un nudo
de consumo lo admite EPANET, pero no responde a ninguna pregunta que alguien se
haga sobre una red. Si la red no tiene ninguna fuente, la opción se deshabilita
en vez de abrir un selector vacío.

La sustancia se rechaza cuando el `.inp` no declara ninguna —ni `[SOURCES]` ni
`[QUALITY]`—, que es el caso de las dos redes del repositorio. EPANET devolvería
ceros en toda la red, y un cero que sólo significa «aquí no había nada que
simular» es lo mismo que enseñaba el relleno de antes. Se dice, y se dice dónde
se declara.

La calidad usa además **la misma ventana de tiempo que la hidráulica**. Antes
mandaba 24 h y paso de 1 h fijos —que el motor de entonces ni miraba—, así que
las tres simulaciones del ciclo se guardaban juntas hablando de periodos
distintos.

## Lo que ya estaba guardado

Las ejecuciones anteriores siguen en los proyectos de quien ya usaba Boorie. **No
se borran**: son datos del usuario y no se tocan sin que lo pida. Se marcan.

`calidadSintetica.ts` las reconoce por las dos marcas que sólo escribía aquel
código —la nota y el estado `Completed (Simulated)`— y el historial las enseña
con la etiqueta **«sin simular»**, con el porqué en el título del ratón. Se
comprueba sobre el JSON sin parsear: el historial lista docenas de ejecuciones y
los resultados de una sola pesan megabytes.

## Fuera de alcance

**Comprobarlo en macOS.** No hay equipo donde hacerlo. El cambio no lo necesita
—si el simulador arranca se usa, y si no, se dice—, pero mientras nadie lo
ejecute allí no sabremos si aquel problema sigue existiendo.
