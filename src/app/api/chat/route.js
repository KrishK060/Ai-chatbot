import { NextResponse } from 'next/server';


export async function POST(req) {
  const { messages } = await req.json();

  
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'API key not found.' }, { status: 500 });
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

  const payload = {
    contents: messages,
   
  };

  try {
   
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.json();
      console.error('Gemini API Error:', errorBody);
      return NextResponse.json(
        { error: 'Failed to get response from AI.' },
        { status: response.status }
      );
    }

    const data = await response.json();

    const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiText) {
     
      return NextResponse.json(
        { error: 'No text found in AI response.' },
        { status: 500 }
      );
    }


    return NextResponse.json({ text: aiText });

  } catch (error) {
    console.error('Internal Server Error:', error);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}