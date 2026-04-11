import React, { useState } from 'react';
import {
  AppView,
  DisclosureData,
  DisclosureMode,
  PatentData,
  PatentType,
  TechnicalField,
} from '../types';
import TypeSelection from './Disclosure/TypeSelection';
import FieldSelection from './Disclosure/FieldSelection';
import ModeSelection from './Disclosure/ModeSelection';
import QuestionWizard from './Disclosure/QuestionWizard';
import DocumentUpload from './Disclosure/DocumentUpload';
import DisclosureSummary from './Disclosure/DisclosureSummary';
import { buildDisclosurePatentFields } from '../services/disclosureTemplateService';
import { savePatentToStorage } from '../services/storageService';
import { getWorkflowStageMeta } from '../workflow';

interface PatentDraftProps {
  patentData: PatentData;
  updatePatentData: (field: keyof PatentData, value: any) => void;
  onNext: () => void;
  onBack: () => void;
}

type Step =
  | 'type_selection'
  | 'field_selection'
  | 'mode_selection'
  | 'wizard'
  | 'upload'
  | 'summary';

const getInitialStep = (patentData: PatentData): Step => {
  if (!patentData.patentType) return 'type_selection';
  if (!patentData.selectedTechnicalField || !patentData.title?.trim()) return 'field_selection';

  const mode = patentData.disclosureData?.mode;
  const answeredCount = patentData.disclosureData?.answers.filter((item) => item.answer.trim().length > 0).length || 0;

  if (patentData.status === 'disclosure_review') return 'summary';
  if (mode === 'upload' && answeredCount === 0) return 'upload';
  if (answeredCount > 0) return 'wizard';
  if (mode === 'upload') return 'upload';
  if (mode === 'questionnaire') return 'wizard';
  return 'mode_selection';
};

const PatentDraft: React.FC<PatentDraftProps> = ({
  patentData,
  updatePatentData,
  onNext,
  onBack,
}) => {
  const [step, setStep] = useState<Step>(() => getInitialStep(patentData));
  const stageMeta = getWorkflowStageMeta(AppView.DISCLOSURE);
  const subSteps: Array<{ id: Step; label: string }> = [
    { id: 'type_selection', label: '选择专利类型' },
    { id: 'field_selection', label: '选择技术领域' },
    { id: 'mode_selection', label: '选择交底方式' },
    { id: 'wizard', label: '填写交底问卷' },
    { id: 'upload', label: '上传研发资料' },
    { id: 'summary', label: '确认交底内容' },
  ];

  // Initialize disclosure data if not present
  const disclosureData = patentData.disclosureData
    ? {
        ...patentData.disclosureData,
        userId: patentData.userId || patentData.disclosureData.userId,
      }
    : {
        type: patentData.patentType || 'invention',
        field: patentData.selectedTechnicalField || 'AI',
        title: patentData.title || '',
        userId: patentData.userId,
        mode: undefined,
        answers: [],
      };

  const persistDisclosureData = (nextDisclosureData: DisclosureData) => {
    updatePatentData('disclosureData', nextDisclosureData);
    void savePatentToStorage({
      ...patentData,
      disclosureData: nextDisclosureData,
      lastModified: Date.now(),
    });
  };

  const handleTypeSelect = (type: PatentType) => {
    updatePatentData('patentType', type);
    updatePatentData('disclosureData', { ...disclosureData, type, mode: undefined });
    setStep('field_selection');
  };

  const handleFieldAndTitleSubmit = (field: TechnicalField, title: string) => {
    updatePatentData('selectedTechnicalField', field);
    updatePatentData('title', title);
    const nextDisclosureData = { ...disclosureData, field, title };
    updatePatentData('disclosureData', nextDisclosureData);
    void savePatentToStorage({ ...patentData, selectedTechnicalField: field, title, disclosureData: nextDisclosureData, lastModified: Date.now() });
    setStep('mode_selection');
  };

  const handleModeSelect = (mode: DisclosureMode) => {
    const nextDisclosureData: DisclosureData = {
      ...disclosureData,
      mode,
      importSnapshot: mode === 'upload' ? disclosureData.importSnapshot : undefined,
    };

    persistDisclosureData(nextDisclosureData);
    setStep(mode === 'upload' ? 'upload' : 'wizard');
  };

  const handleAnswerChange = (questionId: string, answer: string) => {
    const newAnswers = [...disclosureData.answers];
    const existingIndex = newAnswers.findIndex(a => a.questionId === questionId);
    if (existingIndex >= 0) {
      newAnswers[existingIndex] = { questionId, answer, lastModified: Date.now() };
    } else {
      newAnswers.push({ questionId, answer, lastModified: Date.now() });
    }
    persistDisclosureData({ ...disclosureData, answers: newAnswers });
  };

  const handleImportedDisclosureApply = (nextDisclosureData: DisclosureData) => {
    persistDisclosureData(nextDisclosureData);
  };

  const handleWizardComplete = () => {
    setStep('summary');
  };

  const handleSummaryConfirm = () => {
    const completedAt = Date.now();
    const updates: Partial<PatentData> = {
      status: 'disclosure_review',
      disclosureData: { ...disclosureData, completedAt },
      ...buildDisclosurePatentFields(disclosureData),
    };

    // Apply all updates to parent state
    Object.entries(updates).forEach(([k, v]) => {
      updatePatentData(k as keyof PatentData, v);
    });
    
    // Save to storage
    const updatedPatent = {
      ...patentData,
      ...updates,
      lastModified: completedAt
    } as PatentData;
    void savePatentToStorage(updatedPatent);
    
    onNext();
  };

  return (
    <div className="w-full h-full overflow-y-auto bg-slate-50 p-6 md:p-8">
      <div className="max-w-6xl mx-auto mb-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 text-xs uppercase tracking-[0.2em] text-cyan-600">Stage 1 / 4</div>
              <h1 className="text-2xl font-bold text-slate-900">{stageMeta?.label || '技术交底'}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                先完成专利类型、技术领域与技术交底采集，系统再进入方案评估、申请撰写和审校定稿阶段。
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:min-w-[280px]">
              <div className="text-xs text-slate-500">当前子步骤</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">
                {subSteps.find((item) => item.id === step)?.label}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {subSteps.map((item, index) => {
                  const isCurrent = item.id === step;
                  const isDone = subSteps.findIndex((subStep) => subStep.id === step) > index;

                  return (
                    <span
                      key={item.id}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        isCurrent
                          ? 'bg-blue-600 text-white'
                          : isDone
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-white text-slate-500 border border-slate-200'
                      }`}
                    >
                      {index + 1}. {item.label}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </div>

      {step === 'type_selection' && (
        <TypeSelection
          onBack={onBack}
          selectedType={patentData.patentType || null}
          onSelect={handleTypeSelect}
        />
      )}

      {step === 'field_selection' && (
        <FieldSelection
          selectedField={patentData.selectedTechnicalField || null}
          title={patentData.title || ''}
          onSelect={(field, title) => handleFieldAndTitleSubmit(field, title)}
          onBack={() => setStep('type_selection')}
        />
      )}

      {step === 'mode_selection' && (
        <ModeSelection
          selectedMode={disclosureData.mode || null}
          onSelect={handleModeSelect}
          onBack={() => setStep('field_selection')}
        />
      )}

      {step === 'wizard' && (
        <QuestionWizard
          patentType={patentData.patentType || 'invention'}
          technicalField={patentData.selectedTechnicalField || 'AI'}
          title={patentData.title || ''}
          disclosureData={disclosureData}
          onAnswerChange={handleAnswerChange}
          onComplete={handleWizardComplete}
          onBack={() => setStep('mode_selection')}
        />
      )}

      {step === 'upload' && (
        <DocumentUpload
          patentType={patentData.patentType || 'invention'}
          technicalField={patentData.selectedTechnicalField || 'AI'}
          title={patentData.title || ''}
          disclosureData={disclosureData}
          onApplyImport={handleImportedDisclosureApply}
          onContinueToSummary={() => setStep('summary')}
          onContinueToWizard={() => setStep('wizard')}
          onBack={() => setStep('mode_selection')}
        />
      )}

      {step === 'summary' && (
        <DisclosureSummary
          disclosureData={disclosureData}
          onEdit={() => setStep(
            disclosureData.answers.some((item) => item.answer.trim().length > 0)
              ? 'wizard'
              : disclosureData.mode === 'upload'
                ? 'upload'
                : 'wizard',
          )}
          onConfirm={handleSummaryConfirm}
        />
      )}
    </div>
  );
};

export default PatentDraft;
