'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged, User, signOut } from 'firebase/auth'
import { doc, getDoc, collection, getDocs } from 'firebase/firestore'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Header } from '@/components/ui/header'
import Link from 'next/link'

interface Event {
  id: string
  title: string
  description: string
  careerPaths?: string[]
  skillsLearned?: string[]
  date?: string
  location?: string
  club: string
  averageRating?: number
  totalRatings?: number
}

interface UserProfile {
  major: string
  careerGoal: string
  email?: string
  name?: string
}

interface UserRating {
  userId: string
  eventId: string
  rating: number
  status: string
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingRecommendations, setLoadingRecommendations] = useState(false)
  const [usedFallback, setUsedFallback] = useState(false)
  const [fallbackType, setFallbackType] = useState<string | null>(null)
  const router = useRouter()

  // Check auth and load profile
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser)

      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid))
          if (userDoc.exists()) {
            setUserProfile(userDoc.data() as UserProfile)
          }
        } catch (error) {
          console.error('Error loading profile:', error)
        }
      } else {
        const guestProfile = localStorage.getItem('userProfile')
        if (guestProfile) {
          setUserProfile(JSON.parse(guestProfile))
        } else {
          router.push('/onboarding')
        }
      }

      setLoading(false)
    })

    return () => unsubscribe()
  }, [router])

  const fetchEventsAndRecommend = async () => {
    if (!userProfile) return

    setLoadingRecommendations(true)

    try {
      const eventsSnapshot = await getDocs(collection(db, 'events'))
      const allEventsData = eventsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Event[]

      if (allEventsData.length === 0) {
        setEvents([])
        setLoadingRecommendations(false)
        return
      }

      let excludedEventIds: string[] = []
      if (user) {
        const userEventsRef = collection(db, 'users', user.uid, 'userEvents')
        const allUserEvents = await getDocs(userEventsRef)

        allUserEvents.forEach((doc) => {
          const data = doc.data()
          if (data.status === 'skipped' || data.status === 'attended') {
            excludedEventIds.push(doc.id)
          }
        })
      }

      const recommendableEvents = allEventsData.filter(
        (e) => !excludedEventIds.includes(e.id)
      )

      if (recommendableEvents.length === 0) {
        setEvents([])
        setLoadingRecommendations(false)
        return
      }

      let userRatings: UserRating[] = []
      if (user) {
        try {
          const ratingsSnapshot = await getDocs(collection(db, 'ratings'))
          userRatings = ratingsSnapshot.docs
            .map((doc) => doc.data() as UserRating)
            .filter((r) => r.userId === user.uid)
        } catch (error) {
          console.error('Error fetching ratings:', error)
        }
      }

      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userProfile,
          events: recommendableEvents,
          userRatings,
        }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()

      if (data.usedFallback) {
        setUsedFallback(true)
        setFallbackType(data.fallbackType || null)
      } else {
        setUsedFallback(false)
        setFallbackType(null)
      }

      setEvents(data.rankedEvents || [])
    } catch (error) {
      console.error('❌ Error fetching recommendations:', error)
      setEvents([])
      setUsedFallback(true)
      setFallbackType('ratings-only')
    } finally {
      setLoadingRecommendations(false)
    }
  }

  useEffect(() => {
    if (userProfile) {
      fetchEventsAndRecommend()
    }
  }, [userProfile, user])

  const handleSignOut = async () => {
    try {
      await signOut(auth)
      localStorage.removeItem('userProfile')
      router.push('/')
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="text-center">
          <video autoPlay loop muted playsInline className="w-12 h-12 rounded-full mx-auto mb-4">
            <source src="/loading-video.mp4" type="video/mp4" />
          </video>
          <p className="text-white">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  const fallbackLabel =
    fallbackType === 'career'
      ? 'Resilience mode: Temporarily ranking events by career alignment and community ratings.'
      : fallbackType === 'ratings-only'
        ? 'Resilience mode: Temporarily ranking events by community ratings.'
        : 'AI recommendations active: Events ranked using Gemini based on your career goal.'

  return (
    <div className="min-h-screen bg-black">
      <Header />

      <main className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-4">
          <Card className="border-zinc-800 bg-zinc-950/60">
            <CardContent className="py-3 px-4 text-xs text-zinc-300 flex items-center justify-between">
              <div>
                {usedFallback ? (
                  <span className="text-amber-300 font-medium">Smart fallback active</span>
                ) : (
                  <span className="text-teal-300 font-medium">AI recommendations live</span>
                )}
              </div>
              <span className="text-zinc-400">{fallbackLabel}</span>
            </CardContent>
          </Card>
        </div>

        <div className="mb-8">
          <h2 className="text-3xl font-semibold mb-2">
            Welcome{user ? `, ${user.displayName?.split(' ')[0]}` : ''}!
          </h2>
          {userProfile && (
            <p className="text-zinc-400">
              Finding opportunities for <span className="text-teal-400">{userProfile.careerGoal}</span> in{' '}
              <span className="text-teal-400">{userProfile.major}</span>
            </p>
          )}
        </div>

        {userProfile && (
          <Card className="border-zinc-800 bg-zinc-950/60 shadow-[0_40px_rgba(20,184,166,0.1)] mb-8">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold">Your Profile</h3>
                {user?.photoURL && (
                  <img
                    src={user.photoURL}
                    alt="Profile"
                    className="w-10 h-10 rounded-full border-2 border-teal-500/30"
                  />
                )}
              </div>

              <div className="grid gap-3 text-sm mb-6">
                <div className="flex items-center">
                  <span className="text-zinc-500 w-32">Major</span>
                  <span className="text-zinc-300 font-medium">{userProfile.major}</span>
                </div>
                <div className="flex items-center">
                  <span className="text-zinc-500 w-32">Career Goal</span>
                  <span className="text-zinc-300 font-medium">{userProfile.careerGoal}</span>
                </div>
                {user && (
                  <div className="flex items-center">
                    <span className="text-zinc-500 w-32">Email</span>
                    <span className="text-zinc-300">{user.email}</span>
                  </div>
                )}
              </div>

              {user ? (
                <Button
                  onClick={handleSignOut}
                  variant="outline"
                  className="border-zinc-700 text-zinc-300"
                >
                  Sign Out
                </Button>
              ) : (
                <Button
                  onClick={() => router.push('/onboarding')}
                  className="bg-teal-500 text-black hover:bg-teal-600"
                >
                  Sign In to Save Progress
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        <div>
          <h3 className="text-2xl font-semibold mb-6">
            {loadingRecommendations ? 'Loading Recommendations...' : 'Recommended Events'}
          </h3>

          {loadingRecommendations ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <video autoPlay loop muted playsInline className="w-12 h-12 rounded-full mx-auto mb-4">
                  <source src="/loading-video.mp4" type="video/mp4" />
                </video>
                <p className="text-zinc-400">AI is analyzing the best events for you...</p>
              </div>
            </div>
          ) : events.length === 0 ? (
            <Card className="border-zinc-800 bg-zinc-950/60">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 text-6xl">📭</div>
                <h4 className="text-xl font-semibold mb-2">No Events Yet</h4>
                <p className="text-zinc-400">
                  {user ? 'All available events have been marked as attended or skipped.' : 'Events will appear here once added to database.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {events.map((event, index) => (
                <Link key={event.id} href={`/event/${event.id}`}>
                  <Card className="border-zinc-800 bg-zinc-950/60 hover:border-teal-500/50 cursor-pointer h-full">
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex flex-col gap-1">
                          {index < 3 && (
                            <Badge className="bg-teal-500/10 text-teal-400">
                              {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'} Match
                            </Badge>
                          )}
                          {usedFallback && (
                            <Badge variant="outline" className="border-amber-400/40 text-amber-300 text-xs">
                              {fallbackType === 'career' ? 'Career match' : 'Community rated'}
                            </Badge>
                          )}
                        </div>
                        {event.averageRating && (
                          <div className="flex items-center gap-1 text-yellow-500 text-sm">
                            <span>⭐</span> <span>{event.averageRating.toFixed(1)}</span>
                          </div>
                        )}
                      </div>

                      <h4 className="text-lg font-semibold mb-2 line-clamp-2">{event.title}</h4>
                      <p className="text-sm text-zinc-400 mb-4 line-clamp-2">{event.description}</p>

                      {event.skillsLearned && Array.isArray(event.skillsLearned) && event.skillsLearned.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {event.skillsLearned.slice(0, 3).map((skill: string) => (
                            <Badge key={skill} className="bg-teal-500/10 text-teal-400 text-xs">
                              {skill}
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs text-zinc-500 pt-4 border-t border-zinc-800">
                        <span>📍 {event.location || 'TBD'}</span>
                        <span>{event.date || 'TBD'}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}