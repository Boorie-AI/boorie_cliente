# Sección «Acerca de» con historial de versiones

Diseño y decisiones de la funcionalidad pedida en el [issue #30](https://github.com/Boorie-AI/boorie_cliente/issues/30).

Se entrega dentro de la rama `fix/wisdom-reindex`, junto al resto del trabajo de la v1.5.1, por petición expresa: son ajustes solicitados antes de cerrar el PR.

## Qué se construye

Una pestaña **«Acerca de»** al final del panel de Configuración, con dos bloques:

1. **Identidad de la aplicación** — versión instalada, fecha de compilación y canal.
2. **Historial de versiones** — línea de tiempo descendente, con versión, fecha y resumen de cambios.

## Qué NO se construye

Descartado explícitamente en esta entrega, para acotar el alcance:

| Fuera de alcance | Motivo |
|---|---|
| Versión en la barra lateral | Complementario; no está en los criterios de aceptación |
| Menú «Ayuda → Acerca de» | Obligaría a sustituir el `role: 'about'` de macOS para no dejar dos diálogos «Acerca de» distintos |
| Botón «Buscar actualizaciones» | `electron-updater` ya está integrado, pero abre la gestión de estados de descarga y error |
| Botón «Copiar información de versión» | No está en los criterios |

El mockup del issue muestra los dos últimos botones; no forman parte de esta entrega.

## Decisiones

### 1. La versión sale de `app.getVersion()`, no de una constante

Ya existía la fontanería: el handler `get-app-version` (`electron/main.ts`) expuesto como
`window.electronAPI.getAppVersion()`. No se añade IPC nueva.

`app.getVersion()` lee la versión de `package.json`, que es la misma que consume
electron-builder para nombrar el instalador. Así hay **una sola fuente de verdad** y la
pantalla no puede desincronizarse del artefacto entregado.

### 2. El historial vive en `CHANGELOG.md`, con parser propio

Alternativas consideradas:

| Opción | Descartada porque |
|---|---|
| JSON versionado en el repo | Más simple de renderizar, pero no sirve como notas de release ni se lee en GitHub |
| API de GitHub Releases | Necesita red: sin conexión la sección queda vacía. Además hoy el repo tiene tags pero no releases publicadas |
| Derivar de los tags de git | Un tag no trae resumen de cambios; derivarlo de los mensajes de commit da un resultado pobre |

Se elige `CHANGELOG.md` en formato [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
porque es la convención del sector, es legible en GitHub y sirve de origen para las notas
de cada release. El coste es mantener un parser, asumido a cambio de esas ventajas.

### 3. El markdown se resuelve en tiempo de compilación, no en runtime

`CHANGELOG.md` se importa con el sufijo `?raw` de Vite, de modo que su contenido queda
**dentro del bundle**. No se lee del disco al arrancar.

El motivo no es la comodidad: en la app empaquetada los recursos viven en `resources/`, de
solo lectura y con rutas distintas a las de desarrollo. Leer ficheros de ahí en runtime es
justo la clase de divergencia entre dev y producción que provocó la retirada de la v1.5.1-rc.7
(el cliente de Prisma empaquetado apuntaba a un motor distinto al declarado). Resolviendo en
compilación, si el fichero falta el build falla; nunca falla en el equipo del usuario.

### 4. Un error de formato no puede vaciar la sección en silencio

Es el riesgo real de parsear un fichero que se edita a mano: una cabecera mal escrita y esa
versión desaparece sin que nadie se entere. Dos defensas:

- **Tests del parser con entradas malformadas**, no solo con el camino feliz: cabecera sin
  fecha, versión sin cuerpo, fichero vacío, orden alterado.
- **Verificación de coherencia**: la entrada superior del `CHANGELOG.md` debe coincidir con
  la versión de `package.json`. Es la misma clase de comprobación que faltó en el rc.7, donde
  lo declarado y lo empaquetado no coincidían.

### 5. Historial inicial acotado a las 5 últimas versiones

El issue pide «historial completo». Hay **19 tags** en el repositorio y de ninguno existe un
resumen de cambios redactado: completarlos es trabajo de redacción, no de código, y es lo que
puede convertir tres días en dos semanas.

Se entregan las 5 últimas (`v1.5.1`, `v1.5.0`, `v1.4.4`, `v1.4.3`, `v1.4.2`), redactadas a
partir del historial de git, y el fichero queda preparado para añadir las anteriores cuando
haya criterio para resumirlas. **Es una desviación consciente del criterio de aceptación** y
debe validarse en la revisión.

### 6. La pestaña sí se localiza

A diferencia del panel WNTR —que tiene el texto en castellano codificado en el componente—,
el panel de Configuración ya usa i18next con claves `settings.*` en `es`, `ca` y `en`. Esta
pestaña sigue esa convención: todo su texto de interfaz pasa por `t()`.

El **contenido** del `CHANGELOG.md` no se traduce: son notas de release, se mantienen en un
solo idioma.

### 7. La fecha de compilación se inyecta en el build

No existía ninguna forma de conocerla. Se inyecta mediante `define` en `vite.config.ts`. No
puede calcularse en runtime: `new Date()` daría la fecha en que el usuario abre la app, no la
de la compilación.

## Proceso de release

**Al preparar cada versión, antes de empaquetar:**

1. Añadir la entrada nueva al principio de `CHANGELOG.md`, respetando el formato:

   ```markdown
   ## [1.5.2] - 2026-08-20

   Resumen en una o dos frases de lo que cambia para el usuario.

   - Detalle relevante
   - Otro detalle
   ```

2. Subir la versión de `package.json` al mismo número.
3. Comprobar que ambos coinciden: la verificación de coherencia falla si no.

**La fecha es la del merge a `main`, no la de la compilación del candidato.** Una versión
puede pasar por varios `rc` antes de entrar, y lo que el usuario ve como «fecha de la versión»
debe ser cuándo quedó liberada. Si el merge se retrasa respecto a lo previsto, hay que
actualizar la fecha antes de integrar: ninguna comprobación automática puede detectarlo,
porque una fecha pasada es sintácticamente válida.

El resumen se escribe **para el usuario final**, no para el equipo: qué cambia en su uso de
la aplicación, no qué ficheros se tocaron.

## Ficheros afectados

| Fichero | Papel |
|---|---|
| `CHANGELOG.md` | Fuente única del historial |
| `src/utils/changelog.ts` | Parser y tipos |
| `src/utils/changelog.test.ts` | Tests del parser, incluidas entradas malformadas |
| `src/components/settings/tabs/AboutTab.tsx` | La pestaña |
| `src/components/settings/SettingsPanel.tsx` | Registro de la pestaña |
| `src/locales/{es,ca,en}.json` | Claves `settings.about.*` |
| `vite.config.ts` | Inyección de la fecha de compilación |
| `.github/workflows/ci.yml` | Job que ejecuta la batería de tests |

## Nota sobre el CI

El criterio de aceptación exige que pasen «lint, tests y build». El CI **no ejecutaba la
batería de vitest**: corría lint, typecheck, `build:vite`, la integración de WNTR y
`build-electron` en matriz macOS/Ubuntu/Windows, pero nunca `npm test`.

Se añade el job correspondiente. Es un cambio pequeño en un fichero compartido, y conviene
saber que a partir de ahora un test roto en cualquier rama bloquea su PR.
