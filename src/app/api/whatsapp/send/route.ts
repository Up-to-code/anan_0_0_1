import { NextRequest, NextResponse } from 'next/server';
import { getDefaultWhatsAppHandler } from '@/lib/config/whatsapp';

/**
 * POST - Send WhatsApp message
 */
export async function POST(request: NextRequest) {
  try {
    const { to, message, previewUrl } = await request.json();

    if (!to || !message) {
      return NextResponse.json(
        { error: 'To and message are required' },
        { status: 400 }
      );
    }

    const handler = getDefaultWhatsAppHandler();
    const result = await handler.sendMessage(to, message, previewUrl || false);

    return NextResponse.json({
      success: true,
      messageId: result.messages[0]?.id,
      result,
    });
  } catch (error: unknown) {
    console.error('Send message error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

