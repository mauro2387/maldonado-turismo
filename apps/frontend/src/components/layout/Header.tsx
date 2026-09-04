import { Link, useLocation } from 'react-router-dom';
import { Home, Map, Bus, CalendarHeart, User } from 'lucide-react';
import clsx from 'clsx';

/**
 * Barra superior de escritorio.
 *
 * En el teléfono no existe: cada pantalla pone su propio título y la
 * navegación vive abajo, al alcance del pulgar. Antes había una barra global
 * con logo, selector de idioma y un menú hamburguesa que repetía exactamente
 * los mismos destinos que la barra inferior.
 */
const NAV_ITEMS = [
  { path: '/', label: 'Inicio', icon: Home },
  { path: '/mapa', label: 'Mapa', icon: Map },
  { path: '/moverse', label: 'Moverse', icon: Bus },
  { path: '/que-hacer', label: 'Qué hacer', icon: CalendarHeart },
  { path: '/vos', label: 'Vos', icon: User },
] as const;

export function Header() {
  const location = useLocation();

  return (
    <header className="safe-top sticky top-0 z-50 hidden border-b border-sand-200 bg-white/90 backdrop-blur md:block">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink-900 text-sm font-extrabold text-white">
            M
          </span>
          <span className="text-base font-extrabold tracking-tight text-ink-900">Maldonado</span>
        </Link>

        <nav className="flex items-center gap-1" aria-label="Navegación de escritorio">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
            const active =
              path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
            return (
              <Link
                key={path}
                to={path}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors duration-200 ease-out',
                  active ? 'bg-sand-100 text-ink-900' : 'text-ink-400 hover:text-ink-900',
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
