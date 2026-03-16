import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, collection, onSnapshot } from 'firebase/firestore';
import fs from 'fs';

// Read firebase config
const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const appFirebase = initializeApp(firebaseConfig);
const db = getFirestore(appFirebase, firebaseConfig.firestoreDatabaseId);

const activeBots = new Map<string, { token: string, lastUpdateId: number, active: boolean }>();

async function processUpdate(botId: string, token: string, update: any) {
  try {
    // Track user statistics
    if (update.message && update.message.from) {
      const userId = update.message.from.id.toString();
      const userRef = doc(db, `bots/${botId}/users`, userId);
      getDoc(userRef).then((userDoc) => {
        if (!userDoc.exists()) {
          setDoc(userRef, {
            id: userId,
            username: update.message.from.username || '',
            firstName: update.message.from.first_name || '',
            lastSeen: new Date().toISOString()
          }, { merge: true }).catch(console.error);
        }
      });
    }

    const rulesDoc = await getDoc(doc(db, 'bot_rules', botId));
    if (!rulesDoc.exists()) return;

    const { rules } = rulesDoc.data();
    if (!rules || rules.length === 0) return;

    if (update.message && update.message.text) {
      const text = update.message.text;
      const chatId = update.message.chat.id;

      let matchedRule = null;
      for (const rule of rules) {
        if (rule.triggerType === 'command' && text.startsWith(rule.triggerValue)) {
          matchedRule = rule;
          break;
        } else if (rule.triggerType === 'text_match' && text.includes(rule.triggerValue)) {
          matchedRule = rule;
          break;
        } else if (rule.triggerType === 'exact_match' && text === rule.triggerValue) {
          matchedRule = rule;
          break;
        } else if (rule.triggerType === 'any') {
          matchedRule = rule;
          break;
        }
      }

      if (matchedRule) {
        if (matchedRule.responseType === 'image' && matchedRule.imageUrl) {
          await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              photo: matchedRule.imageUrl,
              caption: matchedRule.responseValue || ''
            })
          });
        } else {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: matchedRule.responseValue || ''
            })
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error processing update for bot ${botId}:`, error);
  }
}

async function pollBot(botId: string) {
  const bot = activeBots.get(botId);
  if (!bot || !bot.active) return;

  try {
    const res = await fetch(`https://api.telegram.org/bot${bot.token}/getUpdates?offset=${bot.lastUpdateId + 1}&timeout=30`);
    const data = await res.json();
    
    if (data.ok && data.result.length > 0) {
      for (const update of data.result) {
        bot.lastUpdateId = update.update_id;
        await processUpdate(botId, bot.token, update);
      }
    }
  } catch (err) {
    console.error(`Polling error for ${botId}:`, err);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  if (bot.active) {
    setTimeout(() => pollBot(botId), 1000);
  }
}

function startPolling(botId: string, token: string) {
  if (activeBots.has(botId)) return;
  
  console.log(`Starting polling for bot ${botId}`);
  fetch(`https://api.telegram.org/bot${token}/deleteWebhook`).then(() => {
    activeBots.set(botId, { token, lastUpdateId: 0, active: true });
    pollBot(botId);
  }).catch(console.error);
}

function stopPolling(botId: string) {
  const bot = activeBots.get(botId);
  if (bot) {
    bot.active = false;
    activeBots.delete(botId);
    console.log(`Stopped polling for bot ${botId}`);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Start polling for all bots
  onSnapshot(collection(db, 'bots'), (snapshot) => {
    const currentBotIds = new Set<string>();
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.token && data.isActive !== false) {
        currentBotIds.add(data.botId);
        startPolling(data.botId, data.token);
      }
    });
    
    for (const botId of activeBots.keys()) {
      if (!currentBotIds.has(botId)) {
        stopPolling(botId);
      }
    }
  });

  // API Route: Register Bot (Kept for backward compatibility if needed)
  app.post('/api/register-bot', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token is required' });

    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const tgData = await tgRes.json();
      
      if (!tgData.ok) {
        return res.status(400).json({ error: 'Invalid Telegram token' });
      }

      const botId = tgData.result.id.toString();
      const username = tgData.result.username;
      const name = tgData.result.first_name;

      res.json({ botId, username, name });
    } catch (error) {
      console.error('Error registering bot:', error);
      res.status(500).json({ error: 'Internal server error' });
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
