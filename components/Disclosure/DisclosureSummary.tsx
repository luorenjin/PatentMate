import React, { useMemo } from 'react';
import { generateDeepQuestionnaire } from '../../services/disclosureTemplateService';
import { DisclosureData } from '../../types';

interface DisclosureSummaryProps {
  disclosureData: DisclosureData;
  onConfirm: () => void;
  onEdit: () => void;
}

const DisclosureSummary: React.FC<DisclosureSummaryProps> = ({
  disclosureData,
  onConfirm,
  onEdit,
}) => {
  const questions = useMemo(
    () => generateDeepQuestionnaire(disclosureData.type, disclosureData.field),
    [disclosureData.field, disclosureData.type]
  );
  const answerMap = useMemo(
    () => new Map(disclosureData.answers.map((item) => [item.questionId, item.answer])),
    [disclosureData.answers]
  );

  const getAnswer = (questionId: string): string => {
    return answerMap.get(questionId) || '';
  };

  const answeredCount = questions.filter((question) => getAnswer(question.id).trim().length > 0).length;
  const totalQuestions = questions.length;
  const importSnapshot = disclosureData.importSnapshot;
  const isUploadMode = disclosureData.mode === 'upload' && Boolean(importSnapshot);
  const displayQuestions = isUploadMode
    ? questions.filter((question) => getAnswer(question.id).trim().length > 0)
    : questions;

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-900 mb-2">技术交底汇总</h2>
      <p className="text-slate-500 mb-8">请确认以下技术信息是否准确</p>

      {/* Header info */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-slate-500 mb-1">专利类型</div>
            <div className="font-semibold text-slate-900">
              {disclosureData.type === 'invention' ? '发明专利' : '实用新型'}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">技术领域</div>
            <div className="font-semibold text-slate-900">{disclosureData.field}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">问题完成度</div>
            <div className="font-semibold text-slate-900">
              {answeredCount} / {totalQuestions}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">发明名称</div>
            <div className="font-semibold text-slate-900 truncate">{disclosureData.title}</div>
          </div>
        </div>
      </div>

      {isUploadMode && importSnapshot && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-6 space-y-5">
          <div>
            <div className="text-xs text-slate-500 mb-1">资料来源</div>
            <div className="font-semibold text-slate-900">
              {importSnapshot.source.fileName}
              {importSnapshot.source.pageCount
                ? ` · ${importSnapshot.source.pageCount} 页`
                : ''}
              {importSnapshot.source.usedOcr ? ' · 含 OCR 识别' : ''}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500 mb-2">资料摘要</div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 leading-6 whitespace-pre-wrap">
              {importSnapshot.sourceSummary || importSnapshot.source.extractedSummary || '暂无摘要。'}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-700 mb-2">技术问题</div>
              <div className="text-sm text-slate-600 leading-6 whitespace-pre-wrap">
                {importSnapshot.technicalProblem || '暂无稳定识别结果。'}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-700 mb-2">现有技术不足</div>
              <div className="text-sm text-slate-600 leading-6 whitespace-pre-wrap">
                {importSnapshot.existingSolutionIssues || '暂无稳定识别结果。'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-700 mb-2">关键技术特征</div>
              <div className="space-y-2 text-sm text-slate-600">
                {importSnapshot.technicalHighlights.length > 0 ? (
                  importSnapshot.technicalHighlights.map((item) => <div key={item}>{item}</div>)
                ) : importSnapshot.keyPoints.length > 0 ? (
                  importSnapshot.keyPoints.map((item) => <div key={item}>{item}</div>)
                ) : (
                  <div className="text-slate-400">暂无提炼结果。</div>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-700 mb-2">实施方式与结构细节</div>
              <div className="space-y-2 text-sm text-slate-600">
                {importSnapshot.embodiments.length > 0 ? (
                  importSnapshot.embodiments.map((item) => <div key={item}>{item}</div>)
                ) : (
                  <div className="text-slate-400">暂无实施方式摘要。</div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-700 mb-2">证据材料</div>
              <div className="space-y-2 text-sm text-slate-600">
                {importSnapshot.evidenceMaterials.length > 0 ? (
                  importSnapshot.evidenceMaterials.map((item) => <div key={item}>{item}</div>)
                ) : (
                  <div className="text-slate-400">暂无稳定识别的量化证据。</div>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-700 mb-2">风险提示</div>
              <div className="space-y-2 text-sm text-slate-600">
                {importSnapshot.risks.length > 0 ? (
                  importSnapshot.risks.map((item) => <div key={item}>{item}</div>)
                ) : (
                  <div className="text-slate-400">暂无风险提示。</div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-700 mb-2">优化关注点</div>
              <div className="space-y-2 text-sm text-slate-600">
                {importSnapshot.innovationAssessment.recommendedFocus.length > 0 ? (
                  importSnapshot.innovationAssessment.recommendedFocus.map((item) => (
                    <div key={item}>{item}</div>
                  ))
                ) : (
                  <div className="text-slate-400">暂无建议。</div>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-700 mb-2">补强建议</div>
              <div className="space-y-2 text-sm text-slate-600">
                {importSnapshot.innovationAssessment.optimizationSuggestions.length > 0 ? (
                  importSnapshot.innovationAssessment.optimizationSuggestions.map((item) => (
                    <div key={item}>{item}</div>
                  ))
                ) : (
                  <div className="text-slate-400">暂无建议。</div>
                )}
              </div>
            </div>
          </div>

          {importSnapshot.source.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 space-y-1">
              <div className="font-semibold">解析提醒</div>
              {importSnapshot.source.warnings.map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Answers summary */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">
          {isUploadMode ? '问卷映射与人工补充' : '问卷答案汇总'}
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          {isUploadMode
            ? '上传模式下这里只展示已经映射或补充的问卷项，避免确认页再次被题库主导。'
            : '请确认以下问卷答案是否准确。'}
        </p>
      </div>
      <div className="space-y-4 mb-8">
        {displayQuestions.length === 0 && isUploadMode && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-slate-500">
            当前没有可直接映射的问卷项，建议返回上传结果页或继续问卷补充。
          </div>
        )}

        {displayQuestions.map((question) => {
          const answer = getAnswer(question.id);
          return (
            <div
              key={question.id}
              className="bg-white rounded-xl border border-slate-200 p-4"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-slate-800">{question.question}</h3>
                {answer.trim() ? (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    已填写
                  </span>
                ) : (
                  <span className="text-xs text-amber-600">未填写</span>
                )}
              </div>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">
                {answer || '（未填写）'}
              </p>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex justify-center gap-4">
        <button
          onClick={onEdit}
          className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition-colors"
        >
          编辑修改
        </button>
        <button
          onClick={onConfirm}
          className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 shadow-lg shadow-blue-200 transition-colors"
        >
          确认交底
        </button>
      </div>
    </div>
  );
};

export default DisclosureSummary;