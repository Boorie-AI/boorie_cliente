#!/usr/bin/env node
/**
 * Cuenta los textos de interfaz que están escritos a mano en el código, fuera
 * del sistema de traducción, y en qué idioma están (#96).
 *
 * Existe para poder repetir la medida: la corrección va por tandas, y sin una
 * cifra que baje no hay forma de saber si una tanda ha avanzado o sólo ha
 * movido código. `node scripts/inventario-idiomas.mjs` imprime el total y el
 * reparto por componente; con `--lista <fichero>` saca las cadenas de uno.
 *
 * No pretende ser exacto: es una regla, no un microscopio. Cuenta de más en
 * cadenas cortas que son iguales en los dos idiomas («Total», «Boorie») y de
 * menos en texto construido por trozos. Sirve para comparar una medida con la
 * siguiente, que es para lo que se usa.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = 'src'

const ficheros = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? ficheros(p) : p.endsWith('.tsx') && !p.includes('.test.') ? [p] : []
  })

const todos = ficheros(RAIZ)
const fuente = new Map(todos.map((p) => [p, readFileSync(p, 'utf8')]))
const todoElCodigo = [...fuente.values()].join('\n')

/** Un componente que nadie importa no se le enseña a nadie: no cuenta. */
const vivo = (p) => {
  const n = p.split('/').pop().replace('.tsx', '')
  if (n === 'App' || n === 'main') return true
  return new RegExp(`from '[^']*/${n}'|from '\\./${n}'`).test(todoElCodigo)
}

const ENTRE = />\s*([A-Za-zÁÉÍÓÚÑáéíóúñ][^<>{}\n]{2,80}?)\s*</g
const ATRIBUTO = /(?:placeholder|title|aria-label|label)="([^"{}\n]{3,80})"/g
/** Siglas, cifras, unidades y URLs no son texto que traducir. */
const RUIDO = /^(?:[A-Z0-9_\-.]{1,12}|https?:\/\/|nvapi|[\d\s.,%/·—-]+|m³.*|l\/s|kWh|PGV.*|EPSG.*)$/
const MARCA_ES = /[áéíóúñ¿¡Á-Ú]/
const FUNCIONALES_ES = new Set(
  'de la el los las un una para con sin por al del y o que se su sus no hay más como este esta cada'.split(' ')
)
/**
 * Palabras que sólo aparecen en inglés. Sirven para separar los dos problemas,
 * que no son el mismo ni tienen la misma urgencia: un texto en inglés se ve mal
 * ahora mismo en una aplicación que se usa en español; uno en castellano escrito
 * a mano se ve bien hoy y sólo rompe al cambiar de idioma.
 */
const PALABRAS_EN = new Set(
  ('the and of with for from your this that new create delete edit save load export import search settings ' +
   'results calculation network flow head loss pumps tanks water quality analysis simulation parameters input ' +
   'output enter click node link pipe velocity pressure duration status completed error warning steps ' +
   'reference options history previous appear here powered engine scientific professional hydraulic project ' +
   'name type location details additional notes budget manager country city region select cancel close open ' +
   'add remove show hide view chart graph data preview health clusters providers available token url test ' +
   'move keep general conversation conversations chat message messages').split(' ')
)

const esEspanol = (c) =>
  MARCA_ES.test(c) || c.toLowerCase().match(/[a-záéíóúñ]+/g)?.some((p) => FUNCIONALES_ES.has(p))

const pareceIngles = (c) =>
  !esEspanol(c) && (c.toLowerCase().match(/[a-z]+/g) ?? []).some((p) => PALABRAS_EN.has(p))

const porFichero = new Map()
let espanol = 0, otro = 0, ingles = 0

for (const p of todos.filter(vivo)) {
  const src = fuente.get(p)
  const cadenas = new Set()
  for (const m of src.matchAll(ENTRE)) if (!m[1].startsWith('{')) cadenas.add(m[1].trim())
  for (const m of src.matchAll(ATRIBUTO)) cadenas.add(m[1].trim())

  const fuera = [...cadenas].filter((c) => c && !RUIDO.test(c))
  const noEspanol = fuera.filter((c) => !esEspanol(c))
  const enIngles = fuera.filter(pareceIngles)
  espanol += fuera.length - noEspanol.length
  otro += noEspanol.length
  ingles += enIngles.length
  if (fuera.length) porFichero.set(p, { fuera, enIngles })
}

const argLista = process.argv.indexOf('--lista')
if (argLista !== -1) {
  const objetivo = process.argv[argLista + 1]
  for (const [p, { fuera, enIngles }] of porFichero) {
    if (!p.includes(objetivo)) continue
    console.log(`\n${p} — ${fuera.length} textos fuera del diccionario (${enIngles.length} en inglés):`)
    for (const c of fuera.sort()) console.log(`  ${enIngles.includes(c) ? 'EN' : '  '}  ${c}`)
  }
  process.exit(0)
}

const conI18n = todos.filter(vivo).filter((p) => fuente.get(p).includes('useTranslation')).length
console.log(`textos escritos a mano, fuera del diccionario: ${espanol + otro}`)
console.log(`  de ellos, en inglés: ${ingles}   <- se ven mal hoy, en una aplicación que se usa en español`)
console.log(`  el resto está en castellano: ${espanol + otro - ingles}   <- se ve bien hoy y rompe al cambiar de idioma`)
console.log(`componentes vivos: ${todos.filter(vivo).length}  ·  con i18n: ${conI18n}`)
console.log('\nreparto (total fuera del diccionario / de ellos en inglés):')
for (const [p, v] of [...porFichero].sort((a, b) => b[1].enIngles.length - a[1].enIngles.length).slice(0, 15)) {
  console.log(`  ${String(v.fuera.length).padStart(3)} / ${String(v.enIngles.length).padStart(3)} en inglés   ${p.replace('src/components/', '')}`)
}
