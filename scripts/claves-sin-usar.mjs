// Qué claves del diccionario no usa nadie.
import fs from 'node:fs'
import path from 'node:path'

const dic = JSON.parse(fs.readFileSync('src/locales/es.json', 'utf8'))
const rutas = []
const recorrer = (o, prefijo) => {
  for (const [k, v] of Object.entries(o)) {
    const r = prefijo ? `${prefijo}.${k}` : k
    if (v && typeof v === 'object') recorrer(v, r)
    else rutas.push(r)
  }
}
recorrer(dic, '')

const ficheros = []
const andar = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) andar(p)
    else if (/\.(tsx?|mjs)$/.test(e.name) && !p.includes('locales')) ficheros.push(p)
  }
}
andar('src')
andar('backend')
const codigo = ficheros.map((f) => fs.readFileSync(f, 'utf8')).join('\n')

// Una clave puede usarse entera —t('a.b')— o construida —t(`a.${x}`)—, así que
// una raíz interpolada salva a todas sus hijas.
const interpoladas = [...codigo.matchAll(/t\(`([\w.]+)\$\{/g)].map((m) => m[1]).filter(Boolean)
const sinUsar = rutas.filter((r) => {
  const base = r.replace(/_(one|other)$/, '')
  if (codigo.includes(`'${base}'`) || codigo.includes(`"${base}"`) || codigo.includes('`' + base + '`')) return false
  return !interpoladas.some((i) => base.startsWith(i))
})
console.log(`claves: ${rutas.length}  ·  sin usar: ${sinUsar.length}`)
for (const r of sinUsar) console.log('  ' + r)
