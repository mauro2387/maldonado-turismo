import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ExternalLink, Ticket } from 'lucide-react';
import {
  NOMBRE_DE_TRAMO,
  TARIFAS,
  ZONAS_CODESA,
  ZonaCodesa,
  pesos,
  tramoCodesa,
} from '@lib/tarifas';

/**
 * Cuánto sale el boleto.
 *
 * Es la tabla oficial de la Intendencia, tal cual, con su resolución y su
 * fecha de vigencia arriba de todo: la app no estima precios, los cita. Ver
 * `lib/tarifas.ts` para de dónde sale cada número.
 *
 * Abajo está la única forma publicada de saber **qué tramo** es un viaje: la
 * tabla de cierres de CODESA, de zona a zona. Las otras dos empresas no
 * publican la suya, y eso se dice en vez de aplicarles la de CODESA como si
 * fuera de todos.
 */

function vigencia(): string {
  return new Date(`${TARIFAS.vigenteDesde}T00:00:00`).toLocaleDateString('es-UY', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function TarifasPage() {
  const [desde, setDesde] = useState<ZonaCodesa | ''>('');
  const [hasta, setHasta] = useState<ZonaCodesa | ''>('');

  const tramo = desde && hasta ? tramoCodesa(desde, hasta) : null;

  return (
    <div className="min-h-[calc(100dvh-4.25rem)] bg-sand-100 pb-8">
      <header className="bg-ink-900 px-4 pb-4 pt-4 text-white">
        <Link
          to="/moverse"
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
          Moverse
        </Link>

        <h1 className="text-display">Cuánto sale el boleto</h1>
        <p className="mt-0.5 text-data text-ink-300">
          La tarifa la fija la Intendencia para las tres empresas. Vigente desde el {vigencia()}.
        </p>
      </header>

      <div className="mx-auto max-w-2xl px-4 pt-4">
        {/* ---------- Boletos ---------- */}
        <section aria-labelledby="boletos">
          <h2 id="boletos" className="section-label">
            Boletos
          </h2>
          {/* Cinco columnas no entran en un teléfono: la tabla se desliza de
              costado, con la primera columna fija, igual que los horarios. */}
          <div className="card mt-2.5 overflow-x-auto p-0">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-sand-200 text-left text-xs text-ink-400">
                  <th className="sticky left-0 bg-white px-3.5 py-2.5 font-bold">Tramo</th>
                  <th className="px-2 py-2.5 text-right font-bold">Común</th>
                  <th className="whitespace-nowrap px-2 py-2.5 text-right font-bold">Combinación</th>
                  <th className="whitespace-nowrap px-2 py-2.5 text-right font-bold">Jubilados A</th>
                  <th className="whitespace-nowrap px-3.5 py-2.5 text-right font-bold">Jubilados B</th>
                </tr>
              </thead>
              <tbody>
                {NOMBRE_DE_TRAMO.map((nombre, i) => (
                  <tr key={nombre} className="border-b border-sand-200 last:border-0">
                    <td className="sticky left-0 whitespace-nowrap bg-white px-3.5 py-2.5 font-bold text-ink-900">
                      {nombre}
                    </td>
                    <td className="tabular whitespace-nowrap px-2 py-2.5 text-right font-extrabold text-ink-900">
                      {pesos(TARIFAS.comunes[i])}
                    </td>
                    <td className="tabular whitespace-nowrap px-2 py-2.5 text-right text-ink-600">
                      {TARIFAS.combinaciones[i] === null ? '—' : pesos(TARIFAS.combinaciones[i]!)}
                    </td>
                    <td className="tabular whitespace-nowrap px-2 py-2.5 text-right text-ink-600">
                      {pesos(TARIFAS.jubiladosA[i])}
                    </td>
                    <td className="tabular whitespace-nowrap px-3.5 py-2.5 text-right text-ink-600">
                      {pesos(TARIFAS.jubiladosB[i])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 px-1 text-xs text-ink-400">
            Jubilados A: ingresos hasta 3 BPC. Jubilados B: entre 3 y 4 BPC. La combinación es
            un boleto para llegar usando hasta dos ómnibus de cualquier empresa; vale{' '}
            {TARIFAS.combinacionHoras[1]} hora en tramo 1, {TARIFAS.combinacionHoras[2]} en tramo
            2 y {TARIFAS.combinacionHoras[3]} en tramos 3 y 4, y no sirve para volver.
          </p>
        </section>

        {/* ---------- Abonos ---------- */}
        <section className="mt-6" aria-labelledby="abonos">
          <h2 id="abonos" className="section-label">
            Abonos
          </h2>
          <div className="card mt-2.5 text-data text-ink-600">
            <p>
              <span className="font-bold text-ink-900">
                Común: {TARIFAS.abonos.comunesDescuento}% de descuento
              </span>{' '}
              sobre el boleto, por resolución de la Intendencia. Se carga de a 30, 40, 50 o 60
              viajes.
            </p>
            <p className="mt-2">
              <span className="font-bold text-ink-900">
                Estudiantil: {TARIFAS.abonos.estudiantesDescuento}% de descuento
              </span>
              , con certificado de estudio; se expide {TARIFAS.abonos.estudiantilMeses}.
            </p>
            <p className="mt-2">
              La tarjeta cuesta {pesos(TARIFAS.abonos.tarjeta)} la primera vez. Se venden y
              recargan {TARIFAS.abonos.venta}, en las agencias de cada empresa.
            </p>
          </div>
        </section>

        {/* ---------- Qué tramo es mi viaje (CODESA) ---------- */}
        <section className="mt-6" aria-labelledby="tramo">
          <h2 id="tramo" className="section-label">
            ¿Qué tramo es mi viaje?
          </h2>
          <div className="card mt-2.5">
            <p className="text-data text-ink-600">
              Según los cierres que publica <span className="font-bold text-ink-900">CODESA</span>
              . Maldonado Turismo y Micro no publican los suyos, así que para sus líneas no
              podemos decirlo.
            </p>

            <div className="mt-3 flex flex-col gap-2">
              <label className="text-xs font-bold text-ink-400">
                Desde
                <select
                  value={desde}
                  onChange={(event) => setDesde(event.target.value as ZonaCodesa | '')}
                  className="input mt-1 font-semibold"
                >
                  <option value="">Elegí una zona</option>
                  {ZONAS_CODESA.map((zona) => (
                    <option key={zona} value={zona}>
                      {zona}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold text-ink-400">
                Hasta
                <select
                  value={hasta}
                  onChange={(event) => setHasta(event.target.value as ZonaCodesa | '')}
                  className="input mt-1 font-semibold"
                >
                  <option value="">Elegí una zona</option>
                  {ZONAS_CODESA.map((zona) => (
                    <option key={zona} value={zona}>
                      {zona}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {desde && hasta && (
              <div className="mt-4 rounded-card bg-sand-100 px-3.5 py-3">
                {tramo === null ? (
                  <p className="text-data text-ink-600">
                    Ese par no está en la tabla de CODESA. Preguntale al guarda: no lo vamos a
                    adivinar.
                  </p>
                ) : (
                  <>
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-400">
                      {desde}
                      <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
                      {hasta}
                    </p>
                    <p className="mt-1 text-data text-ink-600">
                      <span className="text-lg font-extrabold text-ink-900">
                        {NOMBRE_DE_TRAMO[tramo]} · {pesos(TARIFAS.comunes[tramo])}
                      </span>
                      <span className="block">
                        Jubilados A {pesos(TARIFAS.jubiladosA[tramo])} · Jubilados B{' '}
                        {pesos(TARIFAS.jubiladosB[tramo])}
                        {TARIFAS.combinaciones[tramo] !== null
                          ? ` · Combinación ${pesos(TARIFAS.combinaciones[tramo]!)}`
                          : ''}
                      </span>
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ---------- Fuentes ---------- */}
        <section className="mt-6" aria-labelledby="fuentes">
          <h2 id="fuentes" className="section-label">
            De dónde sale
          </h2>
          <p className="mt-2 px-1 text-xs text-ink-400">
            {TARIFAS.resolucion}, vigente desde el {vigencia()}. La Intendencia ajusta la tarifa
            una vez por año; si ves un precio distinto en el ómnibus, el que vale es el del
            ómnibus y avisanos.
          </p>
          <ul className="mt-2 flex flex-col gap-1.5 px-1">
            {TARIFAS.fuentes.map((fuente) => (
              <li key={fuente.url}>
                <a
                  href={fuente.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-coral-500"
                >
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.5} />
                  {fuente.nombre}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-start gap-2 px-1 text-xs text-ink-300">
            <Ticket className="mt-0.5 h-3.5 w-3.5 flex-none" strokeWidth={2} />
            Micro no publica tarifas en internet; la tabla departamental rige también para sus
            líneas por la misma resolución.
          </p>
        </section>
      </div>
    </div>
  );
}
