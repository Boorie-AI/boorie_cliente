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
node scripts/avisos-sin-traducir.mjs                # alert, confirm, setError…
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

Quedan dos que no tapa. El texto **mezclado con una expresión** en la misma
línea —`📊 Model: {provider.model}`, `{n} redes`—: para eso hay un segundo barrido,
`scripts/texto-mezclado.mjs`, escrito en la fase 2: busca marcas de castellano
en plantillas y expresiones. Encontró 83 en `src/`, entre ellas todo el visor
—las capas, la leyenda, el reloj— que el inventario daba por limpio.

Y el texto que se pasa **a una llamada** —`alert('…')`, `showNotification('…')`,
`setError('…')`—, que no está en el JSX en absoluto: ése lo busca
`scripts/avisos-sin-traducir.mjs`, escrito en la fase 3 al encontrar una barra
de pie entera en inglés en el Wisdom Center.

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
| Fin de la fase 3 | 0 | 18 | 42 de 64 |
| Tanda del motor | 0 | 18 | 42 de 64 |
| Al cerrar el #96 | **0** | 21 | 42 de 64 |

La fase 3 no mueve esas cifras: no saca texto del código, revisa el que ya está
en el diccionario. Lo que sí cambió: **1.024 claves** en los tres idiomas, 32
avisos que no veía ningún script y una regla de estilo por idioma.

Las tres cifras se miden con el script de hoy, que ve más que el del principio
—por eso el «total» sube y baja: no es que aparezca texto, es que se mira mejor—.

El total sube de 18 a 21 en la última fila y **no es una regresión**: son tres
nombres que entraron con la curva de fragilidad y que no deben traducirse, ver
más abajo.

### Por qué se cierra con 21 y no con 0

Las 21 que quedan se repasaron una por una, y ninguna es una cadena que deba
pasar por el diccionario:

| Dónde | Cuántas | Qué son |
|---|---:|---|
| `settings/AIConfigurationPanel.tsx` | 6 | Nombres de modelos de Ollama: `llama3.1:8b`, `mistral:latest`… |
| `settings/GuardrailsPanel.tsx` | 6 | `NVIDIA NeMo Guardrails`, `NVIDIA API Catalog`, `Ollama (local)`, `Rails`… |
| `hydraulic/WNTRMainInterface.tsx` | 3 | `ALA (2001)`, `FEMA/HAZUS-MH (2003)`, `PGA (g)`: nombres de norma y siglas de magnitud |
| `settings/SettingsPanel.tsx` | 2 | `Guardrails` y `Milvus Inspector`, nombres de producto |
| `setup/SetupWizard.tsx` | 2 | `Add python.exe to PATH`, que es la casilla literal del instalador de Windows, y un enlace |
| `chat/Sidebar.tsx` | 1 | `Boorie` |
| `project/ProjectMismatchDialog.tsx` | 1 | Un falso positivo del medidor: un fragmento de código |

Traducir un nombre propio lo rompe: quien busca `llama3.1:8b` en su Ollama no
encuentra «llama 3.1 de 8 mil millones», y una norma citada con otro nombre deja
de ser rastreable. Así que **el número al que hay que llegar no es cero**, y el
medidor no lo puede saber por sí solo: hace falta leer la lista.

Lo que sí queda fuera de la interfaz, y es un problema distinto con decisión
propia, son las descripciones que **se guardan en la base de datos** —«Red
hidráulica importada desde …», «Escenario derivado de …»—. Se escriben en el
idioma del momento y ahí se quedan, como cualquier dato que escribe quien usa
Boorie; cambiar de idioma no reescribe lo ya guardado. La sección «Un caso que
no es de componentes» explica el criterio.

Pantallas convertidas: crear proyecto, cabecera del chat y calculadora (primera
tanda); visor de red y mapa (segunda); Base de Conocimiento (entonces «Wisdom Center»), grafo de vectores, chat
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

## Fase 3: el catalán

El catalán se escribió de una vez, clave a clave, mientras se traducía a los
otros dos idiomas. Esta fase es la primera vez que se lee entero.

### Una regla de estilo por idioma

- **Catalán: los botones en imperativo.** Es la norma del idioma en interfaces
  —«Desa», «Cancel·la», «Afegeix»—, y el diccionario heredado iba en infinitivo
  mientras el nuevo iba en imperativo. Se unificaron 49 rótulos.
- **Catalán: el progreso, con «s’està».** «Carregant…» a secas es un calco; la
  forma del idioma es «S’està carregant…». 32 mensajes.
- **Los tres: minúscula salvo nombres propios.** Ya se había hecho en inglés en
  la fase 2; faltaban 24 en castellano y 20 en catalán.
- **Comillas y apóstrofos.** «» en castellano y catalán, “” en inglés; el
  apóstrofo tipográfico —d’Ollama, l’aigua, don’t— en los tres, que el catalán
  mezclaba con el recto en 54 valores.

### Erratas que sólo salen leyendo

- `ai.ollamaDesc` decía «Gestiona els teus models d’IA locals **with** Ollama».
- `ai.addCustomModel` decía «Afegir Model **Personalitat**» por «personalitzat».
- «Prova de connexió **exitosa**» es un calco; en catalán, «La prova de connexió
  ha anat bé».
- «Token expirat - **si us plau** reconnectar» era un calco doble, del inglés y
  del castellano a la vez.
- El nudo se llamaba «nus» en toda la aplicación menos en dos sitios, donde era
  «node»; y «buscar» convivía con «cercar».
- Una sigla inventada: APyS es castellana, y en catalán se había traducido como
  «APiS», que no la usa nadie. Se dice entera.

### El tercer barrido

Abrir el Wisdom Center en catalán enseñó una barra de pie entera en inglés que
ningún script veía: los avisos que se dan **desde una llamada** —`alert`,
`confirm`, `showNotification`, `setError`— no están entre `>` y `<`, ni son
atributos, ni son texto pegado a una expresión en el JSX. De ahí sale
`scripts/avisos-sin-traducir.mjs`, el tercero: encontró **32**, casi todos en
inglés, incluidos los de borrar documentos y los de Ollama.

Son tres barridos porque son tres sitios distintos donde se esconde el texto:
entre etiquetas, pegado a una expresión, y dentro de una llamada.

## La tanda del motor

Lo que quedaba fuera de las tres fases: el texto que no escribe la interfaz sino
**el motor** —la calculadora en Python, su respaldo en TypeScript, el
recomendador de energía, el servicio energético y el de escenarios— y las dos
narraciones que el chat escribe con esas piezas.

### La decisión: el motor nombra, la interfaz dice

Un motor que devuelve frases decide el idioma de quien lo llame, y aquí lo
llaman tres idiomas. Así que ya no devuelve frases:

```python
warnings.append(aviso('lowVelocitySediment'))
recommendations.append(aviso('motorSize', kw=f'{motor_size:.1f}'))
```

```json
{ "nameKey": "calc.formula.darcyWeisbach",
  "warnings": [{ "clave": "calc.msg.lowVelocitySediment" }] }
```

Quien lo enseña traduce. Para lo que enumera —una recomendación que habla de
varias bombas— el texto lleva `listas`, trozos que también son claves;
`src/services/hydraulic/textoDelMotor.ts` los resuelve y los pega, y lo usan
igual el panel, la narración y las pruebas.

**El compilador hace de guardia.** Los campos cambiaron de nombre —`name` a
`nameKey`, `description` a `descriptionKey`— en vez de quedarse con el mismo
nombre y otro contenido. TypeScript señaló los doce sitios que había que
cambiar; con el nombre intacto habría habido que encontrarlos a mano.

### Qué se movió

| Dónde | Qué |
|---|---|
| `hydraulicCalculator.py` | 7 fórmulas, 17 parámetros, 19 pasos, 23 avisos |
| `calculationEngine.ts` (respaldo) | 6 fórmulas, 21 parámetros, 12 pasos, 10 avisos |
| `HydraulicCalculator.tsx` | las 5 categorías, que estaban en el componente |
| `recomendacionesEnergia.ts` | título y motivo de las dos clases de medida |
| `wntr_energy_service.py` | procedencia de la eficiencia, errores, omitidos |
| `wntr_resilience_service.py` | los 7 motivos por los que se omite un elemento |
| `narrarEnergia.ts`, `narrarEscenario.ts` | las dos narraciones del chat, enteras |

En total, 125 claves nuevas del motor de cálculo y 45 de las narraciones.

### Lo que se guarda sigue siendo texto

La narración que el chat escribe es un mensaje: se guarda como texto, en el
idioma del momento. Lo mismo el título de una medida cuando se valora, que va al
dataset de feedback. Es la regla de la fase 2, y aquí no cambia: **lo que se
guarda queda en el idioma en que se escribió**.

Lo que sí mejora: un resultado de cálculo guardado lleva claves, así que se
vuelve a leer en el idioma de quien lo abre.

### Las pruebas comprueban la frase, no la clave

`recomendacionesEnergia.test.ts` seguía esperando «18,3 kWh» dentro del motivo.
Ahora resuelve la clave contra el diccionario de verdad y comprueba lo mismo: si
la clave y el diccionario dejan de casar, la prueba lo dice.

### Lo que sigue fuera

Nada de la interfaz. Queda el inglés interno del motor que no ve nadie —los
errores de validación, que ahora se identifican por el símbolo del parámetro
(`Missing required parameter: V`) en vez de por un nombre traducible—.
