export type Category = 'concert' | 'sport' | 'theater' | 'dining' | 'other';
export type ImportSource = 'gmail' | 'manual' | 'calendar';
export type ImportStatus = 'pending' | 'confirmed' | 'rejected';

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Venue {
  id: string;
  name: string;
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
}

export interface Event {
  id: string;
  name: string;
  category: Category;
  venue_id: string;
  event_date: string;
  doors_open: string | null;
  created_at: string;
  venue?: Venue;
}

export interface Ticket {
  id: string;
  user_id: string;
  event_id: string;
  source: ImportSource;
  seat_info: string | null;
  price_paid: number | null;
  currency: string;
  confirmation_code: string | null;
  notes: string | null;
  category_metadata: Record<string, unknown>;
  created_at: string;
  event?: Event;
}
