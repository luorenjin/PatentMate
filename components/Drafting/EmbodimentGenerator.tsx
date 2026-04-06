import React, { useState, useEffect } from 'react';
import { DisclosureData, StageData } from '../../types';
import { generateEmbodiments } from '../../services/geminiService';

interface EmbodimentGeneratorProps {
  disclosureData: DisclosureData;
  stageData: StageData;
  onUpdate: (content: string) => void;
  onConfirm: () => void;
  onRegenerate: () => void;
}

interface Embodiment {
  title?: string;
  description?: string;
  parameters?: Record<string, string>;
}

const EmbodimentGenerator: React.FC<EmbodimentGeneratorProps> = ({
  disclosureData,
  stageData,
  onUpdate,
  onConfirm,
  onRegenerate,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(stageData.content);

  useEffect(() => {
    setEditContent(stageData.content);
  }, [stageData.content]);

  useEffect(() => {
    if (!stageData.content && !isGenerating) {
      void handleGenerate();
    }
  }, [stageData.content, isGenerating]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const embodiments = await generateEmbodiments(disclosureData);
      onUpdate(embodiments);
    } catch (error) {
      console.error('Failed to generate embodiments:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEditSave = () => {
    onUpdate(editContent);
    setIsEditing(false);
  };

  // Parse embodiments JSON for display
  let embodiments: Embodiment[] = [];
  try {
    if (stageData.content || editContent) {
      const parsed = JSON.parse(editContent || stageData.content);
      embodiments = parsed.embodiments || [];
    }
  } catch {
    // Keep empty
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-slate-900 mb-2">阶段4：生成具体实施方式</h3>
        <p className="text-slate-600">实施例应包含2个以上具体实施方案，包含详细参数和步骤</p>
      </div>

      {isGenerating ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-600">正在生成实施例...</p>
        </div>
      ) : isEditing ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-80 p-4 border border-slate-200 rounded-xl text-slate-700 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder='{"embodiments": [{"title": "...", "description": "...", "parameters": {...}}]}'
          />
          <div className="flex justify-end gap-3 mt-4">
            <button
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleEditSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              保存
            </button>
          </div>
        </div>
      ) : stageData.content ? (
        <div className="space-y-4">
          {embodiments.map((emb, idx) => (
            <div key={idx} className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-semibold">
                  {idx + 1}
                </span>
                <h4 className="font-semibold text-slate-900">{emb.title || `实施例${idx + 1}`}</h4>
              </div>
              <p className="text-slate-700 mb-4 whitespace-pre-wrap">{emb.description}</p>
              {emb.parameters && Object.keys(emb.parameters).length > 0 && (
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="text-xs font-semibold text-slate-600 mb-2">关键参数</div>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(emb.parameters).map(([key, value]) => (
                      <div key={key} className="text-sm">
                        <span className="text-slate-500">{key}:</span>{' '}
                        <span className="text-slate-800 font-medium">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          <div className="flex justify-between border-t border-slate-100 pt-4 mt-6">
            <button
              onClick={onRegenerate}
              className="px-4 py-2 text-slate-600 hover:text-slate-800 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              重新生成
            </button>
            <div className="flex gap-3">
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
              >
                编辑
              </button>
              <button
                onClick={onConfirm}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <p className="text-slate-500 mb-4">暂无实施例内容</p>
          <button
            onClick={handleGenerate}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            生成实施例
          </button>
        </div>
      )}
    </div>
  );
};

export default EmbodimentGenerator;