# Changelog

Todas las versiones liberadas de Boorie Cliente. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el versionado es
[SemVer](https://semver.org/lang/es/).

La entrada superior debe coincidir con la versión de `package.json`. Cómo se publica una
versión —qué ficheros hay que tocar y qué comprobar en los artefactos— está en
`docs/PROCESO_DE_RELEASE.md`; por qué el historial vive aquí, en
`docs/ACERCA_DE_HISTORIAL_VERSIONES.md`.

## [Unreleased]

Lo que hay integrado en `main` y todavía sin publicar. El parser del historial
(`src/utils/changelog.ts`) sólo reconoce cabeceras con número de versión, así que esta
sección no la ve y la pestaña «Acerca de» sigue cuadrando con `package.json`. Al publicar,
esto se dobla en la entrada de la versión nueva.

- **El asistente no podía hacer los análisis que Boorie ya sabía calcular.** Leía la
  topología de la red y ahí se acababa, así que el usuario ejecutaba el panel a mano y
  después volvía a contarle al chat los números que acababa de ver. Ahora ejecuta él la
  curva de fragilidad y la calculadora, y propone —para que las confirme el usuario— los
  análisis que exigen simular la red entera, que en una red grande pasan de diez minutos.
  El criterio de qué hace directo y qué propone no es «rápido o lento»: es si hay que
  simular.
- **Cada afirmación que sale de la documentación viene ahora con su fuente**, y la fuente
  se puede resolver: la respuesta lleva una marca y debajo está la lista numerada con el
  documento, la sección y la página. Antes el asistente no podía citar una sección porque
  nadie se la decía, y tampoco se le pedía citar. Y si lo que se pregunta no está en los
  documentos indexados, lo dice en vez de completarlo de memoria — una cifra normativa sin
  fuente no se distingue de una inventada.
- **Las reglas que impiden al asistente inventarse cifras dependían de una pantalla de
  configuración.** En una instalación recién hecha la fila no existía y el asistente
  respondía sin ninguna regla: ni las de unidades, ni la de no dar cifras de impacto sin
  simular, ni el papel de especialista en hidráulica. Ahora van siempre, y lo que se
  escriba en Ajustes se añade a ellas en vez de sustituirlas: ese texto es para el papel y
  el tono, y que una cifra lleve su unidad no es una preferencia.
- **La calculadora rechazaba un diámetro de 300 mm.** Avisaba de que estaba «fuera del
  rango [0.01, 10]» — un rango en metros, que es la unidad interna, mientras el usuario
  tenía elegidos milímetros en el desplegable. Con pulgadas pasaba lo mismo. Ahora el rango
  se comprueba después de convertir la unidad, y el rótulo que va bajo cada campo lo dice
  en la unidad que está elegida: «10 – 10000 mm» con milímetros, «0.394 – 394 in» con
  pulgadas. Además, elegir pies por segundo o centímetros cuadrados no convertía nada y el
  valor entraba al cálculo como si ya estuviera en la unidad interna.
- **El desplegable de unidades desaparece donde no había nada que elegir.** En los
  parámetros adimensionales —el factor de fricción, el coeficiente de descarga— ofrecía una
  única opción, que era un guion.

## [1.30.0] - 2026-09-03

La curva de fragilidad enseña las tres clases de suelo a la vez.

- **La curva en aceleración salía casi igual que la de velocidad**, y hacía dudar de un
  cálculo que estaba bien. Con los topes que traía cada eje —100 cm/s y 1 g— y la clase de
  suelo que viene puesta, las dos curvas coincidían punto por punto con dos puntos
  porcentuales de diferencia: parecía que sólo se hubiera cambiado el rótulo del eje. No
  había ningún error en las cifras, que eran y son las mismas; era una coincidencia entre
  dos valores por defecto. El tope en aceleración pasa a 1,2 g, que cubre igual el rango
  normativo, y la coincidencia desaparece.
- **Las tres clases de suelo se dibujan juntas** cuando la curva se lee en aceleración, que
  es donde el suelo cambia el resultado: a 0,30 g, la probabilidad de que una tubería falle
  es del 68 % en roca, del 87 % en suelo firme y del 93 % en blando, con la misma red y el
  mismo material. Antes se dibujaba una clase a la vez, así que comparar exigía generar la
  curva tres veces y acordarse de los números. La clase elegida en el selector va en trazo
  grueso, porque es la que llevan la tabla por diámetros y el fichero exportado, que ahora
  trae una columna por clase de suelo.

## [1.29.0] - 2026-09-03

Boorie dice dónde acaba lo que sabe.

- **La aplicación avisaba de sus límites sólo en algunas pantallas.** La curva de fragilidad
  decía que necesita la validación de un experto, y el chat, la calculadora y las simulaciones no
  decían nada, aunque son las que pueden llevar a decidir dónde reforzar una red o cuánto
  presupuestar una reparación. Ahora hay un descargo de responsabilidad que se acepta una vez al
  empezar, y un aviso al pie de cada cifra: bajo cada respuesta de la inteligencia artificial
  —que puede equivocarse aunque parezca segura—, en los resultados de simulación, de calidad del
  agua y de escenario, y en la calculadora. El texto está revisado por el Dr. Luis E. Mora M. y
  puede consultarse entero en «Acerca de».
- **El aviso viaja dentro de lo que se exporta.** Un CSV, un informe o una conversación se
  reenvían por correo sin la aplicación alrededor, y nadie vuelve a la pantalla original a leer
  la advertencia.
- **Los ficheros exportados se llamaban como si fueran otra cosa.** El de la curva de fragilidad
  salía como `curva_fragilidad_PVC_Net3 2.inp.csv`, y en Windows —que oculta las extensiones
  conocidas— se leía `curva_fragilidad_PVC_Net3 2.inp`: un archivo que decía ser una red cuando
  era una tabla. Pasaba también con los indicadores de resiliencia y con el GeoJSON del visor.
  Ahora el nombre no arrastra la extensión de la red.

## [1.28.0] - 2026-09-02

La aplicación habla un solo idioma en cada pantalla, y el daño de un sismo se puede costear.

- **La interfaz mezclaba idiomas.** Cientos de textos estaban escritos a mano dentro del código,
  fuera del sistema de traducción, así que con la aplicación en inglés seguían apareciendo frases
  en castellano, y en catalán había erratas que sólo se ven leyendo. Ahora los tres idiomas están
  completos en ajustes, proyectos, calculadora, chat, visor de red y resiliencia. También lo que
  escribe el motor de cálculo: antes decidía el idioma quien lo llamaba, y ahora devuelve la clave
  y traduce quien la enseña.
- **El «Wisdom Center» se llama ahora «Base de Conocimiento»**, y «Base de Coneixement» en catalán.
  El nombre se quedaba en inglés en medio de frases en castellano.
- **La ventana abre maximizada**, y el botón de restaurar funciona. Abría a 1200x800 en pantallas
  mucho mayores, y el botón de restaurar no hacía nada: el icono se quedaba clavado sin reflejar
  el estado de la ventana.
- **El daño de un sismo se reparte por diámetro.** La curva de fragilidad daba una sola cifra, que
  servía para saber si la red es frágil pero no para presupuestar una reparación. Ahora hay una
  tabla con las tuberías y los kilómetros afectados de cada diámetro de la red, a la intensidad que
  se elija, y se exporta entera. No es la misma cifra a otra escala: dos diámetros pueden tener una
  tubería cada uno y dieciocho veces distinta longitud.
- **La curva se puede leer en aceleración del suelo (PGA)**, que es lo que dan las normativas de
  amenaza sísmica, y no sólo en velocidad. Se declara en pantalla la conversión empleada y su
  margen. Los depósitos y las bombas, que se rigen por aceleración y no por velocidad, tienen su
  propia curva con los coeficientes que aporte quien conozca su región.
- **Las medianas por material de la curva de fragilidad ya se pueden rastrear.** Eran valores
  genéricos sin fuente; ahora son las tablas publicadas de FEMA/HAZUS-MH (2003) y ALA (2001), y se
  elige cuál usar. Esto cambia cifras que ya se mostraban.
- **El tamaño de nudo no hacía nada en la vista de esquema.** Moverlo de 2 a 20 dibujaba siempre lo
  mismo; sólo funcionaba sobre el mapa. Van también el grosor de tramo y la opacidad, que estaban
  igual. Un depósito se sigue viendo más grande que un nudo de consumo: el control escala los
  tamaños, no los iguala.
- **Las pestañas del grafo de vectores aparecían pegadas** unas a otras, con el icono de cada una
  tocando el texto de la anterior.
- **Cuatro vulnerabilidades de dependencias**, dos de severidad alta, quedan corregidas.

## [1.27.0] - 2026-08-27

El caudal se lee en litros por segundo en toda la aplicación.

- **El panel de energía daba el caudal en metros cúbicos por segundo** mientras el visor y la
  comparación de simulaciones lo daban en litros por segundo. Una bomba de 824 l/s aparecía como
  «0.8242 m³/s», y había que contar decimales para reconocerla en la otra pantalla. Ahora dice
  «824,179 l/s».
- **La calculadora ofrece l/s por defecto** en los campos de caudal, y devuelve en l/s el resultado
  de la ecuación de continuidad y del flujo por orificio. No se pierde ninguna opción: metros
  cúbicos por segundo y galones por minuto siguen en el desplegable, y la conversión aparece como
  un paso más del cálculo, para poder comprobarla a mano.
- **El nivel de servicio por presión se enseña en porcentaje en los dos sitios donde aparece.**
  Salía como «98,1 %» en el panel de indicadores y como «0.9812» en el de análisis.

## [1.26.0] - 2026-08-27

Tres cifras que no decían qué eran, en tres pantallas distintas.

- **Los pasos de la calculadora ya dicen en qué unidad están.** El resultado final siempre llevaba
  su unidad, pero los pasos que lo justifican —que son donde se comprueba un cálculo— salían como
  números sueltos. Y la unidad no es la del resultado: en un golpe de ariete, el primer paso está
  en pascales, el segundo en bares y el tercero en metros. Donde la magnitud no tiene unidad, como
  una relación entre dos longitudes, no se inventa ninguna.
- **El resultado de la calculadora se muestra con cifras significativas** en vez de cuatro
  decimales fijos, que dejaban un caudal en metros cúbicos por segundo con dos cifras útiles.
- **La curva de fragilidad sísmica dice qué mide su eje vertical.** Iba de 0 a 1 sin explicar de
  qué; ahora rotula «Probabilidad de fallo (0–1)». El eje horizontal ya estaba bien.
- **Se retira la fila «Diameter» del panel de topología**, que salía siempre vacía porque leía un
  dato que el análisis no calcula. Además el nombre confundía: en una red de agua se lee como
  diámetro de tubería, cuando se refería a una medida del grafo.
- **El botón «Calculate» de la calculadora ya no flota sobre los campos.** Se quedaba pegado al
  borde inferior de la ventana y tapaba el último parámetro mientras se rellenaba, sobre todo en
  las fórmulas con varios: pérdida de carga y bombeo. Ahora está debajo del último campo.

## [1.25.0] - 2026-08-27

Las cifras de la comparación de simulaciones estaban mil veces por debajo de lo que decían.

- **Al comparar dos simulaciones, el caudal y la demanda salían mil veces más pequeños de lo que
  decía su unidad.** Se rotulaban en litros por segundo pero los números iban en metros cúbicos por
  segundo, así que una diferencia de 50 l/s se leía «0,05 l/s». Comparando la simulación normal de
  la red de ejemplo con la de una tubería cerrada, el caudal aparecía como 0,82 l/s cuando eran
  824,87. Es el mismo fallo que se corrigió en el visor en la 1.22.0, que aquí había quedado vivo.
- **Afectaba también a lo que el chat sabe de tus simulaciones**, porque esas cifras se guardan
  para que las pueda consultar. Y el propio resumen se contradecía: en un párrafo daba el caudal en
  metros cúbicos por segundo y en otro, sobre los mismos datos, en litros por segundo. Ahora todo
  el resumen habla en litros por segundo.

## [1.24.0] - 2026-08-27

La calidad del agua se simula de verdad. Si tienes simulaciones de calidad guardadas de antes,
míralas: sus cifras no salían de ninguna simulación.

- **La simulación de calidad del agua no simulaba nada.** Calculaba el modelo hidráulico y después
  rellenaba la calidad a mano: para la edad del agua, una recta de cero a la duración de la
  simulación, **la misma en todos los nudos**; para el trazador y la sustancia, ceros. Se enseñaba
  en la misma tarjeta que las cifras reales y con el mismo «Completed», y lo único que lo advertía
  era una nota al pie, en inglés. En la red de ejemplo Net3 daba una edad media de 83,9 horas,
  cuando la real es de 6,1. Ahora la resuelve el motor de EPANET, que es el que sabe hacerlo.
- **Si la calidad no se puede simular, se dice.** El motivo por el que se rellenaba a mano era un
  problema en macOS, pero el relleno se aplicaba en los tres sistemas. Ahora se intenta siempre y,
  cuando falla, la tarjeta explica por qué en lugar de enseñar un número. Las otras dos
  simulaciones del ciclo se guardan igual.
- **Se puede elegir qué seguir**: la edad del agua, un trazador desde el embalse o el depósito que
  elijas, o la sustancia que declare tu fichero. Antes sólo se podía la edad. La sustancia avisa
  cuando el fichero no declara ninguna, en vez de devolver cero en toda la red.
- **Las cifras llevan su unidad**: horas para la edad, por ciento para el trazador, mg/L para la
  sustancia. Antes la tarjeta decía «PARAMETER: AGE» y los números iban sin unidad.
- **Tus simulaciones de calidad anteriores siguen ahí, marcadas.** No se borra nada: en el
  historial de la red aparecen con la etiqueta «sin simular», para que dentro de seis meses se
  distingan de las buenas.
- La calidad usa además la misma duración y el mismo paso que el resto de la simulación. Antes iba
  siempre a 24 horas con paso de una hora, aunque hubieras pedido otra cosa.

## [1.23.1] - 2026-08-27

Corrección. No hay funciones nuevas ni cambios en la forma de usar la aplicación.

- **Después de parar la reproducción, el botón de reproducir no volvía a arrancarla.** Se pulsaba
  «stop», la barra de tiempo volvía al primer paso —correcto— y a partir de ahí «play» ya no hacía
  nada: había que volver a cargar la red para poder reproducir otra vez. Le pasaba lo mismo, aunque
  costaba más darse cuenta, después de ir al principio, ir al final o arrastrar la barra con el
  ratón: cualquier forma de mover el paso a mano dejaba la reproducción muerta.

## [1.23.0] - 2026-08-27

La curva de demanda del panel del visor, que decía cero y no decía en qué unidad.

- **La curva de demanda del sistema salía plana y pegada al eje.** Sumaba la demanda de todos los
  nudos de la simulación, y los depósitos y los embalses también la traen —en negativo, porque es
  lo que aportan—, así que se cancelaba con la de los nudos de consumo: en la red de ejemplo Net3
  la curva valía 0,0000000149 en vez de los 680 l/s que consume la red de verdad. De ahí que la
  escala vertical apareciera en notación exponencial. Ahora suma sólo los nudos de consumo y la
  curva va de 500 a 900 l/s, con la forma del consumo a lo largo del día.
- **Las dos gráficas dicen ahora en qué unidad están**, en el título y en el eje vertical: «Curva
  de Demanda (l/s)» y «Caudal de Bombas (l/s)». La unidad ya se había añadido en la versión
  anterior, pero al nombre de la serie, que es lo único que estas gráficas no enseñan.
- **El caudal de las bombas estaba sin convertir.** Se dibujaba en metros cúbicos por segundo tal
  como sale del motor, así que una bomba de 800 l/s aparecía como 0,8. Ahora va en l/s, como
  promete su rótulo.

## [1.22.0] - 2026-08-25

Repaso de las cifras que enseña la aplicación: las del escenario de denegación de servicio y las
de las etiquetas del visor. Cambia lo que se lee en pantalla, así que conviene mirarlo antes de dar
por buena una comparación con capturas anteriores.

- **El escenario de denegación de servicio enseñaba impactos en negativo.** «−118 habitantes
  afectados» no es una cifra que se pueda leer: nadie recupera un servicio que no había perdido.
  Salía de restar la simulación de referencia a la del evento, y esa resta puede quedar por debajo
  de cero sin que nada esté mal —un corte redistribuye presiones y hay nudos que acaban mejor que
  sin él—. Ahora ningún indicador de impacto baja de cero: habitantes, nudos, volumen sin servir,
  horas de corte, caída de presión y disponibilidad. Cuando se recorta, el panel lo dice, para que
  un cero no se confunda con una medida. La presión residual y el caudal siguen pudiendo ser
  negativos: ahí el signo es información, no un error de cuenta.
- **Los campos del escenario ya no aceptan valores negativos** —una duración de −4 h o un módulo de
  demanda negativo no describen nada que se pueda simular—, y avisan antes de lanzar la simulación
  en lugar de después de esperar un minuto.
- **Las cifras del visor llevan su unidad.** La etiqueta de un nudo decía `Demanda:
  0.001743182126532`, sin decir de qué. Ahora dice `Demanda: 1,74318 l/s`. Caudales y demandas se
  enseñan en litros por segundo y los diámetros en milímetros, que es como se proyecta una red.
- **La leyenda de colores mentía sobre el caudal.** Rotulaba «L/s» sobre valores en metros cúbicos
  por segundo, así que una red con 830 l/s de punta se leía «0.83». Le pasaba lo mismo al resumen
  de la simulación y a la gráfica de demanda total.
- **La demanda de un nudo no cambiaba con el control temporal.** Se enseñaba la del fichero, que es
  un valor fijo, mientras la presión de al lado sí seguía al paso. Con una simulación cargada, la
  demanda es ahora la de ese instante; sin ella, la etiqueta dice «Demanda base» para que no se
  confundan un dato del fichero y un resultado.
- **Importar una red no importaba nada.** Creaba un proyecto vacío y pedía abrirlo y volver a elegir
  el mismo fichero desde dentro. Ahora crea el proyecto, carga la red y la deja abierta en el visor.
  El botón se parte en dos, «Importar red (.inp)» e «Importar proyecto (.json)», que eran dos cosas
  distintas bajo el mismo rótulo.
- La unidad se escribe `l/s` en toda la aplicación, y el resumen del visor dice «Tuberías» en vez de
  «Enlaces» —y cuenta tuberías: antes sumaba también bombas y válvulas—.

## [1.21.1] - 2026-08-24

Correcciones. No hay funciones nuevas ni cambios en la forma de usar la aplicación.

- **Simular justo después de abrir una red guardada fallaba.** La red aparecía en pantalla al
  instante —sus datos salen de la base—, pero prepararla para simular tarda un poco más. En ese
  hueco la red parecía lista y, al pulsar «Simulate» en el visor, la aplicación decía que no había
  ningún fichero cargado. Ya espera lo que tenga que esperar. Y si preparar la red falla, ahora se
  dice: antes no había forma de saber que podías verla pero no simularla.
- **Mientras simulaba se dibujaban dos barras de progreso** en lugar de una.
- Corregidas las instrucciones de instalación de los README en castellano y catalán, que mandaban
  descargar la versión 1.15.0.

## [1.21.0] - 2026-08-24

Arreglos en el visor de redes. El cuadro con las cifras de un nudo o una tubería ya sigue al
control temporal, y el botón de simular del visor deja de parecer que no hace nada.

- **El cuadro de un elemento se quedaba con las cifras del momento del clic.** Al pinchar un nudo o
  una tubería aparecía su ficha —presión, caudal, velocidad—, pero mover el control temporal no la
  cambiaba: seguía enseñando el paso que hubiera cuando la abriste, así que las cifras podían no
  tener nada que ver con el instante que estabas mirando. Ahora se leen del paso vigente, tanto en
  el esquema como en el mapa. La ficha de una tubería en el mapa enseña además la velocidad, que ya
  se calculaba y no se mostraba.
- **El botón «Simulate» del visor calculaba y no se veía el resultado.** La simulación corría de
  verdad, pero lo que devolvía no llegaba a la barra de tiempo, ni a los colores de la red, ni al
  panel de resultados, así que no había forma de saber que había pasado algo. Ya llega. Y calcula la
  simulación completa en el tiempo, no sólo el instante inicial: eso último nunca había funcionado
  por ese camino, aunque se pidiera.
- **Se retira el botón de cargar un fichero `.inp` de la cabecera del visor.** Estaba junto a la red
  que ya se está viendo y sólo llevaba a confusión. Cuando no hay ninguna red cargada, el visor
  sigue ofreciendo cargarla en el centro, como hasta ahora.
- Corregido de paso un consumo de memoria del mapa: cada vez que cambiabas de paso o tocabas los
  ajustes de dibujo, el mapa acumulaba una copia más de sus detectores de clic, sin límite.

## [1.20.2] - 2026-08-21

Arreglos de empaquetado. En Linux, la aplicación ya puede abrir su base de datos.

- **En Linux la aplicación abría sin base de datos**: no aparecían los proyectos, ni las redes, ni
  las conversaciones. El paquete elegía un componente compilado para Alpine, que no se puede cargar
  en Ubuntu, Debian, Fedora ni ninguna otra distribución habitual, y la aplicación no llegaba a
  conectar. Ahora elige el que corresponde a tu sistema y lo comprueba antes de usarlo. Si venías
  usando el AppImage y no veías tus datos, no se habían perdido: nunca se llegó a abrir el fichero.
- **El instalador ya no lleva bases de datos dentro.** Hasta ahora viajaba una base ajena de
  pruebas, con proveedores de IA configurados dentro, y quien generaba el instalador desde el código
  metía además la suya propia con sus proyectos. Se empaqueta sólo la definición de las tablas; cada
  instalación crea la suya al arrancar, como ya venía haciendo.

## [1.20.1] - 2026-08-21

Mantenimiento de seguridad. No cambia nada de lo que ves: no hay funciones nuevas ni cambios de
comportamiento.

- **Se actualizan las dependencias con vulnerabilidades conocidas: 23 a cero**, dos de ellas
  críticas. Entre lo que sube, Electron pasa a 42.9.3, que trae los parches de seguridad de
  Chromium que la aplicación usa para dibujar toda su interfaz.
- **Antes de publicarla se comprobó que la actualización automática desde la 1.20.0 sigue
  funcionando**, que las 464 comprobaciones automáticas siguen en verde y que la aplicación
  arranca, carga una red y simula igual que antes. Es la parte con riesgo real de una
  actualización así, porque también suben las herramientas que construyen el instalador.

## [1.20.0] - 2026-08-21

Ahora puedes decirle a Boorie si una recomendación te sirve.

- **Cada medida de eficiencia energética se puede marcar como útil o como incorrecta**, tanto en
  el panel como en el chat. Si la marcas como incorrecta puedes explicar por qué, y esa
  explicación es lo más valioso que se guarda: la cifra la pone la simulación, pero *por qué* una
  medida no vale en tu red sólo lo sabes tú.
- **Lo que valoras queda guardado con la simulación que respaldó la cifra**, así que la valoración
  se puede volver a leer entera: qué se recomendó, cuánto ahorraba, sobre qué ejecución, y qué
  dijiste tú. Al volver al panel, las medidas ya valoradas aparecen marcadas en vez de
  preguntártelo otra vez.
- **Cambiar de opinión sustituye la valoración anterior** en lugar de acumular otra.

## [1.19.0] - 2026-08-21

Boorie ya te recomienda cómo gastar menos en bombeo, y cada cifra viene de una simulación.

- **Pregúntale «¿cómo puedo reducir el consumo energético del bombeo?»** y te propone medidas
  concretas. Antes de darte una cifra las simula una por una sobre tu red, así que lo que ves es
  lo que ahorra de verdad, no una estimación. En la red de pruebas: *sacar la bomba 335 de la hora
  punta ahorra 77,4 kWh y 19,49 USD al día, sin dejar a nadie sin agua*.
- **Cada ahorro cita la simulación que lo respalda**, que queda guardada en el historial del
  proyecto: si una cifra no te cuadra, puedes ir a verla.
- **También te dice lo que cuesta tener una bomba fuera de su punto óptimo.** No es una
  estimación: se simula la misma red con esa bomba trabajando en el mejor punto de su curva y se
  resta. En la red de pruebas son 155,9 kWh al día, un 46%. Va marcado como «requiere cambiar
  equipo», para que no se confunda con mover un horario.
- **Las medidas que no funcionan también se muestran**, con su cifra. Parar el bombeo en las horas
  caras suena bien y en algunas redes consume más, porque los depósitos se vacían y hay que
  recuperarlos después. Es mejor saberlo que creerse un ahorro que no existe.
- **Corregido un fallo que afectaba a los escenarios de la versión anterior**: en una red cuyos
  automatismos gobiernan el bombeo, parar una bomba no llegaba a surtir efecto —el propio control
  la volvía a arrancar— y el escenario decía que no pasaba nada. Si simulaste un paro de bomba con
  la v1.18.0 y te salió sin impacto, vuelve a lanzarlo.
- **Nada se simula sin tu confirmación**, aquí también: cada medida son dos simulaciones y en un
  equipo sin tarjeta gráfica dedicada eso lleva su tiempo, así que se te avisa antes.

## [1.18.0] - 2026-08-21

Escenarios de interrupción del servicio, y el coste energético del bombeo.

- **Puedes plantear qué pasa si algo falla, y saber a cuánta gente deja sin agua.** Rotura de
  tubería, bomba fuera de servicio, pérdida del control de los automatismos, sobredemanda por un
  incendio o sequía en el origen: cinco tipos de evento que cubren las cuatro familias de causa
  —naturales, operativas, inducidas y de demanda— y que se pueden combinar en un mismo escenario.
- **Pregúntaselo al chat en lenguaje natural.** «¿Cuántos clientes quedan sin servicio si se pierde
  el control de las bombas 4 horas?» y Boorie te propone el escenario, te lo enseña entero y espera
  tu confirmación. **Nada se simula sin que le des el visto bueno.**
- **Las cifras salen de la simulación, no del modelo.** La respuesta cita la ejecución que la
  respalda y las cifras coinciden, al decimal, con ejecutar el motor a mano. Si algo no cuadra,
  puedes ir a esa simulación en el historial del proyecto.
- **El impacto se mide contra tu red sin el evento**, así que el déficit que ya arrastraba no se
  le atribuye al escenario: es lo que separa una cifra útil de una alarmante y falsa.
- **Ya sabes lo que te cuesta bombear.** Consumo y coste por bomba, horas en marcha, potencia, y el
  reparto entre horas punta y valle según la tarifa de tu proyecto, que se configura por proyecto
  porque el precio depende del país y de la hora.
- **Boorie te dice qué bomba trabaja fuera de su punto óptimo**, comparando con la curva de
  eficiencia que declara tu propio archivo. En la red de pruebas: tres bombas al 37,5% cuando su
  curva da 70%, con el caudal un 66,7% por debajo del óptimo.
- **Y puedes comprobar si una medida ahorra de verdad**: se simula la red con ella y se resta.
  Parar el bombeo en las horas caras ahorró 118,8 kWh y 33,80 USD en una red y **consumió 48,8 kWh
  más** en otra, porque los depósitos se vaciaban y había que recuperarlos. La medida se rechaza a
  sí misma, con su cifra, en vez de prometer un ahorro que no existe.
- Todo ahorro viene con lo que le cuesta al servicio: apagar el bombeo doce horas ahorra mucho y
  deja a la red sin agua.

## [1.17.1] - 2026-08-21

El chat vuelve a responder con lo que hay indexado, en vez de decir que no hay nada.

- **Si preguntabas por tus simulaciones y Boorie contestaba «no hay datos», ya está resuelto.**
  Buscar en el conocimiento del proyecto tardaba más de lo que el chat esperaba, así que la
  respuesta salía sin una sola fuente aunque estuvieran indexadas. Ahora la búsqueda tarda una
  sexta parte y el chat cita los documentos de los que saca cada dato.
- **La búsqueda del Wisdom Center ya no dice «no encontré información» cuando sí la encontró.**
  Cuando la redacción no termina a tiempo, lo dice tal cual y enumera las fuentes que localizó,
  para que puedas ir a ellas.
- **El «Max Results» del selector de conocimiento por fin hace algo.** Antes se movía y no
  cambiaba nada; ahora decide cuántos documentos se revisan, y viene en 3, que es lo que un
  equipo sin tarjeta gráfica dedicada revisa en un tiempo razonable.
- **La comprobación de seguridad sobre lo recuperado vuelve a funcionar.** Se quedaba siempre a
  medias por falta de tiempo —un minuto por consulta sin comprobar nada— y además rechazaba
  documentos que sí respondían a la pregunta. Ahora juzga en unos segundos y acierta.
- **Boorie espera lo que hace falta para responder**: hasta tres minutos por las fuentes y ocho
  para la respuesta completa, en lugar de cortar justo antes de tenerla.

## [1.17.0] - 2026-08-20

Boorie elige el modelo con el que te responde y deja de preguntártelo.

- **El desplegable de modelos desaparece del chat.** Las respuestas las escribe siempre el
  modelo que Boorie tiene fijado para ingeniería hidráulica, así que ya no puedes acabar
  preguntándole a uno sin validar sin saberlo: el desplegable ofrecía el catálogo entero de
  NVIDIA, con modelos que ni eran Nemotron.
- **Dos papeles, cada uno con su modelo.** Uno razona sobre lo que se recupera del conocimiento
  y redacta la respuesta; otro, más rápido, reformula tu pregunta y decide qué documentos
  sirven, que es la tarea que se repite por cada fragmento y donde se nota la espera.
- **Si el modelo principal no está disponible responde el auxiliar, y la respuesta lo dice**,
  en lugar de quedarse sin contestar sin explicar por qué.
- **Debajo de cada respuesta ya no aparece el nombre del modelo.** Sigue quedando registrado
  para diagnóstico, que es donde hace falta.
- **La primera instalación descarga 2,7 GB en vez de 24 GB.** El modelo que se descargaba antes
  no podía responder en un equipo sin tarjeta gráfica dedicada: medido, tardaba unos 45 minutos
  en una respuesta que ahora sale en dos y medio.
- Ajustes → IA sigue sirviendo para tus claves y para el catálogo de cada proveedor, y ahora
  avisa de que marcar modelos ahí no cambia quién responde en el chat.

## [1.16.0] - 2026-08-20

Cada proyecto puede tener sus propios umbrales.

- **Los ajustes de indexación de simulaciones se pueden fijar por proyecto**, no sólo para todo
  Boorie: en Ajustes → General eliges si estás tocando los generales o los del proyecto activo.
  Es útil cuando un proyecto se rige por una normativa distinta o está en una etapa de ajuste
  fino.
- **Un proyecto hereda hasta que lo tocas.** Mientras no cambies nada en su ámbito, sigue los
  ajustes generales: si mañana cambias la presión mínima para todos, ese proyecto también la
  cambia. En cuanto tocas algo, se queda con lo suyo y la pantalla te lo dice.
- **«Volver a heredar»** deshace esa separación y devuelve el proyecto a los ajustes generales.

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
