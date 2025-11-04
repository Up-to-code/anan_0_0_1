export function extractLegalNumber(message: string): string | null {
    const legalNumberPattern = /\b(\d{10})\b/g;
    const matches = message.match(legalNumberPattern);
    
    if (matches && matches.length > 0) {
      return matches[0];
    }
    
    const withPrefixPattern = /(?:رقم العقار|العقار رقم|عقار رقم)\s*[:\s]*(\d{10})/i;
    const prefixMatch = message.match(withPrefixPattern);
    
    if (prefixMatch) {
      return prefixMatch[1];
    }
    
    const simplePattern = /(?:عقار)\s*(\d{10})/i;
    const simpleMatch = message.match(simplePattern);
    
    if (simpleMatch) {
      return simpleMatch[1];
    }
    
    return null;
  }
  
  export function hasLegalNumber(message: string): boolean {
    return extractLegalNumber(message) !== null;
  }
  
  export function formatLegalNumber(legalNumber: string): string {
    if (legalNumber.length === 10) {
      return `${legalNumber.substring(0, 4)}-${legalNumber.substring(4, 8)}-${legalNumber.substring(8, 10)}`;
    }
    return legalNumber;
  }