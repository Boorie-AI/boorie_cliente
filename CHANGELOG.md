# Changelog

Todas las versiones liberadas de Boorie Cliente. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el versionado es
[SemVer](https://semver.org/lang/es/).

La entrada superior debe coincidir con la versión de `package.json`. El proceso de
actualización está descrito en `docs/ACERCA_DE_HISTORIAL_VERSIONES.md`.

## [1.15.1] - 2026-08-20

Corrige un fallo que dejaba las redes inaccesibles en instalaciones reales.

- **Si Boorie no te dejaba abrir ni listar las redes de un proyecto, ya está resuelto.** A las
  instalaciones les faltaban tres columnas que la aplicación daba por hechas desde la v1.6.0, y
  cualquier pantalla que tocara redes fallaba. **Tus datos nunca se perdieron**: las redes, sus
  versiones y sus simulaciones seguían guardadas, sólo que la aplicación no podía leerlas. Al
  abrir esta versión se reparan solas.
- Afectaba a quien instalara de cero y a quien actualizara desde una versión anterior a la
  v1.6.0. Quien nunca vio el error no tiene nada que hacer.
- La pestaña de guardrails vuelve a poder listar las violaciones registradas.

## [1.15.0] - 2026-08-20

Ahora puedes preguntarle a Boorie qué encontró la última simulación.

- **Cada simulación deja constancia en el conocimiento del proyecto.** Al terminar una corrida,
  Boorie escribe e indexa un resumen de la ejecución, sus estadísticas, los elementos fuera de
  umbral y en qué cambió respecto a la anterior.
- **Pregúntale al chat «¿qué problemas encontró la última simulación?»** y responde con las
  anomalías reales de esa corrida —qué nudo, qué presión, cuántas horas— citando la simulación de
  la que salen.
- **No se juzga la presión de embalses ni depósitos**, que por definición no la tienen: antes el
  informe habría abierto denunciando que la fuente de la que se abastece la red estaba en déficit.
- **Los umbrales son tuyos.** Presión entre 14 y 70 m y velocidad máxima de 3 m/s por defecto —los
  valores de uso común—, ajustables porque la norma cambia con el país.
- **La simulación no espera a la indexación.** Si algo falla, la corrida sigue siendo válida: el
  historial de la red dice cómo fue y desde ahí se reintenta.
- **Al podar una versión de red se van también sus documentos**, para que el conocimiento no
  acumule respuestas sobre redes que ya no existen.
- **Lo indexado de un proyecto no se ve desde otro**, igual que el resto de su conocimiento.
- **El agente vuelve a citar el conocimiento indexado.** La búsqueda semántica llevaba tiempo
  devolviendo cero en silencio y el graduado descartaba documentos válidos: se corrigieron cuatro
  fallos que se tapaban entre sí. Una pregunta que antes tardaba siete minutos para acabar en «no
  encontré nada» ahora se responde en dos o tres, con las fuentes delante.
- **El historial de red y los ajustes que faltaban ya hablan tu idioma**, en inglés y catalán
  además de castellano, con las fechas en el formato que corresponde.

## [1.14.0] - 2026-08-19

Los documentos de un cliente se quedan en su proyecto.

- **El Wisdom Center distingue dos ámbitos**: lo **general** —normativa, buenas prácticas, el
  catálogo, compartido por todos tus proyectos— y lo **del proyecto**, que son los documentos
  internos de ese cliente. Eliges dónde buscar: sólo general, sólo del proyecto, o ambos.
- **Un documento de un proyecto no aparece en las búsquedas de otro.** En ningún modo. Es lo que
  antes no se podía garantizar: todo vivía en un único espacio sin noción de proyecto.
- **Desde un proyecto sigues viendo la normativa general**, que es lo que no debe perderse nunca.
  La herencia va en un solo sentido.
- **Cada documento dice de dónde viene**, para que una cita de una norma no se confunda con un
  documento interno de tu cliente.
- **Subir al ámbito de un proyecto es una decisión explícita**: sólo ocurre si has elegido ese
  ámbito. Que un documento interno acabe visible para todos no puede ser un descuido.
- Tus documentos actuales quedan en el ámbito general —que es lo que son— sin perder nada ni
  reindexar.

## [1.13.0] - 2026-08-19

Tu red tiene historia, y puedes volver a cualquier punto de ella.

- **Reimportar un `.inp` corregido ya no destruye lo anterior.** Antes Boorie rechazaba el
  guardado si ya había una red con ese nombre; ahora congela el estado que había y lo deja en el
  historial.
- **Cada red tiene su historial de versiones.** Guarda una versión con una nota de qué cambió,
  márcala como hito para que no se pode nunca, compárala con la anterior —te dice qué nudos y
  tramos se añadieron, se quitaron o se modificaron— y restaura cualquiera. Restaurar guarda antes
  el estado actual, así que volver atrás no cuesta perder lo de hoy.
- **Instantáneas del proyecto entero**, para responder «¿cómo estaba esto en la entrega de
  marzo?». Anotan qué versión de cada red estaba vigente y las protegen de la limpieza automática.
- **Cada simulación queda atada a la versión de red con la que se corrió**, y puedes comparar dos
  ejecuciones: cuánto se movieron las presiones, los caudales y las velocidades, y qué elementos
  cambiaron más.
- **Puedes exportar una versión —o una instantánea entera— a un fichero y abrirla en otra
  instalación de Boorie.** El paquete se comprueba al importarlo: si llegó a medias o alguien lo
  editó, no se importa nada.
- **La limpieza del historial se configura** en Configuración → General. Se conservan siempre los
  hitos, lo que sujeta una instantánea y la versión más reciente.

## [1.12.0] - 2026-08-19

El reloj de la simulación es el de tu modelo, y puedes elegir qué miras.

- **El control temporal marca el tiempo real de tu simulación.** Si tu modelo reporta cada
  15 minutos, el reloj avanza 15 minutos por paso; antes sumaba una hora fija, así que corría
  cuatro veces más rápido, y la fecha que enseñaba —un jueves de octubre con hora australiana—
  no salía de ningún dato. Ahora te dice el momento, el paso, cada cuánto reporta el modelo y
  cuánto dura, todo leído de tu `.inp` y de los resultados de WNTR.
- **Sin hora declarada en el `.inp`, el tiempo se muestra transcurrido** (`+04:15:00`) en vez de
  fingir una hora del día. Si tu modelo declara su hora de arranque, se usa la suya.
- **Mover la barra repinta el mapa.** Antes cambiaba el reloj y los colores se quedaban en el
  primer paso.
- **Una simulación de un solo paso ya no enseña reproductor**, que no llevaba a ninguna parte.
- **Puedes colorear la red por presión, demanda, caudal o velocidad**, y la leyenda te dice el
  rango real de tu red en ese paso en lugar de un máximo fijo que saturaba en cuanto la red se
  salía de él.
- **Puedes encender y apagar la red por tipo de elemento**: nudos de consumo, depósitos, embalses,
  tuberías, bombas y válvulas, con el contador de cada uno al lado. Con miles de nudos es lo que
  permite mirar sólo las bombas, o el trazado sin la nube de acometidas.
- **Al pulsar «Simulaciones» sin una red cargada, Boorie te dice que hace falta una y te da el
  botón para importarla.** Antes te dejaba en la pantalla de importar sin explicar nada.
- **«Abrir» en la lista de proyectos abre el proyecto.** Antes sólo lo marcaba como activo, así
  que si ya lo era no ocurría nada.

## [1.11.0] - 2026-08-19

Un solo visor, y una red que se puede ver aunque no se sepa dónde está.

- Tu red se puede ver como **esquema** aunque no se pueda situar en el mapa. Una red sin
  coordenadas, o con un sistema que nadie ha declarado, ya no se queda sin ninguna vista: el
  aviso del mapa te ofrece verla como esquema, con sus depósitos, embalses y bombas, y puedes
  pinchar un nudo o un tramo para ver sus datos.
- Si tu `.inp` trae coordenadas de dibujo en vez de coordenadas reales —las que van de 19 a 335
  en lugar de rondar el millón—, Boorie te lo dice en vez de invitarte a declarar un EPSG que
  plantaría tu red en otro continente sin avisar.
- Todos los ajustes del mapa están en un solo panel: vista, mapa base, etiquetas, opacidad,
  tamaño de nudo, grosor de tramo y simbología. Antes estaban repartidos en tres sitios y la
  mayoría no llegaba al dibujo: la opacidad, los dos interruptores de presiones, los rangos y
  el «coloca tu red pinchando el mapa» no hacían nada.
- La vista de satélite vuelve. Estaba desactivada para todos los equipos y el mensaje decía
  «no compatible con su sistema» sin haber mirado el sistema.
- Cambiar el mapa base ya no borra tu red del mapa.
- Con la ventana maximizada ya no se corta la fila de botones del visor.
- El botón «Abrir» de la lista de proyectos abre el proyecto. Antes sólo lo marcaba como activo,
  así que si ya lo era no ocurría nada.
- Por dentro se retiran diez visores que no usaba nadie —unas 4.700 líneas— y queda uno solo
  documentado como canónico.

## [1.10.0] - 2026-08-19

Tu red se sitúa en el mapa donde tú digas, no donde Boorie se imagine.

- Boorie ya no adivina el sistema de coordenadas de tu red: te lo pregunta. Un selector nuevo te
  deja declarar el EPSG —los 120 husos UTM, MAGNA-SIRGAS de Colombia, ETRS89 y ED50 de España,
  ITRF2008 de México, o cualquier código que escribas— y te enseña dónde va a caer el centro de la
  red antes de que aceptes.
- Una red sin sistema declarado ya no se dibuja en un sitio inventado: el mapa te dice que falta
  declararlo y te da el botón para hacerlo. Antes, cualquier red que no encajara en los rangos con
  los que se programó acababa pintada en el Caribe colombiano sin avisar de nada.
- Cambiar el EPSG recoloca la red al instante, sin volver a cargar el `.inp`.
- Si la red reproyectada cae fuera del país de tu proyecto, Boorie te avisa. Es la forma de cazar
  un huso equivocado antes de ponerte a trabajar sobre una ubicación falsa.
- Las coordenadas de tu `.inp` no se tocan nunca: la reproyección existe sólo para pintar el mapa,
  así que el fichero que guardaste sigue siendo exactamente el tuyo.

## [1.9.0] - 2026-08-19

Boorie empieza por tus proyectos, y lo del proyecto cuelga de ahí.

- El menú se organiza en tres bloques: lo que pertenece al proyecto activo, las herramientas
  que funcionan sin él y lo del sistema. Antes era una lista plana donde «Red WNTR» —que sin
  proyecto no lleva a ninguna parte— estaba al mismo nivel que «Configuración».
- El nombre del proyecto en el que trabajas está siempre a la vista en el menú, y de él cuelgan
  su red, sus simulaciones y su chat. Sin proyecto activo, esos ítems no aparecen y el menú lo
  dice.
- «Proyectos» te enseña siempre tu lista, con el proyecto activo marcado. Antes, con un proyecto
  abierto, esa pantalla mostraba lo mismo que «Red WNTR» y no había forma de volver a la lista
  para cambiar de proyecto sin cerrarlo primero.
- El chat general y el chat del proyecto son dos entradas distintas: el general para preguntar
  de ingeniería sin proyecto delante, el del proyecto para hablar de tu red. Cada uno lista sus
  propias conversaciones, y la que empieces queda atada al proyecto sólo si es la del proyecto.
- Si abres Boorie sin proyecto activo, entra en Proyectos en vez de dejarte en una pantalla que
  necesita uno. Si lo tienes, sigue abriendo donde lo dejaste.

## [1.8.0] - 2026-08-19

El chat deja de hablar de tu red de oídas: ahora la tiene delante y puede consultarla.

- El agente recibe los datos reales de la red cargada —nudos, depósitos, tuberías, longitud
  total, demanda y rango de diámetros— en lugar de un escueto «hay una red cargada». Antes,
  a «¿cómo mejoro el flujo en el nudo J3?» respondía consejos genéricos sobre limpiar una
  junta mecánica, sin enterarse de que J3 es un nudo de tu red.
- Puede consultar un nudo o un tramo concreto cuando se lo preguntas, en vez de responder
  con cifras aproximadas. En una red de 92 nudos el resumen no cabe entero en la conversación,
  así que mira sólo lo que necesita para responderte.
- La cabecera del chat indica qué red está viendo el agente. Si no ve ninguna, lo dice y te
  explica que cargues un archivo .inp en el proyecto.
- Sin proyecto abierto, el chat responde con conocimiento general de ingeniería hidráulica y
  con tu base de conocimiento, pero ya no describe redes que no tiene delante ni suelta
  ejemplos numéricos que puedan confundirse con la tuya.
- Cuando el modelo que usas no admite consultas a la red, el agente lo sabe y te dice que no
  puede mirarlo, en lugar de estimarlo.

## [1.7.0] - 2026-08-18

Boorie dice qué falta y ofrece el botón que lo resuelve, en lugar de dejarte adivinando.

- Si entras en la red hidráulica sin un proyecto activo, Boorie te lo dice y te ofrece
  elegir uno. Antes te cambiaba la pantalla por la lista de proyectos sin explicar por
  qué: el menú marcaba «Red WNTR» y el contenido era otro, sin una palabra.
- Los ítems del menú que necesitan algo aparecen atenuados y con un candado, y al pasar
  el ratón te dicen qué les falta. Siguen pudiéndose pulsar: así llegas a la pantalla que
  te lo explica y te lo resuelve, en vez de encontrarte un botón muerto.
- El tutorial de primer uso ya no termina en la calculadora: te lleva a crear un proyecto
  y cargar tu red, que es lo que necesita el resto de la aplicación.
- La calculadora sigue funcionando sola, sin pedirte ningún proyecto.
- Los nombres del menú ya salen en tu idioma. «Projects», «Calculator» y «WNTR Network»
  estaban en inglés aunque tuvieras la aplicación en español o catalán.

## [1.6.0] - 2026-08-18

La simulación de interrupción del servicio dice ahora a cuánta gente deja sin agua.

- Al simular la falla de una tubería, bomba o válvula, Boorie calcula además cuántos
  habitantes se quedan sin servicio, en qué nudos, cuánto dura el déficit y cuánta agua
  no llega a entregarse. Sale todo de la misma ejecución: no hay que lanzar una segunda
  simulación ni volver a describir la avería.
- Puedes ajustar el módulo de demanda de tu zona en litros por habitante y día. Por
  defecto son 200, el valor típico de diseño en América Latina, y el resultado se
  recalcula al cambiarlo.
- Si indicas cuántos habitantes tiene una acometida, Boorie traduce la población a
  número de clientes afectados. Si no lo indicas, no se inventa la cifra.
- Boorie separa lo que causa la avería de lo que la red ya tenía mal. Si un sector
  llevaba tiempo sin presión suficiente, esa gente no se suma a la que deja sin agua la
  falla nueva, y verás ambas cifras por separado.
- Las simulaciones de interrupción pasan a calcularse con demanda dependiente de la
  presión, que es lo correcto cuando falta agua. Antes un nudo con muy poca presión se
  daba por bien servido y el impacto salía en cero. Las presiones que ya se mostraban
  cambian apenas unos centímetros.
- Corregido que las horas fuera de servicio pudieran superar la duración de la propia
  simulación: 24 horas simuladas llegaban a reportar 25 horas de corte.
- Si la simulación no converge en algún instante, Boorie lo avisa en lugar de presentar
  cifras poco fiables como si fueran buenas.

## [1.5.2] - 2026-08-18

Un único proyecto activo para toda la aplicación, y las redes y cálculos pasan a
guardarse en el proyecto en lugar de solo en este equipo.

- El proyecto en el que trabajas es ahora el mismo en todas las vistas: el chat, la red
  y el Wisdom Center comparten contexto. Antes cada pantalla llevaba su propia
  selección, así que podías estar en un proyecto en la red y en otro distinto en el
  chat sin ningún aviso.
- Al cerrar y reabrir Boorie se recupera el último proyecto en el que estabas.
- Si abres una conversación que pertenece a otro proyecto, Boorie avisa y te deja
  elegir si cambias de proyecto o sigues en el actual, para que el asistente no
  responda con el contexto equivocado.
- Tus redes y cálculos se guardan en el proyecto y no solo en el navegador del equipo.
  Al actualizar se trasladan solos, y los datos anteriores se conservan intactos por si
  acaso.
- Una red guardada se abre aunque hayas movido o borrado el archivo .inp original.
- Los escenarios derivados de una red, como una esqueletización, pueden guardarse
  colgando de ella con su propia carpeta de resultados, en vez de quedar como proyectos
  sueltos. Se sigue pudiendo guardarlos como proyecto aparte.
- Corregido que al analizar o simular pudiera usarse una red distinta de la que se
  muestra en pantalla.

## [1.5.1] - 2026-08-10

Estabilización del arranque de Python/WNTR en Windows, corrección del indexado RAG y mejoras
en las rutinas de resiliencia.

- WNTR vuelve a detectarse tras reiniciar la aplicación en Windows: la ruta del entorno de
  Python ahora se conserva entre sesiones.
- El asistente de preparación explica por qué falla una instalación en lugar de mostrar sólo
  «verification-failed», e indica qué paquete falta y por qué.
- Se requiere Python 3.10 – 3.13. La 3.14 no sirve todavía, porque WNTR no publica paquete
  para esa versión. Un entorno anterior fuera de ese rango se conserva y se recrea.
- «Reindexar» en el Wisdom Center vuelve a reindexar: antes borraba los fragmentos del
  documento y reportaba éxito sin recrearlos.
- El estado de la base vectorial que muestra la aplicación se consulta de verdad, en vez de
  darse por bueno.
- Los indicadores de resiliencia se presentan en tabla con encabezados, distinguiendo el
  escenario anterior del posterior a la interrupción simulada.
- Los nudos afectados por una interrupción del servicio se resaltan sobre el mapa.
- La curva de fragilidad y los indicadores de resiliencia se pueden exportar a CSV.
- Cada rutina de resiliencia avisa de cuánto puede tardar antes de ejecutarse.
- Nueva sección «Acerca de» en Configuración, con la versión instalada y este historial.

Validada mediante nueve candidatos de liberación (rc.1 – rc.9).

## [1.5.0] - 2026-07-27

Rutinas de resiliencia para el módulo WNTR Network.

- Esqueletización de redes, con guardado de la red simplificada como proyecto nuevo.
- Simulación de interrupción del servicio por falla de componentes.
- Indicadores de resiliencia de la red: índice de Todini, entropía y redundancia hidráulica.
- Curva de fragilidad de componentes frente a intensidad sísmica.
- Corregida la interfaz que se quedaba congelada al cambiar el modelo de embeddings.
- El chat vuelve a recibir el contexto del proyecto activo.

## [1.4.4] - 2026-07-09

Base vectorial integrada en la aplicación.

- Milvus embebido: ya no hace falta Docker ni un servicio externo para el indexado.
- Mejoras en la visualización de redes sobre mapa y en el chat.
- Documentación de instalación actualizada en castellano, inglés y catalán.

## [1.4.3] - 2026-06-30

Correcciones de indexado en Windows y de contexto de proyecto.

- Los proyectos vuelven a aparecer en el chat.
- Corregida la indexación del Wisdom Center en Windows.
- Resueltas varias vulnerabilidades en dependencias.
- El registro de actividad de la aplicación deja de escribir traza de depuración en uso
  normal, reduciendo el tamaño de los logs.

## [1.4.2] - 2026-05-11

Estabilización de la integración continua y corrección de defectos asociados.

- Corregido el empaquetado, que se invocaba dos veces y podía publicar sin querer.
- Resueltos los errores de tipos y de estilo que impedían compilar el proceso principal,
  junto con cinco defectos reales detectados al hacerlo.
- Restaurada la auditoría de seguridad en el proceso de integración continua.
