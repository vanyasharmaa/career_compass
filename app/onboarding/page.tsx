// app/onboarding/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from 'firebase/auth'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Header } from "@/components/ui/header"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"

export default function OnboardingPage() {
  const [major, setMajor] = useState('')
  const [careerGoal, setCareerGoal] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
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

  const careerGoals = [
    "Software Engineer",
    "Data Analyst",
    "Data Scientist",
    "Data Engineer",
    "Machine Learning Engineer",
    "AI Researcher",
    "Product Manager",
    "Business Analyst",
    "Consultant",
    "Research Scientist",
    "UX/UI Designer",
    "Frontend Developer",
    "Backend Developer",
    "Full Stack Developer",
    "DevOps Engineer",
    "Financial Analyst",
    "Other",
  ]

  // If already signed-in and has a profile, skip onboarding
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid))
        if (userDoc.exists()) {
          console.log('✅ User already has profile, redirecting...')
          router.push('/dashboard')
        } else {
          setChecking(false)
        }
      } else {
        setChecking(false)
      }
    })

    return () => unsubscribe()
  }, [router])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
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
          <p className="text-zinc-400">Checking your profile...</p>
        </div>
      </div>
    )
  }

  const handleContinueAsGuest = () => {
    if (!major || !careerGoal) {
      alert('Please select your major and career goal')
      return
    }

    localStorage.setItem(
      'userProfile',
      JSON.stringify({
        major,
        careerGoal,
        isAnonymous: true,
      })
    )
    router.push('/dashboard')
  }

  // Google sign-in:
  // - If user doc exists -> skip form, go straight to dashboard
  // - If new user -> require major & careerGoal once, then create profile
  const handleGoogleSignIn = async () => {
    setLoading(true)
    const provider = new GoogleAuthProvider()

    try {
      const result = await signInWithPopup(auth, provider)
      const user = result.user

      const userDocRef = doc(db, 'users', user.uid)
      const userDoc = await getDoc(userDocRef)

      if (userDoc.exists()) {
        // Returning user: ignore current form state
        console.log('✅ Existing user, skipping onboarding form')
        router.push('/dashboard')
      } else {
        // First-time user: enforce major + careerGoal
        if (!major || !careerGoal) {
          alert('Please select your major and career goal for your first sign in')
          setLoading(false)
          return
        }

        await setDoc(userDocRef, {
          email: user.email,
          name: user.displayName,
          photoURL: user.photoURL,
          major,
          careerGoal,
          isAnonymous: false,
          createdAt: new Date().toISOString(),
        })

        console.log('✅ New user profile created!')
        router.push('/dashboard')
      }
    } catch (error) {
      console.error('Error signing in:', error)
      alert('Sign in failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black">
      <Header />
      
      <main className="mx-auto max-w-7xl px-6 py-12 flex items-center justify-center min-h-[calc(100vh-80px)]">
        <Card className="w-full max-w-xl border-zinc-800 bg-zinc-950/60 shadow-[0_0_50px_rgba(20,184,166,0.15)] hover:shadow-[0_0_80px_rgba(20,184,166,0.25)] transition-shadow duration-300">
          <CardContent className="px-8 py-12">
            <div className="space-y-8">
              {/* Header Text */}
              <div className="space-y-2 text-center">
                <p className="text-xs uppercase tracking-[0.2em] text-teal-400">
                  Step 1 · Your profile
                </p>
                <h2 className="text-3xl font-semibold">
                  Let's personalize your journey
                </h2>
                <p className="text-sm text-zinc-400">
                  Tell us about yourself to get curated event recommendations.
                </p>
              </div>

              {/* Form Fields */}
              <div className="space-y-6">
                {/* Major Dropdown */}
                <div className="space-y-2">
                  <Label className="text-zinc-300">Major / Degree</Label>
                  <Select value={major} onValueChange={setMajor}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 hover:border-teal-500/50 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all">
                      <SelectValue placeholder="Select your major" />
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

                {/* Career Goal Dropdown */}
                <div className="space-y-2">
                  <Label className="text-zinc-300">Career goal</Label>
                  <Select value={careerGoal} onValueChange={setCareerGoal}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 hover:border-teal-500/50 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all">
                      <SelectValue placeholder="Select your career goal" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-950 border-zinc-800">
                      {careerGoals.map((goal) => (
                        <SelectItem
                          key={goal}
                          value={goal}
                          className="text-zinc-100 focus:bg-teal-500/10 focus:text-teal-400"
                        >
                          {goal}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Sign in with Google */}
                <Button
                  onClick={handleGoogleSignIn}
                  disabled={loading} // returning users can sign in without refilling
                  className="w-full bg-teal-500 text-black hover:bg-teal-600 shadow-[0_0_20px_rgba(20,184,166,0.3)] hover:shadow-[0_0_30px_rgba(20,184,166,0.5)] transition-all duration-300 disabled:opacity-50 disabled:shadow-none"
                >
                  {loading ? 'Signing in...' : 'Sign in with Google'}
                </Button>

                {/* Continue as Guest */}
                <Button
                  onClick={handleContinueAsGuest}
                  disabled={!major || !careerGoal}
                  variant="outline"
                  className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:border-teal-500/50 hover:shadow-[0_0_15px_rgba(20,184,166,0.2)] transition-all duration-300"
                >
                  Continue as Guest
                </Button>

                <p className="text-xs text-center text-zinc-500">
                  Sign in to save your preferences, rate events, and get personalized recommendations.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      {loading && (
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
            <p className="text-white">Creating your profile...</p>
          </div>
        </div>
      )}
    </div>
  )
}
