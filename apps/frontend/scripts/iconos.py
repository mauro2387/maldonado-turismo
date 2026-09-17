"""
Los íconos de la app, dibujados y no descargados.

Se generan los PNG que pide el manifiesto (192, 512 y el "maskable" de 512
con aire alrededor) a partir de las mismas formas que `public/icono.svg`: un
ómnibus coral sobre tinta. No se usa la fuente del sistema de diseño porque
el ícono tiene que verse igual en cualquier máquina que corra esto, y una
letra depende de tener la fuente instalada; un ómnibus, no.

Correr desde apps/frontend:  python scripts/iconos.py
Necesita Pillow.
"""

from pathlib import Path

from PIL import Image, ImageDraw

TINTA = (11, 31, 51)  # ink-900
CORAL = (220, 66, 39)  # coral-500
ARENA = (250, 247, 242)  # sand-50, las ventanas

PUBLIC = Path(__file__).resolve().parent.parent / "public"


def dibujar(tamano: int, aire: float, esquinas: bool) -> Image.Image:
    """
    `aire` es la proporción de margen alrededor del ómnibus. El ícono
    "maskable" lo necesita: Android recorta un círculo o una gota, y sin
    margen las ruedas quedan afuera. Se dibuja a 4× y se reduce con
    antialias, que es lo que hace que los bordes no queden dentados.
    """
    escala = 4
    n = tamano * escala
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if esquinas:
        d.rounded_rectangle((0, 0, n - 1, n - 1), radius=int(n * 0.22), fill=TINTA)
    else:
        d.rectangle((0, 0, n - 1, n - 1), fill=TINTA)

    # El ómnibus ocupa el cuadro central que deja el aire.
    m = n * aire
    x0, y0, x1, y1 = m, m, n - m, n - m
    w = x1 - x0
    h = y1 - y0

    # Carrocería: un rectángulo redondeado, más ancho que alto.
    cx0, cy0 = x0 + w * 0.08, y0 + h * 0.22
    cx1, cy1 = x1 - w * 0.08, y1 - h * 0.28
    d.rounded_rectangle((cx0, cy0, cx1, cy1), radius=int(w * 0.10), fill=CORAL)

    # Ventanas: tres, en arena.
    vy0 = cy0 + (cy1 - cy0) * 0.16
    vy1 = cy0 + (cy1 - cy0) * 0.52
    ancho = (cx1 - cx0)
    for i in range(3):
        vx0 = cx0 + ancho * (0.09 + i * 0.29)
        vx1 = vx0 + ancho * 0.24
        d.rounded_rectangle((vx0, vy0, vx1, vy1), radius=int(w * 0.03), fill=ARENA)

    # Ruedas: dos círculos en tinta con un aro arena, que asoman por debajo.
    r = h * 0.11
    for fx in (0.27, 0.73):
        wx = cx0 + ancho * fx
        wy = cy1
        d.ellipse((wx - r, wy - r, wx + r, wy + r), fill=TINTA)
        d.ellipse((wx - r * 0.55, wy - r * 0.55, wx + r * 0.55, wy + r * 0.55), fill=ARENA)

    return img.resize((tamano, tamano), Image.LANCZOS)


def main() -> None:
    PUBLIC.mkdir(exist_ok=True)
    dibujar(192, 0.06, True).save(PUBLIC / "icono-192.png")
    dibujar(512, 0.06, True).save(PUBLIC / "icono-512.png")
    # Maskable: sin esquinas (el sistema recorta) y con el 20 % de aire que
    # pide la zona segura del formato.
    dibujar(512, 0.20, False).save(PUBLIC / "icono-maskable-512.png")
    dibujar(180, 0.06, True).save(PUBLIC / "apple-touch-icon.png")
    print("ok")


if __name__ == "__main__":
    main()
