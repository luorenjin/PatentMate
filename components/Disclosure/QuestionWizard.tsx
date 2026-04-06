import React, { useState, useEffect } from 'react';
import { DisclosureData, PatentType, TechnicalField, TemplateQuestion } from '../../types';

interface QuestionWizardProps {
  patentType: PatentType;
  technicalField: TechnicalField;
  title: string;
  disclosureData: DisclosureData | null;
  onAnswerChange: (questionId: string, answer: string) => void;
  onComplete: () => void;
  onBack: () => void;
}

// Template questions for invention patent (7 questions)
const inventionQuestions: TemplateQuestion[] = [
  {
    id: 'q1',
    question: '发明目的 - 您的发明旨在解决什么问题？',
    helpText: '用一句话概括发明要达成的目标，即现有技术无法解决或解决不好的问题',
    exampleAnswer: '解决现有图像分割算法在处理边界模糊区域时精度不足的问题',
    placeholder: '例如：解决现有技术在XXX场景下YYY不足的问题',
  },
  {
    id: 'q2',
    question: '背景技术 - 当前技术中存在什么问题或不足？',
    helpText: '描述现有解决方案及其缺陷，可以从性能、效率、成本、稳定性等维度说明',
    exampleAnswer: '现有的深度学习分割网络在边缘区域存在精度下降的问题，且计算复杂度较高，无法满足实时性要求',
    placeholder: '描述现有技术的问题和不足',
  },
  {
    id: 'q3',
    question: '技术方案 - 请详细描述您的技术实现方案？',
    helpText: '包括具体步骤、参数、逻辑关系等核心技术内容',
    exampleAnswer: '采用基于注意力机制的双分支网络结构，分别提取特征并进行融合；引入边界增强模块利用边缘信息提升分割精度；通过轻量化设计降低计算量',
    placeholder: '描述核心技术实现方案',
  },
  {
    id: 'q4',
    question: '核心创新点 - 与现有技术相比，您的发明主要创新点是什么？',
    helpText: '列出1-3个关键创新特征，说明与现有技术的本质区别',
    exampleAnswer: '1) 提出了边界感知的注意力模块；2) 设计了特征金字塔融合策略；3) 实现了计算量与精度的平衡',
    placeholder: '列出主要创新点',
  },
  {
    id: 'q5',
    question: '具体实施方式 - 请提供1-2个具体实施例？',
    helpText: '包含优选参数、替代方案等具体细节，使本领域技术人员能够实施',
    exampleAnswer: '实施例1：在U-Net结构中加入边界注意力分支，使用3x3卷积核，学习率设为0.001，采用Adam优化器...',
    placeholder: '描述具体实施方式',
  },
  {
    id: 'q6',
    question: '技术效果 - 您的发明带来了哪些技术效果？',
    helpText: '效率提升、成本降低、性能改善等可量化或可对比的效果',
    exampleAnswer: '在XXX数据集上，mIoU从0.75提升至0.82，推理速度提升30%，参数量减少25%',
    placeholder: '描述技术效果',
  },
  {
    id: 'q7',
    question: '替代方案 - 是否存在可替代的实现方案？',
    helpText: '描述其他可行的替代实现、变体或扩展方向（可选）',
    exampleAnswer: '可以使用ResNet-50作为backbone替代ResNet-101；边界检测模块可替换为CRF后处理',
    placeholder: '描述替代方案（可选）',
  },
];

// Template questions for utility model (5 questions)
const utilityQuestions: TemplateQuestion[] = [
  {
    id: 'q1',
    question: '发明目的 - 您的实用新型旨在解决什么问题？',
    helpText: '用一句话概括要解决的产品结构问题',
    exampleAnswer: '解决现有折叠伞收纳后体积过大、稳定性差的问题',
    placeholder: '描述要解决的结构问题',
  },
  {
    id: 'q2',
    question: '现有产品结构 - 请描述现有产品的结构特点及存在的问题？',
    helpText: '详细描述现有产品的具体结构及其不足',
    exampleAnswer: '现有折叠伞采用六根伞骨支撑，收纳后直径约30cm，且伞柄容易松动',
    placeholder: '描述现有产品结构',
  },
  {
    id: 'q3',
    question: '发明目的 - 您的实用新型要达到什么目的？',
    helpText: '说明通过结构改进要达成的具体目标',
    exampleAnswer: '使折叠伞收纳后体积减小至直径15cm以内，同时增强结构稳定性',
    placeholder: '描述要达成的目标',
  },
  {
    id: 'q4',
    question: '产品结构描述 - 请详细描述产品的形状、构造或结合？',
    helpText: '详细描述产品的具体结构、连接关系、尺寸材料等',
    exampleAnswer: '包括伞骨组件、连接件和收纳盒；伞骨采用四级伸缩结构；连接件采用卡扣式设计...',
    placeholder: '描述产品具体结构',
  },
  {
    id: 'q5',
    question: '技术效果 - 您的实用新型带来了哪些效果？',
    helpText: '说明结构改进带来的具体效果',
    exampleAnswer: '收纳体积减少50%，结构稳定性提升40%，生产成本降低15%',
    placeholder: '描述技术效果',
  },
];

const QuestionWizard: React.FC<QuestionWizardProps> = ({
  patentType,
  technicalField,
  title,
  disclosureData,
  onAnswerChange,
  onComplete,
  onBack,
}) => {
  const questions = patentType === 'invention' ? inventionQuestions : utilityQuestions;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // Initialize answers from disclosureData
  useEffect(() => {
    if (disclosureData?.answers) {
      const answerMap: Record<string, string> = {};
      disclosureData.answers.forEach((a) => {
        answerMap[a.questionId] = a.answer;
      });
      setAnswers(answerMap);
    }
  }, [disclosureData]);

  const currentQuestion = questions[currentIndex];
  const progress = ((currentIndex + 1) / questions.length) * 100;

  const handleAnswerChange = (value: string) => {
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: value }));
    onAnswerChange(currentQuestion.id, value);
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else {
      onBack();
    }
  };

  const canProceed = answers[currentQuestion.id]?.trim().length > 0;
  const isLastQuestion = currentIndex === questions.length - 1;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <button
          onClick={handlePrev}
          className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          返回上一步
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex justify-between text-sm text-slate-500 mb-2">
          <span>问题 {currentIndex + 1} / {questions.length}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-6">
        <h3 className="text-lg font-bold text-slate-900 mb-2">
          {currentQuestion.question}
        </h3>
        <p className="text-sm text-slate-600 mb-4">{currentQuestion.helpText}</p>

        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <div className="text-xs font-semibold text-blue-700 mb-1">示例回答：</div>
          <p className="text-sm text-blue-800">{currentQuestion.exampleAnswer}</p>
        </div>

        <textarea
          value={answers[currentQuestion.id] || ''}
          onChange={(e) => handleAnswerChange(e.target.value)}
          placeholder={currentQuestion.placeholder}
          className="w-full h-40 p-4 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        />

        <div className="mt-2 text-xs text-slate-400">
          已输入 {answers[currentQuestion.id]?.length || 0} 字符
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={handlePrev}
          className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition-colors"
        >
          {currentIndex === 0 ? '返回选择' : '上一题'}
        </button>
        <button
          onClick={handleNext}
          disabled={!canProceed}
          className={`px-6 py-3 rounded-xl font-medium transition-colors ${
            canProceed
              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          {isLastQuestion ? '完成交底' : '下一题'}
        </button>
      </div>

      {/* Question dots */}
      <div className="flex justify-center gap-2 mt-8">
        {questions.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIndex(idx)}
            className={`w-2 h-2 rounded-full transition-all ${
              idx === currentIndex
                ? 'bg-blue-600 w-6'
                : answers[questions[idx].id]?.trim()
                ? 'bg-green-500'
                : 'bg-slate-300'
            }`}
          />
        ))}
      </div>
    </div>
  );
};

export default QuestionWizard;