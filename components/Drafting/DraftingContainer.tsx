import React, { useState, useEffect } from 'react';
import { PatentData, DraftingStage, DraftingProgress, StageData, DisclosureData } from '../../types';
import StageProgress from './StageProgress';
import AbstractGenerator from './AbstractGenerator';
import ClaimsGenerator from './ClaimsGenerator';
import DescriptionGenerator from './DescriptionGenerator';
import EmbodimentGenerator from './EmbodimentGenerator';
import DrawingsGenerator from './DrawingsGenerator';

interface DraftingContainerProps {
  patentData: PatentData;
  updatePatentData: (field: keyof PatentData, value: any) => void;
  onSave: () => void;
  onBack: () => void;
}

// Initialize empty stage data
const createEmptyStageData = (): StageData => ({
  content: '',
  previousVersion: undefined,
  generatedAt: undefined,
  isConfirmed: false,
});

// Initialize drafting progress
const createEmptyProgress = (): DraftingProgress => ({
  abstract: createEmptyStageData(),
  claims: createEmptyStageData(),
  description: createEmptyStageData(),
  embodiment: createEmptyStageData(),
  drawings: createEmptyStageData(),
  currentStage: 'abstract',
});

const DraftingContainer: React.FC<DraftingContainerProps> = ({
  patentData,
  updatePatentData,
  onSave,
  onBack,
}) => {
  const [progress, setProgress] = useState<DraftingProgress>(
    patentData.draftingProgress || createEmptyProgress()
  );

  // Ensure we have disclosure data
  const disclosureData: DisclosureData | null = patentData.disclosureData || null;

  useEffect(() => {
    // Auto-save when progress changes
    const timer = setTimeout(() => {
      updatePatentData('draftingProgress', progress);
      onSave();
    }, 1000);
    return () => clearTimeout(timer);
  }, [progress]);

  const stages: DraftingStage[] = ['abstract', 'claims', 'description', 'embodiment', 'drawings'];
  const currentIndex = stages.indexOf(progress.currentStage);

  const updateStageData = (stage: DraftingStage, content: string) => {
    setProgress((prev) => ({
      ...prev,
      [stage]: {
        ...prev[stage],
        content,
        generatedAt: Date.now(),
      },
    }));
  };

  const confirmStage = (stage: DraftingStage) => {
    // Save previous version before confirming
    const currentData = progress[stage];
    setProgress((prev) => ({
      ...prev,
      [stage]: {
        ...currentData,
        previousVersion: currentData.content,
        isConfirmed: true,
      },
    }));

    // Move to next stage if not the last one
    const nextIndex = currentIndex + 1;
    if (nextIndex < stages.length) {
      setProgress((prev) => ({
        ...prev,
        currentStage: stages[nextIndex],
      }));
    }
  };

  const regenerateStage = (stage: DraftingStage) => {
    setProgress((prev) => ({
      ...prev,
      [stage]: {
        ...prev[stage],
        previousVersion: prev[stage].content || prev[stage].previousVersion,
        content: '',
        generatedAt: undefined,
        isConfirmed: false,
      },
    }));
  };

  const confirmedStages = stages.filter(
    (stage) => progress[stage].isConfirmed
  ) as DraftingStage[];

  if (!disclosureData) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="text-red-500 mb-4">请先完成技术交底</div>
        <button
          onClick={onBack}
          className="px-6 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
        >
          返回
        </button>
      </div>
    );
  }

  const renderCurrentStage = () => {
    switch (progress.currentStage) {
      case 'abstract':
        return (
          <AbstractGenerator
            disclosureData={disclosureData}
            stageData={progress.abstract}
            onUpdate={(content) => updateStageData('abstract', content)}
            onConfirm={() => confirmStage('abstract')}
            onRegenerate={() => regenerateStage('abstract')}
          />
        );
      case 'claims':
        return (
          <ClaimsGenerator
            disclosureData={disclosureData}
            stageData={progress.claims}
            onUpdate={(content) => updateStageData('claims', content)}
            onConfirm={() => confirmStage('claims')}
            onRegenerate={() => regenerateStage('claims')}
          />
        );
      case 'description':
        return (
          <DescriptionGenerator
            disclosureData={disclosureData}
            stageData={progress.description}
            onUpdate={(content) => updateStageData('description', content)}
            onConfirm={() => confirmStage('description')}
            onRegenerate={() => regenerateStage('description')}
          />
        );
      case 'embodiment':
        return (
          <EmbodimentGenerator
            disclosureData={disclosureData}
            stageData={progress.embodiment}
            onUpdate={(content) => updateStageData('embodiment', content)}
            onConfirm={() => confirmStage('embodiment')}
            onRegenerate={() => regenerateStage('embodiment')}
          />
        );
      case 'drawings':
        return (
          <DrawingsGenerator
            embodimentsJson={progress.embodiment.content}
            stageData={progress.drawings}
            onUpdate={(content) => updateStageData('drawings', content)}
            onConfirm={() => confirmStage('drawings')}
            onRegenerate={() => regenerateStage('drawings')}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">专利智能撰写</h2>
        <p className="text-slate-600">
          基于技术交底信息，逐步生成专利申请文件的各个部分
        </p>
      </div>

      <StageProgress
        currentStage={progress.currentStage}
        confirmedStages={confirmedStages}
      />

      <div className="mt-8">
        {renderCurrentStage()}
      </div>

      {/* All complete indicator */}
      {progress.drawings.isConfirmed && (
        <div className="mt-8 p-6 bg-green-50 border border-green-200 rounded-2xl text-center">
          <div className="text-green-600 font-semibold mb-2">
            专利撰写已完成！
          </div>
          <p className="text-sm text-green-700 mb-4">
            所有阶段已确认，现在可以进入文稿编辑或提交审查
          </p>
          <div className="flex justify-center gap-4">
            <button
              onClick={onBack}
              className="px-6 py-2 bg-white border border-green-300 text-green-700 rounded-lg hover:bg-green-50 transition-colors"
            >
              返回查看
            </button>
            <button
              onClick={() => {
                updatePatentData('status', 'editing');
                onSave();
              }}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              进入编辑
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DraftingContainer;