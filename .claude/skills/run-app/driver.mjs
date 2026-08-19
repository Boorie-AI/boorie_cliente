// REPL para conducir Boorie (Electron + Vite) desde un agente.
// Los comandos entran por un fichero y la salida sale por otro, para poder
// iterar sin relanzar la app (arrancar cuesta ~25 s con la restauración del
// proyecto activo).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';

const APP_DIR = path.resolve(import.meta.dirname, '..', '..', '..');
const IO = process.env.BOORIE_DRIVER_IO || '/tmp/boorie-driver';
const CMD = path.join(IO, 'cmd.txt');
const OUT = path.join(IO, 'out.txt');
const SHOTS = process.env.SCREENSHOT_DIR || path.join(IO, 'shots');
const LOCK = path.join(IO, 'driver.pid');

fs.mkdirSync(SHOTS, { recursive: true });

// Dos drivers vivos consumen el mismo cmd.txt y cada uno lanza su propia app:
// los comandos se ejecutan por duplicado sobre instancias distintas y el estado
// que observas no es el que estás tocando. Pasó de verdad; de ahí el cerrojo.
if (fs.existsSync(LOCK)) {
  const old = Number(fs.readFileSync(LOCK, 'utf8'));
  try { process.kill(old, 0); console.error(`Ya hay un driver vivo (pid ${old}). Mátalo o borra ${LOCK}.`); process.exit(1); }
  catch { /* pid muerto, seguimos */ }
}
fs.writeFileSync(LOCK, String(process.pid));
process.on('exit', () => { try { fs.unlinkSync(LOCK); } catch {} });

// playwright-core no es dependencia del repo: se busca donde se haya instalado.
const require_ = createRequire(import.meta.url);
let electron;
try { ({ _electron: electron } = require_('playwright-core')); }
catch { console.error('Falta playwright-core. Ver SKILL.md (Requisitos).'); process.exit(1); }

fs.writeFileSync(CMD, ''); fs.writeFileSync(OUT, '');
const log = (...a) => fs.appendFileSync(OUT, a.join(' ') + '\n');

let app = null, page = null;

const REACT_SET = `(sel, val) => {
  const el = document.querySelector(sel);
  if (!el) return 'NOT_FOUND';
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return 'OK';
}`;

const C = {
  async launch() {
    if (app) return log('ya lanzada');
    app = await electron.launch({
      executablePath: path.join(APP_DIR, 'node_modules/electron/dist/electron'),
      args: ['--no-sandbox', APP_DIR],
      cwd: APP_DIR,
      env: { ...process.env, DISPLAY: process.env.DISPLAY || ':1', NODE_ENV: 'development' },
      timeout: 60_000,
    });
    page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await new Promise(r => setTimeout(r, 6000));
    page = app.windows().find(w => !w.url().startsWith('devtools://')) ?? page;
    log('launched. windows:', app.windows().map(w => w.url()).join(' | '));
  },

  // Radix (pestañas, selects) ignora el .click() del DOM: escucha pointerdown
  // y sólo reacciona a eventos de confianza. Este es el click bueno por defecto.
  async click(sel) {
    try { await page.click(sel, { timeout: 10_000 }); log('click', sel, '-> OK'); }
    catch (e) { log('click', sel, '-> FAIL:', e.message.split('\n')[0]); }
  },
  // Prioriza lo accionable: buscar por texto suelto engancha antes el párrafo
  // descriptivo que el botón que lleva el mismo nombre de fichero.
  async clicktext(t) {
    for (const loc of [page.getByRole('button', { name: t }), page.getByRole('link', { name: t }), page.getByText(t, { exact: false })]) {
      try { await loc.first().click({ timeout: 5_000 }); return log('clicktext', t, '-> OK'); }
      catch { /* siguiente estrategia */ }
    }
    log('clicktext', t, '-> FAIL: sin elemento accionable');
  },

  // Los inputs son controlados por React: asignar .value no dispara onChange.
  // Sintaxis: set <selector> :: <valor>   (el selector puede llevar '=')
  async set(spec) {
    const [sel, ...rest] = spec.split(' :: ');
    if (!rest.length) return log('uso: set <selector> :: <valor>');
    log('set', sel, '->', await page.evaluate(
      ([s, v, fn]) => new Function('return ' + fn)()(s, v),
      [sel.trim(), rest.join(' :: '), REACT_SET]
    ));
  },

  // Rueda real de Playwright: Mapbox y los <select> nativos responden a eventos
  // de confianza, y un WheelEvent despachado a mano no siempre basta.
  // Sintaxis: wheel <x> <y> <deltaY> [veces]
  async wheel(arg) {
    const [x, y, dy, veces = '1'] = arg.trim().split(/\s+/);
    await page.mouse.move(Number(x), Number(y));
    for (let i = 0; i < Number(veces); i++) {
      await page.mouse.wheel(0, Number(dy));
      await new Promise(r => setTimeout(r, 120));
    }
    log('wheel', arg, '-> OK');
  },

  async waitfor(sel) {
    try { await page.waitForSelector(sel, { timeout: 30_000 }); log('presente:', sel); }
    catch { log('TIMEOUT esperando', sel); }
  },
  async ss(name) {
    const f = path.join(SHOTS, (name || `ss-${process.hrtime.bigint()}`) + '.png');
    await page.screenshot({ path: f });
    log('screenshot:', f);
  },
  async text(sel) {
    log(await page.evaluate(s => (s ? document.querySelector(s) : document.body)?.innerText ?? '(null)', sel || null));
  },
  async evaljs(expr) {
    try { log(JSON.stringify(await page.evaluate(expr))); } catch (e) { log('ERROR:', e.message.split('\n')[0]); }
  },
  async scrollto(text) {
    log('scrollto', text, '->', await page.evaluate(t => {
      const el = [...document.querySelectorAll('h1,h2,h3,h4,div')].find(e => e.textContent?.trim().startsWith(t));
      if (!el) return 'NOT_FOUND';
      el.scrollIntoView({ block: 'start' }); return 'OK';
    }, text));
  },
  async windows() {
    for (const w of app.windows()) log(' ', w.url());
  },
  async quit() { if (app) await app.close().catch(() => {}); log('bye'); process.exit(0); },
};

let seen = 0, busy = false;
setInterval(async () => {
  if (busy) return;                    // sin esto los comandos se solapan
  busy = true;
  try {
    const lines = fs.readFileSync(CMD, 'utf8').split('\n').filter(Boolean);
    while (seen < lines.length) {
      const line = lines[seen++];
      const i = line.indexOf(' ');
      const cmd = i < 0 ? line : line.slice(0, i);
      const arg = i < 0 ? '' : line.slice(i + 1);
      log('$ ' + line);
      if (cmd !== 'launch' && !page) { log('ERROR: lanza la app primero'); continue; }
      try { await (C[cmd] ?? (async () => log('comando desconocido:', cmd)))(arg); }
      catch (e) { log('ERROR:', e.message.split('\n')[0]); }
    }
  } catch { /* cmd.txt aún no existe */ }
  finally { busy = false; }
}, 400);

log('driver ready');
