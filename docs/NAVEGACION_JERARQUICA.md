# Navegación jerárquica con Proyectos como raíz

Diseño y decisiones del issue [#35](https://github.com/Boorie-AI/boorie_cliente/issues/35).
Continúa [`PROYECTO_ACTIVO_GLOBAL.md`](PROYECTO_ACTIVO_GLOBAL.md) (#31) y
[`PRECONDICIONES_NAVEGACION.md`](PRECONDICIONES_NAVEGACION.md) (#33).

## El problema

El menú era una lista plana de seis elementos declarada dentro del propio
componente: Chat → Proyectos → Calculadora → Red WNTR → Wisdom Center →
Configuración. Nada decía qué pertenecía al proyecto y qué era global, así que
«Red WNTR» —que sin proyecto no lleva a ninguna parte— estaba al mismo nivel que
«Configuración».

Además, la vista del Wisdom Center se llamaba `rag` en el enrutado mientras la
etiqueta visible decía «Wisdom Center», y la vista por defecto era `chat`.

## La jerarquía

```
PROYECTOS            ← raíz de la navegación y vista por defecto
  └─ [proyecto activo]
       ├─ Red WNTR
       ├─ Simulaciones
       └─ Chat del proyecto
HERRAMIENTAS
  ├─ Calculadora     ← independiente del proyecto
  └─ Chat general
SISTEMA
  ├─ Wisdom Center
  └─ Configuración
```

Los tres hijos sólo se pintan cuando hay proyecto activo; sin él, el bloque dice
«Sin proyecto activo». El nombre del proyecto encabeza sus hijos, así que es
visible desde cualquier vista sin abrir nada.

| Pieza | Fichero |
|---|---|
| Modelo de navegación (módulo puro) | `src/config/navegacion.ts` |
| Menú | `src/components/chat/Sidebar.tsx` |
| Vista, ámbito del chat y sección de red | `src/stores/appStore.ts` |
| Raíz de proyectos | `src/components/hydraulic/HydraulicProjectsPanel.tsx` |
| Corrección de la vista al arrancar | `src/App.tsx` |

## Decisiones

**La raíz enseña siempre la lista de proyectos.** `HydraulicProjectsPanel` era un
envoltorio de `WNTRMainInterface`, es decir, exactamente el mismo componente que
«Red WNTR». Con un proyecto abierto, las dos entradas mostraban lo mismo y la
lista de proyectos sólo se alcanzaba cerrando antes el proyecto desde un botón
dentro de la vista de red. Ahora `WNTRMainInterface` recibe `modo`: en
`'proyectos'` enseña siempre la lista —con el activo marcado— y en `'red'` sigue
siendo la vista de trabajo de siempre. Elegir un proyecto en la lista no navega a
ninguna parte: lo que cambia es el menú, que despliega sus hijos.

**«Simulaciones» no es una vista nueva.** No hay pantalla de histórico de
simulaciones, y fabricarla no es reorganizar un menú (eso está en #38 y #41). El
ítem entra en la vista de red pidiendo su pestaña de simulación, mediante
`seccionRed` en el store. Es el único ítem que exige red además de proyecto: la
vista de red no la exige a propósito, porque es donde se importa el `.inp` (#33).

**Los dos chats son la misma pantalla con distinto ámbito.** El chat general debe
existir —criterio del Ing. Luis Mora recogido en el issue: Boorie también se usa
como apoyo docente— y el del proyecto también, para interpretar la red y los
resultados. No hacen falta dos vistas: `ambitoChat` decide qué conversaciones
lista el menú y a qué proyecto queda atada la que se cree. En el chat general
sólo se ven las conversaciones sin proyecto y el selector de proyecto no aparece;
en el del proyecto, las del proyecto activo.

**El árbol de proyectos del menú desaparece.** Listaba las conversaciones de
todos los proyectos, que tras #31 es un atajo para trabajar fuera del proyecto
activo. Para ver las de otro proyecto se cambia de proyecto.

**Sin proyecto se arranca en Proyectos, pero no se pierde la vista guardada.** El
issue pide las dos cosas: abrir en Proyectos sin proyecto activo y respetar la
última vista de quien ya usaba la aplicación. `ajustarVistaInicial` sólo
interviene cuando la vista restaurada tiene una precondición sin cumplir, y no
persiste el cambio: con proyecto, la próxima sesión vuelve a abrir donde se
quedó. La comprobación vive en `App.tsx` porque hasta que no terminan la carga de
ajustes y la restauración del proyecto no se sabe si hay uno.

**`rag` pasa a llamarse `wisdom`.** `migrarVista()` traduce el valor guardado por
los usuarios que dejaron la aplicación en el Wisdom Center; sin eso arrancarían
en la vista por defecto sin explicación, porque su valor ya no existiría.

**`hayRed` era papel mojado.** Lo declaraba #33 pero ninguna vista lo usaba, y
`hydraulic:get-project` no devolvía el contador: `currentProject.networkCount`
llegaba siempre `undefined`. Se vio en cuanto «Simulaciones» empezó a usarlo —
aparecía bloqueada con la red guardada delante—. El handler cuenta ahora las
redes activas, con el mismo filtro `isActive` que la lista de proyectos, porque
`deleteNetwork()` es un borrado lógico.

## Fuera de alcance

**Wisdom del proyecto.** La jerarquía del issue lo lista, pero separar el ámbito
general del de proyecto en el Wisdom Center es el issue #39. Mientras tanto el
Wisdom Center es global y vive en el bloque de sistema, que es lo que hoy es
verdad.

## Comprobado en la aplicación

Ciclo completo con la base real: arranque con la vista guardada en `wntr` y sin
proyecto activo → abre en Proyectos, con «Sin proyecto activo» y sin hijos;
elegir un proyecto en la lista → tarjeta marcada «Activo» y los tres hijos
aparecen bajo su nombre; «Simulaciones» → vista de red con la pestaña de
simulación activa (verificado por `data-state` de las pestañas); «Chat del
proyecto» → el menú lista sus conversaciones y la nueva queda atada al proyecto;
«Chat general» → sólo las conversaciones sin proyecto.
