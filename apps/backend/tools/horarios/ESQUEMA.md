# El JSON normalizado de horarios — contrato

Este es el formato de salida de la extracción y la entrada del importador. **No
cambiar sin avisar en los dos lados**: la herramienta de `tools/horarios/` lo
escribe y `apps/backend/src/modules/transporte/` lo lee.

Un archivo por empresa y temporada. Nombre: `<empresa>-<temporada>.json`
(`codesa-invierno.json`, `maldonado-turismo-invierno.json`, `micro-invierno.json`).

```jsonc
{
  "empresa": "codesa",                       // codesa | maldonado-turismo | micro
  "temporada": "invierno",                   // invierno | verano | null (si el documento no lo dice)
  "fuente_url": "https://www.codesa.com.uy/p/horarios.html",
  "documento": "Horarios_CODESA_24_06_26",   // título o nombre de archivo del PDF/página
  "vigencia_texto": "Vigencia: Agosto 2026", // el texto tal cual, sin interpretar
  "vigencia_desde": null,                    // ISO date o null — NO inventar. Lo completa un humano.
  "vigencia_hasta": null,                     // ISO date o null
  "extraido_el": "2026-09-03",               // fecha de la corrida
  "revisar": ["página 6 columna 4 sin nombre"], // lista de dudas para revisión humana; [] si está limpio

  "referencias": {                           // el pie de página, tal cual lo publica la empresa
    "S": "No corre sábados ni domingos",
    "D": "No corre domingos"
  },

  "lineas": [
    {
      "linea": "24",                         // número del CARTEL ("17/19", no "179"; "24", no "L24")
      "sentido": "ida",                      // ida | vuelta | circular
      "puntos_control": [                    // en el orden del recorrido, de origen a destino
        "Vialidad", "Ag. San Carlos", "Centro Mldo.", "Terminal Mldo.", "Punta Shopping", "P. del Este"
      ],
      "servicios": [
        {
          "referencias": ["D"],              // las que trae ESA fila; [] si ninguna
          "horas": ["05:00", "05:10", "05:35", "05:40", null, "06:00"]
          //         ↑ alineado 1:1 con puntos_control. null = ese servicio no pasa por ese punto.
        }
      ]
    }
  ]
}
```

## Reglas que no se negocian

1. **`horas` va alineado con `puntos_control`, misma longitud, mismo orden.**
   Donde un servicio salta un punto de control, va `null`, no se corre la lista.
   Esto es lo que permite después interpolar entre dos puntos con hora.

2. **Horas en `HH:MM` 24 h, cero a la izquierda.** `05:00`, no `5.00`.

3. **`linea` es el número del cartel.** Los refuerzos que el feed publica
   pegados ("179" = 17/19, "912" = 9/12, "247" = 7/24) van con la barra. Si el
   PDF ya trae la barra ("7/24"), se deja.

4. **Nada de inventar.** Si un nombre de columna sale cortado o pegado
   ("tiales", "Mldo. Mldo.", "columna 4"), NO adivinar: dejar el nombre crudo y
   anotarlo en `revisar`. Un horario con un punto de control mal nombrado es
   inservible; es mejor marcarlo que taparlo.

5. **`vigencia_desde/hasta` NO se calculan.** El documento casi nunca los dice
   con fecha exacta. Se deja `null` y se copia el texto en `vigencia_texto`. La
   regla estacional (invierno mar–dic / verano dic–mar) la aplica un humano al
   confirmar, no la extracción.

6. **`temporada`** sale sólo de lo que diga el documento ("invierno" en el
   nombre del archivo, o el texto de vigencia). Si no lo dice, `null`.

## Puntos de control: los nombres se dejan tal cual

La extracción NO traduce "Terminal Mldo." a una parada de la base. Eso lo hace
el importador con una tabla hecha a mano (`punto-control-a-parada.ts`, del lado
de la app). La extracción sólo tiene que sacar el nombre **exactamente** como lo
imprime la empresa, porque esa tabla se arma contra esos nombres.
