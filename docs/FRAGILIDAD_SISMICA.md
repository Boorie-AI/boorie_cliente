# Fragilidad sísmica: tubería en PGV, tanques y bombas en PGA

Diseño y decisiones de la curva de fragilidad y del reparto del daño, pedidos en el [issue #94](https://github.com/Boorie-AI/boorie_cliente/issues/94). Casi todo lo que hay aquí sale del criterio del **Dr. Luis E. Mora M.** en ese hilo, y este documento existe porque ese criterio llegó en dos tandas de comentarios con seis anexos: sin recogerlo, la próxima vez habría que releerlo entero.

## De dónde viene

La curva de fragilidad original (issue #25) daba una sola cifra: la probabilidad de que una tubería falle frente a la intensidad sísmica. Servía para saber si la red es frágil, pero no para **decidir nada**, porque no decía cuánto costaría repararla ni tocaba los tanques y las bombas.

El #94 pedía «una curva de número de tuberías afectadas para cada PGV y cada PGA». Al implementarlo aparecieron dos preguntas que no se podían resolver desde el código, y se le plantearon al Dr. Mora:

1. ¿Número de tuberías o longitud? El título del issue pedía una cosa y la descripción otra.
2. ¿Cómo trazar una curva en PGA, si los coeficientes de ALA están calibrados en PGV?

Sus dos respuestas son lo que este documento recoge.

## Lo que se construye

| Pieza | Fichero |
|---|---|
| Cálculo | `fragility_curve` en `backend/services/hydraulic/wntr_resilience_service.py` |
| Envoltorio TypeScript | `backend/services/hydraulic/resilienceService.ts` |
| Handler IPC | `wntr:generate-fragility-curve` (el que ya existía) |
| Interfaz | Sección «Curva de Fragilidad (Sismo)», pestaña Resiliencia |
| Tests | `backend/services/hydraulic/resilienceService.integration.test.ts` |

## Decisiones

### 1. PGV para tubería, PGA para tanques y bombas

No es una preferencia de presentación: son fenómenos distintos. En tubería enterrada la rotura la gobierna la **deformación transitoria**, que correlaciona con la velocidad del suelo; los componentes puntuales —tanques, bombas, estaciones— responden a la **aceleración**. El Dr. Mora lo confirmó («efectivamente la curva PGV es utilizada para el análisis de la curva de fragilidad en tuberías») y su anexo 2 lo dice con la fuente:

> According to HAZUS-MH, vulnerabilities of buried pipes are related to PGV, and vulnerabilities of other WDN components (e.g., tanks, pumps, and water treatment plants) are related to PGA.

Por eso la entrada en PGA existe **para los dos usos a la vez**, pero con tratamientos distintos: la tubería llega a PGA por conversión, y los componentes se definen directamente en PGA.

### 2. La conversión a PGA mueve la mediana, no el rótulo

ALA está calibrada en PGV: la mediana va en cm/s. Ofrecer un eje en PGA sin tocar la mediana daría una curva de PGV con otro nombre, y eso se le dijo explícitamente al Dr. Mora que no se haría.

La conversión usa **Newmark & Hall (1982)**, `PGV[cm/s] = α · PGA[g]`, con α según la clase de suelo, tal y como lo resuelve su anexo 1:

| Clase de suelo | Vs30 | α (cm/s por g) |
|---|---|---|
| Roca | > 760 m/s | 66 |
| Firme | 360–760 m/s | 97 |
| Blando | < 360 m/s | 122 |

La mediana en PGA es `mediana_PGV / α`. Consecuencia que conviene entender al leer la gráfica: **el suelo blando falla antes para la misma aceleración**, porque un mismo PGA produce más PGV. Hay un test que lo ata.

### 3. β no se infla, la incertidumbre se declara

La correlación PGV–PGA es solo **moderada**: ρ≈0,70–0,73 según Bradley (2012), y lo advierte el propio módulo del Dr. Mora, que recomienda usar PGV y PGA directos cuando se tengan.

Su función convierte la mediana y **deja β igual**. Se implementa así a propósito. Inflar la dispersión para «absorber» la incertidumbre de la conversión exigiría un número que él no especificó, y un número inventado se lee en pantalla igual que uno medido. La incertidumbre va escrita en el texto de metodología, junto a la curva.

### 4. El reparto es por diámetro, no por material

Fue la corrección de más peso, y él la marcó de **alta prioridad**: en vez de una curva de longitud aparte, una tabla con las tuberías y los kilómetros afectados de cada diámetro presente en la red, para poder cuantificar económicamente los daños.

Además **resuelve un obstáculo que parecía de fondo**. Para que una curva de longitud tuviera forma propia hacía falta el material de cada tubería, y el `.inp` de EPANET no lo declara: en `[PIPES]` solo vienen longitud, diámetro y rugosidad. Se habían planteado tres salidas —inferir el material de la rugosidad, pedirlo por grupos, o dejarlo único—. Agrupar por diámetro no necesita ninguna: el diámetro sí viene en el fichero.

### 5. Las dos columnas no son la misma cifra a otra escala

La tabla da número de tuberías **y** kilómetros por grupo, y hace falta que dé las dos. En `Net3`, a 20 cm/s:

| Diám. (mm) | Tuberías | Long. (km) | Afectadas | km afectados |
|---|---|---|---|---|
| 457,2 | 1 | 4,33 | 0,3 | **1,08** |
| 508,0 | 1 | 0,24 | 0,3 | **0,06** |

Mismo recuento afectado, dieciocho veces la longitud. Para costear una reparación, la columna que decide es la segunda.

El reparto se calcula en el servicio y no en la interfaz, para que los tests puedan comprobar lo único que de verdad importa: que los grupos **sumen el agregado en todas las intensidades**. Si dejara de cuadrar, la tabla mentiría sin que nada más se rompiera.

### 6. Las medianas por material tienen fuente, y HAZUS es la de partida

Antes había una sola tabla de valores «genéricos publicados», sin cita. El anexo 1 aporta dos tablas con referencia, y el Dr. Mora indicó empezar por HAZUS-MH. Se toma el estado *minor* (fuga), que es el análogo del único estado que dibuja esta curva.

| Material | HAZUS-MH (2003) | ALA (2001) |
|---|---|---|
| Hierro fundido / Asbesto-cemento | 15 cm/s | 20 cm/s |
| Hierro dúctil / PVC / PEAD | 35 cm/s | 40 cm/s |
| Acero | 70 cm/s | 80 cm/s |
| β | 0,6 | 0,5 |

**Esto cambió números que ya se mostraban.** El PVC pasó de 28 a 35 cm/s y β de 0,5 a 0,6. Es un cambio deliberado, pedido por él, y a cambio las cifras dejan de ser anónimas.

### 7. Tanques y bombas no traen coeficientes por defecto, y no deben traerlos

Es la decisión que más conviene no revertir por comodidad. Se le pidieron al Dr. Mora la mediana y la dispersión en PGA para tanque (DS1, DS2) y bomba, y su respuesta fue **dejarlo abierto al usuario avanzado**, señalando dónde buscar los valores según la región.

Se buscaron antes de preguntar, y no están en ninguna parte que podamos citar:

- El **anexo 1** es excelente para la conversión, pero es todo tubería: no menciona tanques ni bombas en ninguna línea.
- El **anexo 2** da los estados de daño y dibuja las curvas en su Figura 4, pero el texto no las tabula: remite a HAZUS-MH.
- El **anexo 5A** dice que los parámetros «deben calibrarse con datos empíricos de daño sísmico o adoptarse de referencias».
- **WNTR 1.5.0** solo aporta la maquinaria (`FragilityCurve.add_state`, `cdf_probability`). Ningún dato.

Así que las casillas están vacías y **vacío significa «no dibujes esa curva»**, no «usa un valor por defecto». La gráfica de componentes solo aparece si el usuario aporta coeficientes, y lleva escrito debajo que son suyos y no publicados por Boorie.

Estados, según el anexo 2: tanque **DS1** fuga menor (< 0,25 m) y **DS2** fuga mayor (0,25–1,0 m); bomba, un solo estado (fuera de servicio). Un test comprueba que DS2 quede siempre por debajo de DS1: si se cruzaran, los estados estarían invertidos y la lectura sería la contraria.

### 8. De dónde saca el usuario los números

Dos huecos distintos, y los dos se resuelven señalando fuera de la aplicación porque no hay forma honesta de rellenarlos por dentro:

- **La intensidad.** Las normativas de América Latina y el Caribe no son explícitas en PGV. Sin una referencia a mano, la casilla se rellena con un número inventado y la curva hereda ese número. La sección enlaza los [modelos globales del GEM](https://hazard.openquake.org/gem/models/) y su [mapa global de amenaza sísmica](https://hazard.openquake.org/gem/images/home/gem_global_seismic_hazard_map_v2018.1.pdf).
- **Los coeficientes de tanque y bomba.** Los anexos 5A y 5B del issue son una recopilación de bases de datos y referencias por región, hecha por el Dr. Mora, y es a donde apunta la interfaz.

## Los anexos, y qué aporta cada uno

Seis ficheros en el hilo del #94. Lo útil es saber qué resuelve cada uno y qué **no**:

| Anexo | Qué es | Aporta | No aporta |
|---|---|---|---|
| 1 | `pgv_pga_conversion.py`, 1020 líneas, MIT, firmado por él | Cuatro métodos de conversión PGV↔PGA, paso por IMM, tablas ALA y HAZUS **de tubería** con fuente | Nada de tanques ni bombas |
| 2 | Paper de 2022 (*Scientific Reports* 12:20555) | Confirma PGV/PGA por componente, define los estados de daño, y su Figura 4 es el modelo de la gráfica de componentes | Los coeficientes en números: remite a HAZUS-MH |
| 3 y 4 | Fragmentos de una tesis que dirigió (defensa ARILAN; resiliencia del acueducto de Mérida) | Contexto de para qué sirve el análisis y por qué discretizar por diámetros | Coeficientes |
| 5A | Bases de datos de PGV/PGA, hecho con MONICA-AI | Dónde obtener intensidades por región; el aviso de que los modelos de atenuación internos de WNTR son de datos de California y pueden no representar ALC | Coeficientes: dice que hay que calibrarlos o adoptarlos de referencias |
| 5B | Referencias bibliográficas por región | Bibliografía para que el usuario elija coeficientes de su región | — |

## Discrepancias detectadas, y cómo se resolvieron

Se dejan escritas porque son el tipo de cosa que en una segunda lectura parece un error nuestro:

- **La numeración del estado de la bomba.** Su mensaje pide «DS2 para bombas», pero tanto el anexo 2 como el 5A describen la bomba con **un solo** estado, DS1 = apagado. Se implementó como estado único y se rotula por significado («bomba fuera de servicio») en vez de por número, que es lo que no admite duda.
- **Cuántos estados tiene un tanque.** El anexo 5A menciona DS1 a DS4 en el artículo fundacional de WNTR; el anexo 2 y su mensaje se quedan en DS1 y DS2. Se implementaron los dos que él pidió.
- **La probabilidad es «por tubería», no por unidad de longitud.** ALA es una tasa de reparaciones por unidad de longitud, pero esta curva trata la probabilidad como propia de cada tubería, así que el esperado escala con el recuento. Con la tabla de dos columnas la cifra que se necesita para costear sale igual, y por eso no se cambió el modelo de una curva que él ya había validado. **La pregunta le quedó planteada en el issue**: si prefiere que el esperado escale con la longitud, hay que cambiarlo y declararlo.

## Cómo se comprueba

Los tests corren contra el servicio Python real y una red real, y se saltan solos donde no haya un Python con WNTR (`describe.skipIf`). Cubren, en tres bloques:

- **Reparto por diámetro:** que agrupe por los diámetros que existen, que no pierda ninguna tubería, que los grupos sumen el agregado en cada intensidad, y que distinga dos grupos con igual recuento y longitud dispar.
- **Entrada en PGA:** que en PGV no haya conversión, que en PGA la mediana se divida por el α del suelo, que β no se toque, y que el suelo blando falle antes para la misma aceleración.
- **Modelo de daño y componentes:** que HAZUS sea el de partida y difiera de ALA, que sin coeficientes no se invente curva, que en PGV no haya componentes, y que DS2 quede siempre por debajo de DS1.

## Trampas

- **El servicio Python que ejecuta la aplicación sale de `dist/`**, no de `backend/`. Tras tocar `wntr_resilience_service.py` hay que correr `npm run build:electron-ts`, que lo copia. Sin eso la aplicación ejecuta la versión anterior en silencio: la curva en PGA salió plana a cero, con el eje rotulado en PGV sobre valores de 0 a 1, porque el servicio viejo ignoraba `hazard_type` e interpretó el tope de 1 g como 1 cm/s.
- **`Net3` trae tres tuberías con diámetro 99** (2514,6 mm), que parece un valor centinela y no un diámetro real. Salen como grupo propio en la tabla. Está avisado en el issue por si conviene filtrarlas.
- **Las intensidades cambian de unidad con la entrada.** En PGV el tope por defecto son 100 cm/s y las marcas van sin decimales; en PGA son 1 g y hacen falta dos. Los rótulos, el CSV y el selector de la tabla se leen de `intensity_unit`, no de una constante.

## Lo que queda pendiente

- Las curvas de tanque y bomba funcionan, pero **con coeficientes del usuario**. Si aparece una tabla citable por región, puede pasar a ser una opción con fuente, como se hizo con las medianas de tubería.
- Alimentar Boorie con las normativas de América Latina y el Caribe, que él propone para etapas posteriores. El [Código Modelo Sísmico para ALC](https://www.cmsalc.org/) espera versión final alrededor de 2027.
