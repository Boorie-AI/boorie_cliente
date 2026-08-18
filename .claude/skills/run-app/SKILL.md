---
name: run-app
description: Ejecuta Boorie (Electron + Vite) y conduce su interfaz para verificar un cambio en la aplicación real. Úsalo cuando pidan arrancar la app, hacer una captura, o confirmar que algo funciona de verdad y no solo en los tests.
---

Boorie es una app Electron cuyo renderer se sirve desde Vite en desarrollo
(`electron/main.ts` carga `http://localhost:3000` cuando `!app.isPackaged`).
Para uso automatizado se conduce con el REPL de Playwright que hay en
`.claude/skills/run-app/driver.mjs`.

Los tests no ven lo que ve un usuario. Ejecutando la app aparecieron el
redondeo que mostraba «80 %» bajo un umbral de 0.8, las viñetas truncadas del
historial de versiones y la migración que corría dos veces por `React.StrictMode`.

## Requisitos

`playwright-core` no es dependencia del repo. Instálalo fuera para no tocar
`package.json`:

```bash
mkdir -p /tmp/boorie-driver/deps && cd /tmp/boorie-driver/deps
npm init -y >/dev/null && npm install playwright-core
```

El driver lo resuelve por `NODE_PATH`. En Linux con escritorio ya hay `DISPLAY`;
en un contenedor headless hace falta `xvfb-run -a` y los `.so` de Chromium
(`libnss3 libgbm1 libasound2t64 libgtk-3-0 libxss1 libxkbcommon0
libatk-bridge2.0-0 libcups2 libdrm2`).

## Arranque

```bash
cd /home/rayne/Documentos/BOORIE/development/boorie_cliente

npm run build:electron-ts                      # compila el main + copia los .py
nohup npm run dev:vite > /tmp/boorie-driver/vite.log 2>&1 &
timeout 90 bash -c 'until curl -sf http://localhost:3000 >/dev/null; do sleep 1; done'

mkdir -p /tmp/boorie-driver
NODE_PATH=/tmp/boorie-driver/deps/node_modules \
  setsid nohup node .claude/skills/run-app/driver.mjs \
  > /tmp/boorie-driver/driver.log 2>&1 < /dev/null &
```

Comandos por fichero, respuestas por otro:

```bash
IO=/tmp/boorie-driver
echo "launch" >> $IO/cmd.txt
timeout 120 bash -c "until grep -q launched $IO/out.txt; do sleep 1; done"
tail -5 $IO/out.txt
```

Las capturas van a `/tmp/boorie-driver/shots/` (o `SCREENSHOT_DIR`).
**Míralas de verdad**: un marco en blanco es un fallo de arranque.

### Comandos

| comando | qué hace |
|---|---|
| `launch` | arranca la app y espera a que haya ventana |
| `click <sel>` | click real de Playwright (el bueno, ver Trampas) |
| `clicktext <texto>` | click por texto visible |
| `set <sel> :: <valor>` | escribe en un input controlado por React |
| `waitfor <sel>` | espera a que exista el selector, 30 s |
| `scrollto <texto>` | lleva a la vista el elemento que empieza por ese texto |
| `ss [nombre]` | captura a `shots/<nombre>.png` |
| `text [sel]` | vuelca `innerText` |
| `evaljs <expr>` | evalúa en la página y devuelve JSON |
| `windows` | lista las ventanas |
| `quit` | cierra la app y termina |

## Llegar a la red hidráulica

La ruta que sirve para casi todo lo de WNTR:

```bash
IO=/tmp/boorie-driver
echo "waitfor button:has-text('.inp')" >> $IO/cmd.txt   # la restauración es asíncrona
echo "clicktext villa_100_casas.inp"   >> $IO/cmd.txt   # carga la red guardada
sleep 12
echo "click [role=tab][title=Resilience]" >> $IO/cmd.txt
```

Pestañas disponibles por `title`: `Simulation`, `Analysis`, `Resilience`, `Layers`.

Las redes guardadas viven en la base SQLite, no en disco. Para sacar un `.inp`
y contrastar por CLI lo que muestra la interfaz:

```bash
python3 -c "
import sqlite3
c=sqlite3.connect('prisma/hydraulic.db')
print(c.execute(\"select fileContent from hydraulic_networks where name='villa_100_casas.inp'\").fetchone()[0])
" > /tmp/boorie-driver/red.inp
```

## Trampas

- **Radix ignora el `.click()` del DOM.** Pestañas, selects y diálogos escuchan
  `pointerdown` y sólo reaccionan a eventos de confianza. Despachar `MouseEvent`
  a mano tampoco vale. Usa `click`, que va por `page.click()` de Playwright.
- **Los inputs son controlados por React.** Asignar `.value` no dispara
  `onChange` y el estado no cambia. `set` usa el setter nativo del prototipo más
  un evento `input`, que es lo que React escucha.
- **La restauración del proyecto activo es asíncrona.** Justo tras `launch` la
  vista de proyectos todavía está vacía y un click sobre la red guardada da
  `NOT_FOUND`. Espera al selector, no a un `sleep` fijo.
- **Un solo driver a la vez.** Dos procesos consumen el mismo `cmd.txt`, cada uno
  lanza su propia app y acabas observando una instancia mientras tocas la otra.
  El driver pone un cerrojo en `driver.pid`; si aborta sucio, bórralo.
- **`pkill -f driver.mjs` mata tu propia shell**, porque su línea de comandos
  contiene el patrón. Usa `pkill -f 'driver[.]mjs'` o mata por PID.
- **Vite tarda en el primer arranque** (optimiza dependencias). Espera al
  `curl`, no a un `sleep`.

## Cierre

```bash
IO=/tmp/boorie-driver
echo "quit" >> $IO/cmd.txt; sleep 3
ps -eo pid,args | grep -E '[e]lectron/dist|[d]river\.mjs' | awk '{print $1}' | xargs -r kill -9
ps -eo pid,args | grep '[v]ite' | grep boorie | awk '{print $1}' | xargs -r kill
```

## Camino humano

`npm run dev` levanta Vite y Electron juntos con recarga en caliente. Es lo
cómodo para una persona, pero no deja conducir la interfaz desde un agente.
