import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// --- Configuration ---
const YOUR_DOCUMENT_PATH = path.join(process.cwd(), 'document.txt');
const CHUNK_SIZE = 1000; // Size of each text chunk in characters
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-004';

async function getEmbedding(text) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set.');

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;

  // Simple exponential backoff for retries
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
      console.log(`Retrying chunk... (attempt ${i + 1})`);
      await new Promise(resolve => setTimeout(resolve, (2 ** i) * 1000));
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

async function main() {
  console.log('Starting document ingestion...');

  try {
    const documentContent = fs.readFileSync(YOUR_DOCUMENT_PATH, 'utf-8');
    if (!documentContent) {
      console.error('Error: document.txt is empty or not found.');
      return;
    }

    const chunks = [];
    for (let i = 0; i < documentContent.length; i += CHUNK_SIZE) {
      chunks.push(documentContent.substring(i, i + CHUNK_SIZE));
    }
    console.log(`Document split into ${chunks.length} chunks.`);

    console.log('Generating embeddings and storing in database...');
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      const embedding = await getEmbedding(chunk);


      await prisma.documentChunk.create({
        data: {
          id: `chunk_${Date.now()}_${i}`,
          content: chunk,
          embedding: embedding,
        },
      });
      
      console.log(`Processed chunk ${i + 1} of ${chunks.length}`);
    }

    console.log('Ingestion complete! Your document is now in the vector DB.');

  } catch (error) {
    console.error('Ingestion failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();