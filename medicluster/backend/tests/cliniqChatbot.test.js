const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createTestDatabase } = require('./helpers/supabaseTestDb');

async function listen(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('CliniQ chatbot routes queries through OmniRoute proxy with multimodal vision and text', async t => {
  await createTestDatabase(t);

  const mockOmni = express();
  mockOmni.use(express.json({ limit: '20mb' }));
  let requestedModel = null;
  let receivedMessages = null;

  let mockHandler = (req, res) => {
    requestedModel = req.body.model;
    receivedMessages = req.body.messages;
    res.json({
      choices: [
        {
          message: {
            content: '### Clinical Impression\nMock Dermatitis\n\n### Recommended Specialist\nDermatology'
          }
        }
      ]
    });
  };

  mockOmni.post('/v1/chat/completions', (req, res) => mockHandler(req, res));

  const omniOrigin = await listen(t, mockOmni);

  const previous = {
    OMNIROUTE_URL: process.env.OMNIROUTE_URL,
    OMNIROUTE_API_KEY: process.env.OMNIROUTE_API_KEY,
    JWT_SECRET: process.env.JWT_SECRET
  };

  process.env.OMNIROUTE_URL = omniOrigin;
  process.env.OMNIROUTE_API_KEY = 'sk-mock-omniroute-key';
  process.env.JWT_SECRET = 'clinical-media-action-test-secret-at-least-32-characters';

  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.use('/api/media', require('../routes/mediaRoutes'));

  const origin = await listen(t, app);

  // 1. Text question routing
  {
    const res = await fetch(`${origin}/api/media/ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'I have a mild fever and itchy rash',
        chatHistory: [],
        language: 'en'
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.provider, 'omniroute');
    assert.equal(data.model, 'agy/gemini-3.8-flash-medium');
    assert.match(data.reply, /Mock Dermatitis/);
    assert.equal(requestedModel, 'agy/gemini-3.8-flash-medium');
    assert.ok(receivedMessages.length >= 2);
  }

  // 2. Vision multimodal image routing (Gemini 3.8 Flash)
  {
    const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const res = await fetch(`${origin}/api/media/ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: tinyPng,
        mediaType: 'image/png',
        question: 'Please inspect this skin lesion',
        chatHistory: [],
        language: 'en'
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.provider, 'omniroute');
    assert.equal(data.model, 'agy/gemini-3.8-flash-medium');
    assert.equal(requestedModel, 'agy/gemini-3.8-flash-medium');
    const userTurn = receivedMessages.find(m => m.role === 'user');
    assert.ok(Array.isArray(userTurn.content));
    assert.ok(userTurn.content.some(part => part.type === 'image_url'));
  }

  // 3. Multi-image routing (sending multiple photos in a single turn)
  {
    const tinyPng1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const tinyPng2 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const res = await fetch(`${origin}/api/media/ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        images: [
          { base64: tinyPng1, mediaType: 'image/png', name: 'lesion-front.png' },
          { base64: tinyPng2, mediaType: 'image/png', name: 'lesion-side.png' }
        ],
        question: 'Compare both angles of this lesion',
        chatHistory: [],
        language: 'en'
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.provider, 'omniroute');
    assert.equal(data.model, 'agy/gemini-3.8-flash-medium');
    const userTurn = receivedMessages.find(m => m.role === 'user');
    assert.ok(Array.isArray(userTurn.content));
    const imageParts = userTurn.content.filter(part => part.type === 'image_url');
    assert.equal(imageParts.length, 2);
  }

  // 3. Fallback path when OmniRoute returns 500 error
  {
    mockHandler = (req, res) => {
      res.status(500).json({ error: 'OmniRoute temporary upstream failure' });
    };

    const res = await fetch(`${origin}/api/media/ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'Any suggestions for hydration?',
        chatHistory: [],
        language: 'en'
      })
    });
    // With mock DB and no live Ollama daemon, it should return 502 safely rather than 500 unhandled crash
    assert.ok([200, 502].includes(res.status));
  }

  // 4. Conversational follow-up turn without repeating questionnaires
  {
    mockHandler = (req, res) => {
      requestedModel = req.body.model;
      receivedMessages = req.body.messages;
      res.json({
        choices: [
          {
            message: {
              content: 'You should avoid taking aspirin or ibuprofen because they can exacerbate bleeding risk. Acetaminophen is generally safer if needed.'
            }
          }
        ]
      });
    };

    const res = await fetch(`${origin}/api/media/ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'Can I take ibuprofen or aspirin for this headache?',
        chatHistory: [
          { role: 'user', content: 'Here is my head CT scan' },
          { role: 'assistant', content: '### Clinical Impression\nPossible intracranial hematoma.' }
        ],
        language: 'en'
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.provider, 'omniroute');
    assert.match(data.reply, /ibuprofen/i);
    // Verify system prompt is the conversational prompt
    const sysTurn = receivedMessages.find(m => m.role === 'system');
    assert.ok(sysTurn);
    assert.match(sysTurn.content, /ongoing clinical consultation dialogue/i);
    assert.match(sysTurn.content, /dedicated EXCLUSIVELY to medical/i);
    // Verify chatHistory is preserved in messages
    const assistantTurn = receivedMessages.find(m => m.role === 'assistant');
    assert.ok(assistantTurn);
    assert.match(assistantTurn.content, /hematoma/i);
  }
});
