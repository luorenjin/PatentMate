import React, { useState } from 'react';
import { PatentData, PatentType, TechnicalField } from '../types';

interface PatentDraftProps {
  onCreate: (patentData: Partial<PatentData>) => void;
  onBack: () => void;
}

const technicalFields: TechnicalField[] = [
  'AI',
  '新能源',
  '医疗器械',
  '软件',
  '机械',
  '化工',
  '电子',
  '通信',
  '生物',
  '材料',
];

const PatentDraft: React.FC<PatentDraftProps> = ({ onCreate, onBack }) => {
  const [title, setTitle] = useState('');
  const [patentType, setPatentType] = useState<PatentType | null>(null);
  const [technicalField, setTechnicalField] = useState<TechnicalField | null>(null);

  const canCreate = title.trim() && patentType && technicalField;

  const handleCreate = () => {
    if (!canCreate) return;

    onCreate({
      title: title.trim(),
      patentType: patentType!,
      selectedTechnicalField: technicalField!,
      status: 'disclosure_collecting',
    });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-900 mb-2">新建专利项目</h2>
      <p className="text-slate-500 mb-8">填写基本信息开始技术交底</p>

      {/* Patent Type Selection */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-slate-700 mb-3">
          专利类型 <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setPatentType('invention')}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              patentType === 'invention'
                ? 'border-blue-500 bg-blue-50'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="font-semibold text-slate-900">发明专利</div>
            <div className="text-xs text-slate-500 mt-1">保护期20年，创造性要求高</div>
          </button>
          <button
            type="button"
            onClick={() => setPatentType('utility')}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              patentType === 'utility'
                ? 'border-blue-500 bg-blue-50'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="font-semibold text-slate-900">实用新型</div>
            <div className="text-xs text-slate-500 mt-1">保护期10年，审批速度快</div>
          </button>
        </div>
      </div>

      {/* Technical Field Selection */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-slate-700 mb-3">
          技术领域 <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {technicalFields.map((field) => (
            <button
              key={field}
              type="button"
              onClick={() => setTechnicalField(field)}
              className={`p-2 rounded-lg border text-sm transition-all ${
                technicalField === field
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              {field}
            </button>
          ))}
        </div>
      </div>

      {/* Title Input */}
      <div className="mb-8">
        <label className="block text-sm font-semibold text-slate-700 mb-3">
          发明名称 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如：一种基于深度学习的图像分割方法及装置"
          className="w-full px-4 py-3 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <p className="mt-2 text-xs text-slate-500">
          建议格式：一种[技术领域]的[发明对象]，例如"一种基于深度学习的图像分割方法"
        </p>
      </div>

      {/* Actions */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition-colors"
        >
          取消
        </button>
        <button
          onClick={handleCreate}
          disabled={!canCreate}
          className={`px-8 py-3 rounded-xl font-medium transition-colors ${
            canCreate
              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          开始交底
        </button>
      </div>
    </div>
  );
};

export default PatentDraft;