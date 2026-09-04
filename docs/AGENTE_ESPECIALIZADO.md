# El agente especializado

Diseño y decisiones del trabajo pedido en el [issue #119](https://github.com/Boorie-AI/boorie_cliente/issues/119): que el agente del chat sea capaz de hacer **de verdad** los análisis que Boorie ya sabe calcular, sobre la red del usuario, citando cifras que ha obtenido él.

## El hueco, precisado

No se parte de cero. Ya existe el bucle de herramientas en los tres proveedores (`electron/handlers/chat.handler.ts`, `backend/services/ai/toolWire.ts`), el resumen de la red inyectado en el prompt (`networkContext.ts`), el RAG agéntico (`backend/services/hydraulic/agentic/`) y los guardrails.

Lo que falta es más concreto: **el agente tiene ojos y no tiene manos.**

Sus tres herramientas —`consultar_elemento`, `listar_elementos`, `proponer_escenario`— leen la topología, y la tercera ni siquiera ejecuta: devuelve una definición para que la confirme el usuario. Mientras tanto Boorie sí sabe calcular, pero sólo detrás de los paneles: simulación hidráulica y de calidad, indicadores de resiliencia, curva de fragilidad, eficiencia energética, población afectada, la calculadora entera. Nada de eso está expuesto como herramienta.

La consecuencia se ve usando el producto: el usuario ejecuta el panel a mano y después vuelve a contarle al chat los números que acaba de ver.

Y hay un segundo hueco, menos visible: **nada medía si el agente acierta.** `ragQualityValidator.ts` puntúa la calidad de lo *recuperado* —relevancia, densidad técnica, frescura— y `agentic-rag-metrics` es telemetría de operación. Ninguna de las dos dice si la cifra de la respuesta es la que sale del motor.

## Lo que se descarta, y por qué

**Ajuste fino de un modelo, no.** Necesitaría miles de pares pregunta-respuesta validados por un experto, que no existen, y no resolvería lo que falla: el acceso a los datos de la red y a la norma. Lo que le falta al agente no es estilo, es capacidad de cálculo y de cita.

El enfoque es contexto, herramientas y evaluación.

## Qué se ejecuta directo y qué se propone

Es la decisión de diseño que gobierna la fase 1, y **el criterio no es «rápido» o «lento»: es si el motor simula.**

Medido sobre las dos redes guardadas que marcan los extremos:

| Motor | `Net3 2` (117 tuberías) | `Net6` (3.892 tramos) |
|---|---|---|
| `fragility_curve` | 2,48 s | **2,64 s** |
| `resilience_indicators` | 3,45 s | **más de 600 s** (agotó el tope) |

La fragilidad es una lognormal evaluada sobre la lista de tuberías: no simula, así que su coste es plano en el tamaño de la red —treinta y tres veces más tuberías y el mismo tiempo—. Los indicadores corren una simulación hidráulica completa, y ahí el coste explota.

De modo que el corte se hace por esa propiedad, que además el agente puede aplicar sin medir nada:

| Se ejecutan **directas** | Se **proponen** para que el usuario confirme |
|---|---|
| `consultar_elemento`, `listar_elementos` | `proponer_analisis`, con cuatro tipos: |
| `curva_fragilidad`, con su reparto por diámetro | indicadores de resiliencia |
| `calcular`, las seis fórmulas | simulación hidráulica |
| | calidad del agua |
| | eficiencia energética |
| | `proponer_escenario` (ya lo hacía) |

Las cuatro que se proponen van en **una sola herramienta con un `tipo`**, no en cuatro. Todas tienen la misma forma —preparar, decir qué calcula y qué cuesta, y pedir confirmación—, y un catálogo más corto es un catálogo en el que el modelo se equivoca menos. El `tipo` lleva en su descripción qué calcula cada uno, que es lo que necesita para elegir.

Dos cautelas que van con la decisión:

- **El tope de vueltas.** `MAX_VUELTAS_HERRAMIENTAS` son cuatro. Una herramienta directa que se pase de tiempo se come el turno entero, así que cada una lleva su propio tope y, al agotarlo, se degrada a propuesta en vez de colgar la conversación. El criterio de arriba hace que eso sea excepcional, no lo normal.
- **Nada de coeficientes inventados.** La curva de fragilidad ya sienta la regla: sin coeficientes de tanque y bomba, no hay curva. Una herramienta que rellene un hueco con un valor por defecto convierte una laguna en un dato, y eso es peor que no responder.

### Cómo quedó montado

`ejecutarHerramienta` era **sincrónico y puro** —recibía la red ya leída y devolvía datos, sin tocar la base ni Electron—, y eso es una virtud del módulo que no había que perder. Ahora es asíncrono y recibe un `ContextoHerramientas`, pero **los motores se inyectan**: `agentTools` sigue sin saber de Python ni de Electron, recibe funciones. Quien las monta es `chat.handler.ts`, que sí puede lanzar procesos. La consecuencia práctica es que todo el módulo se sigue probando sin Python.

Sólo las herramientas que ejecutan necesitaban esto. **Una herramienta que propone no ejecuta nada, así que sigue siendo pura y sincrónica por dentro** — el ejecutor tiene una sola firma para que el catálogo que ve el modelo sea uno solo.

Un detalle que importa más de lo que parece: el `.inp` que come el motor sale del `fileContent` de **la red activa del proyecto**, no del `global.currentWNTRFile` que usan los paneles. Ese global lo pone el visor al abrir una red, así que puede no existir —el chat responde sin que nadie haya abierto el visor— o, peor, ser **otra red** distinta de la activa. El agente calcula sobre la red de la que habla su propio resumen, o no calcula.

Y la curva no viaja entera al modelo. El motor devuelve veintiún puntos por serie más el reparto por diámetro con otros veintiuno por grupo: en `Net3` son miles de números. Al modelo se le dan las cifras de cabecera y cinco puntos repartidos por el eje, que es con lo que se responde a «cuántas tuberías fallarían». La tabla completa sigue en el panel y en el CSV.

## La batería (fase 0)

`backend/services/hydraulic/agentEval/`. Es la regla con la que se mide, y se escribió **antes** de tocar al agente: sin una medida de acierto, «entrenarlo» no se puede ni afirmar ni desmentir.

| Fichero | Qué |
|---|---|
| `casos.ts` | Los casos: pregunta, herramienta, argumentos y valor esperado |
| `bateria.ts` | Comprobación y marcador |
| `bateria.test.ts` | Los corre contra las herramientas y las redes reales |

### Las reglas de un caso

- **Ningún valor esperado se escribe de memoria.** Cada caso dice en `origen` de dónde salió el suyo, y todos salen de las redes guardadas en la base —las mismas que tendrá delante el agente— o del motor real ejecutado sobre ellas. Hay un test que exige que ese campo no esté vacío: un número sin procedencia es una creencia con aspecto de prueba.
- **La tolerancia es absoluta y en la unidad del campo**, no relativa. En hidráulica el margen que se admite se piensa en metros de cota o en décimas de l/s, no en un porcentaje.
- **`pendiente` es para herramientas que aún no existen.** El caso se declara igual, con su valor esperado ya calculado, y la batería lo cuenta aparte en vez de darlo por fallado —lo contrario sería ruido rojo permanente—. El día que la herramienta aparezca, el caso se activa borrando una línea. Otro test comprueba que la herramienta de un caso pendiente **de verdad no existe**: quedarse pendiente por inercia sería perder la comprobación sin enterarse.

### Dos comprobaciones que no hay que mezclar

**Que la herramienta acierta** es determinista y no necesita modelo: es lo que corre en cada suite. **Que el agente elige bien** depende de un proveedor con clave y es otra corrida y otro coste; el caso ya declara `herramienta` y `argumentos` para poder puntuarlo cuando se enchufe.

El orden importa: si la herramienta miente, el agente miente por mucho que elija bien.

### Marcador

```
batería del agente: 12/12 (100 %) · 0 pendientes
```

Los tres casos que estaban pendientes se activaron al llegar la fase 1, borrando su línea `pendiente`. Los dos de fragilidad corren **el motor de verdad**: se les podría inyectar un doble y correrían en cualquier sitio, pero entonces medirían que la herramienta llama bien a algo, no que la cifra que llega al agente es la del motor. Por eso el bloque se salta donde no haya Python con WNTR en lugar de fingirlo.

El de resiliencia cambió de forma al activarse, y el cambio es la decisión hecha prueba: **lo correcto ahí no es una cifra, es que proponga y se calle.**

## Trampas

- **`describe.skipIf` no salta el cuerpo del bloque**, sólo marca saltados los tests de dentro. Leer la base ahí hacía que en un runner sin ella —el CI— se ejecutara el `sqlite3.connect`, que **crea el fichero vacío**, y la consulta muriera con «no such table» durante la recolección: el fichero entero contaba como fallado en lugar de saltarse. Y dejaba una `prisma/hydraulic.db` de cero bytes en el árbol, que es lo peor de todo, porque hace mentir al `existsSync` de los otros tests que leen redes guardadas. La lectura va **dentro del `it`**, como en `agentTools.test.ts` y `networkContext.test.ts`.

- **Una cifra sin los argumentos con los que se obtuvo no se puede contrastar con nada.** Anotando la curva de fragilidad de `Net3 2` apunté 116,0 de 117 y creí que discrepaba del motor, que daba 114,4. No discrepaba: 116,0 es el valor de **suelo blando**, y lo que estaba mal era mi apunte de con qué suelo se había generado. Reproducido después en la aplicación, las dos cifras salen donde tienen que salir. De ahí que los casos fijen los tres suelos y que `origen` sea obligatorio.

- **Dos llamadas a la vez comparten el fichero temporal.** `ejecutarLlamadas` resuelve las herramientas de un turno **en paralelo**, así que dos curvas de fragilidad sobre la misma red escribían el mismo `.inp` y una borraba el que la otra estaba leyendo. Sale como un error del motor sin causa visible, y sólo con la suite entera —la peor forma de salir—. El temporal es uno por llamada, no por red.

- **La calculadora comprobaba el rango antes de convertir la unidad.** Un diámetro de 300 mm quedaba «fuera del rango [0.01, 10]», que está en metros: el aviso hablaba de un rango que el usuario no había escrito. No era del agente —se llega desde el panel—, va en el [#122](https://github.com/Boorie-AI/boorie_cliente/issues/122) y se arregló aquí porque una herramienta de cálculo que rechaza 300 mm no sirve para nada.

- **El escenario no se propone donde uno cree.** Escribí su caso suponiendo la forma del resultado en vez de leerla, y falló al primer intento: la propuesta no viene en `propuesta.tipo` sino en `definicion.eventos.0.tipo`. Es exactamente el error que la batería existe para impedir, y lo cazó a los cinco minutos de nacer.

## Lo que queda

Las fases 2 a 4 del #119: lo que cita, la disciplina del prompt —unidades en cada cifra, no dar impacto sin simular, citar la simulación de la que sale cada número— y correr la batería en cada cambio, añadiendo como caso cada fallo que aparezca usando el producto. Es la misma disciplina que sostiene `PROCESO_DE_RELEASE.md`.

La fase 1 está cerrada: las cinco herramientas de cada lado del criterio, con la batería en 12 de 12.
