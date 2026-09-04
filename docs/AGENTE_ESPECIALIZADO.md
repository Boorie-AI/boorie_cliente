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

- **Los metadatos de un mensaje se guardan como texto y hay que deshacerlos al leer.** Otros sitios del código ya lo hacían —proyectos, documentos, modelos—; a los mensajes se les había pasado. Se ve sólo reabriendo una conversación vieja, nunca en la sesión que la creó.

- **El escenario no se propone donde uno cree.** Escribí su caso suponiendo la forma del resultado en vez de leerla, y falló al primer intento: la propuesta no viene en `propuesta.tipo` sino en `definicion.eventos.0.tipo`. Es exactamente el error que la batería existe para impedir, y lo cazó a los cinco minutos de nacer.

## Las citas (fase 2)

Que una afirmación normativa venga con su documento y su parte, y que quien la lee pueda comprobarla.

El RAG ya estaba enchufado al chat: `enhancePromptWithRAG` en `chatStore` inyecta las fuentes recuperadas. El hueco estaba en tres sitios a la vez, y los tres había que cerrarlos para que una cita significara algo.

**El prompt tiraba la identidad.** `formatSources` recupera `section`, `page` y `category` de cada fragmento, y el prompt llevaba sólo `[Source 1]: <título>` y el contenido. El modelo no podía citar una sección porque nadie se la había dicho.

**No se le pedía citar.** No había ninguna instrucción al respecto, así que no citaba. Las reglas van ahora **después** de las fuentes y antes de la pregunta: puestas antes, quedan a varios miles de caracteres del momento de responder.

**La interfaz no numeraba.** La lista de fuentes mostraba título, categoría y relevancia. Una cita «(F1)» habría sido irresoluble para el lector, que es peor que no citar: parece comprobable y no lo es. Ahora la marca la pintan los dos, prompt e interfaz, en el mismo orden, y `marcaDeFuente` es la única función que la construye.

Y un cuarto, que salió al ir a comprobarlo en la aplicación: **las fuentes desaparecían al reabrir la conversación.** `Message.metadata` se guarda como texto JSON y nadie lo deshacía al leerlo, así que `metadata.sources` era `undefined` sobre una cadena. La evidencia de una respuesta duraba lo que la sesión.

La política entera vive en `src/services/contextoConocimiento.ts`, que es puro y se prueba sin levantar el RAG ni hablar con ningún proveedor. Incluye el caso sin fuentes: decirle al modelo que no se ha encontrado nada es parte de la política, no un `else` suelto — sin esa frase negaba tener acceso a ningún RAG, contradiciendo a la insignia de la propia interfaz (#19/#20).

## La disciplina (fase 3)

Las reglas que se han ido ganando a base de fallos, escritas donde el agente las lea: `backend/services/hydraulic/promptDelAgente.ts`.

**Y en código, no en un ajuste.** Hasta aquí el prompt de sistema salía **entero** de `app_settings`, y esa fila **no existe** en una instalación recién hecha: el handler anotaba «No system prompt found in database» y el mensaje se enviaba sin ningún sistema. El «por defecto» que se veía en Ajustes vivía dentro del componente del panel y sólo llegaba a la base si el usuario le daba a guardar. O sea que las reglas que impiden inventar cifras dependían de que alguien hubiera entrado en una pantalla de configuración.

Ahora la disciplina va siempre, y lo que el usuario escriba **se añade** al final: su prompt es para el papel y el tono; que una cifra lleve unidad no es una preferencia. El panel lo dice, y su sugerencia dejó de duplicar reglas —duplicarlas significaba que quien la guardara se llevaba dos copias, y que editarla pareciera poder desactivarlas—.

Las reglas, y por qué cada una:

| Regla | De dónde viene |
|---|---|
| Toda cifra con su unidad, también en los pasos intermedios | La familia de fallos que más ha reaparecido: l/s frente a m³/s en el comparador (v1.25.0) y en energía (v1.27.0), la fracción mostrada como porcentaje (v1.26.0) |
| No convertir ni redondear por cuenta propia | Las herramientas ya entregan l/s y mm con la unidad en el nombre del campo |
| Nada de cifras de impacto sin simular; proponer no es simular | Ya lo decía `proponer_escenario`; ahora vale para todos |
| Cada número, de una herramienta, una simulación o una fuente citada | Es lo que separa una respuesta comprobable de una inventada |
| Decir de qué simulación sale el número | Una cifra sin origen no se puede comprobar |
| Consultar la red en vez de responder de memoria | El #34: a «cómo mejoro el flujo en la junta 3» respondió cómo se limpia una junta mecánica |
| No inventar identificadores | La herramienta devuelve los parecidos para poder proponer el correcto |
| Explicar por qué un análisis se propone | Para que la espera no parezca un fallo de la aplicación |

No fija idioma: responde en el que le escriban. La aplicación va en tres, y clavar uno rompería dos.

## Medir al modelo (fase 4)

La batería tenía media medida: que la herramienta acierta. Falta la otra, que es **si el modelo elige bien**, y esa necesita un modelo delante.

```bash
BOORIE_EVAL_MODELO=llama3.1:8b npx vitest run backend/services/hydraulic/agentEval/modelo.test.ts
```

Va detrás de una variable de entorno y no en `npm test` por tres razones: son doce llamadas a un modelo, tardan del orden de doce minutos, y el resultado depende del modelo que haya delante. Un número que cambia según la máquina no puede tumbar el CI. Sin la variable se salta; con ella y sin modelo accesible, también —medir a medias da un número peor que no tener número—.

La temperatura va a cero. Una batería que da un resultado distinto cada vez no sirve para ver si se mejora.

Las preguntas se hacen **en serie**. Doce peticiones a la vez a un modelo local se pisan, y entonces se mide la máquina y no al agente.

### Qué se puntúa, y qué no

Que llame a la herramienta que resuelve la pregunta, y que acierte **los argumentos que la pregunta determina**. Esos van en `argumentosDelModelo`, que no es lo mismo que `argumentos`: con los segundos se corre la herramienta para comprobar la cifra, e incluyen cosas que la pregunta no dice —el modelo de daño, la clase de suelo—. Exigirle esos al modelo sería medirlo por adivinar.

Se acepta que llame a varias herramientas y una sea la correcta: consultar la red antes de calcular no es un error.

Y la comparación de argumentos es laxa con el tipo a propósito. Un modelo que devuelve `"101"` donde se esperaba `101` ha entendido la pregunta; medirlo por el tipo del JSON mediría al proveedor.

### La primera medida

`llama3.1:8b`, con las doce preguntas de la batería: **12 de 12**.

La primera corrida dio 11, y el fallo enseñó algo sobre la batería y no sobre el modelo: el caso del reparto por diámetro preguntaba «¿**Y** cuántos kilómetros…?», escrito como continuación de la pregunta anterior. Medido suelto —que es como se mide— sonaba a listar tuberías por diámetro, y el modelo llamaba a `listar_elementos`. Acertaba a la pregunta que se le hacía, no a la que yo creía estar haciendo. **Un caso tiene que sostenerse solo.**

### Lo que sigue sin medirse

Que **obedezca** la disciplina: que ponga la unidad, que no dé impacto sin simular, que cite con la marca. Eso no se lee de una llamada a herramienta sino de la respuesta escrita. Es la fase 5.

## Medir lo que escribe (fase 5)

Quedó anotado como «pide o un humano o un modelo juez». **Dos de las tres reglas no lo piden**, y la tercera tampoco:

| Regla | Cómo se puntúa |
|---|---|
| Toda cifra con su unidad | Del texto: donde la frase dice qué magnitud es, la cifra tiene que llevar una unidad **de esa** magnitud |
| Cita con la marca de la fase 2 | Del texto: toda marca `F<n>` tiene que caer dentro de las fuentes que se dieron |
| Nada de impacto sin simular | En la batería **ninguna** herramienta simula, así que cualquier cifra de servicio o de presión es, por construcción, una cifra sin nada detrás |

De modo que el medidor es determinista y vive en `agentEval/disciplina.ts`, con sus propias pruebas dentro de `npm test`. El modelo hace falta para **tomar** la medida, no para puntuarla.

La de las citas es además el riesgo que la fase 2 dejó escrito y nada comprobaba: «una cita (F1) que el lector no puede resolver es peor que ninguna cita, porque parece comprobable y no lo es».

### La conversación entera, no la primera llamada

Para que haya prosa que puntuar hay que devolverle el resultado de la herramienta y dejarle escribir. El bucle es el mismo que corre `chat.handler.ts` en producción —un mensaje `role: 'tool'` por llamada, con tope de vueltas—, porque medir un camino que nadie recorre no mide nada. Eso ata la medida a WNTR: los casos de fragilidad piden el motor, y sin él se estaría midiendo cómo escribe un error.

### Conservador a propósito

Un medidor que marca donde no hay falta da un número peor que no tener número, y además **empuja en la dirección contraria**: si castigara «no puedo decirte cuántos nudos se quedarían sin servicio sin simular», estaría penalizando exactamente la respuesta que la disciplina pide.

Así que sólo se mira donde el texto dice de quién es el número. «El nudo 101», «117 tuberías» y «página 4» no llevan unidad porque no son magnitudes; «la presión en el nudo 101 es de 45,2» no se marca aunque le falte, porque entre la magnitud y la cifra hay un sustantivo que podría ser su dueño. Las dos decisiones están escritas como pruebas, para que se sepa que son decisiones y no descuidos.

Tres cosas se ganaron probando el medidor antes de creerle:

- El identificador pegado al vocabulario de impacto —«la tubería 329 deja sin servicio»— casaba como cifra. Hizo falta cortarle el retroceso al motor de expresiones: sin el `(?<![\d.,])`, casaba «29» dentro de «329», donde lo que precede al 29 es un 3 y no el sustantivo.
- La respuesta que **obedece** salía marcada, porque lleva cifra y vocabulario de impacto. De ahí la lista de salvedades.
- Y una salvedad demasiado ancha es peor que ninguna: «no se» a secas aparece en «no se recuperan hasta las 6 h» y tapaba la falta de la misma frase que la cometía.

### Lo que cuesta tomarla, y por qué está en su propio fichero

Cada caso son **dos peticiones**: la primera de ~2.900 tokens —el catálogo de herramientas ya son 2.000, y viaja en cada caso—, la segunda barata porque Ollama reutiliza el prefijo ya procesado. En CPU eso es del orden de un minuto por petición, o sea unos **2 min 15 s por caso y media hora los doce**.

De ahí tres decisiones que salieron de fallar tres veces al tomarla:

- **Cada medida en su fichero.** Estaban las dos en `modelo.test.ts`, así que la de disciplina hacía cola detrás de la de la fase 4 —11 min 30 s— y no se podía tomar una sin pagar la otra. Lo común vive en `contraElModelo.ts`.
- **Tope de una hora, no de media.** Con media se moría por tiempo en el caso 11 de 12, sin dar número.
- **Sólo se cargan las redes que los casos nombran.** Se cargaban las ocho guardadas con su `networkData` y su `.inp` parseados, y la batería usa dos; una de las que no usa pesa 2 MB.

Y un aviso para quien la tome: **el 8B ocupa unos 7 GB durante la corrida**, y dos intentos se los llevó el matarratas de memoria de Linux. Conviene mirar `free -h` antes de empezar y no lanzar `npm test` en paralelo —eso tumbó la detección de Python, que arranca un intérprete, y el bloque se saltó en silencio—. Por eso ahora el salto dice por qué.

La ventana de contexto sí da de sobra: con `n_ctx_slot = 4096`, los prompts se quedan en ~2.900 y el log de Ollama da `truncated = 0` en todas. Importaba comprobarlo: si los resultados de herramienta desbordaran la ventana, Ollama arranca con `--context-shift` y se habría medido la ventana en vez de al agente.

### La primera medida, y por qué un pleno no es una buena noticia

Tomada con `llama3.2` —3,2B— porque el 8B de la fase 4 no cabía en la máquina donde se midió: durante la corrida ocupa unos 7 GB y dos intentos se los llevó el matarratas de memoria de Linux. **Así que este número no es comparable con el `12/12` de la fase 4**, que se tomó con `llama3.1:8b`. Diecisiete minutos, los doce casos.

```
modelo llama3.2:latest: 12/12 respuestas sin faltas (100 %)
  con cifra que medir: 1/12
  unidades: 0 · citas: 0 · impacto: 0
```

Un pleno **sacado sobre una sola respuesta**. Once de las doce no llevaban ninguna cifra de magnitud que mirar.

Ese segundo número no estaba en la primera corrida, y sin él el porcentaje engaña: se leía «12 de 12» y parecía que el agente escribiera impecablemente. Se añadió justo por esto. El modelo lo hace **mal**: de los doce casos, en cinco se equivoca de herramienta o se pierde.

| Caso | Lo que escribió |
|---|---|
| `net3-cuantas-bombas` | Llamó a `consultar_elemento`, confundió una bomba con un tanque y concluyó «No hay bombas en la red», que es falso |
| `net3-nudo-mas-demandante` | Llamó a `consultar_elemento` con id `92`, que es el *recuento* de nudos del resumen de la red |
| `net3-tuberia-mas-larga` | Falló y se inventó un comando: «puedo ejecutar `list pipes` en la red cargada» |
| `net3-curva-fragilidad-suelo-blando` | Se perdió y se puso a hablar de otro nudo |
| `net3-curva-fragilidad` | «115 tuberías, según el modelo ALA_2001», y atribuye la cifra a «el uso de EPANET» |

Saca el pleno de todas formas porque **las tres reglas son de la forma «si escribes una cifra, escríbela así»**. Una respuesta que se equivoca de herramienta, o que se disculpa y no da ninguna cifra, no puede incumplirlas. Las cifras que sí dio —`12,8016 metros`, `0,231 litros por segundo`— están impecablemente rotuladas, y que la de fragilidad salga de los argumentos equivocados no es asunto de este medidor.

**Este medidor mide la forma, no la verdad.** Y `llama3.2` saca un 100 % de obediencia en parte *porque* falla al elegir: quien no da cifras no las escribe mal.

De donde sale la regla para leer esto: **los números de las fases 4 y 5 no se leen separados.** Un 100 % de obediencia sólo dice algo si al lado hay un porcentaje de elección alto. Con la elección baja, la obediencia mide silencio, y `conCifras` es lo que pone cifra a ese silencio: uno de doce.

### Y el contador delató al propio medidor

`villa-demanda-j3` respondió «El nudo J3 **consume** 0.231 litros por segundo de agua» —una cifra rotulada con la unidad de su magnitud, exactamente lo que el medidor está para agarrar— y la cuenta como **cero cifras miradas**.

El motivo: en la tabla de magnitudes está `consumo`, el sustantivo, y no `consume`, el verbo. Sin `conCifras` el caso habría pasado por «cumple» sin que nadie se enterara de que no se había mirado nada.

No se arregla en la misma corrida a propósito: cambiar el vocabulario obliga a volver a medir, y un número tomado con un medidor distinto del que está en el repositorio no vale. Queda anotado abajo con su caso.

### Lo que este medidor no mide

El porcentaje escrito como fracción (v1.26.0) no se distingue del porcentaje bien escrito sin entender la frase. Y la disciplina pide también decir **de qué** simulación sale un número: eso es una afirmación sobre el origen, no una forma, y ahí sí haría falta un juez.

## Lo que queda

Del #119: que cada fallo que aparezca usando el producto entre como caso, que es la misma disciplina que sostiene `PROCESO_DE_RELEASE.md`.

Y lo que la primera medida de la fase 5 dejó a la vista: **ensanchar el vocabulario de magnitudes del medidor a las formas verbales**. Con `conCifras` en uno de doce, el medidor casi no llega a mirar nada de lo que el agente escribe. El caso que lo enseña está arriba: «el nudo J3 **consume** 0,231 litros por segundo» no se cuenta porque la tabla tiene `consumo` y no `consume`. Cada palabra que se añada es un riesgo de marcar donde no hay falta, así que entra con su caso y su medida nueva.

La fase 1 está cerrada: las cinco herramientas de cada lado del criterio, con la batería en 12 de 12.
