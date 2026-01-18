// app/dashboard/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged, User, signOut } from 'firebase/auth'
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  onSnapshot,  // ✅ ADD THIS
} from 'firebase/firestore'
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
  clubRating?: number
  averageRating?: number
  totalRatings?: number
  ratingCount?: number
  deadline?: string
  link?: string
}

interface UserProfile {
  major: string
  careerGoal: string
  email?: string
  name?: string
}

type StatusType = 'going' | 'attended' | 'skipped'

interface UserEvent {
  userId: string
  eventId: string
  status: StatusType
  updatedAt?: string
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)

  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingRecommendations, setLoadingRecommendations] = useState(false)
  const [usedFallback, setUsedFallback] = useState(false)
  const [fallbackType, setFallbackType] = useState<string | null>(null)

  const [userEventsMap, setUserEventsMap] = useState<Record<string, StatusType>>({})
  const [userEventsList, setUserEventsList] = useState<UserEvent[]>([])
  const [skipCount, setSkipCount] = useState(0)

  const router = useRouter()

  // Auth + profile
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser)

      if (currentUser) {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid))
        if (userDoc.exists()) {
          setUserProfile(userDoc.data() as UserProfile)
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

  // Fetch userEvents for this user
  useEffect(() => {
  if (!user) {
    setUserEventsMap({})
    setUserEventsList([])
    setSkipCount(0)
    return
  }

  const unsubscribe = onSnapshot(  // ← Real-time listener
    query(collection(db, 'userEvents'), where('userId', '==', user.uid)),
    (snapshot) => {
      const map: Record<string, StatusType> = {}
      const list: UserEvent[] = []
      let skips = 0

      snapshot.docs.forEach((d) => {
        const data = d.data() as any
        const s = data.status as StatusType
        if (s && data.eventId) {
          map[data.eventId] = s
          list.push({
            userId: data.userId,
            eventId: data.eventId,
            status: s,
            updatedAt: data.updatedAt,
          })
          if (s === 'skipped') skips += 1
        }
      })

      setUserEventsMap(map)
      setUserEventsList(list)  // ← Updates in real-time!
      setSkipCount(skips)
    }
  )

  return () => unsubscribe()  // ← Cleanup listener
}, [user])


  // Fetch events + AI recommendations
  useEffect(() => {
    const fetchEventsAndRecommend = async () => {
      if (!userProfile) return

      setLoadingRecommendations(true)

      try {
        // 1. Fetch all events
        const eventsSnapshot = await getDocs(collection(db, 'events'))
        const eventsData = eventsSnapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as Event[]

        if (eventsData.length === 0) {
          setEvents([])
          setLoadingRecommendations(false)
          return
        }

        // 2. Fetch user's past ratings
        let userRatings: any[] = []
        if (user) {
          const ratingsSnapshot = await getDocs(
            query(collection(db, 'ratings'), where('userId', '==', user.uid))
          )
          userRatings = ratingsSnapshot.docs.map((docSnap) => {
            const data = docSnap.data()
            return {
              ...data,
              eventTitle: eventsData.find((e) => e.id === data.eventId)?.title,
            }
          })
        }

        // 3. Call AI route
        const response = await fetch('/api/recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userProfile,
            events: eventsData,
            userRatings,
            userEvents: userEventsList,
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

        setEvents(data.rankedEvents)
      } catch (error) {
        console.error('Error fetching recommendations:', error)
        setUsedFallback(true)
        setFallbackType('ratings-only')

        // Fallback: rating-based, upcoming only
        try {
          const eventsSnapshot = await getDocs(collection(db, 'events'))
          const eventsData = eventsSnapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          })) as Event[]

          const now = new Date()
          const upcoming = eventsData.filter((e) => {
            if (!e.deadline) return true
            const d = new Date(e.deadline)
            return !isNaN(d.getTime()) && d >= now
          })
          const base = upcoming.length > 0 ? upcoming : eventsData

          const sorted = base.sort((a, b) => {
            const aBase = a.averageRating || 0
            const bBase = b.averageRating || 0
            const aPop = Math.log(((a.ratingCount || a.totalRatings || 1) as number) + 1)
            const bPop = Math.log(((b.ratingCount || b.totalRatings || 1) as number) + 1)
            const aScore = aBase * 0.7 + aPop * 0.3
            const bScore = bBase * 0.7 + bPop * 0.3
            return bScore - aScore
          })

          setEvents(sorted)
        } catch (fallbackError) {
          console.error('Fallback also failed:', fallbackError)
          setEvents([])
        }
      } finally {
        setLoadingRecommendations(false)
      }
    }

    fetchEventsAndRecommend()
  }, [userProfile, user, userEventsList])

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
          <video
            autoPlay
            loop
            muted
            playsInline
            className="w-12 h-12 rounded-full mx-auto mb-4"
            style={{ objectFit: 'cover' }}
          >
            <source src="/loading-video.mp4" type="video/mp4" />
          </video>
          <p className="text-white">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  const fallbackLabel =
    fallbackType === 'career+ratings'
      ? 'Resilience mode · Temporarily ranking events by career alignment and community ratings while the AI service is unavailable.'
      : fallbackType === 'ratings-only'
      ? 'Resilience mode · Temporarily ranking events by community ratings while the AI service is unavailable.'
      : 'AI recommendations active · Events are ranked using Gemini based on your career goal and past feedback.'

  // Derived lists
  const goingEvents = events.filter((e) => userEventsMap[e.id] === 'going')
  const skippedEvents = events.filter((e) => userEventsMap[e.id] === 'skipped')
  const attendedEvents = events.filter((e) => userEventsMap[e.id] === 'attended')

  const undecidedEvents = events.filter((e) => !userEventsMap[e.id])

  const top3 = undecidedEvents.slice(0, 3)
  const otherRecommended = undecidedEvents.slice(3)

  return (
    <div className="min-h-screen bg-black">
      <Header />

      <main className="mx-auto max-w-7xl px-6 py-12">
        {/* AI status banner */}
        <div className="mb-4">
          <Card className="border-zinc-800 bg-zinc-950/60">
            <CardContent className="py-3 px-4 text-xs text-zinc-300 flex items-center justify-between">
              <div>
                {usedFallback ? (
                  <span className="text-amber-300 font-medium">
                    Smart fallback active ·{' '}
                  </span>
                ) : (
                  <span className="text-teal-300 font-medium">
                    AI recommendations live ·{' '}
                  </span>
                )}
                <span className="text-zinc-400">{fallbackLabel}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Welcome */}
        <div className="mb-8">
          <h2 className="text-3xl font-semibold mb-2">
            Welcome{user ? `, ${user.displayName?.split(' ')[0]}` : ' back'}!
          </h2>
          {userProfile && (
            <p className="text-zinc-400">
              Finding opportunities for{' '}
              <span className="text-teal-400">{userProfile.careerGoal}</span> ·{' '}
              {userProfile.major}
            </p>
          )}
        </div>

        {/* Profile card */}
        {userProfile && (
          <Card className="border-zinc-800 bg-zinc-950/60 shadow-[0_0_40px_rgba(20,184,166,0.1)] hover:shadow-[0_0_60px_rgba(20,184,166,0.2)] transition-shadow duration-300 mb-8">
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
                  <span className="text-zinc-500 w-32">Major:</span>
                  <span className="text-zinc-300 font-medium">{userProfile.major}</span>
                </div>
                <div className="flex items-center">
                  <span className="text-zinc-500 w-32">Career Goal:</span>
                  <span className="text-zinc-300 font-medium">
                    {userProfile.careerGoal}
                  </span>
                </div>
                {user && (
                  <div className="flex items-center">
                    <span className="text-zinc-500 w-32">Email:</span>
                    <span className="text-zinc-300">{user.email}</span>
                  </div>
                )}
                <div className="flex items-center">
                  <span className="text-zinc-500 w-32">Status:</span>
                  {user ? (
                    <span className="text-teal-400 flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-teal-400"></span>
                      Signed in
                    </span>
                  ) : (
                    <span className="text-amber-400 flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-amber-400"></span>
                      Guest mode
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                {user ? (
                  <Button
                    onClick={handleSignOut}
                    variant="outline"
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  >
                    Sign Out
                  </Button>
                ) : (
                  <Button
                    onClick={() => router.push('/onboarding')}
                    className="bg-teal-500 text-black hover:bg-teal-600 shadow-[0_0_20px_rgba(20,184,166,0.3)] hover:shadow-[0_0_30px_rgba(20,184,166,0.5)] transition-shadow duration-300"
                  >
                    Sign In to Save Progress
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top matches (only undecided) */}
        {undecidedEvents.length > 0 && (
          <section className="mb-10">
            <h3 className="text-2xl font-semibold mb-4">Top matches for you</h3>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {top3.map((event, index) => (
                <Link key={event.id} href={`/event/${event.id}`}>
                  <Card className="border-zinc-800 bg-zinc-950/60 hover:border-teal-500/50 shadow-[0_0_30px_rgba(20,184,166,0.08)] hover:shadow-[0_0_50px_rgba(20,184,166,0.15)] transition-all duration-300 cursor-pointer h-full">
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex flex-col gap-1">
                          <Badge className="bg-teal-500/10 text-teal-400 border-teal-500/30">
                            #{index + 1} Match
                          </Badge>
                          {usedFallback && fallbackType && (
                            <Badge
                              variant="outline"
                              className="border-amber-400/40 text-amber-300 text-[10px]"
                            >
                              {fallbackType === 'career+ratings'
                                ? 'Career match · Community rated'
                                : 'Community rated fallback'}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-yellow-500 text-sm">
                          <span>⭐</span>
                          <span>{event.averageRating?.toFixed(1) || 'N/A'}</span>
                        </div>
                      </div>

                      <h4 className="text-lg font-semibold mb-2 line-clamp-2">
                        {event.title}
                      </h4>
                      <p className="text-sm text-zinc-400 mb-4 line-clamp-2">
                        {event.description}
                      </p>

                      {event.skillsLearned && event.skillsLearned.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {event.skillsLearned.slice(0, 3).map((skill) => (
                            <Badge
                              key={skill}
                              variant="secondary"
                              className="bg-teal-500/10 text-teal-400 text-xs"
                            >
                              {skill}
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs text-zinc-500 pt-4 border-t border-zinc-800">
                        <span className="flex items-center gap-1">
                          📍 {event.location || 'TBD'}
                        </span>
                        <span>{event.date || 'TBD'}</span>
                      </div>

                      <div className="mt-2 text-xs text-zinc-600">{event.club}</div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Going */}
        <section className="mb-10">
          <h3 className="text-xl font-semibold mb-3">Going to</h3>
          {goingEvents.length === 0 ? (
            <p className="text-zinc-500 text-sm">
              Events you mark as “Going” will appear here.
            </p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {goingEvents.map((event) => (
                <Link key={event.id} href={`/event/${event.id}`}>
                  <Card className="border-zinc-800 bg-zinc-950/60 hover:border-teal-500/50 shadow-[0_0_30px_rgba(20,184,166,0.08)] hover:shadow-[0_0_50px_rgba(20,184,166,0.15)] transition-all duration-300 cursor-pointer h-full">
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-3">
                        <Badge className="bg-teal-500/10 text-teal-400 border-teal-500/30">
                          Going
                        </Badge>
                        <div className="flex items-center gap-1 text-yellow-500 text-sm">
                          <span>⭐</span>
                          <span>{event.averageRating?.toFixed(1) || 'N/A'}</span>
                        </div>
                      </div>

                      <h4 className="text-lg font-semibold mb-2 line-clamp-2">
                        {event.title}
                      </h4>
                      <p className="text-sm text-zinc-400 mb-4 line-clamp-2">
                        {event.description}
                      </p>

                      <div className="flex items-center justify-between text-xs text-zinc-500 pt-4 border-t border-zinc-800">
                        <span className="flex items-center gap-1">
                          📍 {event.location || 'TBD'}
                        </span>
                        <span>{event.date || 'TBD'}</span>
                      </div>

                      <div className="mt-2 text-xs text-zinc-600">{event.club}</div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Attended */}
        <section className="mb-10">
          <h3 className="text-xl font-semibold mb-3">Attended</h3>
          {attendedEvents.length === 0 ? (
            <p className="text-zinc-500 text-sm">
              Events you mark as “Attended” will appear here.
            </p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {attendedEvents.map((event) => (
                <Link key={event.id} href={`/event/${event.id}`}>
                  <Card className="border-zinc-800 bg-zinc-950/60 hover:border-teal-500/50 shadow-[0_0_30px_rgba(34,197,94,0.2)] transition-all duration-300 cursor-pointer h-full">
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-3">
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                          Attended
                        </Badge>
                        <div className="flex items-center gap-1 text-yellow-500 text-sm">
                          <span>⭐</span>
                          <span>{event.averageRating?.toFixed(1) || 'N/A'}</span>
                        </div>
                      </div>

                      <h4 className="text-lg font-semibold mb-2 line-clamp-2">
                        {event.title}
                      </h4>
                      <p className="text-sm text-zinc-400 mb-4 line-clamp-2">
                        {event.description}
                      </p>

                      <div className="flex items-center justify-between text-xs text-zinc-500 pt-4 border-t border-zinc-800">
                        <span className="flex items-center gap-1">
                          📍 {event.location || 'TBD'}
                        </span>
                        <span>{event.date || 'TBD'}</span>
                      </div>

                      <div className="mt-2 text-xs text-zinc-600">{event.club}</div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Skipped */}
        <section className="mb-10">
          <h3 className="text-xl font-semibold mb-3">Skipped</h3>
          {skippedEvents.length === 0 ? (
            <p className="text-zinc-500 text-sm">
              Events you skip will appear here.
            </p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {skippedEvents.map((event) => (
                <Link key={event.id} href={`/event/${event.id}`}>
                  <Card className="border-zinc-800 bg-zinc-950/60 hover:border-zinc-700 shadow-[0_0_30px_rgba(148,163,184,0.25)] transition-all duration-300 cursor-pointer h-full">
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-3">
                        <Badge className="bg-zinc-800 text-zinc-300 border-zinc-600">
                          Skipped
                        </Badge>
                        <div className="flex items-center gap-1 text-yellow-500 text-sm">
                          <span>⭐</span>
                          <span>{event.averageRating?.toFixed(1) || 'N/A'}</span>
                        </div>
                      </div>

                      <h4 className="text-lg font-semibold mb-2 line-clamp-2">
                        {event.title}
                      </h4>
                      <p className="text-sm text-zinc-400 mb-4 line-clamp-2">
                        {event.description}
                      </p>

                      <div className="flex items-center justify-between text-xs text-zinc-500 pt-4 border-t border-zinc-800">
                        <span className="flex items-center gap-1">
                          📍 {event.location || 'TBD'}
                        </span>
                        <span>{event.date || 'TBD'}
                        </span>
                      </div>

                      <div className="mt-2 text-xs text-zinc-600">{event.club}</div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* More recommendations */}
        <section>
          <h3 className="text-xl font-semibold mb-3">More recommendations</h3>
          {loadingRecommendations ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-12 h-12 rounded-full mx-auto mb-4"
                  style={{ objectFit: 'cover' }}
                >
                  <source src="/loading-video.mp4" type="video/mp4" />
                </video>
                <p className="text-zinc-400">
                  AI is analyzing the best events for you...
                </p>
              </div>
            </div>
          ) : otherRecommended.length === 0 ? (
            <Card className="border-zinc-800 bg-zinc-950/60 shadow-[0_0_40px_rgba(20,184,166,0.1)]">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 text-6xl">📚</div>
                <h4 className="text-xl font-semibold mb-2">You’re up to date</h4>
                <p className="text-zinc-400 max-w-md">
                  You’ve reviewed all current recommendations. New events will appear
                  here when they’re added.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {otherRecommended.map((event) => (
                <Link key={event.id} href={`/event/${event.id}`}>
                  <Card className="border-zinc-800 bg-zinc-950/60 hover:border-teal-500/50 shadow-[0_0_30px_rgba(20,184,166,0.08)] hover:shadow-[0_0_50px_rgba(20,184,166,0.15)] transition-all duration-300 cursor-pointer h-full">
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-3">
                        <span className="text-xs text-zinc-500">Recommended</span>
                        <div className="flex items-center gap-1 text-yellow-500 text-sm">
                          <span>⭐</span>
                          <span>{event.averageRating?.toFixed(1) || 'N/A'}</span>
                        </div>
                      </div>

                      <h4 className="text-lg font-semibold mb-2 line-clamp-2">
                        {event.title}
                      </h4>
                      <p className="text-sm text-zinc-400 mb-4 line-clamp-2">
                        {event.description}
                      </p>

                      <div className="flex items-center justify-between text-xs text-zinc-500 pt-4 border-t border-zinc-800">
                        <span className="flex items-center gap-1">
                          📍 {event.location || 'TBD'}
                        </span>
                        <span>{event.date || 'TBD'}</span>
                      </div>

                      <div className="mt-2 text-xs text-zinc-600">{event.club}</div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
