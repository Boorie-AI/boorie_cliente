# Población y clientes afectados ante una interrupción del servicio

Diseño y decisiones de la prueba de concepto pedida en el [issue #32](https://github.com/Boorie-AI/boorie_cliente/issues/32), el punto 1 del informe de apreciaciones adelantado como PoC.

## El problema

La aplicación sabía decir qué presión queda en cada nudo tras una falla, pero no **a cuánta gente deja sin agua**. Es la cifra que distingue a Boorie de EPANET estándar y la que entiende un cliente no hidráulico.

Toda la cadena de cálculo ya existe en WNTR (`water_service_availability`, `population`, `population_impacted`); lo que faltaba era conectarla y decidir tres cosas que WNTR no decide por ti: qué modo de demanda usar, de dónde sale la población, y contra qué se compara el resultado.

## Lo que se construye

El cálculo **no es una funcionalidad aparte**: vive dentro de la simulación de interrupción del servicio (#22). Un solo botón, una sola ejecución, todos los resultados.

| Pieza | Fichero |
|---|---|
| Cálculo | `simulate_failure` en `backend/services/hydraulic/wntr_resilience_service.py` |
| Envoltorio TypeScript | `backend/services/hydraulic/resilienceService.ts` |
| Handler IPC | `wntr:simulate-component-failure` (el que ya existía) |
| Interfaz | Sección «Simulación de Interrupción del Servicio», pestaña Resiliencia |
| Tests | `backend/services/hydraulic/resilienceService.integration.test.ts` |

Se descartó un servicio separado con su propio botón: obligaba al usuario a lanzar dos simulaciones seguidas sobre el mismo evento y, sumando la corrida de #22, costaba **tres simulaciones**. `simulate_failure` ya corría una referencia sin evento y otra con él, que es exactamente lo que necesita el cálculo de población, así que ahora todo sale de **dos**.

## Decisiones

### 1. La simulación corre en PDA, no en DDA

Es la decisión que sostiene todo lo demás, y al fusionarse con #22 pasó a aplicarse también a las presiones que esa sección ya reportaba. En modo dirigido por demanda (DDA, el que usa el resto de la aplicación) un nudo recibe el 100% de su demanda **sea cual sea su presión**. Con 5 m de columna de agua, DDA sigue entregando todo y el impacto sale cero.

En PDA la entrega depende de la presión, con la ley que WNTR aplica por defecto:

```
entrega = demanda · sqrt((p − p_min) / (p_req − p_min))
```

Medido en la red de pruebas `SoloChamiseroMedioConPatronComercial-07p1.inp`, el nudo `7949` se queda en 10.56 m frente a los 20 m de servicio pleno. DDA lo da por servido; PDA le asigna una disponibilidad de 0.727 y lo cuenta como afectado. Son 2009 habitantes que el modo dirigido por demanda no ve.

Parámetros por defecto: presión de servicio pleno 20 m, presión mínima 0 m, ambos ajustables.

El cambio de DDA a PDA en la parte de presiones de #22 se midió antes de aplicarlo, sobre las redes `SoloChamiseroMedioConPatronComercial-07p1.inp` y `villa_100_casas.inp`: la diferencia máxima de presión nudo a nudo es de **0.03 a 0.06 m**, muy por debajo de la precisión con la que se reporta, y el recuento de nudos afectados no cambia. Lo que sí cambia son las cifras de servicio, que en DDA eran físicamente falsas.

### 2. La población se recorta a cero antes de sumarla

`wntr.metrics.population(wn, R)` aplica `población = demanda media / R` sin mirar el signo. En redes donde la fuente se modela como un nudo de consumo con **demanda base negativa** —el caso de la red de pruebas, nudo `1`— eso produce una población de **−4601 habitantes** que cancela exactamente a la del resto de la red y deja el total en cero.

Se recortan los negativos y **se declaran aparte** en `excluded_negative_demand_nodes`, en lugar de descartarlos en silencio: el usuario tiene que poder ver que un nudo quedó fuera del cómputo y por qué.

### 3. Cada cálculo corre dos veces: con evento y sin él

Sin corrida de referencia, todo el déficit que la red ya arrastraba se le atribuye a la interrupción. Es un error que produce cifras alarmantes y falsas.

El caso que lo demuestra en la red de pruebas: parar la bomba `6012` reporta 2009 habitantes afectados… pero la misma red **sin ningún evento** también reporta 2009. La bomba no afecta a nadie; el déficit es crónico y precede a la falla.

Por eso el resultado separa tres cifras, y la interfaz destaca la tercera:

| Campo | Significado |
|---|---|
| `baseline` | Déficit de la red sin el evento |
| `event` | Déficit total con el evento aplicado |
| `attributable_to_event` | La diferencia: lo que causa realmente la interrupción |

Cerrando la tubería troncal `8062`: `event` 4601 hab, `baseline` 2009 hab, **atribuible 2592 hab en 3 nudos y 470.4 m³ no entregados**.

### 4. El déficit se integra por intervalos, no por instantes

Aplica a las dos mitades del resultado: al déficit de servicio y a las horas de corte por presión que #22 ya reportaba, que arrastraban el mismo error.

Una simulación de 24 h con paso de 1 h reporta **25 instantes**. Contarlos daba «25 h de déficit» en una ventana de 24 h —imposible a simple vista— y sobreestimaba el volumen no entregado en un paso completo: 112.4 m³ frente a los 106.9 m³ reales, un 4.9% de más.

Se integra por intervalos (Riemann por la izquierda) usando la diferencia real del índice temporal, así que ni las horas ni el volumen pueden exceder la ventana simulada.

### 5. Los clientes se derivan de la población, y sólo si se pide

El informe original proponía un campo `serviceConnections` por nudo. El formato EPANET no lo lleva, así que en esta PoC las acometidas se derivan de la población con un factor `persons_per_connection` que el usuario introduce.

Si no lo introduce, **no se reportan clientes** en lugar de inventar un factor por defecto. Cuando se reportan, el resultado declara `method: 'derived_from_population'` para que la cifra no se confunda con un dato medido.

Queda pendiente, cuando exista la decisión de negocio: leer acometidas reales por nudo y reportar el método correspondiente.

### 6. La no convergencia se reporta, no se silencia

WNTR avisa con `Exceeded maximum number of trials` cuando un paso no converge; las cifras de ese instante no son fiables. El criterio de aceptación exige que ninguna cifra venga de una estimación no simulada, así que el aviso se captura en `convergence_warnings` y la interfaz muestra una alerta en vez de presentar el número como si nada.

Ocurre de hecho al cerrar las troncales `8062` y `7913` de la red de pruebas.

### 7. La diferencia con la referencia no se enseña en negativo

La resta `event − baseline` puede salir por debajo de cero sin que nada esté mal:
el evento redistribuye presiones y hay nudos que quedan mejor que sin él. Como
impacto atribuible eso no se puede leer, así que los tres campos de
`attributable_to_event` se recortan a cero y la resta en bruto se conserva en
`raw_difference`, con `clipped_to_zero` diciendo qué hubo que recortar.

Mismo criterio que el punto 2: se recorta y **se declara**. Ver
[`INDICADORES_Y_UNIDADES.md`](INDICADORES_Y_UNIDADES.md) (#77), que recoge la
regla completa —qué indicador admite signo y cuál no— para todo el escenario.

## Trazabilidad

Todo resultado incluye un bloque `traceability` con el modo de demanda, el simulador, la versión de WNTR, el módulo de demanda usado, el consumo per cápita derivado, el umbral, las presiones de PDA, la ventana simulada y el paso. Es lo que permite reproducir una cifra meses después.

## Parámetros

| Parámetro | Por defecto | Notas |
|---|---|---|
| `demand_module_lphd` | 200 | l/hab/día. Rango típico LatAm 150–300 |
| `availability_threshold` | 0.8 | Por debajo de esta fracción el nudo cuenta como afectado |
| `required_pressure` | 20 m | Presión de servicio pleno en PDA |
| `minimum_pressure` | 0 m | Por debajo no se entrega nada |
| `duration_hours` | 24 | Ventana simulada |
| `persons_per_connection` | — | Sin valor no se reportan clientes |

`R = demand_module_lphd / 1000 / 86400` convierte el módulo a los m³/s por habitante que espera `population()`.

## Fuera de alcance

Lo delimita el propio issue: el motor de escenarios multi-causa (`pipe_break`, `pump_outage`, `control_loss`, `demand_surge`) y la integración conversacional del motor quedan para sus tickets. Aquí sólo hay eventos simples de cierre de componente.

## Deuda conocida

`resilienceService.ts` y `wntrWrapper.ts` repiten el mismo `executePythonService`. Unificarlos en un único lanzador es un trabajo aparte.
