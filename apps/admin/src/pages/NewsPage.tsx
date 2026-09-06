import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import api from '../lib/api';
import { Newspaper, Plus, Edit, Trash2, X, Star, Search } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import ImageUpload from '../components/ImageUpload';
import MapPicker from '../components/MapPicker';
import Pagination from '../components/Pagination';
import type { News } from '../types';

interface NewsFormData {
  title: string;
  content: string;
  category: string;
  author: string;
  published_date: string;
  image_url?: string;
  is_featured: boolean;
  is_active: boolean;
  location?: string;
  lat?: number;
  lng?: number;
}

export default function NewsPage() {
  const [showModal, setShowModal] = useState(false);
  const [editingNews, setEditingNews] = useState<News | null>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [mapLat, setMapLat] = useState<number>(-34.9);
  const [mapLng, setMapLng] = useState<number>(-54.95);
  const [mapAddress, setMapAddress] = useState<string>('');
  
  // Pagination and search states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  const queryClient = useQueryClient();

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<NewsFormData>();

  useEffect(() => {
    if (editingNews) {
      setImageUrl(editingNews.image_url || '');
      setMapLat(editingNews.lat || -34.9);
      setMapLng(editingNews.lng || -54.95);
      setMapAddress(editingNews.location || '');
    } else {
      setImageUrl('');
      setMapLat(-34.9);
      setMapLng(-54.95);
      setMapAddress('');
    }
  }, [editingNews]);

  const { data: news = [], isLoading } = useQuery({
    queryKey: ['news'],
    queryFn: async () => {
      const response = await api.get('/news');
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: NewsFormData) => {
      return api.post('/news', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news'] });
      toast.success('Noticia creada exitosamente');
      setShowModal(false);
      reset();
      setImageUrl('');
    },
    onError: () => {
      toast.error('Error al crear la noticia');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: NewsFormData }) => {
      return api.put(`/news/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news'] });
      toast.success('Noticia actualizada exitosamente');
      setShowModal(false);
      setEditingNews(null);
      reset();
      setImageUrl('');
    },
    onError: () => {
      toast.error('Error al actualizar la noticia');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return api.delete(`/news/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news'] });
      toast.success('Noticia eliminada exitosamente');
    },
    onError: () => {
      toast.error('Error al eliminar la noticia');
    },
  });

  const onSubmit = (data: NewsFormData) => {
    const formData = {
      ...data,
      image_url: imageUrl,
      location: mapAddress || undefined,
      lat: mapAddress ? mapLat : undefined,
      lng: mapAddress ? mapLng : undefined,
    };
    
    if (editingNews) {
      updateMutation.mutate({ id: editingNews.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (newsItem: News) => {
    setEditingNews(newsItem);
    reset({
      ...newsItem,
      published_date: newsItem.published_date.split('T')[0],
    });
    setImageUrl(newsItem.image_url || '');
    setMapLat(newsItem.lat || -34.9);
    setMapLng(newsItem.lng || -54.95);
    setMapAddress(newsItem.location || '');
    setShowModal(true);
  };

  const handleNew = () => {
    setEditingNews(null);
    reset({
      title: '',
      content: '',
      category: '',
      author: '',
      published_date: new Date().toISOString().split('T')[0],
      image_url: '',
      is_featured: false,
      is_active: true,
    });
    setImageUrl('');
    setMapLat(-34.9);
    setMapLng(-54.95);
    setMapAddress('');
    setShowModal(true);
  };

  const handleDelete = (id: number) => {
    if (confirm('¿Estás seguro de eliminar esta noticia?')) {
      deleteMutation.mutate(id);
    }
  };

  // Filter and paginate news
  const filteredNews = useMemo(() => {
    return news.filter((item: News) => {
      const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           item.content?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === 'all' || item.category === filterCategory;
      const matchesStatus = filterStatus === 'all' || 
                           (filterStatus === 'active' && item.is_active) ||
                           (filterStatus === 'inactive' && !item.is_active);
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [news, searchTerm, filterCategory, filterStatus]);

  const paginatedNews = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredNews.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredNews, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredNews.length / itemsPerPage);

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
          <h1 className="text-3xl font-bold text-gray-900">Noticias</h1>
          <p className="text-gray-600 mt-1">Gestiona las noticias y comunicados</p>
        </div>
        <button
          onClick={handleNew}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <Plus className="h-5 w-5" />
          Nueva Noticia
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por título o contenido..."
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
            <option value="General">General</option>
            <option value="Eventos">Eventos</option>
            <option value="Turismo">Turismo</option>
            <option value="Cultura">Cultura</option>
            <option value="Deporte">Deporte</option>
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Autor</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedNews.map((item: News) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Newspaper className="h-4 w-4 text-gray-400" />
                    <span className="font-medium text-gray-900">{item.title}</span>
                    {item.is_featured && <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{item.category}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{item.author}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {item.published_date ? format(new Date(item.published_date), 'dd/MM/yyyy') : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    item.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {item.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => handleEdit(item)}
                    className="text-primary-600 hover:text-primary-900 mr-3"
                  >
                    <Edit className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {paginatedNews.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No se encontraron noticias
          </div>
        )}

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          itemsPerPage={itemsPerPage}
          totalItems={filteredNews.length}
        />
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-bold">
                {editingNews ? 'Editar Noticia' : 'Nueva Noticia'}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contenido *</label>
                  <textarea
                    {...register('content', { required: 'El contenido es requerido' })}
                    rows={8}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                  {errors.content && <p className="text-red-500 text-sm mt-1">{errors.content.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoría *</label>
                  <select
                    {...register('category', { required: 'La categoría es requerida' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Seleccionar</option>
                    <option value="General">General</option>
                    <option value="Cultura">Cultura</option>
                    <option value="Turismo">Turismo</option>
                    <option value="Deportes">Deportes</option>
                    <option value="Eventos">Eventos</option>
                    <option value="Actualidad">Actualidad</option>
                  </select>
                  {errors.category && <p className="text-red-500 text-sm mt-1">{errors.category.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Autor *</label>
                  <input
                    {...register('author', { required: 'El autor es requerido' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                  {errors.author && <p className="text-red-500 text-sm mt-1">{errors.author.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Publicación *</label>
                  <input
                    type="date"
                    {...register('published_date', { required: 'La fecha es requerida' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                  {errors.published_date && <p className="text-red-500 text-sm mt-1">{errors.published_date.message}</p>}
                </div>

                <div className="col-span-2">
                  <ImageUpload
                    value={imageUrl}
                    onChange={setImageUrl}
                    label="Imagen de la Noticia"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    {...register('is_featured')}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label className="text-sm text-gray-700">Destacada</label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    {...register('is_active')}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label className="text-sm text-gray-700">Activa</label>
                </div>

                <div className="col-span-2 pt-4 border-t border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ubicación (Opcional)
                    <span className="text-gray-500 text-xs ml-2">(Si la noticia tiene una ubicación específica)</span>
                  </label>
                  <input
                    {...register('location')}
                    value={mapAddress}
                    onChange={(e) => {
                      setMapAddress(e.target.value);
                      setValue('location', e.target.value);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="Ej: Museo de Arte Contemporáneo, Maldonado"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ubicación en el Mapa (Opcional)
                  </label>
                  <MapPicker
                    lat={mapLat}
                    lng={mapLng}
                    address={mapAddress}
                    category="Otro"
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
