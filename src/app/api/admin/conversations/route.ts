import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const phone = searchParams.get('phone');
    const limit = parseInt(searchParams.get('limit') || '50');

    if (phone) {
      const user = await prisma.user.findUnique({
        where: { phone },
        include: {
          messages: {
            orderBy: { timestamp: 'desc' },
            take: limit
          },
          conversationState: true,
          events: {
            orderBy: { timestamp: 'desc' },
            take: 10
          }
        }
      });

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      return NextResponse.json({ user });
    }

    const users = await prisma.user.findMany({
      include: {
        _count: {
          select: {
            messages: true,
            events: true
          }
        },
        conversationState: true
      },
      orderBy: { updatedAt: 'desc' },
      take: 100
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}

