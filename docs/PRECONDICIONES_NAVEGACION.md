# Precondiciones de navegación y estados vacíos accionables

Diseño y decisiones de la funcionalidad pedida en el [issue #33](https://github.com/Boorie-AI/boorie_cliente/issues/33), punto 4 del informe de apreciaciones.

## El problema, corregido tras verlo en la aplicación

El issue describe «vistas en blanco sin explicación». Ejecutando la aplicación con el proyecto activo vacío, eso **no ocurre**: la vista de red ya enseñaba el selector de proyectos, y el Wisdom Center, la calculadora y el chat funcionan sin proyecto. Buena parte de lo que el issue daba por roto lo arregló #31.

Lo que sí falla es otra cosa, y no es «vacío» sino **sustitución silenciosa**: pulsas «Red WNTR», el menú marca esa vista como activa, y el contenido es la lista de proyectos —idéntica a la de «Proyectos»— sin una palabra sobre por qué. El usuario no sabe si se ha equivocado, si la aplicación ha fallado, o qué le falta.

A eso se suma que el menú no señalizaba nada en absoluto, y que el recorrido de primer uso terminaba en la calculadora sin llegar nunca a crear un proyecto ni cargar una red.

## Lo que se construye

| Pieza | Fichero |
|---|---|
| Tabla de precondiciones | `src/config/precondiciones.ts` |
| Estado que la alimenta | `src/hooks/usePrecondiciones.ts` |
| Aviso con la acción que lo resuelve | `src/components/PrecondicionAviso.tsx` |
| Señalización en el menú | `src/components/chat/Sidebar.tsx` |
| Recorrido de primer uso | `src/config/onboardingPasos.tsx` |

## Decisiones

### 1. Entrar en la vista de red no exige red cargada

La tabla del issue pide «proyecto **y** red cargada» para la red WNTR. A nivel de navegación sólo se exige el proyecto: **la vista de red es justamente donde se importa el `.inp`**, así que pedir una red para entrar dejaría el módulo inalcanzable para siempre.

La red sigue siendo requisito de las acciones de dentro —simular, analizar, esqueletizar—, que ya tienen su propio estado vacío con el botón de importar. El requisito `red` se mantiene en el modelo porque el chat sobre la red ([#34](https://github.com/Boorie-AI/boorie_cliente/issues/34)) lo necesitará.

### 2. El ítem del menú se atenúa, pero se puede pulsar

El issue pide atenuar y no ocultar, para no perder descubribilidad. Se añade además que **siga siendo accionable**: bloquearlo dejaría al usuario viendo un candado sin ninguna forma de llegar a la pantalla que le explica qué falta y se lo resuelve.

El primer intento marcaba el botón con `aria-disabled="true"`. Es falso —el control sí se activa— y tiene consecuencias reales: le dice a un lector de pantalla que no se puede usar, y Playwright se niega a pulsarlo. Se sustituyó por `title` y `aria-label` con el motivo.

### 3. El aviso va encima del contenido, no en su lugar

Cuando falta el proyecto, la vista de red ya enseña el selector de proyectos, que es **exactamente la acción correcta**. Sustituirlo por una pantalla de «necesitas un proyecto» con un botón que lleva a otra pantalla añadiría un clic sin aportar nada.

Así que el aviso se muestra como una banda encima: dice qué falta, por qué, y ofrece el botón. Lo que faltaba era la explicación, no la acción.

### 4. La calculadora se queda sin requisitos

Explícito en el issue, criterio del Ing. Luis Mora: hoy funciona de forma autónoma y es útil así; exigir proyecto añadiría fricción a un uso legítimo. Hay un test que lo fija, para que no se «arregle» por simetría con el resto de la tabla.

### 5. El recorrido de primer uso termina en la red

Los pasos eran bienvenida → IA → RAG → proyectos → calculadora, y dejaban al usuario nuevo sin proyecto ni red: justo lo que el resto de la aplicación necesita. Se añade un paso final que conduce a crear proyecto e importar el `.inp`.

## De dónde sale el estado

`hayProyecto` viene de `currentProjectId`, que es lo único que el store persiste y lo que ya usa la vista de red.

`hayRed` cuenta las redes **guardadas** en el proyecto. La red que el visor tiene abierta vive en un `useState` dentro de `WNTRMainInterface` y el menú no puede verla; cuando #34 necesite ese dato habrá que levantar el estado en lugar de deducirlo. Hoy ninguna vista se bloquea por este requisito, así que la aproximación no puede inducir a error al usuario.

## Deuda encontrada por el camino

- **Hay dos tipos `ProjectData` distintos con el mismo nombre**: uno en `src/types/project.ts` (`networks: NetworkAsset[]`, contadores) y otro local en `src/stores/projectStore.ts` (`network?: any`). `WNTRMainInterface` no usa ninguno de los dos directamente: deriva su propio view-model. Unificarlos es un trabajo aparte.
- **Los rótulos del menú estaban fijos en inglés** («Projects», «Calculator», «WNTR Network») mientras el resto usaba `t()`. Se traducen los tres, y un test nuevo comprueba que los tres idiomas mantienen exactamente las mismas claves: era fácil añadir una en español y dejar la interfaz enseñando `precondiciones.faltaProyecto` en catalán.
