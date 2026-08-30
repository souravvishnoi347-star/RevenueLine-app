export const runtime = 'edge';
import { NextResponse } from 'next/server';

const META_TOKEN = process.env.META_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('hub.mode') === 'subscribe' && searchParams.get('hub.verify_token') === (process.env.META_VERIFY_TOKEN || 'revenueline')) {
    return new NextResponse(searchParams.get('hub.challenge'), { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.entry?.[0]?.changes?.[0]?.value?.messages) return NextResponse.json({ status: 'ignored' }, { status: 200 });

    const messageObj = body.entry[0].changes[0].value.messages[0];
    const phone = messageObj.from;
    const name = body.entry[0].changes[0].value.contacts[0].profile.name;
    const message = messageObj.text?.body || '';
    if (!message) return NextResponse.json({ status: 'no_text' }, { status: 200 });

        // 🔥 1000$ PREMIUM AGENT PROMPT 🔥
    const prompt = `You are a premium, highly exclusive real estate consultant in Mumbai. Client "${name}" says: "${message}"

YOUR INVENTORY:
- 3BHK Seawoods Navi Mumbai | 1.35 Cr (Ready to move)
- 2BHK Kharghar | 95 Lacs (Near Metro)
- 3BHK Malad West | 2.10 Cr (Premium, Sea view)
- 1BHK Thane West | 75 Lacs (Under construction, high ROI)

YOUR PERSONALITY & RULES (CRITICAL):
1. Talk like a humble, helpful, and high-end human consultant. Use words like 'Bhai', 'Sir', or 'Ji' if appropriate. Mirror their language (Hindi/Hinglish/English).
2. Keep it SHORT (1-2 sentences max). No bullet points, no asterisks, no AI formatting.
3. KABHI BHI ek saath 2 ya 3 sawal mat poochna. Ask EXACTLY ONE question per message. (e.g., if you need budget and location, just ask for the budget first).
4. NEVER let the conversation die. ALWAYS end your message with ONE low-pressure question to keep them talking.
5. NEVER say "Hi", "Hello", or "Thanks". Assume continuous conversation.`;
    
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const geminiData = await geminiRes.json();
    
    let replyText = "";
    if (geminiData.candidates?.[0]?.content?.parts?.[0]?.text) {
        replyText = geminiData.candidates[0].content.parts[0].text;
    } else {
        // 🔥 ERROR DEBUGGING: Direct WhatsApp par error print hoga 🔥
        replyText = "DEBUG ERROR FROM GOOGLE API: " + JSON.stringify(geminiData);
    }

    await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "text", text: { body: replyText } })
    });

    return NextResponse.json({ status: 'success' }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
