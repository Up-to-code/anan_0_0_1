/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from './prisma';
import { 
  Property, 
  SearchQuery, 
  Event, 
  ConversationState, 
  PropertyType, 
  PropertyPurpose,
  EventStatus 
} from '@/types';

export const db = {
  // Property operations
  properties: {
    getAll: async (): Promise<Property[]> => {
      const properties = await prisma.property.findMany({
        orderBy: { createdAt: 'desc' }
      });
      
      return properties.map((p: any) => ({
        id: p.id,
        legalNumber: p.legalNumber,
        type: p.type as PropertyType,
        district: p.district,
        purpose: p.purpose as PropertyPurpose,
        price: p.price,
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms,
        area: p.area,
        pool: p.pool,
        garden: p.garden,
        furnished: p.furnished,
        elevator: p.elevator,
        parking: p.parking,
        description: p.description,
        images: p.images
      }));
    },
    
    findById: async (id: string): Promise<Property | null> => {
      const property = await prisma.property.findUnique({
        where: { id }
      });
      
      if (!property) return null;
      
      return {
        id: property.id,
        legalNumber: property.legalNumber,
        type: property.type as PropertyType,
        district: property.district,
        purpose: property.purpose as PropertyPurpose,
        price: property.price,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        area: property.area,
        pool: property.pool,
        garden: property.garden,
        furnished: property.furnished,
        elevator: property.elevator,
        parking: property.parking,
        description: property.description,
        images: property.images
      };
    },
    
    findByLegalNumber: async (legalNumber: string): Promise<Property | null> => {
      const property = await prisma.property.findUnique({
        where: { legalNumber }
      });
      
      if (!property) return null;
      
      return {
        id: property.id,
        legalNumber: property.legalNumber,
        type: property.type as PropertyType,
        district: property.district,
        purpose: property.purpose as PropertyPurpose,
        price: property.price,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        area: property.area,
        pool: property.pool,
        garden: property.garden,
        furnished: property.furnished,
        elevator: property.elevator,
        parking: property.parking,
        description: property.description,
        images: property.images
      };
    },
    
    search: async (query: SearchQuery): Promise<Property[]> => {
      // Handle both 'area' and 'minArea' for backward compatibility
      const minArea = (query as any).minArea || query.area;
      
      // First try exact match
      const exactMatches = await prisma.property.findMany({
        where: {
          type: query.type || undefined,
          district: query.district || undefined,
          purpose: query.purpose || undefined,
          price: {
            gte: query.minPrice || undefined,
            lte: query.maxPrice || undefined
          },
          bedrooms: query.bedrooms || undefined,
          bathrooms: query.bathrooms || undefined,
          area: minArea ? { gte: minArea } : undefined,
          pool: query.pool ?? undefined,
          garden: query.garden ?? undefined,
          furnished: query.furnished ?? undefined,
          elevator: query.elevator ?? undefined,
          parking: query.parking ?? undefined
        },
        orderBy: { createdAt: 'desc' }
      });

      // If we have exact matches, return them
      if (exactMatches.length > 0) {
        return exactMatches.map((p: any) => ({
          id: p.id,
          legalNumber: p.legalNumber,
          type: p.type as PropertyType,
          district: p.district,
          purpose: p.purpose as PropertyPurpose,
          price: p.price,
          bedrooms: p.bedrooms,
          bathrooms: p.bathrooms,
          area: p.area,
          pool: p.pool,
          garden: p.garden,
          furnished: p.furnished,
          elevator: p.elevator,
          parking: p.parking,
          description: p.description,
          images: p.images
        }));
      }

      // No exact matches - get all properties for fuzzy matching
      // This will be done in the handler with similarity calculation
      return [];
    },
    
    searchWithSimilarity: async (query: SearchQuery): Promise<Property[]> => {
      // Get all properties for similarity matching
      const allProperties = await prisma.property.findMany({
        orderBy: { createdAt: 'desc' }
      });
      
      return allProperties.map((p: any) => ({
        id: p.id,
        legalNumber: p.legalNumber,
        type: p.type as PropertyType,
        district: p.district,
        purpose: p.purpose as PropertyPurpose,
        price: p.price,
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms,
        area: p.area,
        pool: p.pool,
        garden: p.garden,
        furnished: p.furnished,
        elevator: p.elevator,
        parking: p.parking,
        description: p.description,
        images: p.images
      }));
    },
    
    seed: async (): Promise<void> => {
      const count = await prisma.property.count();
      if (count > 0) return;
      
      await prisma.property.createMany({
        data: [
          {
            legalNumber: '1234567890',
            type: 'فيلا',
            district: 'الروضة',
            purpose: 'بيع',
            price: 2500000,
            bedrooms: 4,
            bathrooms: 3,
            area: 350,
            pool: true,
            garden: true,
            furnished: false,
            elevator: false,
            parking: true,
            description: 'فيلا فاخرة في حي الروضة مع مسبح وحديقة',
            images: ['villa1.jpg', 'villa2.jpg']
          },
          {
            legalNumber: '2345678901',
            type: 'شقة',
            district: 'العزيزية',
            purpose: 'إيجار',
            price: 35000,
            bedrooms: 2,
            bathrooms: 1,
            area: 120,
            pool: false,
            garden: false,
            furnished: true,
            elevator: true,
            parking: false,
            description: 'شقة مفروشة في العزيزية قريبة من الخدمات',
            images: ['apt1.jpg', 'apt2.jpg']
          }
        ]
      });
    }
  },
  
  // Event operations
  events: {
    create: async (event: Omit<Event, 'id' | 'timestamp' | 'status'>): Promise<Event> => {
      // Ensure user exists before creating event
      let user = await prisma.user.findUnique({
        where: { phone: event.userId }
      });
      
      if (!user) {
        user = await prisma.user.create({
          data: { phone: event.userId }
        });
      }
      
      const newEvent = await prisma.event.create({
        data: {
          type: event.type,
          details: event.details,
          userId: user.id, // Use user.id instead of event.userId
          pdfFilePath: event.details.pdfFilePath || null
        }
      });
      
      return {
        id: newEvent.id,
        userId: event.userId, // Return phone number for consistency
        type: event.type,
        details: event.details,
        timestamp: newEvent.timestamp.toISOString(),
        status: newEvent.status as EventStatus,
        pdfFilePath: newEvent.pdfFilePath || undefined
      };
    },
    
    updateStatus: async (id: string, status: EventStatus): Promise<boolean> => {
      const result = await prisma.event.update({
        where: { id },
        data: { status }
      });
      
      return !!result;
    },
    
    updatePdfPath: async (id: string, pdfFilePath: string): Promise<boolean> => {
      const result = await prisma.event.update({
        where: { id },
        data: { pdfFilePath }
      });
      
      return !!result;
    }
  },
  
  // Conversation operations
  conversations: {
    getHistory: async (userId: string) => {
      const user = await prisma.user.findUnique({
        where: { phone: userId }
      });
      
      if (!user) return [];
      
      const messages = await prisma.message.findMany({
        where: { userId: user.id },
        orderBy: { timestamp: 'asc' },
        take: 20
      });
      
      return messages.map((m: any) => ({
        id: m.id,
        content: m.content,
        role: m.role as 'user' | 'assistant',
        timestamp: m.timestamp.toISOString()
      }));
    },
    
    addToHistory: async (userId: string, message: { role: 'user' | 'assistant'; content: string }) => {
      let user = await prisma.user.findUnique({
        where: { phone: userId }
      });
      
      if (!user) {
        user = await prisma.user.create({
          data: { phone: userId }
        });
      }
      
      await prisma.message.create({
        data: {
          content: message.content,
          role: message.role,
          userId: user.id
        }
      });
      
      // Clean old messages
      const allMessages = await prisma.message.findMany({
        where: { userId: user.id },
        orderBy: { timestamp: 'desc' }
      });
      
      if (allMessages.length > 20) {
        const messagesToDelete = allMessages.slice(20);
        await prisma.message.deleteMany({
          where: {
            id: { in: messagesToDelete.map((m: any) => m.id) }
          }
        });
      }
    },
    
    getState: async (userId: string): Promise<ConversationState | null> => {
      const user = await prisma.user.findUnique({
        where: { phone: userId }
      });
      
      if (!user) return null;
      
      const state = await prisma.conversationState.findUnique({
        where: { userId: user.id }
      });
      
      if (!state) {
        return {
          userId,
          currentStep: 'initial',
          context: {}
        };
      }
      
      return {
        userId,
        currentStep: state.step as ConversationState['currentStep'],
        context: state.context as Record<string, unknown>,
        lastPropertyId: state.lastPropertyId || undefined,
        lastSearchQuery: state.lastSearchQuery as SearchQuery | undefined
      };
    },
    
    updateState: async (state: ConversationState): Promise<void> => {
      let user = await prisma.user.findUnique({
        where: { phone: state.userId }
      });
      
      if (!user) {
        user = await prisma.user.create({
          data: { phone: state.userId }
        });
      }
      
      await prisma.conversationState.upsert({
        where: { userId: user.id },
        update: {
          step: state.currentStep,
          context: state.context,
          lastPropertyId: state.lastPropertyId || null,
          lastSearchQuery: state.lastSearchQuery || null
        },
        create: {
          userId: user.id,
          step: state.currentStep,
          context: state.context,
          lastPropertyId: state.lastPropertyId || null,
          lastSearchQuery: state.lastSearchQuery || null
        }
      });
    }
  }
};