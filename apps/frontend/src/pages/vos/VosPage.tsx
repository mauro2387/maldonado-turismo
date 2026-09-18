import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Newspaper,
  QrCode,
  Route,
  Languages,
  ChevronRight,
  Accessibility,
  Home,
  Briefcase,
  Download,
  Share,
  Ticket,
  Bus,
  Trash2,
} from 'lucide-react';
import { useGeolocation } from '@hooks/useGeolocation';
import { InlineNotice } from '@components/ui/States';
import { ElegirLugarSheet } from '@components/transporte/ElegirLugarSheet';
import { useLoTuyoStore } from '@store/loTuyoStore';
import { usePreferenciasStore } from '@store/preferenciasStore';
import { alCambiarInstalacion, comoInstalar, instalar } from '@lib/instalar';
import { useHistorialStore } from '@store/historialStore';
import { enlaceParaIr } from '@store/loTuyoStore';
import { LineTag } from '@components/ui/LineTag';
import { lineColor } from '@components/transporte/ArrivalRow';
import { horaDeReloj } from '@lib/hora';

/**
 * Vos.
 *
 * Acá vive lo que es del usuario y lo que se consulta de vez en cuando:
 * idioma, permisos, herramientas y las noticias de la Intendencia.
 *
 * Las noticias bajaron de la barra principal porque ocupaban un quinto del
 * menú con la sección menos abierta de la app; siguen entrando por acá y por
 * la portada, que es donde tienen sentido.
 */

const LANGUAGES = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
] as const;

const TOOLS = [
  {
    to: '/transporte/planificador',
    icon: Route,
    title: 'Planificar un viaje',
    description: 'Origen, destino y las líneas que te sirven',
  },
  {
    to: '/transporte/escaner',
    icon: QrCode,
    title: 'Escanear QR de parada',
    description: 'Los horarios de la parada donde estás parado',
  },
  {
    to: '/moverse/tarifas',
    icon: Ticket,
    title: 'Cuánto sale el boleto',
    description: 'La tarifa oficial de la Intendencia, por tramo',
  },
  {
    to: '/noticias',
    icon: Newspaper,
    title: 'Noticias de la Intendencia',
    description: 'Avisos, obras y comunicados',
  },
];

/** Cuántos viajes se listan en Vos. Diez es lo que entra sin scroll de más. */
const MAX_VIAJES_EN_VOS = 10;

/** "jue 17/9", como se anota en un papel. */
function diaCorto(instante: number): string {
  return new Date(instante).toLocaleDateString('es-UY', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
  });
}

export default function VosPage() {
  const { i18n } = useTranslation();
  const { granted, status, message, request } = useGeolocation(false);

  const loTuyo = useLoTuyoStore();
  const soloAccesibles = usePreferenciasStore((estado) => estado.soloAccesibles);
  const setSoloAccesibles = usePreferenciasStore((estado) => estado.setSoloAccesibles);
  const viajes = useHistorialStore((estado) => estado.viajes);
  const borrarViaje = useHistorialStore((estado) => estado.borrar);
  /** Cuál de los dos se está cambiando en el sheet, si alguno. */
  const [configurando, setConfigurando] = useState<'casa' | 'trabajo' | null>(null);

  /**
   * Cómo se instala en este teléfono. Se vuelve a preguntar cuando Chrome
   * dispara o consume el pedido, que puede pasar con esta pantalla abierta.
   */
  const [instalacion, setInstalacion] = useState(() => comoInstalar());
  useEffect(() => alCambiarInstalacion(() => setInstalacion(comoInstalar())), []);

  const LUGARES_FIJOS = [
    { key: 'casa' as const, icon: Home, titulo: 'Tu casa', lugar: loTuyo.casa },
    { key: 'trabajo' as const, icon: Briefcase, titulo: 'Tu trabajo', lugar: loTuyo.trabajo },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 pb-8 pt-4 md:px-6 md:pt-8">
      <h1 className="text-display text-ink-900">Vos</h1>

      {/* ---------- Tu casa y tu trabajo ----------
          Se ponen desde Moverse la primera vez; acá es donde se cambian. Es
          la única pantalla que es "del usuario", y una casa se muda. */}
      <section className="mt-5" aria-labelledby="tus-lugares">
        <h2 id="tus-lugares" className="section-label">
          Tus lugares
        </h2>
        <div className="mt-2.5 flex flex-col gap-2">
          {LUGARES_FIJOS.map(({ key, icon: Icon, titulo, lugar }) => (
            <button
              key={key}
              onClick={() => setConfigurando(key)}
              className="card flex items-center gap-3.5 py-3.5 text-left"
            >
              <span
                className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl ${
                  lugar ? 'bg-ink-900 text-white' : 'bg-sand-100 text-ink-600'
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-data font-bold text-ink-900">{titulo}</p>
                <p className="truncate text-xs text-ink-400">
                  {lugar ? lugar.name : 'Todavía no la pusiste. Tocá para elegirla.'}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 flex-none text-ink-300" strokeWidth={2.5} />
            </button>
          ))}
        </div>
        {(loTuyo.lugares.length > 0 || loTuyo.paradas.length > 0 || loTuyo.lineas.length > 0) && (
          <p className="mt-2 px-1 text-xs text-ink-400">
            Además guardaste{' '}
            {[
              loTuyo.lugares.length > 0 &&
                `${loTuyo.lugares.length} ${loTuyo.lugares.length === 1 ? 'lugar' : 'lugares'}`,
              loTuyo.paradas.length > 0 &&
                `${loTuyo.paradas.length} ${loTuyo.paradas.length === 1 ? 'parada' : 'paradas'}`,
              loTuyo.lineas.length > 0 &&
                `${loTuyo.lineas.length} ${loTuyo.lineas.length === 1 ? 'línea' : 'líneas'}`,
            ]
              .filter(Boolean)
              .join(', ')}
            . Están en Moverse; se quitan con la misma estrella.
          </p>
        )}
        <p className="mt-2 px-1 text-xs text-ink-300">
          Todo esto se guarda en este teléfono, no en una cuenta.
        </p>
      </section>

      {configurando && (
        <ElegirLugarSheet
          titulo={configurando === 'casa' ? 'Tu casa' : 'Tu trabajo'}
          actual={configurando === 'casa' ? loTuyo.casa : loTuyo.trabajo}
          onPick={(lugar) => {
            if (configurando === 'casa') loTuyo.setCasa(lugar);
            else loTuyo.setTrabajo(lugar);
            setConfigurando(null);
          }}
          onRemove={() => {
            if (configurando === 'casa') loTuyo.setCasa(null);
            else loTuyo.setTrabajo(null);
            setConfigurando(null);
          }}
          onClose={() => setConfigurando(null)}
        />
      )}

      {/* ---------- Instalar ----------
          Sólo cuando hay algo que hacer: un botón si Chrome dio el pedido, o
          las instrucciones en iPhone, donde se instala a mano y Safari no
          avisa. Instalada, o sin forma de saberlo, no se muestra nada: un
          "instalá la app" que no lleva a ningún lado es ruido. */}
      {instalacion === 'boton' && (
        <section className="mt-5" aria-labelledby="instalar">
          <h2 id="instalar" className="section-label">
            En tu teléfono
          </h2>
          <button
            onClick={async () => {
              await instalar();
              setInstalacion(comoInstalar());
            }}
            className="card mt-2.5 flex w-full items-center gap-3.5 py-3.5 text-left"
          >
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-ink-900 text-white">
              <Download className="h-4 w-4" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-data font-bold text-ink-900">Agregar a la pantalla de inicio</p>
              <p className="text-xs text-ink-400">
                Abre como una app, a pantalla completa y con su ícono. No ocupa casi nada.
              </p>
            </div>
            <ChevronRight className="h-4 w-4 flex-none text-ink-300" strokeWidth={2.5} />
          </button>
        </section>
      )}

      {instalacion === 'ios' && (
        <section className="mt-5" aria-labelledby="instalar">
          <h2 id="instalar" className="section-label">
            En tu teléfono
          </h2>
          <div className="card mt-2.5 flex items-start gap-3.5 py-3.5">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-sand-100">
              <Share className="h-4 w-4 text-ink-600" strokeWidth={1.9} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-data font-bold text-ink-900">Agregala a la pantalla de inicio</p>
              <p className="text-xs text-ink-400">
                En Safari, tocá Compartir y después "Agregar a inicio". Abre como una app, con su
                ícono.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ---------- Tus viajes ----------
          Los que se hicieron -se anotan al tocar "ya me subí"-, no los que
          se buscaron. Cada uno se repite con un toque. */}
      {viajes.length > 0 && (
        <section className="mt-6" aria-labelledby="tus-viajes">
          <h2 id="tus-viajes" className="section-label">
            Tus viajes
          </h2>
          <div className="mt-2.5 flex flex-col gap-2">
            {viajes.slice(0, MAX_VIAJES_EN_VOS).map((viaje) => (
              <div key={viaje.id} className="card flex items-center gap-3 py-3">
                <LineTag code={viaje.linea || '?'} color={lineColor(viaje.operator)} />
                <Link to={enlaceParaIr(viaje.destino)} className="min-w-0 flex-1">
                  <span className="block truncate text-data font-bold text-ink-900">
                    {viaje.destino.name}
                  </span>
                  <span className="block truncate text-xs text-ink-400">
                    {diaCorto(viaje.cuando)} {horaDeReloj(viaje.cuando)} · desde {viaje.desde} ·{' '}
                    {viaje.minutos} min
                  </span>
                </Link>
                <button
                  onClick={() => borrarViaje(viaje.id)}
                  aria-label="Borrar este viaje"
                  className="touch-target flex flex-none items-center justify-center rounded-full text-ink-300 active:bg-sand-100"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 px-1 text-xs text-ink-400">
            <Bus className="mr-1 inline h-3.5 w-3.5 align-text-bottom" strokeWidth={2} />
            Se anotan cuando tocás "ya me subí". Tocá uno para volver a ir.
          </p>
        </section>
      )}

      {/* ---------- Herramientas ---------- */}
      <section className="mt-5" aria-labelledby="herramientas">
        <h2 id="herramientas" className="section-label">
          Herramientas
        </h2>
        <div className="mt-2.5 flex flex-col gap-2">
          {TOOLS.map(({ to, icon: Icon, title, description }) => (
            <Link key={to} to={to} className="card flex items-center gap-3.5 py-3.5">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-sand-100">
                <Icon className="h-4 w-4 text-ink-600" strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-data font-bold text-ink-900">{title}</p>
                <p className="text-xs text-ink-400">{description}</p>
              </div>
              <ChevronRight className="h-4 w-4 flex-none text-ink-300" strokeWidth={2.5} />
            </Link>
          ))}
        </div>
      </section>

      {/* ---------- Idioma ---------- */}
      <section className="mt-6" aria-labelledby="idioma">
        <h2 id="idioma" className="section-label">
          Idioma
        </h2>
        <div className="card mt-2.5">
          <div className="mb-3 flex items-center gap-2">
            <Languages className="h-4 w-4 text-ink-400" strokeWidth={1.9} />
            <p className="text-data text-ink-600">
              En temporada, buena parte de quien usa la app no habla español.
            </p>
          </div>
          <div className="flex gap-2">
            {LANGUAGES.map((language) => (
              <button
                key={language.code}
                onClick={() => i18n.changeLanguage(language.code)}
                aria-pressed={i18n.language === language.code}
                className={`chip ${i18n.language === language.code ? 'chip-active' : ''}`}
              >
                {language.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Permisos y accesibilidad ---------- */}
      <section className="mt-6" aria-labelledby="permisos">
        <h2 id="permisos" className="section-label">
          Ubicación y accesibilidad
        </h2>

        <div className="mt-2.5 flex flex-col gap-2">
          {granted ? (
            <InlineNotice
              tone="info"
              message="Tu ubicación está activada: las paradas y los lugares se ordenan por cercanía."
            />
          ) : (
            <InlineNotice
              message={
                message ??
                'Sin tu ubicación no podemos ordenar las paradas por cercanía ni calcular cuánto caminás.'
              }
              action={
                status === 'denied'
                  ? undefined
                  : { label: 'Activar', onClick: request }
              }
            />
          )}

          <div className="card flex items-start gap-3">
            <Accessibility className="mt-0.5 h-4 w-4 flex-none text-sea-500" strokeWidth={1.9} />
            <div className="min-w-0 flex-1">
              <p className="text-data text-ink-600">
                La app usa el tamaño de texto que tengas configurado en el teléfono, y las unidades
                con rampa aparecen marcadas en cada llegada.
              </p>
              {/* La preferencia de toda la app: vale en el planificador, en
                  Moverse y en las paradas. Ver `preferenciasStore`. */}
              <label className="mt-3 flex cursor-pointer items-center justify-between gap-3">
                <span className="text-data font-bold text-ink-900">
                  Mostrar sólo ómnibus con rampa
                </span>
                <input
                  type="checkbox"
                  checked={soloAccesibles}
                  onChange={(event) => setSoloAccesibles(event.target.checked)}
                  className="h-5 w-5 flex-none accent-ink-900"
                />
              </label>
              {soloAccesibles && (
                <p className="mt-1.5 text-xs text-ink-400">
                  De los viajes que salen del horario publicado no sabemos qué coche va a venir:
                  van marcados como "rampa sin confirmar".
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <p className="mt-8 text-xs text-ink-300">
        Intendencia de Maldonado · Los datos de posición de los ómnibus los publican CODESA,
        Maldonado Turismo y Micro. No se guardan ni se muestran datos de los conductores.
      </p>
    </div>
  );
}
