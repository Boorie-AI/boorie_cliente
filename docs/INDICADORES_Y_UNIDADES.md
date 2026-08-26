# Indicadores sin signo y cifras con unidad

Lo que pidió el cliente sobre la pantalla del escenario de denegación de servicio
y sobre las etiquetas del visor ([#77](https://github.com/Boorie-AI/boorie_cliente/issues/77)),
y cómo se ha resuelto. Continúa
[`POBLACION_AFECTADA_PDA.md`](POBLACION_AFECTADA_PDA.md) (#32), que es donde se
decidió cómo se mide el impacto, y [`VISOR_CANONICO.md`](VISOR_CANONICO.md)
(#37), que es donde vive la etiqueta.

## Lo que llegó

Tres observaciones, dos problemas:

1. **En el escenario de denegación de servicio, ningún indicador puede permitir
   números negativos.**
2. **Las etiquetas del visor dan la información sin unidades.** La captura que
   acompañaba a la petición: `junction: 145 / Cota: 0.3048 / Demanda:
   0.001743182126532`.
3. **En la demanda bastan seis cifras significativas.**

Y una segunda tanda, del mismo repaso:

4. **«Enlaces» debe decir «tuberías».**
5. **La unidad se escribe `l/s`, no `L/s`.**
6. **Con la simulación corriendo, la demanda del nudo elegido debe ser la de ese
   instante**, no la del fichero.
7. **Importar una red debe llevar al modelo en el visor.**

---

## 1. Ningún indicador de impacto en negativo

### De dónde salían los negativos

No de un error de cuenta. Salían de restar, que es lo que hay que hacer:

```
impacto atribuible = corrida con el evento − corrida de referencia
```

Esa resta puede salir por debajo de cero **con la red y el motor funcionando
bien**. Cerrar una tubería redistribuye presiones, y hay nudos que quedan mejor
que sin el corte. En la red de pruebas, con la bomba `6012` fuera de servicio, el
volumen atribuible salía **−8,36·10⁻⁵ m³**, y al cerrar la troncal `8062` había
**cuatro nudos** cuya «caída de presión» era negativa: el corte los mejoraba en
seis diezmilésimas de metro.

El problema no es la resta, es lo que significa enseñarla. «Deja sin servicio a
−118 habitantes» no se puede leer: nadie recupera un servicio que no había
perdido. Como **indicador de impacto**, el suelo es cero.

### Qué se recorta y qué no

El criterio no es «quitar los menos de la pantalla», es distinguir una magnitud
de impacto —que por definición no tiene signo— de una lectura física —donde el
signo es dato.

| Indicador | ¿Admite negativo? | Por qué |
|---|---|---|
| `population_affected` (habitantes) | **No** | Se recorta a 0 |
| `affected_node_count` (nudos) | **No** | Se recorta a 0 |
| `undelivered_volume_m3` / `attributable_m3` | **No** | Se recorta a 0 |
| `outage_hours`, `max_outage_hours`, `hours_below_threshold` | **No** | Ya salen de una integral de intervalos ≥ 0 |
| `pressure_drop` (caída respecto a la referencia) | **No** | Una caída negativa es una mejora; se recorta a 0 y la mejora se sigue leyendo en `min_pressure` y `baseline_min_pressure`, que van al lado |
| `min_service_availability` | **No** | Un nudo que devuelve agua a la red daba disponibilidad negativa; con cero ya cuenta como afectado, que es lo que mira el umbral |
| `min_pressure` (presión residual) | **Sí** | Es un resultado hidráulico. Una presión negativa avisa de una depresión, y recortarla sería mentir sobre lo que salió del motor |
| `flowrate` (caudal) | **Sí** | El signo dice el sentido de circulación; el visor ya lo usa para orientar la flecha |
| `delta` de los indicadores de resiliencia (Todini, entropía, redundancia) | **Sí** | Son comparativas antes/después: un delta negativo significa «la resiliencia empeoró», que es justo lo que hay que ver |

### El recorte no borra el dato

Recortar la cifra que se enseña no es motivo para perder aquella con la que se
calculó. `attributable_to_event` conserva la resta en bruto:

```json
"attributable_to_event": {
  "population_affected": 0,
  "affected_node_count": 0,
  "undelivered_volume_m3": 0.0,
  "raw_difference": { "population_affected": 0, "affected_node_count": 0,
                      "undelivered_volume_m3": -8.360968730869445e-05 },
  "clipped_to_zero": ["undelivered_volume_m3"]
}
```

Es el mismo criterio que ya seguía `excluded_negative_demand_nodes` en #32: se
recorta y **se declara**, en lugar de descartar en silencio. Cuando
`clipped_to_zero` no está vacío, el panel lo dice en una línea, para que un cero
que viene de un recorte no se confunda con un cero medido.

### Se recorta en dos sitios, a propósito

- **En el motor** (`wntr_resilience_service.py`), que es el origen: así lo ven
  igual la interfaz, la narración del chat, el historial y cualquier consumidor
  futuro del JSON.
- **Al enseñar** (`WNTRMainInterface`, `narrarEscenario`), que no es redundante:
  los resultados de las simulaciones anteriores están **guardados en la base de
  datos** con las cifras de entonces, y el historial los vuelve a pintar tal
  cual. Sin el recorte en la presentación, una simulación de la semana pasada
  seguiría enseñando habitantes negativos.

### Y en la entrada, no sólo en la salida

Los campos del escenario aceptaban valores negativos: una duración de −4 h, un
módulo de demanda negativo, una presión de servicio bajo cero. El motor los
rechazaba —bien— pero después de arrancar Python y cargar la red, así que el
error llegaba con un minuto de retraso. Ahora el campo no los admite (`min={0}`)
y las tres condiciones que el motor exige (duración > 0, módulo > 0, umbral entre
0 y 1) se comprueban antes de lanzar la simulación.

Alcanza también al umbral de esqueletización y al PGV máximo de la curva de
fragilidad, que están en la misma pestaña y tenían el mismo defecto.

---

## 2. Las cifras, con su unidad

### El problema de fondo

El motor trabaja en el **SI de WNTR** —m, m³/s, m/s— y el visor volcaba ese
número tal cual. Dos consecuencias, la segunda peor que la primera:

- **Sin unidad**: `Cota: 0.3048` no dice si son metros o pies.
- **Con la unidad equivocada**: la leyenda de la simbología rotulaba «l/s» sobre
  valores en m³/s. Una red con 47 l/s de punta se leía **«0.00 a 0.05 l/s»**.
  Eso es peor que no poner nada.

Cada vista formateaba por su cuenta, así que ni siquiera coincidían entre ellas.
Ahora hay un solo sitio que decide: `src/services/network/unidades.ts`.

### La tabla

| Magnitud | Unidad del motor | Se enseña en | Cifras significativas |
|---|---|---|---|
| Cota | m | m | 6 |
| Presión | m | m | 4 |
| Longitud | m | m | 6 |
| Diámetro | m | **mm** | 4 |
| Demanda | m³/s | **l/s** | **6** |
| Caudal | m³/s | **l/s** | **6** |
| Velocidad | m/s | m/s | 3 |

**Por qué se convierte y no sólo se rotula.** Caudal y demanda en l/s y el
diámetro en mm es como se proyecta y como se habla de una red. En m³/s la demanda
de un nudo es `0,00174` y no se puede comparar de un vistazo con la del nudo de
al lado; y la leyenda ya prometía l/s, así que convertir es además lo que hace
que deje de mentir.

**Por qué seis cifras y no dos decimales.** Son cosas distintas: dos decimales
convierten un consumo pequeño en cero, y seis cifras significativas se adaptan a
la magnitud del número. Es lo que pidió el cliente para la demanda y lo que evita
que un nudo de poco consumo desaparezca de la etiqueta.

### El formato

`0.001743182126532` → `1,74318 l/s`. Coma decimal, punto de miles, sin ceros de
relleno y con el signo menos tipográfico (−), igual que la narración del chat.

Se escribe a mano y no con `toLocaleString('es-ES')`, por el mismo motivo que en
`narrarEscenario`: en el entorno de pruebas —Node sin datos de ICU completos— esa
llamada devuelve «2592» y en Electron «2.592». Una cifra no puede cambiar de
forma según dónde se ejecute.

### Dónde se aplica

| Sitio | Antes | Ahora |
|---|---|---|
| Etiqueta del esquema (vis-network) | `Demanda: 0.001743182126532` | `Demanda: 1,74318 l/s` |
| Etiqueta de un tramo | `Diámetro: 0.4064` | `Diámetro: 406,4 mm` |
| Ficha del elemento elegido en el mapa | `Flow: 0.0475 l/s` (era m³/s) | `Caudal: 47,5 l/s` |
| Leyenda de la simbología | `0.00 – 0.05 l/s` | `0 – 47 l/s` |
| Rango de la escala en el panel | `0.00 a 0.05 l/s` | `0 l/s a 47 l/s` |
| Resumen de la simulación | `FLOW (l/s) · Max Flow 0.83` | `FLOW (l/s) · Max Flow 833.15` |

La ficha del mapa estaba además en inglés («Node», «Elevation», «Flow») mientras
la del esquema estaba en español. Se ha unificado en español, que es el idioma de
la aplicación, y ahora las dos vistas enseñan las mismas magnitudes con el mismo
formato.

Una línea sin dato **no se escribe**: la etiqueta de un nudo sin cota no lleva
«Cota: —», lleva una línea menos.

---

## Qué se comprobó

- `src/services/network/unidades.test.ts` — el formato, la conversión y los casos
  límite (cero, residuos numéricos diminutos, valores no finitos).
- `src/services/network/topologia.test.ts` — las etiquetas del nudo y del tramo,
  con las cifras exactas de la captura del cliente.
- `src/services/network/simbologia.test.ts` — que la leyenda convierte a la
  unidad que rotula.
- `src/components/hydraulic/NetworkTopologyView.test.tsx` — el cuadro del
  elemento elegido en el esquema.
- `src/services/hydraulic/narrarEscenario.test.ts` — que un impacto negativo se
  narra como cero.
- `src/services/hydraulic/importarRed.test.ts` — el flujo de importación: cancelar,
  `.inp` ilegible, proyecto que no se crea, red que no se guarda y el caso bueno.
- `src/components/hydraulic/ProjectDashboard.test.tsx` — que el botón de la raíz
  llama a la importación en vez de crear un proyecto vacío.
- `backend/services/hydraulic/escenarios.integration.test.ts` — contra WNTR y las
  redes reales: un barrido que recorre el resultado entero del escenario y falla
  si **cualquier** indicador de impacto sale negativo, y la comprobación de que
  el recorte concuerda con `raw_difference`.

El recorte se ejerce de verdad sobre la red de pruebas, no es una defensa
teórica: `pump_outage` de la bomba `6012` recorta `undelivered_volume_m3` (la
resta salía −8,36·10⁻⁵ m³), y `pipe_break` de la troncal `8062` recorta la caída
de presión de cuatro nudos.

---

## 3. Los otros cuatro detalles

### «Enlaces» → «Tuberías»

El resumen del panel decía «Enlaces», que es vocabulario de teoría de grafos, y
quien lee esto proyecta redes. Además contaba **todos** los tramos —tuberías,
bombas y válvulas—, así que el rótulo nuevo obliga a cambiar también la cifra: si
dice tuberías, cuenta tuberías (117 en `Net3`, no 119). El desglose completo
sigue estando justo encima, en las capas.

### `l/s`, no `L/s`

Cambiado en todo lo que se enseña: etiquetas del visor, leyenda, resumen de la
simulación, comparador de versiones, contexto que recibe el agente y las unidades
seleccionables de la calculadora.

Las **conversiones siguen reconociendo la grafía anterior** (`calculationEngine`
y `hydraulicCalculator.py` aceptan `l/s` y `L/s`): hay cálculos guardados con
ella, y un cambio de rótulo no puede dejar de convertir un dato ya escrito en la
base.

### La demanda del nudo, en el instante que se está viendo

La etiqueta daba siempre la **demanda base del fichero**, que es una constante:
no cambiaba al mover la barra de tiempo, aunque la presión de al lado sí. Ahora,
cuando hay simulación, la demanda sale de `node_results[id].demand` en el paso
vigente, igual que la presión (#74).

No es un detalle cosmético: en PDA un nudo con poca presión **no recibe lo que
pide**, y la diferencia entre lo que pide y lo que recibe es justo lo que mide un
escenario de denegación de servicio. Enseñar la base en esa pantalla escondía el
efecto.

Sin simulación la etiqueta dice **«Demanda base»**, para que las dos cifras no se
confundan nunca: una es del fichero y otra es un resultado.

### Importar una red deja el modelo delante

El botón de importar de la raíz de proyectos no importaba nada: comprobaba Python
y WNTR, creaba un proyecto **vacío** y despedía al usuario con un aviso —«ahora
abra el proyecto y use *Cargar Red Hidráulica*»— que obligaba a volver a elegir
el mismo fichero. Media importación y dos diálogos para una sola intención.

Ahora crea el proyecto, carga la red, la guarda dentro y entra en el visor. El
fichero se elige con el diálogo del proceso principal y no con un `input` del
navegador: es el que valida Python y WNTR antes de nada y el único que puede leer
el `.inp`, porque el renderer no tiene acceso a disco. Cerrar ese diálogo no
enseña ningún error.

El botón se parte en dos, porque eran dos cosas distintas detrás de un mismo
rótulo: **«Importar red (.inp)»** y **«Importar proyecto (.json)»**.

El orden importa: primero se lee la red y **sólo si se pudo leer** se crea el
proyecto. Al revés, un `.inp` ilegible dejaba en la lista un proyecto huérfano
con el nombre de un fichero que nunca llegó a entrar. Si la red se lee pero no se
puede guardar —el repositorio rechaza nombres duplicados—, se abre igual y el
aviso se registra aparte, en vez de perder el trabajo por un nombre repetido.

La decisión vive en `src/services/hydraulic/importarRed.ts`, con los tres efectos
—diálogo, base de datos, disco— inyectados, para que el flujo pueda probarse
entero sin ninguno de ellos.

---

## Y en la aplicación de verdad

Los tests no ven lo que ve un usuario, así que se condujo la aplicación con la
red `Net3 2.inp` —la de la captura del cliente— y se comprobó en pantalla:

- Etiqueta de un nudo: `junction: 119 / Cota: 0,6096 m / Demanda: 11,1121 l/s`,
  y tras simular, `Presión: 47,41 m`. De un tramo: `pipe: 103 / Longitud: 411,48
  m / Diámetro: 406,4 mm`.
- El campo «Duración simulación (h)»: escribir `-5` deja `0`, y el input declara
  `min="0"`.
- Leyenda de la simbología por caudal: `0 l/s – 166 l/s` … `664 l/s – 830 l/s`,
  y el pie `Escala de esta red en este paso: 0 l/s a 830 l/s`. Antes decía
  `0.00 – 0.17` … `0.00 a 0.83 l/s` sobre los mismos datos.
- Resumen de la simulación: `FLOW (l/s) · Max Flow 833.15`, antes `0.83`.
- Una interrupción real (tubería `103`, 24 h, PDA) devuelve el panel de impacto
  entero a cero, sin ningún negativo.
- Tras simular, la etiqueta del nudo `131` da **3,61412 l/s**, cuando su demanda
  base es 2,69711 l/s: la cifra es la del paso, no la del fichero. Y el resumen
  del panel dice **«Tuberías: 117»**, no «Enlaces: 119».

Lo único que no se ha podido conducir es la importación de un `.inp`: el fichero
se elige en un diálogo del sistema operativo, que queda fuera del alcance del
conductor. Se comprueba en su lugar que la raíz enseña los dos botones nuevos,
que «Importar red» llama a quien sabe cargarla, y el flujo entero con los siete
casos de `importarRed.test.ts`.
