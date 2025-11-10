import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import api from '../lib/api';
import { Calendar, Plus, Edit, Trash2, X, Star, Search } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import ImageUpload from '../components/ImageUpload';
import MapPicker from '../components/MapPicker';
import Pagination from '../components/Pagination';
import type { Event } from '../types';

interface EventFormData {
  title: string;
  description: string;
  category: string;
  start_date: string;
  end_date: string;
  start_time?: string;
  end_time?: string;
  location: string;
  lat?: number;
  lng?: number;
  price?: number;
  image_url?: string;
  is_featured: boolean;
  is_active: boolean;
}

export default function EventsPage() {
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [mapLat, setMapLat] = useState<number>(-34.9);
  const [mapLng, setMapLng] = useState<number>(-54.95);
  const [mapAddress, setMapAddress] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  
  // Pagination and search states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  const queryClient = useQueryClient();

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<EventFormData>();

  useEffect(() => {
    if (editingEvent) {
      setImageUrl(editingEvent.image_url || '');
      setMapLat(editingEvent.lat || -34.9);
      setMapLng(editingEvent.lng || -54.95);
      setMapAddress(editingEvent.location || '');
      setSelectedCategory(editingEvent.category || '');
    } else {
      setImageUrl('');
      setMapLat(-34.9);
      setMapLng(-34.95);
      setMapAddress('');
      setSelectedCategory('');
    }
  }, [editingEvent]);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events'],
    queryFn: async () => {
      const response = await api.get('/events');
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: EventFormData) => {
      return api.post('/events', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('Evento creado exitosamente');
      setShowModal(false);
      reset();
      setImageUrl('');
    },
    onError: () => {
      toast.error('Error al crear el evento');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: EventFormData }) => {
      return api.put(`/events/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('Evento actualizado exitosamente');
      setShowModal(false);
      setEditingEvent(null);
      reset();
      setImageUrl('');
    },
    onError: () => {
      toast.error('Error al actualizar el evento');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return api.delete(`/events/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('Evento eliminado exitosamente');
    },
    onError: () => {
      toast.error('Error al eliminar el evento');
    },
  });

  const onSubmit = (data: EventFormData) => {
    const formData = {
      ...data,
      image_url: imageUrl,
      lat: mapLat,
      lng: mapLng,
    };
    
    if (editingEvent) {
      updateMutation.mutate({ id: editingEvent.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (event: Event) => {
    setEditingEvent(event);
    reset({
      ...event,
      start_date: event.start_date.split('T')[0],
      end_date: event.end_date.split('T')[0],
    });
    setImageUrl(event.image_url || '');
    setMapLat(event.lat || -34.9);
    setMapLng(event.lng || -54.95);
    setMapAddress(event.location || '');
    setSelectedCategory(event.category || '');
    setShowModal(true);
  };

  const handleNew = () => {
    setEditingEvent(null);
    reset({
      title: '',
      description: '',
      category: '',
      start_date: '',
      end_date: '',
      location: '',
      price: undefined,
      image_url: '',
      is_featured: false,
      is_active: true,
    });
    setImageUrl('');
    setShowModal(true);
  };

  const handleDelete = (id: number) => {
    if (confirm('¿Estás seguro de eliminar este evento?')) {
      deleteMutation.mutate(id);
    }
  };

  // Filter and paginate events
  const filteredEvents = useMemo(() => {
    return events.filter((event: Event) => {
      const matchesSearch = event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           event.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === 'all' || event.category === filterCategory;
      const matchesStatus = filterStatus === 'all' || 
                           (filterStatus === 'active' && event.is_active) ||
                           (filterStatus === 'inactive' && !event.is_active);
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [events, searchTerm, filterCategory, filterStatus]);

  const paginatedEvents = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredEvents.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredEvents, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredEvents.length / itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterCategory, filterStatus]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Eventos</h1>
          <p className="text-gray-600 mt-1">Gestiona los eventos y actividades</p>
        </div>
        <button
          onClick={handleNew}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <Plus className="h-5 w-5" />
          Nuevo Evento
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por título o descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">Todas las categorías</option>
            <option value="Música">Música</option>
            <option value="Teatro">Teatro</option>
            <option value="Deportes">Deportes</option>
            <option value="Arte">Arte</option>
            <option value="Cultura">Cultura</option>
            <option value="Otro">Otro</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Título</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fechas</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ubicación</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedEvents.map((event: Event) => (
              <tr key={event.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <span className="font-medium text-gray-900">{event.title}</span>
                    {event.is_featured && <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{event.category}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {format(new Date(event.start_date), 'dd/MM/yyyy')} - {format(new Date(event.end_date), 'dd/MM/yyyy')}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{event.location}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    event.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {event.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => handleEdit(event)}
                    className="text-primary-600 hover:text-primary-900 mr-3"
                  >
                    <Edit className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(event.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {paginatedEvents.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No se encontraron eventos
          </div>
        )}

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          itemsPerPage={itemsPerPage}
          totalItems={filteredEvents.length}
        />
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-bold">
                {editingEvent ? 'Editar Evento' : 'Nuevo Evento'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                  <input
                    {...register('title', { required: 'El título es requerido' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                  {errors.title && <p className="text-red-500 text-sm mt-1">{errors.title.message}</p>}
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descripción *</label>
                  <textarea
                    {...register('description', { required: 'La descripción es requerida' })}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                  {errors.description && <p className="text-red-500 text-sm mt-1">{errors.description.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoría *</label>
                  <select
                    {...register('category', { 
                      required: 'La categoría es requerida',
                      onChange: (e) => setSelectedCategory(e.target.value)
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Seleccionar</option>
                    <option value="Música">Música</option>
                    <option value="Teatro">Teatro</option>
                    <option value="Deportes">Deportes</option>
                    <option value="Arte">Arte</option>
                    <option value="Gastronomía">Gastronomía</option>
                    <option value="Otro">Otro</option>
                  </select>
                  {errors.category && <p className="text-red-500 text-sm mt-1">{errors.category.message}</p>}
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ubicación * 
                    <span className="text-gray-500 text-xs ml-2">(Se auto-completa desde el mapa)</span>
                  </label>
                  <input
                    {...register('location', { 
                      required: 'La ubicación es requerida',
                      onChange: (e) => setMapAddress(e.target.value)
                    })}
                    value={mapAddress}
                    onChange={(e) => {
                      setMapAddress(e.target.value);
                      setValue('location', e.target.value);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="Ej: Teatro Loureiro, Punta del Este"
                  />
                  {errors.location && <p className="text-red-500 text-sm mt-1">{errors.location.message}</p>}
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ubicación en el Mapa * 
                    <span className="text-gray-500 text-xs ml-2">(Haz clic en el mapa)</span>
                  </label>
                  <MapPicker
                    lat={mapLat}
                    lng={mapLng}
                    address={mapAddress}
                    category={selectedCategory}
                    onLocationChange={(lat: number, lng: number) => {
                      setMapLat(lat);
                      setMapLng(lng);
                      setValue('lat', lat);
                      setValue('lng', lng);
                    }}
                    onAddressChange={(address: string) => {
                      setMapAddress(address);
                      setValue('location', address);
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Inicio *</label>
                  <input
                    type="date"
                    {...register('start_date', { required: 'La fecha de inicio es requerida' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                  {errors.start_date && <p className="text-red-500 text-sm mt-1">{errors.start_date.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Fin *</label>
                  <input
                    type="date"
                    {...register('end_date', { required: 'La fecha de fin es requerida' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                  {errors.end_date && <p className="text-red-500 text-sm mt-1">{errors.end_date.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora Inicio</label>
                  <input
                    type="time"
                    {...register('start_time')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora Fin</label>
                  <input
                    type="time"
                    {...register('end_time')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio</label>
                  <input
                    type="number"
                    step="0.01"
                    {...register('price', { valueAsNumber: true })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div className="col-span-2">
                  <ImageUpload
                    value={imageUrl}
                    onChange={setImageUrl}
                    label="Imagen del Evento"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    {...register('is_featured')}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label className="text-sm text-gray-700">Destacado</label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    {...register('is_active')}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label className="text-sm text-gray-700">Activo</label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
