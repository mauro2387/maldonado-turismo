import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Share2, Bookmark, Facebook, Twitter, Link as LinkIcon, Loader2 } from 'lucide-react';
import { useArticle } from '@hooks/useNews';

export default function NoticiaDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isSaved, setIsSaved] = useState(false);

  // Confirmación de "enlace copiado" dentro de la interfaz. Antes era un
  // alert() del navegador, que bloquea la pantalla y se ve distinto en cada
  // sistema operativo.
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);


  // Fetch article from API (auto-increments views)
  const { article, loading, error } = useArticle(id!);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-UY', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const handleShare = async (platform?: 'facebook' | 'twitter' | 'copy') => {
    if (!article) return;
    
    const url = window.location.href;
    const text = article.title;

    if (platform === 'facebook') {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
    } else if (platform === 'twitter') {
      window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
    } else if (platform === 'copy') {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } else if (navigator.share) {
      try {
        await navigator.share({
          title: article.title,
          text: article.summary,
          url: window.location.href,
        });
      } catch (err) {
        // El usuario canceló el diálogo de compartir: no hay nada que avisar.
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Loading state */}
      {loading && (
        <div className="flex justify-center items-center min-h-screen">
          <Loader2 className="animate-spin text-primary-600" size={48} />
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center min-h-screen px-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center max-w-md">
            <p className="text-red-800 mb-4 text-lg font-semibold">Error al cargar la noticia</p>
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition-colors"
            >
              Reintentar
            </button>
          </div>
        </div>
      )}

      {/* Article not found */}
      {!loading && !error && !article && (
        <div className="flex flex-col items-center justify-center min-h-screen px-4">
          <div className="text-center">
            <p className="text-gray-600 text-lg mb-4">Noticia no encontrada</p>
            <button
              onClick={() => navigate('/noticias')}
              className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 transition-colors"
            >
              Volver a noticias
            </button>
          </div>
        </div>
      )}

      {/* Article content */}
      {!loading && !error && article && (
        <>
      {/* Hero image */}
      <div className="relative h-96 bg-gray-900">
        <img
          src={article.image}
          alt={article.title}
          className="w-full h-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm p-2 rounded-full shadow-lg hover:bg-white transition-colors"
        >
          <ArrowLeft size={24} />
        </button>

        {/* Category badge */}
        <span className="absolute top-4 right-4 bg-primary-600 text-white px-4 py-2 rounded-full text-sm font-semibold">
          {article.category}
        </span>

        {/* Title overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
          <div className="container mx-auto max-w-4xl">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4">
              {article.title}
            </h1>
            <div className="flex items-center gap-4 text-white/90 text-sm">
              <div className="flex items-center gap-2">
                <Calendar size={16} />
                <span>{formatDate(article.date)}</span>
              </div>
              {article.readTime && (
                <>
                  <span>•</span>
                  <span>{article.readTime} de lectura</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Author and actions */}
        <div className="flex items-center justify-between mb-8 pb-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            {article.authorImage && (
            <img
              src={article.authorImage}
              alt={article.author}
              className="w-12 h-12 rounded-full object-cover"
            />
            )}
            <div>
              <p className="font-semibold text-gray-900">{article.author}</p>
              <p className="text-sm text-gray-600">{formatDate(article.date)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSaved(!isSaved)}
              className={`p-2 rounded-full transition-colors ${
                isSaved ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title="Guardar"
            >
              <Bookmark size={20} fill={isSaved ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={() => handleShare()}
              className="p-2 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              title="Compartir"
            >
              <Share2 size={20} />
            </button>
          </div>
        </div>

        {/* Summary */}
        <p className="text-xl text-gray-700 font-medium leading-relaxed mb-8">
          {article.summary}
        </p>

        {/* Content */}
        <div className="prose prose-lg max-w-none mb-8">
          <div className="text-gray-700 leading-relaxed whitespace-pre-line">
            {article.content}
          </div>
        </div>

        {/* Gallery */}
        {article.gallery && article.gallery.length > 1 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Galería de imágenes</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {article.gallery.map((img, idx) => (
                <div key={idx} className="aspect-square rounded-lg overflow-hidden">
                  <img
                    src={img}
                    alt={`Gallery ${idx + 1}`}
                    className="w-full h-full object-cover hover:scale-110 transition-transform duration-300 cursor-pointer"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tags */}
        {article.tags && article.tags.length > 0 && (
        <div className="mb-8 pb-8 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Etiquetas</h3>
          <div className="flex flex-wrap gap-2">
            {article.tags.map((tag, idx) => (
              <span
                key={idx}
                className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full text-sm hover:bg-gray-200 transition-colors cursor-pointer"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
        )}

        {/* Share section */}
        <div className="bg-gray-100 rounded-xl p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Compartir esta noticia</h3>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => handleShare('facebook')}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Facebook size={20} />
              <span>Facebook</span>
            </button>
            <button
              onClick={() => handleShare('twitter')}
              className="flex items-center gap-2 bg-sky-500 text-white px-4 py-2 rounded-lg hover:bg-sky-600 transition-colors"
            >
              <Twitter size={20} />
              <span>Twitter</span>
            </button>
            <button
              onClick={() => handleShare('copy')}
              className="flex items-center gap-2 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              <LinkIcon size={20} />
              <span>Copiar link</span>
            </button>
          </div>
        </div>

        {/* Related news */}
        {article.relatedNews && article.relatedNews.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Noticias relacionadas</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {article.relatedNews.map((related) => (
                <div
                  key={related.id}
                  onClick={() => navigate(`/noticia/${related.id}`)}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
                >
                  <div className="relative h-48">
                    <img
                      src={related.image}
                      alt={related.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <span className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold">
                      {related.category}
                    </span>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">
                      {related.title}
                    </h3>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
        </>
      )}

      {copied && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit rounded-full bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white shadow-float md:bottom-8"
        >
          Enlace copiado
        </div>
      )}
    </div>
  );
}
