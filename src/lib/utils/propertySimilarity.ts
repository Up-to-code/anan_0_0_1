/* eslint-disable @typescript-eslint/no-explicit-any */
import { Property, SearchQuery } from '@/types';

export interface PropertyWithSimilarity extends Property {
  similarity: number;
}

/**
 * Calculate similarity score between a property and search query
 * Returns a value between 0 and 1 (0% to 100%)
 */
export function calculateSimilarity(property: Property, query: SearchQuery): number {
  let score = 0;
  let totalWeight = 0;

  // Type matching (weight: 20%)
  if (query.type) {
    totalWeight += 20;
    if (property.type === query.type) {
      score += 20;
    } else {
      // Partial match for similar types
      const similarTypes: Record<string, string[]> = {
        'فيلا': ['فيلا', 'قصر', 'منزل'],
        'شقة': ['شقة', 'استوديو', 'دوبلكس'],
        'أرض': ['أرض', 'قطعة'],
        'عمارة': ['عمارة', 'مبنى']
      };
      const similar = similarTypes[query.type] || [];
      if (similar.includes(property.type)) {
        score += 10; // Half score for similar types
      }
    }
  }

  // District matching (weight: 15%)
  if (query.district) {
    totalWeight += 15;
    const queryDistrict = query.district.toLowerCase().trim();
    const propertyDistrict = property.district.toLowerCase().trim();
    
    if (propertyDistrict === queryDistrict) {
      score += 15;
    } else if (propertyDistrict.includes(queryDistrict) || queryDistrict.includes(propertyDistrict)) {
      score += 10; // Partial match
    } else if (propertyDistrict.includes('حي') && queryDistrict.includes('حي')) {
      score += 5; // Both mention "حي" but different areas
    }
  }

  // Purpose matching (weight: 10%)
  if (query.purpose) {
    totalWeight += 10;
    if (property.purpose === query.purpose) {
      score += 10;
    }
  }

  // Price matching (weight: 25%)
  if (query.minPrice !== undefined && query.minPrice !== null || 
      query.maxPrice !== undefined && query.maxPrice !== null) {
    totalWeight += 25;
    const minPrice = query.minPrice || 0;
    const maxPrice = query.maxPrice || Infinity;
    
    if (property.price >= minPrice && property.price <= maxPrice) {
      score += 25; // Perfect match
    } else {
      // Calculate how close the price is
      const priceDiff = Math.min(
        Math.abs(property.price - minPrice),
        Math.abs(property.price - maxPrice)
      );
      const priceRange = maxPrice - minPrice || property.price;
      const priceSimilarity = Math.max(0, 1 - (priceDiff / (priceRange * 2)));
      score += priceSimilarity * 25;
    }
  }

  // Bedrooms matching (weight: 10%)
  if (query.bedrooms !== undefined && query.bedrooms !== null) {
    totalWeight += 10;
    if (property.bedrooms === query.bedrooms) {
      score += 10;
    } else if (property.bedrooms && Math.abs(property.bedrooms - query.bedrooms) <= 1) {
      score += 7; // Close match (±1 bedroom)
    } else if (property.bedrooms && Math.abs(property.bedrooms - query.bedrooms) <= 2) {
      score += 4; // Fair match (±2 bedrooms)
    }
  }

  // Bathrooms matching (weight: 5%)
  if (query.bathrooms !== undefined && query.bathrooms !== null) {
    totalWeight += 5;
    if (property.bathrooms === query.bathrooms) {
      score += 5;
    } else if (property.bathrooms && Math.abs(property.bathrooms - query.bathrooms) <= 1) {
      score += 3; // Close match
    }
  }

  // Area matching (weight: 10%)
  if (query.minArea !== undefined && query.minArea !== null || 
      query.maxArea !== undefined && query.maxArea !== null ||
      query.area !== undefined && query.area !== null) {
    totalWeight += 10;
    const minArea = query.minArea || query.area || 0;
    const maxArea = query.maxArea || Infinity;
    
    if (property.area && property.area >= minArea && property.area <= maxArea) {
      score += 10;
    } else if (property.area) {
      // Calculate area similarity
      const areaDiff = Math.min(
        Math.abs(property.area - minArea),
        Math.abs(property.area - maxArea)
      );
      const areaRange = maxArea - minArea || property.area;
      const areaSimilarity = Math.max(0, 1 - (areaDiff / (areaRange * 2)));
      score += areaSimilarity * 10;
    }
  }

  // Features matching (weight: 5% each)
  const features: Array<keyof Property> = ['pool', 'garden', 'furnished', 'elevator', 'parking'];
  features.forEach(feature => {
    if (query[feature] !== undefined && query[feature] !== null) {
      totalWeight += 1;
      if (property[feature] === query[feature]) {
        score += 1;
      }
    }
  });

  // Calculate final similarity percentage
  if (totalWeight === 0) {
    return 0; // No criteria to match
  }

  const similarity = score / totalWeight;
  return Math.min(1, Math.max(0, similarity)); // Ensure between 0 and 1
}

/**
 * Filter and sort properties by similarity
 */
export function findSimilarProperties(
  properties: Property[], 
  query: SearchQuery, 
  minSimilarity: number = 0.58
): PropertyWithSimilarity[] {
  const propertiesWithSimilarity = properties.map(property => ({
    ...property,
    similarity: calculateSimilarity(property, query)
  }));

  // Filter by minimum similarity threshold
  const filtered = propertiesWithSimilarity.filter(p => p.similarity >= minSimilarity);

  // Sort by similarity (descending)
  filtered.sort((a, b) => b.similarity - a.similarity);

  return filtered;
}

