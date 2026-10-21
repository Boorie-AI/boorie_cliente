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

  // Clic de ratón sin las comprobaciones de `click`: es lo que hace una persona,
  // y así se ve si algo encima se traga el evento (#215). Sintaxis: mouse <x> <y>
  async mouse(arg) {
    const [x, y] = arg.trim().split(/\s+/).map(Number);
    // Se mira antes del clic: después, el elemento puede haber cambiado (un
    // interruptor que pasa de «<<» a «>>») y el informe mentiría.
    const destino = await page.evaluate(([px, py]) => {
      const el = document.elementFromPoint(px, py);
      return el ? `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 40)}"` : '(nada)';
    }, [x, y]);
    await page.mouse.click(x, y);
    log('mouse', x, y, '->', destino);
  },

  async waitfor(sel) {
    try { await page.waitForSelector(sel, { timeout: 30_000 }); log('presente:', sel); }
    catch { log('TIMEOUT esperando', sel); }
  },
  async ss(name) {
    const f = path.join(SHOTS, (name || `ss-${process.hrtime.bigint()}`) + '.png');
    // page.screenshot recorta a la esquina superior izquierda cuando hay
    // setZoomFactor; capturePage saca la ventana entera en píxeles físicos.
    const png = await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find(x => !x.webContents.getURL().startsWith('devtools://'));
      return (await win.webContents.capturePage()).toPNG().toString('base64');
    });
    fs.writeFileSync(f, Buffer.from(png, 'base64'));
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
  // Los diálogos nativos no se pueden conducir, y teclear en ellos por XTest
  // acabó con un Ctrl pegado mandando atajos a otras ventanas del escritorio.
  // Esto sustituye showOpenDialog en el main: el siguiente diálogo devuelve esta ruta.
  async pickfile(p) {
    await app.evaluate(({ dialog }, f) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] });
    }, p.trim());
    log('pickfile ->', p.trim());
  },
  // Tamaño del área de contenido, no del marco: así el viewport es el pedido.
  // La ventana tiene minWidth/minHeight (800×600) y el gestor de ventanas puede
  // recortar a la pantalla, por eso se devuelve el tamaño que quedó de verdad.
  // Sintaxis: resize <ancho> <alto>
  async resize(arg) {
    const [w, h] = arg.trim().split(/\s+/).map(Number);
    // La app se maximiza al mostrarse (electron/main.ts) y el gestor de ventanas
    // tarda en soltarlo; mientras, setContentSize se ignora aunque getContentSize
    // diga que sí. Por eso se mide en la página y se reintenta hasta que cuadre
    // o se vea que la pantalla no da para más.
    let vw = 0, vh = 0;
    for (let i = 0; i < 5; i++) {
      await app.evaluate(({ BrowserWindow }, [cw, ch]) => {
        const win = BrowserWindow.getAllWindows().find(x => !x.webContents.getURL().startsWith('devtools://'));
        if (win.isFullScreen()) win.setFullScreen(false);
        if (win.isMaximized()) win.unmaximize();
        win.setContentSize(cw, ch);
        // Sin valor de vuelta, Playwright a veces da «Resulting promise was garbage collected».
        return true;
      }, [w, h]);
      await new Promise(r => setTimeout(r, 800));
      [vw, vh] = await page.evaluate(() => [innerWidth, innerHeight]);
      if (Math.abs(vw - w) <= 1 && Math.abs(vh - h) <= 1) break;
    }
    const recortado = Math.abs(vw - w) > 1 || Math.abs(vh - h) > 1 ? ` (recortado: pedido ${w}×${h})` : '';
    log('resize', w, h, '-> viewport', JSON.stringify([vw, vh]) + recortado);
  },
  // Simula el escalado del sistema (125 %, 150 %): con zoom 1.5 una ventana de
  // 1920 px deja 1280 px CSS, que es lo que ve un portátil con escalado.
  // Sintaxis: zoom <factor>
  async zoom(arg) {
    const f = Number(arg.trim() || '1');
    await app.evaluate(({ BrowserWindow }, z) => {
      for (const win of BrowserWindow.getAllWindows()) win.webContents.setZoomFactor(z);
      return true;
    }, f);
    await new Promise(r => setTimeout(r, 800));
    log('zoom', f, '-> viewport CSS', JSON.stringify(await page.evaluate(() => [innerWidth, innerHeight])));
  },
  // Pistas de maquetación de lo que está a la vista; no sustituyen a mirar la captura.
  // Con un diálogo abierto solo se audita el diálogo, y de cada desborde se da
  // el elemento más externo, no todos sus descendientes.
  async audit() {
    log(JSON.stringify(await page.evaluate(() => {
      const vw = innerWidth, vh = innerHeight;
      const dialogos = [...document.querySelectorAll('[role=dialog][data-state=open],[role=alertdialog][data-state=open]')];
      const raiz = dialogos.at(-1) ?? document.body;
      const visible = el => {
        if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const desc = el => {
        const t = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        const r = el.getBoundingClientRect();
        return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} "${t}" @${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)}`;
      };
      const exteriores = lista => { const set = new Set(lista); return lista.filter(el => !set.has(el.parentElement)); };
      const recorta = s => /hidden|clip/.test(s.overflowX + s.overflowY);
      const todos = [...raiz.querySelectorAll('*')].filter(visible);
      // Lo que queda fuera de la ventana sin que ningún contenedor con scroll
      // permita llegar a ello: el usuario no lo puede ver de ninguna forma.
      const dentroDeScroll = el => {
        for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
          const s = getComputedStyle(p);
          if (/auto|scroll/.test(s.overflowX + s.overflowY) && (p.scrollWidth > p.clientWidth || p.scrollHeight > p.clientHeight)) return true;
        }
        return false;
      };
      const inalcanzable = el => {
        const r = el.getBoundingClientRect();
        return !dentroDeScroll(el) && (r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1);
      };
      const enVista = el => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw; };
      const fuera = exteriores(todos.filter(el => getComputedStyle(el).position !== 'fixed' && inalcanzable(el)));
      // Se sale de su contenedor más cercano que recorta: queda cortado aunque esté en la ventana.
      const cortado = exteriores(todos.filter(el => {
        const r = el.getBoundingClientRect();
        for (let p = el.parentElement; p && p !== raiz.parentElement; p = p.parentElement) {
          const s = getComputedStyle(p);
          if (/auto|scroll/.test(s.overflowX + s.overflowY)) return false;
          if (!recorta(s)) continue;
          const q = p.getBoundingClientRect();
          return r.right > q.right + 1 || r.bottom > q.bottom + 1;
        }
        return false;
      }));
      const vistos = todos.filter(enVista);
      const recortado = vistos.filter(el => {
        const s = getComputedStyle(el);
        return el.children.length === 0 && el.textContent.trim() && el.scrollWidth > el.clientWidth + 1
          && (recorta(s) || s.textOverflow === 'ellipsis') && !el.closest('[title]');
      });
      const interactivos = vistos.filter(el => el.matches('button,a[href],input,select,textarea,[role=button],[role=tab],[role=checkbox],[role=switch]'));
      // Dentro de un <label>, lo que se pulsa es la etiqueta entera, no el control.
      const pequenos = interactivos.filter(el => {
        const r = (el.closest('label') ?? el).getBoundingClientRect();
        return r.width < 24 || r.height < 24;
      });
      const sinNombre = interactivos.filter(el => !el.matches('input[type=hidden]')
        && !(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || el.textContent.trim()
          || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest('label')?.textContent.trim()
          || el.getAttribute('placeholder')));
      // El contenedor raíz lleva overflow-hidden, así que el documento nunca
      // hace scroll aunque su contenido sea más ancho que la ventana.
      const anchoContenido = Math.max(0, ...[...document.body.querySelectorAll('*')]
        .filter(el => visible(el) && getComputedStyle(el).position !== 'fixed' && !dentroDeScroll(el))
        .map(el => el.getBoundingClientRect().right));
      const max = 12;
      return {
        viewport: [vw, vh],
        auditado: raiz === document.body ? 'página' : 'diálogo abierto',
        contenidoMasAnchoQueVentana: anchoContenido > vw + 1 ? Math.round(anchoContenido - vw) + ' px' : false,
        fueraDeLaVentana: fuera.slice(0, max).map(desc), nFuera: fuera.length,
        cortadoPorContenedor: cortado.slice(0, max).map(desc), nCortado: cortado.length,
        textoRecortadoSinTitle: recortado.slice(0, max).map(desc), nRecortado: recortado.length,
        objetivosMenoresDe24px: pequenos.slice(0, max).map(desc), nPequenos: pequenos.length,
        interactivosSinNombre: sinNombre.slice(0, max).map(desc), nSinNombre: sinNombre.length,
      };
    })));
  },
  async windows() {
    for (const w of app.windows()) log(' ', w.url());
  },
  // Teclado real de Playwright: Tab, Escape, Enter, Shift+Tab, Control+K…
  // Devuelve qué tiene el foco después, que es lo que interesa al probar.
  async key(combo) {
    await page.keyboard.press(combo.trim());
    await new Promise(r => setTimeout(r, 200));
    log('key', combo.trim(), '-> foco', await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return '(body)';
      const r = el.getBoundingClientRect();
      return `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)}" @${Math.round(r.x)},${Math.round(r.y)}`;
    }));
  },
  // Lo que hace la «x»: pide cerrar la ventana, y la app enseña su aviso de
  // salida (#278) en vez de cerrarse. Para salir de verdad, `quit`.
  async close() {
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().find(x => !x.webContents.getURL().startsWith('devtools://'))?.close();
      return true;
    });
    log('close -> pedido');
  },
  // app.close() dispara el close de la ventana, que pide confirmación al salir
  // y deja el driver esperando para siempre; app.exit no pasa por ahí.
  async quit() {
    if (app) {
      await app.evaluate(({ app: a }) => a.exit(0)).catch(() => {});
      await app.close().catch(() => {});
    }
    log('bye'); process.exit(0);
  },
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
