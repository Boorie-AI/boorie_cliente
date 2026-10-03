// Lanza la batería de evaluación del RAG (#226) sin Electron ni compilar: Vite
// resuelve los alias y el TypeScript igual que en la app. Ver docs/BATERIA_RAG.md.
import path from 'path'
import { runnerImport } from 'vite'

const raiz = path.resolve(import.meta.dirname, '..')
const { module } = await runnerImport(path.join(raiz, 'src/services/chat/evalRag/ejecutor.ts'), {
  root: raiz,
  configFile: false,
  logLevel: 'error',
  resolve: {
    alias: [
      { find: /^pdf-parse$/, replacement: path.join(raiz, 'src/services/chat/evalRag/pdfParseSinDepuracion.ts') },
      { find: '@', replacement: path.join(raiz, 'src') },
    ],
  },
})
process.exitCode = await module.main(process.argv.slice(2))
