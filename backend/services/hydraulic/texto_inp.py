"""
Lectura del texto de un fichero .inp.

WNTR sólo lee UTF-8, pero EPANET en Windows guarda en la codificación del
sistema (cp1252 en castellano): una sola «ó» en un comentario impedía cargar la
red. Y leer con `errors='ignore'` tampoco vale, porque si la letra está en un
identificador —un nudo «Añil»— el nudo pasa a llamarse de otra manera.
"""


def leer_inp(ruta):
    """Devuelve (texto, recodificado): recodificado indica que no venía en UTF-8."""
    with open(ruta, 'rb') as f:
        crudo = f.read()
    try:
        return crudo.decode('utf-8-sig'), False
    except UnicodeDecodeError:
        pass
    try:
        return crudo.decode('cp1252'), True
    except UnicodeDecodeError:
        # cp1252 deja cinco bytes sin definir; latin-1 los acepta todos.
        return crudo.decode('latin-1'), True
