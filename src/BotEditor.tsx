import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { db } from './firebase';
import { doc, onSnapshot, updateDoc, getDoc, collection, getDocs } from 'firebase/firestore';
import { ArrowRight, Plus, Save, Trash2, Bot, MessageSquare, Image as ImageIcon, Users, Settings, Send, X } from 'lucide-react';
import UsersList from './UsersList';

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
  const [botToken, setBotToken] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [description, setDescription] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [maxMessages, setMaxMessages] = useState<number>(0);
  
  const [rules, setRules] = useState<Rule[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [userCount, setUserCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImageId, setUploadingImageId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'rules' | 'settings' | 'users' | 'broadcast'>('rules');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);

  useEffect(() => {
    if (!botId || !user) return;

    // Fetch bot details
    getDoc(doc(db, 'bots', botId)).then((docSnap) => {
      if (docSnap.exists() && docSnap.data().uid === user.uid) {
        const data = docSnap.data();
        setBotName(data.name || '');
        setBotUsername(data.username || '');
        setBotToken(data.token || '');
        setIsActive(data.isActive !== false);
        setDescription(data.description || '');
        setShortDescription(data.shortDescription || '');
        setMaxMessages(data.maxMessages || 0);
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

  const handleBroadcast = async () => {
    if (!botId || !broadcastMessage.trim()) return;
    
    setBroadcasting(true);
    try {
      const res = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId,
          message: broadcastMessage
        })
      });
      
      const data = await res.json();
      if (res.ok) {
        alert(`تم الإرسال بنجاح! تم الوصول إلى ${data.success} مستخدم، وفشل الإرسال لـ ${data.failed} مستخدم.`);
        setBroadcastMessage('');
      } else {
        alert(`فشل الإرسال: ${data.error}`);
      }
    } catch (error) {
      console.error('Error broadcasting:', error);
      alert('حدث خطأ أثناء إرسال الإذاعة.');
    } finally {
      setBroadcasting(false);
    }
  };

  const handleUpdateRule = (id: string, updates: Partial<Rule>) => {
    setRules(rules.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  };

  const handleDeleteRule = (id: string) => {
    setRules(rules.filter((r) => r.id !== id));
  };

  const handleSave = async () => {
    if (!botId || !user) return;
    if (activeTab === 'broadcast') return; // Broadcast has its own send logic
    setSaving(true);
    setError('');
    try {
      if (activeTab === 'rules') {
        await updateDoc(doc(db, 'bot_rules', botId), {
          rules: rules,
        });
      } else if (activeTab === 'settings') {
        // Save settings to Firestore
        await updateDoc(doc(db, 'bots', botId), {
          name: botName,
          description: description,
          shortDescription: shortDescription,
          isActive: isActive,
          maxMessages: maxMessages
        });

        // Update Telegram API
        if (botToken) {
          await fetch(`https://api.telegram.org/bot${botToken}/setMyName`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: botName })
          });
          await fetch(`https://api.telegram.org/bot${botToken}/setMyDescription`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: description })
          });
          await fetch(`https://api.telegram.org/bot${botToken}/setMyShortDescription`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ short_description: shortDescription })
          });
        }
      }
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
                {saving ? 'جاري الحفظ...' : (activeTab === 'rules' ? 'حفظ القواعد' : 'حفظ الإعدادات')}
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

        <div className="flex border-b border-slate-200 mb-6">
          <button 
            className={`px-6 py-3 font-medium text-sm ${activeTab === 'rules' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`} 
            onClick={() => setActiveTab('rules')}
          >
            القواعد والردود
          </button>
          <button 
            className={`px-6 py-3 font-medium text-sm ${activeTab === 'users' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`} 
            onClick={() => setActiveTab('users')}
          >
            المستخدمين
          </button>
          <button 
            className={`px-6 py-3 font-medium text-sm ${activeTab === 'settings' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`} 
            onClick={() => setActiveTab('settings')}
          >
            إعدادات البوت
          </button>
          <button 
            className={`px-6 py-3 font-medium text-sm ${activeTab === 'broadcast' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`} 
            onClick={() => setActiveTab('broadcast')}
          >
            إذاعة (Broadcast)
          </button>
        </div>

        {activeTab === 'settings' ? (
          <div className="bg-white shadow-sm rounded-2xl border border-slate-200 overflow-hidden p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">المعلومات الأساسية</h2>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <h3 className="font-medium text-slate-900">حالة البوت</h3>
                    <p className="text-sm text-slate-500">إيقاف أو تشغيل الرد التلقائي للبوت</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">الحد الأقصى للرسائل لكل مستخدم</label>
                  <p className="text-xs text-slate-500 mb-2">ضع 0 لعدد لا نهائي من الرسائل.</p>
                  <input
                    type="number"
                    min="0"
                    value={maxMessages}
                    onChange={(e) => setMaxMessages(parseInt(e.target.value) || 0)}
                    className="w-full border border-slate-300 rounded-xl shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">اسم البوت</label>
                  <input
                    type="text"
                    value={botName}
                    onChange={(e) => setBotName(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">وصف قصير (About)</label>
                  <p className="text-xs text-slate-500 mb-2">يظهر في صفحة البوت قبل بدء المحادثة.</p>
                  <textarea
                    value={shortDescription}
                    onChange={(e) => setShortDescription(e.target.value)}
                    rows={2}
                    className="w-full border border-slate-300 rounded-xl shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">الوصف الكامل (Description)</label>
                  <p className="text-xs text-slate-500 mb-2">يظهر عندما يفتح شخص ما المحادثة لأول مرة.</p>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className="w-full border border-slate-300 rounded-xl shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
                
                <div className="mt-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100 flex items-start">
                  <ImageIcon className="h-5 w-5 text-indigo-600 ml-3 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-indigo-900">تغيير صورة البوت</h4>
                    <p className="text-sm text-indigo-700 mt-1">
                      لتغيير الصورة الشخصية للبوت، يجب عليك التوجه إلى <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="font-bold underline">@BotFather</a> في تيليجرام، وإرسال الأمر <code>/setuserpic</code> ثم اختيار البوت الخاص بك وإرسال الصورة الجديدة.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'rules' ? (
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
        ) : activeTab === 'users' ? (
          <div className="bg-white shadow-sm rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200 bg-slate-50">
              <h2 className="text-lg font-semibold text-slate-900">مستخدمي البوت</h2>
              <p className="text-sm text-slate-500">قائمة بالأشخاص الذين تواصلوا مع البوت.</p>
            </div>
            <div className="p-0">
              <UsersList botId={botId!} />
            </div>
          </div>
        ) : activeTab === 'broadcast' ? (
          <div className="bg-white shadow-sm rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200 bg-slate-50">
              <h2 className="text-lg font-semibold text-slate-900">إذاعة رسالة (Broadcast)</h2>
              <p className="text-sm text-slate-500">إرسال رسالة لجميع مستخدمي البوت دفعة واحدة.</p>
            </div>
            <div className="p-6 space-y-6">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start">
                <div className="bg-amber-100 p-2 rounded-lg ml-3">
                  <Save className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-amber-900">تنبيه الإذاعة</h4>
                  <p className="text-xs text-amber-800 mt-1">
                    سيتم إرسال هذه الرسالة إلى جميع المستخدمين الذين تفاعلوا مع البوت سابقاً. يرجى استخدام هذه الميزة بحذر لتجنب إزعاج المستخدمين.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">محتوى الرسالة:</label>
                <textarea
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  placeholder="اكتب الرسالة التي تريد إرسالها للجميع..."
                  rows={6}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <button
                onClick={handleBroadcast}
                disabled={broadcasting || !broadcastMessage.trim()}
                className="w-full flex items-center justify-center px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-sm font-bold disabled:opacity-50"
              >
                {broadcasting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white ml-2"></div>
                    جاري الإرسال للجميع...
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5 ml-2" />
                    بدء الإذاعة الآن
                  </>
                )}
              </button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
