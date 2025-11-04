import { db } from '@/lib/db/operations';
import { extractLegalNumber } from './legalNumberExtractor';

export async function extractPropertyFromContext(userId: string): Promise<string | null> {
  const history = await db.conversations.getHistory(userId);
  
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];
    
    if (message.role === 'user') {
      const legalNumber = extractLegalNumber(message.content);
      if (legalNumber) {
        const property = await db.properties.findByLegalNumber(legalNumber);
        if (property) {
          return property.id;
        }
      }
    }
  }
  
  return null;
}