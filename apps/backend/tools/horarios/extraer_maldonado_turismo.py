"""
Los horarios publicados por Maldonado Turismo, del HTML a JSON.

Maldonado Turismo no necesita PDF: las tablas están en HTML en la propia página
(https://maldonadoturismo.com/horarios/), y se leen sin adivinar nada. Hay dos
formas de tabla:

  * **una sola mitad** — el primer renglón son los puntos de control y el
    sentido sale del título de la sección ("19 La Fortuna – Punta del Este").
  * **dos mitades pegadas** — un renglón de títulos ("17 Ida – Maldonado a
    Punta del Este" | "" | "17 Regreso – ..."), abajo los puntos de control de
    las dos mitades separados por una celda con un guión, y cada fila trae el
    servicio de ida y el de vuelta uno al lado del otro.

El corte entre las dos mitades es la celda del guión: no se deduce, está en el
HTML. Por eso acá no hay tolerancias ni coordenadas como en el extractor de PDF.

Lo único que se normaliza son las horas: la página mezcla "06.05", "07:20" y
"5.35", y todas salen como "06:05". Los nombres de los puntos de control se
dejan **exactamente** como los imprime la empresa, con sus mayúsculas y sus
abreviaturas ("Los guayabos" en la ida y "Los Guayabos" en la vuelta, tal cual).

Lo que no se puede leer no se rellena: va `null` en `horas` y el motivo queda
anotado en `revisar`.

Uso:
    python extraer_maldonado_turismo.py <salida.json> [html local]

Sin el HTML local se baja de la página. La copia que se usó para esta corrida
está en fuentes/maldonado-turismo-horarios-2026-09-03.html.
"""

import datetime
import html as html_mod
import io
import json
import re
import sys
import urllib.request

FUENTE_URL = 'https://maldonadoturismo.com/horarios/'
PDF_RESPALDO = 'https://maldonadoturismo.com/wp-content/uploads/2026/03/Horarios-invierno-2026-1.pdf'

# "06.05", "07:20", "5.35" y "00.10" son todas horas para esta página.
HORA = re.compile(r'^([0-2]?\d)[:.]([0-5]\d)$')

# La celda que separa la ida de la vuelta en las tablas de dos mitades.
SEPARADOR = {'–', '-', '—', ''}

# Las restricciones de día que Maldonado Turismo pone en el título de la
# sección y no al pie: "LINEA 51 LOCAL (Lunes a Viernes)". No son referencias
# impresas por la empresa -la página no tiene pie de referencias-, así que cada
# vez que se usan queda la anotación en `revisar`.
DIAS = [
    ('LV', re.compile(r'lunes\s+a\s+viernes', re.I), 'Lunes a Viernes'),
    ('SAB', re.compile(r's[áa]bados?', re.I), 'Sábados'),
]


def bajar(url):
    pedido = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    return urllib.request.urlopen(pedido, timeout=60).read().decode('utf-8', 'replace')


def sin_etiquetas(fragmento):
    limpio = re.sub(r'(?s)<[^>]+>', ' ', fragmento)
    return re.sub(r'\s+', ' ', html_mod.unescape(limpio)).strip()


def secciones(pagina):
    """
    Las tablas de la página, cada una con el título que la encabeza.

    Las tablas van en orden y cada una viene precedida por su <h2>; se recorre
    el HTML una sola vez y se va guardando el último título visto.
    """
    pagina = re.sub(r'(?is)<(script|style).*?</\1>', ' ', pagina)
    encontradas = []
    titulo = None

    for trozo in re.finditer(r'(?is)<table.*?</table>|<h[1-4][^>]*>.*?</h[1-4]>', pagina):
        texto = trozo.group(0)
        if texto[:6].lower() == '<table':
            filas = [
                [sin_etiquetas(c) for c in re.findall(r'(?is)<t[hd].*?</t[hd]>', f)]
                for f in re.findall(r'(?is)<tr.*?</tr>', texto)
            ]
            encontradas.append((titulo, [f for f in filas if f]))
        else:
            nuevo = sin_etiquetas(texto)
            if nuevo:
                titulo = nuevo

    return encontradas


def es_hora(celda):
    return bool(HORA.match(celda))


def normalizar(celda):
    h, m = HORA.match(celda).groups()
    return f'{int(h):02d}:{m}'


def primera_fila_de_datos(filas):
    """El primer renglón con dos horas: ahí empiezan los servicios."""
    for indice, fila in enumerate(filas):
        if sum(1 for c in fila if es_hora(c)) >= 2:
            return indice
    return None


def numero_de_linea(texto):
    """El número del cartel: "17/19 – Maldonado..." -> "17/19"."""
    for palabra in texto.replace('–', ' ').split():
        limpio = palabra.strip('.,:;()')
        if re.fullmatch(r'\d{1,3}(/\d{1,3})?', limpio):
            return limpio
    return None


def mitades_de(fila_puntos):
    """
    Dónde corta la tabla, según la celda del guión.

    Devuelve una lista de (desde, hasta) sobre los índices de celda. Sin guión,
    la tabla trae una sola mitad.
    """
    cortes = [i for i, c in enumerate(fila_puntos) if c in SEPARADOR]
    if not cortes:
        return [(0, len(fila_puntos))]

    tramos = []
    inicio = 0
    for corte in cortes + [len(fila_puntos)]:
        if corte > inicio:
            tramos.append((inicio, corte))
        inicio = corte + 1
    return tramos


def titulos_de_mitad(fila_titulos, cantidad):
    """Los títulos de cada mitad, salteando las celdas vacías que las separan."""
    if not fila_titulos:
        return [None] * cantidad
    llenos = [c for c in fila_titulos if c and c not in SEPARADOR]
    return (llenos + [None] * cantidad)[:cantidad]


def sentido_de(titulo, posicion, mitades, linea, vistas, revisar, donde):
    """
    ida o vuelta.

    Sale de la palabra que imprime la empresa ("Ida" / "Regreso"). Cuando el
    título no la trae se usa el orden en que la página los publica, que es el
    de siempre -primero la ida, después la vuelta-, y queda anotado:

      * en una tabla de dos mitades, la mitad izquierda es la ida (así está el
        17/19, con las dos mitades tituladas igual);
      * en tablas de una sola mitad, una por sentido, cuenta el orden entre las
        tablas de esa misma línea (la 19 de La Fortuna, publicada en dos
        tablas: "19 La Fortuna – Punta del Este" y la de vuelta).
    """
    if titulo:
        if re.search(r'\bregreso\b|\bvuelta\b', titulo, re.I):
            return 'vuelta'
        if re.search(r'\bida\b', titulo, re.I):
            return 'ida'

    orden = posicion if mitades > 1 else vistas.get(linea, 0)
    vistas[linea] = vistas.get(linea, 0) + 1
    supuesto = 'ida' if orden == 0 else 'vuelta'

    sin_titulo = titulo or 'sin título'
    revisar.append(
        f'{donde}: el título no dice ida ni regreso ("{sin_titulo}"); sentido '
        f'"{supuesto}" asignado por el orden en que la página los publica'
    )
    return supuesto


def dias_de(titulo, revisar, donde):
    """La restricción de día que viene en el título de la sección, si hay."""
    codigos = []
    for codigo, patron, descripcion in DIAS:
        if patron.search(titulo or ''):
            codigos.append((codigo, descripcion))
            revisar.append(
                f'{donde}: "{descripcion}" está en el título de la sección '
                f'("{titulo}"), no en un pie de referencias; se anota como "{codigo}"'
            )
    return codigos


def extraer(pagina):
    revisar = []
    referencias = {}
    lineas = []
    # Cuántas mitades sin "Ida"/"Regreso" se vieron ya de cada línea.
    vistas = {}

    for numero_tabla, (titulo, filas) in enumerate(secciones(pagina), 1):
        encabezado = (titulo or 'sin título')[:60]
        donde = f'tabla {numero_tabla} ("{encabezado}")'

        inicio = primera_fila_de_datos(filas)
        if not inicio:
            revisar.append(
                f'{donde}: sin renglón de puntos de control arriba de las horas; tabla salteada'
            )
            continue

        fila_puntos = filas[inicio - 1]
        fila_titulos = filas[inicio - 2] if inicio >= 2 else None
        # Un renglón de títulos tiene menos celdas que el de puntos de control.
        if fila_titulos and len(fila_titulos) >= len(fila_puntos):
            fila_titulos = None

        tramos = mitades_de(fila_puntos)
        titulos = titulos_de_mitad(fila_titulos, len(tramos))

        for posicion, (desde, hasta) in enumerate(tramos):
            propio = titulos[posicion] or titulo
            puntos = fila_puntos[desde:hasta]
            mitad = f'{donde} mitad {posicion + 1}'
            linea = numero_de_linea(propio or '') or numero_de_linea(titulo or '')

            if not linea:
                revisar.append(f'{mitad}: no se pudo leer el número de línea; mitad salteada')
                continue

            sentido = sentido_de(propio, posicion, len(tramos), linea, vistas, revisar, mitad)
            refs_fila = dias_de(titulo, revisar, mitad)
            for codigo, descripcion in refs_fila:
                referencias[codigo] = descripcion

            servicios = []
            for indice, fila in enumerate(filas[inicio:], inicio):
                celdas = fila[desde:hasta]
                if sum(1 for c in celdas if es_hora(c)) < 2:
                    continue

                if len(celdas) != len(puntos):
                    revisar.append(
                        f'{mitad} fila {indice}: {len(celdas)} celdas contra '
                        f'{len(puntos)} puntos de control; fila salteada'
                    )
                    continue

                horas = []
                for columna, celda in enumerate(celdas):
                    if es_hora(celda):
                        horas.append(normalizar(celda))
                        continue
                    horas.append(None)
                    if celda and celda not in SEPARADOR:
                        revisar.append(
                            f'{mitad} fila {indice} columna "{puntos[columna]}": '
                            f'"{celda}" no es una hora; va null'
                        )

                servicios.append({'referencias': [c for c, _ in refs_fila], 'horas': horas})

            if not servicios:
                revisar.append(f'{mitad}: sin servicios legibles')
                continue

            lineas.append(
                {
                    'linea': linea,
                    'sentido': sentido,
                    'puntos_control': puntos,
                    'servicios': servicios,
                }
            )

    return lineas, referencias, revisar


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return

    salida = sys.argv[1]
    pagina = (
        io.open(sys.argv[2], encoding='utf-8', errors='replace').read()
        if len(sys.argv) > 2
        else bajar(FUENTE_URL)
    )

    lineas, referencias, revisar = extraer(pagina)

    actualizacion = re.search(r'Última actualización[^)<]*', sin_etiquetas(pagina))
    vigencia = actualizacion.group(0).strip() if actualizacion else None

    # La página no dice la temporada; el PDF que ofrece para descargar se llama
    # "Horarios-invierno-2026-1.pdf", y de ahí sale "invierno".
    temporada = 'invierno' if 'invierno' in pagina.lower() else None
    if temporada:
        revisar.append(
            'la temporada no está escrita en la página; sale del nombre del PDF '
            f'que ofrece para descargar ({PDF_RESPALDO.rsplit("/", 1)[-1]})'
        )

    datos = {
        'empresa': 'maldonado-turismo',
        'temporada': temporada,
        'fuente_url': FUENTE_URL,
        'documento': 'maldonadoturismo.com/horarios/ (tablas HTML)',
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
            f'  linea {linea["linea"]:>5} {linea["sentido"]:6} '
            f'{len(linea["servicios"]):3} servicios | {puntos}'
        )
    total = sum(len(l['servicios']) for l in lineas)
    print(f'\n{len(lineas)} linea x sentido, {total} servicios -> {salida}')
    print(f'{len(revisar)} anotaciones en revisar' if revisar else 'revisar: limpio')


if __name__ == '__main__':
    main()
