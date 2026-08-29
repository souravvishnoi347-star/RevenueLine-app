import { NextResponse } from 'next/server';

const META_TOKEN = process.env.META_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'revenueline';

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Check if this is a WhatsApp status update
    if (!body.entry?.[0]?.changes?.[0]?.value?.messages) {
      return NextResponse.json({ status: 'ignored' }, { status: 200 });
    }

    const messageObj = body.entry[0].changes[0].value.messages[0];
    const contactObj = body.entry[0].changes[0].value.contacts[0];
    
    const phone = messageObj.from;
    const name = contactObj.profile.name;
    const message = messageObj.text?.body || '';

    if (!message) {
      return NextResponse.json({ status: 'no_text' }, { status: 200 });
    }

    // 1. Call Gemini AI via direct HTTP fetch
    const prompt = `You are a friendly real estate agent. User "${name}" messaged: '${message}'.

1. Reply politely and helpful.
2. Qualify them (is_qualified=true if they want to buy/invest).
3. Set show_property=true IF they mention locations (e.g. Delhi, Mumbai) OR ask for properties.

RETURN STRICT JSON ONLY:
{"reply":"...", "is_qualified":true/false, "show_property":true/false}`;

    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { response_mime_type: 'application/json' }
      })
    });

    const geminiData = await geminiRes.json();
    const aiResult = JSON.parse(geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}');

    // 2. Send Telegram Alert (if qualified)
    if (aiResult.is_qualified && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      const telegramText = `🔥 HOT LEAD!\nName: ${name}\nPhone: ${phone}\nMessage: ${message}`;
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: telegramText
        })
      });
    }

    // 3. Send WhatsApp Reply
    let waPayload: any = {
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body: aiResult.reply || "Thanks for reaching out! How can I help you?" }
    };

    if (aiResult.show_property) {
      waPayload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "interactive",
        interactive: {
          type: "button",
          header: {
            type: "image",
            image: { link: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80" }
          },
          body: {
            text: `${aiResult.reply}\n\nHere is a beautiful premium property we recommend for you. Would you like to schedule a visit?`
          },
          action: {
            buttons: [
              { type: "reply", reply: { id: "btn_book", title: "Book Visit" } },
              { type: "reply", reply: { id: "btn_agent", title: "Talk to Agent" } }
            ]
          }
        }
      };
    }

    await fetch(`https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${META_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(waPayload)
    });

    return NextResponse.json({ status: 'success' }, { status: 200 });

  } catch (error) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
