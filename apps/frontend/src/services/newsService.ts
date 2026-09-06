import { api } from '@lib/apiClient';

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  content: string;
  image?: string;
  gallery?: string[];
  category: string;
  author: string;
  authorImage?: string;
  date: string;
  readTime?: string;
  tags?: string[];
  featured?: boolean;
  views?: number;
  relatedNews?: RelatedArticle[];
  createdAt?: string;
  updatedAt?: string;
}

export interface RelatedArticle {
  id: string;
  title: string;
  image?: string;
  category: string;
}

export interface NewsFilters {
  category?: string;
  featured?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export const newsService = {
  /**
   * Get all news articles with optional filters
   */
  getAll: async (filters?: NewsFilters): Promise<NewsArticle[]> => {
    const params = new URLSearchParams();
    if (filters?.category) params.append('category', filters.category);
    if (filters?.featured !== undefined) params.append('featured', filters.featured.toString());
    if (filters?.search) params.append('search', filters.search);
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());

    const query = params.toString();
    return api.get<NewsArticle[]>(`/news${query ? `?${query}` : ''}`);
  },

  /**
   * Get a single news article by ID
   */
  getById: async (id: string): Promise<NewsArticle> => {
    return api.get<NewsArticle>(`/news/${id}`);
  },

  /**
   * Get featured news
   */
  getFeatured: async (limit: number = 5): Promise<NewsArticle[]> => {
    return api.get<NewsArticle[]>(`/news/featured?limit=${limit}`);
  },

  /**
   * Get latest news
   */
  getLatest: async (limit: number = 10): Promise<NewsArticle[]> => {
    return api.get<NewsArticle[]>(`/news/latest?limit=${limit}`);
  },

  /**
   * Get news by category
   */
  getByCategory: async (category: string): Promise<NewsArticle[]> => {
    return api.get<NewsArticle[]>(`/news/category/${category}`);
  },

  /**
   * Search news by title or content
   */
  search: async (query: string): Promise<NewsArticle[]> => {
    return api.get<NewsArticle[]>(`/news/search?q=${encodeURIComponent(query)}`);
  },

  /**
   * Get related news for an article
   */
  getRelated: async (articleId: string, limit: number = 3): Promise<RelatedArticle[]> => {
    return api.get<RelatedArticle[]>(`/news/${articleId}/related?limit=${limit}`);
  },

  /**
   * Increment view count
   */
  incrementViews: async (articleId: string): Promise<void> => {
    return api.post(`/news/${articleId}/view`);
  },

  /**
   * Create a new article (admin only)
   */
  create: async (data: Partial<NewsArticle>): Promise<NewsArticle> => {
    return api.post<NewsArticle>('/news', data);
  },

  /**
   * Update an article (admin only)
   */
  update: async (id: string, data: Partial<NewsArticle>): Promise<NewsArticle> => {
    return api.put<NewsArticle>(`/news/${id}`, data);
  },

  /**
   * Delete an article (admin only)
   */
  delete: async (id: string): Promise<void> => {
    return api.delete(`/news/${id}`);
  },
};
