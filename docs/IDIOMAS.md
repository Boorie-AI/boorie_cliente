# Los idiomas de la interfaz

Cómo se corrige que la aplicación mezcle idiomas, y cómo se mide el avance
([#96](https://github.com/Boorie-AI/boorie_cliente/issues/96)).

## El estado del que se parte

Boorie declara tres idiomas —castellano, inglés y catalán—, tiene un selector
para cambiarlos y un diccionario con 283 claves bien alineadas en los tres
ficheros. El sistema funciona. Lo que pasa es que **la mayor parte de la interfaz
no lo usa**: el texto está escrito a mano dentro del componente, casi siempre en
inglés, y no cambia al cambiar de idioma.

Medido con `scripts/inventario-idiomas.mjs` antes de empezar:

```
textos escritos a mano, fuera del diccionario: 513
  de ellos, en inglés: 133   <- se ven mal hoy, en una aplicación que se usa en español
  el resto está en castellano: 380   <- se ve bien hoy y rompe al cambiar de idioma
componentes vivos: 64  ·  con i18n: 12
```

**Son dos problemas distintos y no tienen la misma urgencia**, y la primera
medida los mezclaba. Un texto en inglés se ve mal *ahora*, en una aplicación que
se usa en castellano; uno escrito a mano en castellano se ve bien hoy y sólo
rompe cuando alguien cambia de idioma. La fase 1 ataca los 133 primeros; los
otros caen con las fases 2 y 3, que es cuando su ausencia se nota.

Esa distinción salió al convertir la lista de proyectos: el inventario la
señalaba entera y resulta que ya estaba en español —«Mis Proyectos», «Activo»,
«Redes»—, sólo que sin tildes que la delataran.

Por eso en la misma pantalla conviven los dos idiomas: el panel izquierdo del
visor decía «Hydraulic Simulation» y «Duration (hours)» mientras el derecho decía
«Vista» y «Capas».

## Cómo se mide

```bash
node scripts/inventario-idiomas.mjs                 # el total y el reparto
node scripts/inventario-idiomas.mjs --todos         # el reparto entero, sin cortar
node scripts/inventario-idiomas.mjs --lista Nombre  # las cadenas de un componente
node scripts/texto-mezclado.mjs                     # texto pegado a expresiones
node scripts/claves-sin-usar.mjs                    # claves que ya no usa nadie
```

El script no es exacto y no pretende serlo: cuenta de más en palabras que son
iguales en los dos idiomas —«Total», «Boorie»— y de menos en texto construido por
trozos. Sirve para **comparar una medida con la siguiente**, que es lo que hace
falta cuando el trabajo va por tandas: si una tanda no baja la cifra, no ha
avanzado, sólo ha movido código.

Un componente que nadie importa no cuenta: no se le enseña a nadie.

### Lo que no ve, y cómo se ha ido enterando

Llegó a decir **cero en inglés** con el Wisdom Center lleno de inglés en
pantalla. Cada agujero apareció al abrir la aplicación, no al leer código, y
cada uno está tapado:

| Lo que se le escapaba | Ejemplo que lo delató |
|---|---|
| Un hook `useTranslation` **comentado** contaba como traducido | `UnifiedWisdomPanel` |
| Texto que no empieza por letra | «✅ Indexed», «(1 chunks)» |
| Frases de más de 80 caracteres | «To visualize EPANET networks on the map…» |
| Texto dentro de una expresión, como las dos ramas de un ternario | «General chat: this conversation is not linked to any project» |
| Palabras inglesas que no estaban en su lista | «Upload Folder», «All Categories», «My Documents» |

En la fase 2 aparecieron dos más, y también están tapados: un **párrafo
repartido en varias líneas** —el patrón se cortaba en el salto de línea— y las
**clases de Tailwind**, que al admitir saltos empezaron a colarse como si fueran
texto.

Queda uno que no tapa: el texto **mezclado con una expresión** en la misma línea
—`📊 Model: {provider.model}`, `{n} redes`—. Para eso hay un segundo barrido,
`scripts/texto-mezclado.mjs`, escrito en la fase 2: busca marcas de castellano
en plantillas y expresiones. Encontró 83 en `src/`, entre ellas todo el visor
—las capas, la leyenda, el reloj— que el inventario daba por limpio.

De ahí que el paso de abrir la pantalla no sea una formalidad: **es el que
encuentra**, y el recuento sólo sirve para ir detrás comprobando que baja.

## El orden: primero el español

Es el idioma en el que se usa la aplicación, así que es donde una mezcla molesta
de verdad. Las fases:

1. **Español.** Cada texto visible pasa al diccionario con su clave y el
   castellano queda revisado pantalla a pantalla.
2. **Inglés.** Repaso del inglés heredado, que en muchos sitios es de relleno.
3. **Catalán.** Repaso de lo escrito en la fase 1.

Dentro de la fase 1 se va por lo que más se ve: crear proyecto, pantalla de red,
calculadora, lista de proyectos, Wisdom Center, ajustes y chat.

## Las tres claves se crean a la vez, aunque la fase sea el español

Podría parecer que en la fase 1 basta con rellenar `es.json`. No: la prueba
`locales.test.ts` exige que los tres ficheros tengan **las mismas claves y
ninguna vacía**, y con razón —una clave que falta se enseña cruda en pantalla,
como `newProject.title`—. Así que al mover un texto se escriben los tres:

- **es**: la redacción buena, que es el objeto de esta fase.
- **en**: el texto inglés que ya existía en el código, que es justo lo que la fase
  2 va a repasar.
- **ca**: una primera versión, que repasa la fase 3.

De este modo el árbol nunca queda peor que antes en ningún idioma.

## Cómo se convierte una pantalla

1. `node scripts/inventario-idiomas.mjs --lista <Componente>` para ver qué hay.
2. Se añade un bloque de claves con el nombre de la pantalla —`newProject`,
   `wisdom`, `calculator`…— en los tres ficheros de idioma.
3. Se sustituye en el componente por `t('bloque.clave')`.
4. Se vuelve a medir: el componente debe desaparecer del reparto.
5. **Se abre la pantalla en la aplicación.** El recuento dice que el texto salió
   del código, no que se lea bien: sólo abriéndola se ve si una traducción queda
   larga, si rompe la caja o si quedó una clave sin resolver.

### Las listas de opciones no llevan el texto dentro

Un patrón que se repite: listas como los tipos de proyecto declaraban valor,
nombre y explicación juntos. Al traducir, la lista se queda **sólo con los
valores** y el texto sale del diccionario:

```tsx
const projectTypes = ['design', 'analysis', 'optimization', 'troubleshooting'] as const
…
{t(`newProject.types.${type}.label`)}
```

Así no hay dos sitios que mantener, y añadir un tipo obliga a traducirlo.

## Lo que no está en los componentes

La calculadora recibe **del motor de cálculo** los nombres de las fórmulas, la
descripción de cada parámetro y los avisos: 111 nombres y descripciones, y 33
avisos, escritos en inglés dentro del código de cálculo —en `hydraulicCalculator.py`
y en `calculationEngine.ts`—. Se muestran tal cual.

Eso no se arregla traduciendo componentes, y tiene su propia decisión: o el motor
devuelve claves en vez de texto y traduce quien lo enseña, o se traducen los
textos del motor y se pierde el idioma para quien lo llame desde fuera de la
interfaz. Va en su propia tanda, junto con las narraciones del chat, que
dependen del mismo motor.

## Avance

Textos **en inglés**, que es lo que persigue la fase 1. La medida de partida se
tomó sobre `main` con la misma regla que las siguientes, para que la comparación
valga:

| | En inglés | Total fuera del diccionario | Componentes con i18n |
|---|---:|---:|---:|
| Punto de partida | 133 | 513 | 12 de 64 |
| Tras la primera tanda | 87 | 451 | 15 de 64 |
| Fin de la fase 1 | **0** | 363 | 29 de 64 |
| Fin de la fase 2 | 0 | **18** | 42 de 64 |

Las tres cifras se miden con el script de hoy, que ve más que el del principio
—por eso el «total» sube y baja: no es que aparezca texto, es que se mira mejor—.

Pantallas convertidas: crear proyecto, cabecera del chat y calculadora (primera
tanda); visor de red y mapa (segunda); Wisdom Center, grafo de vectores, chat
completo —modelos, adjuntos, proyectos, Wisdom—, barra de ventana, diálogos y
las tres pestañas de ajustes que quedaban (tercera).

Comprobadas en la aplicación: proyectos, calculadora, chat general, Wisdom
Center, grafo de vectores, ajustes y visor de red sobre `Net3 2.inp`.

### Un caso que no es de componentes

El título de una conversación nueva se escribía en inglés desde
`chatStore.ts`. Ahora sale del diccionario con `i18n.t`, que fuera de React
funciona igual. Queda **guardado** en el idioma en que se creó, como cualquier
otro dato que escribe quien usa Boorie: cambiar de idioma no reescribe lo ya
guardado.

### Los plurales

«(1 fragmentos)» se leía mal. i18next elige la forma según el `count`, pero
para eso hacen falta las dos claves —`_one` y `_other`—; con una sola no hay
plural que valga. Están así los fragmentos indexados, el recuento de documentos
y el de nudos del grafo.

## Fase 2: el inglés

Tiene dos mitades, y la primera no parece de inglés: **los 363 textos escritos a
mano en castellano**. Mientras estén en el código, la aplicación en inglés
enseña castellano; arreglar el inglés empieza por sacarlos del código. La
segunda mitad sí es de redacción: repasar el inglés heredado.

### Los 18 que quedan, y por qué

Nombres propios y citas, que no se traducen: Boorie, Guardrails, Milvus
Inspector, NVIDIA NeMo Guardrails, Ollama, `Rails`, los identificadores de
modelo (`llama3.2:latest`) y las dos citas del instalador de Python
—`Add python.exe to PATH` y `python.org/downloads`—, que quien lee el aviso
tiene delante en inglés.

### Lo que se decidió por el camino

**Lo que se guarda queda en el idioma en que se escribió.** La descripción de un
proyecto importado, el nombre de un cálculo, la descripción de una red
esqueletizada: son datos del usuario, y cambiar de idioma no reescribe lo que ya
está guardado. Lo mismo que el título de una conversación.

**Los rótulos en inglés van en minúscula, salvo los nombres propios.** El
diccionario heredado mezclaba «Recent Chats» con «Saved networks». Se
normalizaron 68 valores de `en.json` a una sola forma; los nombres propios
—Boorie Client, Wisdom Center, Ollama, Google Workspace, RAG— conservan sus
mayúsculas. Y las comillas: «» en castellano y en catalán, “” en inglés.

**Las claves que no usa nadie se van.** `scripts/claves-sin-usar.mjs` recorre el
diccionario y el código; se quitaron 56 claves muertas —un bloque `rag` de una
pantalla que no existe, un `sidebar.email`, media docena que yo mismo había
duplicado al convertir el visor—. Una clave que nadie usa no se revisa y se
pudre; y el script deja el número a la vista.

**Las pruebas montan la interfaz de verdad.** `src/test/setup.ts` inicializa
i18next en castellano. Sin eso, `t('projects.myProjects')` devuelve la clave y
una prueba que busca «Importar red (.inp)» falla sin que nada esté roto.

### Lo que no entra en la fase 2

**El texto que genera el motor, no la interfaz.** Los nombres y descripciones de
las fórmulas de la calculadora (111 y 33 avisos) y las narraciones de energía y
de escenario que se escriben en el chat (`narrarEnergia.ts`,
`narrarEscenario.ts`). Comparten una misma decisión y por eso van juntos en su
propia tanda: la narración cita `candidata.titulo` y `candidata.motivo`, que
vienen del recomendador en el backend, así que traducir sólo el narrador dejaría
la frase a medias. O el motor devuelve claves, o se traduce el motor entero.

### Lo que queda para la fase 3

El catalán de todo lo escrito en las fases 1 y 2: unas 500 claves que se
redactaron de una vez y nadie ha leído en pantalla.
