/* eslint-disable @typescript-eslint/no-explicit-any */
import { SearchQuery } from "./property.types";

export interface Event {
    id: string;
    userId: string;
    type: EventType;
    status: EventStatus;
    details: Record<string, any>;
    timestamp: string;
    pdfFilePath?: string;
  }
  
  export type EventType = 
    | 'property_searched'
    | 'property_viewed'
    | 'pdf_generated'
    | 'viewing_scheduled'
    | 'callback_requested';
  
  export type EventStatus = 'pending' | 'completed' | 'cancelled';
  
  export interface AIResponse {
    type: 'answer' | 'search' | 'event';
    content?: string;
    query?: SearchQuery;
    event?: {
      eventId: string;
      details: {
        action: string;
        info: Record<string, any>;
      };
    };
  }