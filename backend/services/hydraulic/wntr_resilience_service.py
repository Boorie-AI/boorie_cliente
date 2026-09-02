
"""
WNTR Resilience Service: skeletonization, service-interruption simulation,
resilience indicators (Todini/entropy/redundancy) and seismic fragility curves.

Covers the 4 sub-features of the "Rutinas de resiliencia WNTR" epic
(#22 service interruption, #23 resilience indicators, #24 skeletonization,
#25 fragility curve).
"""
import sys
import json
import os
import time
import tempfile
import numpy as np
import wntr
import wntr.metrics.hydraulic
import wntr.network.controls as ctrls
from wntr.network import LinkStatus
from wntr.metrics import (
    expected_demand,
    water_service_availability,
    population,
    population_impacted,
)
import warnings

# Suppress specific WNTR warnings that are informational only
warnings.filterwarnings('ignore', message='Changing the headloss formula from')
warnings.filterwarnings('ignore', message='Not all curves were used in')

# Población y clientes afectados (#32). Ver docs/POBLACION_AFECTADA_PDA.md.
DEFAULT_DEMAND_MODULE_LPHD = 200.0    # l/hab/día (rango típico LatAm: 150-300)
DEFAULT_AVAILABILITY_THRESHOLD = 0.8  # se considera afectado por debajo del 80%
DEFAULT_REQUIRED_PRESSURE = 20.0      # m, presión a la que se sirve el 100%
DEFAULT_MINIMUM_PRESSURE = 0.0        # m, por debajo no se entrega nada


class WNTRResilienceService:
    def __init__(self):
        pass

    def load_network(self, inp_file):
        """Load network with robust handling for backdrop units (same fix as the other WNTR services)"""
        try:
            with open(inp_file, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()

            fixed_lines = []
            in_backdrop_section = False

            for line in lines:
                stripped = line.strip().upper()

                if stripped.startswith('[') and stripped.endswith(']'):
                    in_backdrop_section = stripped == '[BACKDROP]'
                    fixed_lines.append(line)
                    continue

                if in_backdrop_section and stripped.startswith('UNITS'):
                    parts = stripped.split()
                    if len(parts) >= 2:
                        unit = parts[1]
                        if unit not in ['FEET', 'METERS', 'DEGREES', 'NONE']:
                            fixed_lines.append(f"; {line.strip()} (Modified by Boorie)\n")
                            fixed_lines.append("UNITS NONE\n")
                            continue

                fixed_lines.append(line)

            fd, temp_path = tempfile.mkstemp(suffix='.inp', text=True)
            with os.fdopen(fd, 'w') as f:
                f.writelines(fixed_lines)

            try:
                return wntr.network.WaterNetworkModel(temp_path)
            finally:
                if os.path.exists(temp_path):
                    os.remove(temp_path)

        except Exception:
            return wntr.network.WaterNetworkModel(inp_file)

    def _prepare_wntr_simulator(self, wn):
        """Fix incompatibilities so WNTRSimulator can run (same pattern as the other services)"""
        if str(wn.options.hydraulic.headloss).upper() in ['D-W', 'DARCY-WEISBACH', 'DW']:
            wn.options.hydraulic.headloss = 'H-W'

        if len(wn.gpv_name_list) > 0:
            for name in list(wn.gpv_name_list):
                gpv = wn.get_link(name)
                u, v = gpv.start_node_name, gpv.end_node_name
                wn.remove_link(name)
                wn.add_pipe(name, u, v, length=1.0, diameter=0.3, roughness=130, check_valve=False)

        try:
            if wn.options.time.hydraulic_timestep <= 0:
                wn.options.time.hydraulic_timestep = 3600.0
            if wn.options.time.report_timestep <= 0:
                wn.options.time.report_timestep = wn.options.time.hydraulic_timestep
        except Exception:
            pass

    def _network_summary(self, wn):
        return {
            'junctions': len(wn.junction_name_list),
            'tanks': len(wn.tank_name_list),
            'reservoirs': len(wn.reservoir_name_list),
            'pipes': len(wn.pipe_name_list),
            'pumps': len(wn.pump_name_list),
            'valves': len(wn.valve_name_list),
        }

    # ------------------------------------------------------------------
    # Feature: Esqueletización de redes (#24)
    # ------------------------------------------------------------------
    def skeletonize(self, inp_file, options=None):
        try:
            options = options or {}
            wn = self.load_network(inp_file)
            before = self._network_summary(wn)

            threshold_mm = float(options.get('pipe_diameter_threshold_mm', 100))
            threshold_m = threshold_mm / 1000.0

            # use_epanet=False forces the pure-Python skeletonization path.
            # The default (True) shells out to the compiled EPANET toolkit,
            # which crashes with SIGKILL under macOS code-signing restrictions
            # (same class of issue documented for EpanetSimulator elsewhere
            # in this codebase) - verified against this repo's Python setup.
            wn_skel = wntr.morph.skeletonize(
                wn,
                pipe_diameter_threshold=threshold_m,
                branch_trim=bool(options.get('branch_trim', True)),
                series_pipe_merge=bool(options.get('series_pipe_merge', True)),
                parallel_pipe_merge=bool(options.get('parallel_pipe_merge', True)),
                use_epanet=bool(options.get('use_epanet', False)),
                return_copy=True
            )
            after = self._network_summary(wn_skel)

            fd, temp_path = tempfile.mkstemp(suffix='.inp')
            os.close(fd)
            try:
                wntr.network.write_inpfile(wn_skel, temp_path)
                with open(temp_path, 'r', encoding='utf-8') as f:
                    inp_content = f.read()
            finally:
                if os.path.exists(temp_path):
                    os.remove(temp_path)

            def reduction_pct(b, a):
                return round((1 - (a / b)) * 100, 1) if b > 0 else 0.0

            result = {
                'success': True,
                'data': {
                    'before': before,
                    'after': after,
                    'reduction': {
                        'pipes_pct': reduction_pct(before['pipes'], after['pipes']),
                        'junctions_pct': reduction_pct(before['junctions'], after['junctions'])
                    },
                    'pipe_diameter_threshold_mm': threshold_mm,
                    'inp_content': inp_content
                }
            }
            print(json.dumps(result))
        except Exception as e:
            print(json.dumps({'success': False, 'error': str(e)}))

    # ------------------------------------------------------------------
    # Feature: Simulación de interrupción del servicio (#22)
    # ------------------------------------------------------------------
    def _apply_component_failures(self, wn, components, failure_start_hours, restore_hours):
        """Close one or more components (pipe/pump/valve) using wntr.network.controls."""
        failure_start_s = float(failure_start_hours) * 3600.0
        applied = []
        for comp in components:
            comp_id = comp.get('id') if isinstance(comp, dict) else comp
            try:
                link = wn.get_link(comp_id)
            except KeyError:
                continue

            close_action = ctrls.ControlAction(link, 'status', LinkStatus.Closed)
            close_condition = ctrls.SimTimeCondition(wn, '=', failure_start_s)
            wn.add_control(
                f'fail_close_{comp_id}',
                ctrls.Control(close_condition, close_action, name=f'fail_close_{comp_id}')
            )

            if restore_hours is not None:
                restore_s = float(restore_hours) * 3600.0
                open_action = ctrls.ControlAction(link, 'status', LinkStatus.Open)
                open_condition = ctrls.SimTimeCondition(wn, '=', restore_s)
                wn.add_control(
                    f'fail_open_{comp_id}',
                    ctrls.Control(open_condition, open_action, name=f'fail_open_{comp_id}')
                )

            applied.append(comp_id)
        return applied

    # ------------------------------------------------------------------
    # Motor de escenarios (#43)
    # ------------------------------------------------------------------
    #
    # Un escenario es una lista de eventos declarativos que se aplican sobre una
    # copia de la red antes de simular. Las cuatro familias de causa que pide el
    # issue —naturales, operativas, inducidas y de demanda— no son cuatro
    # mecanismos distintos en WNTR: se expresan con estos cinco, y un terremoto
    # es una lista de roturas igual que un ciberataque es una pérdida de control.
    #
    # Cada aplicación devuelve el método que usó, porque varios de estos eventos
    # admiten más de una forma de modelarse y la cifra de impacto depende de cuál
    # se eligió. Lo que no se pueda aplicar se devuelve en `omitidos` con su
    # motivo, en vez de simularse a medias en silencio.

    def _ventana_s(self, evento, duration_hours):
        """La ventana del evento en segundos, acotada a la simulación."""
        desde = float(evento.get('desde_h', 0.0)) * 3600.0
        hasta = evento.get('hasta_h')
        fin_sim = float(duration_hours) * 3600.0
        if hasta is None:
            return desde, None
        return desde, min(float(hasta) * 3600.0, fin_sim)

    def _cerrar_enlaces(self, wn, ids, desde_s, hasta_s, etiqueta):
        """Cierra enlaces por control, y los reabre si el evento termina."""
        aplicados = []
        omitidos = []
        for elemento in ids:
            try:
                link = wn.get_link(elemento)
            except KeyError:
                omitidos.append({'id': str(elemento), 'motivo': 'no existe en la red'})
                continue

            wn.add_control(
                f'{etiqueta}_cierra_{elemento}',
                ctrls.Control(
                    ctrls.SimTimeCondition(wn, '=', desde_s),
                    ctrls.ControlAction(link, 'status', LinkStatus.Closed),
                    name=f'{etiqueta}_cierra_{elemento}',
                ),
            )
            if hasta_s is not None:
                wn.add_control(
                    f'{etiqueta}_abre_{elemento}',
                    ctrls.Control(
                        ctrls.SimTimeCondition(wn, '=', hasta_s),
                        ctrls.ControlAction(link, 'status', LinkStatus.Open),
                        name=f'{etiqueta}_abre_{elemento}',
                    ),
                )
            aplicados.append(str(elemento))
        return aplicados, omitidos

    def _evento_rotura(self, wn, evento, duration_hours):
        """
        Rotura de tubería: cierre, o fuga con descarga a la atmósfera.

        La fuga se pone en un nudo extremo de la tubería y no partiéndola por la
        mitad: `wntr.morph.split_pipe` sería más fiel al punto de rotura, pero
        cambia la topología y renombra elementos, y el usuario no reconocería en
        el resultado la red que cargó. El método queda declarado en la respuesta.
        """
        desde_s, hasta_s = self._ventana_s(evento, duration_hours)
        modo = str(evento.get('modo', 'cierre')).lower()
        ids = evento.get('elementos') or []

        if modo != 'fuga':
            aplicados, omitidos = self._cerrar_enlaces(wn, ids, desde_s, hasta_s, 'rotura')
            return aplicados, omitidos, 'cierre del enlace por control'

        area = float(evento.get('area_m2', 0.01))
        coef = float(evento.get('coef_descarga', 0.75))
        aplicados, omitidos = [], []
        for elemento in ids:
            try:
                tuberia = wn.get_link(elemento)
            except KeyError:
                omitidos.append({'id': str(elemento), 'motivo': 'no existe en la red'})
                continue

            nudo = None
            for extremo in (tuberia.start_node, tuberia.end_node):
                if extremo.node_type == 'Junction':
                    nudo = extremo
                    break
            if nudo is None:
                omitidos.append({'id': str(elemento), 'motivo': 'ningún extremo es un nudo de consumo donde poner la fuga'})
                continue

            nudo.add_leak(wn, area=area, discharge_coeff=coef, start_time=desde_s, end_time=hasta_s)
            aplicados.append(f'{elemento}@{nudo.name}')
        return aplicados, omitidos, f'fuga de {area} m2 (Cd={coef}) en un nudo extremo, sin partir la tubería'

    def _evento_paro_bomba(self, wn, evento, duration_hours):
        """
        Bomba fuera de servicio: corte de energía, avería o parada operativa.

        Se usa `Pump.add_outage` de WNTR, que existe justamente para esto y
        aplica la regla con **prioridad 6** (muy alta). Cerrar la bomba con un
        control corriente no basta: en una red cuyos controles gobiernan el
        bombeo, el propio control la reabre al paso siguiente y el paro se
        deshace sin que nada lo diga. Medido en Net3, que tiene 18 controles: un
        paro de cuatro horas de la bomba 335 daba **0,0 kWh** de diferencia, es
        decir, no pasaba nada. En Chamisero, que no tiene controles, sí
        funcionaba, y por eso no se vio antes.

        `add_after_outage_rule` se pasa cuando el evento tiene fin, para que la
        bomba vuelva; WNTR advierte de que, si no, el estado posterior lo deciden
        los controles de la red, y en una red sin controles se quedaría parada
        para siempre.
        """
        desde_s, hasta_s = self._ventana_s(evento, duration_hours)
        aplicados, omitidos = [], []
        con_regla = False

        for elemento in evento.get('elementos') or []:
            try:
                enlace = wn.get_link(elemento)
            except KeyError:
                omitidos.append({'id': str(elemento), 'motivo': 'no existe en la red'})
                continue

            if hasattr(enlace, 'add_outage'):
                enlace.add_outage(wn, desde_s, hasta_s, add_after_outage_rule=hasta_s is not None)
                con_regla = True
                aplicados.append(str(elemento))
            else:
                # No es una bomba: se cierra como cualquier otro enlace, que es
                # lo que se puede hacer y lo que se declara.
                hechos, fallidos = self._cerrar_enlaces(wn, [elemento], desde_s, hasta_s, 'paro')
                aplicados.extend(hechos)
                omitidos.extend(fallidos)

        metodo = ('regla de apagón de WNTR con prioridad alta, para que los controles de la red no la deshagan'
                  if con_regla else 'enlace cerrado por control en la ventana del evento')
        return aplicados, omitidos, metodo

    def _evento_perdida_control(self, wn, evento, duration_hours):
        """
        Pérdida de control: los automatismos dejan de actuar y los activos se
        quedan como están (el caso de ciberseguridad, y también el de un SCADA
        caído).

        Los controles de WNTR son estáticos: no se pueden «apagar» a mitad de
        simulación, así que la pérdida se modela para toda la ventana simulada y
        así se declara. Lo que sí respeta la ventana es la congelación explícita
        de activos, que se hace con controles propios.
        """
        alcance = evento.get('alcance', 'todos')
        nombres = list(wn.control_name_list) if alcance == 'todos' else [str(c) for c in alcance]

        retirados = []
        omitidos = []
        for nombre in nombres:
            try:
                wn.remove_control(nombre)
                retirados.append(nombre)
            except (KeyError, ValueError):
                omitidos.append({'id': nombre, 'motivo': 'no es un control de la red'})

        desde_s, hasta_s = self._ventana_s(evento, duration_hours)
        congelados = []
        for elemento in evento.get('congelar') or []:
            try:
                link = wn.get_link(elemento)
            except KeyError:
                omitidos.append({'id': str(elemento), 'motivo': 'no existe en la red'})
                continue
            estado = LinkStatus.Closed if str(evento.get('congelar_en', 'cerrado')).lower() == 'cerrado' else LinkStatus.Open
            wn.add_control(
                f'congela_{elemento}',
                ctrls.Control(
                    ctrls.SimTimeCondition(wn, '=', desde_s),
                    ctrls.ControlAction(link, 'status', estado),
                    name=f'congela_{elemento}',
                ),
            )
            congelados.append(str(elemento))

        aplicados = [f'controles_retirados:{len(retirados)}'] + [f'congelado:{c}' for c in congelados]
        return aplicados, omitidos, 'controles retirados durante toda la ventana simulada; activos congelados con control propio'

    def _evento_sobredemanda(self, wn, evento, duration_hours):
        """
        Sobredemanda: incendio, rotura de consigna o punta estacional.

        Se añade una demanda **aditiva** de (multiplicador − 1) × demanda base en
        la ventana, no un factor sobre el patrón existente. Es como se modela un
        caudal de incendio, y evita tener que rehacer el patrón de cada nudo con
        su propio paso de tiempo. Para una punta estacional la diferencia es de
        segundo orden, y el método va declarado.
        """
        multiplicador = float(evento.get('multiplicador', 2.0))
        if multiplicador <= 1.0:
            return [], [{'id': 'multiplicador', 'motivo': 'debe ser mayor que 1'}], 'sin efecto'

        desde_s, hasta_s = self._ventana_s(evento, duration_hours)
        fin_s = hasta_s if hasta_s is not None else float(duration_hours) * 3600.0

        nudos = evento.get('nudos')
        if not nudos or nudos == 'todos':
            nudos = list(wn.junction_name_list)

        # Un patrón de 0/1 con el paso del patrón de la red: dentro de la ventana
        # entra la demanda extra, fuera no.
        paso = float(wn.options.time.pattern_timestep or wn.options.time.hydraulic_timestep or 3600.0)
        n = max(1, int(np.ceil(float(duration_hours) * 3600.0 / paso)) + 1)
        mascara = [1.0 if desde_s <= i * paso < fin_s else 0.0 for i in range(n)]
        nombre_patron = 'boorie_sobredemanda'
        if nombre_patron not in wn.pattern_name_list:
            wn.add_pattern(nombre_patron, mascara)

        aplicados, omitidos = [], []
        for elemento in nudos:
            try:
                nudo = wn.get_node(elemento)
            except KeyError:
                omitidos.append({'id': str(elemento), 'motivo': 'no existe en la red'})
                continue
            if nudo.node_type != 'Junction' or not nudo.demand_timeseries_list:
                omitidos.append({'id': str(elemento), 'motivo': 'no es un nudo con demanda'})
                continue

            base = float(nudo.demand_timeseries_list[0].base_value)
            if base <= 0:
                omitidos.append({'id': str(elemento), 'motivo': 'demanda base nula o negativa'})
                continue
            nudo.demand_timeseries_list.append(
                (base * (multiplicador - 1.0), nombre_patron, 'boorie_sobredemanda'))
            aplicados.append(str(elemento))

        return aplicados, omitidos, f'demanda aditiva de {multiplicador - 1.0:.2f} x la base en la ventana'

    def _evento_reduccion_fuente(self, wn, evento, duration_hours):
        """
        Menos agua en el origen: sequía, o un embalse que baja de nivel.

        Se aplica sobre `base_head` del embalse y para toda la simulación: la
        ventana no se respeta a propósito, porque una sequía no es un evento con
        hora de inicio y el nivel de una fuente no se recupera a mitad del día.
        """
        factor = float(evento.get('factor', 0.5))
        aplicados, omitidos = [], []
        for elemento in evento.get('elementos') or []:
            try:
                nodo = wn.get_node(elemento)
            except KeyError:
                omitidos.append({'id': str(elemento), 'motivo': 'no existe en la red'})
                continue
            if nodo.node_type != 'Reservoir':
                omitidos.append({'id': str(elemento), 'motivo': 'no es un embalse'})
                continue
            if 'nivel_m' in evento:
                nodo.base_head = float(evento['nivel_m'])
            else:
                nodo.base_head = float(nodo.base_head) * factor
            aplicados.append(f'{elemento}->{nodo.base_head:.2f} m')
        detalle = f"nivel fijado a {evento['nivel_m']} m" if 'nivel_m' in evento else f'base_head x {factor}'
        return aplicados, omitidos, f'{detalle}, durante toda la simulación'

    EVENTOS = {
        'pipe_break': '_evento_rotura',
        'pump_outage': '_evento_paro_bomba',
        'control_loss': '_evento_perdida_control',
        'demand_surge': '_evento_sobredemanda',
        'source_reduction': '_evento_reduccion_fuente',
    }

    def _aplicar_eventos(self, wn, eventos, duration_hours):
        aplicados = []
        for i, evento in enumerate(eventos):
            tipo = str(evento.get('tipo', '')).lower()
            metodo = self.EVENTOS.get(tipo)
            if metodo is None:
                aplicados.append({
                    'indice': i, 'tipo': tipo, 'aplicado': False,
                    'omitidos': [{'id': tipo, 'motivo': f'tipo de evento desconocido; admitidos: {", ".join(sorted(self.EVENTOS))}'}],
                })
                continue
            hechos, omitidos, como = getattr(self, metodo)(wn, evento, duration_hours)
            aplicados.append({
                'indice': i,
                'tipo': tipo,
                'aplicado': bool(hechos),
                'elementos': hechos,
                'metodo': como,
                'omitidos': omitidos,
                'desde_h': float(evento.get('desde_h', 0.0)),
                'hasta_h': evento.get('hasta_h'),
            })
        return aplicados

    # ------------------------------------------------------------------
    # Población y clientes afectados (#32)
    # ------------------------------------------------------------------
    def _enable_pda(self, wn, required_pressure, minimum_pressure):
        """
        PDA es el único modo físicamente correcto para un escenario de
        degradación: en DDA un nudo con 10 m de presión recibe el 100% de su
        demanda y el impacto sale cero.
        """
        wn.options.hydraulic.demand_model = 'PDA'
        wn.options.hydraulic.required_pressure = float(required_pressure)
        wn.options.hydraulic.minimum_pressure = float(minimum_pressure)

    def _population(self, wn, demand_module_lphd):
        """
        population(wn, R) con R derivado del módulo de demanda del usuario.

        WNTR aplica pob = demanda_media / R sin filtrar signos, así que un nudo
        que modela una fuente como demanda negativa sale con población negativa
        (en la red de pruebas: -4601 hab, dejando el total de red en 0). Se
        recortan a cero y se declaran aparte para que la cifra sea trazable.
        """
        R = float(demand_module_lphd) / 1000.0 / 86400.0  # l/hab/día -> m3/s/hab
        raw = population(wn, R)
        negative_nodes = [{'id': str(k), 'population': float(v)} for k, v in raw[raw < 0].items()]
        return raw.clip(lower=0), R, negative_nodes

    def _service_metrics(self, wn, results, pop, threshold):
        """
        Disponibilidad de servicio nudo a nudo y población impactada.

        La disponibilidad es NaN donde la demanda esperada es 0 (nudos sin
        demanda); ahí no hay déficit posible, así que se trata como servicio
        completo en lugar de propagar el NaN a las sumas.
        """
        exp = expected_demand(wn)
        dem = results.node['demand'].loc[:, exp.columns]
        # Recortada por abajo a cero (#77): un nudo que en algún instante devuelve
        # agua a la red sale con demanda entregada negativa y arrastra la
        # disponibilidad por debajo de cero. «Disponibilidad de servicio -0,3» no
        # significa nada; el nudo ya cuenta como afectado con cero, que es lo que
        # el umbral mira.
        wsa = water_service_availability(exp, dem).fillna(1.0).clip(lower=0.0)
        impacted = population_impacted(pop.reindex(wsa.columns).fillna(0.0), wsa, np.less, threshold)

        # Integración por intervalos (Riemann por la izquierda). Una simulación
        # de 24 h con paso de 1 h reporta 25 instantes, no 25 intervalos: contar
        # instantes daba 25 h de déficit en una ventana de 24 h y sobreestimaba
        # el volumen en un paso completo.
        index = wsa.index.to_numpy(dtype=float)
        intervals_s = np.diff(index) if len(index) > 1 else np.array([0.0])
        below = (wsa < threshold).iloc[:-1] if len(index) > 1 else (wsa < threshold)
        deficit = (exp - dem).clip(lower=0.0)
        deficit_head = deficit.iloc[:-1] if len(index) > 1 else deficit

        return {
            'wsa': wsa,
            'impacted': impacted,
            'outage_hours': below.multiply(intervals_s, axis=0).sum(axis=0) / 3600.0,
            'undelivered_m3': deficit_head.multiply(intervals_s, axis=0).sum(axis=0),
            'timestep_s': float(np.median(intervals_s)) if len(index) > 1 else 0.0,
        }

    def _summarise_population(self, m, pop, results):
        wsa, impacted = m['wsa'], m['impacted']
        peak_per_node = impacted.max(axis=0)
        outage_hours = m['outage_hours']
        undelivered_per_node = m['undelivered_m3']
        pressure = results.node['pressure']

        affected = []
        for node in peak_per_node.index:
            if peak_per_node[node] <= 0:
                continue
            affected.append({
                'id': str(node),
                'population': float(pop.get(node, 0.0)),
                'population_affected': float(peak_per_node[node]),
                'min_service_availability': float(wsa[node].min()),
                'outage_hours': float(outage_hours[node]),
                'undelivered_m3': float(undelivered_per_node[node]),
                'min_pressure': float(pressure[node].min()) if node in pressure.columns else None,
            })
        affected.sort(key=lambda a: a['population_affected'], reverse=True)

        return {
            'population_affected': int(round(float(peak_per_node.sum()))),
            'affected_node_count': len(affected),
            'affected_nodes': affected,
            'max_outage_hours': float(outage_hours.max()) if len(outage_hours) else 0.0,
            'undelivered_volume_m3': float(undelivered_per_node.sum()),
            'min_service_availability': float(wsa.to_numpy().min()) if wsa.size else 1.0,
        }

    @staticmethod
    def _attributable(event, baseline):
        """
        Lo que añade el evento sobre la corrida de referencia, nunca negativo (#77).

        La resta puede salir por debajo de cero sin que nada esté mal: cerrar una
        tubería redistribuye presiones, y hay nudos que quedan mejor que sin el
        corte. Como impacto atribuible, «-118 habitantes afectados» no se puede
        leer —nadie recupera el servicio que no había perdido—, así que el
        indicador se queda en cero.

        La resta en bruto se conserva en `raw_difference`: recortar la cifra que
        se enseña no es motivo para perder el dato con el que se calculó, y una
        diferencia negativa grande sí es algo que mirar en la red.
        """
        raw = {
            'population_affected': event['population_affected'] - baseline['population_affected'],
            'affected_node_count': event['affected_node_count'] - baseline['affected_node_count'],
            'undelivered_volume_m3': event['undelivered_volume_m3'] - baseline['undelivered_volume_m3'],
        }
        return {
            'population_affected': max(0, raw['population_affected']),
            'affected_node_count': max(0, raw['affected_node_count']),
            'undelivered_volume_m3': max(0.0, raw['undelivered_volume_m3']),
            'raw_difference': raw,
            'clipped_to_zero': sorted(k for k, v in raw.items() if v < 0),
        }

    def _population_impact(self, wn_base, res_base, wn_ev, res_ev, opts):
        """Población afectada a partir de las dos corridas que ya hizo simulate_failure."""
        demand_module = float(opts.get('demand_module_lphd', DEFAULT_DEMAND_MODULE_LPHD))
        threshold = float(opts.get('availability_threshold', DEFAULT_AVAILABILITY_THRESHOLD))
        persons_per_connection = opts.get('persons_per_connection')

        if demand_module <= 0:
            raise ValueError('El módulo de demanda debe ser mayor que cero')
        if not 0 < threshold <= 1:
            raise ValueError('El umbral de disponibilidad debe estar entre 0 y 1')

        pop, R, negative_nodes = self._population(wn_base, demand_module)
        baseline = self._summarise_population(
            self._service_metrics(wn_base, res_base, pop, threshold), pop, res_base)
        ev_metrics = self._service_metrics(wn_ev, res_ev, pop, threshold)
        event = self._summarise_population(ev_metrics, pop, res_ev)

        total_population = int(round(float(pop.sum())))
        connections = None
        ppc = float(persons_per_connection) if persons_per_connection else 0.0
        if ppc > 0:
            connections = {
                'persons_per_connection': ppc,
                'total_connections': int(round(total_population / ppc)),
                'affected_connections': int(round(event['population_affected'] / ppc)),
                'method': 'derived_from_population',
            }

        return {
            'total_population': total_population,
            'population_nodes': int((pop > 0).sum()),
            'event': event,
            'baseline': baseline,
            # Sin corrida de referencia, el déficit crónico de la red se
            # atribuiría entero al evento.
            'attributable_to_event': self._attributable(event, baseline),
            'connections': connections,
            'excluded_negative_demand_nodes': negative_nodes,
            'traceability': {
                'demand_model': 'PDA',
                'simulator': 'WNTRSimulator',
                'wntr_version': wntr.__version__,
                'demand_module_lphd': demand_module,
                'per_capita_demand_m3s': R,
                'availability_threshold': threshold,
                'required_pressure_m': float(opts.get('required_pressure', DEFAULT_REQUIRED_PRESSURE)),
                'minimum_pressure_m': float(opts.get('minimum_pressure', DEFAULT_MINIMUM_PRESSURE)),
                'timestep_s': ev_metrics['timestep_s'],
                'population_metric': 'wntr.metrics.population',
                'impact_metric': 'wntr.metrics.population_impacted(service_availability < threshold)',
            },
        }

    def _run_extended(self, wn, duration_hours):
        wn.options.time.duration = float(duration_hours) * 3600.0
        self._prepare_wntr_simulator(wn)
        sim = wntr.sim.WNTRSimulator(wn)
        return sim.run_sim()

    def _run_extended_checked(self, wn, duration_hours):
        """
        Como _run_extended, pero recoge los avisos de no convergencia.
        "Exceeded maximum number of trials" significa que el paso no convergió y
        las cifras de ese instante no son fiables; se reportan en lugar de
        silenciarlas, porque el criterio es que ninguna cifra salga de una
        estimación no simulada.
        """
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter('always')
            results = self._run_extended(wn, duration_hours)
        return results, [
            str(w.message) for w in caught
            if 'maximum number of trials' in str(w.message).lower()
        ]

    def simulate_failure(self, inp_file, options=None):
        start_time = time.time()
        try:
            options = options or {}
            components = options.get('components', [])
            if not components:
                print(json.dumps({'success': False, 'error': 'No components specified'}))
                return

            duration_hours = float(options.get('duration_hours', 24))
            failure_start_hours = float(options.get('failure_start_hours', 0))
            restore_hours = options.get('restore_hours')
            min_pressure_threshold = float(options.get('min_pressure_threshold', 10.0))
            required_pressure = float(options.get('required_pressure', DEFAULT_REQUIRED_PRESSURE))
            minimum_pressure = float(options.get('minimum_pressure', DEFAULT_MINIMUM_PRESSURE))

            # Baseline (undisturbed) run, used to report the pressure drop caused by the failure
            wn_baseline = self.load_network(inp_file)
            self._enable_pda(wn_baseline, required_pressure, minimum_pressure)
            baseline_results, baseline_convergence = self._run_extended_checked(wn_baseline, duration_hours)
            baseline_pressure = baseline_results.node['pressure']

            # Failure run
            wn_failure = self.load_network(inp_file)
            self._enable_pda(wn_failure, required_pressure, minimum_pressure)
            applied = self._apply_component_failures(wn_failure, components, failure_start_hours, restore_hours)
            if not applied:
                print(json.dumps({'success': False, 'error': 'None of the specified components exist in the network'}))
                return

            failure_results, event_convergence = self._run_extended_checked(wn_failure, duration_hours)
            pressure = failure_results.node['pressure']

            # Por intervalos, no por instantes: una ventana de 24 h con paso de
            # 1 h reporta 25 instantes y contarlos daba 25 h de corte.
            index = pressure.index.to_numpy(dtype=float)
            intervals_h = (np.diff(index) / 3600.0) if len(index) > 1 else np.array([0.0])

            affected_nodes = []
            for node_name in wn_failure.junction_name_list:
                node_pressure = pressure.loc[:, node_name]
                min_p = float(node_pressure.min())
                baseline_min_p = float(baseline_pressure.loc[:, node_name].min()) if node_name in baseline_pressure.columns else min_p
                below = (node_pressure < min_pressure_threshold).to_numpy()
                outage_hours = float((below[:-1] * intervals_h).sum()) if len(index) > 1 else 0.0

                if min_p < min_pressure_threshold or outage_hours > 0:
                    affected_nodes.append({
                        'id': node_name,
                        'min_pressure': min_p,
                        'baseline_min_pressure': baseline_min_p,
                        # Una caída no es negativa: donde el fallo deja el nudo
                        # mejor que antes, la caída es cero y la mejora se lee en
                        # las dos presiones, que van al lado (#77).
                        'pressure_drop': max(0.0, baseline_min_p - min_p),
                        'outage_hours': outage_hours
                    })
            affected_nodes.sort(key=lambda n: n['outage_hours'], reverse=True)

            node_results = {}
            for node_name in wn_failure.node_name_list:
                node_results[node_name] = {
                    'pressure': pressure.loc[:, node_name].tolist(),
                }
            link_results = {}
            for link_name in wn_failure.link_name_list:
                link_results[link_name] = {
                    'flowrate': failure_results.link['flowrate'].loc[:, link_name].tolist(),
                }

            result = {
                'success': True,
                'data': {
                    'status': 'Completed',
                    'execution_time': time.time() - start_time,
                    'failed_components': applied,
                    'failure_start_hours': failure_start_hours,
                    'restore_hours': restore_hours,
                    'duration_hours': duration_hours,
                    'min_pressure_threshold': min_pressure_threshold,
                    'affected_nodes': affected_nodes,
                    'affected_node_count': len(affected_nodes),
                    'total_junction_count': len(wn_failure.junction_name_list),
                    'node_results': node_results,
                    'link_results': link_results,
                    'timestamps': pressure.index.tolist(),
                    'convergence_warnings': {
                        'baseline': baseline_convergence,
                        'event': event_convergence,
                        'converged': not baseline_convergence and not event_convergence,
                    },
                    # Misma interrupción, medida en habitantes: se reaprovechan
                    # las dos corridas de arriba en vez de simular otra vez.
                    'population': self._population_impact(
                        wn_baseline, baseline_results, wn_failure, failure_results, options
                    ),
                }
            }
            print(json.dumps(result))
        except Exception as e:
            print(json.dumps({'success': False, 'error': str(e)}))

    def simulate_scenario(self, inp_file, options=None):
        """
        Ejecuta un escenario declarativo y devuelve su impacto (#43).

        Dos corridas en PDA, igual que la interrupción de un componente: una de
        referencia y otra con los eventos aplicados. La de referencia no es un
        lujo —sin ella, el déficit que la red ya arrastra se le atribuye al
        escenario, y en la red de pruebas eso son 2009 habitantes que nadie
        perdió por el evento (ver docs/POBLACION_AFECTADA_PDA.md).

        PDA no es opcional: en modo dirigido por demanda un nudo con 5 m de
        columna recibe el 100% de su demanda y cualquier escenario de degradación
        sale con impacto cero.
        """
        start_time = time.time()
        try:
            options = options or {}
            eventos = options.get('eventos') or []
            if not eventos:
                print(json.dumps({'success': False, 'error': 'El escenario no declara ningún evento'}))
                return

            duration_hours = float(options.get('duration_hours', 24))
            min_pressure_threshold = float(options.get('min_pressure_threshold', 10.0))
            required_pressure = float(options.get('required_pressure', DEFAULT_REQUIRED_PRESSURE))
            minimum_pressure = float(options.get('minimum_pressure', DEFAULT_MINIMUM_PRESSURE))

            wn_base = self.load_network(inp_file)
            self._enable_pda(wn_base, required_pressure, minimum_pressure)
            res_base, conv_base = self._run_extended_checked(wn_base, duration_hours)

            wn_ev = self.load_network(inp_file)
            self._enable_pda(wn_ev, required_pressure, minimum_pressure)
            aplicados = self._aplicar_eventos(wn_ev, eventos, duration_hours)

            if not any(e['aplicado'] for e in aplicados):
                print(json.dumps({
                    'success': False,
                    'error': 'Ningún evento del escenario pudo aplicarse sobre esta red',
                    'eventos': aplicados,
                }))
                return

            res_ev, conv_ev = self._run_extended_checked(wn_ev, duration_hours)

            presion = res_ev.node['pressure']
            presion_base = res_base.node['pressure']
            index = presion.index.to_numpy(dtype=float)
            intervalos_h = (np.diff(index) / 3600.0) if len(index) > 1 else np.array([0.0])

            nudos_bajo_minimo = []
            for nudo in wn_ev.junction_name_list:
                serie = presion.loc[:, nudo]
                min_p = float(serie.min())
                min_base = float(presion_base.loc[:, nudo].min()) if nudo in presion_base.columns else min_p
                bajo = (serie < min_pressure_threshold).to_numpy()
                horas = float((bajo[:-1] * intervalos_h).sum()) if len(index) > 1 else 0.0
                if min_p < min_pressure_threshold or horas > 0:
                    nudos_bajo_minimo.append({
                        'id': str(nudo),
                        'min_pressure': min_p,
                        'baseline_min_pressure': min_base,
                        'pressure_drop': max(0.0, min_base - min_p),
                        'hours_below_threshold': horas,
                    })
            nudos_bajo_minimo.sort(key=lambda n: n['hours_below_threshold'], reverse=True)

            poblacion = self._population_impact(wn_base, res_base, wn_ev, res_ev, options)

            resultado = {
                'success': True,
                'data': {
                    'status': 'Completed',
                    'execution_time': time.time() - start_time,
                    'scenario': {
                        'name': options.get('nombre') or 'Escenario sin nombre',
                        'events': aplicados,
                        'duration_hours': duration_hours,
                    },
                    # La demanda no satisfecha, que es la cifra que da sentido a
                    # todo lo demás: sale de las mismas dos corridas PDA.
                    'unmet_demand': {
                        'total_m3': poblacion['event']['undelivered_volume_m3'],
                        'baseline_m3': poblacion['baseline']['undelivered_volume_m3'],
                        'attributable_m3': poblacion['attributable_to_event']['undelivered_volume_m3'],
                        'by_node': [
                            {'id': n['id'], 'undelivered_m3': n['undelivered_m3'],
                             'outage_hours': n['outage_hours'],
                             'min_service_availability': n['min_service_availability']}
                            for n in poblacion['event']['affected_nodes']
                        ],
                        'max_deficit_hours': poblacion['event']['max_outage_hours'],
                    },
                    'nodes_below_minimum_pressure': nudos_bajo_minimo,
                    'min_pressure_threshold': min_pressure_threshold,
                    'total_junction_count': len(wn_ev.junction_name_list),
                    'population': poblacion,
                    'timestamps': index.tolist(),
                    'convergence_warnings': {
                        'baseline': conv_base,
                        'event': conv_ev,
                        'converged': not conv_base and not conv_ev,
                    },
                },
            }
            print(json.dumps(resultado))
        except Exception as e:
            print(json.dumps({'success': False, 'error': str(e)}))

    # ------------------------------------------------------------------
    # Feature: Indicadores de resiliencia (#23)
    # ------------------------------------------------------------------
    def _resilience_snapshot(self, wn, min_pressure_threshold):
        """Compute Todini index, network entropy, hydraulic redundancy and serviceability for a network state."""
        self._prepare_wntr_simulator(wn)
        sim = wntr.sim.WNTRSimulator(wn)
        results = sim.run_sim()

        head = results.node['head']
        pressure = results.node['pressure']
        demand = results.node['demand']
        flowrate = results.link['flowrate']

        todini = wntr.metrics.hydraulic.todini_index(head, pressure, demand, flowrate, wn, 30)
        todini_score = float(todini.mean())

        # Network entropy: directed graph weighted by flow at the last report step
        try:
            last_flow = flowrate.iloc[-1]
            G = wn.to_graph(link_weight=last_flow, modify_direction=True)
            _, system_entropy = wntr.metrics.hydraulic.entropy(G)
            entropy_score = float(system_entropy) if system_entropy == system_entropy else 0.0  # NaN guard
        except Exception:
            entropy_score = 0.0

        # Hydraulic redundancy: modified resilience index (surplus power vs. min required power)
        try:
            elevation = wn.query_node_attribute('elevation')
            junction_pressure = pressure[wn.junction_name_list]
            junction_elevation = elevation[wn.junction_name_list]
            junction_demand = demand[wn.junction_name_list]
            mri = wntr.metrics.hydraulic.modified_resilience_index(
                junction_pressure, junction_elevation, min_pressure_threshold,
                demand=junction_demand, per_junction=False
            )
            redundancy_score = float(mri.mean())
        except Exception:
            redundancy_score = 0.0

        # Serviceability: fraction of junctions meeting minimum pressure at every reported timestep
        junction_pressure = pressure[wn.junction_name_list]
        meets_min = (junction_pressure >= min_pressure_threshold).all(axis=0)
        pressure_serviceability = float(meets_min.mean()) if len(meets_min) > 0 else 0.0

        return {
            'todini_index': todini_score,
            'network_entropy': entropy_score,
            'hydraulic_redundancy': redundancy_score,
            'serviceability': {
                'pressure_serviceability': pressure_serviceability,
                'junctions_meeting_pressure': int(meets_min.sum()),
                'total_junctions': len(meets_min)
            }
        }

    def resilience_indicators(self, inp_file, options=None):
        try:
            options = options or {}
            duration_hours = float(options.get('duration_hours', 24))
            min_pressure_threshold = float(options.get('min_pressure_threshold', 10.0))
            failed_components = options.get('failed_components', [])
            failure_start_hours = float(options.get('failure_start_hours', 0))

            wn_before = self.load_network(inp_file)
            wn_before.options.time.duration = duration_hours * 3600.0
            before = self._resilience_snapshot(wn_before, min_pressure_threshold)

            data = {'before': before}

            if failed_components:
                wn_after = self.load_network(inp_file)
                wn_after.options.time.duration = duration_hours * 3600.0
                self._apply_component_failures(wn_after, failed_components, failure_start_hours, None)
                after = self._resilience_snapshot(wn_after, min_pressure_threshold)
                data['after'] = after
                data['delta'] = {
                    'todini_index': after['todini_index'] - before['todini_index'],
                    'network_entropy': after['network_entropy'] - before['network_entropy'],
                    'hydraulic_redundancy': after['hydraulic_redundancy'] - before['hydraulic_redundancy'],
                    'pressure_serviceability': (
                        after['serviceability']['pressure_serviceability'] -
                        before['serviceability']['pressure_serviceability']
                    )
                }

            print(json.dumps({'success': True, 'data': data}))
        except Exception as e:
            print(json.dumps({'success': False, 'error': str(e)}))

    # ------------------------------------------------------------------
    # Feature: Curva de fragilidad (#25)
    # ------------------------------------------------------------------
    def fragility_curve(self, inp_file, options=None):
        """
        Seismic fragility curve for network pipes: probability of failure
        (leak/break) vs. hazard intensity (PGV, cm/s), using the ALA
        (American Lifelines Alliance, 2001) repair-rate methodology and a
        lognormal fragility function per pipe material.

        NOTE: the median-PGV coefficients below are generic published
        defaults for a pipeline population, NOT calibrated against any
        specific network. Boorie issue #25 explicitly requires these to be
        validated with an APyS domain expert before being used for real
        decision-making — treat this as a first estimate only.
        """
        try:
            import numpy as np
            from scipy.stats import lognorm

            options = options or {}
            wn = self.load_network(inp_file)

            hazard_type = options.get('hazard_type', 'seismic_pgv')
            material = str(options.get('material', 'DEFAULT')).upper()
            max_intensity = float(options.get('max_intensity', 100))
            steps = int(options.get('steps', 21))
            intensities = list(np.linspace(0, max_intensity, steps))

            # ALA (2001)-style median PGV (cm/s) at 50% failure probability, by material.
            median_by_material = {
                'CI': 15.0, 'AC': 15.0, 'STEEL': 30.0, 'DI': 25.0,
                'PVC': 28.0, 'HDPE': 35.0, 'CONCRETE': 20.0, 'DEFAULT': 20.0
            }
            median = median_by_material.get(material, median_by_material['DEFAULT'])
            beta = float(options.get('beta', 0.5))  # lognormal dispersion, ALA default ~0.5

            pipe_failure_probability = [float(p) for p in lognorm.cdf(intensities, s=beta, scale=median)]
            pipe_count = len(wn.pipe_name_list)
            expected_failed_pipes = [p * pipe_count for p in pipe_failure_probability]
            total_length_km = sum(wn.get_link(p).length for p in wn.pipe_name_list) / 1000.0

            # Reparto por diametro (issue #94, criterio del Dr. Mora): el .inp
            # declara el diametro de cada tuberia en [PIPES], asi que el grupo
            # se forma sin tener que inferir el material de la rugosidad. Las
            # dos columnas -tuberias y longitud- son lo que permite costear el
            # dano: no cuesta lo mismo reparar 20 tuberias de 50 m que de 500.
            grupos = {}
            for nombre in wn.pipe_name_list:
                tuberia = wn.get_link(nombre)
                clave = round(float(tuberia.diameter) * 1000.0, 1)  # wntr guarda en m
                g = grupos.setdefault(clave, {'pipe_count': 0, 'length_m': 0.0})
                g['pipe_count'] += 1
                g['length_m'] += float(tuberia.length)

            by_diameter = []
            for mm in sorted(grupos):
                g = grupos[mm]
                by_diameter.append({
                    'diameter_mm': mm,
                    'pipe_count': g['pipe_count'],
                    'length_km': g['length_m'] / 1000.0,
                    'affected_pipes': [p * g['pipe_count'] for p in pipe_failure_probability],
                    'affected_length_km': [p * g['length_m'] / 1000.0
                                           for p in pipe_failure_probability],
                })

            result = {
                'success': True,
                'data': {
                    'hazard_type': hazard_type,
                    'material': material,
                    'median_pgv': median,
                    'beta': beta,
                    'intensities': [float(i) for i in intensities],
                    'pipe_failure_probability': pipe_failure_probability,
                    'expected_failed_pipes': expected_failed_pipes,
                    'pipe_count': pipe_count,
                    'total_length_km': total_length_km,
                    'by_diameter': by_diameter,
                    'methodology': (
                        'ALA (2001) repair-rate lognormal fragility (parametros genericos por material) '
                        '- requiere validacion de un experto APyS antes de usarse en decisiones reales.'
                    )
                }
            }
            print(json.dumps(result))
        except Exception as e:
            print(json.dumps({'success': False, 'error': str(e)}))


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({'success': False, 'error': 'Insufficient arguments'}))
        sys.exit(1)

    command = sys.argv[1]
    inp_file = sys.argv[2]

    cli_options = {}
    if len(sys.argv) > 3:
        try:
            cli_options = json.loads(sys.argv[3])
        except Exception:
            pass

    service = WNTRResilienceService()

    if command == 'skeletonize':
        service.skeletonize(inp_file, cli_options)
    elif command == 'simulate_failure':
        service.simulate_failure(inp_file, cli_options)
    elif command == 'scenario':
        service.simulate_scenario(inp_file, cli_options)
    elif command == 'resilience_indicators':
        service.resilience_indicators(inp_file, cli_options)
    elif command == 'fragility_curve':
        service.fragility_curve(inp_file, cli_options)
    else:
        print(json.dumps({'success': False, 'error': f'Unknown command: {command}'}))
