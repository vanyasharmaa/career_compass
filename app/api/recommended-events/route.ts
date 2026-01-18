import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '@/lib/firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  getDoc 
} from 'firebase/firestore';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    // 1. Get user profile (fallback for testing)
    const userDoc = await getDoc(doc(db, 'users', userId || 'test-user-1'));
    const userData = userDoc.data();
    const user = userData || { 
      major: 'BSc Statistics', 
      careerGoal: 'Data Analyst' 
    };

    // 2. Get all events
    const eventsSnapshot = await getDocs(collection(db, 'events'));
    const events = eventsSnapshot.docs.map((d) => ({ 
      id: d.id, 
      ...d.data() 
    })) as any[];

    // 3. Get clubs ratings (clubName = document ID)
    const clubsSnapshot = await getDocs(collection(db, 'clubs'));
    const clubs: { [key: string]: any } = {};
    clubsSnapshot.docs.forEach((d) => {
      clubs[d.id] = d.data();
    });

    // 4. Build Gemini prompt
    const prompt = `
User Profile:
Major: ${user.major}
Career Goal: ${user.careerGoal}

Events (${events.length} total):
${events.map((event: any, i: number) => `
${i + 1}. Title: "${event.title || 'Untitled'}"
   Club: ${event.club || 'Unknown'} (rating: ${clubs[event.club]?.averageRating?.toFixed(1) || 'N/A'})
   Skills: ${Array.isArray(event.skillsGained) ? event.skillsGained.join(', ') : event.skillsGained || 'None'}
   Description: ${event.description || 'No description'}
   Deadline: ${event.deadline || 'No deadline'}
`).join('\n')}

Task: Rank TOP 3 events (or all if <3) for this user. Prioritize:
1. Skills/career goal match (Data Analyst → Python/ML/Data)
2. High club ratings (>4.0 preferred)
3. Earlier deadlines

Respond with VALID JSON only:
{
  "recommendations": [
    {
      "eventId": "actual-event-id-from-firestore",
      "rank": 1,
      "title": "event title",
      "reason": "1 sentence explanation why recommended",
      "matchScore": 9.5
    }
  ]
}
`;

    // 5. Call Gemini
   const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
   const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // 6. Safely parse JSON response
    let recommendations;
    try {
      recommendations = JSON.parse(text);
    } catch {
      // Fallback if Gemini doesn't return perfect JSON
      recommendations = { recommendations: [] };
    }

    return NextResponse.json({ 
      success: true, 
      recommendations: recommendations.recommendations || [],
      debug: { user, eventsCount: events.length, promptLength: prompt.length }
    });

  } catch (error: any) {
    console.error('Gemini API error:', error);
    return NextResponse.json(
      { 
        error: 'Gemini failed', 
        details: error.message || String(error) 
      }, 
      { status: 500 }
    );
  }
}