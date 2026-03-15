import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { db } from './firebase';
import { doc, onSnapshot, updateDoc, getDoc } from 'firebase/firestore';
import { ArrowLeft, Plus, Save, Trash2, Bot, MessageSquare } from 'lucide-react';

interface Rule {
  id: string;
  triggerType: 'command' | 'text_match' | 'any';
  triggerValue: string;
  responseType: 'text';
  responseValue: string;
}

export default function BotEditor() {
  const { botId } = useParams<{ botId: string }>();
  const { user } = useAuth();
  const [botName, setBotName] = useState('');
  const [botUsername, setBotUsername] = useState('');
  const [rules, setRules] = useState<Rule[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!botId || !user) return;

    // Fetch bot details
    getDoc(doc(db, 'bots', botId)).then((docSnap) => {
      if (docSnap.exists() && docSnap.data().uid === user.uid) {
        setBotName(docSnap.data().name);
        setBotUsername(docSnap.data().username);
      }
    });

    // Listen to rules
    const unsubscribe = onSnapshot(doc(db, 'bot_rules', botId), (docSnap) => {
      if (docSnap.exists() && docSnap.data().uid === user.uid) {
        setRules(docSnap.data().rules || []);
      }
    });

    return unsubscribe;
  }, [botId, user]);

  const handleAddRule = () => {
    const newRule: Rule = {
      id: Math.random().toString(36).substr(2, 9),
      triggerType: 'command',
      triggerValue: '/start',
      responseType: 'text',
      responseValue: 'Hello! I am a bot.',
    };
    setRules([...rules, newRule]);
  };

  const handleUpdateRule = (id: string, updates: Partial<Rule>) => {
    setRules(rules.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  };

  const handleDeleteRule = (id: string) => {
    setRules(rules.filter((r) => r.id !== id));
  };

  const handleSave = async () => {
    if (!botId || !user) return;
    setSaving(true);
    setError('');
    try {
      await updateDoc(doc(db, 'bot_rules', botId), {
        rules: rules,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="text-slate-500 hover:text-slate-900 mr-4">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <Bot className="h-6 w-6 text-indigo-600 mr-2" />
              <span className="text-lg font-bold text-slate-900">{botName || 'Loading...'}</span>
              <span className="ml-2 text-sm text-slate-500">@{botUsername}</span>
            </div>
            <div className="flex items-center">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-sm font-medium text-sm disabled:opacity-50"
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Rules'}
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
            {error}
          </div>
        )}

        <div className="bg-white shadow-sm rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Auto-Reply Rules</h2>
              <p className="text-sm text-slate-500">Define how your bot responds to messages.</p>
            </div>
            <button
              onClick={handleAddRule}
              className="flex items-center px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-sm text-sm font-medium"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Rule
            </button>
          </div>

          <div className="p-6 space-y-6">
            {rules.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="mx-auto h-12 w-12 text-slate-300" />
                <h3 className="mt-2 text-sm font-medium text-slate-900">No rules defined</h3>
                <p className="mt-1 text-sm text-slate-500">Add a rule to start programming your bot.</p>
              </div>
            ) : (
              rules.map((rule, index) => (
                <div key={rule.id} className="flex flex-col md:flex-row gap-4 p-4 border border-slate-200 rounded-xl bg-slate-50 relative group">
                  <div className="absolute -top-3 -left-3 w-6 h-6 bg-slate-200 text-slate-600 rounded-full flex items-center justify-center text-xs font-bold border-2 border-white">
                    {index + 1}
                  </div>
                  
                  <div className="flex-1 space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">When user sends</label>
                      <div className="flex gap-2">
                        <select
                          value={rule.triggerType}
                          onChange={(e) => handleUpdateRule(rule.id, { triggerType: e.target.value as any })}
                          className="block w-1/3 border border-slate-300 rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white"
                        >
                          <option value="command">Command (starts with)</option>
                          <option value="text_match">Text contains</option>
                          <option value="any">Any message</option>
                        </select>
                        {rule.triggerType !== 'any' && (
                          <input
                            type="text"
                            value={rule.triggerValue}
                            onChange={(e) => handleUpdateRule(rule.id, { triggerValue: e.target.value })}
                            placeholder={rule.triggerType === 'command' ? '/start' : 'hello'}
                            className="block w-2/3 border border-slate-300 rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          />
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Bot replies with</label>
                      <textarea
                        value={rule.responseValue}
                        onChange={(e) => handleUpdateRule(rule.id, { responseValue: e.target.value })}
                        rows={3}
                        className="block w-full border border-slate-300 rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        placeholder="Enter bot response here..."
                      />
                    </div>
                  </div>

                  <div className="flex md:flex-col justify-end md:justify-start items-center md:pl-4 md:border-l border-slate-200">
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                      title="Delete rule"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
