/**
 * Selector explícito del sistema de coordenadas de la red (#36).
 *
 * El EPSG es un dato del proyecto, no una deducción: esta ventana es donde el
 * ingeniero lo declara. La lista es una comodidad —cubre los 120 husos UTM y los
 * sistemas nacionales habituales—, pero acepta cualquier código escrito a mano,
 * porque la lista nunca va a estar completa.
 */

import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Globe2, Search } from 'lucide-react'
import { logger } from '@/utils/logger'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useProjectStore } from '@/stores/projectStore'
import {
  catalogoCRS,
  esEPSGSoportado,
  nombreCRS,
  normalizarEPSG,
  reproyectarLimites,
  validarCordura,
  type LimitesProyectados,
} from '@/services/geo/crs'

interface CRSSelectorProps {
  abierto: boolean
  onCerrar: () => void
  /** Límites de la red en sus coordenadas originales, para la previsualización. */
  limites: LimitesProyectados | null
  epsgActual: string | null
  /**
   * Red guardada sobre la que persistir. Sin ella la declaración vale sólo para
   * la sesión: una red recién importada y todavía sin guardar puede situarse en
   * el mapa, pero no hay dónde recordar el sistema hasta que se guarde.
   */
  networkId?: string | null
  onDeclarado: (epsg: string | null) => void
}

export function CRSSelector({
  abierto,
  onCerrar,
  limites,
  epsgActual,
  networkId,
  onDeclarado,
}: CRSSelectorProps) {
  const [busqueda, setBusqueda] = useState('')
  const [seleccion, setSeleccion] = useState<string | null>(epsgActual)
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)

  const paisProyecto = useProjectStore(s => s.currentProject?.location?.country ?? null)

  const catalogo = useMemo(() => catalogoCRS(), [])

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) {
      // Sin búsqueda se enseñan los sistemas con nombre propio: los 120 husos de
      // golpe no ayudan a nadie, y quien busca el suyo escribe «18N» o «32618».
      return catalogo.filter(c => !/^EPSG:32[67]\d{2}$/.test(c.epsg)).slice(0, 40)
    }
    return catalogo
      .filter(c => c.epsg.toLowerCase().includes(q) || c.nombre.toLowerCase().includes(q))
      .slice(0, 60)
  }, [busqueda, catalogo])

  /** Código escrito a mano que no está en el catálogo pero sí se puede usar. */
  const codigoLibre = useMemo(() => {
    const normalizado = normalizarEPSG(busqueda)
    if (!normalizado) return null
    if (catalogo.some(c => c.epsg === normalizado)) return null
    return esEPSGSoportado(normalizado) ? normalizado : null
  }, [busqueda, catalogo])

  /**
   * Previsualización: dónde cae la red con el sistema elegido, antes de aceptar.
   * Es la comprobación que convierte «EPSG:32614» en algo que un ingeniero puede
   * juzgar de un vistazo.
   */
  const vistaPrevia = useMemo(() => {
    if (!seleccion || !limites) return null
    try {
      const { centroide } = reproyectarLimites(limites, seleccion)
      return { centroide, cordura: validarCordura(centroide, paisProyecto) }
    } catch (e) {
      return {
        centroide: null,
        cordura: { ok: false, aviso: e instanceof Error ? e.message : 'Reproyección fallida' },
      }
    }
  }, [seleccion, limites, paisProyecto])

  const declarar = async (epsg: string | null) => {
    setGuardando(true)
    setErrorGuardado(null)
    try {
      if (networkId) {
        const res = await window.electronAPI.networkRepository.declareCRS({ networkId, epsg })
        if (!res?.success) throw new Error(res?.error || 'No se pudo guardar el sistema de coordenadas')
      }
      onDeclarado(epsg)
      onCerrar()
    } catch (e) {
      logger.error('Error declarando el CRS de la red:', e)
      setErrorGuardado(e instanceof Error ? e.message : 'No se pudo guardar el sistema de coordenadas')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={v => !v && onCerrar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe2 className="h-4 w-4" />
            Sistema de coordenadas de la red
          </DialogTitle>
          <DialogDescription>
            Declara el EPSG en el que están las coordenadas del .inp. Boorie reproyecta a WGS84
            para situar la red sobre el mapa; el fichero original no se modifica.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Busca por código o nombre: 32618, UTM 18N, MAGNA…"
              className="pl-8"
            />
          </div>

          <div className="max-h-56 overflow-y-auto rounded-md border border-border divide-y divide-border">
            {codigoLibre && (
              <button
                type="button"
                onClick={() => setSeleccion(codigoLibre)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span>
                  <span className="font-mono">{codigoLibre}</span>
                  <span className="ml-2 text-muted-foreground">{nombreCRS(codigoLibre)}</span>
                </span>
                {seleccion === codigoLibre && <Check className="h-4 w-4 text-primary" />}
              </button>
            )}

            {resultados.map(c => (
              <button
                key={c.epsg}
                type="button"
                onClick={() => setSeleccion(c.epsg)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span>
                  <span className="font-mono">{c.epsg}</span>
                  <span className="ml-2 text-muted-foreground">{c.nombre}</span>
                </span>
                {seleccion === c.epsg && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}

            {resultados.length === 0 && !codigoLibre && (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                Ningún sistema coincide con «{busqueda}».
              </p>
            )}
          </div>

          {vistaPrevia && (
            <div
              className={`rounded-md border px-3 py-2 text-xs ${
                vistaPrevia.cordura.ok
                  ? 'border-border bg-muted/50 text-muted-foreground'
                  : 'border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
              }`}
            >
              {vistaPrevia.centroide && (
                <p>
                  Con {seleccion} el centro de la red cae en{' '}
                  <span className="font-mono">
                    {vistaPrevia.centroide[1].toFixed(5)}, {vistaPrevia.centroide[0].toFixed(5)}
                  </span>
                  .
                </p>
              )}
              {!vistaPrevia.cordura.ok && (
                <p className="mt-1 flex gap-1.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {vistaPrevia.cordura.aviso}
                </p>
              )}
            </div>
          )}

          {!networkId && (
            <p className="text-xs text-muted-foreground">
              Esta red todavía no está guardada en el proyecto: el sistema se aplica ahora, pero
              habrá que volver a declararlo si cierras sin guardarla.
            </p>
          )}

          {errorGuardado && (
            <p className="text-xs text-red-600 dark:text-red-400">{errorGuardado}</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          {/* Declarar la red como no georreferenciada es una respuesta válida, no
              un fallo: es preferible a dejarla dibujada en un sitio inventado. */}
          <Button
            variant="ghost"
            size="sm"
            disabled={guardando}
            onClick={() => declarar(null)}
          >
            No está georreferenciada
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button size="sm" disabled={!seleccion || guardando} onClick={() => declarar(seleccion)}>
              {guardando ? 'Guardando…' : 'Aplicar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
