import React, { useState, useEffect } from 'react';
import { DisclosureData, StageData } from '../../types';
import { generateDescription } from '../../services/aiService';
import { renderMarkdown } from '../../services/markdownService';

interface DescriptionGeneratorProps {
  disclosureData: DisclosureData;
  stageData: StageData;
  onUpdate: (content: string) => void;
  onConfirm: () => void;
  onRegenerate: () => void;
}

const DescriptionGenerator: React.FC<DescriptionGeneratorProps> = ({
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
      const description = await generateDescription(disclosureData);
      onUpdate(description);
    } catch (error) {
      console.error('Failed to generate description:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEditSave = () => {
    onUpdate(editContent);
    setIsEditing(false);
  };

  const previewHtml = renderMarkdown(editContent || stageData.content || '');

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-slate-900 mb-2">阶段3：生成说明书</h3>
        <p className="text-slate-600">说明书应充分公开技术方案，使本领域技术人员能够实施</p>
      </div>

      {isGenerating ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-600">正在生成说明书...</p>
        </div>
      ) : isEditing ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-80 p-4 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="请输入说明书内容..."
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
          <div
            className="prose prose-sm max-w-none mb-6"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
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
          <p className="text-slate-500 mb-4">暂无说明书内容</p>
          <button
            onClick={handleGenerate}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            生成说明书
          </button>
        </div>
      )}
    </div>
  );
};

export default DescriptionGenerator;