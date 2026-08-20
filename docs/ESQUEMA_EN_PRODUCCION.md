# El esquema de la base en una instalación real

Cómo llega el esquema a la máquina de quien instala o actualiza Boorie, por qué se
separó del código durante nueve versiones sin que nadie lo notara, y qué lo vigila
ahora.

## Dos caminos que no son el mismo

| Dónde | Quién pone el esquema |
|---|---|
| Desarrollo | `npx prisma db push` en cada arranque (`electron/main.ts`, rama `isDev`) |
| Instalación empaquetada | `SENTENCIAS_ESQUEMA` de `electron/esquemaProduccion.ts` |

En producción **no corre Prisma migrate ni `db push`**. Lo único que crea tablas y
añade columnas es esa lista de sentencias, que se ejecuta en cada arranque, cada
una dentro de su propio `try`: la que sobra —una tabla que ya existe, una columna
ya puesta— avisa y se ignora.

La base vive en `userData/hydraulic.db`, y la plantilla de `resources/prisma/` sólo
se copia **si el fichero no existe**. Actualizar nunca pisa los datos del usuario.
Conviene saber además que el instalador que construye el CI **no lleva plantilla**:
`prisma/hydraulic.db` está en `.gitignore`, así que en un clon limpio no existe y
una instalación nueva arranca con una base vacía que rellenan estas sentencias.
Son, por tanto, el esquema real de todo el que no sea un desarrollador.

## Lo que pasó

La jerarquía madre/hija de escenarios ([#31](https://github.com/Boorie-AI/boorie_cliente/issues/31))
añadió tres columnas a `hydraulic_networks` —`parentId`, `scenarioLabel`,
`resultsPath`— en la **v1.6.0**. Se añadieron al esquema de Prisma y nunca a esta
lista. En desarrollo no se notó nada, porque `db push` las creaba.

Fuera de desarrollo, cualquier base que no crease `db push` se quedó sin ellas, y
Prisma pide todas las columnas escalares en cada consulta:

```
The column `main.hydraulic_networks.parentId` does not exist in the current database.
```

Es decir: **no se podían ni listar las redes de un proyecto**. Los datos seguían
intactos —el `.inp` guardado, sus versiones, sus simulaciones—, pero la aplicación
no podía leerlos. Duró de la v1.6.0 a la v1.15.0, y se arregla en la **v1.15.1**.

Con el mismo origen, la tabla `guardrail_violations` no se creaba en ninguna parte.
Ahí no se veía nada porque la escritura de la auditoría va dentro de un `try/catch`:
sólo dejaba la pestaña de violaciones sin poder listar.

## Las dos reglas

**Tabla nueva** → su `CREATE TABLE IF NOT EXISTS` con todas sus columnas.

**Columna nueva en una tabla que ya existía** → además del `CREATE TABLE`, un
`ALTER TABLE ADD COLUMN`. Esta es la que se olvida: `CREATE TABLE IF NOT EXISTS` no
toca una tabla que ya está, así que sin el `ALTER` la columna llega a las
instalaciones nuevas y no a las que actualizan, que son las que tienen datos.

SQLite no admite añadir una clave foránea con `ADD COLUMN`. La relación se declara
igualmente en `schema.prisma` —y ahí funciona en desarrollo—, pero el código no
puede descansar en su cascada: quien actualiza no la tendrá. Por eso la poda de
versiones borra explícitamente los documentos indexados en vez de esperar a que la
cascada se los lleve (ver [`INDEXACION_SIMULACIONES.md`](INDEXACION_SIMULACIONES.md)).

## Qué lo vigila

`electron/esquemaProduccion.test.ts` lee `prisma/schema.prisma` y las sentencias, y
compara:

1. Todas las tablas del esquema tienen su `CREATE TABLE`.
2. Todas las columnas escalares de cada tabla están, entre el `CREATE TABLE` y los
   `ALTER`.
3. Las columnas que se añadieron sobre tablas vivas —#31, #39 y #41— traen su
   `ALTER`.

No valida tipos ni claves foráneas; para eso está Prisma. Comprueba lo único que
rompe en producción, que es que la columna exista. Se verificó que la prueba falla
de verdad: quitando el `ALTER` de `parentId` vuelve a salir el fallo de la v1.6.0.

## Cómo comprobarlo a mano

Merece la pena antes de una release que toque el esquema. Se simulan los dos
caminos sin instalar nada:

```bash
# 1. Instalación nueva: base vacía + las sentencias de arranque.
#    Comprobar después que se pueden crear proyectos, redes y escenarios.

# 2. Actualización: base creada con el esquema de una versión antigua
git show v1.5.1:prisma/schema.prisma > /tmp/viejo.prisma   # apuntar su datasource a un fichero de pruebas
npx prisma db push --schema=/tmp/viejo.prisma --skip-generate
#    sembrar filas con SQL directo, aplicar las sentencias y leer con el cliente actual
```

Lo que hay que ver en el segundo caso es que las filas sembradas siguen ahí después
de migrar: el esquema de producción sólo añade, nunca borra ni reescribe.

## Fichero

| Pieza | Fichero |
|---|---|
| Las sentencias y su aplicación | `electron/esquemaProduccion.ts` |
| La prueba que las compara con Prisma | `electron/esquemaProduccion.test.ts` |
| Quién las llama al arrancar | `electron/main.ts` (rama de producción) |
