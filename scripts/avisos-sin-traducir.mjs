// Los avisos que se le dan al usuario desde una llamada —alert, setError,
// showNotification— no están entre `>` y `<` ni son atributos, así que ni el
// inventario ni el barrido de texto mezclado los ven. Aquí sí.
import fs from 'node:fs'
import path from 'node:path'

const ficheros = []
const andar = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) andar(p)
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) ficheros.push(p)
  }
}
andar('src')
const todo = ficheros.map((f) => fs.readFileSync(f, 'utf8')).join('\n')
const vivo = (p) => {
  if (!p.endsWith('.tsx')) return true
  const n = path.basename(p, '.tsx')
  return new RegExp(`from '[^']*/${n}'|from '\\./${n}'`).test(todo)
}

// Dos formas: comillas simples, y plantilla —que puede llevar comillas dentro
// de una interpolación, así que no vale el mismo patrón para las dos.
const LLAMADAS = [
  /\b(?:window\.)?(alert|confirm|showNotification|setError|setMensaje|setAviso|setStatus|setPythonMessage|toast)\(\s*'((?:[^'\\]|\\.)*)'/g,
  /\b(?:window\.)?(alert|confirm|showNotification|setError|setMensaje|setAviso|setStatus|setPythonMessage|toast)\(\s*`((?:[^`\\]|\\.)*)`/g,
]
let total = 0
for (const f of ficheros.filter(vivo)) {
  const src = fs.readFileSync(f, 'utf8')
  const halladas = []
  for (const m of LLAMADAS.flatMap((r) => [...src.matchAll(r)])) {
    const texto = m[2].replace(/\$\{[^}]*\}/g, '…').trim()
    if (texto.length < 8 || !/\s/.test(texto)) continue
    const linea = src.slice(0, m.index).split('\n').length
    halladas.push(`${linea}: ${m[1]}: ${texto.slice(0, 90)}`)
  }
  if (halladas.length) {
    total += halladas.length
    console.log(`\n${f} (${halladas.length})`)
    for (const h of halladas) console.log('   ' + h)
  }
}
console.log(`\navisos sin diccionario: ${total}`)
