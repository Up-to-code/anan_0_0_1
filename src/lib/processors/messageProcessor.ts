/* eslint-disable @typescript-eslint/no-explicit-any */
import { WhatsAppMessage } from '@/types';
import { db } from '@/lib/db/operations';
import { parseAIResponse, getReactionForMessage, isPdfRequest } from '@/lib/utils/messageUtils';
import { extractLegalNumber } from '@/lib/utils/legalNumberExtractor';
import { handlePropertySearchEvent } from '@/lib/handlers/searchHandlers';
import { handlePdfRequest } from '@/lib/handlers/pdfHandlers';
import { handleViewingScheduledEvent, handleCallbackRequestedEvent, handlePdfGeneratedEvent } from '@/lib/handlers/eventHandlers';
import { ConversationFlow } from '@/lib/components/conversationFlow';
import { ResponseBuilder } from '@/lib/components/responseBuilder';
 import { REAL_ESTATE_PROMPT } from '@/lib/config/onfig/ai';
import { createAIWithPrompt } from '../config/ai';

export async function processMessage(message: WhatsAppMessage, handler: any): Promise<void> {
  // ==========================================
  // STEP 0: Validate inputs
  // ==========================================
  // Assertions
  if (!message) {
    throw new Error('Message is required');
  }
  
  if (!message.from) {
    throw new Error('Message must have a from field');
  }
  
  if (!handler) {
    throw new Error('Handler is required');
  }
  
  try {
    // ==========================================
    // STEP 1: Mark message as read (backup)
    // ==========================================
    // Note: Mark as read is now handled in the route handler immediately when message arrives
    // This is kept here as a backup/fallback
    if (message.id) {
      console.log('🔄 Backup mark as read attempt for:', message.id);
      await handler.markAsRead(message.id).catch((err: any) => {
        console.error('Failed to mark message as read (backup attempt):', err);
      });
    }

    // ==========================================
    // STEP 2: Extract message content
    // ==========================================
    // Extract message content based on message type
    let userMessage: string | null = null;
    
    if (message.type === 'text' && message.text?.body) {
      userMessage = message.text.body.trim();
    } else if (message.type === 'interactive') {
      // Handle interactive messages (button/list replies)
      const msg = message as WhatsAppMessage & { interactive?: { button_reply?: { title: string }; list_reply?: { title: string } } };
      if (msg.interactive?.button_reply?.title) {
        userMessage = msg.interactive.button_reply.title;
      } else if (msg.interactive?.list_reply?.title) {
        userMessage = msg.interactive.list_reply.title;
      }
    } else if (message.type === 'button') {
      const msg = message as WhatsAppMessage & { button?: { text: string } };
      if (msg.button?.text) {
        userMessage = msg.button.text;
      }
    }
    
    // If no valid message content found, skip processing
    if (!userMessage || userMessage === '') {
      console.log('⏭️ Skipping message - no valid content:', {
        type: message.type,
        hasText: !!message.text?.body,
        hasInteractive: !!(message as WhatsAppMessage & { interactive?: unknown }).interactive
      });
      return;
    }

    // ==========================================
    // STEP 3: Initialize conversation flow
    // ==========================================
    const from = message.from;
    console.log(`📨 Received message from ${from}: ${userMessage.substring(0, 50)}...`);

    // Initialize conversation flow
    const flow = new ConversationFlow(from);
    await flow.initialize();

    // ==========================================
    // STEP 4: Add user message to history
    // ==========================================
    await db.conversations.addToHistory(from, {
      role: 'user',
      content: userMessage
    });

    // ==========================================
    // STEP 5: Check for legal number (direct property lookup)
    // ==========================================
    const legalNumber = extractLegalNumber(userMessage);
    if (legalNumber) {
      const property = await db.properties.findByLegalNumber(legalNumber);
      
      if (property) {
        const responseContent = ResponseBuilder.propertyDetails(property);
        
        await db.conversations.addToHistory(from, {
          role: 'assistant',
          content: responseContent
        });

        await sendResponse(from, responseContent, message.id, handler);
        await sendReaction(from, message.id, userMessage, handler);
        
        // Update flow state
        flow.updateContext('lastPropertyId', property.id);
        await flow.nextStep('property_view');
        return;
      } else {
        const responseContent = ResponseBuilder.propertyNotFound(legalNumber);
        
        await db.conversations.addToHistory(from, {
          role: 'assistant',
          content: responseContent
        });

        await sendResponse(from, responseContent, message.id, handler);
        await sendReaction(from, message.id, userMessage, handler);
        return;
      }
    }

    // ==========================================
    // STEP 6: Check for PDF request
    // ==========================================
    if (isPdfRequest(userMessage)) {
      const responseContent = await handlePdfRequest(from, userMessage);
      
      await db.conversations.addToHistory(from, {
        role: 'assistant',
        content: responseContent
      });

      await sendResponse(from, responseContent, message.id, handler);
      await sendReaction(from, message.id, userMessage, handler);
      
      await flow.nextStep('pdf_request');
      return;
    }

    // ==========================================
    // STEP 7: Process with AI
    // ==========================================
    console.log('🤖 Processing with AI...');
    const history = await db.conversations.getHistory(from);
    console.log(`📚 Conversation history: ${history.length} messages`);
    
    const ai = createAIWithPrompt(REAL_ESTATE_PROMPT);

    // Add conversation history to AI context
    history.forEach((msg : any) => {
      if (msg.role === 'user') {
        ai.addUserMessage(msg.content);
      } else {
        ai.addAssistantMessage(msg.content);
      }
    });

    // ==========================================
    // STEP 8: Get AI response
    // ==========================================
    console.log('🔄 Streaming AI response...');
    let aiResponse = '';
    await ai.stream((chunk: string) => {
      aiResponse += chunk;
    }, { cache: true });
    
    console.log(`✅ AI response received (${aiResponse.length} chars):`, aiResponse.substring(0, 200));

    // ==========================================
    // STEP 9: Parse AI response
    // ==========================================
    const parsedResponse = parseAIResponse(aiResponse);
    console.log('📋 Parsed response type:', parsedResponse.type);
    
    // ==========================================
    // STEP 10: Process based on response type
    // ==========================================
    let responseContent = '';
    
    switch (parsedResponse.type) {
      case 'search':
        // ==========================================
        // STEP 10.1: Handle search request
        // - Call search handler
        // - Handler will perform search and format results
        // - Results will be returned as formatted message string
        // ==========================================
        console.log('🔍 Processing search query...');
        responseContent = await handlePropertySearchEvent(from, parsedResponse.query!);
        await flow.nextStep('search');
        break;
        
      case 'event':
        // ==========================================
        // STEP 10.2: Handle event request (PDF, viewing, callback)
        // ==========================================
        console.log('🎯 Processing event...');
        responseContent = await handleEventByType(from, parsedResponse.event!);
        break;
        
      default:
        // ==========================================
        // STEP 10.3: Use AI response as regular conversation
        // ==========================================
        console.log('💬 Using AI response as answer');
        responseContent = parsedResponse.content || '';
    }
    
    // ==========================================
    // STEP 11: Validate response content
    // ==========================================
    if (!responseContent || responseContent.trim() === '') {
      console.error('❌ Empty response content from AI, using fallback');
      responseContent = 'عذراً، لم أتمكن من معالجة طلبك. يرجى المحاولة مرة أخرى.';
    }
    
    // ==========================================
    // STEP 12: Save response to conversation history
    // ==========================================
    await db.conversations.addToHistory(from, {
      role: 'assistant',
      content: responseContent
    });

    // ==========================================
    // STEP 13: Send response message to user
    // This is where search results are sent as WhatsApp message
    // The formatted search results string is sent here
    // ==========================================
    await sendResponse(from, responseContent, message.id, handler);
    
    // ==========================================
    // STEP 14: Send reaction emoji
    // ==========================================
    await sendReaction(from, message.id, userMessage, handler);
  } catch (error) {
    console.error('Error processing WhatsApp message:', error);
    await sendErrorMessage(message, handler);
  }
}

async function handleEventByType(userId: string, event: any): Promise<string> {
  console.log('🎯 Handling event by type:', event);
  
  try {
    const { action, info } = event.details || {};
    console.log('📋 Event action:', action, 'info:', info);
    
    switch (action) {
      case 'schedule_viewing':
        console.log('📅 Scheduling viewing...');
        return await handleViewingScheduledEvent(
          userId, 
          info.propertyId, 
          info.appointmentDate, 
          info.appointmentTime
        );
      case 'request_callback':
        console.log('📞 Requesting callback...');
        return await handleCallbackRequestedEvent(userId, info.notes);
      case 'generate_pdf':
        console.log('📄 Generating PDF...');
        if (info.propertyId) {
          return await handlePdfGeneratedEvent(userId, info.propertyId);
        }
        
        if (info.legalNumber) {
          const property = await db.properties.findByLegalNumber(info.legalNumber);
          if (property) {
            return await handlePdfGeneratedEvent(userId, property.id);
          }
        }
        
        return 'عذراً، لم أتمكن من تحديد العقار الذي تريده. يرجى تحديد العقار برقمه العقاري (10 أرقام) بشكل أوضح.';
      default:
        console.warn('⚠️ Unknown event action:', action);
        return 'تم استلام طلبك. سنتواصل معك قريباً.';
    }
  } catch (error) {
    console.error('❌ Error handling event:', error);
    return 'عذراً، حدث خطأ في معالجة طلبك. يرجى المحاولة مرة أخرى.';
  }
}

async function sendResponse(
  from: string,
  content: string,
  messageId: string,
  handler: any
): Promise<void> {
  // Assertions
  if (!from || typeof from !== 'string') {
    throw new Error('Invalid from: must be a non-empty string');
  }
  
  if (!content || typeof content !== 'string') {
    throw new Error('Invalid content: must be a non-empty string');
  }
  
  if (!messageId || typeof messageId !== 'string') {
    throw new Error('Invalid messageId: must be a non-empty string');
  }
  
  if (!handler) {
    throw new Error('Handler is required');
  }
  
  // Validate content before sending
  if (!content || content.trim() === '') {
    console.error('❌ Cannot send empty response to', from);
    return;
  }
  
  console.log(`📤 Sending AI reply to ${from}...`);
  try {
    const sendResult = await handler.sendReply(from, content, messageId);
    console.log(`✅ Reply sent successfully. ID: ${sendResult.messages[0]?.id}`);
  } catch (error) {
    console.error('❌ Failed to send response:', error);
    throw error; // Re-throw to allow error handling upstream
  }
}

async function sendReaction(
  from: string,
  messageId: string,
  userMessage: string,
  handler: any
): Promise<void> {
  const reaction = getReactionForMessage(userMessage);
  
  if (!reaction) return;
  
  try {
    await handler.sendReaction(from, messageId, reaction);
    console.log(`${reaction} Reacted to message`);
  } catch (reactError) {
    console.error('Failed to send reaction:', reactError);
  }
}

async function sendErrorMessage(message: WhatsAppMessage, handler: any): Promise<void> {
  try {
    const errorMessage = ResponseBuilder.errorMessage();
    
    // Validate error message before sending
    if (!errorMessage || errorMessage.trim() === '') {
      console.error('❌ Error message is empty, using fallback');
      return;
    }
    
    if (message.id && message.from) {
      await handler.sendReply(message.from, errorMessage, message.id);
    } else if (message.from) {
      await handler.sendMessage(message.from, errorMessage);
    } else {
      console.error('❌ Cannot send error message: missing from field');
    }
  } catch (sendError) {
    console.error('❌ Failed to send error message:', sendError);
    if (sendError instanceof Error) {
      console.error('Error details:', sendError.message, sendError.stack);
    }
  }
}