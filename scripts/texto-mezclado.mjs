// Texto castellano mezclado con expresiones: lo que el inventario no ve porque
// no está limpio entre `>` y `<`.
import fs from 'node:fs'
import path from 'node:path'

const ficheros = []
const andar = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) andar(p)
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) && !p.includes('locales')) ficheros.push(p)
  }
}
andar('src')
const todo = ficheros.map((f) => fs.readFileSync(f, 'utf8')).join('\n')
const vivo = (p) => {
  if (!p.endsWith('.tsx')) return true
  const n = path.basename(p, '.tsx')
  return new RegExp(`from '[^']*/${n}'|from '\\./${n}'`).test(todo)
}

const ES = /\b(el|la|los|las|un|una|de|del|que|para|con|sin|por|no|se|su|sus|más|como|este|esta|hay|ya|todavía|cuando|desde|entre|sobre|nudos?|redes?|tuberías?|proyectos?|simulaci[oó]n\w*|versi[oó]n\w*|carpeta|archivo|documento\w*)\b/i
const ACENTO = /[áéíóúñ¿¡]/

for (const f of ficheros.filter(vivo)) {
  const lineas = fs.readFileSync(f, 'utf8').split('\n')
  const halladas = []
  lineas.forEach((l, i) => {
    const t = l.trim()
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
    if (/logger\.|console\./.test(t)) return
    // texto suelto en JSX o dentro de una plantilla, con marca de castellano
    const trozos = [...t.matchAll(/[>}]\s*([^<>{}\n]*[a-zA-ZáéíóúñÁÉÍÓÚÑ][^<>{}\n]*)/g)].map((m) => m[1])
      .concat([...t.matchAll(/`([^`]*[a-zA-ZáéíóúñÁÉÍÓÚÑ][^`]*)`/g)].map((m) => m[1]))
    for (const c of trozos) {
      const limpio = c.replace(/\$\{[^}]*\}/g, ' ').trim()
      if (limpio.length < 6) continue
      if (!(ACENTO.test(limpio) || ES.test(limpio))) continue
      if (/^[\w.-]+$/.test(limpio)) continue
      halladas.push(`${i + 1}: ${limpio.slice(0, 90)}`)
    }
  })
  if (halladas.length) {
    console.log(`\n${f} (${halladas.length})`)
    for (const h of halladas) console.log('   ' + h)
  }
}
