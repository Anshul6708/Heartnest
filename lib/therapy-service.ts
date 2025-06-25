import { supabase } from './supabase'

export interface TherapySession {
  id: string
  user_id: string | null
  created_at: string
  has_summary: boolean
  summary: string | null
  session_type: 'PILOT' | 'THERAPY'
  partner_names: string | null
}

export interface TherapyMessage {
  id?: string
  session_id: string
  message: string
  role: 'user' | 'assistant'
  name?: string | null
  created_at?: string
  metadata?: Record<string, any>
}

export interface PartnerSummary {
  id?: string
  session_id: string
  partner_name: string
  summary_text: string
  created_at?: string
}

export const therapyService = {
  // Create a new therapy session
  async createTherapySession(partnerNames: string): Promise<TherapySession> {
    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({
          session_type: 'THERAPY',
          partner_names: partnerNames,
          user_id: null // Anonymous sessions
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating therapy session:', error)
        throw new Error(`Failed to create therapy session: ${error.message}`)
      }
      if (!data) {
        throw new Error('No session data returned')
      }
      return data
    } catch (error) {
      console.error('Error in createTherapySession:', error)
      throw error
    }
  },

  // Get therapy session by ID
  async getTherapySession(sessionId: string): Promise<TherapySession | null> {
    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('session_type', 'THERAPY')
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return null // Session not found
        }
        console.error('Error fetching therapy session:', error)
        throw new Error(`Failed to fetch therapy session: ${error.message}`)
      }

      return data
    } catch (error) {
      console.error('Error in getTherapySession:', error)
      throw error
    }
  },

  // Save a therapy message
  async saveTherapyMessage(message: Omit<TherapyMessage, 'id' | 'created_at'>): Promise<TherapyMessage> {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert(message)
        .select()
        .single()

      if (error) {
        console.error('Error saving therapy message:', error)
        throw new Error(`Failed to save therapy message: ${error.message}`)
      }
      if (!data) {
        throw new Error('No message data returned')
      }
      return data
    } catch (error) {
      console.error('Error in saveTherapyMessage:', error)
      throw error
    }
  },

  // Get therapy chat history
  async getTherapyChatHistory(sessionId: string, partnerName?: string): Promise<TherapyMessage[]> {
    try {
      let query = supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })

      const { data, error } = await query

      if (error) {
        console.error('Error fetching therapy chat history:', error)
        throw new Error(`Failed to fetch therapy chat history: ${error.message}`)
      }

      // Filter messages on client side for better control
      let messages = data || []
      
      if (partnerName) {
        // Simple filtering: only messages from this partner or AI responses immediately following
        messages = messages.filter((msg, index) => {
          // Include user messages from this partner
          if (msg.role === 'user' && msg.name === partnerName) {
            return true
          }
          // Include AI responses that follow this partner's messages
          if (msg.role === 'assistant') {
            // Check if the previous message was from this partner
            const prevMsg = messages[index - 1]
            if (prevMsg && prevMsg.role === 'user' && prevMsg.name === partnerName) {
              return true
            }
            // Or if this is the first AI message (conversation starter)
            if (index === 0 || !prevMsg) {
              return true
            }
          }
          return false
        })
      }

      return messages
    } catch (error) {
      console.error('Error in getTherapyChatHistory:', error)
      throw error
    }
  },

  // Save a partner summary
  async savePartnerSummary(summary: Omit<PartnerSummary, 'id' | 'created_at'>): Promise<PartnerSummary> {
    try {
      const { data, error } = await supabase
        .from('summaries')
        .insert(summary)
        .select()
        .single()

      if (error) {
        console.error('Error saving partner summary:', error)
        throw new Error(`Failed to save partner summary: ${error.message}`)
      }
      if (!data) {
        throw new Error('No summary data returned')
      }
      return data
    } catch (error) {
      console.error('Error in savePartnerSummary:', error)
      throw error
    }
  },

  // Get all summaries for a session
  async getSessionSummaries(sessionId: string): Promise<PartnerSummary[]> {
    try {
      const { data, error } = await supabase
        .from('summaries')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error fetching session summaries:', error)
        throw new Error(`Failed to fetch session summaries: ${error.message}`)
      }
      return data || []
    } catch (error) {
      console.error('Error in getSessionSummaries:', error)
      throw error
    }
  },

  // Get summary for a specific partner
  async getPartnerSummary(sessionId: string, partnerName: string): Promise<PartnerSummary | null> {
    try {
      const { data, error } = await supabase
        .from('summaries')
        .select('*')
        .eq('session_id', sessionId)
        .eq('partner_name', partnerName)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return null // Summary not found
        }
        console.error('Error fetching partner summary:', error)
        throw new Error(`Failed to fetch partner summary: ${error.message}`)
      }

      return data
    } catch (error) {
      console.error('Error in getPartnerSummary:', error)
      throw error
    }
  },

  // Get ALL messages for a session (no filtering) - used for checking used partner names
  async getAllSessionMessages(sessionId: string): Promise<TherapyMessage[]> {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error fetching all session messages:', error)
        throw new Error(`Failed to fetch all session messages: ${error.message}`)
      }
      return data || []
    } catch (error) {
      console.error('Error in getAllSessionMessages:', error)
      throw error
    }
  },

  // Check if both partners have summaries
  async checkBothPartnersSummarized(sessionId: string): Promise<boolean> {
    try {
      const summaries = await this.getSessionSummaries(sessionId)
      return summaries.length >= 2
    } catch (error) {
      console.error('Error checking partner summaries:', error)
      return false
    }
  }
} 