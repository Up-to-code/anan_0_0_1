/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from '@/lib/db/operations';
import { SearchQuery, Property } from '@/types';
import { findSimilarProperties, PropertyWithSimilarity } from '@/lib/utils/propertySimilarity';

/**
 * Main handler for property search events
 * 
 * Step 1: Validate inputs
 * Step 2: Create search event in database
 * Step 3: Perform exact match search
 * Step 4: If no exact matches, perform fuzzy matching
 * Step 5: Format and return results as message text
 * 
 * @param userId - Phone number of the user requesting search
 * @param query - Search criteria (type, district, price, etc.)
 * @returns Formatted search results as string message
 */
export async function handlePropertySearchEvent(userId: string, query: SearchQuery): Promise<string> {
  console.log('🔍 Handling property search:', query);
  
  // ==========================================
  // STEP 1: Validate inputs
  // ==========================================
  validateSearchInputs(userId, query);
  
  try {
    // ==========================================
    // STEP 2: Create search event in database
    // ==========================================
    await createSearchEvent(userId, query);
    
    // ==========================================
    // STEP 3: Perform exact match search
    // ==========================================
    let properties = await performExactSearch(query);
    
    // ==========================================
    // STEP 4: If no exact matches, use fuzzy matching
    // ==========================================
    if (properties.length === 0) {
      properties = await performFuzzySearch(query);
    }
    
    // ==========================================
    // STEP 5: Format and return results
    // ==========================================
    return formatSearchResults(properties);
    
  } catch (error) {
    console.error('❌ Error in property search:', error);
    return handleSearchError(error);
  }
}

/**
 * STEP 1: Validate search inputs
 * Ensures userId and query are valid before processing
 */
function validateSearchInputs(userId: string, query: SearchQuery): void {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Invalid userId: must be a non-empty string');
  }
  
  if (!query || typeof query !== 'object') {
    throw new Error('Invalid query: must be an object');
  }
}

/**
 * STEP 2: Create search event in database
 * Logs the search event for tracking and analytics
 */
async function createSearchEvent(userId: string, query: SearchQuery): Promise<void> {
  await db.events.create({
    userId,
    type: 'property_searched',
    details: { query }
  });
  console.log('✅ Search event created in database');
}

/**
 * STEP 3: Perform exact match search
 * Searches for properties that exactly match all criteria
 * 
 * @returns Array of matching properties (empty if no matches)
 */
async function performExactSearch(query: SearchQuery): Promise<Array<Property & { similarity?: number }>> {
  console.log('📊 Step 3: Performing exact match search...');
  console.log('📋 Search criteria:', query);
  
  const properties = await db.properties.search(query);
  console.log(`✅ Found ${properties.length} exact match properties`);
  
  return properties;
}

/**
 * STEP 4: Perform fuzzy matching search
 * If no exact matches found, searches for similar properties
 * using similarity scoring (minimum 58% match)
 * 
 * @returns Array of similar properties with similarity scores
 */
async function performFuzzySearch(query: SearchQuery): Promise<Array<Property & { similarity?: number }>> {
  console.log('🔍 Step 4: No exact matches found, using fuzzy matching...');
  
  // Get all properties for similarity comparison
  const allProperties = await db.properties.searchWithSimilarity(query);
  console.log(`📊 Comparing against ${allProperties.length} total properties`);
  
  // Find similar properties (>= 58% similarity)
  const similarProperties = findSimilarProperties(allProperties, query, 0.58);
  console.log(`✅ Found ${similarProperties.length} similar properties (>=58% match)`);
  
  // Convert PropertyWithSimilarity to Property format with similarity score
  const properties = similarProperties.map((p: PropertyWithSimilarity) => {
    const { similarity, ...property } = p;
    return {
      ...property,
      similarity // Keep similarity score for display
    };
  });
  
  return properties;
}

/**
 * STEP 5: Format search results as message text
 * Converts property data into readable WhatsApp message format
 * 
 * Features:
 * - Shows first 3 properties
 * - Displays similarity percentage for fuzzy matches
 * - Includes property details (price, bedrooms, area, etc.)
 * - Adds footer message with instructions
 * 
 * @param properties - Array of properties with optional similarity scores
 * @returns Formatted message string ready to send
 */
function formatSearchResults(properties: Array<Property & { similarity?: number }>): string {
  // ==========================================
  // STEP 5.1: Handle empty results
  // ==========================================
  if (properties.length === 0) {
    return getNoResultsMessage();
  }
  
  // ==========================================
  // STEP 5.2: Detect if results are fuzzy matches
  // ==========================================
  const isFuzzyMatch = detectFuzzyMatch(properties);
  
  // ==========================================
  // STEP 5.3: Build header message
  // ==========================================
  const header = buildResultsHeader(properties.length, isFuzzyMatch);
  
  // ==========================================
  // STEP 5.4: Format property list (first 3)
  // ==========================================
  const propertyList = formatPropertyList(properties.slice(0, 3));
  
  // ==========================================
  // STEP 5.5: Build footer with instructions
  // ==========================================
  const footer = buildResultsFooter(properties.length, isFuzzyMatch);
  
  // ==========================================
  // STEP 5.6: Combine all parts
  // ==========================================
  return `${header}\n\n${propertyList}\n${footer}`;
}

/**
 * STEP 5.1: Get message for no results found
 */
function getNoResultsMessage(): string {
  return 'لم يتم العثور على عقارات تطابق معايير البحث. هل ترغب في تعديل البحث؟';
}

/**
 * STEP 5.2: Detect if results are from fuzzy matching
 * Checks if any property has similarity score < 100%
 */
function detectFuzzyMatch(properties: Array<Property & { similarity?: number }>): boolean {
  const hasSimilarity = properties.some(p => p.similarity !== undefined);
  const firstProperty = properties[0];
  
  return hasSimilarity && 
         firstProperty.similarity !== undefined && 
         firstProperty.similarity < 1;
}

/**
 * STEP 5.3: Build header message
 * Creates the opening message based on match type
 */
function buildResultsHeader(count: number, isFuzzyMatch: boolean): string {
  if (isFuzzyMatch) {
    return `🔍 تم العثور على ${count} عقار مشابه:`;
  }
  return `🏠 تم العثور على ${count} عقار:`;
}

/**
 * STEP 5.4: Format property list
 * Converts property objects into formatted text lines
 */
function formatPropertyList(properties: Array<Property & { similarity?: number }>): string {
  return properties
    .map((property, index) => formatSingleProperty(property, index + 1))
    .join('\n\n');
}

/**
 * Format a single property entry
 * Creates formatted text for one property with all details
 */
function formatSingleProperty(property: Property & { similarity?: number }, index: number): string {
  let text = '';
  
  // Property title with similarity (if fuzzy match)
  const similarityPercent = property.similarity 
    ? Math.round(property.similarity * 100) 
    : null;
  
  text += `${index}. *${property.type || 'عقار'}* في ${property.district || 'غير محدد'}`;
  if (similarityPercent && similarityPercent < 100) {
    text += ` (${similarityPercent}% تطابق)`;
  }
  text += '\n';
  
  // Legal number
  text += `   📋 رقم العقاري: ${formatLegalNumber(property.legalNumber)}\n`;
  
  // Price
  text += `   💰 السعر: ${property.price?.toLocaleString() || 'غير محدد'} ريال\n`;
  
  // Bedrooms
  if (property.bedrooms) {
    text += `   🛏️ ${property.bedrooms} غرف نوم\n`;
  }
  
  // Bathrooms
  if (property.bathrooms) {
    text += `   🚿 ${property.bathrooms} حمام\n`;
  }
  
  // Area
  if (property.area) {
    text += `   📐 مساحة: ${property.area}م²\n`;
  }
  
  // Description (truncated if too long)
  if (property.description) {
    const maxDescLength = 100;
    const shortDesc = property.description.length > maxDescLength
      ? property.description.substring(0, maxDescLength) + '...'
      : property.description;
    text += `   📝 ${shortDesc}\n`;
  }
  
  return text;
}

/**
 * Format legal number with dashes
 * Converts 10-digit number to format: XXXX-XXXX-XX
 */
function formatLegalNumber(legalNumber: string): string {
  if (!legalNumber) return 'غير متوفر';
  
  if (legalNumber.length === 10) {
    return `${legalNumber.substring(0, 4)}-${legalNumber.substring(4, 8)}-${legalNumber.substring(8, 10)}`;
  }
  
  return legalNumber;
}

/**
 * STEP 5.5: Build footer message
 * Adds instructions and additional info based on result count
 */
function buildResultsFooter(count: number, isFuzzyMatch: boolean): string {
  let footer = '';
  
  // Message about additional properties
  if (count > 3) {
    footer += `\n📊 وهناك ${count - 3} عقارات أخرى.\n`;
    footer += `\nلرؤية المزيد من التفاصيل، أرسل رقم العقاري (10 أرقام) أو اكتب "المزيد"`;
  } else {
    footer += `\nللمزيد من التفاصيل، أرسل رقم العقاري (10 أرقام)`;
  }
  
  // Add fuzzy match info if applicable
  if (isFuzzyMatch) {
    footer += `\n\n💡 النتائج المعروضة هي الأكثر تطابقاً مع معايير البحث (58% أو أكثر)`;
  }
  
  return footer;
}

/**
 * Handle search errors
 * Returns user-friendly error message
 */
function handleSearchError(error: unknown): string {
  if (error instanceof Error) {
    console.error('Search error details:', error.message);
    throw error; // Re-throw to allow upstream handling
  }
  
  return 'عذراً، حدث خطأ في البحث. يرجى المحاولة مرة أخرى.';
}
