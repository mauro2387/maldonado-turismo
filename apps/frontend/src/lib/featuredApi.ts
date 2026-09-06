import apiClient from './apiClient';

export async function fetchFeatured() {
  // Trae 1 evento, 1 lugar y 1 noticia destacados
  const [events, places, news] = await Promise.all([
    apiClient.get('/events?featured=true&limit=1').then(r => r.data),
    apiClient.get('/places?featured=true&limit=1').then(r => r.data),
    apiClient.get('/news?featured=true&limit=1').then(r => r.data),
  ]);
  return { event: events[0], place: places[0], news: news[0] };
}
