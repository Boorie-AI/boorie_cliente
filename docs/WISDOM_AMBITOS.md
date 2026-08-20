# Wisdom Center: ámbito general y ámbito de proyecto

Diseño y decisiones del issue [#39](https://github.com/Boorie-AI/boorie_cliente/issues/39).
Es prerrequisito de la indexación de simulaciones en el RAG
([#41](https://github.com/Boorie-AI/boorie_cliente/issues/41)) junto con
[`VERSIONADO_INMUTABLE.md`](VERSIONADO_INMUTABLE.md) (#38).

## El problema, y por qué es de confidencialidad

Todo el conocimiento vivía en un único espacio sin noción de proyecto: la
normativa general de Boorie y los documentos internos de un cliente, mezclados.
La búsqueda no filtraba por nada —el código lo decía literalmente:
`'hydraulic_knowledge', // Hardcoded for now`—.

El criterio de aceptación no es de comodidad:

> Un documento subido en el ámbito de un proyecto A no aparece en ninguna
> búsqueda del proyecto B, en ningún modo.

Equivocarse aquí significa enseñarle a un cliente los documentos de otro, y es un
error que no se nota hasta que ha ocurrido.

## Dónde se garantiza

La búsqueda semántica tiene dos capas, y la garantía está en la segunda:

```
consulta ─► almacén vectorial (Milvus)  ─► fragmentos candidatos
                                              │
                                              ▼
                                     consulta a la base ◄── AQUÍ se garantiza
                                              │
                                              ▼
                                          documentos
```

**El filtro del almacén vectorial es una optimización, no la garantía.** Milvus
falla en silencio —el propio servicio devuelve resultados vacíos cuando no puede
conectar, «fail-soft» a propósito—, puede ignorar una expresión de filtro o
devolver de más. Confiar en él para una regla de confidencialidad sería confiar en
el componente más frágil del sistema.

La base de datos es la autoridad sobre de quién es cada documento, y la búsqueda
tiene un único punto donde los materializa: una consulta `findMany` por los ids
que devolvió el vector. Filtrar ahí hace que un fragmento ajeno que se colara no
llegue nunca a convertirse en un documento que enseñar.

| Pieza | Fichero |
|---|---|
| Reglas de ámbito (módulo puro) | `backend/services/hydraulic/ambitos.ts` |
| Punto de control de la búsqueda | `backend/services/hydraulic/ragService.ts` |
| Listado y subida con ámbito | `electron/handlers/document.handler.ts` |
| Selector y origen visible | `src/components/wisdom/UnifiedWisdomPanel.tsx` |

## Decisiones

**El esquema de la colección de Milvus no se cambia, y con él no hay
reindexación.** El issue proponía añadir `projectId` y `versionId` a la colección
y planificar la reindexación del corpus, y lo calificaba como la parte pesada del
trabajo. No hace falta para cumplir los criterios: la garantía vive en la base, y
el corpus existente queda correctamente clasificado sin tocar un solo vector
—los tres documentos que había pasan a ámbito general, que es lo que son—. El
`projectId` sí viaja desde ahora en la metainformación de cada fragmento nuevo, así
que la optimización del filtro vectorial se podrá activar más adelante sin otra
migración.

El precio es recuperar algunos candidatos que después se descartan. Con 434
fragmentos es irrelevante; se piden más candidatos cuando hay ámbito de proyecto
para que el descarte no deje la lista corta.

**Se filtra por lo permitido, no por lo prohibido.** `duenosPermitidos` devuelve la
lista de dueños que pueden entrar. Si el ámbito o el proyecto llegan mal, el
resultado es ver de menos, nunca de más. Sin proyecto activo, cualquier ámbito se
resuelve como general: no se puede servir un documento de proyecto sin saber de
quién es.

**La herencia es de un solo sentido.** Un proyecto ve lo general —no debe perder
acceso a la normativa, criterio confirmado por el Ing. Luis Mora— y lo general
nunca ve lo de un proyecto. Con proyecto activo, el ámbito por defecto es «ambos».

**Subir al ámbito de un proyecto es una decisión explícita.** Un documento se sube
al proyecto sólo si el ámbito seleccionado es «Del proyecto»; en «General» y en
«Ambos» se sube como general. Que un documento interno acabe siendo visible para
todos no puede ser el resultado de no haber tocado un desplegable.

**El listado obedece al mismo ámbito que la búsqueda.** Si un documento de otro
proyecto no puede salir en una consulta, tampoco puede salir en la lista.

## Un fallo que sólo apareció al probarlo contra la base

Los 11 tests del módulo pasaban y la primera prueba real falló:

```
Argument `in`: Invalid value provided. Expected Null, provided (Null)
```

**Prisma no acepta `null` dentro de un `in`.** El filtro «general o de este
proyecto» se había escrito como `projectId: { in: [null, projectId] }`, que es
inválido — y como el ámbito general es el valor por defecto, habría roto el caso
más común del Wisdom Center en cuanto se abriera. El nulo se expresa aparte:

```ts
{ OR: [{ projectId: null }, { projectId: { in: proyectos } }] }
```

La regla vive ahora en `filtroPrisma`, con su prueba y el motivo escrito al lado
para que nadie la «simplifique» de vuelta.

## La actualización de una instalación ya empaquetada

`ensureProductionSchema` crea las tablas con `CREATE TABLE IF NOT EXISTS`, que en
una instalación que actualiza **no añade una columna nueva** a una tabla que ya
existe. Sin `projectId`, la consulta que la nombra falla y el Wisdom Center deja
de funcionar en cuanto se abre. Se añade por las dos vías: en el `CREATE` para las
instalaciones nuevas y con un `ALTER TABLE ... ADD COLUMN` para las que ya tienen
la tabla. El `ALTER` protesta si la columna ya está, y el bucle que ejecuta el DDL
registra el aviso sin abortar —así es idempotente—; comprobado sobre una copia de
la base que ya la tenía, sin perder filas.

## Estado de los criterios de aceptación

| Criterio | Estado |
|---|---|
| Un documento del proyecto A no aparece en ninguna búsqueda del proyecto B | Hecho, verificado contra la base real en los tres ámbitos. |
| Una búsqueda desde un proyecto devuelve normativa general, con el origen indicado | Hecho. El origen viaja en cada resultado y se muestra en las tarjetas. |
| El corpus existente queda correctamente reindexado y clasificado, sin pérdidas | Hecho sin reindexar: los 3 documentos pasan a general y los 434 fragmentos quedan intactos. |

## Comprobado en la aplicación

Con la base real, creando un documento interno en un proyecto y consultándolo
desde otro:

| Desde | Ámbito | Ve | Ve el confidencial |
|---|---|---:|---|
| Proyecto B | general / proyecto / ambos | 3 / 0 / 3 | **no** en los tres |
| Proyecto A (su dueño) | general / proyecto / ambos | 3 / 2 / 5 | sí, es suyo (salvo en general) |
| Sin proyecto activo | los tres | 3 | **no** |

Y en la interfaz: el selector con los tres ámbitos —«Del proyecto» y «Ambos»
deshabilitados sin proyecto activo—, el distintivo de origen en cada tarjeta, y
«My Documents (0)» al pedir sólo el ámbito del proyecto en uno que no tiene
documentos internos, que es lo correcto.

## Fuera de alcance

**Mostrar el origen en los resultados de la búsqueda semántica.** El dato viaja en
cada resultado, pero el panel no pinta hoy esos resultados: la línea que los
guardaba está comentada desde antes de este cambio (`// setSearchResults(...)`) y
la búsqueda sólo muestra un aviso con el número de coincidencias. Cuando exista
esa vista, el origen ya está disponible.

**`versionId` en el ámbito.** El issue lo menciona junto a `projectId`. Cobra
sentido con #41, cuando los documentos indexados sean resultados de una simulación
atada a una versión concreta; hoy no hay ningún documento con versión al que
filtrar.

**Las otras tres colecciones** (`conversations`, `agent_memory`,
`guardrail_violations_vec`) siguen siendo globales. El issue nombra la de
conocimiento, que es la que mezcla documentos de clientes distintos.
