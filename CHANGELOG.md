# Changelog

Todas las versiones liberadas de Boorie Cliente. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el versionado es
[SemVer](https://semver.org/lang/es/).

La entrada superior debe coincidir con la versión de `package.json`. El proceso de
actualización está descrito en `docs/ACERCA_DE_HISTORIAL_VERSIONES.md`.

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
