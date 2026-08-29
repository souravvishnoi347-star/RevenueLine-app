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

    // 1. Get AI Reply (Simple Text - No JSON Parsing to avoid crashes)
    const prompt = `You are a friendly real estate agent. User "${name}" messaged: '${message}'. Reply politely and helpfully. Keep it conversational.`;
    
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const geminiData = await geminiRes.json();
    const replyText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Thanks for reaching out! How can I help you today?";

    // 2. Send Telegram Alert
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: `🔥 NEW MESSAGE!\nName: ${name}\nPhone: ${phone}\nMessage: ${message}` })
      });
    }

    // 3. Send WhatsApp Reply
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
