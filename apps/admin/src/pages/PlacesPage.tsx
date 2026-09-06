import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import api from '../lib/api';
import { MapPin, Plus, Edit, Trash2, X, Star, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import ImageUpload from '../components/ImageUpload';
import MapPicker from '../components/MapPicker';
import Pagination from '../components/Pagination';
import type { Place } from '../types';

interface PlaceFormData {
  name: string;
  description: string;
  category: string;
  lat: number;
  lng: number;
  address: string;
  phone?: string;
  website?: string;
  image_url?: string;
  is_featured: boolean;
  is_active: boolean;
}

export default function PlacesPage() {
  const [showModal, setShowModal] = useState(false);
  const [editingPlace, setEditingPlace] = useState<Place | null>(null);
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

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<PlaceFormData>();

  useEffect(() => {
    if (editingPlace) {
      setImageUrl(editingPlace.image_url || '');
      setMapLat(editingPlace.lat || -34.9);
      setMapLng(editingPlace.lng || -54.95);
      setMapAddress(editingPlace.address || '');
      setSelectedCategory(editingPlace.category || '');
    } else {
      setImageUrl('');
      setMapLat(-34.9);
      setMapLng(-54.95);
      setMapAddress('');
      setSelectedCategory('');
    }
  }, [editingPlace]);

  const { data: places = [], isLoading } = useQuery({
    queryKey: ['places'],
    queryFn: async () => {
      const response = await api.get('/places');
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: PlaceFormData) => {
      return api.post('/places', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['places'] });
      toast.success('Lugar creado exitosamente');
      setShowModal(false);
      reset();
      setImageUrl('');
      setMapLat(-34.9);
      setMapLng(-54.95);
      setMapAddress('');
    },
    onError: (error: any) => {
      console.error('Error al crear lugar:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Error al crear el lugar';
      toast.error(errorMessage);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: PlaceFormData }) => {
      return api.put(`/places/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['places'] });
      toast.success('Lugar actualizado exitosamente');
      setShowModal(false);
      setEditingPlace(null);
      reset();
      setImageUrl('');
      setMapLat(-34.9);
      setMapLng(-54.95);
      setMapAddress('');
    },
    onError: (error: any) => {
      console.error('Error al actualizar lugar:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Error al actualizar el lugar';
      toast.error(errorMessage);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return api.delete(`/places/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['places'] });
      toast.success('Lugar eliminado exitosamente');
    },
    onError: (error: any) => {
      console.error('Error al eliminar lugar:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Error al eliminar el lugar';
      toast.error(errorMessage);
    },
  });

  const onSubmit = (data: PlaceFormData) => {
    console.log('Form data:', data);
    console.log('Image URL:', imageUrl);
    console.log('Map coords:', { lat: mapLat, lng: mapLng });
    
    const formData = {
      ...data,
      image_url: imageUrl,
      lat: mapLat,
      lng: mapLng,
    };
    
    console.log('Sending to API:', formData);
    
    if (editingPlace) {
      updateMutation.mutate({ id: editingPlace.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (place: Place) => {
    setEditingPlace(place);
    reset(place);
    setImageUrl(place.image_url || '');
    setMapLat(place.lat || -34.9);
    setMapLng(place.lng || -54.95);
    setMapAddress(place.address || '');
    setShowModal(true);
  };

  const handleNew = () => {
    setEditingPlace(null);
    reset({
      name: '',
      description: '',
      category: '',
      lat: 0,
      lng: 0,
      address: '',
      phone: '',
      website: '',
      image_url: '',
      is_featured: false,
      is_active: true,
    });
    setShowModal(true);
  };

  const handleDelete = (id: number) => {
    if (confirm('¿Estás seguro de eliminar este lugar?')) {
      deleteMutation.mutate(id);
    }
  };

  // Filter and paginate places
  const filteredPlaces = useMemo(() => {
    return places.filter((place: Place) => {
      const matchesSearch = place.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           place.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === 'all' || place.category === filterCategory;
      const matchesStatus = filterStatus === 'all' || 
                           (filterStatus === 'active' && place.is_active) ||
                           (filterStatus === 'inactive' && !place.is_active);
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [places, searchTerm, filterCategory, filterStatus]);

  const paginatedPlaces = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredPlaces.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredPlaces, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredPlaces.length / itemsPerPage);

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
          <h1 className="text-3xl font-bold text-gray-900">Lugares Turísticos</h1>
          <p className="text-gray-600 mt-1">Gestiona los lugares de interés turístico</p>
        </div>
        <button
          onClick={handleNew}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <Plus className="h-5 w-5" />
          Nuevo Lugar
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre o descripción..."
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
            <option value="Playa">Playa</option>
            <option value="Museo">Museo</option>
            <option value="Parque">Parque</option>
            <option value="Restaurante">Restaurante</option>
            <option value="Hotel">Hotel</option>
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dirección</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedPlaces.map((place: Place) => (
              <tr key={place.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    <span className="font-medium text-gray-900">{place.name}</span>
                    {place.is_featured && <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{place.category}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{place.address}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    place.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {place.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => handleEdit(place)}
                    className="text-primary-600 hover:text-primary-900 mr-3"
                  >
                    <Edit className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(place.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {paginatedPlaces.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No se encontraron lugares
          </div>
        )}

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          itemsPerPage={itemsPerPage}
          totalItems={filteredPlaces.length}
        />
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-bold">
                {editingPlace ? 'Editar Lugar' : 'Nuevo Lugar'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                  <input
                    {...register('name', { required: 'El nombre es requerido' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                  {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>}
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descripción *</label>
                  <textarea
                    {...register('description', { required: 'La descripción es requerida' })}
                    rows={3}
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
                    <option value="Playa">Playa</option>
                    <option value="Museo">Museo</option>
                    <option value="Parque">Parque</option>
                    <option value="Restaurante">Restaurante</option>
                    <option value="Hotel">Hotel</option>
                    <option value="Otro">Otro</option>
                  </select>
                  {errors.category && <p className="text-red-500 text-sm mt-1">{errors.category.message}</p>}
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Dirección * 
                    <span className="text-gray-500 text-xs ml-2">(Se auto-completa desde el mapa o edítala manualmente)</span>
                  </label>
                  <input
                    {...register('address', { 
                      required: 'La dirección es requerida',
                      onChange: (e) => setMapAddress(e.target.value)
                    })}
                    value={mapAddress}
                    onChange={(e) => {
                      setMapAddress(e.target.value);
                      setValue('address', e.target.value);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="Ej: Av. Gorlero 1234, Punta del Este"
                  />
                  {errors.address && <p className="text-red-500 text-sm mt-1">{errors.address.message}</p>}
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
                      setValue('address', address);
                    }}
                  />
                </div>

                <div className="col-span-2">
                  <ImageUpload
                    value={imageUrl}
                    onChange={setImageUrl}
                    label="Imagen del Lugar"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                  <input
                    {...register('phone')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sitio Web</label>
                  <input
                    {...register('website')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
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
