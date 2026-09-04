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
| Consultas de topología (las tres de hoy) | Simulación hidráulica |
| Calculadora (`calculationEngine`) | Calidad del agua |
| Curva de fragilidad y reparto por diámetro | Indicadores de resiliencia |
| | Eficiencia energética (necesita simulación) |
| | Escenarios de interrupción (ya lo hace) |

Dos cautelas que van con la decisión:

- **El tope de vueltas.** `MAX_VUELTAS_HERRAMIENTAS` son cuatro. Una herramienta directa que se pase de tiempo se come el turno entero, así que cada una lleva su propio tope y, al agotarlo, se degrada a propuesta en vez de colgar la conversación. El criterio de arriba hace que eso sea excepcional, no lo normal.
- **Nada de coeficientes inventados.** La curva de fragilidad ya sienta la regla: sin coeficientes de tanque y bomba, no hay curva. Una herramienta que rellene un hueco con un valor por defecto convierte una laguna en un dato, y eso es peor que no responder.

Hay además un cambio de forma que la fase 1 tiene que hacer antes que nada: `ejecutarHerramienta` es hoy **sincrónico y puro** —recibe la red ya leída y devuelve datos, sin tocar la base ni Electron—, y eso es una virtud del módulo. Las nuevas son asíncronas y necesitan más que la red: cliente de Prisma, proyecto e intérprete de Python. El ejecutor recibe un contexto explícito y se vuelve asíncrono, en lugar de que cada herramienta se busque la vida.

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
batería del agente: 7/7 (100 %) · 3 pendientes de la fase 1
```

## Trampas

- **`describe.skipIf` no salta el cuerpo del bloque**, sólo marca saltados los tests de dentro. Leer la base ahí hacía que en un runner sin ella —el CI— se ejecutara el `sqlite3.connect`, que **crea el fichero vacío**, y la consulta muriera con «no such table» durante la recolección: el fichero entero contaba como fallado en lugar de saltarse. Y dejaba una `prisma/hydraulic.db` de cero bytes en el árbol, que es lo peor de todo, porque hace mentir al `existsSync` de los otros tests que leen redes guardadas. La lectura va **dentro del `it`**, como en `agentTools.test.ts` y `networkContext.test.ts`.

- **Una cifra sin los argumentos con los que se obtuvo no se puede contrastar con nada.** Anotando la curva de fragilidad de `Net3 2` apunté 116,0 de 117 y creí que discrepaba del motor, que daba 114,4. No discrepaba: 116,0 es el valor de **suelo blando**, y lo que estaba mal era mi apunte de con qué suelo se había generado. Reproducido después en la aplicación, las dos cifras salen donde tienen que salir. De ahí que los casos fijen los tres suelos y que `origen` sea obligatorio.

- **El escenario no se propone donde uno cree.** Escribí su caso suponiendo la forma del resultado en vez de leerla, y falló al primer intento: la propuesta no viene en `propuesta.tipo` sino en `definicion.eventos.0.tipo`. Es exactamente el error que la batería existe para impedir, y lo cazó a los cinco minutos de nacer.

## Lo que queda

Las fases 1 a 4 del #119: las manos, lo que cita, la disciplina del prompt —unidades en cada cifra, no dar impacto sin simular, citar la simulación de la que sale cada número— y correr la batería en cada cambio, añadiendo como caso cada fallo que aparezca usando el producto. Es la misma disciplina que sostiene `PROCESO_DE_RELEASE.md`.
