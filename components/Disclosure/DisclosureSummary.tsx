import React from 'react';
import { DisclosureData, TemplateQuestion } from '../../types';

interface DisclosureSummaryProps {
  disclosureData: DisclosureData;
  onConfirm: () => void;
  onEdit: () => void;
}

// Template questions (same as in QuestionWizard)
const inventionQuestions: TemplateQuestion[] = [
  { id: 'q1', question: '发明目的', helpText: '', exampleAnswer: '' },
  { id: 'q2', question: '背景技术', helpText: '', exampleAnswer: '' },
  { id: 'q3', question: '技术方案', helpText: '', exampleAnswer: '' },
  { id: 'q4', question: '核心创新点', helpText: '', exampleAnswer: '' },
  { id: 'q5', question: '具体实施方式', helpText: '', exampleAnswer: '' },
  { id: 'q6', question: '技术效果', helpText: '', exampleAnswer: '' },
  { id: 'q7', question: '替代方案', helpText: '', exampleAnswer: '' },
];

const utilityQuestions: TemplateQuestion[] = [
  { id: 'q1', question: '待解决问题', helpText: '', exampleAnswer: '' },
  { id: 'q2', question: '现有产品结构', helpText: '', exampleAnswer: '' },
  { id: 'q3', question: '发明目的', helpText: '', exampleAnswer: '' },
  { id: 'q4', question: '产品结构描述', helpText: '', exampleAnswer: '' },
  { id: 'q5', question: '技术效果', helpText: '', exampleAnswer: '' },
];

const DisclosureSummary: React.FC<DisclosureSummaryProps> = ({
  disclosureData,
  onConfirm,
  onEdit,
}) => {
  const questions =
    disclosureData.type === 'invention' ? inventionQuestions : utilityQuestions;

  const getAnswer = (questionId: string): string => {
    const answer = disclosureData.answers.find((a) => a.questionId === questionId);
    return answer?.answer || '';
  };

  const answeredCount = disclosureData.answers.filter((a) => a.answer.trim().length > 0).length;
  const totalQuestions = questions.length;

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

      {/* Answers summary */}
      <div className="space-y-4 mb-8">
        {questions.map((question) => {
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