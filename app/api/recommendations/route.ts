// app/api/recommendations/route.ts - COMPLETE UPDATED VERSION
// COPY THIS ENTIRE FILE and replace your current one

import { GoogleGenerativeAI } from "@google/generative-ai"
import { NextResponse } from "next/server"
import { collection, getDocs, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase"

export async function POST(req: Request) {
  try {
    const { userProfile, events, userRatings } = await req.json()

    if (!userProfile || !events || events.length === 0) {
      return NextResponse.json(
        { error: 'Missing userProfile or events' },
        { status: 400 }
      )
    }

    console.log(`📊 Analyzing ${events.length} events for ${userProfile.careerGoal}`)

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model = genAI.getGenerativeModel({ model: "gemma-3-27b-it" })


    let historyContext = ""
    if (userRatings && userRatings.length > 0) {
      historyContext = `User's past ratings:\n${userRatings
        .map((r: any) => `- Rated "${r.eventTitle}" ${r.rating}/5 stars`)
        .join("\n")}\n\n`
    }

    const prompt = `You are a career advisor AI helping a university student find relevant campus events.

USER PROFILE
- Major: ${userProfile.major}
- Career Goal: ${userProfile.careerGoal}

${historyContext}

AVAILABLE EVENTS
${events
  .map(
    (event: any, index: number) => `
Event ${index + 1}
- Title: ${event.title}
- ID: ${event.id}
- Description: ${event.description}
- Career Paths: ${event.careerPaths?.join(", ") || "N/A"}
- Skills Learned: ${event.skillsLearned?.join(", ") || "N/A"}
- Date: ${event.date || "TBD"}
- Location: ${event.location || "TBD"}
- Event Rating: ${event.averageRating ? event.averageRating.toFixed(1) + "/5" : "No rating"}
- Club: ${event.club}
`
  )
  .join("---\n")}

RANKING CRITERIA
1. Career Path Alignment (40%): Match with ${userProfile.careerGoal}
2. Skills Relevance (30%): Skills that help their career goal
3. Event Quality (20%): Higher rated events
4. Club Reputation (10%): Trustworthy clubs

TASK
Rank ALL ${events.length} events from MOST to LEAST relevant for this student.
Return ONLY a JSON array of event IDs in ranked order like: ["event-id-1", "event-id-2", "event-id-3"]
Do not include any explanation, just the JSON array.`

    console.log("🤖 Calling Gemini API...")
    const result = await model.generateContent(prompt)
    const text = result.response.text().trim()

    console.log("📝 Gemini response:", text)

    // Clean response
    let cleanText = text
    if (cleanText.startsWith("```json")) {
      cleanText = cleanText.replace("```json", "").replace("```", "").trim()
    } else if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace("```", "").replace("```", "").trim()
    }

    let rankedEventIds: string[]
    try {
      rankedEventIds = JSON.parse(cleanText)
    } catch (error) {
      console.error("❌ Parse error, using fallback:", error)
      return NextResponse.json(
        {
          rankedEvents: events.sort((a: any, b: any) => (b.averageRating || 0) - (a.averageRating || 0)),
          reasoning: "Fallback sorted by rating",
          usedFallback: true,
        }
      )
    }

    // Reorder events by AI ranking
    const rankedEvents = rankedEventIds
      .map((id: string) => events.find((e: any) => e.id === id))
      .filter(Boolean)

    // Add any missed events at the end
    const includedIds = new Set(rankedEventIds)
    const missedEvents = events.filter((e: any) => !includedIds.has(e.id))
    const finalRanking = [...rankedEvents, ...missedEvents]

    console.log(`✅ Ranked ${finalRanking.map((e: any) => e.title).join(", ")}`)

    return NextResponse.json({
      rankedEvents: finalRanking,
      reasoning: `AI ranked ${finalRanking.length} events for ${userProfile.careerGoal}`,
      usedFallback: false,
    })
  } catch (error: any) {
    console.error("❌ Error:", error.message)

    // Fallback sort by rating
    try {
      const { events } = await req.json()
      return NextResponse.json({
        rankedEvents: events.sort((a: any, b: any) => (b.averageRating || 0) - (a.averageRating || 0)),
        reasoning: "Fallback due to API error",
        usedFallback: true,
      })
    } catch {
      return NextResponse.json(
        { error: "Failed to get recommendations", details: error.message },
        { status: 500 }
      )
    }
  }
}