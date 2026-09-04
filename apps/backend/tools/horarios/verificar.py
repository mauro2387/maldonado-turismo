"""
Control del JSON de horarios contra ESQUEMA.md.

No mira si el horario es el correcto -eso se hace contra el papel, mirando la
página renderizada-, sino que el archivo cumpla el contrato: que `horas` tenga
el mismo largo que `puntos_control`, que las horas estén en HH:MM, que la línea
sea el número del cartel y que las referencias que usa cada servicio estén
declaradas arriba.

Además avisa de lo que huele mal aunque el esquema lo permita: un punto de
control sin nombre ("columna 4"), un nombre con la misma palabra repetida
("Mldo. Mldo."), un servicio con una sola hora, o dos servicios idénticos.

Uso:
    python verificar.py salida/*.json
"""

import io
import json
import re
import sys

HORA = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')

# El número del cartel: "24", "7/24", "L48" y la "D" de CODESA, que es una
# línea de verdad. Cualquier otra cosa ("SemiDto") es un aviso, no un error:
# está impresa así y quien importe tiene que decidir qué hacer con ella.
LINEA = re.compile(r'^[A-Z]{0,2}\d{1,3}(/\d{1,3})?$|^[A-Z]$')
SENTIDOS = {'ida', 'vuelta', 'circular'}
CLAVES = [
    'empresa', 'temporada', 'fuente_url', 'documento', 'vigencia_texto',
    'vigencia_desde', 'vigencia_hasta', 'extraido_el', 'revisar',
    'referencias', 'lineas',
]

# Un nombre de punto de control que quedó mal leído en el PDF.
SOSPECHOSO = re.compile(r'^columna \d+$|^\W*$')


def repetida(nombre):
    """"Mldo. Mldo." -> True. Es la marca de un encabezado leído dos veces."""
    palabras = [p for p in nombre.split() if len(p) > 1]
    return len(palabras) > 1 and len(set(palabras)) < len(palabras)


def revisar_archivo(ruta):
    datos = json.load(io.open(ruta, encoding='utf-8'))
    errores, avisos = [], []

    for clave in CLAVES:
        if clave not in datos:
            errores.append(f'falta la clave "{clave}"')
    if errores:
        return datos, errores, avisos

    if datos['temporada'] not in ('invierno', 'verano', None):
        errores.append(f'temporada "{datos["temporada"]}" no es invierno, verano ni null')
    for clave in ('vigencia_desde', 'vigencia_hasta'):
        if datos[clave] is not None:
            errores.append(f'{clave} tiene que ser null, no "{datos[clave]}"')

    declaradas = set(datos['referencias'])
    total = 0

    for linea in datos['lineas']:
        etiqueta = f'{linea.get("linea")} {linea.get("sentido")}'

        if not LINEA.match(str(linea.get('linea', ''))):
            avisos.append(f'{etiqueta}: "{linea.get("linea")}" no parece el número del cartel')
        if linea.get('sentido') not in SENTIDOS:
            errores.append(f'{etiqueta}: sentido "{linea.get("sentido")}" no es ida, vuelta ni circular')

        puntos = linea.get('puntos_control') or []
        if len(puntos) < 2:
            errores.append(f'{etiqueta}: {len(puntos)} puntos de control')
        for punto in puntos:
            if SOSPECHOSO.match(punto):
                avisos.append(f'{etiqueta}: punto de control sin nombre "{punto}"')
            elif repetida(punto):
                avisos.append(f'{etiqueta}: punto de control con palabra repetida "{punto}"')

        vistos = set()
        for numero, servicio in enumerate(linea.get('servicios') or []):
            total += 1
            donde = f'{etiqueta} servicio {numero}'
            horas = servicio.get('horas')

            if not isinstance(horas, list):
                errores.append(f'{donde}: "horas" no es una lista')
                continue
            if len(horas) != len(puntos):
                errores.append(
                    f'{donde}: {len(horas)} horas contra {len(puntos)} puntos de control'
                )
            for hora in horas:
                if hora is not None and not HORA.match(str(hora)):
                    errores.append(f'{donde}: "{hora}" no es HH:MM 24 h')

            con_hora = sum(1 for h in horas if h)
            if con_hora < 2:
                avisos.append(f'{donde}: {con_hora} hora(s) sola(s) en la fila')

            for ref in servicio.get('referencias', []):
                if ref not in declaradas:
                    errores.append(f'{donde}: referencia "{ref}" sin declarar arriba')

            firma = (tuple(horas), tuple(servicio.get('referencias', [])))
            if firma in vistos:
                avisos.append(f'{donde}: repetido, misma fila que otro servicio')
            vistos.add(firma)

    return datos, errores, avisos, total


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return

    mal = 0
    for ruta in sys.argv[1:]:
        datos, errores, avisos, total = revisar_archivo(ruta)
        print(f'\n=== {ruta}')
        print(
            f'  {datos.get("empresa")} / {datos.get("temporada")} / '
            f'{len(datos.get("lineas", []))} linea x sentido / {total} servicios'
        )
        for e in errores:
            print(f'  ERROR  {e}')
        for a in avisos:
            print(f'  aviso  {a}')
        print(f'  revisar: {len(datos.get("revisar", []))} anotaciones')
        if not errores:
            print('  esquema: OK')
        mal += len(errores)

    print(f'\n{mal} errores de esquema en total')
    sys.exit(1 if mal else 0)


if __name__ == '__main__':
    main()
