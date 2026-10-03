import { createRequire } from 'module'

// Cargado desde ESM, pdf-parse cree que lo ejecutan directamente (module.parent
// vacío) y corre su prueba de depuración, que lee un PDF que no existe. La app
// lo carga con require y no le pasa; la batería entra por lib/ y se la salta.
const requerir = createRequire(import.meta.url)
export default requerir('pdf-parse/lib/pdf-parse.js') as typeof import('pdf-parse')
