import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * Idioma del teléfono, si lo tenemos traducido. En enero buena parte de quien
 * usa la app no habla español, y obligar a cambiarlo a mano es perder a esa
 * persona en la primera pantalla.
 */
function detectLanguage(): string {
  const preferred = (navigator.language || 'es').slice(0, 2).toLowerCase();
  return ['es', 'en', 'pt'].includes(preferred) ? preferred : 'es';
}

// Translations
const resources = {
  es: {
    translation: {
      // Navigation
      home: 'Inicio',
      map: 'Mapa',
      agenda: 'Agenda',
      transport: 'Transporte',
      news: 'Noticias',
      dashboard: 'Panel',

      // Common
      search: 'Buscar',
      filter: 'Filtrar',
      close: 'Cerrar',
      save: 'Guardar',
      cancel: 'Cancelar',
      edit: 'Editar',
      delete: 'Eliminar',
      loading: 'Cargando...',
      noResults: 'No se encontraron resultados',
      error: 'Ha ocurrido un error',

      // Home
      'home.welcome': 'Bienvenido a Maldonado',
      'home.todayEvents': 'Eventos de Hoy',
      'home.nearMe': 'Cerca de Mí',
      'home.nearStops': 'Paradas Cercanas',
      'home.weather': 'Clima',

      // Map
      'map.layers': 'Capas',
      'map.tourism': 'Turismo',
      'map.culture': 'Cultura',
      'map.transport': 'Transporte',
      'map.nearMe': 'Mi ubicación',

      // Agenda
      'agenda.today': 'Hoy',
      'agenda.week': 'Semana',
      'agenda.month': 'Mes',
      'agenda.free': 'Gratis',
      'agenda.paid': 'De pago',

      // Transport
      'transport.stops': 'Paradas',
      'transport.routes': 'Líneas',
      'transport.alerts': 'Alertas',
      'transport.nextBuses': 'Próximos Buses',
      'transport.minutes': 'min',

      // Auth
      'auth.login': 'Iniciar Sesión',
      'auth.logout': 'Cerrar Sesión',
      'auth.email': 'Correo electrónico',
      'auth.password': 'Contraseña',
    },
  },
  en: {
    translation: {
      // Navigation
      home: 'Home',
      map: 'Map',
      agenda: 'Events',
      transport: 'Transport',
      news: 'News',
      dashboard: 'Dashboard',

      // Common
      search: 'Search',
      filter: 'Filter',
      close: 'Close',
      save: 'Save',
      cancel: 'Cancel',
      edit: 'Edit',
      delete: 'Delete',
      loading: 'Loading...',
      noResults: 'No results found',
      error: 'An error occurred',

      // Home
      'home.welcome': 'Welcome to Maldonado',
      'home.todayEvents': "Today's Events",
      'home.nearMe': 'Near Me',
      'home.nearStops': 'Nearby Stops',
      'home.weather': 'Weather',

      // Map
      'map.layers': 'Layers',
      'map.tourism': 'Tourism',
      'map.culture': 'Culture',
      'map.transport': 'Transport',
      'map.nearMe': 'My location',

      // Agenda
      'agenda.today': 'Today',
      'agenda.week': 'Week',
      'agenda.month': 'Month',
      'agenda.free': 'Free',
      'agenda.paid': 'Paid',

      // Transport
      'transport.stops': 'Stops',
      'transport.routes': 'Routes',
      'transport.alerts': 'Alerts',
      'transport.nextBuses': 'Next Buses',
      'transport.minutes': 'min',

      // Auth
      'auth.login': 'Login',
      'auth.logout': 'Logout',
      'auth.email': 'Email',
      'auth.password': 'Password',
    },
  },
  pt: {
    translation: {
      // Navigation
      home: 'Início',
      map: 'Mapa',
      agenda: 'Eventos',
      transport: 'Transporte',
      news: 'Notícias',
      dashboard: 'Painel',

      // Common
      search: 'Buscar',
      filter: 'Filtrar',
      close: 'Fechar',
      save: 'Salvar',
      cancel: 'Cancelar',
      edit: 'Editar',
      delete: 'Excluir',
      loading: 'Carregando...',
      noResults: 'Nenhum resultado encontrado',
      error: 'Ocorreu um erro',

      // Home
      'home.welcome': 'Bem-vindo a Maldonado',
      'home.todayEvents': 'Eventos de hoje',
      'home.nearMe': 'Perto de mim',
      'home.nearStops': 'Paradas próximas',
      'home.weather': 'Clima',

      // Map
      'map.layers': 'Camadas',
      'map.tourism': 'Turismo',
      'map.culture': 'Cultura',
      'map.transport': 'Transporte',
      'map.nearMe': 'Minha localização',

      // Agenda
      'agenda.today': 'Hoje',
      'agenda.week': 'Semana',
      'agenda.month': 'Mês',
      'agenda.free': 'Grátis',
      'agenda.paid': 'Pago',

      // Transport
      'transport.stops': 'Paradas',
      'transport.routes': 'Linhas',
      'transport.alerts': 'Avisos',
      'transport.nextBuses': 'Próximos ônibus',
      'transport.minutes': 'min',

      // Auth
      'auth.login': 'Entrar',
      'auth.logout': 'Sair',
      'auth.email': 'E-mail',
      'auth.password': 'Senha',
    },
  },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: detectLanguage(),
    fallbackLng: 'es',
    supportedLngs: ['es', 'en', 'pt'],
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
