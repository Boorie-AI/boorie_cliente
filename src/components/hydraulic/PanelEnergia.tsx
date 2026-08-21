import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Gauge, Lightbulb, Plus, RefreshCw, Trash2, Zap } from 'lucide-react'
import { logger } from '@/utils/logger'
import { FeedbackRecomendacion } from './FeedbackRecomendacion'

/**
 * Eficiencia energética del bombeo (#42).
 *
 * Dos cosas que la pantalla tiene que dejar claras, porque sin ellas las cifras
 * no significan nada:
 *
 *  - **Con qué precio y con qué eficiencia se calculó.** El mismo kWh vale el
 *    doble en punta que en valle, y la eficiencia puede venir de la curva de la
 *    bomba o de un valor por defecto de Boorie. Las dos cosas se enseñan al lado
 *    del número, no en un aparte.
 *  - **Que el ahorro está simulado.** Cada verificación corre dos simulaciones y
 *    resta; la etiqueta «simulado» no es decorativa, es la diferencia con una
 *    estimación de un modelo de lenguaje.
 *
 * El texto va en castellano codificado, como el resto del panel WNTR.
 */

interface BloqueHorario {
  nombre: string
  desde_h: number
  hasta_h: number
  precio_kwh: number
}

interface Tarifa {
  moneda: string
  precio_kwh: number
  bloques: BloqueHorario[]
  eficienciaGlobal: number
}

interface Props {
  /** Proyecto activo: su tarifa manda sobre la general. */
  projectId?: string | null
  /** Red cargada: hace falta para registrar cada verificación y poder citarla. */
  redId?: string | null
  /** Si no hay red cargada no hay nada que analizar. */
  hayRed: boolean
}

const num = (v: string, porDefecto = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : porDefecto
}

export function PanelEnergia({ projectId, redId, hayRed }: Props) {
  const [tarifa, setTarifa] = useState<Tarifa | null>(null)
  const [propia, setPropia] = useState(false)
  const [solapados, setSolapados] = useState<Array<[string, string]>>([])
  const [guardando, setGuardando] = useState(false)

  const [analisis, setAnalisis] = useState<any>(null)
  const [analizando, setAnalizando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [bombasMedida, setBombasMedida] = useState('')
  const [desdeH, setDesdeH] = useState(18)
  const [hastaH, setHastaH] = useState(22)
  const [verificacion, setVerificacion] = useState<any>(null)
  const [verificando, setVerificando] = useState(false)

  const [recomendaciones, setRecomendaciones] = useState<any[] | null>(null)
  const [motivoSinRecomendaciones, setMotivoSinRecomendaciones] = useState<string | null>(null)
  const [recomendando, setRecomendando] = useState(false)
  /** Lo ya valorado, indexado por ejecución, para no volver a preguntarlo. */
  const [valoraciones, setValoraciones] = useState<Record<string, { rating: number; correccion: string | null }>>({})

  const cargarTarifa = useCallback(async () => {
    try {
      const r = await window.electronAPI.energia.tarifa(projectId ?? null)
      if (r?.success) {
        setTarifa(r.data.tarifa)
        setPropia(r.data.propia)
        setSolapados(r.data.solapados ?? [])
      }
    } catch (e) {
      logger.warn('No se pudo leer la tarifa eléctrica:', e)
    }
  }, [projectId])

  useEffect(() => { cargarTarifa() }, [cargarTarifa])

  const guardar = async (cambios: Partial<Tarifa>) => {
    setGuardando(true)
    try {
      const r = await window.electronAPI.energia.guardarTarifa({ projectId: projectId ?? null, tarifa: { ...tarifa, ...cambios } })
      if (r?.success) {
        setTarifa(r.data.tarifa)
        setSolapados(r.data.solapados ?? [])
        setPropia(!!projectId)
      }
    } finally {
      setGuardando(false)
    }
  }

  const volverAHeredar = async () => {
    if (!projectId) return
    setGuardando(true)
    try {
      const r = await window.electronAPI.energia.olvidarTarifa(projectId)
      if (r?.success) {
        setTarifa(r.data.tarifa)
        setPropia(false)
      }
    } finally {
      setGuardando(false)
    }
  }

  const analizar = async () => {
    setAnalizando(true)
    setError(null)
    try {
      const r = await window.electronAPI.wntr.energyAnalyze({ projectId: projectId ?? null, redId: redId ?? null, duration_hours: 24 })
      if (r?.success) {
        setAnalisis(r.data)
        setSolapados(r.avisos?.bloques_solapados ?? solapados)
      } else {
        setError(r?.error || 'No se pudo analizar el consumo energético')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo analizar el consumo energético')
    } finally {
      setAnalizando(false)
    }
  }

  const verificar = async () => {
    const elementos = bombasMedida.split(',').map(s => s.trim()).filter(Boolean)
    if (elementos.length === 0) {
      setError('Indica al menos una bomba para la medida')
      return
    }
    setVerificando(true)
    setError(null)
    setVerificacion(null)
    try {
      const r = await window.electronAPI.wntr.energyVerify({
        projectId: projectId ?? null,
        redId: redId ?? null,
        duration_hours: 24,
        persons_per_connection: 4,
        medidas: [{ tipo: 'pump_outage', elementos, desde_h: desdeH, hasta_h: hastaH }],
      })
      if (r?.success) setVerificacion(r.data)
      else setError(r?.error || 'No se pudo verificar la medida')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo verificar la medida')
    } finally {
      setVerificando(false)
    }
  }

  /**
   * Cada recomendación se verifica simulando, así que esto son dos simulaciones
   * por candidata. Se avisa en la interfaz en vez de dejar al usuario mirando un
   * botón girando.
   */
  const recomendar = async () => {
    setRecomendando(true)
    setError(null)
    setRecomendaciones(null)
    setMotivoSinRecomendaciones(null)
    try {
      const r = await window.electronAPI.wntr.energyRecommend({
        projectId: projectId ?? null,
        redId: redId ?? null,
        duration_hours: 24,
      })
      if (r?.success) {
        setAnalisis(r.data.analisis)
        setRecomendaciones(r.data.recomendaciones)
        setMotivoSinRecomendaciones(r.data.motivo ?? null)

        // Si estas medidas ya se valoraron antes, se enseña la marca en vez de
        // volver a preguntar por lo mismo.
        const runIds = (r.data.recomendaciones ?? []).map((x: any) => x.runId).filter(Boolean)
        if (runIds.length > 0) {
          const previas = await window.electronAPI.energia.feedbackDe(runIds)
          if (previas?.success) setValoraciones(previas.data ?? {})
        }
      } else {
        setError(r?.error || 'No se pudieron calcular las recomendaciones')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron calcular las recomendaciones')
    } finally {
      setRecomendando(false)
    }
  }

  const moneda = analisis?.moneda ?? tarifa?.moneda ?? 'USD'
  /** Una medida puede consumir más de lo que ahorra, y hay que decirlo así. */
  const ahorra = (verificacion?.ahorro?.energia_kwh ?? 0) > 0

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm flex items-center gap-2">
        <Zap className="h-4 w-4 text-yellow-500" />
        Eficiencia energética del bombeo
      </h3>

      {/* Tarifa */}
      <div className="space-y-2 p-3 bg-muted/20 rounded-lg">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold">Tarifa eléctrica</h4>
          {projectId && (
            propia
              ? <Badge variant="secondary" className="text-[10px]">Propia de este proyecto</Badge>
              : <Badge variant="outline" className="text-[10px]">Heredada de la general</Badge>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Sin precio no hay optimización económica, sólo aritmética hidráulica. El precio depende del país y de la
          hora, así que es un dato del proyecto.
        </p>

        {tarifa && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-[10px] text-muted-foreground">
                Moneda
                <input
                  className="w-full bg-background border rounded px-2 py-1 font-mono text-sm"
                  value={tarifa.moneda}
                  onChange={e => setTarifa({ ...tarifa, moneda: e.target.value })}
                  onBlur={() => guardar({ moneda: tarifa.moneda })}
                />
              </label>
              <label className="text-[10px] text-muted-foreground">
                Precio base ({tarifa.moneda}/kWh)
                <input
                  type="number" step="0.01"
                  className="w-full bg-background border rounded px-2 py-1 font-mono text-sm"
                  value={tarifa.precio_kwh}
                  onChange={e => setTarifa({ ...tarifa, precio_kwh: num(e.target.value) })}
                  onBlur={() => guardar({ precio_kwh: tarifa.precio_kwh })}
                />
              </label>
              <label className="text-[10px] text-muted-foreground">
                Eficiencia global (%)
                <input
                  type="number"
                  className="w-full bg-background border rounded px-2 py-1 font-mono text-sm"
                  value={tarifa.eficienciaGlobal}
                  onChange={e => setTarifa({ ...tarifa, eficienciaGlobal: num(e.target.value, 75) })}
                  onBlur={() => guardar({ eficienciaGlobal: tarifa.eficienciaGlobal })}
                />
              </label>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] text-muted-foreground">Bloques horarios</div>
              {tarifa.bloques.map((b, i) => (
                <div key={i} className="flex items-center gap-1">
                  <input
                    className="flex-1 bg-background border rounded px-2 py-1 text-xs"
                    value={b.nombre}
                    onChange={e => {
                      const bloques = [...tarifa.bloques]
                      bloques[i] = { ...b, nombre: e.target.value }
                      setTarifa({ ...tarifa, bloques })
                    }}
                    onBlur={() => guardar({ bloques: tarifa.bloques })}
                  />
                  {(['desde_h', 'hasta_h'] as const).map(campo => (
                    <input
                      key={campo}
                      type="number" min={0} max={24}
                      className="w-14 bg-background border rounded px-1 py-1 font-mono text-xs"
                      value={b[campo]}
                      onChange={e => {
                        const bloques = [...tarifa.bloques]
                        bloques[i] = { ...bloques[i], [campo]: num(e.target.value) }
                        setTarifa({ ...tarifa, bloques })
                      }}
                      onBlur={() => guardar({ bloques: tarifa.bloques })}
                    />
                  ))}
                  <input
                    type="number" step="0.01"
                    className="w-20 bg-background border rounded px-1 py-1 font-mono text-xs"
                    value={b.precio_kwh}
                    onChange={e => {
                      const bloques = [...tarifa.bloques]
                      bloques[i] = { ...bloques[i], precio_kwh: num(e.target.value) }
                      setTarifa({ ...tarifa, bloques })
                    }}
                    onBlur={() => guardar({ bloques: tarifa.bloques })}
                  />
                  <Button
                    size="sm" variant="ghost" className="px-2"
                    onClick={() => guardar({ bloques: tarifa.bloques.filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button
                  size="sm" variant="outline" className="text-xs" disabled={guardando}
                  onClick={() => guardar({
                    bloques: [...tarifa.bloques, { nombre: 'punta', desde_h: 18, hasta_h: 22, precio_kwh: tarifa.precio_kwh * 1.4 }],
                  })}
                >
                  <Plus className="h-3 w-3 mr-1" /> Añadir bloque
                </Button>
                {projectId && propia && (
                  <Button size="sm" variant="ghost" className="text-xs" onClick={volverAHeredar} disabled={guardando}>
                    Volver a heredar
                  </Button>
                )}
              </div>
            </div>

            {solapados.length > 0 && (
              <Alert variant="destructive" className="text-[11px]">
                <AlertCircle className="h-3 w-3 inline mr-1" />
                Estos bloques se pisan y gana el primero: {solapados.map(([a, b]) => `${a}/${b}`).join(', ')}
              </Alert>
            )}
          </>
        )}
      </div>

      {/* Análisis */}
      <Button size="sm" className="w-full" onClick={analizar} disabled={!hayRed || analizando}>
        {analizando
          ? <><RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" /> Analizando consumo...</>
          : <><Gauge className="h-3.5 w-3.5 mr-2" /> Analizar consumo energético (24 h)</>}
      </Button>

      {error && (
        <Alert variant="destructive" className="text-xs">
          <AlertCircle className="h-3 w-3 inline mr-1" /> {error}
        </Alert>
      )}

      {analisis && (
        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-mono">{analisis.energia_total_kwh.toFixed(1)} kWh</span>
              <span className="text-lg font-mono text-muted-foreground">
                {analisis.coste_total.toFixed(2)} {moneda}
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground">
              en 24 h · eficiencia {analisis.trazabilidad.eficiencia_global_pct}% ({analisis.trazabilidad.origen_eficiencia}) ·
              {' '}{analisis.trazabilidad.intervalos} intervalos de {analisis.trazabilidad.paso_s} s
            </div>

            <div className="space-y-1">
              {Object.entries(analisis.por_bloque_horario as Record<string, any>).map(([nombre, b]) => (
                <div key={nombre} className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">{nombre} · {b.precio_kwh} {moneda}/kWh</span>
                  <span className="font-mono">{b.kwh.toFixed(1)} kWh · {b.coste.toFixed(2)} {moneda}</span>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {analisis.bombas.map((b: any) => (
                <div key={b.nombre} className="border rounded p-2 space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>Bomba {b.nombre}</span>
                    <span className="font-mono">{b.energia_kwh.toFixed(1)} kWh · {b.coste.toFixed(2)} {moneda}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {b.horas_en_marcha.toFixed(1)} h en marcha · {b.potencia_media_kw.toFixed(1)} kW medios ·
                    {' '}pico {b.potencia_maxima_kw.toFixed(1)} kW · Q medio {b.caudal_medio_m3s.toFixed(4)} m³/s
                  </div>
                  {b.eficiencia && (
                    <div className="text-[10px] text-muted-foreground">
                      Eficiencia {b.eficiencia.media_pct.toFixed(1)}%
                      {b.eficiencia.maxima_pct > b.eficiencia.minima_pct &&
                        ` (entre ${b.eficiencia.minima_pct.toFixed(1)} y ${b.eficiencia.maxima_pct.toFixed(1)})`}
                      {' — '}{b.eficiencia.origen}
                    </div>
                  )}
                  {b.punto_optimo && (
                    <Alert className="text-[10px] py-1">
                      Su curva da {b.punto_optimo.punto_optimo.eficiencia_pct.toFixed(1)}% a{' '}
                      {b.punto_optimo.punto_optimo.caudal_m3s.toFixed(4)} m³/s, y está trabajando al{' '}
                      {b.punto_optimo.eficiencia_en_operacion_pct.toFixed(1)}%
                      {b.punto_optimo.desviacion_caudal_pct !== null &&
                        ` con el caudal ${Math.abs(b.punto_optimo.desviacion_caudal_pct).toFixed(0)}% ${b.punto_optimo.desviacion_caudal_pct < 0 ? 'por debajo' : 'por encima'} del óptimo`}
                    </Alert>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recomendaciones verificadas (#42) */}
      <Button size="sm" variant="secondary" className="w-full" onClick={recomendar} disabled={!hayRed || recomendando}>
        {recomendando
          ? <><RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" /> Buscando y verificando medidas…</>
          : <><Lightbulb className="h-3.5 w-3.5 mr-2" /> Recomendar medidas (verificadas por simulación)</>}
      </Button>

      {motivoSinRecomendaciones && (
        <Alert className="text-[11px] py-2">{motivoSinRecomendaciones}</Alert>
      )}

      {recomendaciones?.map((r: any, i: number) => (
        <Card key={i}>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs font-semibold">{r.candidata.titulo}</div>
              <Badge variant={r.candidata.naturaleza === 'operativa' ? 'secondary' : 'outline'} className="text-[9px] flex-shrink-0">
                {r.candidata.naturaleza === 'operativa' ? 'operativa' : 'requiere equipo'}
              </Badge>
            </div>
            <div className="text-[11px] text-muted-foreground">{r.candidata.motivo}</div>

            {r.ahorro ? (
              <>
                <div className="flex items-baseline justify-between border-t pt-2">
                  <span className={`text-lg font-mono ${r.ahorro.energia_kwh > 0 ? 'text-green-600' : 'text-amber-600'}`}>
                    {r.ahorro.energia_kwh > 0 ? '−' : '+'}{Math.abs(r.ahorro.energia_kwh).toFixed(1)} kWh
                  </span>
                  <span className={`text-base font-mono ${r.ahorro.coste > 0 ? 'text-green-600' : 'text-amber-600'}`}>
                    {r.ahorro.coste > 0 ? '−' : '+'}{Math.abs(r.ahorro.coste).toFixed(2)} {r.ahorro.moneda}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {r.antes.energia_kwh.toFixed(1)} → {r.despues.energia_kwh.toFixed(1)} kWh ·
                  {' '}un {Math.abs(r.ahorro.porcentaje_energia).toFixed(1)}% {r.ahorro.energia_kwh > 0 ? 'menos' : 'más'} ·
                  {' '}<Badge variant="secondary" className="text-[9px]">{r.ahorro.origen}</Badge>
                </div>
                {/* Cero no es «consume más»: es que la medida no cambia nada, y
                    decirlo mal esconde que quizá no llegó a aplicarse. */}
                {Math.abs(r.ahorro.energia_kwh) < 0.05 ? (
                  <Alert className="text-[10px] py-1">
                    Simulada, esta medida <strong>no cambia el consumo</strong>. Suele significar que la red la
                    absorbe —otra bomba compensa, o los depósitos ya cubrían esas horas.
                  </Alert>
                ) : r.ahorro.energia_kwh < 0 ? (
                  <Alert className="text-[10px] py-1">
                    Simulada, esta medida <strong>no ahorra</strong>: la red consume más con ella. Se muestra igual,
                    porque saber que no funciona también es información.
                  </Alert>
                ) : null}
                <div className="text-[10px] text-muted-foreground">
                  Coste en servicio: {r.impacto_en_servicio.habitantes_afectados_atribuibles} habitantes ·
                  {' '}{r.impacto_en_servicio.demanda_no_satisfecha_atribuible_m3.toFixed(1)} m³ sin servir
                  {r.impacto_en_servicio.habitantes_afectados_atribuibles === 0 && ' — no deja a nadie sin agua'}
                </div>
                {/* La cita de origen: es el criterio de aceptación del issue. */}
                <div className="text-[10px] text-muted-foreground italic">
                  {r.runId
                    ? <>Verificado en la simulación <code>{r.runId}</code>, en el historial del proyecto.</>
                    : <>Verificado por simulación, pero no se pudo registrar en el historial.</>}
                  {!r.convergio && ' ⚠️ alguna simulación no convergió.'}
                </div>

                {/* Valorarla sólo tiene sentido si hay ejecución que citar (#42). */}
                {r.runId && (
                  <FeedbackRecomendacion
                    runId={r.runId}
                    titulo={r.candidata.titulo}
                    contexto={{ medida: r.candidata.medida, naturaleza: r.candidata.naturaleza, ahorro: r.ahorro, motivo: r.candidata.motivo }}
                    valoracionInicial={valoraciones[r.runId] ?? null}
                  />
                )}
              </>
            ) : (
              <div className="text-[11px] text-destructive">No se pudo verificar: {r.error}</div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Verificación de una medida */}
      <div className="space-y-2 p-3 bg-muted/20 rounded-lg">
        <h4 className="text-xs font-semibold">Verificar una medida</h4>
        <p className="text-[11px] text-muted-foreground">
          Parar el bombeo en las horas caras y ver qué ahorra de verdad: se simula la red con la medida y se resta.
          La cifra sale de WNTR, no de una estimación.
        </p>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-[10px] text-muted-foreground col-span-3">
            Bombas (separadas por comas)
            <input
              className="w-full bg-background border rounded px-2 py-1 font-mono text-sm"
              value={bombasMedida}
              onChange={e => setBombasMedida(e.target.value)}
              placeholder={analisis?.bombas?.map((b: any) => b.nombre).join(', ') || 'B1, B2'}
            />
          </label>
          <label className="text-[10px] text-muted-foreground">
            Desde (h)
            <input type="number" min={0} max={24} className="w-full bg-background border rounded px-2 py-1 font-mono text-sm"
              value={desdeH} onChange={e => setDesdeH(num(e.target.value))} />
          </label>
          <label className="text-[10px] text-muted-foreground">
            Hasta (h)
            <input type="number" min={0} max={24} className="w-full bg-background border rounded px-2 py-1 font-mono text-sm"
              value={hastaH} onChange={e => setHastaH(num(e.target.value, 24))} />
          </label>
        </div>
        <Button size="sm" className="w-full" onClick={verificar} disabled={!hayRed || verificando}>
          {verificando
            ? <><RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" /> Simulando la medida...</>
            : <>Verificar ahorro por simulación</>}
        </Button>

        {verificacion && (
          <Card>
            <CardContent className="p-3 space-y-2">
              {/*
                La medida puede salir mal, y esa es información: parar el bombeo
                en hora punta vacía los depósitos y obliga a recuperarlos
                después, así que puede consumir **más**. Enseñar «−-48,8 kWh»
                sería un error de presentación tapando un resultado válido.
              */}
              <div className="flex items-baseline justify-between">
                <span className={`text-xl font-mono ${ahorra ? 'text-green-600' : 'text-amber-600'}`}>
                  {ahorra ? '−' : '+'}{Math.abs(verificacion.ahorro.energia_kwh).toFixed(1)} kWh
                </span>
                <span className={`text-lg font-mono ${ahorra ? 'text-green-600' : 'text-amber-600'}`}>
                  {ahorra ? '−' : '+'}{Math.abs(verificacion.ahorro.coste).toFixed(2)} {verificacion.ahorro.moneda}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground">
                {verificacion.antes.energia_total_kwh.toFixed(1)} → {verificacion.despues.energia_total_kwh.toFixed(1)} kWh
                {' '}(un {Math.abs(verificacion.ahorro.porcentaje_energia).toFixed(1)}% {ahorra ? 'menos' : 'más'}) ·
                {' '}<Badge variant="secondary" className="text-[9px]">{ahorra ? 'ahorro' : 'consumo'} {verificacion.ahorro.origen}</Badge>
              </div>
              {!ahorra && (
                <Alert className="text-[10px] py-1">
                  Esta medida <strong>no</strong> ahorra: la red consume más con ella. Suele pasar al parar el
                  bombeo en horas caras si los depósitos no tienen reserva para cubrirlas y hay que recuperarlos
                  después.
                </Alert>
              )}
              <div className="text-[11px] border-t pt-2">
                <div className="font-semibold mb-1">Lo que le cuesta al servicio</div>
                <div className="text-muted-foreground">
                  {verificacion.impacto_en_servicio.habitantes_afectados_atribuibles} habitantes ·
                  {' '}{verificacion.impacto_en_servicio.demanda_no_satisfecha_atribuible_m3.toFixed(1)} m³ sin servir ·
                  {' '}{verificacion.impacto_en_servicio.nudos_afectados_atribuibles} nudos
                  {verificacion.impacto_en_servicio.habitantes_afectados_atribuibles === 0 && ' — la medida no deja a nadie sin agua'}
                </div>
              </div>
              {!verificacion.convergence_warnings.converged && (
                <Alert variant="destructive" className="text-[10px]">
                  Alguna simulación no convergió: las cifras de esos instantes no son fiables.
                </Alert>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
