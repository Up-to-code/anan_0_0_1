import { Property } from '@/types';
import { formatLegalNumber } from '@/lib/utils/legalNumberExtractor';

export class ResponseBuilder {
  static propertyDetails(property: Property): string {
    return `تم العثور على العقار:\n\n${property.type} في ${property.district}\nرقم العقاري: ${formatLegalNumber(property.legalNumber)}\nالسعر: ${property.price.toLocaleString()} ريال\n${property.bedrooms ? `${property.bedrooms} غرف نوم` : ''}\n${property.area ? `مساحة: ${property.area}م²` : ''}\n\n${property.description}\n\nهل تريد مزيد من المعلومات أو حجز معاينة؟`;
  }
  
  static propertyNotFound(legalNumber: string): string {
    return `لم يتم العثور على عقار بالرقم العقاري ${formatLegalNumber(legalNumber)}. يرجى التحقق من الرقم أو البحث عن عقار آخر.`;
  }
  
  static clarificationRequest(): string {
    return 'عن أي عقار تريد ملف PDF؟ يرجى تحديد العقار برقمه العقاري (10 أرقام) أو من القائمة السابقة.';
  }
  
  static searchResults(properties: Property[]): string {
    if (properties.length === 0) {
      return 'لم يتم العثور على عقارات تطابق معايير البحث. هل ترغب في تعديل البحث؟';
    }
    
    let response = `تم العثور على ${properties.length} عقار:\n\n`;
    
    properties.slice(0, 3).forEach((property, index) => {
      response += `${index + 1}. ${property.type} في ${property.district}\n`;
      response += `   رقم العقاري: ${formatLegalNumber(property.legalNumber)}\n`;
      response += `   السعر: ${property.price.toLocaleString()} ريال\n`;
      response += `   ${property.bedrooms ? `${property.bedrooms} غرف نوم` : ''}\n`;
      response += `   ${property.area ? `مساحة: ${property.area}م²` : ''}\n`;
      response += `   ${property.description}\n\n`;
    });
    
    if (properties.length > 3) {
      response += `وهناك ${properties.length - 3} عقارات أخرى. هل ترغب في رؤية المزيد؟`;
    }
    
    return response;
  }
  
  static errorMessage(): string {
    return 'عذراً، حدث خطأ في معالجة رسالتك. يرجى المحاولة مرة أخرى لاحقاً.';
  }
}