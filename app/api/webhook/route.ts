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

    const prompt = `You are a highly professional real estate consultant in Mumbai. Client "${name}" says: "${message}"

INVENTORY:
- 3BHK Seawoods Navi Mumbai | 1.35 Cr
- 2BHK Kharghar Navi Mumbai | 95 Lacs
- 3BHK Malad West | 2.10 Cr
- 1BHK Thane West | 75 Lacs

RULES: Max 2 sentences. No bullet points. Don't say "Hi". Pitch politely.`;
    
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`, {
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
