"""
Los horarios publicados por CODESA, del PDF a JSON.

CODESA publica un PDF por temporada -"Vigencia: Agosto 2026"- con una o dos
tablas por página: a la izquierda la ida y a la derecha la vuelta, y en cada
fila un servicio con su línea, sus referencias y la hora a la que pasa por cada
punto de control (Vialidad, Ag. San Carlos, Centro Mldo., Terminal, P. del
Este...).

El texto plano del PDF sale en un solo chorro y mezcla las dos mitades. Lo que
hace este script es leer las palabras **con sus coordenadas**: cada columna
tiene una x estable, así que la tabla se reconstruye sin adivinar. Es lo mismo
que hace un humano mirando la hoja.

No interpreta nada más: lo que sale es lo que dice el papel, con la referencia
de cada servicio (S = no corre sábados y domingos, D = no corre domingos) tal
como viene, y la vigencia y la fuente adentro del archivo. La traducción a
paradas de la app se hace después, en el importador.

Uso:
    python extraer_codesa.py <pdf> <salida.json>

El PDF se baja de la sección Horarios de www.codesa.com.uy (un enlace a Drive).
"""

import io
import json
import re
import sys

import fitz


# Una fila de la tabla mide unos 9 puntos: 3 alcanza para no pegar dos filas.
FILA_TOLERANCIA = 3

HORA = re.compile(r'^([0-2]?\d)[:.]([0-5]\d)$')

# Cuánto se separan dos palabras del mismo título ("P." y "del") frente a dos
# columnas distintas ("Ag." y "Centro"), que están a más de 15.
JUNTAR_TITULO = 12

# Referencias que publica CODESA al pie de cada página.
REFERENCIAS = {
    '#': 'Entran o salen a San Carlos por Av. Ceberio y Carlos Seijo (ruta vieja)',
    'S': 'No corre sábados ni domingos',
    'D': 'No corre domingos',
    '%': 'Sale de Agencia por Av. Rocha y 25 de Agosto',
    'E': 'Entra a la estación',
}

# Palabras del encabezado que no son un punto de control.
NO_ES_PUNTO = {'Línea', '&', 'Ref.', '↓', 'y'}


def palabras_por_fila(pagina):
    """Las palabras de la página agrupadas por renglón, ordenadas por x."""
    filas = {}
    for x0, y0, x1, y1, palabra, *_ in pagina.get_text('words'):
        clave = round((y0 + y1) / 2 / FILA_TOLERANCIA)
        filas.setdefault(clave, []).append((x0, palabra))

    return [(clave * FILA_TOLERANCIA, sorted(cols)) for clave, cols in sorted(filas.items())]


def primera_fila_de_datos(filas):
    """El primer renglón con dos horas: ahí empiezan los servicios."""
    for indice, (y, palabras) in enumerate(filas):
        if sum(1 for _, p in palabras if HORA.match(p)) >= 2:
            return indice, y
    return None, None


def bloque_encabezado(filas, indice_datos):
    """
    Los renglones de títulos.

    El encabezado no tiene un alto fijo: "Bal. Bs. As." ocupa tres renglones y
    "Vialidad" uno solo. Se toma desde el renglón donde CODESA pone la etiqueta
    de la línea hasta donde empiezan las horas.
    """
    inicio = 0
    for indice in range(indice_datos - 1, -1, -1):
        _, palabras = filas[indice]
        if any(p in ('Línea', 'Ref.') for _, p in palabras):
            inicio = indice
            break

    return filas[inicio:indice_datos], filas[inicio][1]


def columnas_por_las_horas(filas_datos, desde, hasta):
    """
    Dónde está cada columna, según dónde caen las horas.

    Los títulos del encabezado están partidos en dos o tres renglones y a veces
    corridos respecto de su columna; las horas, en cambio, están alineadas
    perfectamente porque son la tabla. Así que las columnas se deducen de las
    horas y los títulos se cuelgan después.
    """
    xs = sorted(
        x
        for _, palabras in filas_datos
        for x, p in palabras
        if HORA.match(p) and desde <= x < hasta
    )

    grupos = []
    for x in xs:
        if grupos and x - grupos[-1][-1] <= JUNTAR_TITULO:
            grupos[-1].append(x)
        else:
            grupos.append([x])

    # Una columna de verdad tiene varias horas; una suelta es un número perdido.
    return [sum(g) / len(g) for g in grupos if len(g) >= 2]


def titular(columnas, bloque, desde, hasta):
    """Le pone nombre a cada columna con las palabras del encabezado."""
    nombres = {indice: [] for indice in range(len(columnas))}

    for y, fila in bloque:
        for x, palabra in fila:
            if palabra in NO_ES_PUNTO or not (desde <= x < hasta):
                continue
            if not columnas:
                continue
            indice = min(range(len(columnas)), key=lambda i: abs(columnas[i] - x))
            if abs(columnas[indice] - x) <= 34:
                nombres[indice].append((y, x, palabra))

    return [
        (columnas[i], ' '.join(p for _, _, p in sorted(nombres[i])) or f'columna {i + 1}')
        for i in range(len(columnas))
    ]


def corte_entre_mitades(palabras):
    """
    Dónde termina la ida y empieza la vuelta.

    La segunda mitad arranca en su propia etiqueta ("Línea & Ref." o sólo
    "Ref."). Las palabras de una misma etiqueta están pegadas, así que se
    agrupan antes de contar: si queda una sola, la página trae una sola tabla.
    """
    xs = sorted(x for x, p in palabras if p in ('Línea', 'Ref.'))

    grupos = []
    for x in xs:
        if not grupos or x - grupos[-1] > 40:
            grupos.append(x)

    if len(grupos) < 2:
        return None
    return grupos[1] - 6


def servicios_de_pagina(pagina, titulo_pagina):
    filas = palabras_por_fila(pagina)
    indice_datos, _ = primera_fila_de_datos(filas)
    if indice_datos is None:
        return [], 'sin horas'

    bloque, fila_etiquetas = bloque_encabezado(filas, indice_datos)
    filas_datos = filas[indice_datos:]
    corte = corte_entre_mitades(fila_etiquetas)

    mitades = []
    limites = [('ida', 0, corte or 10_000)]
    if corte:
        limites.append(('vuelta', corte, 10_000))

    for sentido, desde, hasta in limites:
        columnas = columnas_por_las_horas(filas_datos, desde, hasta)
        if columnas:
            mitades.append((sentido, titular(columnas, bloque, desde, hasta), desde, hasta))

    servicios = []

    for y, palabras_fila in filas_datos:
        for sentido, columnas, desde, hasta in mitades:
            propias = [(x, p) for x, p in palabras_fila if desde <= x < hasta]
            horas = [(x, p) for x, p in propias if HORA.match(p)]
            if len(horas) < 2:
                continue

            # Lo que está antes de la primera columna es la línea y sus
            # referencias: "24", "7/24 D", "1 # D".
            etiqueta = [p for x, p in propias if x < columnas[0][0] - 14]
            linea = etiqueta[0] if etiqueta else None
            refs = [p for p in etiqueta[1:] if p in REFERENCIAS] if etiqueta else []

            pasos = []
            for x, hora in horas:
                columna = min(columnas, key=lambda c: abs(c[0] - x))
                if abs(columna[0] - x) > 20:
                    continue
                h, m = HORA.match(hora).groups()
                pasos.append({'punto': columna[1], 'hora': f'{int(h):02d}:{m}'})

            if len(pasos) < 2:
                continue

            servicios.append(
                {
                    'linea': linea,
                    'sentido': sentido,
                    'referencias': refs,
                    'pagina': titulo_pagina,
                    'pasos': pasos,
                }
            )

    puntos = ' / '.join(t[1] for t in mitades[0][1]) if mitades else '-'
    return servicios, puntos


def vigencia_de(texto):
    encontrado = re.search(r'Vigencia:\s*([^\n]+)', texto)
    return encontrado.group(1).strip() if encontrado else None


def main():
    ruta_pdf, salida = sys.argv[1], sys.argv[2]
    documento = fitz.open(ruta_pdf)

    todo = []
    vigencia = None

    for numero in range(documento.page_count):
        pagina = documento[numero]
        texto = pagina.get_text()
        vigencia = vigencia or vigencia_de(texto)

        primera_linea = texto.strip().split('\n')[0] if texto.strip() else f'página {numero + 1}'
        servicios, puntos = servicios_de_pagina(pagina, primera_linea)
        todo.extend(servicios)
        print(f'página {numero + 1}: {primera_linea[:40]:42} {len(servicios):4} servicios | {puntos[:70]}')

    datos = {
        'empresa': 'codesa',
        'fuente': 'https://www.codesa.com.uy/p/horarios.html',
        'documento': documento.metadata.get('title') or ruta_pdf.split('/')[-1],
        'vigencia': vigencia,
        'referencias': REFERENCIAS,
        'servicios': todo,
    }

    io.open(salida, 'w', encoding='utf-8').write(json.dumps(datos, ensure_ascii=False, indent=1))
    print(f'\n{len(todo)} servicios -> {salida}  (vigencia: {vigencia})')


if __name__ == '__main__':
    main()
