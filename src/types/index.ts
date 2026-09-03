export type CompartmentType = 'FREEZER' | 'FRIDGE_TOP' | 'FRIDGE_BOTTOM' | 'CRISPER' | 'DOOR';
export type FoodStatusType = 'FRESH' | 'COOK_SOON' | 'EXPIRED' | 'CONSUMED';

export interface Room {
  id: string;
  code: string;
  name: string;
  created_at: string;
}

export interface RoomDetail extends Room {
  active_food_count: number;
  urgent_food_count: number;
}

export interface FoodItem {
  id: string;
  room_code: string;
  name: string;
  quantity?: string;
  compartment: CompartmentType;
  container_tag?: string;
  added_date: string;
  expiry_date: string;
  days_remaining: number;
  status: FoodStatusType;
  photo_url?: string | null;
  notes?: string | null;
  created_by?: string;
}

export interface CreateFoodDto {
  room_code: string;
  name: string;
  quantity?: string;
  compartment: CompartmentType;
  container_tag?: string;
  shelf_life_days: number;
  photo_url?: string | null;
  notes?: string | null;
  created_by?: string;
}

export interface ParsedFoodItem {
  name: string;
  quantity?: string;
  compartment: CompartmentType;
  container_tag?: string;
  shelf_life_days: number;
}

export interface RecipeSuggestion {
  id: string;
  title: string;
  cook_time_minutes: number;
  ingredients_used: string[];
  ingredients_missing: string[];
  instructions: string[];
}

export interface ShoppingItem {
  id: string;
  room_code: string;
  name: string;
  quantity?: string;
  is_bought: boolean;
  created_at: string;
}

export interface CreateShoppingItemDto {
  room_code: string;
  name: string;
  quantity?: string;
}
