# Batería de evaluación del RAG (#226)

Mide si las respuestas del chat sobre un documento adjunto contienen las cifras,
tablas y fórmulas que el documento da, con el modelo local o con NVIDIA. Sirve
para comparar modelos con un número y no a ojo.

Se lanza a mano. **Nunca en el CI**: gasta crédito de la API y necesita el libro,
que no está en el repositorio ni puede estar.

## Ejecutarla

```bash
# El libro de Walton, desde donde esté en tu equipo
export BOORIE_EVAL_DOC_WALTON="$HOME/Descargas/1.14 Groundwater Pumping Tests (William C. Walton_8702.pdf"

# Modelo local (Ollama levantado en localhost:11434)
npm run eval:rag -- --modelo qwen2.5:7b --repeticiones 3

# NVIDIA: la clave sólo en el entorno de esa orden; «nvidia» es el principal de la pareja
NVIDIA_API_KEY=… npm run eval:rag -- --modelo nvidia --repeticiones 3

# Varios modelos en un mismo informe, o sólo algunos casos
npm run eval:rag -- --modelo qwen2.5:7b,nemotron-mini --casos walton-tabla-2-1,walton-ejemplo-4-1
```

| Opción | Qué hace |
|---|---|
| `--modelo a,b` | Modelos a medir. Sin `/` es de Ollama; con `/` (`nvidia/…`) es de NVIDIA. `nvidia` es el principal de `PAREJAS.nvidia`. |
| `--repeticiones N` | Veces que se pregunta cada caso. La variación entre ejecuciones es parte de lo que se mide; para comparar, 3. |
| `--casos a,b` | Sólo esos casos. |
| `--documento clave=ruta` | Ruta de un documento; manda sobre la variable `BOORIE_EVAL_DOC_<CLAVE>`. |
| `--salida carpeta` | Dónde se escribe el informe. Por defecto `.eval-rag/`, que git ignora. |
| `--comprobar-casos` | Sin modelo: comprueba que la fuente de cada hecho está en el documento. |
| `--repuntuar informe.json` | Sin modelo: vuelve a puntuar un informe con los casos de ahora. Al corregir una referencia no hace falta volver a preguntar ni gastar crédito; deja `…-repuntuado.md`. |

Sin la clave, sin el documento o sin el modelo en Ollama, el caso sale como
**no ejecutado**, con el motivo, y no cuenta como fallo.

### Antes de lanzarla en el portátil

- `free -h`: qwen2.5:7b con 8192 de contexto ocupa unos 5,5 GB. Con la app
  abierta al lado no cabe: systemd-oomd cierra la sesión entera.
- No lances `npm test` a la vez.
- Si la cortas con Ctrl+C, el informe se queda con lo hecho hasta el último
  caso, y las peticiones a Ollama se cancelan.
- La primera vez vectoriza el libro (unos 2 minutos); los vectores se guardan
  en `.eval-rag/vectores/` y las siguientes corridas no lo repiten.

## Qué recorre

La misma ruta que el chat, sacada de la tienda a `src/services/chat/rutaDelChat.ts`:

1. El adjunto se lee con `extraerTextoDeFichero`, el mismo código que usa la app.
2. `componerPeticion` elige qué fragmentos caben en el contexto del modelo, por
   palabras y por significado (embeddings de Ollama), y con Ollama pide además
   consultas en el idioma del documento. Antepone el contexto de «chat general»
   que la app pone siempre sin proyecto.
3. Se llama al modelo con los mismos parámetros que la app: Ollama en streaming
   con su `num_ctx`; NVIDIA en streaming, con 8192 tokens de salida,
   temperatura 0,2, límite por inactividad y continuación si corta por longitud
   (`backend/services/ai/respuestaOpenAICompat.ts`).
4. `posprocesarRespuesta` quita las páginas sin respaldo, marca las referencias
   que no están en lo leído y, en la nube, hace la revisión contra el documento.
   Se puntúa el texto sin el apartado de la revisión, que cita al documento.

**No consulta la base de conocimiento**: los casos son de documento adjunto, y
levantar Milvus con la colección de Luis junto a un modelo de 7B no cabe en el
portátil. Es como preguntar con el RAG apagado.

## Leer el informe

Cada corrida deja `.eval-rag/rag-<fecha>.md` y `.json`. El JSON guarda además
la respuesta completa de cada repetición, para leerla.

**Resumen por modelo**: casos ejecutados y no ejecutados, porcentaje de hechos
acertados sobre todas las repeticiones, fallos de recuperación y de redacción,
cuántas veces dijo algo prohibido, tiempo y tokens medios por pregunta.

**Por caso**: aciertos de cada repetición (`4/6, 2/6, 4/6`), qué parte de los
hechos dio lo mismo en todas (estabilidad), lo prohibido que dijo, el tiempo y
cuánto del adjunto leyó (`20/621 fragmentos, por significado`).

**Por hecho**, una columna por repetición:

| Letra | Significa |
|---|---|
| A | Lo dice, y estaba en lo que recibió el modelo. |
| A* | Lo dice sin haberlo recibido: de memoria. Acierta, pero no por el RAG. |
| R | No lo dice y **no estaba** en lo que recibió: fallo de búsqueda. Ningún modelo lo habría dicho con ese material. |
| D | No lo dice y **sí estaba**: fallo de redacción. Lo tenía delante y no lo usó, o lo contradijo. |

Muchas R apuntan a la selección de fragmentos o a la búsqueda; muchas D, al
modelo. Es la pregunta del #226: si NVIDIA convierte en A las D de qwen, el
problema era el modelo.

## Los casos

Están en `backend/services/hydraulic/ragEval/casos.ts`, y la regla con que se
puntúan en `bateria.ts`. Cada caso tiene:

- `pregunta`, tal como la escribiría el usuario, y `documento` (clave de `DOCUMENTOS`).
- `hechos`: lo que la respuesta tiene que contener, atómico. Cada hecho lleva
  - `enRespuesta`: comprobaciones de las que basta una (sinónimos, otra unidad,
    otra notación);
  - `enFuente`: comprobaciones que deben cumplirse **todas** en lo que leyó el
    modelo para que el hecho estuviera a su alcance;
  - `origen`: página, tabla o ecuación. Sin esto un número es una creencia;
  - `fueraDelDocumento`, si la referencia lo pide y el documento no lo trae.
- `prohibidos`: lo que no debe decir (una conversión mal hecha, una fórmula inventada).
- `revision`: quién redactó la referencia y si está revisada.

Una comprobación es `{ patron }` (expresión regular) o `{ cifra, tolerancia, unidad? }`.
La tolerancia es absoluta, en la unidad de la cifra; `unidad` es una expresión
que tiene que ir **justo detrás** del número, para que un «2» suelto —el de
«Q_2», por ejemplo— no valga por «2,0 s²/ft⁵». Las cifras se leen con coma o
punto decimal, y el LaTeX de las respuestas (`\text{ft}`, `\,`) se desenvuelve
antes de comparar. Todo se compara en minúsculas y con los espacios
normalizados: el texto del PDF parte las fórmulas («s_w = CQ²» llega como
«s w = cq 2»), así que `enFuente` se escribe contra ese texto.

### Añadir un caso

1. Escribe el caso en `casos.ts`, con la fuente de cada hecho en `origen`.
2. `npm run eval:rag -- --comprobar-casos`: cada `enFuente` tiene que estar en
   el documento entero. Si no, el caso daría siempre R por una expresión mal escrita.
3. `npx vitest run backend/services/hydraulic/ragEval`: que las expresiones compilen.
4. Pruébalo con una respuesta buena y una mala, y mira la tabla de hechos.

Los casos actuales son un **borrador para revisar con Luis**: diez sacados del
libro de Walton y la pregunta de Luis sobre la prueba a caudal variable, con los
números del informe que se le envió el 30 de septiembre.
