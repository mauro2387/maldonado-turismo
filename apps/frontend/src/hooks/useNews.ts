import { useState, useEffect } from 'react';
import { newsService, NewsArticle, NewsFilters } from '@services/newsService';

interface UseNewsResult {
  news: NewsArticle[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch all news with optional filters
 */
export function useNews(filters?: NewsFilters): UseNewsResult {
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNews = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await newsService.getAll(filters);
      setNews(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar noticias');
      console.error('Error fetching news:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, [filters?.category, filters?.featured, filters?.search]);

  return { news, loading, error, refetch: fetchNews };
}

interface UseArticleResult {
  article: NewsArticle | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch a single news article by ID
 */
export function useArticle(id: string | undefined): UseArticleResult {
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArticle = async () => {
    if (!id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await newsService.getById(id);
      setArticle(data);
      // Increment view count
      await newsService.incrementViews(id);
    } catch (err: any) {
      setError(err.message || 'Error al cargar la noticia');
      console.error('Error fetching article:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArticle();
  }, [id]);

  return { article, loading, error, refetch: fetchArticle };
}

interface UseFeaturedNewsResult {
  news: NewsArticle[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch featured news
 */
export function useFeaturedNews(limit: number = 5): UseFeaturedNewsResult {
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNews = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await newsService.getFeatured(limit);
      setNews(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar noticias destacadas');
      console.error('Error fetching featured news:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, [limit]);

  return { news, loading, error, refetch: fetchNews };
}
