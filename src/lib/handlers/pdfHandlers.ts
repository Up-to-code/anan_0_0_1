import { handlePdfGeneratedEvent } from './eventHandlers';
import { extractPropertyFromContext } from '@/lib/utils/propertyContext';
import { extractLegalNumber } from '@/lib/utils/legalNumberExtractor';
import { db } from '@/lib/db/operations';

export async function handlePdfRequest(userId: string, message: string): Promise<string> {
  const legalNumber = extractLegalNumber(message);
  let propertyId = null;
  
  if (legalNumber) {
    const property = await db.properties.findByLegalNumber(legalNumber);
    if (property) {
      propertyId = property.id;
    }
  }
  
  if (!propertyId) {
    propertyId = await extractPropertyFromContext(userId);
  }
  
  if (propertyId) {
    return await handlePdfGeneratedEvent(userId, propertyId);
  }
  
  return 'عن أي عقار تريد ملف PDF؟ يرجى تحديد العقار برقمه العقاري (10 أرقام) أو من القائمة السابقة.';
}