"""
Los horarios publicados por Micro Ltda., del PDF a JSON.

Micro publica un PDF de cuatro páginas con varias tablas por página, cada una
con su título arriba ("Línea 62" y abajo "Maldonado – Capuera"). Las tablas
tienen los bordes dibujados, así que el recuadro de cada una sale del PDF y no
hay que adivinarlo: `find_tables()` da el rectángulo.

Lo que **no** se usa de `find_tables()` es el texto de las celdas: parte las
columnas de más y, peor, rompe las ligaduras -"Manantiales" sale
"Manantai les"-. Las palabras se leen aparte, con `get_text('words')`, que las
devuelve enteras y con su coordenada. Adentro del recuadro:

  * las **columnas** salen de dónde caen las horas, que son la tabla y están
    alineadas; el límite entre dos columnas es el punto medio entre ellas, así
    que cada palabra cae en una sola columna y ninguna queda sin dueño;
  * los **títulos** son los renglones de arriba de la primera hora, y se
    cuelgan de la columna en cuya banda cae el centro de cada palabra;
  * la columna **Ref.** no tiene horas: se detecta por el título y ahí van las
    referencias de cada servicio.

Micro escribe además anotaciones al lado de la hora ("*05:10 x Cap.",
"7:20 sigue faro", "16:55 Directo", "22:30 PP"). No están en el pie de
referencias, así que no se interpretan: la hora se separa de la anotación, la
anotación queda como referencia con su texto crudo y el caso entero se anota en
`revisar` para que lo mire un humano.

Uso:
    python extraer_micro.py <pdf> <salida.json>
"""

import datetime
import io
import json
import re
import sys

import fitz

FUENTE_URL = 'https://microltda.com/horarios-maldonado'

# El PDF adentro no trae ni fecha ni vigencia: la única fecha que publica Micro
# es el nombre del archivo que enlaza la página, y de ahí sale la vigencia.
DOCUMENTO_PUBLICADO = 'HORARIOS MICRO MAYO 2026.pdf'

# Una fila mide unos 15 puntos en este PDF; 4 alcanza para no pegar dos filas.
FILA_TOLERANCIA = 4

# "6:30", "05:10", "*05:10" — el asterisco viene pegado a la hora.
HORA = re.compile(r'^\*?\s*([0-2]?\d)[:.]([0-5]\d)$')

# El pie de la primera página: "SSYD = Solo Sábados y Domingos".
LEGENDA = re.compile(r'^([A-Z*]{1,6})\s*=\s*(.+)$')

# "Línea 62", "Línea 100 (Lunes a Viernes)".
TITULO_LINEA = re.compile(r'^Línea\s+(\d{1,3}(?:/\d{1,3})?)\s*(\(.*\))?\s*$')

# El título de la columna de referencias.
REF = re.compile(r'^Ref\.?$', re.I)

SIN_EXPLICAR = 'sin explicación en el documento'

# Las restricciones de día que Micro pone entre paréntesis en el título de la
# línea. El código es el mismo que usa el extractor de Maldonado Turismo, que
# tiene el mismo caso en "LINEA 51 LOCAL (Lunes a Viernes)".
DIAS = {'lunes a viernes': 'LV', 'sábados': 'SAB', 'sabados': 'SAB'}


def palabras_por_fila(pagina, rect):
    """Las palabras de adentro del recuadro, agrupadas por renglón."""
    filas = {}
    for x0, y0, x1, y1, palabra, *_ in pagina.get_text('words'):
        if not (rect.x0 - 1 <= (x0 + x1) / 2 <= rect.x1 + 1 and rect.y0 - 1 <= (y0 + y1) / 2 <= rect.y1 + 1):
            continue
        clave = round((y0 + y1) / 2 / FILA_TOLERANCIA)
        filas.setdefault(clave, []).append(((x0 + x1) / 2, palabra))
    return [sorted(cols) for _, cols in sorted(filas.items())]


def es_hora(palabra):
    return bool(HORA.match(palabra))


def normalizar(palabra):
    h, m = HORA.match(palabra).groups()
    return f'{int(h):02d}:{m}'


def columnas_por_las_horas(filas_datos):
    """
    Dónde está cada columna, según dónde caen las horas.

    Las horas de una misma columna caen casi en el mismo x; entre dos columnas
    hay decenas de puntos de diferencia. Se agrupa por saltos.
    """
    xs = sorted(x for fila in filas_datos for x, p in fila if es_hora(p))
    if not xs:
        return []

    grupos = [[xs[0]]]
    for x in xs[1:]:
        if x - grupos[-1][-1] <= 25:
            grupos[-1].append(x)
        else:
            grupos.append([x])

    return [sum(g) / len(g) for g in grupos if len(g) >= 2]


def bandas(centros, izquierda, derecha):
    """El límite entre dos columnas es el punto medio entre ellas."""
    bordes = [izquierda]
    for antes, despues in zip(centros, centros[1:]):
        bordes.append((antes + despues) / 2)
    bordes.append(derecha)
    return list(zip(bordes, bordes[1:]))


def en_banda(x, tramos):
    for indice, (desde, hasta) in enumerate(tramos):
        if desde <= x < hasta:
            return indice
    return None


def titular(filas_titulo, tramos):
    """El nombre de cada columna, con las palabras de los renglones de arriba."""
    nombres = [[] for _ in tramos]
    for fila in filas_titulo:
        for x, palabra in fila:
            indice = en_banda(x, tramos)
            if indice is not None:
                nombres[indice].append(palabra)
    return [' '.join(n) if n else None for n in nombres]


def tabla_de(pagina, rect, legenda, revisar, donde):
    """Los puntos de control y los servicios de una tabla."""
    filas = palabras_por_fila(pagina, rect)
    primera = next((i for i, f in enumerate(filas) if sum(1 for _, p in f if es_hora(p)) >= 2), None)
    if primera is None:
        return None, []

    filas_datos = filas[primera:]
    centros = columnas_por_las_horas(filas_datos)
    if not centros:
        return None, []

    # La columna "Ref." no tiene horas, así que no sale del paso anterior: se
    # engancha de su propio título, que Micro imprime a la derecha de todo.
    for fila in filas[:primera]:
        for x, palabra in fila:
            if REF.match(palabra) and x > centros[-1] + 20:
                centros.append(x)
                break

    tramos = bandas(centros, rect.x0 - 1, rect.x1 + 1)
    titulos = titular(filas[:primera], tramos)

    # La columna de referencias no tiene horas: es la que queda a la derecha y
    # se llama "Ref.". Sus palabras van a las referencias del servicio.
    columna_ref = None
    for indice, nombre in enumerate(titulos):
        if nombre and nombre.rstrip('.').lower() == 'ref':
            columna_ref = indice

    puntos = []
    for indice, nombre in enumerate(titulos):
        if indice == columna_ref:
            continue
        if not nombre:
            nombre = f'columna {indice + 1}'
            revisar.append(f'{donde}: la columna {indice + 1} quedó sin nombre en el encabezado')
        puntos.append((indice, nombre))

    servicios = []
    for numero, fila in enumerate(filas_datos):
        if sum(1 for _, p in fila if es_hora(p)) < 1:
            continue

        casillas = [[] for _ in tramos]
        for x, palabra in fila:
            indice = en_banda(x, tramos)
            if indice is not None:
                casillas[indice].append(palabra)

        horas, refs = [], []
        for indice, nombre in puntos:
            adentro = casillas[indice]
            reloj = [p for p in adentro if es_hora(p)]
            sobra = [p for p in adentro if not es_hora(p)]

            if len(reloj) > 1:
                revisar.append(
                    f'{donde} fila {numero + 1} columna "{nombre}": '
                    f'{len(reloj)} horas en la misma casilla ({" ".join(reloj)}); va null'
                )
                horas.append(None)
            else:
                if reloj and reloj[0].startswith('*'):
                    refs.append('*')
                horas.append(normalizar(reloj[0]) if reloj else None)

            # Al lado de la hora puede haber una referencia del pie ("* EC") o
            # una anotación que Micro no explica en ningún lado ("x Cap.",
            # "sigue faro"). Las del pie van sueltas, como las de la columna
            # Ref.; el resto queda junto y crudo, y se avisa.
            conocidas = [p for p in sobra if p in legenda]
            sueltas = [p for p in sobra if p not in legenda]
            refs.extend(conocidas)

            if sueltas:
                anotacion = ' '.join(sueltas)
                refs.append(anotacion)
                revisar.append(
                    f'{donde} fila {numero + 1} columna "{nombre}": Micro escribe '
                    f'"{anotacion}" al lado de la hora; queda como referencia cruda'
                )

        if columna_ref is not None:
            refs.extend(casillas[columna_ref])

        if sum(1 for h in horas if h) < 1:
            continue

        vistas = []
        for ref in refs:
            if ref not in vistas:
                vistas.append(ref)
        servicios.append({'referencias': vistas, 'horas': horas})

    return [n for _, n in puntos], servicios


def encabezados_de(pagina):
    """Los renglones sueltos de la página, con su y: los títulos de las tablas."""
    filas = {}
    for x0, y0, x1, y1, palabra, *_ in pagina.get_text('words'):
        medio = (y0 + y1) / 2
        clave = round(medio / FILA_TOLERANCIA)
        filas.setdefault(clave, (medio, []))[1].append((x0, palabra))

    return [
        (y, ' '.join(p for _, p in sorted(pares)))
        for _, (y, pares) in sorted(filas.items())
    ]


def titulo_de_tabla(renglones, tope):
    """
    De qué línea es la tabla: el "Línea N" más cercano por arriba, y el renglón
    que va entre ese título y la tabla, que es el sentido ("Maldonado – Capuera").
    """
    linea = paren = destino = None
    for y, texto in renglones:
        if y >= tope:
            break
        texto = texto.strip()
        encontrado = TITULO_LINEA.match(texto)
        if encontrado:
            linea, paren = encontrado.group(1), encontrado.group(2)
            destino = None
        elif linea and '–' in texto and len(texto) < 60:
            destino = texto
    return linea, paren, destino


def extraer(documento):
    revisar = []
    referencias = {}
    lineas = []
    vistas = {}

    texto_todo = '\n'.join(p.get_text() for p in documento)
    for renglon in texto_todo.split('\n'):
        encontrado = LEGENDA.match(renglon.strip())
        if encontrado:
            referencias.setdefault(encontrado.group(1), encontrado.group(2).strip())

    for numero in range(documento.page_count):
        pagina = documento[numero]
        renglones = encabezados_de(pagina)

        for orden, tabla in enumerate(pagina.find_tables().tables, 1):
            rect = fitz.Rect(tabla.bbox)
            donde = f'página {numero + 1} tabla {orden}'
            linea, paren, destino = titulo_de_tabla(renglones, rect.y0)

            puntos, servicios = tabla_de(pagina, rect, referencias, revisar, donde)
            if not servicios:
                continue

            if not linea:
                revisar.append(f'{donde}: no se encontró "Línea N" arriba de la tabla; tabla salteada')
                continue

            sentido = 'ida' if vistas.get(linea, 0) == 0 else 'vuelta'
            vistas[linea] = vistas.get(linea, 0) + 1

            refs_linea = []
            if paren:
                texto = paren.strip('()').strip()
                codigo = DIAS.get(texto.lower(), re.sub(r'[^A-Za-z]', '', texto).upper()[:3])
                referencias.setdefault(codigo, texto)
                refs_linea.append(codigo)
                revisar.append(
                    f'{donde}: "{paren.strip("()")}" está en el título de la línea, no en el '
                    f'pie de referencias; se anota como "{codigo}"'
                )

            for servicio in servicios:
                for ref in refs_linea:
                    if ref not in servicio['referencias']:
                        servicio['referencias'].append(ref)

            lineas.append(
                {
                    'linea': linea,
                    'sentido': sentido,
                    'puntos_control': puntos,
                    'servicios': servicios,
                    '_titulo': destino,
                }
            )

    # Las referencias que aparecen en una fila pero no están en el pie.
    usadas = {r for l in lineas for s in l['servicios'] for r in s['referencias']}
    for ref in sorted(usadas - set(referencias)):
        referencias[ref] = SIN_EXPLICAR
        revisar.append(f'referencia "{ref}": se usa en las tablas pero no está en el pie de la página 1')

    revisar.append(
        'Micro no escribe "ida" ni "regreso": el sentido sale del orden en que publica '
        'las tablas de cada línea (la primera es la ida) y el recorrido queda en '
        'puntos_control, que empieza en el origen del título'
    )
    for linea in lineas:
        if linea['_titulo']:
            revisar.append(
                f'línea {linea["linea"]} {linea["sentido"]}: el título de la tabla dice '
                f'"{linea["_titulo"]}"'
            )
        del linea['_titulo']

    return lineas, referencias, revisar


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return

    ruta, salida = sys.argv[1], sys.argv[2]
    documento = fitz.open(ruta)
    lineas, referencias, revisar = extraer(documento)

    vigencia = DOCUMENTO_PUBLICADO.rsplit('.', 1)[0]
    revisar.insert(
        0,
        f'el PDF no trae vigencia escrita: "{vigencia}" sale del nombre del archivo '
        f'que enlaza {FUENTE_URL} (la página en sí sólo dice "HORARIOS MALDONADO"), '
        'y de ese mes -mayo- sale la temporada invierno; el documento tampoco la dice',
    )

    datos = {
        'empresa': 'micro',
        'temporada': 'invierno',
        'fuente_url': FUENTE_URL,
        'documento': DOCUMENTO_PUBLICADO,
        'vigencia_texto': vigencia,
        'vigencia_desde': None,
        'vigencia_hasta': None,
        'extraido_el': datetime.date.today().isoformat(),
        'revisar': revisar,
        'referencias': referencias,
        'lineas': lineas,
    }

    io.open(salida, 'w', encoding='utf-8').write(json.dumps(datos, ensure_ascii=False, indent=1))

    for linea in lineas:
        puntos = ' / '.join(linea['puntos_control'])
        print(
            f'  linea {linea["linea"]:>4} {linea["sentido"]:6} '
            f'{len(linea["servicios"]):3} servicios | {puntos}'
        )
    total = sum(len(l['servicios']) for l in lineas)
    print(f'\n{len(lineas)} linea x sentido, {total} servicios -> {salida}')


if __name__ == '__main__':
    main()
