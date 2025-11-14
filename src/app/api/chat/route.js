import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; 

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-004'; 

async function getEmbedding(text) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set.');

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;

  let response;
  for (let i = 0; i < 5; i++) {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: {
          parts: [{ text: text }],
        },
      }),
    });
    if (response.ok) break;
    if (response.status === 429 || response.status >= 500) {
      await new Promise(resolve => setTimeout(resolve, 2 ** i * 1000));
    } else {
      break;
    }
  }

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Embedding API failed: ${error.error.message}`);
  }

  const data = await response.json();
  return data.embedding.values;
}

async function getGeminiResponse(augmentedPrompt) {
  if (!GEMINI_API_KEY) throw new Error('API key not found.');

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;
  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: augmentedPrompt }],
      },
    ],
    systemInstruction: {
      parts: [
        {
          text: `You are a helpful assistant answering questions about a specific document.
- Your primary goal is to answer the user's question using the provided context.
- The user's question might be phrased differently than the document. Use your reasoning to connect synonyms and related concepts (e.g., 'planned leave' could mean 'annual leave' or 'vacation days').
- If the context *clearly* contains the answer, or you can infer the answer from the context using reasoning, provide it.
- If the question is about a specific policy, number, or detail, and you *cannot* find the answer in the context, you MUST say 'I'm sorry, i can't answer this question this is against my policy.'
- Do not answer general knowledge questions or questions completely unrelated to the document's topics.`,
        },
      ],
    },
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
      throw new Error('Failed to get response from AI.');
    }

    const data = await response.json();
    const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiText) {
      throw new Error('No text found in AI response.');
    }
    return aiText;
  } catch (error) {
    console.error('Error in getGeminiResponse:', error);
    throw error;
  }
}

async function classifyIntent(text) {
  if (!GEMINI_API_KEY) throw new Error('API key not found for intent classification.');

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;
  
  const prompt = `You are a JSON-only intent router. Classify the user's message and, if it's a greeting or small talk, provide a response.
Respond with *only* a valid JSON object matching this schema:
{"intent": "GREETING" | "QUERY", "response": "Your greeting response here" | null}

Rules:
1.  If the message is a question or query about the document (e.g., "what is...", "how many...", "tell me about..."), set "intent" to "QUERY" and "response" to null.
2.  If the message is a standard greeting ("hi", "hello", "hey"), set "intent" to "GREETING" and create a response that echoes their greeting (e.g., "Hi! How can I help you today?").
3.  If the message is a time-based greeting ("good morning", "good evening"), set "intent" to "GREETING" and echo their greeting (e.g., "Good morning! How can I help you today?").
4.  If the message is a misspelled or unusual greeting ("haoliiooo", "helooo"), set "intent" to "GREETING" and create a fun, friendly response (e.g., "Hah 😄 'Haoliiooo!' — that sounds like a cheerful greeting! How can I help you today ?").
5.  If the message is a personal or emotional statement toward the bot ("i love you", "i hate you", "i like you"), set "intent" to "GREETING" and "response" to "I'm just a bot, but I'm ready to help you today !".
6.  If it's other simple small talk ("how are you?", "what's up?"), set "intent" to "GREETING" and respond appropriately (e.g., "I'm just a bot,I can't answer this question,but i am here to help you!").

User Message: "${text}"`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 250,
      responseMimeType: "application/json",
    }
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error('Intent classification API call failed.');
    }

    const data = await response.json();
    const classificationText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!classificationText) {
      return { intent: 'QUERY', response: null }; // Default to QUERY
    }
    
    const jsonMatch = classificationText.match(/(\{.*\})/s);
    if (jsonMatch && jsonMatch[1]) {
      const jsonResponse = JSON.parse(jsonMatch[1]);
      
      if (jsonResponse.intent === 'GREETING' && jsonResponse.response) {
        return { intent: 'GREETING', response: jsonResponse.response };
      }
    }
    
    return { intent: 'QUERY', response: null };

  } catch (error) {
    console.error('Error in classifyIntent:', error);
    return { intent: 'QUERY', response: null };
  }
}


export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required.' },
        { status: 400 }
      );
    }

    const messages = await prisma.message.findMany({
      where: {
        sessionId: sessionId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return NextResponse.json(messages);
  } catch (error) {
    console.error('GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chat history.' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const { text, sessionId, isEdit, messageId } = await request.json();

    if (!text || !sessionId) {
      return NextResponse.json(
        { error: 'Text and Session ID are required.' },
        { status: 400 }
      );
    }

    if (isEdit) {
      if (!messageId) {
        return NextResponse.json(
          { error: 'Message ID is required for edits.' },
          { status: 400 }
        );
      }

      const originalMessage = await prisma.message.findUnique({
        where: { id: messageId },
      });

      if (!originalMessage || originalMessage.sessionId !== sessionId) {
        return NextResponse.json(
          { error: 'Message not found or unauthorized.' },
          { status: 404 }
        );
      }

      await prisma.message.deleteMany({
        where: {
          sessionId: sessionId,
          createdAt: {
            gt: originalMessage.createdAt, // 'gt' means "greater than"
          },
        },
      });

      const userMessage = await prisma.message.update({
        where: { id: messageId },
        data: { text: text },
      });
      


    } else {
      
      
      const userMessage = await prisma.message.create({
        data: {
          text: text,
          role: 'user',
          sessionId: sessionId,
        },
      });
    }

    const { intent, response: greetingResponse } = await classifyIntent(text);
    
    let aiText; 

    if (intent === 'GREETING' && greetingResponse) {
      aiText = greetingResponse;
    
    } else {
      const queryVector = await getEmbedding(text);
      const allChunks = await prisma.documentChunk.findMany({
        select: {
          id: true,
          content: true,
          embedding: true,
        },
      });
      function cosineSimilarity(vecA, vecB) {
        if (vecA.length !== vecB.length) {
          throw new Error('Vectors must have the same length');
        }
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < vecA.length; i++) {
          dotProduct += vecA[i] * vecB[i];
          normA += vecA[i] * vecA[i];
          normB += vecB[i] * vecB[i];
        }

        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        if (denominator === 0) return 0;
        return dotProduct / denominator;
      }
      const chunksWithSimilarity = allChunks.map((chunk) => {
        let chunkEmbedding;
        if (Array.isArray(chunk.embedding)) {
          chunkEmbedding = chunk.embedding;
        } else {
          try {
            chunkEmbedding = JSON.parse(chunk.embedding);
          } catch(e) {
            console.error("Failed to parse embedding:", chunk.id);
            chunkEmbedding = [];
          }
        }
        
        if (chunkEmbedding.length !== queryVector.length) {
           console.warn(`Embedding length mismatch for chunk ${chunk.id}. Skipping.`);
           return { content: chunk.content, similarity: 0 };
        }

        const similarity = cosineSimilarity(queryVector, chunkEmbedding);
        return {
          content: chunk.content,
          similarity: similarity,
        };
      });
      const relevantChunks = chunksWithSimilarity
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 3);
      const context = relevantChunks
        .map((chunk) => chunk.content)
        .join('\n\n---\n\n');

      const augmentedPrompt = `
  Context:
  """
  ${context}
  """
  User Question:
  """
  ${text}
  """
`;
      aiText = await getGeminiResponse(augmentedPrompt);
    }
    


    const aiMessage = await prisma.message.create({
      data: {
        text: aiText,
        role: 'model',
        sessionId: sessionId,
      },
    });

   
   
    if (isEdit) {
      return NextResponse.json({ success: true, message: "Chat history updated." });
    }

    const finalUserMessage = isEdit ? null : await prisma.message.findFirst({
        where: { sessionId: sessionId, text: text, role: 'user' },
        orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ userMessage: finalUserMessage, aiMessage });
  } catch (error) {
    console.error('POST Error:', error);
    return NextResponse.json(
      { error: 'Failed to process your message.' },
      { status: 500 }
    );
  }
}