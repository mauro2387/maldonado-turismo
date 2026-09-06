# Horarios publicados por las empresas

Las tres empresas publican sus horarios. Este directorio es la herramienta para
pasarlos de lo que publican a algo que la app pueda usar, y la nota de qué es
cada fuente.

Hasta hoy la app **no** usa horarios: la espera sale de las posiciones en vivo
y, cuando no hay ninguna unidad en camino, de la frecuencia con la que la línea
está pasando (ver `TripPlannerService.headwayDeparture`). Eso alcanza cuando
hay ómnibus en la calle y no alcanza a la noche, temprano, ni para contestar "¿a
qué hora pasa el último?".

## Las fuentes

| Empresa | Dónde | Formato | Vigencia del documento de hoy |
|---|---|---|---|
| CODESA | [codesa.com.uy/p/horarios.html](https://www.codesa.com.uy/p/horarios.html) → enlace a Drive | PDF de 8 páginas, texto seleccionable | `Vigencia: Agosto 2026` |
| Maldonado Turismo | [maldonadoturismo.com/horarios](https://maldonadoturismo.com/horarios/) | **Tablas HTML** en la página + PDF `Horarios-invierno-2026-1.pdf` | "Última actualización 03/08/2026" |
| Micro | [microltda.com/horarios-maldonado](https://microltda.com/horarios-maldonado) | PDF de 4 páginas, texto seleccionable | `HORARIOS MICRO MAYO 2026` |

Los tres publican el mismo tipo de tabla: una fila por servicio y una columna
por **punto de control** (Terminal, Centro Mldo., Hospital, Punta Shopping, Ag.
San Carlos, La Barra...), no por parada. Eso es normal y es lo que hace GTFS con
`timepoint=0`: entre dos puntos de control el horario se interpola, y para eso
la app ya tiene lo que hace falta —el orden de paradas de cada recorrido con su
distancia acumulada, y la velocidad medida de cada línea—.

## Verano e invierno no se mezclan

CODESA lo dice en sus propias páginas de recorrido: **invierno de marzo a
diciembre, verano de diciembre a marzo**, y además la Intendencia cambia el
recorrido de la zona de José Ignacio del 1 de diciembre al 31 de enero. Los
documentos de arriba son todos de **invierno** (agosto, mayo, "invierno-2026").

Por eso cada horario importado tiene que llevar, sí o sí:

- `temporada`: `invierno` | `verano`
- `vigencia_desde` / `vigencia_hasta`
- la URL y la fecha del documento del que salió

y la app tiene que elegir **el que está vigente hoy**. Mostrar el horario de
verano en septiembre es peor que no mostrar ninguno: alguien se queda esperando
un ómnibus que en esta época no existe.

## La herramienta

```
python extraer_pdf.py <pdf> <salida.json>
```

Lee las palabras del PDF **con sus coordenadas** y reconstruye la tabla: las
columnas se deducen de dónde caen las horas —que están perfectamente
alineadas— y los títulos se cuelgan de esas columnas. El texto plano del PDF no
sirve: sale en un solo chorro y mezcla la mitad de la ida con la de la vuelta.

Estado por fuente:

- **CODESA página 1** (líneas 1, 7, 24 y 7/24): sale limpio, 138 servicios con
  sus siete puntos de control bien nombrados.
- **Resto de las páginas de CODESA y las de Micro**: salen los horarios, pero
  los **nombres** de algunas columnas quedan cortados o pegados ("Mldo. Mldo.",
  "tiales", "columna 4"). Las páginas son apaisadas y tienen el encabezado en
  tres renglones; hay que afinar por página.
- **Maldonado Turismo**: no necesita PDF, las tablas están en HTML en la propia
  página. Falta escribir ese extractor, que es el más simple de los tres.

## Lo que falta para que la app los use

1. Terminar la extracción y **revisarla** contra el papel, página por página.
   Un horario mal leído es peor que no tener horario.
2. Una tabla de traducción de punto de control → parada real, hecha a mano y
   verificada. Son unos veinte nombres ("Terminal", "Centro Mldo.", "Hospital",
   "Punta Shopping", "Ag. San Carlos"...), no mil.
3. La tabla `line_schedules` en la base, con temporada y vigencia.
4. En el planificador, reemplazar la espera por frecuencia por la próxima
   salida publicada, interpolando entre puntos de control con la distancia
   acumulada del recorrido.
5. En la ficha de la línea, mostrar el horario tal cual, citando el documento.
