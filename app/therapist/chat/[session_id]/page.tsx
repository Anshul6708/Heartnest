'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { PaperAirplaneIcon } from '@heroicons/react/24/solid'
import { therapyService, type TherapySession, type TherapyMessage, type PartnerSummary } from '@/lib/therapy-service'
import dynamic from 'next/dynamic'

type Partner = {
  name: string
  summary?: PartnerSummary
  isUsed?: boolean
}

function TherapyChatPageComponent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const sessionId = params.session_id as string
  const isNewUser = searchParams.get('new') === 'true'
  const [session, setSession] = useState<TherapySession | null>(null)
  const [partners, setPartners] = useState<Partner[]>([])
  const [selectedPartner, setSelectedPartner] = useState<string | null>(null)
  const [messages, setMessages] = useState<TherapyMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)
  const [otherPartnerSummary, setOtherPartnerSummary] = useState<PartnerSummary | null>(null)
  const [hasStartedChatting, setHasStartedChatting] = useState(false)
  const [currentPartnerCompleted, setCurrentPartnerCompleted] = useState(false)
  const [userTypeReady, setUserTypeReady] = useState(false)
  const [bothPartnersCompleted, setBothPartnersCompleted] = useState(false)
  const [finalSolution, setFinalSolution] = useState<PartnerSummary | null>(null)
  const [allMessages, setAllMessages] = useState<TherapyMessage[]>([]) // Cache all messages to avoid duplicate API calls
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { toast } = useToast()

  // Determine user type from URL parameters
  useEffect(() => {
    // Set user type as ready once we're in the browser and have search params
    if (typeof window !== 'undefined') {
      setUserTypeReady(true)
    }
  }, [])

  // Check if we're still determining user type
  const isStillDeterminingUserType = typeof window === 'undefined' || !userTypeReady

  // Helper function to filter messages by partner (replicates therapyService.getTherapyChatHistory logic)
  const filterMessagesByPartner = useCallback((messages: TherapyMessage[], partnerName: string): TherapyMessage[] => {
    const partnerMessages: TherapyMessage[] = []
    let expectingAIResponse = false
    
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      
      // Include user messages from this partner
      if (msg.role === 'user' && msg.name === partnerName) {
        partnerMessages.push(msg)
        expectingAIResponse = true
      }
      // Include AI responses that come after this partner's messages
      else if (msg.role === 'assistant' && expectingAIResponse) {
        partnerMessages.push(msg)
        expectingAIResponse = false
      }
      // Include first AI message if it's a conversation starter for this partner
      else if (msg.role === 'assistant' && partnerMessages.length === 0) {
        // Check if this is truly the first message in a new conversation thread
        const hasUserMessagesBefore = messages.slice(0, i).some(m => m.role === 'user' && m.name === partnerName)
        if (!hasUserMessagesBefore) {
          partnerMessages.push(msg)
        }
      }
      // Include solution messages (visible to both partners)
      else if (msg.role === 'assistant' && msg.name === 'SOLUTION') {
        partnerMessages.push(msg)
      }
    }
    
    return partnerMessages
  }, [])

  // Check if both partners have completed and add final solution as chat message
  const checkBothPartnersCompleted = useCallback(async () => {
    if (!session || bothPartnersCompleted) return

    try {
      const summaries = await therapyService.getSessionSummaries(sessionId)
      const partnerNames = session.partner_names?.split(' & ') || []
      
      if (summaries.length >= 2 && !bothPartnersCompleted) {
        // Check if solution message already exists to prevent duplicates
        // Use cached messages first, fallback to API call if cache is empty
        const messagesToCheck = allMessages.length > 0 ? allMessages : await therapyService.getAllSessionMessages(sessionId)
        const solutionExists = messagesToCheck.some(msg => msg.name === 'SOLUTION')
        
        if (solutionExists) {
          setBothPartnersCompleted(true)
          return
        }
        
        setBothPartnersCompleted(true)
        
        // Partner 2's summary is the final solution (since Partner 2's AI acts as mediator)
        const partner2Name = partnerNames[1]
        const solution = summaries.find(s => s.partner_name === partner2Name)
        
        if (solution) {
          setFinalSolution(solution)
          
          // Add the final solution as a chat message to both partners
          const solutionMessage: TherapyMessage = {
            session_id: sessionId,
            message: `🎯 **Final Solution & Recommendations**\n\n${solution.summary_text}`,
            role: 'assistant',
            name: 'SOLUTION' // Special identifier for solution messages
          }
          
          // Save the solution message to database
          await therapyService.saveTherapyMessage(solutionMessage)
          
          // If this is the current partner's view, add to messages immediately
          // But only if it's not already in the current messages
          if (selectedPartner && !messages.some(msg => msg.name === 'SOLUTION')) {
            setMessages(prev => [...prev, solutionMessage])
          }
        }
      }
    } catch (error) {
      console.error('Error checking both partners completed:', error)
    }
  }, [sessionId, session, bothPartnersCompleted, selectedPartner, messages])

  // Auto-start conversation for selected partner
  const autoStartConversation = useCallback(async (partnerName: string) => {
    setMessages([])
    setHasStartedChatting(true)
    setOtherPartnerSummary(null)

    // AI starts the conversation first
    try {
      const response = await fetch('/api/therapist/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          partnerName,
          message: "START_CONVERSATION", // Special flag for AI to start
          messages: []
        }),
      })

      if (response.ok) {
        const { message: aiMessage } = await response.json()
        
        const assistantMessage: TherapyMessage = {
          session_id: sessionId,
          message: aiMessage,
          role: 'assistant',
          name: partnerName
        }
        
        setMessages([assistantMessage])
        await therapyService.saveTherapyMessage(assistantMessage)
      }
    } catch (error) {
      console.error('Error starting conversation:', error)
    }
  }, [sessionId])

  // Initialize session and load data
  useEffect(() => {
    const initializeSession = async () => {
      try {
        // Get session details
        const sessionData = await therapyService.getTherapySession(sessionId)
        if (!sessionData) {
          throw new Error('Session not found')
        }
        setSession(sessionData)

        // Parse partner names
        const partnerNames = sessionData.partner_names?.split(' & ') || []
        const partnersData = partnerNames.map(name => ({ name }))
        
        // Load existing summaries
        const summaries = await therapyService.getSessionSummaries(sessionId)

        // Check if this is a returning user with a stored partner selection
        const storedPartner = localStorage.getItem(`therapy_partner_${sessionId}`)
        const isReturningUser = storedPartner && partnersData.some(p => p.name === storedPartner)

        if (isReturningUser) {
          // RETURNING USER: Load only their specific chat history
          console.log('Debug - Returning user, loading chat history for:', storedPartner)
          
          // Set partner immediately for returning user
          setSelectedPartner(storedPartner)
          
          // Update partners with summaries (no need for usage check since we know this user's partner)
          const partnersWithSummaries = partnersData.map(partner => {
            const summary = summaries.find(s => s.partner_name === partner.name)
            return { ...partner, summary, isUsed: partner.name === storedPartner }
          })
          setPartners(partnersWithSummaries)

          // Load chat history for the returning user's partner
          const partnerHistory = await therapyService.getTherapyChatHistory(sessionId, storedPartner)
          setMessages(partnerHistory)
          setAllMessages(partnerHistory) // Cache for consistency

          // Check if this partner has started chatting
          const partnerMessages = partnerHistory.filter(msg => msg.name === storedPartner)
          setHasStartedChatting(partnerMessages.length > 0)
          
          // Check if solution already exists in messages
          const hasSolution = partnerHistory.some(msg => msg.name === 'SOLUTION')
          if (hasSolution) {
            setBothPartnersCompleted(true)
            // Get the solution from history for display
            const solutionMsg = partnerHistory.find(msg => msg.name === 'SOLUTION')
            if (solutionMsg) {
              // Extract the solution text from the message
              const solutionText = solutionMsg.message.replace('🎯 **Final Solution & Recommendations**\n\n', '')
              setFinalSolution({
                id: '',
                session_id: sessionId,
                partner_name: 'SOLUTION',
                summary_text: solutionText
              })
            }
          }

          // Check other partner summary and completion status
          const currentPartnerSummary = await therapyService.getPartnerSummary(sessionId, storedPartner)
          setCurrentPartnerCompleted(!!currentPartnerSummary)

          const otherPartnerName = partnersData.find(p => p.name !== storedPartner)?.name
          if (otherPartnerName) {
            const otherSummary = await therapyService.getPartnerSummary(sessionId, otherPartnerName)
            setOtherPartnerSummary(otherSummary)
          }
          
          // Check if both partners are completed
          await checkBothPartnersCompleted()

        } else {
          // FRESH USER: Load all messages to determine partner availability
          console.log('Debug - Fresh user, checking partner availability')
          
          const allSessionMessages = await therapyService.getAllSessionMessages(sessionId)
          setAllMessages(allSessionMessages)
          const usedPartnerNames = [...new Set(allSessionMessages.filter(msg => msg.name && msg.role === 'user').map(msg => msg.name))]
          
          console.log('Debug - All messages:', allSessionMessages.length)
          console.log('Debug - Used partner names:', usedPartnerNames)
          
          // Update partners with their summaries and availability
          const partnersWithSummaries = partnersData.map(partner => {
            const summary = summaries.find(s => s.partner_name === partner.name)
            const isUsed = usedPartnerNames.includes(partner.name)
            return { ...partner, summary, isUsed }
          })
          setPartners(partnersWithSummaries)

          // Auto-assign partner for fresh users
          if (isNewUser) {
            // This is someone accessing via shared link - they need to select from available partners
            // Don't auto-select, let them choose
          } else {
            // This is the session creator - automatically assign them as the first partner
            const firstPartnerName = partnerNames[0]
            if (firstPartnerName) {
              // Check if first partner is already taken
              const firstPartnerUsed = usedPartnerNames.includes(firstPartnerName)
              if (!firstPartnerUsed) {
                // Auto-select first partner for session creator
                setSelectedPartner(firstPartnerName)
                localStorage.setItem(`therapy_partner_${sessionId}`, firstPartnerName)
                
                // Auto-start conversation after setting state
                setTimeout(() => autoStartConversation(firstPartnerName), 100)
              }
            }
          }
        }

        setIsInitializing(false)
      } catch (error) {
        console.error('Error initializing session:', error)
        toast({
          title: "Error",
          description: "Failed to load therapy session. Please check the link and try again.",
          variant: "destructive",
        })
        setIsInitializing(false)
      }
    }

    if (sessionId) {
      initializeSession()
    }
  }, [sessionId, isNewUser, toast, autoStartConversation])

  // Load chat history when partner is selected (only for fresh users who select a partner)
  useEffect(() => {
    const loadChatHistory = async () => {
      if (!selectedPartner) return
      
      // Skip if we already loaded this partner's data in initializeSession
      const storedPartner = localStorage.getItem(`therapy_partner_${sessionId}`)
      if (selectedPartner === storedPartner && messages.length > 0) {
        return // Already loaded in initializeSession
      }

      try {
        // Use cached messages if available, otherwise fetch from API
        let partnerHistory: TherapyMessage[]
        if (allMessages.length > 0) {
          partnerHistory = filterMessagesByPartner(allMessages, selectedPartner)
        } else {
          partnerHistory = await therapyService.getTherapyChatHistory(sessionId, selectedPartner)
        }
        setMessages(partnerHistory)

        // Check if this partner has started chatting
        const partnerMessages = partnerHistory.filter(msg => msg.name === selectedPartner)
        setHasStartedChatting(partnerMessages.length > 0)
        
        // Check if solution already exists in messages
        const hasSolution = partnerHistory.some(msg => msg.name === 'SOLUTION')
        if (hasSolution) {
          setBothPartnersCompleted(true)
          // Get the solution from history for display
          const solutionMsg = partnerHistory.find(msg => msg.name === 'SOLUTION')
          if (solutionMsg) {
            // Extract the solution text from the message
            const solutionText = solutionMsg.message.replace('🎯 **Final Solution & Recommendations**\n\n', '')
            setFinalSolution({
              id: '',
              session_id: sessionId,
              partner_name: 'SOLUTION',
              summary_text: solutionText
            })
          }
        }

        // Check if current partner has completed their chat (has a summary)
        const currentPartnerSummary = await therapyService.getPartnerSummary(sessionId, selectedPartner)
        setCurrentPartnerCompleted(!!currentPartnerSummary)

        // Get other partner's summary if exists
        const otherPartnerName = partners.find(p => p.name !== selectedPartner)?.name
        if (otherPartnerName) {
          const otherSummary = await therapyService.getPartnerSummary(sessionId, otherPartnerName)
          setOtherPartnerSummary(otherSummary)
        }
        
        // Check if both partners are completed
        await checkBothPartnersCompleted()
      } catch (error) {
        console.error('Error loading chat history:', error)
        toast({
          title: "Error",
          description: "Failed to load chat history.",
          variant: "destructive",
        })
      }
    }

    loadChatHistory()
  }, [selectedPartner, sessionId, partners, toast, allMessages, filterMessagesByPartner, checkBothPartnersCompleted, messages.length])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-focus textarea when not loading
  useEffect(() => {
    if (!isLoading && textareaRef.current && selectedPartner) {
      setTimeout(() => {
        textareaRef.current?.focus()
      }, 100)
    }
  }, [isLoading, selectedPartner])

  // Periodic check for both partners completion
  useEffect(() => {
    if (!bothPartnersCompleted && selectedPartner) {
      const interval = setInterval(() => {
        checkBothPartnersCompleted()
      }, 4000) // Check every 4 seconds

      return () => clearInterval(interval)
    }
  }, [bothPartnersCompleted, selectedPartner, checkBothPartnersCompleted])

  // Handle partner selection
  const handlePartnerSelect = async (partnerName: string) => {
    setSelectedPartner(partnerName)
    setMessages([])
    setHasStartedChatting(true) // AI will start the conversation
    setOtherPartnerSummary(null)
    
    // Store selection to prevent switching
    localStorage.setItem(`therapy_partner_${sessionId}`, partnerName)

    // AI starts the conversation first
    try {
      const response = await fetch('/api/therapist/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          partnerName,
          message: "START_CONVERSATION", // Special flag for AI to start
          messages: []
        }),
      })

      if (response.ok) {
        const { message: aiMessage } = await response.json()
        
        const assistantMessage: TherapyMessage = {
          session_id: sessionId,
          message: aiMessage,
          role: 'assistant',
          name: partnerName
        }
        
        setMessages([assistantMessage])
        await therapyService.saveTherapyMessage(assistantMessage)
      }
    } catch (error) {
      console.error('Error starting conversation:', error)
    }
  }

  // Copy shareable link to clipboard
  const copyShareableLink = async () => {
    try {
      // Add 'new' parameter to force partner selection for the other user
      const shareableLink = `${window.location.origin}/therapist/chat/${sessionId}?new=true`
      await navigator.clipboard.writeText(shareableLink)
      toast({
        title: "Link Copied!",
        description: "Session link copied to clipboard. Share it with your partner.",
      })
    } catch (error) {
      console.error('Error copying link:', error)
      toast({
        title: "Copy Failed",
        description: "Could not copy link. Please copy the URL manually.",
        variant: "destructive",
      })
    }
  }

  // Handle message submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading || !selectedPartner) return

    const userMessage: TherapyMessage = {
      session_id: sessionId,
      message: input,
      role: 'user',
      name: selectedPartner
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    setHasStartedChatting(true)

    try {
      // Save user message
      await therapyService.saveTherapyMessage(userMessage)

      // Get AI response
      const response = await fetch('/api/therapist/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          partnerName: selectedPartner,
          message: input,
          messages: [...messages, userMessage]
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get AI response')
      }

      const { message: aiMessage, summary } = await response.json()

      // Add AI message
      const assistantMessage: TherapyMessage = {
        session_id: sessionId,
        message: aiMessage,
        role: 'assistant',
        name: selectedPartner
      }
      
      setMessages(prev => [...prev, assistantMessage])
      await therapyService.saveTherapyMessage(assistantMessage)

      // If summary was generated, save it
      if (summary) {
        await therapyService.savePartnerSummary({
          session_id: sessionId,
          partner_name: selectedPartner,
          summary_text: summary
        })

        // Update partner with summary
        setPartners(prev => prev.map(p => 
          p.name === selectedPartner 
            ? { ...p, summary: { id: '', session_id: sessionId, partner_name: selectedPartner, summary_text: summary } }
            : p
        ))

        // Mark current partner as completed
        setCurrentPartnerCompleted(true)
        
        // Check if both partners are now completed
        setTimeout(() => checkBothPartnersCompleted(), 500)
      }

      // No separate solution needed - Partner 2's AI provides the resolution

    } catch (error) {
      console.error('Error sending message:', error)
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const formatMessageContent = (content: string) => {
    return content.split('\n').map((line, lineIndex) => {
      const formattedLine = line.split(/(\*\*[^*]+\*\*)/).map((part, partIndex) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          const text = part.slice(2, -2)
          return <span key={`${lineIndex}-${partIndex}`} className="font-bold">{text}</span>
        }
        return part
      })
      
      return (
        <span key={lineIndex}>
          {formattedLine}
          {lineIndex < content.split('\n').length - 1 && <br />}
        </span>
      )
    })
  }

  if (isInitializing || isStillDeterminingUserType) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading therapy session...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-2">Session Not Found</h1>
          <p className="text-gray-600 dark:text-gray-400">
            The therapy session could not be found. Please check the link and try again.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[100dvh] bg-black overflow-x-hidden" style={{ touchAction: 'pan-y' }}>
      {/* For new users without selected partner, show partner selection as main screen */}
      {!selectedPartner && isNewUser ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-black border border-gray-800 rounded-xl p-8 max-w-md w-full">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-white mb-2">
                Therapy Session
              </h1>
              <p className="text-gray-400 text-sm">
                Partners: {session.partner_names}
              </p>
            </div>
            
            {(() => {
              // For new users (second partner), assign them as the second partner name
              const partnerNames = session.partner_names?.split(' & ') || []
              const secondPartnerName = partnerNames[1] // Second partner name
              const secondPartner = partners.find(partner => partner.name === secondPartnerName)
              
              // Check if second partner slot is available
              if (!secondPartner || secondPartner.isUsed) {
                return (
                  <div className="text-center">
                    <h2 className="text-xl font-semibold text-white mb-4">
                      Session Full
                    </h2>
                    <p className="text-gray-300 text-sm">
                      The second partner slot has already been taken.
                    </p>
                  </div>
                )
              }
              
              return (
                <>
                  <h2 className="text-xl font-semibold text-white mb-6 text-center">
                    Continue as {secondPartnerName}
                  </h2>
                  <button
                    onClick={() => handlePartnerSelect(secondPartnerName)}
                    className="w-full h-14 text-lg font-semibold rounded-lg transition-colors bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    Start Chatting
                  </button>
                </>
              )
            })()}
          </div>
        </div>
      ) : (
        /* Main Chat Area - Only show when partner is selected or not a new user */
        <div className="flex-1 flex flex-col w-full">
          {/* Chat Header */}
          <div className="border-b border-gray-800 p-4 bg-black">
            <div className="flex items-center justify-between max-w-4xl mx-auto">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
                  <span className="text-white text-sm font-semibold">AI</span>
                </div>
                <div>
                  <h2 className="text-white font-semibold">
                    {selectedPartner ? `Therapy - ${selectedPartner}` : 'Therapy Session'}
                  </h2>
                  <p className="text-gray-400 text-sm">AI Relationship Counselor</p>
                </div>
              </div>
              {selectedPartner && (
                <div className="px-3 py-1.5 bg-gray-800 text-gray-300 text-sm rounded-lg">
                  Locked as: {selectedPartner}
                </div>
              )}
            </div>
          </div>

          {/* Show other partner's summary if available and current partner hasn't started */}
          {otherPartnerSummary && !hasStartedChatting && (
            <div className="border-b border-gray-800 p-4 bg-yellow-900/20">
              <div className="max-w-4xl mx-auto">
                <h3 className="font-semibold text-yellow-200 mb-3 text-sm">
                  Your Partner&apos;s Perspective Summary:
                </h3>
                <div className="text-gray-300 text-sm whitespace-pre-wrap bg-black/30 rounded-lg p-3">
                  {formatMessageContent(otherPartnerSummary.summary_text)}
                </div>
              </div>
            </div>
          )}

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-56">
            <div className="max-w-4xl mx-auto space-y-4">
              {messages.length === 0 && !otherPartnerSummary && selectedPartner && (
                <div className="text-center text-gray-500 py-8">
                  <p className="text-sm"></p>
                </div>
              )}
              
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex items-start space-x-3 mb-4 ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center ${
                      msg.name === 'SOLUTION' ? 'bg-green-600' : 'bg-purple-600'
                    }`}>
                      <span className="text-white text-xs">
                        {msg.name === 'SOLUTION' ? '🎯' : 'AI'}
                      </span>
                    </div>
                  )}
                  <div
                    className={`relative max-w-[80%] rounded-2xl px-3 py-2 whitespace-pre-wrap break-words text-sm ${
                      msg.role === 'user'
                        ? 'bg-white text-black'
                        : msg.name === 'SOLUTION'
                        ? 'bg-green-800 text-white border-2 border-green-600'
                        : 'bg-gray-800 text-white'
                    }`}
                  >
                    <div className="overflow-hidden whitespace-pre-wrap">
                      {formatMessageContent(msg.message)}
                    </div>
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-full bg-gray-700 flex-shrink-0 flex items-center justify-center">
                      <span className="text-white text-xs">{selectedPartner?.slice(0,2)}</span>
                    </div>
                  )}
                </div>
              ))}
              
              {isLoading && (
                <div className="flex items-start space-x-3">
                  <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs">AI</span>
                  </div>
                  <div className="bg-gray-800 text-white px-3 py-2 rounded-2xl">
                    <div className="flex space-x-2">
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input form or Share Link */}
          {selectedPartner && (
            <div className="border-t border-gray-800 p-4 fixed bottom-0 left-0 right-0 bg-black">
              <div className="max-w-4xl mx-auto">
                {currentPartnerCompleted ? (
                  // Show different completion screens based on whether both partners are done
                  bothPartnersCompleted ? (
                    // Both partners completed - Show final message
                    <div className="bg-green-900/50 rounded-xl p-4 text-center h-32 flex flex-col justify-center">
                      <h3 className="text-lg font-semibold text-white mb-2">
                        ✅ Session Complete! 🎉
                      </h3>
                      <p className="text-gray-300 text-sm mb-2">
                        Both partners have completed their sessions. The AI has provided personalized recommendations in the chat above.
                      </p>
                      <p className="text-gray-400 text-xs">
                        Thank you for using our therapy service. Please review the final solution message for your next steps.
                      </p>
                    </div>
                  ) : isNewUser ? (
                    // Second partner (via shared link) - No share link, just completion message
                    <div className="bg-gray-900/50 rounded-xl p-4 text-center h-32 flex flex-col justify-center">
                      <h3 className="text-lg font-semibold text-white mb-2">
                        Session Complete! 🎉
                      </h3>
                      <p className="text-gray-300 text-sm mb-2">
                        Thank you for sharing your perspective. Both partners have now completed their sessions.
                      </p>
                      <p className="text-gray-400 text-xs">
                        The AI will now provide a personalized solution based on both of your inputs. The final recommendations will appear as a chat message above.
                      </p>
                    </div>
                  ) : (
                    // First partner (session creator) - Show share link
                    <div className="bg-gray-900/50 rounded-xl p-4 text-center h-48 flex flex-col justify-center">
                      <h3 className="text-lg font-semibold text-white mb-2">
                        Chat Complete! 🎉
                      </h3>
                      <p className="text-gray-300 text-sm mb-3">
                        Thank you for sharing your perspective. Now share this link with your partner so they can share theirs.
                      </p>
                      <div className="bg-gray-800 rounded-lg p-3 mb-3">
                        <h4 className="font-semibold text-gray-200 mb-2 text-xs">
                          Share this link with your partner:
                        </h4>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={`${typeof window !== 'undefined' ? window.location.origin : ''}/therapist/chat/${sessionId}?new=true`}
                            readOnly
                            className="flex-1 p-2 bg-gray-700 border border-gray-600 rounded text-white text-xs"
                          />
                          <button
                            onClick={copyShareableLink}
                            className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded transition-colors font-medium"
                          >
                            Copy Link
                          </button>
                        </div>
                      </div>
                      <p className="text-gray-400 text-xs">
                        Once your partner completes their session, you&apos;ll both receive a personalized solution.
                      </p>
                    </div>
                  )
                ) : (
                  // Show regular input form when chat is not completed
                  <form onSubmit={handleSubmit}>
                    <div className="relative flex items-center bg-gray-800 rounded-xl">
                      <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmit(e);
                          }
                        }}
                        placeholder="Share your perspective..."
                        className="w-full bg-transparent text-white text-base rounded-xl pl-4 pr-14 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none max-h-[120px] min-h-[40px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent"
                        style={{ height: '40px', fontSize: '16px' }}
                        rows={1}
                        disabled={isLoading}
                      />
                      <div className="absolute right-3 flex items-center h-full">
                        <button
                          type="submit"
                          disabled={isLoading || !input.trim()}
                          className="flex items-center justify-center text-white p-1.5 rounded-lg
                                   disabled:opacity-50 disabled:cursor-not-allowed
                                   enabled:bg-purple-600 enabled:hover:bg-purple-700 transition-colors"
                        >
                          <PaperAirplaneIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default dynamic(() => Promise.resolve(TherapyChatPageComponent), {
  ssr: false,
}) 