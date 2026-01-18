// app/change-major/page.tsx - COPY THIS ENTIRE FILE INTO NEW FILE
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged, User } from 'firebase/auth'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Header } from '@/components/ui/header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface UserProfile {
  major: string
  careerGoal: string
  name?: string
  email?: string
}

export default function ChangeMajorPage() {
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [newMajor, setNewMajor] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmRefresh, setConfirmRefresh] = useState(false)
  const router = useRouter()

  const majors = [
    "Computer Science",
    "Statistics",
    "Data Science",
    "Combined Major in Computer Science and Statistics",
    "Engineering (CPEN)",
    "Engineering (ELEC)",
    "Engineering (MECH)",
    "Business/Commerce",
    "Economics",
    "Mathematics",
    "Biology",
    "Chemistry",
    "Physics",
    "Psychology",
    "Other",
  ]

  // Check auth and load profile
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push('/onboarding')
        return
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid))
        if (userDoc.exists()) {
          setUserProfile(userDoc.data() as UserProfile)
          setNewMajor(userDoc.data().major)
        }
      } catch (error) {
        console.error('❌ Error loading profile:', error)
      } finally {
        setLoading(false)
      }

      setUser(currentUser)
    })

    return () => unsubscribe()
  }, [router])

  const handleChangeMajor = async () => {
    if (!user || !newMajor) {
      alert('Please select a major')
      return
    }

    if (newMajor === userProfile?.major) {
      alert('Please select a different major')
      return
    }

    setConfirmRefresh(true)
  }

  const handleConfirmRefresh = async () => {
    if (!user) return

    try {
      setSaving(true)

      // Update major in Firestore
      const userDocRef = doc(db, 'users', user.uid)
      await updateDoc(userDocRef, {
        major: newMajor,
        lastMajorChangeAt: new Date().toISOString(),
      })

      console.log(`✅ Major updated to ${newMajor}`)
      alert('Major updated! Recommendations will refresh on dashboard.')
      router.push('/dashboard')
    } catch (error) {
      console.error('❌ Error updating major:', error)
      alert('Failed to update major. Try again.')
    } finally {
      setSaving(false)
      setConfirmRefresh(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <video autoPlay loop muted playsInline className="w-12 h-12 rounded-full mx-auto mb-4">
            <source src="/loading-video.mp4" type="video/mp4" />
          </video>
          <p className="text-zinc-400">Loading your profile...</p>
        </div>
      </div>
    )
  }

  if (!userProfile) {
    return (
      <div className="min-h-screen bg-black">
        <Header />
        <main className="mx-auto max-w-2xl px-6 py-12 flex items-center justify-center min-h-[calc(100vh-80px)]">
          <Card className="border-zinc-800 bg-zinc-950/60">
            <CardContent className="py-12 text-center">
              <p className="text-zinc-400">Could not load your profile.</p>
              <Button
                onClick={() => router.push('/dashboard')}
                className="mt-4 bg-teal-500 text-black hover:bg-teal-600"
              >
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black">
      <Header />

      <main className="mx-auto max-w-2xl px-6 py-12 flex items-center justify-center min-h-[calc(100vh-80px)]">
        <Card className="w-full border-zinc-800 bg-zinc-950/60 shadow-[0_0_50px_rgba(20,184,166,0.15)]">
          <CardContent className="px-8 py-12">
            <div className="space-y-8">
              {/* Header */}
              <div className="space-y-2 text-center">
                <h2 className="text-3xl font-semibold">Update Your Major</h2>
                <p className="text-sm text-zinc-400">
                  Change your major to get fresh event recommendations. Your saved actions will stay.
                </p>
              </div>

              {/* Current info */}
              <div className="bg-zinc-900/50 p-4 rounded-lg space-y-2">
                <p className="text-sm text-zinc-400">Current Major</p>
                <p className="text-lg font-semibold text-teal-400">{userProfile.major}</p>
              </div>

              {/* Major selector */}
              <div className="space-y-2">
                <Label className="text-zinc-300">New Major</Label>
                <Select value={newMajor} onValueChange={setNewMajor}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 hover:border-teal-500/50 focus:border-teal-500">
                    <SelectValue placeholder="Select new major" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-950 border-zinc-800">
                    {majors.map((m) => (
                      <SelectItem
                        key={m}
                        value={m}
                        className="text-zinc-100 focus:bg-teal-500/10 focus:text-teal-400"
                      >
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Confirmation modal content */}
              {confirmRefresh && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 space-y-4">
                  <div>
                    <p className="text-sm text-amber-400 font-semibold">Are you sure?</p>
                    <p className="text-xs text-zinc-400 mt-1">
                      Changing your major will refresh your recommended events. However:
                    </p>
                    <ul className="text-xs text-zinc-400 mt-2 space-y-1 ml-4 list-disc">
                      <li>Your Going, Attended, and Skipped events will stay in their folders</li>
                      <li>AI will regenerate recommendations based on your new major</li>
                      <li>You can change back anytime</li>
                    </ul>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      onClick={handleConfirmRefresh}
                      disabled={saving}
                      className="bg-teal-500 text-black hover:bg-teal-600"
                    >
                      {saving ? 'Updating...' : 'Yes, Update Major'}
                    </Button>
                    <Button
                      onClick={() => setConfirmRefresh(false)}
                      variant="outline"
                      className="border-zinc-700"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={handleChangeMajor}
                  disabled={newMajor === userProfile.major || saving}
                  className="flex-1 bg-teal-500 text-black hover:bg-teal-600 disabled:opacity-50"
                >
                  Update Major
                </Button>
                <Button
                  onClick={() => router.push('/dashboard')}
                  variant="outline"
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}