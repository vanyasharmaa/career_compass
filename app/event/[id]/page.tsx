// app/event/[id]/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged, User } from 'firebase/auth'
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
} from 'firebase/firestore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

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
  feedbackToken?: string
  link?: string
}

type StatusType = 'going' | 'attended' | 'skipped'

export default function EventPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const eventId = params?.id

  const [user, setUser] = useState<User | null>(null)
  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)

  const [status, setStatus] = useState<StatusType | null>(null)
  const [rating, setRating] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [tokenInput, setTokenInput] = useState('')
  const [tokenError, setTokenError] = useState('')

  // Watch auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u || null))
    return () => unsub()
  }, [])

  // Fetch event data
  useEffect(() => {
    const fetchEvent = async () => {
      if (!eventId) return

      const ref = doc(db, 'events', eventId)
      const snap = await getDoc(ref)
      if (!snap.exists()) {
        router.push('/dashboard')
        return
      }

      const data = snap.data() as any
      setEvent({ ...data, id: snap.id })
      setLoading(false)
    }

    fetchEvent()
  }, [eventId, router])

  // Fetch existing rating/status for this user + event
  useEffect(() => {
    const fetchUserRating = async () => {
      if (!user || !eventId) return

      // Check userEvents for status
      const userEventRef = doc(db, 'userEvents', `${user.uid}_${eventId}`)
      const userEventSnap = await getDoc(userEventRef)
      if (userEventSnap.exists()) {
        const ue = userEventSnap.data() as any
        if (ue.status) setStatus(ue.status as StatusType)
      }

      // Check ratings for rating value
      const ratingsRef = collection(db, 'ratings')
      const qRatings = query(
        ratingsRef,
        where('userId', '==', user.uid),
        where('eventId', '==', eventId)
      )
      const snapRatings = await getDocs(qRatings)
      if (!snapRatings.empty) {
        const data = snapRatings.docs[0].data() as any
        if (typeof data.rating === 'number') setRating(data.rating)
      }
    }

    fetchUserRating()
  }, [user, eventId])

  // Handle status changes with toggle behavior
  const handleStatusChange = async (newStatus: StatusType) => {
    if (!user || !eventId) {
      alert('Sign in to track this event')
      return
    }

    const userEventRef = doc(db, 'userEvents', `${user.uid}_${eventId}`)

    try {
      // If user clicks the same status again, clear it (back to undecided)
      if (status === newStatus) {
        setStatus(null)
        setTokenInput('') // Clear token input
        setTokenError('') // Clear token error
        setRating(null) // Clear rating when toggling off attended
        await deleteDoc(userEventRef)
        return
      }

      // Going / skipped can be set directly
      if (newStatus === 'going' || newStatus === 'skipped') {
        setStatus(newStatus)
        setTokenInput('') // Clear token
        setRating(null) // Clear rating
        await setDoc(
          userEventRef,
          {
            userId: user.uid,
            eventId,
            status: newStatus,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        )
        return
      }

      // Attended requires a valid token
      if (newStatus === 'attended') {
        if (!event?.feedbackToken) {
          alert('This event is not accepting feedback yet.')
          return
        }
        if (tokenInput.trim() !== event.feedbackToken) {
          setTokenError('Invalid code. Use the event code shared by the club.')
          return
        }

        setTokenError('')
        setStatus('attended')

        await setDoc(
          userEventRef,
          {
            userId: user.uid,
            eventId,
            status: 'attended',
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        )
      }
    } catch (error) {
      console.error('Error changing status:', error)
      alert('Could not update status. Try again.')
    }
  }

  // Submit rating (1–5 only) – only if attended
  const handleSubmitRating = async () => {
    if (!user || !eventId) {
      alert('Sign in to rate this event')
      return
    }
    if (status !== 'attended') {
      alert('You can only rate events you attended.')
      return
    }
    if (!rating) {
      alert('Please select a rating')
      return
    }

    try {
      setSubmitting(true)

      const ratingId = `${user.uid}_${eventId}`
      const ratingRef = doc(db, 'ratings', ratingId)
      await setDoc(
        ratingRef,
        {
          userId: user.uid,
          eventId,
          rating,
          status: 'attended',
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      )

      // Recompute aggregates for the event
      const ratingsRef = collection(db, 'ratings')
      const q = query(ratingsRef, where('eventId', '==', eventId))
      const snap = await getDocs(q)

      let total = 0
      let count = 0
      snap.forEach((docSnap) => {
        const data = docSnap.data() as any
        if (typeof data.rating === 'number') {
          total += data.rating
          count += 1
        }
      })

      const avg = count > 0 ? total / count : 0
      const eventRef = doc(db, 'events', eventId)
      await updateDoc(eventRef, {
        averageRating: avg,
        totalRatings: count,
      })

      alert('Thanks for rating!')
      setTokenInput('') // Clear token input after successful submission
    } catch (err) {
      console.error(err)
      alert('Could not submit rating. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !event) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <p className="text-zinc-400">Loading event...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black">
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Card className="border-zinc-800 bg-zinc-950/60 shadow-[0_0_40px_rgba(20,184,166,0.1)]">
          <CardContent className="p-6 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-start gap-4">
              <div>
                <h1 className="text-2xl font-semibold mb-1">{event.title}</h1>
                <p className="text-sm text-zinc-500">{event.club}</p>
              </div>
              <div className="text-right text-sm text-zinc-400">
                <div>{event.location || 'TBD'}</div>
                <div>{event.date || 'TBD'}</div>
                <div className="mt-1">
                  ⭐ {event.averageRating?.toFixed(1) || 'N/A'}{' '}
                  <span className="text-zinc-500">
                    ({event.totalRatings || 0} ratings)
                  </span>
                </div>
              </div>
            </div>

            {/* Description */}
            <p className="text-zinc-300">{event.description}</p>

            {/* Skills */}
            {event.skillsLearned && event.skillsLearned.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {event.skillsLearned.map((skill) => (
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

            {/* Status buttons */}
            {user ? (
              <div className="space-y-3">
                <p className="text-sm text-zinc-400">Your status</p>
                <div className="flex flex-wrap gap-3">
                  {(['going', 'attended', 'skipped'] as StatusType[]).map((s) => (
                    <Button
                      key={s}
                      variant={status === s ? 'default' : 'outline'}
                      className={
                        status === s
                          ? 'bg-teal-500 text-black hover:bg-teal-600'
                          : 'border-zinc-700 text-zinc-300 hover:bg-zinc-900'
                      }
                      onClick={() => handleStatusChange(s)}
                    >
                      {s === 'going' && 'Going'}
                      {s === 'attended' && 'Attended'}
                      {s === 'skipped' && 'Skipped'}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                Sign in on the dashboard to track attendance and rate events.
              </p>
            )}

            {/* Token input for Attended */}
            {user && status === null && (
              <div className="space-y-2 mt-3">
                <p className="text-xs text-zinc-500">
                  To mark this event as <span className="text-teal-400">Attended</span>,
                  enter the code shared by the club.
                </p>
                <div className="flex gap-2 items-center">
                  <input
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Event code"
                    className="bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500/30 w-40"
                  />
                  <Button
                    variant="outline"
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-900"
                    onClick={() => handleStatusChange('attended')}
                  >
                    Confirm attended
                  </Button>
                </div>
                {tokenError && <p className="text-xs text-red-400">{tokenError}</p>}
              </div>
            )}

            {/* Event link when Going */}
            {user && status === 'going' && event.link && (
              <div className="mt-4 text-sm">
                <p className="text-zinc-400 mb-1">Event link:</p>
                <a
                  href={event.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-400 underline"
                >
                  Open event / registration
                </a>
              </div>
            )}

            {/* Rating (1–5 only), visible ONLY if status === attended */}
            {user && status === 'attended' && (
              <div className="space-y-3 border-t border-zinc-800 pt-4">
                <p className="text-sm text-zinc-400">Rate this event</p>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className={`text-2xl ${
                        rating && rating >= star ? 'text-yellow-400' : 'text-zinc-600'
                      }`}
                    >
                      ★
                    </button>
                  ))}
                </div>

                <Button
                  onClick={handleSubmitRating}
                  disabled={submitting}
                  className="bg-teal-500 text-black hover:bg-teal-600 disabled:opacity-60"
                >
                  {submitting ? 'Submitting...' : 'Submit rating'}
                </Button>
              </div>
            )}

            {/* Back link */}
            <div className="pt-4 border-t border-zinc-800">
              <Button
                variant="outline"
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-900"
                onClick={() => router.push('/dashboard')}
              >
                Back to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
