"""
Los horarios publicados por CODESA, del PDF a JSON.

CODESA publica un PDF de ocho páginas -"Vigencia: Agosto 2026"- con uno o dos
bloques de línea por página. Cada bloque tiene su título ("Línea 5",
"Líneas 15 y 55") y abajo una o dos tablas, anunciadas por una barra azul que
dice hacia dónde van:

    → IDA  >>> MALDONADO / P.DEL ESTE / LA BARRA
    ← VUELTA  >>> BALNEARIO BS. AS. / LA BARRA / MALDONADO
    LINEA CIRCULAR  >>> HIPÓDROMO / CENTRO / TERMINAL / HOSPITAL

De esa barra sale el sentido, incluida la circular de la L48, que no tiene ida
ni vuelta. Las dos mitades de una página se separan por la etiqueta con la que
empieza cada tabla ("Línea & Ref. ↓" o sólo "Ref. ↓"): ahí arranca cada mitad.

Adentro de cada mitad las columnas salen de dónde caen **las horas y los
guiones**. El guión es parte del dato: CODESA escribe "-" cuando ese servicio
no pasa por ese punto de control, y es justo el `null` del esquema. Hay
columnas enteras de guiones -en la página 3 "Centro Mldo." no la usa ningún
servicio-, así que si las columnas salieran sólo de las horas esa columna
desaparecería y los nombres se correrían todos.

Una tabla puede traer servicios de varias líneas mezclados: la primera celda de
cada fila dice de qué línea es ("15", "55", "L49", "L50"), y las filas se
agrupan por ese número. Cuando la tabla no tiene esa columna -sólo "Ref. ↓"-,
la línea es la del título del bloque.

Lo que no se puede leer no se rellena. Un encabezado partido en dos renglones
se junta; si queda con pinta de palabra cortada ("Manantial es") se deja crudo
y se anota en `revisar`, igual que las referencias que CODESA usa en una fila
pero no explica al pie.

Uso:
    python extraer_codesa.py <pdf> <salida.json>

El PDF se baja de la sección Horarios de www.codesa.com.uy (un enlace a Drive).
"""

import datetime
import io
import json
import re
import sys

import fitz

FUENTE_URL = 'https://www.codesa.com.uy/p/horarios.html'

# Una fila de la tabla mide unos 13 puntos: 3 alcanza para no pegar dos filas.
FILA_TOLERANCIA = 3

HORA = re.compile(r'^([0-2]?\d)[:.]([0-5]\d)$')

# El guión con el que CODESA marca que el servicio no pasa por ese punto.
GUION = {'-', '–', '—'}

# La barra azul que anuncia cada tabla.
SENTIDOS = {'IDA': 'ida', 'VUELTA': 'vuelta', 'CIRCULAR': 'circular'}

# Con qué empieza cada mitad de la página.
ETIQUETAS = {'Línea', 'Ref.'}

# Cuánto antes de esa etiqueta empieza la mitad: el número de línea de una
# cifra queda a la izquierda de la palabra "Línea" del encabezado.
MARGEN_ETIQUETA = 20

# Palabras del encabezado que no son un punto de control.
NO_ES_PUNTO = {'Línea', 'Ref.', '↓', '&'}

# El pie de cada página: "(S) No corre los días Sábados y Domingos."
LEGENDA = re.compile(r'^\(([^)]{1,3})\)\s*(.+?)\s*$', re.M)

# "Línea 5", "Líneas 15 y 55", "Línea L48", "PROXIMAMENTE - Línea 11".
TITULO = re.compile(r'Líneas?\s+(.+)$')

# El renglón entero es el título del bloque y nada más. Sin puntos ni "&", que
# es lo que distingue el título del encabezado "Línea & Ref. ↓ Ag. Mldo. ...".
SOLO_TITULO = re.compile(r'^(PROXIMAMENTE\s*[-–]\s*)?Líneas?\s+[\w/,\s]+$')
NUMERO = re.compile(r'^[A-Z]{0,2}\d{1,3}(/\d{1,3})?$|^[A-Z]$')

# Partículas que sí pueden ir sueltas en el nombre de un punto de control.
PARTICULAS = {'de', 'del', 'la', 'las', 'el', 'los', 'y', 'a', '5', '16', '75', '34', '26', '38'}

SIN_EXPLICAR = 'sin explicación en el documento'


def palabras_por_fila(pagina):
    """Las palabras de la página agrupadas por renglón, con su x del medio."""
    filas = {}
    for x0, y0, x1, y1, palabra, *_ in pagina.get_text('words'):
        # La flecha de "Línea & Ref. ↓" a veces viene pegada a la palabra de
        # al lado ("↓San"); no es parte de ningún nombre.
        palabra = palabra.replace('↓', '').strip()
        if not palabra:
            continue
        medio = (y0 + y1) / 2
        clave = round(medio / FILA_TOLERANCIA)
        filas.setdefault(clave, (medio, []))[1].append(((x0 + x1) / 2, palabra))
    return [(y, sorted(cols)) for _, (y, cols) in sorted(filas.items())]


def es_adorno(palabras):
    """
    Si el renglón es parte de la barra de sentido, del logo o del subtítulo.

    La barra azul no siempre cae en un solo renglón: el "→ IDA" y el
    ">>> SAN CARLOS / PUNTA DEL ESTE" quedan a dos alturas distintas, y el
    segundo caería entre los títulos de las columnas.
    """
    texto = [p for _, p in palabras]
    for palabra in texto:
        if palabra.strip('→←').upper() in SENTIDOS or palabra.upper() == 'CODESA':
            return True
        if palabra and set(palabra) <= {'>', '<'}:
            return True

    # El título del bloque ("Línea D", "Líneas 15 y 55") contra el encabezado
    # de la tabla, que empieza igual ("Línea & Ref. ↓ Ag. Mldo. Centro ...")
    # pero sigue con el "&" y los nombres de las columnas. El título es el
    # renglón entero, así que se pide que coincida completo.
    return bool(SOLO_TITULO.match(' '.join(texto)))


def es_hora(palabra):
    return bool(HORA.match(palabra))


def es_dato(palabra):
    return es_hora(palabra) or palabra in GUION


def normalizar(palabra):
    h, m = HORA.match(palabra).groups()
    return f'{int(h):02d}:{m}'


def agrupar(xs, salto):
    grupos = [[xs[0]]]
    for x in xs[1:]:
        if x - grupos[-1][-1] <= salto:
            grupos[-1].append(x)
        else:
            grupos.append([x])
    return grupos


def barras(filas):
    """
    Dónde empieza cada tabla y hacia dónde va.

    Devuelve [(y, [(x, sentido), ...])]: un renglón por barra azul, con las una
    o dos tablas que anuncia.
    """
    encontradas = []
    for y, palabras in filas:
        marcas = [(x, SENTIDOS[p.upper()]) for x, p in palabras if p.upper() in SENTIDOS]
        if marcas:
            encontradas.append((y, marcas))
    return encontradas


def mitades(filas_encabezado):
    """
    Dónde empieza cada mitad, según la etiqueta con la que arranca cada tabla.

    "Línea & Ref. ↓" o sólo "Ref. ↓": las palabras de una misma etiqueta están
    pegadas, así que se agrupan antes de contar.
    """
    xs = sorted(x for _, palabras in filas_encabezado for x, p in palabras if p in ETIQUETAS)
    if not xs:
        return []
    return [g[0] for g in agrupar(xs, 40)]


def juntar(fragmentos):
    """
    El nombre de un punto de control, con sus pedazos de cada renglón.

    CODESA parte los títulos angostos en dos o tres renglones, a veces con
    guión ("Manan-" / "tiales") y a veces sin nada ("Manantial" / "es"). El
    guión se junta sin espacio porque es inequívoco; el resto va con espacio,
    tal cual está impreso.
    """
    nombre = ''
    for pedazo in fragmentos:
        if nombre.endswith('-'):
            nombre = nombre[:-1] + pedazo
        elif nombre:
            nombre += ' ' + pedazo
        else:
            nombre = pedazo
    return nombre


def sospechoso(nombre):
    """Un nombre con pinta de palabra cortada: "Manantial es"."""
    return any(
        p.islower() and len(p) <= 3 and p not in PARTICULAS
        for p in nombre.split()
    )


def columnas_y_bandas(filas_datos, desde, hasta, tope):
    """
    Dónde cae cada columna, según las horas y los guiones.

    El guión cuenta igual que la hora: hay columnas que son todas guiones -en
    la página 3 "Centro Mldo." no la usa ningún servicio- y si no se contaran,
    los nombres del encabezado se correrían una columna.

    Los únicos guiones que no son una columna son los de la celda de línea y
    referencias, que va antes de la primera hora: CODESA escribe "-" cuando esa
    fila no lleva ninguna referencia. Por eso las horas mandan y los guiones
    sólo cuentan de la primera hora en adelante.
    """
    horas = sorted(
        x
        for _, palabras in filas_datos
        for x, p in palabras
        if es_hora(p) and desde <= x < hasta
    )
    if not horas:
        return [], []

    borde = horas[0] - 8
    xs = sorted(
        x
        for _, palabras in filas_datos
        for x, p in palabras
        if es_dato(p) and borde <= x < hasta
    )

    centros = [sum(g) / len(g) for g in agrupar(xs, 12) if len(g) >= 2]
    if len(centros) < 2:
        return [], []

    # A la izquierda de la primera columna está la celda de línea y referencias.
    izquierda = centros[0] - (centros[1] - centros[0]) / 2
    bordes = [izquierda]
    for antes, despues in zip(centros, centros[1:]):
        bordes.append((antes + despues) / 2)

    # La última columna es tan ancha a la derecha como a la izquierda. Los
    # títulos van centrados y sobresalen un poco: el "del" de "P. del Este"
    # cae más a la derecha que la hora más ancha de esa columna.
    bordes.append(min(tope, centros[-1] + (centros[-1] - bordes[-1])))
    return centros, list(zip(bordes, bordes[1:]))


def en_banda(x, tramos):
    for indice, (desde, hasta) in enumerate(tramos):
        if desde <= x < hasta:
            return indice
    return None


def titular(filas_encabezado, tramos):
    """El nombre de cada columna, con las palabras de los renglones de arriba."""
    piezas = [[] for _ in tramos]
    for y, palabras in filas_encabezado:
        for x, palabra in palabras:
            if palabra in NO_ES_PUNTO:
                continue
            indice = en_banda(x, tramos)
            if indice is not None:
                piezas[indice].append((y, x, palabra))

    return [juntar([p for _, _, p in sorted(trozos)]) for trozos in piezas]


def tabla_de(filas_encabezado, filas_datos, desde, hasta, tope, linea_titulo, legenda, revisar, donde):
    """Los puntos de control y los servicios de una mitad de la página."""
    centros, tramos = columnas_y_bandas(filas_datos, desde, hasta, tope)
    if not tramos:
        return {}

    nombres = titular(filas_encabezado, tramos)
    izquierda = tramos[0][0]

    # "Línea & Ref. ↓" contra "Ref. ↓": con la palabra "Línea" en el
    # encabezado, cada fila trae su propio número; sin ella, la línea es la
    # del título del bloque.
    columna_de_linea = any(
        p == 'Línea' and desde <= x < hasta
        for _, palabras in filas_encabezado
        for x, p in palabras
    )

    puntos = []
    for indice, nombre in enumerate(nombres):
        if not nombre:
            nombre = f'columna {indice + 1}'
            revisar.append(f'{donde}: la columna {indice + 1} quedó sin nombre en el encabezado')
        elif sospechoso(nombre):
            revisar.append(
                f'{donde}: el punto de control "{nombre}" quedó con pinta de palabra '
                'cortada entre dos renglones; se deja como salió del PDF'
            )
        puntos.append(nombre)

    por_linea = {}

    for y, palabras in filas_datos:
        propias = [(x, p) for x, p in palabras if desde <= x < hasta]
        if sum(1 for x, p in propias if es_dato(p)) < 2:
            continue

        horas = [None] * len(puntos)
        hay = False
        for x, palabra in propias:
            if not es_dato(palabra):
                continue
            indice = en_banda(x, tramos)
            if indice is None:
                continue
            if es_hora(palabra):
                horas[indice] = normalizar(palabra)
                hay = True

        # Una fila entera de guiones es un renglón de relleno, no un servicio.
        if not hay:
            continue

        # A la izquierda de la primera columna: la línea y sus referencias.
        # Que la fila traiga su propio número lo dice el encabezado: "Línea &
        # Ref. ↓" tiene columna de línea y "Ref. ↓" a secas no.
        etiqueta = [p for x, p in propias if x < izquierda]
        linea = linea_titulo
        refs = []

        if columna_de_linea and etiqueta:
            linea, resto = etiqueta[0], etiqueta[1:]
        else:
            resto = etiqueta

        if linea and not NUMERO.match(str(linea)):
            revisar.append(
                f'{donde}: "{linea}" está donde va el número de línea y no parece uno; '
                'se deja crudo'
            )

        for pieza in resto:
            if pieza in GUION:
                continue
            refs.append(pieza)
            if pieza not in legenda:
                revisar.append(
                    f'{donde}: la fila de la línea {linea} trae "{pieza}" junto al número '
                    'de línea y no está en el pie de referencias; queda como referencia cruda'
                )

        if not linea:
            revisar.append(f'{donde}: una fila quedó sin número de línea; se saltea')
            continue

        por_linea.setdefault(linea, []).append({'referencias': refs, 'horas': horas})

    return {linea: (puntos, servicios) for linea, servicios in por_linea.items()}


def lineas_del_titulo(filas, tope):
    """
    Los números que anuncia el título del bloque: "Líneas 15 y 55" -> 15, 55.

    Cuando el bloque anuncia una sola línea, esa es la de todas sus filas.
    Cuando anuncia varias, cada fila trae la suya en la primera celda.
    """
    ultimo = None
    for y, palabras in filas:
        if y >= tope:
            break
        texto = ' '.join(p for _, p in palabras)
        encontrado = TITULO.search(texto)
        if encontrado:
            ultimo = [
                t for t in re.split(r'[\s,]+|\by\b', encontrado.group(1))
                if t and NUMERO.match(t)
            ]
    return ultimo or []


def pie_de_referencias(documento, revisar):
    """
    Las referencias que CODESA explica al pie, juntando las ocho páginas.

    El pie es **por página** y el mismo código no siempre quiere decir lo
    mismo: "(#)" es la ruta vieja de San Carlos en la página 1, "pasa a ser
    línea 9/12" en la 3 y los balnearios de la Ruta 10 en la 5. El esquema
    tiene una sola tabla de referencias por archivo, así que cuando un código
    tiene más de una acepción se guardan todas, cada una con las páginas donde
    vale, y se avisa: separarlas por línea es trabajo de un humano.
    """
    acepciones = {}
    for numero in range(documento.page_count):
        for m in LEGENDA.finditer(documento[numero].get_text()):
            codigo, texto = m.group(1), m.group(2).strip()
            acepciones.setdefault(codigo, {}).setdefault(texto, []).append(numero + 1)

    legenda = {}
    for codigo, textos in sorted(acepciones.items()):
        if len(textos) == 1:
            legenda[codigo] = next(iter(textos))
            continue
        legenda[codigo] = ' | '.join(
            f'páginas {", ".join(str(p) for p in paginas)}: {texto}'
            for texto, paginas in textos.items()
        )
        revisar.append(
            f'la referencia "{codigo}" quiere decir {len(textos)} cosas distintas según la '
            'página; el esquema tiene una sola tabla de referencias por archivo, así que '
            'quedan todas juntas y hay que separarlas por línea a mano'
        )
    return legenda


def extraer(documento):
    revisar = []
    resultado = []

    # El pie se lee primero: si no, cada "S" y cada "D" de las tablas quedaría
    # anotado como referencia sin explicar.
    legenda = pie_de_referencias(documento, revisar)

    for numero in range(documento.page_count):
        pagina = documento[numero]
        etiqueta_pagina = f'página {numero + 1}'
        filas = palabras_por_fila(pagina)
        marcas = barras(filas)
        for orden, (y_barra, tablas) in enumerate(marcas):
            fin = marcas[orden + 1][0] if orden + 1 < len(marcas) else 10_000
            bloque = [(y, p) for y, p in filas if y_barra < y < fin]

            primera = next(
                (i for i, (_, p) in enumerate(bloque) if sum(1 for _, w in p if es_dato(w)) >= 2),
                None,
            )
            if primera is None:
                continue

            # Entre la barra de sentido y los títulos de las columnas caen
            # restos de la propia barra (">>> SAN CARLOS / PUNTA DEL ESTE"),
            # el logo y el subtítulo del bloque de abajo. Nada de eso es un
            # punto de control.
            encabezado = [(y, p) for y, p in bloque[:primera] if not es_adorno(p)]
            datos = bloque[primera:]
            arranques = mitades(encabezado)
            if not arranques:
                revisar.append(f'{etiqueta_pagina}: una tabla no tiene "Línea & Ref."; se saltea')
                continue

            del_titulo = lineas_del_titulo(filas, y_barra)
            # Si el bloque anuncia una sola línea, no hay columna de línea y
            # todas las filas son de esa; si anuncia varias, cada fila trae la suya.
            linea_titulo = del_titulo[0] if len(del_titulo) == 1 else None

            # La etiqueta marca el borde izquierdo de cada mitad, no su centro:
            # cada mitad va desde un poco antes de su etiqueta hasta un poco
            # antes de la siguiente. El margen es para que entre el número de
            # línea de una cifra ("1", "7"), que queda a la izquierda de la
            # palabra "Línea" del encabezado.
            bordes = [0.0] + [x - MARGEN_ETIQUETA for x in arranques[1:]] + [10_000.0]

            for indice, arranque in enumerate(arranques):
                desde, hasta = bordes[indice], bordes[indice + 1]

                sentido = None
                for x, cual in tablas:
                    if desde <= x < hasta:
                        sentido = cual
                if not sentido:
                    sentido = tablas[min(indice, len(tablas) - 1)][1]
                    revisar.append(
                        f'{etiqueta_pagina}: no se encontró la barra de sentido de una tabla; '
                        f'se usa "{sentido}"'
                    )

                donde = f'{etiqueta_pagina} {sentido}'
                # Hasta dónde puede llegar el título de la última columna:
                # más allá está la etiqueta de la mitad siguiente.
                tope = arranques[indice + 1] - 8 if indice + 1 < len(arranques) else 10_000.0

                for linea, (puntos, servicios) in tabla_de(
                    encabezado, datos, desde, hasta, tope, linea_titulo, legenda, revisar, donde
                ).items():
                    resultado.append(
                        {
                            'linea': linea,
                            'sentido': sentido,
                            'puntos_control': puntos,
                            'servicios': servicios,
                        }
                    )

    usadas = {r for l in resultado for s in l['servicios'] for r in s['referencias']}
    for ref in sorted(usadas - set(legenda)):
        legenda[ref] = SIN_EXPLICAR

    return resultado, legenda, revisar


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return

    ruta, salida = sys.argv[1], sys.argv[2]
    documento = fitz.open(ruta)
    lineas, referencias, revisar = extraer(documento)

    texto = '\n'.join(p.get_text() for p in documento)
    vigencia = re.search(r'Vigencia:\s*([^\n]+)', texto)

    # El documento dice el mes, no la temporada. Agosto cae en el invierno que
    # la propia CODESA define en sus páginas de recorrido (marzo a diciembre),
    # pero eso es una deducción, no algo escrito en el PDF.
    revisar.insert(
        0,
        'la temporada no está escrita en el documento: dice '
        f'"{vigencia.group(1).strip() if vigencia else "sin vigencia"}" y de ese mes se '
        'deduce invierno (CODESA publica invierno de marzo a diciembre)',
    )

    if 'PROXIMAMENTE' in texto:
        revisar.append(
            'la página 4 (línea 11) está publicada como "PROXIMAMENTE": el horario está '
            'impreso pero la línea todavía no corre'
        )

    datos = {
        'empresa': 'codesa',
        'temporada': 'invierno',
        'fuente_url': FUENTE_URL,
        'documento': documento.metadata.get('title') or ruta.replace('\\', '/').split('/')[-1],
        'vigencia_texto': f'Vigencia: {vigencia.group(1).strip()}' if vigencia else None,
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
            f'  linea {linea["linea"]:>7} {linea["sentido"]:8} '
            f'{len(linea["servicios"]):4} servicios | {puntos[:88]}'
        )
    total = sum(len(l['servicios']) for l in lineas)
    print(f'\n{len(lineas)} linea x sentido, {total} servicios -> {salida}')


if __name__ == '__main__':
    main()
