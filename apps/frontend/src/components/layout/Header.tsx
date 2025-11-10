import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, Globe } from 'lucide-react';
import { useState } from 'react';

export function Header() {
  const { t, i18n } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleLanguage = () => {
    const newLang = i18n.language === 'es' ? 'en' : 'es';
    i18n.changeLanguage(newLang);
  };

  return (
    <header className="safe-top sticky top-0 z-50 bg-white shadow-sm border-b border-gray-200">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link to="/" className="flex items-center space-x-2">
          <div className="h-8 w-8 rounded bg-primary-600 flex items-center justify-center text-white font-bold">
            M
          </div>
          <span className="font-semibold text-gray-900 hidden sm:inline">
            Maldonado Turismo
          </span>
        </Link>

        <div className="flex items-center space-x-2">
          <button
            onClick={toggleLanguage}
            className="btn-ghost touch-target rounded-full p-2"
            aria-label="Cambiar idioma"
          >
            <Globe className="h-5 w-5" />
            <span className="ml-1 text-xs font-medium uppercase">{i18n.language}</span>
          </button>

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="btn-ghost touch-target rounded-full p-2 md:hidden"
            aria-label="Menú"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t border-gray-200 bg-white p-4 md:hidden">
          <nav className="flex flex-col space-y-2">
            <Link to="/" className="py-2 text-gray-700 hover:text-primary-600">
              {t('home')}
            </Link>
            <Link to="/places" className="py-2 text-gray-700 hover:text-primary-600">
              Lugares
            </Link>
            <Link to="/mapa" className="py-2 text-gray-700 hover:text-primary-600">
              {t('map')}
            </Link>
            <Link to="/agenda" className="py-2 text-gray-700 hover:text-primary-600">
              {t('agenda')}
            </Link>
            <Link to="/transporte" className="py-2 text-gray-700 hover:text-primary-600">
              {t('transport')}
            </Link>
            <Link to="/noticias" className="py-2 text-gray-700 hover:text-primary-600">
              {t('news')}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
