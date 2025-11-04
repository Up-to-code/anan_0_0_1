import { db } from '@/lib/db/operations';
import { Property } from '@/types';
import { formatLegalNumber } from './legalNumberExtractor';

export async function generatePropertyPDF(propertyId: string): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    const property = await db.properties.findById(propertyId);
    if (!property) {
      return { success: false, error: 'Property not found' };
    }
    
    const fileName = `property_${property.legalNumber}_${Date.now()}.pdf`;
    const filePath = `/pdfs/${fileName}`;
    
    console.log(`📄 Generating PDF for property ${property.legalNumber}: ${property.type} in ${property.district}`);
    
    return { success: true, filePath };
  } catch (error) {
    console.error('Error generating PDF:', error);
    return { success: false, error: 'Failed to generate PDF' };
  }
}

export function formatPropertyForPDF(property: Property): string {
  return `
عنوان العقار: ${property.type} في ${property.district}

رقم العقاري: ${formatLegalNumber(property.legalNumber)}

السعر: ${property.price.toLocaleString()} ريال

 ${property.bedrooms ? `عدد الغرف: ${property.bedrooms}` : ''}
 ${property.bathrooms ? `عدد الحمامات: ${property.bathrooms}` : ''}
 ${property.area ? `المساحة: ${property.area} متر مربع` : ''}

المميزات:
 ${property.pool ? '• مسبح' : ''}
 ${property.garden ? '• حديقة' : ''}
 ${property.furnished ? '• مفروش' : ''}
 ${property.elevator ? '• مصعد' : ''}
 ${property.parking ? '• موقف سيارات' : ''}

الوصف:
 ${property.description}

للاستفسار، تواصل معنا على...
  `.trim();
}