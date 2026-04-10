import React, { useState, useEffect } from 'react';
import { PatentData, DraftingStage, DraftingProgress, StageData, DisclosureData, AppView } from '../../types';
import StageProgress from './StageProgress';
import AbstractGenerator from './AbstractGenerator';
import ClaimsGenerator from './ClaimsGenerator';
import DescriptionGenerator from './DescriptionGenerator';
import EmbodimentGenerator from './EmbodimentGenerator';
import DrawingsGenerator from './DrawingsGenerator';
import { renderMarkdown } from '../../services/markdownService';

// Convert JSON-format claims string to numbered Markdown text
const claimsJsonToMarkdown = (jsonStr: string): string => {
  try {
    const data = JSON.parse(jsonStr) as {
      independentClaims?: string[];
      dependentClaims?: string[];
    };
    const lines: string[] = [];
    let num = 1;
    (data.independentClaims || []).forEach((claim) => {
      lines.push(`${num}. ${claim}`);
      num++;
    });
    (data.dependentClaims || []).forEach((claim) => {
      lines.push(`${num}. ${claim}`);
      num++;
    });
    return lines.join('\n\n');
  } catch {
    return jsonStr; // fallback: return as-is
  }
};

// Convert JSON-format embodiments string to Markdown text
const embodimentsJsonToMarkdown = (jsonStr: string): string => {
  try {
    const data = JSON.parse(jsonStr) as {
      embodiments?: Array<{ title?: string; description?: string; parameters?: Record<string, string> }>;
    };
    const sections = (data.embodiments || []).map((e, idx) => {
      const header = `## ${e.title || `实施例${idx + 1}`}`;
      const desc = e.description || '';
      const params = e.parameters && Object.keys(e.parameters).length > 0
        ? '\n\n**相关参数：**\n' + Object.entries(e.parameters).map(([k, v]) => `- ${k}：${v}`).join('\n')
        : '';
      return `${header}\n\n${desc}${params}`;
    });
    return sections.join('\n\n---\n\n');
  } catch {
    return jsonStr; // fallback: return as-is
  }
};

interface DraftingContainerProps {
  patentData: PatentData;
  updatePatentData: (field: keyof PatentData, value: any) => void;
  setView: (view: AppView) => void;
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
  setView,
  onSave,
  onBack,
}) => {
  const [progress, setProgress] = useState<DraftingProgress>(
    patentData.draftingProgress || createEmptyProgress()
  );

  // Ensure we have disclosure data
  const disclosureData: DisclosureData | null = patentData.disclosureData
    ? {
        ...patentData.disclosureData,
        userId: patentData.userId || patentData.disclosureData.userId,
      }
    : null;

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
            patentData={patentData}
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

  const stageLabels: Record<DraftingStage, string> = {
    abstract: '摘要',
    claims: '权利要求',
    description: '说明书',
    embodiment: '实施例',
    drawings: '附图说明',
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20">
      {/* Top navigation bar */}
      <div className="flex justify-between items-center">
        <button onClick={onBack} className="text-slate-500 hover:text-slate-800 flex items-center gap-2 font-medium">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          返回
        </button>
        <button onClick={onSave} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-50 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
          保存项目
        </button>
      </div>

      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Dark gradient header */}
        <div className="px-8 py-7 bg-linear-to-r from-slate-950 via-slate-900 to-indigo-950 text-white">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div>
              <div className="text-indigo-300 text-sm font-semibold tracking-[0.2em] uppercase mb-3">Stage 3 / 4</div>
              <h2 className="text-3xl font-bold mb-3">步骤 3：申请文本撰写</h2>
              <p className="text-slate-300 max-w-3xl leading-relaxed">
                基于已确认的交底和评估结果，分阶段生成摘要、权利要求、说明书、实施例和附图说明。
              </p>
            </div>
            <div className="min-w-60 bg-white/10 border border-white/10 rounded-2xl p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between text-sm text-slate-200 mb-2">
                <span>当前阶段</span>
                <span className="text-xl font-bold text-white">{currentIndex + 1} / {stages.length}</span>
              </div>
              <div className="h-3 bg-white/10 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-linear-to-r from-indigo-300 via-violet-300 to-cyan-300 rounded-full transition-all"
                  style={{ width: `${Math.max(8, ((confirmedStages.length) / stages.length) * 100)}%` }}
                />
              </div>
              <div className="text-xs text-slate-300">
                {confirmedStages.length === stages.length
                  ? '所有阶段已完成，可进入步骤 4 审校定稿。'
                  : `正在撰写：${stageLabels[progress.currentStage]}`}
              </div>
            </div>
          </div>
        </div>

        {/* Stage progress stepper */}
        <div className="px-8 pt-6">
          <StageProgress
            currentStage={progress.currentStage}
            confirmedStages={confirmedStages}
          />
        </div>

        {/* Current stage content */}
        <div className="px-8 pb-8">
          {renderCurrentStage()}
        </div>

      {/* All complete indicator */}
      {progress.drawings.isConfirmed && (
        <div className="mx-8 mb-8 p-6 bg-green-50 border border-green-200 rounded-2xl text-center">
          <div className="text-green-600 font-semibold mb-2">
            申请文本已完成！
          </div>
          <p className="text-sm text-green-700 mb-4">
            所有阶段已确认，现在可以进入步骤 4 审校定稿。
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

                // Map generated drafting content into patentData root properties expected by Editor
                if (progress.abstract.content) {
                  updatePatentData('abstract', renderMarkdown(progress.abstract.content));
                }
                if (progress.claims.content) {
                  updatePatentData('claims', renderMarkdown(claimsJsonToMarkdown(progress.claims.content)));
                }
                
                if (progress.description.content) {
                  const desc = progress.description.content;
                  const extractSection = (regexHeaders: string) => {
                    const regex = new RegExp(`(?:^|\\n)#{1,4}\\s*(?:${regexHeaders})\\s*\\n([\\s\\S]*?)(?=(?:\\n#{1,4}\\s*|$))`, 'i');
                    const match = desc.match(regex);
                    return match ? match[1].trim() : '';
                  };
                  
                  const technicalField = extractSection("技术领域");
                  const backgroundArt = extractSection("背景技术|现有技术");
                  const purpose = extractSection("发明目的|技术问题");
                  const solution = extractSection("技术方案|技术解决方案");
                  const effect = extractSection("有益效果|技术效果");
                  
                  let inventionContent = [
                    purpose ? `### 发明目的\n${purpose}` : '',
                    solution ? `### 技术方案\n${solution}` : '',
                    effect ? `### 有益效果\n${effect}` : ''
                  ].filter(Boolean).join('\n\n');
                  
                  if (!inventionContent && !technicalField && !backgroundArt) {
                    inventionContent = desc; 
                  } else if (!inventionContent) {
                    const inv = extractSection("发明内容");
                    if (inv) inventionContent = inv;
                    else inventionContent = desc;
                  }
                  
                  if (technicalField) updatePatentData('technicalField', renderMarkdown(technicalField));
                  if (backgroundArt) updatePatentData('backgroundArt', renderMarkdown(backgroundArt));
                  if (inventionContent) updatePatentData('inventionContent', renderMarkdown(inventionContent));
                }

                if (progress.drawings.content) {
                  updatePatentData('descriptionOfDrawings', renderMarkdown(progress.drawings.content));
                }
                if (progress.embodiment.content) {
                  updatePatentData('detailedDescription', renderMarkdown(embodimentsJsonToMarkdown(progress.embodiment.content)));
                }

                onSave();
                setView(AppView.EDITOR);
              }}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              进入步骤 4：审校定稿
            </button>
          </div>
        </div>
      )}
      </section>
    </div>
  );
};

export default DraftingContainer;