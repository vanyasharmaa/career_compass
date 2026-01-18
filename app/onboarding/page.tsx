import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Header } from "@/components/ui/header"

export default function OnboardingPage() {
  return (
    <div className="min-h-screen">
      <Header />
      
      <main className="mx-auto max-w-7xl px-6 py-12">
        <section className="mx-auto w-full max-w-xl space-y-8">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-teal-400">
              Step 1 · Your profile
            </p>
            <h2 className="text-3xl font-semibold">
              Let's personalize your journey
            </h2>
            <p className="text-sm text-zinc-400">
              Tell us a bit about yourself so CareerCompass can surface the right
              events, clubs, and workshops.
            </p>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label className="text-zinc-300">Major / Degree</Label>
              <Input
                placeholder="e.g. BSc Statistics"
                className="bg-zinc-950 border-zinc-800"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300">Career goal</Label>
              <Input
                placeholder="e.g. Data Analyst, SWE"
                className="bg-zinc-950 border-zinc-800"
              />
            </div>

            <Button className="w-full bg-teal-500 text-black hover:bg-teal-600">
              Continue
            </Button>
          </div>
        </section>
      </main>
    </div>
  )
}