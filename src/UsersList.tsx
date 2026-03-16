import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Ban, CheckCircle, MessageSquare, Clock, Users, Send, X, Lock, Unlock } from 'lucide-react';

interface BotUser {
  id: string;
  firstName: string;
  username: string;
  lastSeen: string;
  messageCount: number;
  isBanned?: boolean;
  isUnlocked?: boolean;
}

export default function UsersList({ botId }: { botId: string }) {
  const [users, setUsers] = useState<BotUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<BotUser | null>(null);
  const [directMessage, setDirectMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!botId) return;

    const unsubscribe = onSnapshot(collection(db, `bots/${botId}/users`), (snapshot) => {
      const usersData: BotUser[] = [];
      snapshot.forEach((doc) => {
        usersData.push({ id: doc.id, ...doc.data() } as BotUser);
      });
      // Sort by last seen, newest first
      usersData.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
      setUsers(usersData);
      setLoading(false);
    });

    return unsubscribe;
  }, [botId]);

  const toggleBanStatus = async (userId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, `bots/${botId}/users`, userId), {
        isBanned: !currentStatus
      });
    } catch (error) {
      console.error('Error updating ban status:', error);
      alert('حدث خطأ أثناء تحديث حالة المستخدم.');
    }
  };

  const toggleUnlockStatus = async (userId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, `bots/${botId}/users`, userId), {
        isUnlocked: !currentStatus
      });
    } catch (error) {
      console.error('Error updating unlock status:', error);
      alert('حدث خطأ أثناء تحديث حالة القفل.');
    }
  };

  const handleSendDirectMessage = async () => {
    if (!selectedUser || !directMessage.trim()) return;
    
    setSending(true);
    try {
      const res = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId,
          userId: selectedUser.id,
          message: directMessage
        })
      });
      
      const data = await res.json();
      if (res.ok) {
        alert('تم إرسال الرسالة بنجاح!');
        setDirectMessage('');
        setSelectedUser(null);
      } else {
        alert(`فشل الإرسال: ${data.error}`);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      alert('حدث خطأ أثناء إرسال الرسالة.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500">
        جاري تحميل بيانات المستخدمين...
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="p-12 text-center">
        <Users className="mx-auto h-12 w-12 text-slate-300 mb-3" />
        <h3 className="text-lg font-medium text-slate-900">لا يوجد مستخدمين بعد</h3>
        <p className="text-slate-500 mt-1">لم يتواصل أي شخص مع البوت حتى الآن.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                المستخدم
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                معرف تيليجرام
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                عدد الرسائل
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                آخر ظهور
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                الإجراءات
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {users.map((user) => (
              <tr key={user.id} className={user.isBanned ? 'bg-red-50/50' : ''}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold">
                      {user.firstName ? user.firstName.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div className="mr-4">
                      <div className="text-sm font-medium text-slate-900">{user.firstName || 'بدون اسم'}</div>
                      {user.username && (
                        <div className="text-sm text-slate-500">@{user.username}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">
                  {user.id}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center text-sm text-slate-900">
                    <MessageSquare className="h-4 w-4 text-slate-400 ml-1.5" />
                    {user.messageCount || 0}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center text-sm text-slate-500">
                    <Clock className="h-4 w-4 text-slate-400 ml-1.5" />
                    {new Date(user.lastSeen).toLocaleDateString('ar-SA', { 
                      year: 'numeric', month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2 space-x-reverse">
                  <button
                    onClick={() => setSelectedUser(user)}
                    className="inline-flex items-center px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-100 transition-colors"
                  >
                    <Send className="h-3.5 w-3.5 ml-1" />
                    مراسلة
                  </button>
                  <button
                    onClick={() => toggleUnlockStatus(user.id, !!user.isUnlocked)}
                    className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      user.isUnlocked 
                        ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' 
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    }`}
                  >
                    {user.isUnlocked ? (
                      <>
                        <Lock className="h-3.5 w-3.5 ml-1" />
                        قفل
                      </>
                    ) : (
                      <>
                        <Unlock className="h-3.5 w-3.5 ml-1" />
                        إلغاء قفل
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => toggleBanStatus(user.id, !!user.isBanned)}
                    className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      user.isBanned 
                        ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                        : 'bg-red-100 text-red-700 hover:bg-red-200'
                    }`}
                  >
                    {user.isBanned ? (
                      <>
                        <CheckCircle className="h-3.5 w-3.5 ml-1" />
                        رفع الحظر
                      </>
                    ) : (
                      <>
                        <Ban className="h-3.5 w-3.5 ml-1" />
                        حظر
                      </>
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Direct Message Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-semibold text-slate-900">مراسلة {selectedUser.firstName}</h3>
              <button onClick={() => setSelectedUser(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              <textarea
                value={directMessage}
                onChange={(e) => setDirectMessage(e.target.value)}
                placeholder="اكتب رسالتك هنا..."
                rows={4}
                className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleSendDirectMessage}
                  disabled={sending || !directMessage.trim()}
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-xl font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center"
                >
                  {sending ? 'جاري الإرسال...' : 'إرسال الآن'}
                  <Send className="h-4 w-4 mr-2" />
                </button>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
