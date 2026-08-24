# Proceso de release

Lista de lo que hay que tocar y comprobar en **cada** versión que se publique. Existe porque
las cosas que se olvidan no son las difíciles: son las que no están escritas en ningún sitio.
Cada punto de aquí está por algo que ya pasó, y el motivo va anotado.

## 1. Antes de la versión

- [ ] `npm run typecheck` limpio — cubre el renderer (`src/`) **y** el proceso principal
      (`electron/` + `backend/`). Antes sólo cubría `src/`, y un import que faltaba en
      `electron/` no se veía hasta que el paquete corría.
- [ ] `npm test` en verde.
- [ ] `npm run lint` **completo, sin filtrar por fichero**. Lintar sólo lo que has tocado deja
      pasar errores en ficheros nuevos: eso tumbó el CI de la v1.21.0 por un `catch (e)` sin usar
      en un test recién añadido.
- [ ] El cambio comprobado **en la aplicación real**, no sólo en los tests. Ver
      `.claude/skills/run-app`. Los tests no ven lo que ve una persona: el cuadro congelado del
      #74, el botón que simulaba sin que se notara, el redondeo que mostraba «80 %» bajo un
      umbral de 0.8 y las viñetas truncadas del historial salieron todos así.

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
- [ ] `CHANGELOG.md` — entrada nueva arriba. La superior debe coincidir con `package.json`:
      la pestaña «Acerca de» de la aplicación lee este fichero, así que un descuadre se ve
      dentro del producto. Redactado en **lenguaje de usuario**: qué le pasaba a quien lo
      sufría y qué pasa ahora, no qué función se ha cambiado.
- [ ] `README.md` (inglés) — el título `Latest Release - vX.Y.Z`, las tres filas de la tabla de
      descargas, la viñeta nueva de *What's New* y **las instrucciones de instalación de más
      abajo** (`Boorie-X.Y.Z.AppImage`, `chmod +x`, `Boorie-Setup-X.Y.Z.exe`).
- [ ] `docs/README.es.md` y `docs/README.ca.md` — lo mismo en los dos, incluidas **las
      instrucciones de instalación**. Es lo que se olvidaba: quedaron citando la `1.15.0`
      durante media docena de releases porque el ciclo sólo tocaba el bloque de cabecera.

Comprobación rápida de que no queda nada atrás, con la versión anterior:

```bash
grep -rn "1\.20\.2" README.md docs/README.es.md docs/README.ca.md
```

Sólo deben salir las entradas históricas de novedades y los enlaces a `releases/tag/`.

## 4. Publicar

```bash
git tag -a vX.Y.Z -m "vX.Y.Z — resumen en una línea"
git push origin vX.Y.Z
```

El workflow `release.yml` construye en las tres plataformas y deja un **borrador** con sus 8
artefactos (3 instaladores, 2 blockmaps, 3 `latest*.yml`).

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
- [ ] Si el PR llevaba `Closes #N`, el issue ha quedado cerrado. La palabra clave **tiene que
      ir en inglés** aunque el PR esté en español: «Cierra #N» no cierra nada, y el #32 quedó
      abierto después de publicar por eso.

```bash
gh pr view <n> --json closingIssuesReferences
```

## 6. Registro de actividades

El control de actividades personal (fuera del repositorio) lleva **dos filas por ciclo**: una
del trabajo y otra de la publicación. No es el `CHANGELOG.md`.
