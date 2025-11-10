import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { FileText, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { AuditLog } from '../types';

export default function AuditLogPage() {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [filterAction, setFilterAction] = useState<string>('');
  const [filterEntity, setFilterEntity] = useState<string>('');

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['audit-logs', filterAction, filterEntity],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterAction) params.append('action', filterAction);
      if (filterEntity) params.append('entity_type', filterEntity);
      
      const response = await api.get(`/admin/audit-log?${params.toString()}`);
      return response.data;
    },
  });

  const getActionBadge = (action: string) => {
    const styles = {
      CREATE: 'bg-green-100 text-green-800',
      UPDATE: 'bg-blue-100 text-blue-800',
      DELETE: 'bg-red-100 text-red-800',
      LOGIN: 'bg-purple-100 text-purple-800',
      LOGOUT: 'bg-gray-100 text-gray-800',
    };
    return styles[action as keyof typeof styles] || 'bg-gray-100 text-gray-800';
  };

  const toggleRow = (id: number) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Registro de Auditoría</h1>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <FileText className="h-4 w-4" />
          {logs.length} registros
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <div className="flex items-center gap-4">
          <Filter className="h-5 w-5 text-gray-400" />
          <div className="flex gap-4 flex-1">
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Todas las acciones</option>
              <option value="CREATE">Crear</option>
              <option value="UPDATE">Actualizar</option>
              <option value="DELETE">Eliminar</option>
              <option value="LOGIN">Login</option>
              <option value="LOGOUT">Logout</option>
            </select>

            <select
              value={filterEntity}
              onChange={(e) => setFilterEntity(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Todas las entidades</option>
              <option value="place">Lugares</option>
              <option value="event">Eventos</option>
              <option value="news">Noticias</option>
              <option value="bus_route">Rutas</option>
              <option value="bus_stop">Paradas</option>
              <option value="transport_alert">Alertas</option>
            </select>

            {(filterAction || filterEntity) && (
              <button
                onClick={() => {
                  setFilterAction('');
                  setFilterEntity('');
                }}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha/Hora</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuario</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acción</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entidad</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Detalles</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {logs.map((log: AuditLog) => (
              <>
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: es })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {log.user_email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${getActionBadge(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {log.entity_type} #{log.entity_id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {log.ip_address}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    {log.changes && Object.keys(log.changes).length > 0 && (
                      <button
                        onClick={() => toggleRow(log.id)}
                        className="text-primary-600 hover:text-primary-900"
                      >
                        {expandedRow === log.id ? (
                          <ChevronUp className="h-5 w-5" />
                        ) : (
                          <ChevronDown className="h-5 w-5" />
                        )}
                      </button>
                    )}
                  </td>
                </tr>
                {expandedRow === log.id && log.changes && (
                  <tr className="bg-gray-50">
                    <td colSpan={6} className="px-6 py-4">
                      <div className="text-sm">
                        <h4 className="font-semibold text-gray-900 mb-2">Cambios realizados:</h4>
                        <pre className="bg-white p-3 rounded border border-gray-200 overflow-x-auto">
                          {JSON.stringify(log.changes, null, 2)}
                        </pre>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>

        {logs.length === 0 && (
          <div className="text-center py-12">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No hay registros</h3>
            <p className="mt-1 text-sm text-gray-500">
              {filterAction || filterEntity
                ? 'No se encontraron registros con los filtros aplicados.'
                : 'Aún no hay actividad registrada en el sistema.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
