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

    // 🔥 HUMAN AGENT PROMPT WITH INVENTORY 🔥
    const prompt = `You are a top-tier human real estate agent in Mumbai. You are chatting with a client named "${name}" on WhatsApp.
Client's message: "${message}"

YOUR EXCLUSIVE INVENTORY:
- 3BHK in Seawoods, Navi Mumbai | Price: 1.35 Cr | Ready to move, premium tower, great rental yield.
- 2BHK in Kharghar, Navi Mumbai | Price: 95 Lacs | Near metro, good appreciation.
- 3BHK in Malad West, Mumbai | Price: 2.10 Cr | Premium tower, sea view.
- 1BHK in Thane West | Price: 75 Lacs | Under construction, high ROI.

CRITICAL RULES:
1. Be extremely short and concise (1-3 sentences). Type like a real human.
2. NEVER use bullet points, asterisks, or formal formatting. 
3. NEVER say "Hi", "Hello", or "Thanks". Assume continuous conversation.
4. If their requirement matches your inventory, pitch the property naturally and ask if they want to schedule a site visit this weekend.
5. If it doesn't match, tell them you have some off-market options and ask a follow-up question.`;
    
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const geminiData = await geminiRes.json();
    
    let replyText = "Ah, getting a lot of client calls right now. Let me check my inventory and text you back in a bit!";
    if (geminiData.candidates?.[0]?.content?.parts?.[0]?.text) {
        replyText = geminiData.candidates[0].content.parts[0].text;
    } else if (geminiData.error) {
        console.error("Gemini API Error:", geminiData.error);
    }

    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: `🔥 NEW MESSAGE!\nName: ${name}\nPhone: ${phone}\nMessage: ${message}\nBot Reply: ${replyText}` })
      });
    }

    await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "text", text: { body: replyText } })
    });

    return NextResponse.json({ status: 'success' }, { status: 200 });
  } catch (error) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
      }
}
