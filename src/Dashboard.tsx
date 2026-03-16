import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { db } from './firebase';
import { collection, query, where, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { Bot, Plus, LogOut, Settings, ExternalLink } from 'lucide-react';

interface BotData {
  uid: string;
  botId: string;
  name: string;
  username: string;
  createdAt: string;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [bots, setBots] = useState<BotData[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'bots'), where('uid', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const botsData = snapshot.docs.map((doc) => doc.data() as BotData);
      setBots(botsData);
    });
    return unsubscribe;
  }, [user]);

  const handleAddBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !user) return;
    setLoading(true);
    setError('');

    try {
      // 1. Verify token with Telegram directly from frontend
      const tgRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const tgData = await tgRes.json();
      
      if (!tgData.ok) {
        throw new Error('Invalid Telegram token. Please check and try again.');
      }

      const botId = tgData.result.id.toString();
      const username = tgData.result.username;
      const name = tgData.result.first_name;

      // 2. Save to Firestore
      const botRef = doc(db, 'bots', botId);
      await setDoc(botRef, {
        uid: user.uid,
        botId: botId,
        name: name,
        username: username,
        token: token,
        createdAt: new Date().toISOString(),
      });

      // 3. Initialize rules
      const rulesRef = doc(db, 'bot_rules', botId);
      await setDoc(rulesRef, {
        uid: user.uid,
        rules: [],
      }, { merge: true });

      // 4. Try to set Webhook (Points to the current domain)
      const currentHost = window.location.origin;
      const webhookUrl = `${currentHost}/api/webhook/${botId}`;
      await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${webhookUrl}`);

      setShowAddModal(false);
      setToken('');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to add bot. Make sure the token is correct.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Bot className="h-8 w-8 text-indigo-600" />
              <span className="ml-2 text-xl font-bold text-slate-900">Bot Manager</span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-slate-600">{user?.email}</span>
              <button
                onClick={logout}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
                title="Log out"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Your Bots</h1>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-sm font-medium text-sm"
          >
            <Plus className="h-5 w-5 mr-1" />
            Add Bot
          </button>
        </div>

        {bots.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 border-dashed">
            <Bot className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-4 text-sm font-medium text-slate-900">No bots</h3>
            <p className="mt-1 text-sm text-slate-500">Get started by adding a new Telegram bot.</p>
            <div className="mt-6">
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-xl text-white bg-indigo-600 hover:bg-indigo-700"
              >
                <Plus className="h-5 w-5 mr-2" />
                Add Bot
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {bots.map((bot) => (
              <div key={bot.botId} className="bg-white overflow-hidden shadow-sm rounded-2xl border border-slate-200 hover:shadow-md transition-shadow">
                <div className="p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 bg-indigo-100 rounded-xl p-3">
                      <Bot className="h-6 w-6 text-indigo-600" />
                    </div>
                    <div className="ml-4 flex-1">
                      <h3 className="text-lg font-semibold text-slate-900 truncate">{bot.name}</h3>
                      <p className="text-sm text-slate-500">@{bot.username}</p>
                    </div>
                  </div>
                  <div className="mt-6 flex space-x-3">
                    <Link
                      to={`/bot/${bot.botId}`}
                      className="flex-1 flex justify-center items-center px-4 py-2 border border-slate-300 shadow-sm text-sm font-medium rounded-xl text-slate-700 bg-white hover:bg-slate-50 transition-colors"
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Configure
                    </Link>
                    <a
                      href={`https://t.me/${bot.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-none flex justify-center items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-xl text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/75 transition-opacity" onClick={() => setShowAddModal(false)}></div>
          <div className="relative bg-white rounded-2xl text-left overflow-hidden shadow-xl transform transition-all w-full max-w-lg">
            <form onSubmit={handleAddBot}>
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 className="text-lg leading-6 font-medium text-slate-900 mb-4">Add new Telegram Bot</h3>
                  <p className="text-sm text-slate-500 mb-4">
                    Get a bot token from <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">@BotFather</a> on Telegram and paste it below.
                  </p>
                  <div>
                    <label htmlFor="token" className="block text-sm font-medium text-slate-700">Bot Token</label>
                    <input
                      type="text"
                      id="token"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      className="mt-1 block w-full border border-slate-300 rounded-xl shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                      required
                    />
                  </div>
                  {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
                </div>
                <div className="bg-slate-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full inline-flex justify-center rounded-xl border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    {loading ? 'Adding...' : 'Add Bot'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="mt-3 w-full inline-flex justify-center rounded-xl border border-slate-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
        </div>
      )}
    </div>
  );
}
