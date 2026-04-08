import React from 'react';
import { PatentType } from '../../types';

interface TypeSelectionProps {
  selectedType: PatentType | null;
  onSelect: (type: PatentType) => void;
  onBack?: () => void;
}

const TypeSelection: React.FC<TypeSelectionProps> = ({ selectedType, onSelect, onBack }) => {
  const types = [
    {
      type: 'invention' as PatentType,
      title: '发明专利',
      description: '适用于产品、方法或者其改进所提出的新的技术方案',
      features: ['保护期20年', '创造性要求高', '可保护方法专利'],
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
    },
    {
      type: 'utility' as PatentType,
      title: '实用新型',
      description: '适用于产品的形状、构造或者其结合所提出的适于实用的新的技术方案',
      features: ['保护期10年', '创造性要求较低', '审批速度快'],
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      {onBack && (
        <div className="mb-6">
          <button
            onClick={onBack}
            className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回工作台
          </button>
        </div>
      )}

      <h2 className="text-2xl font-bold text-slate-900 mb-2">选择专利类型</h2>
      <p className="text-slate-500 mb-8">请选择您要申请的专利类型</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {types.map((item) => (
          <button
            key={item.type}
            onClick={() => onSelect(item.type)}
            className={`p-6 rounded-2xl border-2 text-left transition-all duration-200 hover:shadow-lg ${
              selectedType === item.type
                ? 'border-blue-500 bg-blue-50 shadow-md'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className={`mb-4 ${
              selectedType === item.type ? 'text-blue-600' : 'text-slate-600'
            }`}>
              {item.icon}
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">{item.title}</h3>
            <p className="text-sm text-slate-600 mb-4">{item.description}</p>
            <ul className="space-y-1">
              {item.features.map((feature) => (
                <li key={feature} className="text-xs text-slate-500 flex items-center gap-1">
                  <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>
    </div>
  );
};

export default TypeSelection;
