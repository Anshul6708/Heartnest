"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'

export default function Home() {
  const [partner1Name, setPartner1Name] = useState('')
  const [partner2Name, setPartner2Name] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const handleStartSession = async () => {
    if (!partner1Name.trim() || !partner2Name.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter both partner names to start the session.",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/therapist/create-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          partnerNames: `${partner1Name.trim()} & ${partner2Name.trim()}`
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('API Error:', errorData)
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to create therapy session`)
      }

      const { sessionId } = await response.json()
      router.push(`/therapist/chat/${sessionId}`)
    } catch (error) {
      console.error('Error creating session:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create therapy session. Please check your environment variables and database setup.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-2">
            Heartnest
          </h1>
          <p className="text-gray-300 text-lg">
            AI-powered conflict resolution for couples
          </p>
        </div>
        
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-8 shadow-2xl border border-white/20">
          <h2 className="text-2xl font-semibold text-white mb-6 text-center">
            Start Your Session
          </h2>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="partner1" className="block text-sm font-medium text-gray-200 mb-2">
                First Partner&apos;s Name
              </label>
              <Input
                id="partner1"
                type="text"
                placeholder="Enter first partner's name"
                value={partner1Name}
                onChange={(e) => setPartner1Name(e.target.value)}
                className="bg-white/20 border-white/30 text-white placeholder:text-gray-300 focus:ring-blue-400 focus:border-blue-400"
                disabled={isLoading}
              />
            </div>
            
            <div>
              <label htmlFor="partner2" className="block text-sm font-medium text-gray-200 mb-2">
                Second Partner&apos;s Name
              </label>
              <Input
                id="partner2"
                type="text"
                placeholder="Enter second partner's name"
                value={partner2Name}
                onChange={(e) => setPartner2Name(e.target.value)}
                className="bg-white/20 border-white/30 text-white placeholder:text-gray-300 focus:ring-blue-400 focus:border-blue-400"
                disabled={isLoading}
              />
            </div>
            
            <Button
              onClick={handleStartSession}
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isLoading ? 'Creating Session...' : 'Start Therapy Session'}
            </Button>
          </div>
          
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-300">
              This will create a unique session link that both partners can use to share their perspectives.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
} 