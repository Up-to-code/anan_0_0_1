import { db } from '@/lib/db/operations';
import { generatePropertyPDF } from '@/lib/utils/pdfGenerator';
import { formatLegalNumber } from '@/lib/utils/legalNumberExtractor';

export async function handlePdfGeneratedEvent(userId: string, propertyId: string): Promise<string> {
  const event = await db.events.create({
    userId,
    type: 'pdf_generated',
    details: { propertyId }
  });
  
  const property = await db.properties.findById(propertyId);
  if (!property) {
    await db.events.updateStatus(event.id, 'cancelled');
    return 'عذراً، لم يتم العثور على العقار المحدد.';
  }
  
  const pdfResult = await generatePropertyPDF(propertyId);
  
  if (!pdfResult.success) {
    await db.events.updateStatus(event.id, 'cancelled');
    return 'عذراً، حدث خطأ في إنشاء ملف PDF. يرجى المحاولة مرة أخرى.';
  }
  
  await db.events.updateStatus(event.id, 'completed');
  if (pdfResult.filePath) {
    await db.events.updatePdfPath(event.id, pdfResult.filePath);
  }
  
  return `تم إنشاء ملف PDF لمعلومات العقار (${property.type} في ${property.district}) برقم العقاري ${formatLegalNumber(property.legalNumber)}. سيتم إرساله إليك قريباً.\n\nملف PDF: ${pdfResult.filePath}`;
}

export async function handleViewingScheduledEvent(
  userId: string, 
  propertyId: string, 
  appointmentDate: string, 
  appointmentTime: string
): Promise<string> {
  const event = await db.events.create({
    userId,
    type: 'viewing_scheduled',
    details: { propertyId, appointmentDate, appointmentTime }
  });
  
  const property = await db.properties.findById(propertyId);
  if (!property) {
    await db.events.updateStatus(event.id, 'cancelled');
    return 'عذراً، لم يتم العثور على العقار المحدد.';
  }
  
  await db.events.updateStatus(event.id, 'completed');
  
  return `تم حجز معاينة العقار (${property.type} في ${property.district}) برقم العقاري ${formatLegalNumber(property.legalNumber)} في تاريخ ${appointmentDate} الساعة ${appointmentTime}. سنتواصل معك قريباً لتأكيد الموعد.`;
}

export async function handleCallbackRequestedEvent(userId: string, notes: string): Promise<string> {
  const event = await db.events.create({
    userId,
    type: 'callback_requested',
    details: { notes }
  });
  
  await db.events.updateStatus(event.id, 'completed');
  
  return 'تم استلام طلبك. سيتواصل معك فريقنا في أقرب وقت ممكن.';
}