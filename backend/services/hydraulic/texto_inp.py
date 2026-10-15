"""
Lectura del texto de un fichero .inp.

WNTR sólo lee UTF-8, pero EPANET en Windows guarda en la codificación del
sistema (cp1252 en castellano): una sola «ó» en un comentario impedía cargar la
red. Y leer con `errors='ignore'` tampoco vale, porque si la letra está en un
identificador —un nudo «Añil»— el nudo pasa a llamarse de otra manera.
"""

import re


def leer_inp(ruta):
    """Devuelve (texto, cambiado): cambiado indica que el texto ya no es el del fichero."""
    with open(ruta, 'rb') as f:
        crudo = f.read()
    try:
        texto, cambiado = crudo.decode('utf-8-sig'), False
    except UnicodeDecodeError:
        try:
            texto, cambiado = crudo.decode('cp1252'), True
        except UnicodeDecodeError:
            # cp1252 deja cinco bytes sin definir; latin-1 los acepta todos.
            texto, cambiado = crudo.decode('latin-1'), True
    texto, ajustado = _paso_hidraulico_como_epanet(texto)
    return texto, cambiado or ajustado


_UNIDADES = {'SEC': 1, 'MIN': 60, 'HOUR': 3600, 'HOURS': 3600, 'DAY': 86400, 'DAYS': 86400}


def _segundos(valor, unidad=None):
    """Tiempo de [TIMES] en segundos: «0:05», «0:05:30», «1.5» (horas) o «5 MIN»."""
    if ':' in valor:
        partes = [float(p) for p in valor.split(':')]
        return sum(p * f for p, f in zip(partes, (3600, 60, 1)))
    factor = 3600
    if unidad:
        unidad = unidad.upper()
        factor = next((f for u, f in _UNIDADES.items() if unidad.startswith(u)), 3600)
    return float(valor) * factor


_LINEA_TIEMPO = re.compile(r'^\s*(HYDRAULIC|PATTERN|REPORT)\s+TIMESTEP\s+(\S+)(?:\s+([A-Za-z]+))?', re.I)


def _paso_hidraulico_como_epanet(texto):
    """
    Un paso hidráulico de 0 no es un paso: EPANET lo toma como 1 h y lo recorta
    al paso de patrones y al de informe. WNTR, en cambio, lo sube a 1 s, y una
    red de un día pasa a resolverse en 86.400 pasos: la de riego del #274 tardaba
    casi ocho minutos por simulación y el análisis de resiliencia agotaba el
    tiempo. Se escribe en el texto el paso con el que la resolvería EPANET.
    """
    lineas = texto.splitlines(keepends=True)
    en_times = False
    pasos, linea_hidraulico = {}, None
    for i, linea in enumerate(lineas):
        limpia = linea.split(';', 1)[0].strip()
        if limpia.startswith('['):
            en_times = limpia.upper() == '[TIMES]'
            continue
        if not en_times:
            continue
        m = _LINEA_TIEMPO.match(limpia)
        if not m:
            continue
        try:
            pasos[m.group(1).upper()] = _segundos(m.group(2), m.group(3))
        except ValueError:
            continue
        if m.group(1).upper() == 'HYDRAULIC':
            linea_hidraulico = i

    if linea_hidraulico is None or pasos['HYDRAULIC'] > 0:
        return texto, False

    patron = pasos.get('PATTERN') or 3600
    informe = pasos.get('REPORT') or patron
    paso = int(min(3600, patron, informe))
    lineas[linea_hidraulico] = (
        f' Hydraulic Timestep \t{paso // 3600}:{paso % 3600 // 60:02d}:{paso % 60:02d}'
        f' ;Boorie: era 0, se usa el paso que aplicaría EPANET\n'
    )
    return ''.join(lineas), True
