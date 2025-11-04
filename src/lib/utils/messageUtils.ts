import { AIResponse, SearchQuery } from '@/types';

export function parseAIResponse(response: string): AIResponse {
  console.log('🔍 Parsing AI response:', response.substring(0, 200));
  
  // Clean response - remove markdown code blocks if present
  let cleanedResponse = response.trim();
  if (cleanedResponse.startsWith('```json')) {
    cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  } else if (cleanedResponse.startsWith('```')) {
    cleanedResponse = cleanedResponse.replace(/```\n?/g, '').trim();
  }
  
  // Try to parse as JSON first
  try {
    const parsed = JSON.parse(cleanedResponse);
    console.log('✅ Parsed as JSON:', parsed);
    
    // Check for search query (has type/district/purpose fields)
    if (parsed.type || parsed.district || parsed.purpose || parsed.minPrice || parsed.maxPrice || parsed.bedrooms) {
      console.log('📊 Detected as SEARCH query');
      return {
        type: 'search',
        query: parsed as SearchQuery
      };
    }
    
    // Check for event (has eventId or type === 'event')
    if (parsed.eventId || parsed.type === 'event' || parsed.details?.action) {
      console.log('🎯 Detected as EVENT');
      return {
        type: 'event',
        event: parsed
      };
    }
    
    // Check for answer with content field
    if (parsed.content) {
      console.log('💬 Detected as ANSWER with content');
      return {
        type: 'answer',
        content: parsed.content
      };
    }
    
    // If parsed but doesn't match any type, treat as answer
    console.log('⚠️ JSON parsed but doesn\'t match any type, treating as answer');
    return {
      type: 'answer',
      content: response
    };
  } catch (e) {
    // Not JSON - treat as plain text answer
    console.log('💬 Not JSON, treating as plain text answer');
    return {
      type: 'answer',
      content: cleanedResponse
    };
  }
}

export function getReactionForMessage(message: string): string | null {
  const messageLower = message.toLowerCase().trim();
  
  const isThanks = /^(thanks|thank you|ty|thank u|thx|tnx|شكر|شكرا)$/i.test(messageLower);
  const isPositive = /^(yes|yeah|yep|yup|sure|great|awesome|nice|cool|perfect|excellent|amazing|love it|نعم|تمام|ممتاز|رائع)$/i.test(messageLower);
  const isAcknowledgment = /^(ok|okay|got it|understood|alright|sounds good|حسنا|فهمت|مقبول)$/i.test(messageLower);
  const isQuestion = /\?|؟/.test(message);

  if (isThanks) return '❤️';
  if (isPositive) return '👍';
  if (isAcknowledgment) return '✅';
  if (isQuestion) return '🤔';
  
  return null;
}

export function isPdfRequest(message: string): boolean {
  const pdfKeywords = [
    'pdf', 'بي دي اف', 'ملف pdf', 'تفاصيل', 'معلومات',
    'بروشور', 'كتيب', 'نشرة', 'تفاصيل العقار', 'معلومات العقار',
    'صور', 'صور العقار', 'نشره', 'ملف', 'تفاصيل أكثر'
  ];
  
  const lowerMessage = message.toLowerCase();
  return pdfKeywords.some(keyword => lowerMessage.includes(keyword));
}