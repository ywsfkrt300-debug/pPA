import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import fs from 'fs';

// Read firebase config
const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const appFirebase = initializeApp(firebaseConfig);
const db = getFirestore(appFirebase, firebaseConfig.firestoreDatabaseId);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Register Bot
  app.post('/api/register-bot', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token is required' });

    try {
      // Verify token with Telegram
      const tgRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const tgData = await tgRes.json();
      
      if (!tgData.ok) {
        return res.status(400).json({ error: 'Invalid Telegram token' });
      }

      const botId = tgData.result.id.toString();
      const username = tgData.result.username;
      const name = tgData.result.first_name;

      // Set Webhook
      const appUrl = process.env.APP_URL;
      if (!appUrl) {
        return res.status(500).json({ error: 'APP_URL is not configured' });
      }

      const webhookUrl = `${appUrl}/api/webhook/${botId}`;
      const webhookRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${webhookUrl}`);
      const webhookData = await webhookRes.json();

      if (!webhookData.ok) {
        return res.status(500).json({ error: 'Failed to set webhook' });
      }

      res.json({ botId, username, name });
    } catch (error) {
      console.error('Error registering bot:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // API Route: Telegram Webhook
  app.post('/api/webhook/:botId', async (req, res) => {
    const { botId } = req.params;
    const update = req.body;

    // Telegram expects a 200 OK quickly. We can also reply directly in the response.
    try {
      const rulesDoc = await getDoc(doc(db, 'bot_rules', botId));
      if (!rulesDoc.exists()) {
        return res.status(200).send('OK'); // No rules, ignore
      }

      const { rules } = rulesDoc.data();
      if (!rules || rules.length === 0) {
        return res.status(200).send('OK'); // No rules, ignore
      }

      // Process message
      if (update.message && update.message.text) {
        const text = update.message.text;
        const chatId = update.message.chat.id;

        // Find matching rule
        let matchedResponse = null;
        for (const rule of rules) {
          if (rule.triggerType === 'command' && text.startsWith(rule.triggerValue)) {
            matchedResponse = rule.responseValue;
            break;
          } else if (rule.triggerType === 'text_match' && text.includes(rule.triggerValue)) {
            matchedResponse = rule.responseValue;
            break;
          } else if (rule.triggerType === 'any') {
            matchedResponse = rule.responseValue;
            break;
          }
        }

        if (matchedResponse) {
          // Reply via webhook response!
          return res.status(200).json({
            method: 'sendMessage',
            chat_id: chatId,
            text: matchedResponse
          });
        }
      }

      res.status(200).send('OK');
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(200).send('OK'); // Always return 200 to Telegram
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
