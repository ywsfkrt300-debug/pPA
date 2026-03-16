import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, collection, onSnapshot, getDocs } from 'firebase/firestore';
import fs from 'fs';

// Read firebase config
const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const appFirebase = initializeApp(firebaseConfig);
const db = getFirestore(appFirebase, firebaseConfig.firestoreDatabaseId);

const activeBots = new Map<string, { token: string, lastUpdateId: number, active: boolean }>();

async function processUpdate(botId: string, token: string, update: any) {
  try {
    let isBanned = false;
    let isUnlocked = false;
    let messageCount = 0;
    let maxMessages = 0;
    let botPassword = '';

    // Fetch bot settings
    const botDoc = await getDoc(doc(db, 'bots', botId));
    if (botDoc.exists()) {
      const botData = botDoc.data();
      maxMessages = botData.maxMessages || 0;
      botPassword = botData.password || '';
    }

    // Track user statistics and check ban/limits/password
    if (update.message && update.message.from) {
      const userId = update.message.from.id.toString();
      const userRef = doc(db, `bots/${botId}/users`, userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        await setDoc(userRef, {
          id: userId,
          username: update.message.from.username || '',
          firstName: update.message.from.first_name || '',
          lastSeen: new Date().toISOString(),
          messageCount: 1,
          isBanned: false,
          isUnlocked: botPassword === '' // If no password, user is unlocked
        }, { merge: true });
        messageCount = 1;
        isUnlocked = botPassword === '';
      } else {
        const userData = userDoc.data();
        isBanned = userData.isBanned === true;
        isUnlocked = userData.isUnlocked === true || botPassword === '';
        messageCount = (userData.messageCount || 0) + 1;
        
        if (!isBanned) {
          await setDoc(userRef, {
            username: update.message.from.username || '',
            firstName: update.message.from.first_name || '',
            lastSeen: new Date().toISOString(),
            messageCount: messageCount
          }, { merge: true });
        }
      }

      // Handle password protection
      if (!isBanned && botPassword !== '' && !isUnlocked) {
        const userText = update.message.text || '';
        if (userText === botPassword) {
          await setDoc(userRef, { isUnlocked: true }, { merge: true });
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: update.message.chat.id,
              text: '✅ تم التحقق من كلمة السر بنجاح! يمكنك الآن استخدام البوت.'
            })
          });
        } else {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: update.message.chat.id,
              text: '🔒 هذا البوت محمي بكلمة سر. يرجى إرسال كلمة السر الصحيحة للمتابعة.'
            })
          });
        }
        return; // Stop processing further for locked users
      }
    }

    // If user is banned, ignore the message
    if (isBanned) {
      return;
    }

    // If user exceeded message limit, send a warning and ignore
    if (maxMessages > 0 && messageCount > maxMessages) {
      if (update.message && update.message.chat) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: update.message.chat.id,
            text: 'عذراً، لقد تجاوزت الحد الأقصى للرسائل المسموح بها في هذا البوت.'
          })
        });
      }
      return;
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
  const existingBot = activeBots.get(botId);
  if (existingBot) {
    if (existingBot.token !== token) {
      console.log(`Updating token for bot ${botId}`);
      existingBot.token = token;
    }
    return;
  }
  
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

  // API Route: Send Broadcast Message
  app.post('/api/broadcast', async (req, res) => {
    const { botId, message } = req.body;
    console.log(`Broadcast request for bot ${botId}: ${message}`);
    if (!botId || !message) return res.status(400).json({ error: 'Bot ID and message are required' });

    const bot = activeBots.get(botId);
    if (!bot) {
      console.log(`Bot ${botId} not found in activeBots. Active bots:`, Array.from(activeBots.keys()));
      return res.status(404).json({ error: 'Bot is not active or not found' });
    }

    try {
      const usersSnapshot = await getDocs(collection(db, `bots/${botId}/users`));
      console.log(`Found ${usersSnapshot.size} users for broadcast`);
      const results = { success: 0, failed: 0 };

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        try {
          const tgRes = await fetch(`https://api.telegram.org/bot${bot.token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: userId,
              text: message
            })
          });
          const tgData = await tgRes.json();
          if (tgData.ok) results.success++;
          else {
            console.error(`Failed to send broadcast to ${userId}:`, tgData);
            results.failed++;
          }
        } catch (err) {
          console.error(`Error sending broadcast to ${userId}:`, err);
          results.failed++;
        }
      }

      res.json(results);
    } catch (error) {
      console.error('Error sending broadcast:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // API Route: Send Direct Message
  app.post('/api/send-message', async (req, res) => {
    const { botId, userId, message } = req.body;
    console.log(`Direct message request: bot ${botId}, user ${userId}`);
    if (!botId || !userId || !message) return res.status(400).json({ error: 'Bot ID, User ID and message are required' });

    const bot = activeBots.get(botId);
    if (!bot) {
      console.log(`Bot ${botId} not found in activeBots. Active bots:`, Array.from(activeBots.keys()));
      return res.status(404).json({ error: 'Bot is not active or not found' });
    }

    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${bot.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: userId,
          text: message
        })
      });
      const tgData = await tgRes.json();
      
      if (tgData.ok) {
        res.json({ success: true });
      } else {
        console.error(`Failed to send direct message to ${userId}:`, tgData);
        res.status(400).json({ error: tgData.description || 'Failed to send message' });
      }
    } catch (error) {
      console.error('Error sending direct message:', error);
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
