import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

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
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'es',
    fallbackLng: 'es',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
