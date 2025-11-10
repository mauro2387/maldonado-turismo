import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { MapPin, Calendar, Newspaper, Bus, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [places, events, news, routes] = await Promise.all([
        api.get('/places'),
        api.get('/events'),
        api.get('/news'),
        api.get('/transport/routes'),
      ]);
      return {
        places: places.data.length,
        events: events.data.length,
        news: news.data.length,
        routes: routes.data.length,
      };
    },
  });

  const { data: recentActivity } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: async () => {
      const response = await api.get('/admin/audit-log?limit=10');
      return response.data;
    },
  });

  const statCards = [
    {
      name: 'Lugares Turísticos',
      value: stats?.places || 0,
      icon: MapPin,
      color: 'bg-blue-500',
    },
    {
      name: 'Eventos',
      value: stats?.events || 0,
      icon: Calendar,
      color: 'bg-green-500',
    },
    {
      name: 'Noticias',
      value: stats?.news || 0,
      icon: Newspaper,
      color: 'bg-purple-500',
    },
    {
      name: 'Rutas de Transporte',
      value: stats?.routes || 0,
      icon: Bus,
      color: 'bg-orange-500',
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">Bienvenido al panel administrativo</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {statCards.map((stat) => (
          <div key={stat.name} className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className={`flex-shrink-0 ${stat.color} rounded-md p-3`}>
                  <stat.icon className="h-6 w-6 text-white" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      {stat.name}
                    </dt>
                    <dd className="flex items-baseline">
                      <div className="text-2xl font-semibold text-gray-900">
                        {stat.value}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Actividad Reciente
          </h2>
        </div>
        <div className="divide-y divide-gray-200">
          {recentActivity?.length > 0 ? (
            recentActivity.map((log: any) => (
              <div key={log.id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {log.action === 'CREATE' && '✨ Creado: '}
                      {log.action === 'UPDATE' && '✏️ Actualizado: '}
                      {log.action === 'DELETE' && '🗑️ Eliminado: '}
                      {log.entity_type} #{log.entity_id}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      Por {log.user_email} desde {log.ip_address}
                    </p>
                  </div>
                  <div className="text-sm text-gray-500">
                    {format(new Date(log.created_at), 'PPp', { locale: es })}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="px-6 py-8 text-center text-gray-500">
              No hay actividad reciente
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
