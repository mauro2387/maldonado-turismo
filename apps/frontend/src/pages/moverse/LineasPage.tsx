import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clock, Map as MapIcon, Search } from 'lucide-react';
import { useLines } from '@hooks/useTransport';
import { TransportLine } from '@services/transportService';
import { LineTag } from '@components/ui/LineTag';
import { lineColor } from '@components/transporte/ArrivalRow';
import { LineScheduleSheet } from '@components/transporte/LineScheduleSheet';
import { EmptyState, ErrorState, SkeletonList } from '@components/ui/States';
import { Estrella } from '@components/ui/Estrella';
import { useLoTuyoStore } from '@store/loTuyoStore';
import { operatorName } from '@lib/operators';
import { normalizeStopName } from '@lib/stopNames';

/**
 * Todas las líneas, con su horario y por dónde pasan.
 *
 * El horario publicado de cada línea ya estaba: la tabla del papel de la
 * empresa, reconstruida, con sus puntos de control y sus días. Pero sólo se
 * podía abrir desde el mapa en vivo y con una línea ya filtrada, o sea que
 * había que saber qué línea buscar **antes** de poder mirar horarios. Quien
 * quería ver "los horarios de los bondis" no tenía por dónde entrar.
 *
 * Acá la entrada es la lista. Y cada línea muestra por dónde pasa —los
 * `highlights` que ya trae el catálogo— porque el número solo no le dice nada
 * a nadie que no viva en Maldonado desde hace años: "la 24" no es una
 * respuesta, "por el Hospital y el Shopping" sí.
 */

/** Cuántos puntos del recorrido se listan antes de cortar. */
const MAX_HIGHLIGHTS = 5;

/**
 * Cómo se busca una línea.
 *
 * Por número, por empresa y por los lugares por los que pasa: quien escribe
 * "hospital" no sabe qué línea es —justamente por eso busca— y la respuesta
 * está en los `highlights` de cada recorrido. Se normaliza igual que los
 * nombres de parada, así que "san carlos" encuentra "SAN CARLOS" y "TNAL. SAN
 * CARLOS" por igual.
 */
function matches(line: TransportLine, query: string): boolean {
  const term = normalizeStopName(query);
  if (!term) return true;

  const haystack = normalizeStopName(
    [
      line.line_label ?? line.line_code,
      operatorName(line.operator),
      ...line.itineraries.flatMap((itinerary) => [itinerary.headsign ?? '', ...itinerary.highlights]),
    ].join(' '),
  );

  return term.split(' ').every((word) => haystack.includes(word));
}

/** "Punta del Este · Hospital · Shopping". Lo que contesta "¿me sirve?". */
function porDondePasa(line: TransportLine): string {
  const vistos = new Set<string>();

  for (const itinerary of line.itineraries) {
    for (const highlight of itinerary.highlights) {
      if (vistos.size >= MAX_HIGHLIGHTS) break;
      vistos.add(highlight);
    }
  }

  return [...vistos].join(' · ');
}

export default function LineasPage() {
  const { lines, loading, error } = useLines();
  const [query, setQuery] = useState('');

  /** La línea cuyo horario está abierto. */
  const [schedule, setSchedule] = useState<string | null>(null);

  const guardadas = useLoTuyoStore((estado) => estado.lineas);
  const toggleLinea = useLoTuyoStore((estado) => estado.toggleLinea);

  const estaGuardada = (line: TransportLine) =>
    guardadas.some(
      (guardada) => guardada.operator === line.operator && guardada.code === line.line_code,
    );

  const shown = useMemo(
    () =>
      lines
        .filter((line) => matches(line, query))
        // Por número y no por el orden en que los devuelva la base: es como
        // están impresas en los carteles y como las nombra la gente. Las
        // guardadas van primero: son las que se vienen a mirar.
        .sort((a, b) => {
          const ga = estaGuardada(a) ? 0 : 1;
          const gb = estaGuardada(b) ? 0 : 1;
          if (ga !== gb) return ga - gb;
          const na = Number(a.line_code);
          const nb = Number(b.line_code);
          if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
          return (a.line_label ?? a.line_code).localeCompare(b.line_label ?? b.line_code);
        }),
    [lines, query, guardadas],
  );

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

        <h1 className="text-display">Líneas y horarios</h1>
        <p className="mt-0.5 text-data text-ink-300">
          El horario que publica cada empresa, y por dónde pasa cada línea.
        </p>

        <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5">
          <Search className="h-4 w-4 flex-none text-ink-300" strokeWidth={2.5} />
          <label className="sr-only" htmlFor="buscar-linea">
            Buscar una línea
          </label>
          <input
            id="buscar-linea"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Un número, o un lugar por el que pase"
            className="w-full bg-transparent text-sm font-semibold text-white placeholder:font-medium placeholder:text-ink-300 focus:outline-none"
          />
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 pt-4">
        {error && <ErrorState message={error} />}

        {loading && !error && <SkeletonList rows={4} />}

        {!loading && !error && shown.length === 0 && (
          <EmptyState
            icon={Search}
            title="Ninguna línea coincide"
            description={
              query.trim()
                ? `No encontramos ninguna línea para "${query.trim()}". Probá con el número, o con una playa, un barrio o el hospital.`
                : 'Todavía no cargamos el catálogo de líneas.'
            }
          />
        )}

        <div className="flex flex-col gap-2.5">
          {shown.map((line) => {
            const label = line.line_label ?? line.line_code;
            const recorrido = porDondePasa(line);

            return (
              <article key={`${line.operator}-${line.line_code}`} className="card">
                <div className="flex items-start gap-3">
                  <LineTag code={label} color={lineColor(line.operator)} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="text-data font-bold text-ink-900">{operatorName(line.operator)}</p>
                    {recorrido && (
                      <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{recorrido}</p>
                    )}
                    <p className="mt-1 text-xs text-ink-400">
                      {line.itineraries.length}{' '}
                      {line.itineraries.length === 1 ? 'recorrido' : 'recorridos'} ·{' '}
                      {line.stops_count} paradas
                    </p>
                  </div>
                  <Estrella
                    activa={estaGuardada(line)}
                    que={`la línea ${label}`}
                    onToggle={() =>
                      toggleLinea({ code: line.line_code, label, operator: line.operator })
                    }
                    className="-mr-2 -mt-2"
                  />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setSchedule(label)}
                    className="btn btn-secondary gap-1.5 text-xs"
                  >
                    <Clock className="h-4 w-4" strokeWidth={2} />
                    Horarios
                  </button>
                  <Link
                    to={`/moverse/bondis?linea=${encodeURIComponent(line.line_code)}`}
                    className="btn btn-secondary gap-1.5 text-xs"
                  >
                    <MapIcon className="h-4 w-4" strokeWidth={2} />
                    Por dónde va
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {schedule && <LineScheduleSheet label={schedule} onClose={() => setSchedule(null)} />}
    </div>
  );
}
