import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { therapyService, type TherapyMessage } from '@/lib/therapy-service'

// Function to create personalized prompts with actual partner names
const createPartner1Prompt = (partnerName: string, otherPartnerName: string) => `You are a warm, emotionally intelligent friend who supports ${partnerName} through relationship issues with empathy and honesty. You listen closely, respond casually (like a close friend), and speak in a grounded, non-clinical tone. Blend English and Hinglish naturally, depending on the emotional tone.

Your core role:
- Help ${partnerName} reflect on their feelings, needs, and relationship dynamics with ${otherPartnerName}.
- Ask thoughtful questions (1–2 lines max) based on what they share.
- Validate emotions gently, but don't shy away from offering honest perspectives or challenging assumptions when needed.

Avoid giving generic advice. Always ask for real-life examples, texts, or context to understand their situation better.

Be okay sitting with uncertainty — say "I don't know" if needed, like a real friend would.

Tone and language:
- Never sound like a therapist or life coach.
- Speak like a caring, real friend who "gets it." Use emotionally grounded language; avoid being overly positive, preachy, or robotic.
- Keep responses short and human — max 1–2 lines per reply.
- Blend Hinglish where it fits naturally; keep it casual and intuitive.

Conversation structure:
- Every 10 user replies, summarize what you've understood about ${partnerName}'s perspective so far in 3–5 lines. Start this summary with, "Here's what I have understood so far from your perspective".
- Suggest what you'd want to know from ${otherPartnerName} in the situation to help move things forward.
- Nudge deeper exploration through real behaviors and past patterns — not vague hypotheticals.`

const createPartner2Prompt = (partnerName: string, otherPartnerName: string) => `You are a warm, emotionally intelligent AI friend acting as a gentle mediator between ${otherPartnerName} and ${partnerName}. You've already spoken to ${otherPartnerName} and understood their side deeply. Now, your job is to understand ${partnerName} just as thoughtfully — with care, curiosity, and honesty.

You're not here to give advice or judge. You're here to create emotional clarity between ${partnerName} and ${otherPartnerName} who may be hurting, confused, or stuck. Be soft, real, and grounded — like a common friend who wants to help both be seen and heard.

Instructions:

-Start the conversation with this:
- "Hey ${partnerName}, I've already spoken to ${otherPartnerName}. Here's what I understand about their perspective:
- [Insert summary of ${otherPartnerName}'s emotional experience here — keep it honest, non-blaming, and emotionally grounded.]
- Now I'd love to hear from you. What's been going on from your side?"

Let ${partnerName} share freely. Don't interrupt with long replies.

-Ask short, thoughtful follow-ups (1–2 lines max). Focus on uncovering:
- their emotions
- what they’ve been needing
- what they’ve been hurt or confused by
- how they’ve seen User 1’s actions
- what made them shut down or pull back
- what they still care about, if anything

Tone guidelines:

- Use a casual, warm tone (mix Hinglish + English if it fits naturally).
- No clinical language.
- No therapy vibes.
- Don’t preach or solve — just help them reflect honestly.

At the end of 10 user replies, generate a summary with 2 parts:

- “Here’s what I’ve understood about your side of the story:”
(Write a 4–5 line emotionally clear summary from ${partnerName}'sview.)

- "What feels like the next step now?"
(Offer a thoughtful suggestion — either for reflection, a conversation between ${otherPartnerName} and ${partnerName}, or something each can sit with.)`

// We'll detect summaries by format instead of generating them separately
// Partner 2's AI acts as the mediator/solution provider

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    const { sessionId, partnerName, message, messages } = await request.json()

    if (!sessionId || !partnerName || !message) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get session data to determine partner order
    const session = await therapyService.getTherapySession(sessionId)
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    // Determine if this is Partner 1 or Partner 2 based on partner_names order
    const partnerNames = session.partner_names?.split(' & ') || []
    const isPartner1 = partnerNames[0] === partnerName
    const otherPartnerName = partnerNames.find(name => name !== partnerName) || 'your partner'
    
    // Create personalized prompts with actual names
    let selectedPrompt = isPartner1 
      ? createPartner1Prompt(partnerName, otherPartnerName)
      : createPartner2Prompt(partnerName, otherPartnerName)
    
    // For Partner 2, check if Partner 1 has a summary to include
    if (!isPartner1 && message === "START_CONVERSATION") {
      const partner1Summary = await therapyService.getPartnerSummary(sessionId, otherPartnerName)
      if (partner1Summary) {
        selectedPrompt = `${selectedPrompt}

Start the conversation with ${partnerName}'s perspective:
"Hey ${otherPartnerName}, I've already spoken to ${partnerName}. Here's what I understand about their perspective:

${partner1Summary.summary_text}

Now I'd love to hear from you. What's been going on from your side?"`
      }
    }

    // We'll detect summaries from the AI response format instead of counting messages

    // Filter conversation history to only this partner's messages
    const partnerOnlyMessages = messages.filter((msg: TherapyMessage) => 
      msg.name === partnerName || (msg.role === 'assistant' && (msg.name === null || msg.name === partnerName))
    )
    
    const conversationHistory = partnerOnlyMessages.map((msg: TherapyMessage) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.message
    }))

    // Handle special START_CONVERSATION case
    const chatMessages = message === "START_CONVERSATION" 
      ? [
          {
            role: 'system',
            content: selectedPrompt
          },
          {
            role: 'user',
            content: "Please start the conversation"
          }
        ]
      : [
          {
            role: 'system',
            content: selectedPrompt
          },
          ...conversationHistory,
          {
            role: 'user',
            content: message
          }
        ]

    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: chatMessages as any,
      max_tokens: 500,
    })

    const aiResponse = chatCompletion.choices[0]?.message?.content || "I'm here to help you work through this."

    let summary = null

    // Detect summary by format in the AI response
    const summaryMarkers = [
      "Here's what I've understood about your side of the story:",
      "Here's what I've understood about their perspective so far",
      "what I've understood about your perspective so far",
      "Here's what I have understood so far from your perspective"
    ]

    const hasSummaryFormat = summaryMarkers.some(marker => 
      aiResponse.toLowerCase().includes(marker.toLowerCase())
    )

    if (hasSummaryFormat) {
      // Extract the summary content from the AI response
      summary = aiResponse
    }

    return NextResponse.json({
      message: aiResponse,
      summary
    })

  } catch (error) {
    console.error('Error in therapy chat:', error)
    return NextResponse.json(
      { error: 'Failed to process therapy chat' },
      { status: 500 }
    )
  }
} 
