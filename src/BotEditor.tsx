import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { db } from './firebase';
import { doc, onSnapshot, updateDoc, getDoc, collection, getDocs } from 'firebase/firestore';
import { ArrowRight, Plus, Save, Trash2, Bot, MessageSquare, Image as ImageIcon, Users } from 'lucide-react';

interface Rule {
  id: string;
  triggerType: 'command' | 'text_match' | 'exact_match' | 'any';
  triggerValue: string;
  responseType: 'text' | 'image';
  responseValue: string;
  imageUrl?: string;
}

export default function BotEditor() {
  const { botId } = useParams<{ botId: string }>();
  const { user } = useAuth();
  const [botName, setBotName] = useState('');
  const [botUsername, setBotUsername] = useState('');
  const [rules, setRules] = useState<Rule[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [userCount, setUserCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImageId, setUploadingImageId] = useState<string | null>(null);

  useEffect(() => {
    if (!botId || !user) return;

    // Fetch bot details
    getDoc(doc(db, 'bots', botId)).then((docSnap) => {
      if (docSnap.exists() && docSnap.data().uid === user.uid) {
        setBotName(docSnap.data().name);
        setBotUsername(docSnap.data().username);
      }
    });

    // Fetch user count
    getDocs(collection(db, `bots/${botId}/users`)).then((snapshot) => {
      setUserCount(snapshot.size);
    }).catch(console.error);

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
      responseValue: 'أهلاً بك! أنا بوت جديد.',
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, ruleId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImageId(ruleId);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_SIZE = 800;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Compress to JPEG to save space in Firestore
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        handleUpdateRule(ruleId, { imageUrl: dataUrl });
        setUploadingImageId(null);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="text-slate-500 hover:text-slate-900 ml-4">
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Bot className="h-6 w-6 text-indigo-600 ml-2" />
              <span className="text-lg font-bold text-slate-900">{botName || 'جاري التحميل...'}</span>
              <span className="mr-2 text-sm text-slate-500">@{botUsername}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center text-sm text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">
                <Users className="h-4 w-4 ml-2 text-indigo-500" />
                <span>{userCount} مستخدم</span>
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-sm font-medium text-sm disabled:opacity-50"
              >
                <Save className="h-4 w-4 ml-2" />
                {saving ? 'جاري الحفظ...' : 'حفظ القواعد'}
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
              <h2 className="text-lg font-semibold text-slate-900">قواعد الرد التلقائي</h2>
              <p className="text-sm text-slate-500">حدد كيف سيرد البوت على الرسائل.</p>
            </div>
            <button
              onClick={handleAddRule}
              className="flex items-center px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-sm text-sm font-medium"
            >
              <Plus className="h-4 w-4 ml-1" />
              إضافة قاعدة
            </button>
          </div>

          <div className="p-6 space-y-6">
            {rules.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="mx-auto h-12 w-12 text-slate-300" />
                <h3 className="mt-2 text-sm font-medium text-slate-900">لا توجد قواعد</h3>
                <p className="mt-1 text-sm text-slate-500">أضف قاعدة جديدة لبرمجة البوت الخاص بك.</p>
              </div>
            ) : (
              rules.map((rule, index) => (
                <div key={rule.id} className="flex flex-col md:flex-row gap-4 p-4 border border-slate-200 rounded-xl bg-slate-50 relative group">
                  <div className="absolute -top-3 -right-3 w-6 h-6 bg-slate-200 text-slate-600 rounded-full flex items-center justify-center text-xs font-bold border-2 border-white">
                    {index + 1}
                  </div>
                  
                  <div className="flex-1 space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">عندما يرسل المستخدم</label>
                      <div className="flex gap-2">
                        <select
                          value={rule.triggerType}
                          onChange={(e) => handleUpdateRule(rule.id, { triggerType: e.target.value as any })}
                          className="block w-1/3 border border-slate-300 rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white"
                        >
                          <option value="command">أمر (يبدأ بـ /)</option>
                          <option value="exact_match">تطابق تام للنص</option>
                          <option value="text_match">يحتوي على نص</option>
                          <option value="any">أي رسالة</option>
                        </select>
                        {rule.triggerType !== 'any' && (
                          <input
                            type="text"
                            value={rule.triggerValue}
                            onChange={(e) => handleUpdateRule(rule.id, { triggerValue: e.target.value })}
                            placeholder={rule.triggerType === 'command' ? '/start' : 'مرحبا'}
                            className="block w-2/3 border border-slate-300 rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          />
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider">البوت يرد بـ</label>
                        <select
                          value={rule.responseType}
                          onChange={(e) => handleUpdateRule(rule.id, { responseType: e.target.value as any })}
                          className="text-xs border-none bg-transparent text-indigo-600 font-medium focus:ring-0 cursor-pointer"
                        >
                          <option value="text">نص فقط</option>
                          <option value="image">صورة مع نص</option>
                        </select>
                      </div>
                      
                      {rule.responseType === 'image' && (
                        <div className="mb-3 p-3 border border-dashed border-slate-300 rounded-lg bg-white text-center">
                          {rule.imageUrl ? (
                            <div className="relative inline-block">
                              <img src={rule.imageUrl} alt="Preview" className="max-h-32 rounded-lg mx-auto" />
                              <button
                                onClick={() => handleUpdateRule(rule.id, { imageUrl: '' })}
                                className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-1 hover:bg-red-200"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <div>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                id={`file-upload-${rule.id}`}
                                onChange={(e) => handleImageUpload(e, rule.id)}
                              />
                              <label
                                htmlFor={`file-upload-${rule.id}`}
                                className="cursor-pointer inline-flex items-center text-sm text-indigo-600 hover:text-indigo-700"
                              >
                                <ImageIcon className="h-5 w-5 ml-2" />
                                {uploadingImageId === rule.id ? 'جاري الرفع...' : 'اختر صورة للرفع'}
                              </label>
                            </div>
                          )}
                        </div>
                      )}

                      <textarea
                        value={rule.responseValue}
                        onChange={(e) => handleUpdateRule(rule.id, { responseValue: e.target.value })}
                        rows={3}
                        className="block w-full border border-slate-300 rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        placeholder="اكتب رد البوت هنا..."
                      />
                    </div>
                  </div>

                  <div className="flex md:flex-col justify-end md:justify-start items-center md:pr-4 md:border-r border-slate-200">
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                      title="حذف القاعدة"
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
