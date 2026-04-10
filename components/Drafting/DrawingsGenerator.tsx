import React, { useState, useEffect } from 'react';
import { PatentData, StageData } from '../../types';
import { generateDrawingsDescription } from '../../services/aiService';
import {
  generateDiagram,
  DiagramType,
  getDiagramTypeName,
  getDiagramTypeDescription
} from '../../services/diagramService';
import {
  generateAnnotation,
  generateDrawingDescription,
  ImageAnnotation,
  parseReferenceInput,
  formatReferenceList,
} from '../../services/imageAnnotationService';
import { renderMarkdown } from '../../services/markdownService';
import MermaidRenderer from '../MermaidRenderer';

interface DrawingsGeneratorProps {
  embodimentsJson: string;
  patentData: PatentData;
  stageData: StageData;
  onUpdate: (content: string) => void;
  onConfirm: () => void;
  onRegenerate: () => void;
}

const DrawingsGenerator: React.FC<DrawingsGeneratorProps> = ({
  embodimentsJson,
  patentData,
  stageData,
  onUpdate,
  onConfirm,
  onRegenerate,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(stageData.content);

  // 图表生成状态
  const [showDiagramPanel, setShowDiagramPanel] = useState(false);
  const [selectedDiagramType, setSelectedDiagramType] = useState<DiagramType>('flowchart');
  const [diagramDescription, setDiagramDescription] = useState('');
  const [isGeneratingDiagram, setIsGeneratingDiagram] = useState(false);
  const [generatedDiagrams, setGeneratedDiagrams] = useState<Array<{
    type: DiagramType;
    code: string;
    language: 'mermaid' | 'plantuml';
  }>>([]);

  // 图片标注状态
  const [showAnnotationPanel, setShowAnnotationPanel] = useState(false);
  const [currentFigureNumber, setCurrentFigureNumber] = useState('图1');
  const [figureDescription, setFigureDescription] = useState('');
  const [generatedAnnotations, setGeneratedAnnotations] = useState<ImageAnnotation[]>([]);

  const diagramTypes: DiagramType[] = ['flowchart', 'sequence', 'architecture', 'class', 'component', 'deployment'];

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
      const drawings = await generateDrawingsDescription(embodimentsJson, {
        userId: patentData.userId,
      });
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

  const handleGenerateDiagram = async () => {
    if (!diagramDescription.trim()) {
      alert('请输入图表描述');
      return;
    }

    setIsGeneratingDiagram(true);
    try {
      const result = await generateDiagram({
        type: selectedDiagramType,
        description: diagramDescription,
        context: {
          patentTitle: patentData.title,
          technicalField: patentData.selectedTechnicalField,
          inventionContent: patentData.inventionContent,
        },
      });

      setGeneratedDiagrams((prev) => [...prev, result]);
      setDiagramDescription('');
      alert(`${getDiagramTypeName(selectedDiagramType)}生成成功！`);
    } catch (error) {
      console.error('Failed to generate diagram:', error);
      alert('图表生成失败，请重试');
    } finally {
      setIsGeneratingDiagram(false);
    }
  };

  const handleRemoveDiagram = (index: number) => {
    setGeneratedDiagrams((prev) => prev.filter((_, i) => i !== index));
  };

  const handleGenerateAnnotation = () => {
    if (!figureDescription.trim()) {
      alert('请输入附图描述，例如：101为主体，102为支架，103为连接件');
      return;
    }

    try {
      const annotation = generateAnnotation({
        figureNumber: currentFigureNumber,
        patentTitle: patentData.title,
        technicalField: patentData.selectedTechnicalField,
        inventionSummary: patentData.inventionContent,
        userDescription: figureDescription,
      });

      setGeneratedAnnotations((prev) => [...prev, annotation]);
      setFigureDescription('');

      // 自动递增图号
      const match = currentFigureNumber.match(/(\d+)/);
      if (match) {
        const nextNum = parseInt(match[1], 10) + 1;
        setCurrentFigureNumber(`图${nextNum}`);
      }

      alert(`${annotation.figureNumber} 标注生成成功！`);
    } catch (error) {
      console.error('Failed to generate annotation:', error);
      alert('标注生成失败，请重试');
    }
  };

  const handleRemoveAnnotation = (index: number) => {
    setGeneratedAnnotations((prev) => prev.filter((_, i) => i !== index));
  };

  const handleApplyAnnotations = () => {
    if (generatedAnnotations.length === 0) {
      alert('请先生成至少一个附图标注');
      return;
    }

    const annotationMarkdown = generateDrawingDescription(generatedAnnotations);
    const annotationHtml = renderMarkdown(annotationMarkdown);

    // 合并到现有内容
    const currentContent = editContent || stageData.content || '';
    const updatedContent = currentContent + '\n\n' + annotationHtml;

    onUpdate(updatedContent);
    alert(`已应用 ${generatedAnnotations.length} 个附图标注到文档！`);
  };

  const previewHtml = renderMarkdown(editContent || stageData.content || '');

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-slate-900 mb-2">阶段5：生成附图说明</h3>
        <p className="text-slate-600">描述每幅附图所要表达的技术方案内容，或使用 AI 生成技术示意图</p>
      </div>

      {/* 图表生成面板 */}
      <div className="mb-6 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-2xl border border-indigo-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              AI 技术示意图生成
            </h4>
            <p className="text-sm text-indigo-700 mt-1">生成流程图、架构图、类图等专利附图（Mermaid/PlantUML）</p>
          </div>
          <button
            onClick={() => setShowDiagramPanel(!showDiagramPanel)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-semibold"
          >
            {showDiagramPanel ? '收起' : '展开生成器'}
          </button>
        </div>

        {showDiagramPanel && (
          <div className="space-y-4">
            {/* 图表类型选择 */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">选择图表类型</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {diagramTypes.map((type) => (
                  <button
                    key={type}
                    onClick={() => setSelectedDiagramType(type)}
                    className={`p-3 rounded-xl border-2 transition-all text-left ${
                      selectedDiagramType === type
                        ? 'border-indigo-500 bg-indigo-100'
                        : 'border-slate-200 bg-white hover:border-indigo-300'
                    }`}
                  >
                    <div className="text-sm font-bold text-slate-900 mb-1">
                      {getDiagramTypeName(type)}
                    </div>
                    <div className="text-xs text-slate-600">
                      {getDiagramTypeDescription(type)}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 图表描述输入 */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                描述图表内容（AI 将根据描述生成{getDiagramTypeName(selectedDiagramType)}）
              </label>
              <textarea
                value={diagramDescription}
                onChange={(e) => setDiagramDescription(e.target.value)}
                placeholder={`例如：展示用户登录流程，包括输入验证、后端认证、token生成和返回结果...`}
                className="w-full h-24 p-4 border border-slate-300 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            <button
              onClick={handleGenerateDiagram}
              disabled={isGeneratingDiagram || !diagramDescription.trim()}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isGeneratingDiagram ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  生成 {getDiagramTypeName(selectedDiagramType)}
                </>
              )}
            </button>
          </div>
        )}

        {/* 已生成的图表列表 */}
        {generatedDiagrams.length > 0 && (
          <div className="mt-6 pt-6 border-t border-indigo-200">
            <h5 className="text-sm font-bold text-slate-700 mb-3">已生成图表 ({generatedDiagrams.length})</h5>
            <div className="space-y-4">
              {generatedDiagrams.map((diagram, idx) => (
                <div key={idx} className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-slate-900">
                      {getDiagramTypeName(diagram.type)}
                    </span>
                    <button
                      onClick={() => handleRemoveDiagram(idx)}
                      className="text-red-600 hover:text-red-800 text-xs font-semibold"
                    >
                      删除
                    </button>
                  </div>
                  {diagram.language === 'mermaid' ? (
                    <MermaidRenderer code={diagram.code} />
                  ) : (
                    <div className="bg-slate-50 p-3 rounded-lg">
                      <pre className="text-xs text-slate-700 overflow-x-auto">{diagram.code}</pre>
                      <p className="text-xs text-slate-500 mt-2">
                        PlantUML 代码已生成，可复制到 <a href="http://www.plantuml.com/plantuml" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">plantuml.com</a> 在线渲染
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 附图标注面板 */}
      <div className="mb-6 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl border border-emerald-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-lg font-bold text-emerald-900 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              智能图片标注
            </h4>
            <p className="text-sm text-emerald-700 mt-1">自动识别参考标号，生成标准附图说明文本</p>
          </div>
          <button
            onClick={() => setShowAnnotationPanel(!showAnnotationPanel)}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-semibold"
          >
            {showAnnotationPanel ? '收起' : '展开标注器'}
          </button>
        </div>

        {showAnnotationPanel && (
          <div className="space-y-4">
            {/* 图号输入 */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">图号</label>
              <input
                type="text"
                value={currentFigureNumber}
                onChange={(e) => setCurrentFigureNumber(e.target.value)}
                placeholder="例如：图1"
                className="w-full p-3 border border-slate-300 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* 标注描述输入 */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                附图描述（输入参考标号及说明）
              </label>
              <textarea
                value={figureDescription}
                onChange={(e) => setFigureDescription(e.target.value)}
                placeholder={`例如：101为主体框架，102为支撑杆，103为连接件，整体构成一个可折叠结构`}
                className="w-full h-24 p-4 border border-slate-300 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              />
              <p className="text-xs text-slate-500 mt-2">
                💡 提示：直接输入 "101为XXX，102为YYY" 格式，系统将自动识别参考标号
              </p>
            </div>

            <button
              onClick={handleGenerateAnnotation}
              disabled={!figureDescription.trim()}
              className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              生成标注
            </button>
          </div>
        )}

        {/* 已生成的标注列表 */}
        {generatedAnnotations.length > 0 && (
          <div className="mt-6 pt-6 border-t border-emerald-200">
            <div className="flex items-center justify-between mb-3">
              <h5 className="text-sm font-bold text-slate-700">已生成标注 ({generatedAnnotations.length})</h5>
              <button
                onClick={handleApplyAnnotations}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-semibold flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                应用到文档
              </button>
            </div>
            <div className="space-y-3">
              {generatedAnnotations.map((annotation, idx) => (
                <div key={idx} className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-emerald-700">
                        {annotation.figureNumber}
                      </span>
                      <span className="text-xs text-slate-500">·</span>
                      <span className="text-xs text-slate-600">
                        {annotation.type}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemoveAnnotation(idx)}
                      className="text-red-600 hover:text-red-800 text-xs font-semibold"
                    >
                      删除
                    </button>
                  </div>
                  <p className="text-sm text-slate-700 mb-3">{annotation.description}</p>
                  {annotation.referenceNumbers.length > 0 && (
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs font-semibold text-slate-600 mb-2">参考标号 ({annotation.referenceNumbers.length}):</p>
                      <div className="grid grid-cols-2 gap-2">
                        {annotation.referenceNumbers.map((ref, refIdx) => (
                          <div key={refIdx} className="text-xs text-slate-700 flex items-center gap-1">
                            <span className="font-mono font-semibold text-emerald-600">{ref.number}</span>
                            <span className="text-slate-400">→</span>
                            <span>{ref.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
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