import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, Map, Calendar, Bus, Newspaper } from 'lucide-react';

export function BottomNav() {
  const { t } = useTranslation();
  const location = useLocation();

  const navItems = [
    { path: '/', icon: Home, label: t('home') },
    { path: '/mapa', icon: Map, label: t('map') },
    { path: '/agenda', icon: Calendar, label: t('agenda') },
    { path: '/transporte', icon: Bus, label: t('transport') },
    { path: '/noticias', icon: Newspaper, label: t('news') },
  ];

  return (
    <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white md:hidden">
      <div className="flex justify-around">
        {navItems.map(({ path, icon: Icon, label }) => {
          // Usar startsWith para que funcione en subrutas como /transporte/escaner
          const isActive = location.pathname === path || location.pathname.startsWith(path + '/');
          return (
            <Link
              key={path}
              to={path}
              className={`flex flex-1 touch-target flex-col items-center justify-center space-y-1 py-2 ${
                isActive ? 'text-primary-600' : 'text-gray-600'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
