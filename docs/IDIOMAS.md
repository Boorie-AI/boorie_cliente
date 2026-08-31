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
node scripts/inventario-idiomas.mjs               # el total y el reparto
node scripts/inventario-idiomas.mjs --lista Nombre  # las cadenas de un componente
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

Quedan dos que no tapa: el texto **mezclado con una expresión** en la misma
línea —`📊 Model: {provider.model}`— y las palabras inglesas que aún no conoce.
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
interfaz. Va en su propia tanda.

## Avance

Textos **en inglés**, que es lo que persigue la fase 1. La medida de partida se
tomó sobre `main` con la misma regla que las siguientes, para que la comparación
valga:

| | En inglés | Total fuera del diccionario | Componentes con i18n |
|---|---:|---:|---:|
| Punto de partida | 133 | 513 | 12 de 64 |
| Tras la primera tanda | 87 | 451 | 15 de 64 |
| Tras la segunda y la tercera | **0** | 363 | 29 de 64 |

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

### Lo que queda para las fases 2 y 3

Los 363 textos escritos a mano en castellano. Se ven bien hoy y rompen al
cambiar de idioma, que es justo lo que van a mirar las dos fases siguientes.
