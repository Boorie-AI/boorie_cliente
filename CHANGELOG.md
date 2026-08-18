# Changelog

Todas las versiones liberadas de Boorie Cliente. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el versionado es
[SemVer](https://semver.org/lang/es/).

La entrada superior debe coincidir con la versión de `package.json`. El proceso de
actualización está descrito en `docs/ACERCA_DE_HISTORIAL_VERSIONES.md`.

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
