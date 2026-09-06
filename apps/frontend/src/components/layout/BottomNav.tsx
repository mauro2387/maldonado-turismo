import { Link, useLocation } from 'react-router-dom';
import { Home, Map, Bus, CalendarHeart, User } from 'lucide-react';
import clsx from 'clsx';

/**
 * Los cinco destinos de la app, separados por intención y no por sección
 * administrativa: qué pasa ahora, dónde está, cómo llego, qué hago, lo mío.
 *
 * Antes eran Inicio / Mapa / Agenda / Transporte / Noticias, todos con el
 * mismo peso y repitiendo entre sí el mapa, la búsqueda y los filtros.
 */
const NAV_ITEMS = [
  { path: '/', label: 'Inicio', icon: Home },
  { path: '/mapa', label: 'Mapa', icon: Map },
  { path: '/moverse', label: 'Moverse', icon: Bus },
  { path: '/que-hacer', label: 'Qué hacer', icon: CalendarHeart },
  { path: '/vos', label: 'Vos', icon: User },
] as const;

/** Rutas que pertenecen a un destino aunque no cuelguen de su prefijo. */
const EXTRA_MATCHES: Record<string, string[]> = {
  '/moverse': ['/transporte', '/parada'],
  '/que-hacer': ['/evento', '/place', '/places', '/agenda'],
  '/vos': ['/noticias', '/noticia'],
};

function isActivePath(pathname: string, navPath: string): boolean {
  if (navPath === '/') return pathname === '/';
  if (pathname === navPath || pathname.startsWith(`${navPath}/`)) return true;
  return (EXTRA_MATCHES[navPath] ?? []).some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function BottomNav() {
  const location = useLocation();

  return (
    <nav
      className="safe-bottom fixed bottom-0 left-0 right-0 z-40 border-t border-sand-200 bg-white md:hidden"
      aria-label="Navegación principal"
    >
      <div className="flex">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
          const active = isActivePath(location.pathname, path);
          return (
            <Link
              key={path}
              to={path}
              aria-current={active ? 'page' : undefined}
              className={clsx(
                'flex flex-1 flex-col items-center justify-center gap-1 py-2 pb-2.5 transition-colors duration-200 ease-out',
                active ? 'text-coral-500' : 'text-ink-300',
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.9} />
              <span className="text-[0.625rem] font-semibold leading-none">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
