import React, { useState, useEffect } from 'react';
import { DisclosureData, StageData } from '../../types';
import { generateClaims } from '../../services/aiService';

interface ClaimsGeneratorProps {
  disclosureData: DisclosureData;
  stageData: StageData;
  onUpdate: (content: string) => void;
  onConfirm: () => void;
  onRegenerate: () => void;
}

const ClaimsGenerator: React.FC<ClaimsGeneratorProps> = ({
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
      handleGenerate();
    }
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const claims = await generateClaims(disclosureData);
      onUpdate(claims);
    } catch (error) {
      console.error('Failed to generate claims:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEditSave = () => {
    onUpdate(editContent);
    setIsEditing(false);
  };

  // Parse claims JSON for display
  let claimsData = { independentClaims: [] as string[], dependentClaims: [] as string[] };
  try {
    if (stageData.content || editContent) {
      claimsData = JSON.parse(editContent || stageData.content);
    }
  } catch {
    // Keep empty
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-slate-900 mb-2">阶段2：生成权利要求书</h3>
        <p className="text-slate-600">权利要求书是专利保护的核心，需要明确、独立</p>
      </div>

      {isGenerating ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-600">正在生成权利要求...</p>
        </div>
      ) : isEditing ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-60 p-4 border border-slate-200 rounded-xl text-slate-700 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder='{"independentClaims": [...], "dependentClaims": [...]}'
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
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          {/* Independent Claims */}
          <div className="mb-6">
            <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs">独</span>
              独立权利要求
            </h4>
            <div className="space-y-3">
              {claimsData.independentClaims?.map((claim, idx) => (
                <div key={idx} className="p-4 bg-slate-50 rounded-lg text-slate-700">
                  {idx + 1}. {claim}
                </div>
              ))}
            </div>
          </div>

          {/* Dependent Claims */}
          <div className="mb-6">
            <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs">从</span>
              从属权利要求
            </h4>
            <div className="space-y-3">
              {claimsData.dependentClaims?.map((claim, idx) => (
                <div key={idx} className="p-4 bg-slate-50 rounded-lg text-slate-700">
                  {idx + claimsData.independentClaims?.length + 1}. {claim}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between border-t border-slate-100 pt-4">
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
          <p className="text-slate-500 mb-4">暂无权利要求内容</p>
          <button
            onClick={handleGenerate}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            生成权利要求
          </button>
        </div>
      )}
    </div>
  );
};

export default ClaimsGenerator;