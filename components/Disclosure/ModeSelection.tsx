import React from "react";

import type { DisclosureMode } from "../../types";

interface ModeSelectionProps {
  selectedMode: DisclosureMode | null;
  onSelect: (mode: DisclosureMode) => void;
  onBack: () => void;
}

const modes: Array<{
  id: DisclosureMode;
  title: string;
  description: string;
  features: string[];
}> = [
  {
    id: "questionnaire",
    title: "问卷交底模式",
    description: "按领域问卷逐题填写，适合边整理边补充研发细节。",
    features: ["结构化问题引导", "适合信息尚未成稿", "便于逐题补充证据"],
  },
  {
    id: "upload",
    title: "上传资料模式",
    description: "上传研发资料、模板或报告，由系统自动提取交底并优化创新点。",
    features: ["支持 DOCX / PDF", "扫描 PDF 自动 OCR", "自动评估新颖性/创造性/实用性"],
  },
];

const ModeSelection: React.FC<ModeSelectionProps> = ({
  selectedMode,
  onSelect,
  onBack,
}) => {
  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-900 mb-2">选择技术交底方式</h2>
      <p className="text-slate-500 mb-8">
        你可以继续使用问卷采集，也可以直接上传研发资料让系统自动整理。
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {modes.map((mode) => {
          const isSelected = selectedMode === mode.id;

          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => onSelect(mode.id)}
              className={`p-6 rounded-2xl border-2 text-left transition-all duration-200 hover:shadow-lg ${
                isSelected
                  ? "border-blue-500 bg-blue-50 shadow-md"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900">{mode.title}</h3>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    isSelected
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {mode.id === "upload" ? "自动整理" : "手动引导"}
                </span>
              </div>
              <p className="text-sm text-slate-600 mb-4 leading-6">
                {mode.description}
              </p>
              <div className="space-y-2">
                {mode.features.map((feature) => (
                  <div
                    key={feature}
                    className="text-sm text-slate-500 flex items-center gap-2"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                    {feature}
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition-colors"
        >
          返回上一步
        </button>
      </div>
    </div>
  );
};

export default ModeSelection;