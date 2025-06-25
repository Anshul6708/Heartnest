import { NextRequest, NextResponse } from 'next/server'
import { therapyService } from '@/lib/therapy-service'

export async function POST(request: NextRequest) {
  try {
    const { partnerNames } = await request.json()

    if (!partnerNames || typeof partnerNames !== 'string') {
      return NextResponse.json(
        { error: 'Partner names are required' },
        { status: 400 }
      )
    }

    const session = await therapyService.createTherapySession(partnerNames)

    return NextResponse.json({
      sessionId: session.id,
      partnerNames: session.partner_names
    })
  } catch (error) {
    console.error('Error creating therapy session:', error)
    return NextResponse.json(
      { error: 'Failed to create therapy session' },
      { status: 500 }
    )
  }
} 