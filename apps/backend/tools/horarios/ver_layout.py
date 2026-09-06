"""
Diagnóstico de layout: imprime las palabras de una página con su coordenada x,
agrupadas por renglón. Es la forma de ver dónde cae cada columna cuando el
encabezado sale cortado o pegado.

Uso:
    python ver_layout.py <pdf> <pagina 1..N>            # renglones con x
    python ver_layout.py <pdf> <pagina> --png [salida]  # renderiza a PNG

Correr con PYTHONIOENCODING=utf-8 en Windows por los acentos.
"""

import sys

import fitz

FILA_TOLERANCIA = 3


def por_fila(pagina):
    filas = {}
    for x0, y0, x1, y1, palabra, *_ in pagina.get_text('words'):
        clave = round((y0 + y1) / 2 / FILA_TOLERANCIA)
        filas.setdefault(clave, []).append((x0, y0, palabra))
    return [sorted(cols) for _, cols in sorted(filas.items())]


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return
    ruta = sys.argv[1]
    numero = int(sys.argv[2]) - 1
    documento = fitz.open(ruta)
    pagina = documento[numero]

    if '--png' in sys.argv:
        salida = sys.argv[sys.argv.index('--png') + 1] if len(sys.argv) > sys.argv.index('--png') + 1 else f'pagina_{numero + 1}.png'
        pagina.get_pixmap(dpi=120).save(salida)
        print(f'render -> {salida}  ({pagina.rect.width:.0f}x{pagina.rect.height:.0f} pt)')
        return

    print(f'# {ruta} pagina {numero + 1}  ({pagina.rect.width:.0f}x{pagina.rect.height:.0f} pt)\n')
    for cols in por_fila(pagina):
        y = cols[0][1]
        linea = '  '.join(f'{p}@{x:.0f}' for x, _, p in cols)
        print(f'y={y:6.1f} | {linea}')


if __name__ == '__main__':
    main()
