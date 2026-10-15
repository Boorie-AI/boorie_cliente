"""
Elección del motor de simulación hidráulica.

El WNTRSimulator es el motor de la aplicación, pero WNTR 1.5 no implementa en
él ni las válvulas PBV y GPV ni la fórmula de Darcy-Weisbach. Para salir del
paso, las GPV se cambiaban en silencio por una tubería de 1 m y D-W se pasaba a
Hazen-Williams —con la rugosidad en milímetros leída como una C—, así que la
cifra salía con éxito y no era la de la red; con una PBV, ni eso. EPANET sí las
resuelve, así que esas redes —y sólo ésas— van por el EpanetSimulator.
"""
import logging
import os
import shutil
import tempfile
import warnings

import wntr

VALVULAS_SOLO_EPANET = ('PBV', 'GPV')
DARCY_WEISBACH = ('D-W', 'DARCY-WEISBACH', 'DW')


def motivos_epanet(wn):
    motivos = []
    valvulas = [nombre for nombre, valvula in wn.valves() if valvula.valve_type in VALVULAS_SOLO_EPANET]
    if valvulas:
        motivos.append(f'válvulas {", ".join(valvulas)}')
    if str(wn.options.hydraulic.headloss).upper() in DARCY_WEISBACH:
        motivos.append('la fórmula de Darcy-Weisbach')
    return motivos


def usa_epanet(wn):
    return bool(motivos_epanet(wn))


def nombre_simulador(wn):
    return 'EpanetSimulator' if usa_epanet(wn) else 'WNTRSimulator'


class _AvisosDeEpanet(logging.Handler):
    # El toolkit manda sus avisos —entre ellos el de no convergencia— al log y
    # no a `warnings`, que es donde los recoge quien quiere reportarlos.
    def emit(self, record):
        warnings.warn(record.getMessage())


def simular(wn):
    motivos = motivos_epanet(wn)
    if not motivos:
        return wntr.sim.WNTRSimulator(wn).run_sim()

    fugas = [nombre for nombre, nudo in wn.nodes() if getattr(nudo, 'leak', False)]
    if fugas:
        raise ValueError(
            f'La red lleva {" y ".join(motivos)}, que sólo resuelve EPANET, y el escenario '
            f'lleva fugas ({", ".join(fugas)}), que EPANET no modela. No se pueden simular juntas.'
        )

    # Por defecto EPANET escribe sus ficheros en el directorio de trabajo, que
    # en la aplicación instalada puede no admitir escritura.
    carpeta = tempfile.mkdtemp(prefix='boorie-epanet-')
    log = logging.getLogger('wntr.epanet.toolkit')
    avisos = _AvisosDeEpanet(logging.WARNING)
    log.addHandler(avisos)
    try:
        return wntr.sim.EpanetSimulator(wn).run_sim(file_prefix=os.path.join(carpeta, 'red'))
    finally:
        log.removeHandler(avisos)
        shutil.rmtree(carpeta, ignore_errors=True)
