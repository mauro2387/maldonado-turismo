import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Newspaper, QrCode, Route, Languages, ChevronRight, Accessibility } from 'lucide-react';
import { useGeolocation } from '@hooks/useGeolocation';
import { InlineNotice } from '@components/ui/States';

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
    to: '/noticias',
    icon: Newspaper,
    title: 'Noticias de la Intendencia',
    description: 'Avisos, obras y comunicados',
  },
];

export default function VosPage() {
  const { i18n } = useTranslation();
  const { granted, status, message, request } = useGeolocation(false);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-8 pt-4 md:px-6 md:pt-8">
      <h1 className="text-display text-ink-900">Vos</h1>

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
            <p className="text-data text-ink-600">
              La app usa el tamaño de texto que tengas configurado en el teléfono, y las unidades
              con rampa aparecen marcadas en cada llegada.
            </p>
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
