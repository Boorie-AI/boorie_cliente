"""
Análisis energético y verificación de ahorros por simulación (#42).

Lo que había en `wntrService.py::_energy_analysis` era un inventario: listaba las
bombas y ponía `efficiency: 'N/A'`. No usaba los resultados de ninguna corrida,
así que no podía decir cuánta energía gasta la red ni cuánto cuesta.

Dos reglas gobiernan este módulo:

  1. **Ninguna cifra de ahorro sale de una estimación.** `verificar` aplica la
     medida sobre una copia de la red, la simula, y resta. Si el modelo de
     lenguaje propone algo, lo que se reporta es lo que dio WNTR, no lo que dijo
     el modelo.
  2. **Todo lo que cambia la cifra se declara.** La eficiencia usada y de dónde
     salió, la tarifa aplicada, el método de cada medida y el paso de tiempo van
     en la respuesta, porque un ahorro de 40 kWh/día no significa nada sin saber
     con qué eficiencia y a qué precio se calculó.

Dos límites de WNTR que condicionan el resultado, y que por eso se declaran en
cada respuesta en vez de esconderse:

  - `pump_power` **se niega a calcular** si alguna bomba declara curva de
    eficiencia: lanza `NotImplementedError`. Y son justo las redes con mejores
    datos las que la declaran —la red de pruebas de Chamisero, por ejemplo—, así
    que heredar ese límite dejaba sin análisis energético a quien más lo tiene
    preparado. La potencia se calcula aquí con la misma fórmula que usa WNTR
    (`1000·9,81·H·Q/η`) y con la eficiencia interpolada de la curva al caudal de
    cada instante, que es exactamente lo que dice el TODO comentado en el código
    de WNTR. Sin curva se usa la eficiencia global, y el origen va declarado
    bomba a bomba.
  - `pump_cost` **no admite patrones de precio**, que es justo lo que hace falta
    para una tarifa por bloques horarios. El coste se calcula aquí sobre la serie
    temporal de energía, que además es lo que permite dar el desglose punta/valle.
"""
import sys
import json
import time

import numpy as np
import wntr

# Se reutiliza el servicio de resiliencia por dos cosas concretas: cargar la red
# con el arreglo de unidades del backdrop, y aplicar los eventos del motor de
# escenarios (#43). Una medida de eficiencia energética —mover el bombeo fuera de
# la hora punta— es el mismo «paro de bomba en una ventana» que un escenario de
# interrupción, así que no hay motivo para tener dos vocabularios.
from wntr_resilience_service import WNTRResilienceService

# 0,18 USD/kWh: mitad del rango que Luis Mora da para América Latina y el Caribe
# (0,14 a 0,25). Es un valor por defecto para que la respuesta tenga unidades
# monetarias, no una afirmación sobre la tarifa de nadie: se configura por
# proyecto y viaja declarado en `tarifa`.
DEFAULT_PRECIO_KWH = 0.18
DEFAULT_MONEDA = 'USD'
# 75% es el ejemplo de la propia documentación de WNTR y un valor razonable para
# una bomba centrífuga en su rango. Sólo se usa si el .inp no declara nada.
DEFAULT_EFICIENCIA = 75.0
DEFAULT_DURACION_H = 24.0


class WNTREnergyService:
    def __init__(self):
        self.base = WNTRResilienceService()

    # ------------------------------------------------------------------
    # Tarifa
    # ------------------------------------------------------------------
    def _tarifa(self, opts):
        tarifa = dict(opts.get('tarifa') or {})
        tarifa.setdefault('moneda', DEFAULT_MONEDA)
        tarifa.setdefault('precio_kwh', DEFAULT_PRECIO_KWH)
        tarifa.setdefault('bloques', [])
        return tarifa

    def _precio_en(self, segundos, tarifa):
        """
        El precio que aplica a un instante, por hora del día.

        Los bloques se repiten cada día: una tarifa de punta de 18 a 22 lo es
        todos los días de la simulación, no sólo el primero. Un bloque que cruza
        la medianoche (22 a 6) se entiende como la unión de los dos tramos, que
        es como lo lee cualquiera que mire su factura.
        """
        hora = (float(segundos) / 3600.0) % 24.0
        for bloque in tarifa['bloques']:
            desde = float(bloque.get('desde_h', 0.0)) % 24.0
            hasta = float(bloque.get('hasta_h', 24.0)) % 24.0
            dentro = (desde <= hora < hasta) if desde < hasta else (hora >= desde or hora < hasta)
            if dentro:
                return float(bloque.get('precio_kwh', tarifa['precio_kwh'])), str(bloque.get('nombre', 'bloque'))
        return float(tarifa['precio_kwh']), 'base'

    # ------------------------------------------------------------------
    # Energía
    # ------------------------------------------------------------------
    def _eficiencia(self, wn, opts):
        """La eficiencia global que se va a usar, y de dónde sale."""
        declarada = wn.options.energy.global_efficiency
        if declarada:
            return float(declarada), 'declarada en el .inp'
        valor = float(opts.get('eficiencia_global', DEFAULT_EFICIENCIA))
        wn.options.energy.global_efficiency = valor
        return valor, 'por defecto de Boorie (el .inp no la declara)'

    def _eficiencia_de_bomba(self, wn, nombre, caudales, global_pct):
        """
        La eficiencia de cada instante para una bomba, y de dónde sale.

        Con curva declarada se interpola al caudal del instante, acotando a los
        extremos de la curva: fuera de su rango la extrapolación lineal llega a
        dar eficiencias negativas o mayores que uno, y eso convierte una potencia
        en un número sin sentido físico. El acotado se declara.
        """
        bomba = wn.get_link(nombre)
        nombre_curva = getattr(bomba, 'efficiency_curve_name', None)

        if nombre_curva and nombre_curva in wn.curve_name_list:
            puntos = sorted((float(q), float(e)) for q, e in wn.get_curve(nombre_curva).points)
            if puntos:
                qs = np.array([q for q, _ in puntos])
                es = np.array([e for _, e in puntos])
                # np.interp ya acota a los extremos en vez de extrapolar.
                fraccion = np.interp(np.abs(caudales), qs, es) / 100.0
                fraccion = np.clip(fraccion, 0.05, 1.0)
                return fraccion, {
                    'origen': f'curva de eficiencia "{nombre_curva}" del .inp, interpolada al caudal',
                    'media_pct': float(fraccion.mean() * 100.0),
                    'minima_pct': float(fraccion.min() * 100.0),
                    'maxima_pct': float(fraccion.max() * 100.0),
                }

        fraccion = np.full(len(caudales), global_pct / 100.0)
        return fraccion, {
            'origen': 'eficiencia global (la bomba no declara curva)',
            'media_pct': float(global_pct),
            'minima_pct': float(global_pct),
            'maxima_pct': float(global_pct),
        }

    def _potencia(self, wn, resultados, global_pct):
        """
        Potencia de cada bomba en W, con la fórmula de WNTR y la eficiencia de la
        curva cuando existe.

        Se recorta a cero por abajo: una bomba cerrada puede dar productos
        ligeramente negativos por el propio solver, y una bomba no recupera
        energía de la red.
        """
        caudal = resultados.link['flowrate']
        altura = resultados.node['head']

        potencias = {}
        eficiencias = {}
        for nombre, bomba in wn.pumps():
            if nombre not in caudal.columns:
                continue
            q = caudal.loc[:, nombre].to_numpy(dtype=float)
            h = (altura.loc[:, bomba.end_node_name] - altura.loc[:, bomba.start_node_name]).to_numpy(dtype=float)
            eta, detalle = self._eficiencia_de_bomba(wn, nombre, q, global_pct)
            potencias[nombre] = np.clip(1000.0 * 9.81 * h * q / eta, 0.0, None)
            eficiencias[nombre] = detalle

        import pandas as pd
        return pd.DataFrame(potencias, index=caudal.index), eficiencias

    def _energia(self, wn, resultados):
        """
        Energía por bomba y por intervalo, en kWh.

        Se integra por intervalos y no sumando filas: una ventana de 24 h con
        paso de 1 h reporta **25** instantes, y sumar los 25 productos de
        `pump_energy` cuenta un intervalo de más —un 4% en esa ventana—, que en
        una cifra de ahorro es la diferencia entre acertar y no. Es el mismo
        error que ya se corrigió al contar horas de déficit (#32).
        """
        potencia, eficiencias = self._potencia(wn, resultados, self._global_pct)

        index = potencia.index.to_numpy(dtype=float)
        if len(index) > 1:
            intervalos_s = np.diff(index)
            potencia_izq = potencia.iloc[:-1]
            instantes = index[:-1]
        else:
            intervalos_s = np.array([0.0])
            potencia_izq = potencia
            instantes = index

        # kWh de cada bomba en cada intervalo.
        kwh = potencia_izq.multiply(intervalos_s, axis=0) / 3.6e6
        return kwh, instantes, intervalos_s, potencia, eficiencias

    def _punto_optimo(self, wn, nombre_bomba, caudal_medio):
        """
        Eficiencia en el punto de operación frente a la de la curva, cuando el
        .inp declara una curva de eficiencia.

        WNTR no usa estas curvas para calcular energía, así que esto no cambia el
        consumo reportado: sirve para señalar una bomba que trabaja lejos de su
        punto óptimo, que es donde está la recomendación de sustituirla o
        redimensionarla. Sin curva declarada no se inventa nada: se dice que no
        hay.
        """
        bomba = wn.get_link(nombre_bomba)
        nombre_curva = getattr(bomba, 'efficiency_curve_name', None)
        if not nombre_curva or nombre_curva not in wn.curve_name_list:
            return None

        puntos = [(float(q), float(e)) for q, e in wn.get_curve(nombre_curva).points]
        if not puntos:
            return None

        caudales = np.array([p[0] for p in puntos])
        eficiencias = np.array([p[1] for p in puntos])
        i_optimo = int(np.argmax(eficiencias))

        return {
            'curva': nombre_curva,
            'eficiencia_en_operacion_pct': float(np.interp(caudal_medio, caudales, eficiencias)),
            'punto_optimo': {
                'caudal_m3s': float(caudales[i_optimo]),
                'eficiencia_pct': float(eficiencias[i_optimo]),
            },
            'desviacion_caudal_pct': (
                float((caudal_medio - caudales[i_optimo]) / caudales[i_optimo] * 100.0)
                if caudales[i_optimo] else None
            ),
        }

    def _resumen(self, wn, resultados, opts, eficiencia, origen_eficiencia):
        tarifa = self._tarifa(opts)
        self._global_pct = eficiencia
        kwh, instantes, intervalos_s, potencia, eficiencias = self._energia(wn, resultados)

        precios = np.array([self._precio_en(t, tarifa)[0] for t in instantes])
        etiquetas = [self._precio_en(t, tarifa)[1] for t in instantes]

        caudal = resultados.link['flowrate']
        bombas = []
        por_bloque = {}
        for nombre in kwh.columns:
            serie_kwh = kwh.loc[:, nombre].to_numpy(dtype=float)
            coste = float((serie_kwh * precios).sum())
            caudal_bomba = caudal.loc[:, nombre].to_numpy(dtype=float) if nombre in caudal.columns else np.zeros(len(instantes) + 1)

            # «En marcha» es caudal apreciable, no distinto de cero: una bomba
            # cerrada puede reportar caudales de 1e-12 por el propio solver.
            en_marcha = np.abs(caudal_bomba[:len(intervalos_s)]) > 1e-6
            horas = float((en_marcha * intervalos_s).sum() / 3600.0)
            caudal_medio = float(np.abs(caudal_bomba[:len(intervalos_s)])[en_marcha].mean()) if en_marcha.any() else 0.0

            # El reparto se acumula dos veces: para la red y para esta bomba.
            # Sin el detalle por bomba, «mueve el bombeo a horas valle» no puede
            # decir *qué* bomba mover ni cuánto gasta ahí (#42).
            bloques_bomba = {}
            for etiqueta, valor, precio in zip(etiquetas, serie_kwh, precios):
                acumulado = por_bloque.setdefault(etiqueta, {'kwh': 0.0, 'coste': 0.0, 'precio_kwh': float(precio)})
                acumulado['kwh'] += float(valor)
                acumulado['coste'] += float(valor) * float(precio)

                propio = bloques_bomba.setdefault(etiqueta, {'kwh': 0.0, 'coste': 0.0, 'precio_kwh': float(precio),
                                                             'desde_h': None, 'hasta_h': None})
                propio['kwh'] += float(valor)
                propio['coste'] += float(valor) * float(precio)

            # Las horas que cubre cada bloque, tomadas de la propia tarifa: son la
            # ventana de la medida que se va a proponer y verificar.
            for bloque in tarifa['bloques']:
                propio = bloques_bomba.get(str(bloque.get('nombre', 'bloque')))
                if propio is not None:
                    propio['desde_h'] = float(bloque.get('desde_h', 0.0))
                    propio['hasta_h'] = float(bloque.get('hasta_h', 24.0))

            bombas.append({
                'nombre': str(nombre),
                'por_bloque_horario': bloques_bomba,
                'energia_kwh': float(serie_kwh.sum()),
                'coste': coste,
                'horas_en_marcha': horas,
                'potencia_media_kw': float(serie_kwh.sum() / horas) if horas > 0 else 0.0,
                'potencia_maxima_kw': float(potencia.loc[:, nombre].max() / 1000.0),
                'caudal_medio_m3s': caudal_medio,
                'eficiencia': eficiencias.get(nombre),
                'punto_optimo': self._punto_optimo(wn, nombre, caudal_medio),
            })

        bombas.sort(key=lambda b: b['energia_kwh'], reverse=True)
        total_kwh = float(sum(b['energia_kwh'] for b in bombas))
        total_coste = float(sum(b['coste'] for b in bombas))

        return {
            'energia_total_kwh': total_kwh,
            'coste_total': total_coste,
            'moneda': tarifa['moneda'],
            'bombas': bombas,
            'por_bloque_horario': por_bloque,
            'tarifa_aplicada': tarifa,
            'trazabilidad': {
                'eficiencia_global_pct': eficiencia,
                'origen_eficiencia': origen_eficiencia,
                'curvas_de_eficiencia': 'se usan cuando el .inp las declara; WNTR no lo hace y aquí sí (ver cabecera)',
                'metrica': 'potencia 1000·9,81·H·Q/η integrada por intervalos',
                'simulador': 'WNTRSimulator',
                'wntr_version': wntr.__version__,
                'paso_s': float(np.median(intervalos_s)) if len(intervalos_s) else 0.0,
                'intervalos': int(len(intervalos_s)),
            },
        }

    def _aplicar_punto_optimo(self, wn, elementos):
        """
        «¿Y si esta bomba trabajara en su punto óptimo?» (#42).

        Es una medida de energía y no un escenario, así que no vive en el motor
        del #43: cambia la eficiencia de la bomba, no el estado de la red. Se
        sustituye su curva por una constante en el valor del punto de máxima
        eficiencia, y se vuelve a simular.

        Lo que sale **no es un ahorro operativo**: es la brecha entre lo que la
        bomba gasta hoy y lo que gastaría el mismo servicio en el mejor punto de
        su curva, que es la cifra con la que se justifica sustituir o
        redimensionar un equipo. La narración tiene que decirlo así, porque un
        ahorro que exige comprar una bomba no se compara con mover un horario.
        """
        aplicados, omitidos = [], []
        for elemento in elementos:
            try:
                bomba = wn.get_link(elemento)
            except KeyError:
                omitidos.append({'id': str(elemento), 'motivo': 'no existe en la red'})
                continue

            nombre_curva = getattr(bomba, 'efficiency_curve_name', None)
            if not nombre_curva or nombre_curva not in wn.curve_name_list:
                omitidos.append({'id': str(elemento), 'motivo': 'no declara curva de eficiencia, así que no hay punto óptimo que alcanzar'})
                continue

            puntos = [(float(q), float(e)) for q, e in wn.get_curve(nombre_curva).points]
            if not puntos:
                omitidos.append({'id': str(elemento), 'motivo': 'su curva de eficiencia está vacía'})
                continue

            mejor = max(puntos, key=lambda punto: punto[1])
            plana = f'boorie_bep_{elemento}'
            if plana not in wn.curve_name_list:
                # Dos puntos con el mismo valor: la interpolación da esa constante
                # para cualquier caudal, que es «trabajar siempre en el óptimo».
                wn.add_curve(plana, 'EFFICIENCY', [(puntos[0][0], mejor[1]), (puntos[-1][0], mejor[1])])
            bomba.efficiency_curve_name = plana
            aplicados.append(f'{elemento}@{mejor[1]:.1f}%')

        return aplicados, omitidos, 'eficiencia llevada al punto óptimo de su curva (medida de equipo, no operativa)'

    # ------------------------------------------------------------------
    # Comandos
    # ------------------------------------------------------------------
    def analizar(self, inp_file, options=None):
        inicio = time.time()
        try:
            opts = options or {}
            duracion = float(opts.get('duration_hours', DEFAULT_DURACION_H))

            wn = self.base.load_network(inp_file)
            if not wn.pump_name_list:
                print(json.dumps({'success': False, 'error': 'La red no tiene bombas: no hay consumo energético que analizar'}))
                return

            eficiencia, origen = self._eficiencia(wn, opts)
            resultados, avisos = self.base._run_extended_checked(wn, duracion)

            datos = self._resumen(wn, resultados, opts, eficiencia, origen)
            datos['duration_hours'] = duracion
            datos['execution_time'] = time.time() - inicio
            datos['convergence_warnings'] = {'event': avisos, 'converged': not avisos}
            print(json.dumps({'success': True, 'data': datos}))
        except Exception as e:
            print(json.dumps({'success': False, 'error': str(e)}))

    def verificar(self, inp_file, options=None):
        """
        Simula una medida y devuelve el ahorro **medido**, no estimado (#42).

        Dos corridas: la red como está y la red con la medida aplicada. La medida
        se expresa con el mismo vocabulario de eventos del motor de escenarios
        (#43), así que «apagar la bomba en hora punta» es el `pump_outage` que ya
        existía y no un mecanismo nuevo.
        """
        inicio = time.time()
        try:
            opts = options or {}
            medidas = opts.get('medidas') or []
            if not medidas:
                print(json.dumps({'success': False, 'error': 'No se declaró ninguna medida que verificar'}))
                return

            duracion = float(opts.get('duration_hours', DEFAULT_DURACION_H))

            wn_base = self.base.load_network(inp_file)
            if not wn_base.pump_name_list:
                print(json.dumps({'success': False, 'error': 'La red no tiene bombas: no hay consumo energético que verificar'}))
                return
            eficiencia, origen = self._eficiencia(wn_base, opts)
            res_base, avisos_base = self.base._run_extended_checked(wn_base, duracion)
            antes = self._resumen(wn_base, res_base, opts, eficiencia, origen)

            wn_medida = self.base.load_network(inp_file)
            self._eficiencia(wn_medida, opts)

            # `pump_bep` es de este servicio; el resto son eventos del motor de
            # escenarios (#43) y se aplican con él, sin duplicar vocabulario.
            propias = [m for m in medidas if str(m.get('tipo')) == 'pump_bep']
            del_motor = [m for m in medidas if str(m.get('tipo')) != 'pump_bep']

            aplicadas = self.base._aplicar_eventos(wn_medida, del_motor, duracion) if del_motor else []
            for i, medida in enumerate(propias):
                hechos, omitidos, como = self._aplicar_punto_optimo(wn_medida, medida.get('elementos') or [])
                aplicadas.append({
                    'indice': len(del_motor) + i,
                    'tipo': 'pump_bep',
                    'aplicado': bool(hechos),
                    'elementos': hechos,
                    'metodo': como,
                    'omitidos': omitidos,
                })
            if not any(m['aplicado'] for m in aplicadas):
                print(json.dumps({
                    'success': False,
                    'error': 'Ninguna medida pudo aplicarse sobre esta red',
                    'medidas': aplicadas,
                }))
                return
            res_medida, avisos_medida = self.base._run_extended_checked(wn_medida, duracion)
            despues = self._resumen(wn_medida, res_medida, opts, eficiencia, origen)

            # El ahorro no vale nada sin decir qué le pasó al servicio: apagar la
            # bomba doce horas ahorra mucha energía y deja a la red sin agua.
            servicio = self.base._population_impact(wn_base, res_base, wn_medida, res_medida, opts)

            ahorro_kwh = antes['energia_total_kwh'] - despues['energia_total_kwh']
            ahorro_coste = antes['coste_total'] - despues['coste_total']

            print(json.dumps({'success': True, 'data': {
                'medidas': aplicadas,
                'antes': antes,
                'despues': despues,
                'ahorro': {
                    'energia_kwh': ahorro_kwh,
                    'coste': ahorro_coste,
                    'moneda': antes['moneda'],
                    'porcentaje_energia': (ahorro_kwh / antes['energia_total_kwh'] * 100.0) if antes['energia_total_kwh'] else 0.0,
                    'origen': 'simulado',
                },
                # Lo que la medida le cuesta al servicio, para que un ahorro no
                # se pueda reportar sin su contrapartida.
                'impacto_en_servicio': {
                    'habitantes_afectados_atribuibles': servicio['attributable_to_event']['population_affected'],
                    'demanda_no_satisfecha_atribuible_m3': servicio['attributable_to_event']['undelivered_volume_m3'],
                    'nudos_afectados_atribuibles': servicio['attributable_to_event']['affected_node_count'],
                    'metodo': servicio['traceability'],
                },
                'duration_hours': duracion,
                'execution_time': time.time() - inicio,
                'convergence_warnings': {
                    'baseline': avisos_base,
                    'event': avisos_medida,
                    'converged': not avisos_base and not avisos_medida,
                },
            }}))
        except Exception as e:
            print(json.dumps({'success': False, 'error': str(e)}))


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({'success': False, 'error': 'Insufficient arguments'}))
        sys.exit(1)

    comando = sys.argv[1]
    inp_file = sys.argv[2]
    cli_options = {}
    if len(sys.argv) > 3:
        try:
            cli_options = json.loads(sys.argv[3])
        except Exception:
            pass

    servicio = WNTREnergyService()

    if comando == 'analizar':
        servicio.analizar(inp_file, cli_options)
    elif comando == 'verificar':
        servicio.verificar(inp_file, cli_options)
    else:
        print(json.dumps({'success': False, 'error': f'Unknown command: {comando}'}))
