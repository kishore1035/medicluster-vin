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

  mockOmni.post('/v1/chat/completions', (req, res) => {
    requestedModel = req.body.model;
    receivedMessages = req.body.messages;
    res.json({
      choices: [
        {
          message: {
            content: '1. **Name of the disease**: Mock Dermatitis\n2. **Cause**: Test stimulus\n3. **How to prevent it**: Cleanse area\n4. **How to diagnose it**: Visual inspection\n5. **Which hospital to go nearby**: General Clinic'
          }
        }
      ]
    });
  });

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
    assert.equal(data.model, 'agy/gemini-3.1-flash-lite');
    assert.match(data.reply, /Name of the disease/);
    assert.equal(requestedModel, 'agy/gemini-3.1-flash-lite');
    assert.ok(receivedMessages.length >= 2);
  }

  // 2. Vision multimodal image routing
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
    assert.equal(data.model, 'agy/gemini-3.1-flash-lite');
    assert.equal(requestedModel, 'agy/gemini-3.1-flash-lite');
    const userTurn = receivedMessages.find(m => m.role === 'user');
    assert.ok(Array.isArray(userTurn.content));
    assert.ok(userTurn.content.some(part => part.type === 'image_url'));
  }

  // 3. Fallback path when OmniRoute returns 500 error
  {
    mockOmni.post('/v1/chat/completions', (req, res) => {
      res.status(500).json({ error: 'OmniRoute temporary upstream failure' });
    });

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
});
