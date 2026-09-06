export interface User {
  id: number;
  email: string;
  name: string;
  role: 'admin_sis' | 'turismo' | 'cultura' | 'transporte' | 'prensa' | 'lectura';
  department: string;
  active: boolean;
  last_login: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  user: User;
}

export interface Place {
  id: number;
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

export interface Event {
  id: number;
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

export interface News {
  id: number;
  title: string;
  content: string;
  category: string;
  author: string;
  published_date: string;
  location?: string;
  lat?: number;
  lng?: number;
  image_url?: string;
  is_featured: boolean;
  is_active: boolean;
}

export interface TransportRoute {
  id: number;
  name: string;
  description: string;
  route_type: string;
  color?: string;
  is_active: boolean;
}

export interface AuditLog {
  id: number;
  user_id: number;
  user_email: string;
  action: string;
  entity_type: string;
  entity_id: number;
  changes: Record<string, any>;
  ip_address: string;
  created_at: string;
}
