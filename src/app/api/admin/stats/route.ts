import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  try {
    const [users, messages, events, properties] = await Promise.all([
      prisma.user.count(),
      prisma.message.count(),
      prisma.event.count(),
      prisma.property.count()
    ]);

    const recentEvents = await prisma.event.findMany({
      take: 10,
      orderBy: { timestamp: 'desc' },
      include: {
        user: {
          select: {
            phone: true,
            name: true
          }
        }
      }
    });

    const recentMessages = await prisma.message.findMany({
      take: 10,
      orderBy: { timestamp: 'desc' },
      include: {
        user: {
          select: {
            phone: true,
            name: true
          }
        }
      }
    });

    return NextResponse.json({
      stats: {
        users,
        messages,
        events,
        properties,
        searches: (await prisma.event.count({ where: { type: 'property_searched' } }))
      },
      recentEvents,
      recentMessages
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}

