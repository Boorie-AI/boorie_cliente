
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
        wsa = water_service_availability(exp, dem).fillna(1.0)
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
            'attributable_to_event': {
                'population_affected': event['population_affected'] - baseline['population_affected'],
                'affected_node_count': event['affected_node_count'] - baseline['affected_node_count'],
                'undelivered_volume_m3': event['undelivered_volume_m3'] - baseline['undelivered_volume_m3'],
            },
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
                        'pressure_drop': baseline_min_p - min_p,
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
    elif command == 'resilience_indicators':
        service.resilience_indicators(inp_file, cli_options)
    elif command == 'fragility_curve':
        service.fragility_curve(inp_file, cli_options)
    else:
        print(json.dumps({'success': False, 'error': f'Unknown command: {command}'}))
