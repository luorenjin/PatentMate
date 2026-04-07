import React, { useState, useEffect } from 'react';
import { StageData } from '../../types';
import { generateDrawingsDescription } from '../../services/aiService';
import { renderMarkdown } from '../../services/markdownService';

interface DrawingsGeneratorProps {
  embodimentsJson: string;
  stageData: StageData;
  onUpdate: (content: string) => void;
  onConfirm: () => void;
  onRegenerate: () => void;
}

const DrawingsGenerator: React.FC<DrawingsGeneratorProps> = ({
  embodimentsJson,
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
    if (!stageData.content && !isGenerating && embodimentsJson) {
      void handleGenerate();
    }
  }, [stageData.content, isGenerating, embodimentsJson]);

  const handleGenerate = async () => {
    if (!embodimentsJson) return;
    setIsGenerating(true);
    try {
      const drawings = await generateDrawingsDescription(embodimentsJson);
      onUpdate(drawings);
    } catch (error) {
      console.error('Failed to generate drawings description:', error);
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
        <h3 className="text-xl font-bold text-slate-900 mb-2">阶段5：生成附图说明</h3>
        <p className="text-slate-600">描述每幅附图所要表达的技术方案内容</p>
      </div>

      {isGenerating ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-600">正在生成附图说明...</p>
        </div>
      ) : isEditing ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-60 p-4 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="请输入附图说明..."
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
                确认完成
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <p className="text-slate-500 mb-4">暂无附图说明内容</p>
          <button
            onClick={handleGenerate}
            disabled={!embodimentsJson}
            className={`px-6 py-2 rounded-lg transition-colors ${
              embodimentsJson
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            生成附图说明
          </button>
        </div>
      )}
    </div>
  );
};

export default DrawingsGenerator;