/* eslint-disable @typescript-eslint/no-explicit-any */
import { SearchQuery } from "./property.types";

export interface Message {
    id: string;
    content: string;
    role: 'user' | 'assistant';
    timestamp: string;
  }
  
  export interface ConversationState {
    userId: string;
    currentStep: ConversationStep;
    context: Record<string, any>;
    lastPropertyId?: string;
    lastSearchQuery?: SearchQuery;
  }
  
  export type ConversationStep = 
    | 'initial'
    | 'searching'
    | 'property_selected'
    | 'pdf_requested'
    | 'viewing_requested'
    | 'callback_requested'
    | 'completed';
  
  export interface WhatsAppMessage {
    id: string;
    from: string;
    to?: string;
    type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'contacts' | 'interactive' | 'button' | 'list' | 'order' | 'system' | 'unknown';
    text?: {
      body: string;
    };
    interactive?: {
      type: 'button_reply' | 'list_reply' | 'nfm_reply' | 'product' | 'product_list' | 'order';
      button_reply?: {
        id: string;
        title: string;
      };
      list_reply?: {
        id: string;
        title: string;
        description?: string;
      };
      nfm_reply?: {
        response_json?: Record<string, unknown>;
        body?: string;
      };
    };
    button?: {
      text: string;
      payload: string;
    };
    timestamp: string;
  }