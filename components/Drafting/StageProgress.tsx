import React from 'react';
import { DraftingStage } from '../../types';

interface StageProgressProps {
  currentStage: DraftingStage;
  confirmedStages: DraftingStage[];
}

const stages: { key: DraftingStage; label: string }[] = [
  { key: 'abstract', label: '摘要' },
  { key: 'claims', label: '权利要求' },
  { key: 'description', label: '说明书' },
  { key: 'embodiment', label: '实施例' },
  { key: 'drawings', label: '附图说明' },
];

const StageProgress: React.FC<StageProgressProps> = ({ currentStage, confirmedStages }) => {
  const currentIndex = stages.findIndex((s) => s.key === currentStage);

  const getStageStatus = (index: number) => {
    if (confirmedStages.includes(stages[index].key)) {
      return 'confirmed';
    }
    if (index === currentIndex) {
      return 'current';
    }
    return 'pending';
  };

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        {stages.map((stage, index) => {
          const status = getStageStatus(index);
          return (
            <React.Fragment key={stage.key}>
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                    status === 'confirmed'
                      ? 'bg-green-500 text-white'
                      : status === 'current'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {status === 'confirmed' ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={`mt-2 text-sm font-medium ${
                    status === 'current' ? 'text-blue-600' : 'text-slate-500'
                  }`}
                >
                  {stage.label}
                </span>
              </div>
              {index < stages.length - 1 && (
                <div
                  className={`flex-1 h-1 mx-2 rounded transition-all ${
                    index < currentIndex || confirmedStages.includes(stages[index + 1].key)
                      ? 'bg-green-500'
                      : 'bg-slate-100'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default StageProgress;