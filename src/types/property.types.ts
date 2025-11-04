export interface Property {
    id: string;
    legalNumber: string;
    type: PropertyType;
    district: string;
    purpose: PropertyPurpose; // Changed from Purpose to PropertyPurpose
    price: number;
    bedrooms: number | null;
    bathrooms: number | null;
    area: number | null;
    pool: boolean;
    garden: boolean;
    furnished: boolean;
    elevator: boolean;
    parking: boolean;
    description: string;
    images: string[];
  }
  
  export type PropertyType = 'فيلا' | 'شقة' | 'دور' | 'أرض' | 'محل' | 'استراحة';
  export type PropertyPurpose = 'بيع' | 'إيجار'; // Renamed from Purpose to PropertyPurpose
  
  export interface SearchQuery {
    type?: PropertyType;
    district?: string;
    purpose?: PropertyPurpose; // Changed from Purpose to PropertyPurpose
    minPrice?: number | null;
    maxPrice?: number | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    area?: number | null;
    minArea?: number | null;
    maxArea?: number | null;
    pool?: boolean | null;
    garden?: boolean | null;
    furnished?: boolean | null;
    elevator?: boolean | null;
    parking?: boolean | null;
  }