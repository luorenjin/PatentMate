import React, { useState, useEffect, useRef } from 'react';
import { AppView, ChatMessage, PatentData } from '../types';
import { ChatSession, createChatSession } from '../services/aiService';

interface ChatAssistantProps {
  isOpen: boolean;
  onToggle: () => void;
  currentView: AppView;
  patentData: PatentData | null;
}

const ChatAssistant: React.FC<ChatAssistantProps> = ({ isOpen, onToggle, currentView, patentData }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', text: '您好，我是您的专利工作流助手。您可以让我帮助梳理交底、评估方案、优化撰写内容，或解释当前阶段该做什么。', timestamp: Date.now() }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatSessionRef = useRef<ChatSession | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const stageLabel = currentView === AppView.DISCLOSURE
    ? '技术交底'
    : currentView === AppView.NOVELTY_SEARCH
      ? '方案评估'
    : currentView === AppView.DRAFTER
      ? '申请撰写'
      : currentView === AppView.EDITOR
        ? '审校定稿'
        : '工作台';

  const contextPrompt = patentData
    ? [
        `当前阶段：${stageLabel}`,
        `发明名称：${patentData.title}`,
        `交底摘要：${patentData.disclosureSummary}`,
        `技术问题：${patentData.technicalProblem}`,
        `现有方案缺陷：${patentData.existingSolutionIssues}`,
        `关键技术特征：${patentData.technicalHighlights.join('；')}`,
        `待追问问题：${patentData.disclosurePendingQuestions.join('；')}`,
        `保护策略：${patentData.claimStrategy}`,
        `策略风险：${patentData.strategyRisks.join('；')}`,
      ].join('\n')
    : `当前阶段：${stageLabel}`;

  useEffect(() => {
    chatSessionRef.current = createChatSession({ contextPrompt });
    setMessages([
      {
        role: 'model',
        text: currentView === AppView.DISCLOSURE
          ? '我已经接入当前技术交底上下文。你可以让我帮你梳理问卷答案、补齐关键特征，或判断交底是否足够进入下一步。'
          : currentView === AppView.NOVELTY_SEARCH
            ? '我已经接入当前方案评估上下文。你可以让我分析差异点、检索风险，或判断是否适合进入申请撰写。'
            : '我已经接入当前专利任务上下文。你可以继续追问章节质量、审查问题或定稿风险。',
        timestamp: Date.now(),
      },
    ]);
  }, [contextPrompt, currentView]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isLoading || !chatSessionRef.current) return;

    const userMsg: ChatMessage = { role: 'user', text: input, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await chatSessionRef.current.sendMessage({
        message: userMsg.text
      });
      
      const modelMsg: ChatMessage = {
        role: 'model',
        text: response.text || "抱歉，我现在无法回答。",
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, modelMsg]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { role: 'model', text: "发生错误，请稍后再试。", timestamp: Date.now() }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="absolute right-8 bottom-24 z-50 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 hover:shadow-2xl transition-all transform hover:-translate-y-1 flex items-center justify-center cursor-pointer"
        title="AI 助手"
      >
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="absolute right-8 bottom-24 w-96 h-150 max-h-[80vh] bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden z-50 transition-all">
      <div className="bg-blue-600 p-4 text-white flex justify-between items-center">
        <h3 className="font-semibold flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          {currentView === AppView.DISCLOSURE ? '交底助手' : currentView === AppView.NOVELTY_SEARCH ? '评估助手' : 'AI 专利顾问'}
        </h3>
        <button onClick={onToggle} className="text-white hover:text-blue-200 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-3 rounded-lg text-sm leading-relaxed ${
              msg.role === 'user' 
                ? 'bg-blue-600 text-white rounded-br-none' 
                : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none shadow-sm'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {isLoading && (
           <div className="flex justify-start">
             <div className="bg-white p-3 rounded-lg border border-slate-200 rounded-bl-none shadow-sm">
               <div className="flex space-x-2">
                 <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                 <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-75"></div>
                 <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-150"></div>
               </div>
             </div>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white border-t border-slate-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={currentView === AppView.DISCLOSURE
              ? '询问问卷答案、交底缺口或补充方向...'
              : currentView === AppView.NOVELTY_SEARCH
                ? '询问差异点、检索风险或是否可进入撰写...'
                : '询问撰写、审校或定稿相关问题...'}
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white text-slate-900 placeholder-slate-400"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatAssistant;