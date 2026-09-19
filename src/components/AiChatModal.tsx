import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Send,
  X,
  RefreshCw,
  Bot,
  User,
  HelpCircle,
  Lightbulb,
} from 'lucide-react';

interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AiChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AiChatModal: React.FC<AiChatModalProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<AiMessage[]>([
    {
      role: 'assistant',
      content:
        '老师您好！我是班班通多媒体教学设备 **AI 智能排查助手** 🤖。\n\n如果您在教学过程中遇到 **投影仪黑屏/红灯报警**、**白板触控偏移**、**无声音/麦克风啸叫** 或 **教室断网** 等问题，请随时向我咨询，我将为您提供快速应急排查步骤。',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickQuestions = [
    '投影仪红灯一直闪烁无法开机怎么办？',
    '触控一体机/电子白板触控严重偏移如何校准？',
    '教室电脑连不上网络，无法访问教学平台怎么自查？',
    '教师无线麦克风刺耳啸叫或没有声音怎么调？',
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSend = async (userText?: string) => {
    const textToSend = userText || input;
    if (!textToSend.trim() || loading) return;

    const newMessages: AiMessage[] = [...messages, { role: 'user', content: textToSend.trim() }];
    setMessages(newMessages);
    if (!userText) setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend.trim(),
          history: newMessages.slice(-6),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'AI 暂时未能回复，请稍后再试');
      }

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.reply || '已收到您的咨询，请核对设备排查步骤。' },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `⚠️ 出错提示：${err.message || '网络连接异常，请重试'}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl w-full max-w-2xl h-[90vh] max-h-[680px] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        {/* 标题栏 */}
        <div className="p-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/15 rounded-xl">
              <Sparkles className="w-5 h-5 text-yellow-300" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight flex items-center gap-2">
                班班通 AI 智能排查助手
                <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-normal">
                  实时答疑
                </span>
              </h3>
              <p className="text-xs text-blue-100">常见多媒体教学设备故障秒级应急排查建议</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 消息对话列表 */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/70">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs shadow-xs ${
                  m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-indigo-600 text-white'
                }`}
              >
                {m.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap shadow-2xs ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-none'
                    : 'bg-white text-slate-800 border border-slate-200/80 rounded-tl-none'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-4 py-3 text-xs text-slate-500 flex items-center gap-2 shadow-2xs">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                正在结合班班通运维经验为您梳理排查方案...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 快捷提问推荐词 */}
        <div className="px-4 py-2 bg-slate-100 border-t border-slate-200 overflow-x-auto whitespace-nowrap scrollbar-none flex gap-2 items-center">
          <span className="text-[11px] text-slate-500 flex items-center gap-1 shrink-0 font-medium">
            <Lightbulb className="w-3 h-3 text-amber-500" /> 快捷提问:
          </span>
          {quickQuestions.map((q, idx) => (
            <button
              key={idx}
              disabled={loading}
              onClick={() => handleSend(q)}
              className="text-xs px-2.5 py-1 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 rounded-full transition-colors shrink-0 shadow-2xs cursor-pointer"
            >
              {q}
            </button>
          ))}
        </div>

        {/* 底部输入框 */}
        <div className="p-3 bg-white border-t border-slate-200">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="请输入您遇到的设备问题（例如：投影仪开机没画面、麦克风没声...）"
              className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-medium rounded-xl text-sm flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Send className="w-4 h-4" />
              发送
            </button>
          </form>
          <p className="text-[11px] text-slate-500 text-center mt-2 flex items-center justify-center gap-1">
            <HelpCircle className="w-3 h-3" />
            若设备硬件老化受损或自行排查未果，请直接在首页拍照提交工单，技术老师将迅速上门检修。
          </p>
        </div>
      </div>
    </div>
  );
};
