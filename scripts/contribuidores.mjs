// Rehace la lista de quienes han escrito código en docs/CONTRIBUTORS.md a
// partir del historial de git. Las identidades de una misma persona se juntan
// en .mailmap. Sólo toca lo que hay entre las dos marcas: lo de fuera se
// escribe a mano.
//
// Sólo lleva la persona y su primera contribución, que no cambian con cada
// commit: con el número de commits o la última fecha, la lista quedaba atrás
// en cuanto se integraba cualquier cosa y --comprobar fallaba siempre.
//
//   npm run contribuidores               reescribe la lista
//   npm run contribuidores -- --comprobar  sale con 1 si no está al día
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const FICHERO = 'docs/CONTRIBUTORS.md'
const INICIO = '<!-- contribuidores:inicio -->'
const FIN = '<!-- contribuidores:fin -->'
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre']

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

// En un clon superficial, como el del checkout del CI, faltaría casi todo el historial.
if (git('rev-parse', '--is-shallow-repository') === 'true') {
  console.error('El repositorio es un clon superficial: la lista saldría incompleta. `git fetch --unshallow` primero.')
  process.exit(2)
}

const personas = new Map()
for (const linea of git('log', '--use-mailmap', '--no-merges', '--format=%aN\t%ad', '--date=format:%Y-%m', 'HEAD').split('\n')) {
  const [nombre, mes] = linea.split('\t')
  const p = personas.get(nombre) ?? { nombre, desde: mes }
  if (mes < p.desde) p.desde = mes
  personas.set(nombre, p)
}

const mes = (aaaamm) => {
  const [a, m] = aaaamm.split('-')
  return `${MESES[Number(m) - 1]} de ${a}`
}

// Por orden de llegada al proyecto.
const filas = [...personas.values()]
  .sort((a, b) => a.desde.localeCompare(b.desde) || a.nombre.localeCompare(b.nombre, 'es'))
  .map(p => `| ${p.nombre} | ${mes(p.desde)} |`)

const bloque = [
  INICIO,
  '| Persona | Desde |',
  '|---|---|',
  ...filas,
  FIN,
].join('\n')

const actual = fs.readFileSync(FICHERO, 'utf8')
const i = actual.indexOf(INICIO)
const f = actual.indexOf(FIN)
if (i < 0 || f < i) {
  console.error(`${FICHERO} no tiene las marcas ${INICIO} y ${FIN}.`)
  process.exit(2)
}
const nuevo = actual.slice(0, i) + bloque + actual.slice(f + FIN.length)

if (process.argv.includes('--comprobar')) {
  if (nuevo !== actual) {
    console.error(`${FICHERO} no está al día: \`npm run contribuidores\`.`)
    process.exit(1)
  }
  console.log(`${FICHERO} al día (${filas.length} personas).`)
} else {
  fs.writeFileSync(FICHERO, nuevo)
  console.log(`${FICHERO}: ${filas.length} personas.`)
}
