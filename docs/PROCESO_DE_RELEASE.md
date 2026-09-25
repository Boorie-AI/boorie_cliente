# Proceso de release

Lista de lo que hay que tocar y comprobar en **cada** versión que se publique. Existe porque
las cosas que se olvidan no son las difíciles: son las que no están escritas en ningún sitio.
Cada punto de aquí está por algo que ya pasó, y el motivo va anotado.

## 1. Antes de la versión

- [ ] `npm run typecheck` limpio — cubre el renderer (`src/`) **y** el proceso principal
      (`electron/` + `backend/`). Antes sólo cubría `src/`, y un import que faltaba en
      `electron/` no se veía hasta que el paquete corría.
- [ ] `npm test` en verde.
- [ ] `npm audit --audit-level=moderate` sin hallazgos, que es lo que corre el job
      `Security Audit`. **Puede ponerse rojo sin que nadie haya tocado el repositorio**: `npm
      audit` pregunta al registro en cada ejecución, así que un aviso publicado entre dos
      ejecuciones tiñe de rojo el mismo `package-lock.json` que pasaba ayer. Le pasó al PR
      #116 con `fflate` (GHSA-px8p-9vwx-vf98), que entra por `@vitest/ui` y no viaja en el
      paquete. Se arregla con `npm audit fix --package-lock-only` y se mira el diff del lock:
      si es un salto de parche dentro del rango que ya pedía la dependencia, entra en el
      ciclo; si obliga a subir una dependencia directa, es su propio PR.
      **Y hay un rojo que no es ningún hallazgo**: `npm error audit endpoint returned an
      error` con un `503 Service Unavailable` es el registro de npm caído, no una
      vulnerabilidad. Se distingue en un segundo corriendo `npm audit` en local —si da cero,
      era eso— y se arregla con `gh run rerun <id> --failed`. Pasó en el PR #124.
- [ ] `npm run lint` **completo, sin filtrar por fichero, y después del último commit**.
      Lintar sólo lo que has tocado deja pasar errores en ficheros nuevos: eso tumbó el CI de la
      v1.21.0 por un `catch (e)` sin usar en un test recién añadido. Y correrlo a mitad del
      trabajo no cuenta como haberlo corrido: en el PR #166 dio cero errores, se escribió un
      test más y el `;(window as …)` que abría una de sus líneas —`no-extra-semi`, que es error
      y no aviso— tumbó el job con el lint ya «comprobado». La suite y el `typecheck` pasaban:
      de los tres, el lint es el único que distingue un error de un aviso, y hay 1.318 avisos
      permanentes entre los que un error se pierde si no se mira la última línea.
- [ ] El cambio comprobado **en la aplicación real**, no sólo en los tests. Ver
      `.claude/skills/run-app`. Los tests no ven lo que ve una persona: el cuadro congelado del
      #74, el botón que simulaba sin que se notara, el redondeo que mostraba «80 %» bajo un
      umbral de 0.8 y las viñetas truncadas del historial salieron todos así.
- [ ] **Los PR mergeados desde el tag anterior, a la vista** antes de redactar la entrada:

      ```bash
      gh pr list --state merged --base main --limit 50 \
        --json number,title,mergedAt --jq '.[] | "\(.number) \(.mergedAt) \(.title)"'
      ```

      El paso 3 pide escribir la entrada del `CHANGELOG.md`, pero no decía de dónde sale lo
      que va en ella, así que salía de acordarse. Un arreglo que cambia lo que ve quien usa
      la aplicación y se mergeó tres semanas antes no se recuerda solo: el #122 dejó
      anotado «que quede constancia en el CHANGELOG» justamente porque no había forma de
      que apareciera si nadie lo miraba.

## 2. Elegir el número

[SemVer](https://semver.org/lang/es/). En la práctica, para una aplicación de escritorio:

| Salto | Cuándo |
|---|---|
| **Parche** (`1.21.0` → `1.21.1`) | Correcciones que no cambian lo que la persona ve ni cómo se usa. |
| **Menor** (`1.21.1` → `1.22.0`) | Funcionalidad nueva, **o** cualquier cambio de comportamiento visible: un botón que desaparece, uno que ahora hace otra cosa. |
| **Mayor** | Ruptura de compatibilidad de datos o de la forma de trabajar. |

Una corrección que además cambia comportamiento visible es **menor**, no parche.

## 3. Ficheros que hay que actualizar

Todos, y **antes del tag**, para que el tag ya contenga los enlaces correctos. Si el README se
actualiza después, el tag apunta a descargas de la versión anterior.

- [ ] `package.json` — con `npm version X.Y.Z --no-git-tag-version`, que mantiene
      `package-lock.json` en sincronía (hay dos sitios dentro del lock).
- [ ] `CHANGELOG.md` — entrada nueva arriba, **doblando en ella la sección `[Unreleased]`**
      y borrándola después. Esa sección se va escribiendo al integrar cada cambio visible,
      para que la entrada no dependa de acordarse un mes más tarde; el parser del historial
      sólo reconoce cabeceras con número de versión, así que mientras vive no altera lo que
      enseña «Acerca de». La superior debe coincidir con `package.json`:
      la pestaña «Acerca de» de la aplicación lee este fichero, así que un descuadre se ve
      dentro del producto. Redactado en **lenguaje de usuario**: qué le pasaba a quien lo
      sufría y qué pasa ahora, no qué función se ha cambiado.
- [ ] `README.md` (inglés) — el título `Latest Release - vX.Y.Z`, las tres filas de la tabla de
      descargas, la viñeta nueva de *What's New* y **las instrucciones de instalación de más
      abajo** (`Boorie-X.Y.Z.AppImage`, `chmod +x`, `Boorie-Setup-X.Y.Z.exe`).
- [ ] `docs/README.es.md` y `docs/README.ca.md` — lo mismo en los dos, incluidas **las
      instrucciones de instalación**. Es lo que se olvidaba: quedaron citando la `1.15.0`
      durante media docena de releases porque el ciclo sólo tocaba el bloque de cabecera.

**No vale un `sed` de la versión entera sobre estos ficheros.** Cada README guarda el
historial de novedades de las versiones anteriores, y cada entrada enlaza a su propia
`releases/tag/vX.Y.Z`. Un reemplazo global de la versión anterior se los lleva por delante: la
novedad de la v1.35.0 pasa a decir «v1.36.0» y su enlace apunta a una release que cuenta otra
cosa, con lo que el historial queda falseado y el lector que busca qué traía la versión que
tiene instalada encuentra las notas de otra. Pasó al preparar la v1.36.0 y hubo que revertir
los tres ficheros.

Hay que tocar sólo cuatro sitios por fichero, y ninguno más: la cabecera, las tres filas de la
tabla de descargas —las que contienen `releases/download/vX.Y.Z/`—, el bloque de novedades
**nuevo, insertado delante del anterior**, y los nombres de fichero de las instrucciones de
instalación.

Comprobación rápida de que no queda nada atrás, con la versión anterior:

```bash
grep -rn "1\.20\.2" README.md docs/README.es.md docs/README.ca.md
```

Sólo deben salir las entradas históricas de novedades y los enlaces a `releases/tag/`. **Y
tienen que salir**: cero resultados no es que esté todo bien, es que el historial se ha
sobrescrito. Con tres versiones de historial en cada README, lo normal son cinco líneas.

## 4. Publicar

```bash
git tag -a vX.Y.Z -m "vX.Y.Z — resumen en una línea"
git push origin vX.Y.Z
```

El workflow `release.yml` construye en las tres plataformas y deja un **borrador** con sus 8
artefactos (3 instaladores, 2 blockmaps, 3 `latest*.yml`).

### Comprobar que hay **un** borrador, no dos

```bash
gh api repos/Boorie-AI/boorie_cliente/releases --jq '.[] | select(.draft==true) | "\(.id) \(.tag_name)"'
```

Tiene que salir **uno solo**, con los ocho artefactos.

Salían dos: las tres plataformas publican en paralelo y cada una creaba la
release si no la encontraba, así que cuando dos llegaban a la vez las dos la
creaban y los artefactos quedaban repartidos. Pasó en la v1.23.1 y en la
v1.24.0; publicar el borrador equivocado deja a macOS sin su `.dmg.blockmap`
—y sin descarga diferencial— o a Windows sin instalador.

Desde el #85 el workflow crea el borrador **antes** de la matriz, en el job
`preparar-release`, y los tres builds sólo suben ahí. Si vuelven a aparecer dos,
ese arreglo no ha funcionado: hay que decirlo en el issue en lugar de
consolidarlos otra vez a mano.

Y si aun así hay que consolidarlos: bajar los artefactos del huérfano, subirlos
al que tenga el resto —`gh release upload` necesita estar dentro del
repositorio; si no, va por `upload_url` con `curl`— y borrar el huérfano antes de
publicar.

```bash
UP=$(gh api repos/Boorie-AI/boorie_cliente/releases/<id-bueno> --jq .upload_url | sed 's/{.*}//')
curl -s -X POST -H "Authorization: token $(gh auth token)" \
  -H "Content-Type: application/octet-stream" --data-binary @<fichero> "$UP?name=<fichero>"
gh api -X DELETE repos/Boorie-AI/boorie_cliente/releases/<id-huérfano>
```

### Verificar los artefactos antes de publicar

No vale con que el CI esté verde. Lo que se entrega es el artefacto.

- [ ] **Dentro del `.exe`**: `provider = "sqlite"` en el cliente de Prisma **generado**
      (`resources/.prisma/client/schema.prisma`), no sólo en el esquema fuente. La
      v1.5.1-rc.7 se entregó al cliente y no abría porque se comprobó el fuente y no el
      generado. Comprobar también que está `query_engine-windows.dll.node`, que **no viaja
      ninguna base de datos** y que los `.py` de `backend/services/hydraulic/` llevan los
      cambios esperados (viajan en `app.asar.unpacked`, no dentro del asar).

```bash
RID=$(gh api repos/Boorie-AI/boorie_cliente/releases --jq '.[] | select(.draft==true) | .id' | head -1)
AID=$(gh api repos/Boorie-AI/boorie_cliente/releases/$RID/assets --jq '.[] | select(.name|endswith(".exe")) | .id')
gh api -H "Accept: application/octet-stream" repos/Boorie-AI/boorie_cliente/releases/assets/$AID > setup.exe
7z e -y setup.exe '$PLUGINSDIR/app-64.7z'
7z x -y app-64.7z 'resources/.prisma/client/schema.prisma' -o./x
grep -A3 '^datasource' x/resources/.prisma/client/schema.prisma
```

- [ ] **Cuando el cambio es del renderer**, el `.py` no sirve para comprobarlo: ese
      código va minificado dentro de `app.asar`. Se extrae y se busca la mecánica,
      que sobrevive al minificado aunque los nombres no.

```bash
npx @electron/asar list x/resources/app.asar | grep '^/dist/assets/.*\.js$'
npx @electron/asar extract-file x/resources/app.asar dist/assets/index-XXXX.js
```

- [ ] **Ejecutar el paquete de Linux** y ver que la base de datos conecta. El AppImage salió
      **cinco releases seguidas** sin poder abrir la suya —ventana vacía, ni proyectos ni
      conversaciones— con los tests en verde, porque la verificación se hacía sólo dentro del
      `.exe`, que sí elegía bien. En el log tienen que aparecer
      `Prisma query engine for linux (glibc: …)` con un motor de glibc y
      `Database initialized and connected successfully`.

```bash
npm run build:vite && npm run build:electron-ts && npx electron-builder --linux --dir
./dist-electron/linux-unpacked/boorie --no-sandbox
```

`--dir` evita comprimir el AppImage y sirve igual. El modo desarrollo **no** sirve para esto:
ahí Prisma resuelve el motor por su cuenta y el fallo no aparece.

**Esas dos líneas van al stdout del proceso, no a `~/.config/boorie/logs/main.log`.** Ese
fichero es el de `electron-log` y en un arranque normal trae sólo lo del autoactualizador —dos
líneas—, así que buscar ahí la conexión de la base da cero y parece que el paquete no abre la
suya. Hay que redirigir la salida al lanzarlo (`./boorie --no-sandbox > salida.log 2>&1`) y
grepear ese fichero. Pasó en la v1.33.0 y costó un susto.

- [ ] **Cuando el cambio se ve en la interfaz, verlo en el paquete**, no sólo encontrar su código
      en `app.asar`. Que el código esté no dice que se pinte: una fuente que no viaja o un CSS
      con rutas absolutas sólo fallan servidos desde `file://`. Se lanza el AppImage del borrador
      con `--remote-debugging-port=9222` y se cuenta por CDP lo que tiene que aparecer.

**Y los datos reales pueden no tener nada que lo muestre.** El paquete abre
`~/.config/boorie/hydraulic.db`, que no es la base de desarrollo. En la v1.40.0 la comprobación
de las fórmulas y las tablas del chat dio `katex: 0, tablas: 0` con la base conectada: esa base no
tenía ninguna respuesta con fórmulas, y la conversación que sí las tenía vivía sólo en
`prisma/hydraulic.db`. Un cero así se lee como que el cambio no viajó, y no era eso.

Se arregla lanzando el paquete sobre una carpeta de datos aparte con una base pequeña sembrada con
el caso, copiado de la base de desarrollo. La base se crea con las mismas sentencias que usa la
aplicación empaquetada, así que es la que tendría una instalación nueva:

```bash
mkdir -p ud
cat > esquema.mts <<'EOF'
import { SENTENCIAS_ESQUEMA } from '<repo>/electron/esquemaProduccion.ts'
import { writeFileSync } from 'fs'
writeFileSync('esquema.sql', SENTENCIAS_ESQUEMA.map(s => s + ';').join('\n'))
EOF
npx tsx esquema.mts
python3 - <<'EOF'
import sqlite3
dst = sqlite3.connect('ud/hydraulic.db')
for s in open('esquema.sql').read().split(';\n'):
    try: dst.execute(s)
    except Exception: pass   # los ALTER que sobran en una base nueva, como al arrancar
src = sqlite3.connect('file:<repo>/prisma/hydraulic.db?mode=ro', uri=True)
cid = '<id de la conversación>'
for tabla, col in [('conversations', 'id'), ('messages', 'conversationId')]:
    cols = [r[1] for r in dst.execute(f'pragma table_info({tabla})')]
    filas = src.execute(f'select {",".join(cols)} from {tabla} where {col}=?', (cid,)).fetchall()
    dst.executemany(f'insert into {tabla} ({",".join(cols)}) values ({",".join("?" * len(cols))})', filas)
dst.execute('update conversations set projectId = null')   # el proyecto no viaja
dst.commit()
EOF
./Boorie-X.Y.Z.AppImage --no-sandbox --remote-debugging-port=9222 --user-data-dir=$PWD/ud
```

Con la carpeta nueva salen los velos de una instalación limpia —ver más abajo cómo quitarlos— y
el tema es el claro, lo que de paso comprueba el cambio en el tema que no se usa al desarrollar.

### Quitar el borrador

Pasando `tag_name` en el **mismo** PATCH que `draft=false`. Si no, GitHub deja `tag_name` como
`untagged-<hash>`, la release queda en una URL que nadie espera y los enlaces del README dan
404. Pasó en la v1.6.0.

```bash
gh api -X PATCH repos/Boorie-AI/boorie_cliente/releases/<id> \
  -F draft=false -f tag_name=vX.Y.Z -f name="vX.Y.Z — resumen" --field body="$NOTAS" --jq .tag_name
```

## 5. Después de publicar

- [ ] Los seis enlaces de descarga responden. Pedir sólo el primer byte; **206 es correcto**:

```bash
curl -s -o /dev/null -w '%{http_code}' -L -r 0-0 \
  https://github.com/Boorie-AI/boorie_cliente/releases/download/vX.Y.Z/Boorie-Setup-X.Y.Z.exe
```

Justo tras publicar, un artefacto puede dar **500**: es el CDN de GitHub, no el artefacto.
Reintentar a los ~20 s.

- [ ] `latest.yml`, `latest-mac.yml` y `latest-linux.yml` presentes y apuntando a la versión
      nueva: son los del autoactualizador.
- [ ] GitHub da la release como `latest`.
- [ ] **La actualización automática desde la versión anterior funciona.** Es lo que confirma
      que el `blockmap` y los `latest*.yml` de esta release sirven de verdad, que es por donde
      va a llegar la versión nueva a quien ya tiene la aplicación instalada. Se comprueba
      ejecutando el AppImage **de la versión anterior**, descargado de su propia release:

```bash
curl -sL -o Boorie-<anterior>.AppImage \
  https://github.com/Boorie-AI/boorie_cliente/releases/download/v<anterior>/Boorie-<anterior>.AppImage
chmod +x Boorie-<anterior>.AppImage && ./Boorie-<anterior>.AppImage --no-sandbox
tail -f ~/.config/boorie/logs/main.log
```

En el registro tienen que aparecer `Found version X.Y.Z`, la descarga —que será
**diferencial** si el blockmap está bien— y el fichero resultante con el **tamaño y el
`sha512` exactos** de `latest-linux.yml`.

Lo que confirma que el blockmap sirve es que la descarga **no sea completa**, no que baje de
un porcentaje concreto: el log lo dice en claro, `Full: … To download: … (N %)`. En la v1.28.0
fue el **22 %**, porque esa versión movía dependencias y con ellas medio `node_modules`; en una
que sólo toque código del renderer baja al orden del 1 %. Un 22 % no es un blockmap roto. Que el sha cuadre es
lo que demuestra que el ensamblado por bloques produce el mismo binario que una descarga
completa.

> **Cerrar con `kill -TERM` no instala nada.** El evento `quit` del que cuelga
> `autoInstallOnAppQuit` no se dispara con una señal, y no queda ninguna traza en el log que
> lo explique: parece que la actualización no se aplica. Hay que **cerrar la ventana**
> (`window-all-closed` → `app.quit()`, `electron/main.ts`). Entonces sí aparece
> `Auto install update on quit` y el AppImage queda sustituido por el de la versión nueva.

> **Un `net::ERR_NETWORK_CHANGED` no es un fallo de la release.** El registro dice
> `Checking for update` y a los veinte segundos ese error, sin llegar a `Found version`.
> También aparece **después** de `Found version`, a mitad de la descarga y con el diferencial
> ya calculado: `Cannot download differentially, fallback to full download`. Es el mismo
> aviso de Chromium y se comprueba igual; que el porcentaje del diferencial se haya calculado
> —`Full: … To download: … (21 %)`— ya dice que el blockmap está bien. Pasó en la v1.33.0.
> Es Chromium avisando de que la interfaz de red cambió a mitad de la petición, no un
> `latest-linux.yml` inalcanzable. Se distingue en un segundo:
> `curl -sI .../latest-linux.yml` — si da 200, era eso, y basta relanzar. Pasó en la v1.31.0.

**Cómo cerrar esa ventana sin manos.** Boorie no tiene marco: el botón de cerrar lo dibuja el
renderer, así que no hay ventana nativa que un `wmctrl` pueda cerrar, y bajo Wayland tampoco se
puede leer el estado de las ventanas desde fuera. Se lanza el paquete con puerto de depuración
y se le clica su propio botón por CDP, que es lo que dispara `app.quit()` de verdad:

```bash
./Boorie-<anterior>.AppImage --no-sandbox --remote-debugging-port=9222
```

```js
// desde un directorio que tenga playwright-core instalado: NODE_PATH no vale para ESM
import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = b.contexts()[0].pages().find(p => !p.url().startsWith('devtools://'));
// El descargo de la 1.29.0 tapa los controles de ventana: su velo es un
// `fixed inset-0 z-[100]` que cubre también la barra de título, así que el
// clic en «Cerrar» se lo come el velo y Playwright agota su espera sin decir
// por qué. Hay que aceptarlo primero.
await page.locator('[role=dialog] button', { hasText: 'Entendido' }).click();
await page.waitForTimeout(1500);
await page.click('button[title="Cerrar"]');   // el título va en el idioma de la aplicación
```

Si el clic en cerrar se queda esperando, esto lo dice en una línea:

```js
document.elementFromPoint(1896, 16)   // ¿quién hay realmente encima del botón?
```

**Con una carpeta de datos nueva, los velos son otros.** El descargo no es el único que tapa la
barra de título. En una instalación limpia salen apilados, por este orden:

1. el de preparar el entorno de Python, con «Continuar de todos modos»;
2. el tutorial de bienvenida, con «Omitir tutorial»;
3. el descargo, con «Entendido».

Los tres son un `fixed inset-0`, y el clic en «Cerrar» se lo come el de arriba. **Y no salen
siempre en el mismo orden ni a la vez**: el de Python puede aparecer segundos después, encima del
tutorial. Pulsarlos por lista con `locator.click()` agotaba la espera en el que no estaba arriba, y
el cierre fallaba sin instalar. Lo que funciona es preguntar qué hay de verdad encima del botón y
pulsar lo que tape, hasta que el botón quede libre. Son botones normales, no de Radix, así que
basta el `click()` del DOM. Pasó en la v1.38.1 y en la v1.38.2, al hacer la prueba con
`--user-data-dir`:

```js
for (let i = 0; i < 10; i++) {
  const libre = await page.evaluate(() => {
    const btn = document.querySelector('button[title="Cerrar"]');
    const r = btn.getBoundingClientRect();
    if (btn.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))) return true;
    for (const texto of ['Continuar de todos modos', 'Omitir tutorial', 'Entendido']) {
      const b = [...document.querySelectorAll('button')].find(x => x.innerText.trim().startsWith(texto));
      if (b) { b.click(); return texto; }
    }
    return false;
  });
  if (libre === true) break;
  await page.waitForTimeout(1500);
}
await page.click('button[title="Cerrar"]');
```

**Si hay una app de desarrollo abierta, los paquetes van con su propia carpeta de datos.** El
paquete de Linux y el AppImage de la prueba de actualización abren `~/.config/boorie`, que es la
misma base y el mismo Milvus que usa `npm run dev`. Dos instancias sobre los mismos datos pueden
corromperlos. Con `--user-data-dir=<carpeta nueva>` cada una trabaja sobre lo suyo:

- sale `Using database at: <carpeta>/hydraulic.db`;
- la base conecta igual, que es lo que se comprueba;
- el actualizador escribe en `<carpeta>/logs/main.log`.

Milvus no arranca en esa carpeta, porque no tiene venv, y el servidor OAuth avisa de
`EADDRINUSE 127.0.0.1:8020` porque el puerto lo tiene la otra instancia. Las dos cosas son
esperables y no son de la release.

Y **no avances `main` en el directorio donde corre esa app** —un `git merge`, un `pull` tras
mergear el PR—. Vite recarga el renderer con el código nuevo mientras el proceso principal sigue
con el viejo, y la Base de Conocimiento vuelve a lanzar su diagnóstico. En la v1.38.1, con la
base de 298.072 fragmentos, ese diagnóstico dejó Prisma ocupado varios minutos: la sesión de
pruebas recibió `P1008` al crear conversaciones y guardar ajustes. Para verificar se usa el
artefacto del borrador, no un empaquetado local sobre `dist/`.

**El script tiene que estar dentro del directorio que tiene `node_modules`.** En ESM la
resolución va por la ubicación del fichero y no por el directorio de trabajo, así que
`cd deps && node ../cerrar.mjs` falla con `ERR_MODULE_NOT_FOUND` aunque `playwright-core`
esté ahí al lado. `NODE_PATH` tampoco vale, que ya está dicho arriba.

**Y matar el AppImage deja `start_milvus.py` huérfano con el puerto de depuración cogido.**
Es un hijo que hereda el descriptor del socket, se reparenta a systemd y sobrevive al
`pkill` del AppImage. La instancia siguiente arranca sin poder enlazar el 9222 y el
`connectOverCDP` muere con un `Timeout 30000ms exceeded` que no explica nada. Se ve y se
arregla así:

```bash
ss -tlnp | grep 9222          # si el dueño es «python» y no «boorie», es el huérfano
pkill -f '[s]tart_milvus.py'
```

Pasó en la v1.31.0, y cuesta un rato porque el síntoma —un timeout de CDP— no señala al
puerto.

**El AppImage se renombra, no se sobrescribe.** Tras instalar, el fichero de la versión
anterior **desaparece** y en su sitio queda `Boorie-<nueva>.AppImage`. Conviene saberlo por dos
razones: buscar el fichero por su nombre viejo hace pensar que la instalación borró la
aplicación, y un lanzador del escritorio que apunte a la ruta anterior deja de funcionar.

Al arrancar la versión ya actualizada, el actualizador debe responder
`Update for version X.Y.Z is not available`: ésa es la confirmación de que la aplicación que
corre se identifica con la versión nueva. Sólo cubre el camino de Linux; Windows y macOS usan
los mismos ficheros del autoactualizador, pero no se ejecutan desde aquí.

- [ ] **El registro de actividades del mes, al día.** Ver el apartado 6: no es opcional ni «si
      da tiempo», es parte de publicar. Se quedaba atrás justamente por estar al final y sin
      casilla.
- [ ] Si el PR llevaba `Closes #N`, el issue ha quedado cerrado. La palabra clave **tiene que
      ir en inglés** aunque el PR esté en español: «Cierra #N» no cierra nada, y el #32 quedó
      abierto después de publicar por eso.

```bash
gh pr view <n> --json closingIssuesReferences
```

## 6. Registro de actividades

El control de actividades personal, que vive **fuera del repositorio**, se actualiza **en cada
despliegue**. No es el `CHANGELOG.md` y no es opcional: una versión no está publicada del todo
hasta que tiene sus filas.

**El fichero es el del mes en curso**, y el mes va en el nombre:

```
~/Documentos/BOORIE/Control_Actividades_Boorie_Rayne Flores_AAAA-MM.xlsx
```

Hay que componerlo con la fecha de hoy y no arrastrar el de la sesión anterior: en septiembre de
2026 es `…_2026-09.xlsx`; el 1 de octubre deja de serlo. **Si el del mes todavía no existe, no
se escribe en el del mes pasado ni se crea por cuenta propia**: el corte mensual lo decide su
dueño, que es quien dice qué filas se llevan y si los IDs continúan.

**Varias filas por ciclo**: una del trabajo —rama, `Estado: Integrado`, la categoría que toque—,
una más por cada arreglo que entró en el commit y, al final, la de la publicación —`Rama: main`,
categoría `Proceso`, título «Publicar la release vX.Y.Z con …»—. Si el ciclo tuvo varias tandas
de trabajo, una fila por tanda, con sus arreglos, y una sola de publicación.

Y el contenido va en el mismo registro que el resto del fichero: qué pasaba, qué se hizo, **cómo
se validó** —pruebas y comprobación en la aplicación real— y qué queda pendiente. Los tropiezos
del camino también: son lo que hace útil el registro un mes después.
