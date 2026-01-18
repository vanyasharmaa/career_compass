// app/page.tsx
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import Link from "next/link"
import Image from "next/image"

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="flex flex-col items-center gap-8">
        
        {/* Logo floating above card */}
        <Image
          src="/logo.png"
          alt="CareerCompass"
          width={280}
          height={70}
          priority
        />

        {/* Card with teal glow */}
        <Card className="w-full max-w-2xl border-zinc-800 bg-zinc-950/60 shadow-[0_0_50px_rgba(20,184,166,0.15)] hover:shadow-[0_0_80px_rgba(20,184,166,0.25)] transition-shadow duration-300">
          <CardContent className="flex flex-col items-center gap-6 px-8 py-12 text-center">
            
            <h1 className="text-2xl font-semibold tracking-tight">
              Your dream career, one event at a time
            </h1>

            <p className="text-lg text-zinc-400">
              Discover campus clubs, events, and opportunities that align with your
              goals.
            </p>

            <Link href="/onboarding">
              <Button
                size="lg"
                className="mt-2 bg-teal-500 text-black hover:bg-teal-600"
              >
                Get started
              </Button>
            </Link>

            <div className="mt-6 grid gap-1 text-sm text-zinc-500">
              <p>• Tell us your major and goals</p>
              <p>• Get curated event recommendations</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}