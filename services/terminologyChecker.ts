/**
 * 术语一致性检查服务
 *
 * 核心功能：
 * 1. 提取专利文档中的核心术语
 * 2. 检查术语在不同章节中的一致性
 * 3. 检测禁用词（绝对化表述）
 * 4. 提供术语统一建议
 */

import { PatentData } from '../types';

export interface TermOccurrence {
  section: keyof PatentData;
  sectionName: string;
  count: number;
  context: string[];  // 术语出现的上下文片段
}

export interface TermAnalysis {
  term: string;
  occurrences: TermOccurrence[];
  totalCount: number;
  variants: string[];  // 可能的变体
}

export interface ProhibitedTerm {
  term: string;
  section: keyof PatentData;
  sectionName: string;
  context: string;
  reason: string;
  suggestion: string;
}

export interface TerminologyReport {
  coreTerms: TermAnalysis[];  // 核心术语分析
  inconsistencies: Array<{
    baseForm: string;
    variants: string[];
    suggestion: string;
  }>;
  prohibitedTerms: ProhibitedTerm[];
  summary: string;
}

/**
 * 禁用词列表及其替换建议
 */
const PROHIBITED_TERMS: Array<{
  pattern: RegExp;
  reason: string;
  suggestion: string;
}> = [
  {
    pattern: /最[佳优好]/g,
    reason: '使用绝对化评价"最佳/最优/最好"',
    suggestion: '改为"优选地"、"较好地"或"进一步地"',
  },
  {
    pattern: /完美|完全解决|彻底解决/g,
    reason: '使用绝对化表述',
    suggestion: '改为"有助于改善"、"能够缓解"或"在一定程度上解决"',
  },
  {
    pattern: /革命性|颠覆性|突破性/g,
    reason: '使用过度宣传性用语',
    suggestion: '客观描述技术改进，如"显著改善"、"较大提升"',
  },
  {
    pattern: /唯一|绝无仅有|独一无二/g,
    reason: '使用绝对化排他表述',
    suggestion: '改为"具有……特点"、"采用……方式"',
  },
  {
    pattern: /永久|永远|一直|始终|从不/g,
    reason: '使用绝对化时间表述',
    suggestion: '改为"长期"、"通常"、"在正常条件下"',
  },
  {
    pattern: /所有|全部|任何|一切/g,
    reason: '使用过于宽泛的限定',
    suggestion: '改为"多个"、"若干"、"部分"或明确具体范围',
  },
  {
    pattern: /显而易见|不言而喻|众所周知/g,
    reason: '使用主观判断表述',
    suggestion: '删除或改为客观陈述',
  },
  {
    pattern: /本发明[是最]/g,
    reason: '对本发明使用绝对化评价',
    suggestion: '客观描述本发明的技术特征和效果',
  },
];

/**
 * 从文本中提取术语（中文词组）
 */
const extractTerms = (text: string, minLength = 3, maxLength = 10): string[] => {
  const terms: string[] = [];

  // 移除 HTML 标签
  let cleanText = text.replace(/<[^>]+>/g, ' ');

  // 提取连续的中文字符（包括常见技术词汇中的英文和数字）
  const matches = cleanText.match(/[\u4e00-\u9fa5a-zA-Z0-9]{3,15}/g) || [];

  matches.forEach((match) => {
    if (match.length >= minLength && match.length <= maxLength) {
      // 过滤掉纯数字和常见停用词
      if (!/^\d+$/.test(match) && !isStopTerm(match)) {
        terms.push(match);
      }
    }
  });

  return terms;
};

/**
 * 判断是否为停用术语
 */
const isStopTerm = (term: string): boolean => {
  const stopTerms = [
    '一种', '一个', '所述', '其特征', '包括', '具有', '设置', '连接',
    '用于', '通过', '根据', '本发明', '本实用新型', '可以', '能够',
    '如图', '如下', '如前', '进一步', '优选地', '具体地', '例如',
  ];
  return stopTerms.some((stop) => term.includes(stop));
};

/**
 * 提取文本片段作为上下文
 */
const extractContext = (text: string, term: string, contextLength = 40): string[] => {
  const contexts: string[] = [];
  const cleanText = text.replace(/<[^>]+>/g, '');

  let index = cleanText.indexOf(term);
  let count = 0;

  while (index !== -1 && count < 3) {  // 最多3个示例
    const start = Math.max(0, index - contextLength);
    const end = Math.min(cleanText.length, index + term.length + contextLength);
    const context = cleanText.substring(start, end);
    contexts.push(`…${context}…`);

    index = cleanText.indexOf(term, index + 1);
    count++;
  }

  return contexts;
};

/**
 * 获取章节中文名称
 */
const getSectionName = (section: keyof PatentData): string => {
  const nameMap: Record<string, string> = {
    abstract: '摘要',
    claims: '权利要求书',
    technicalField: '技术领域',
    backgroundArt: '背景技术',
    inventionContent: '发明内容',
    detailedDescription: '具体实施方式',
    descriptionOfDrawings: '附图说明',
  };
  return nameMap[section] || section;
};

/**
 * 分析单个章节中的术语
 */
const analyzeSection = (
  text: string | undefined,
  section: keyof PatentData,
  termMap: Map<string, TermAnalysis>
): void => {
  if (!text || !text.trim()) return;

  const terms = extractTerms(text);
  const termCounts = new Map<string, number>();

  // 统计频次
  terms.forEach((term) => {
    termCounts.set(term, (termCounts.get(term) || 0) + 1);
  });

  // 更新全局术语分析
  termCounts.forEach((count, term) => {
    if (!termMap.has(term)) {
      termMap.set(term, {
        term,
        occurrences: [],
        totalCount: 0,
        variants: [],
      });
    }

    const analysis = termMap.get(term)!;
    analysis.totalCount += count;
    analysis.occurrences.push({
      section,
      sectionName: getSectionName(section),
      count,
      context: extractContext(text, term),
    });
  });
};

/**
 * 检测相似术语（可能的变体）
 */
const detectVariants = (terms: string[]): Map<string, string[]> => {
  const variantMap = new Map<string, string[]>();
  const termSet = new Set(terms);

  termSet.forEach((term1) => {
    const variants: string[] = [];

    termSet.forEach((term2) => {
      if (term1 !== term2) {
        // 检查包含关系
        if (term1.includes(term2) || term2.includes(term2)) {
          variants.push(term2);
        }

        // 检查编辑距离（简化：仅检查长度相近且有公共子串）
        if (Math.abs(term1.length - term2.length) <= 2) {
          const shorter = term1.length < term2.length ? term1 : term2;
          const longer = term1.length >= term2.length ? term1 : term2;

          if (longer.includes(shorter.substring(0, Math.max(2, shorter.length - 1)))) {
            variants.push(term2);
          }
        }
      }
    });

    if (variants.length > 0) {
      variantMap.set(term1, Array.from(new Set(variants)));
    }
  });

  return variantMap;
};

/**
 * 检查禁用词
 */
const checkProhibitedTerms = (patentData: PatentData): ProhibitedTerm[] => {
  const prohibited: ProhibitedTerm[] = [];

  const sectionsToCheck: Array<{ key: keyof PatentData; name: string }> = [
    { key: 'abstract', name: '摘要' },
    { key: 'claims', name: '权利要求书' },
    { key: 'technicalField', name: '技术领域' },
    { key: 'backgroundArt', name: '背景技术' },
    { key: 'inventionContent', name: '发明内容' },
    { key: 'detailedDescription', name: '具体实施方式' },
  ];

  sectionsToCheck.forEach(({ key, name }) => {
    const text = patentData[key];
    if (!text || typeof text !== 'string') return;

    const cleanText = text.replace(/<[^>]+>/g, '');

    PROHIBITED_TERMS.forEach(({ pattern, reason, suggestion }) => {
      let match;
      const regex = new RegExp(pattern);
      while ((match = regex.exec(cleanText)) !== null) {
        const start = Math.max(0, match.index - 20);
        const end = Math.min(cleanText.length, match.index + match[0].length + 20);
        const context = cleanText.substring(start, end);

        prohibited.push({
          term: match[0],
          section: key,
          sectionName: name,
          context: `…${context}…`,
          reason,
          suggestion,
        });
      }
    });
  });

  return prohibited;
};

/**
 * 执行完整的术语一致性检查
 */
export const checkTerminologyConsistency = (patentData: PatentData): TerminologyReport => {
  const termMap = new Map<string, TermAnalysis>();

  // 分析各章节
  analyzeSection(patentData.abstract, 'abstract', termMap);
  analyzeSection(patentData.claims, 'claims', termMap);
  analyzeSection(patentData.technicalField, 'technicalField', termMap);
  analyzeSection(patentData.backgroundArt, 'backgroundArt', termMap);
  analyzeSection(patentData.inventionContent, 'inventionContent', termMap);
  analyzeSection(patentData.detailedDescription, 'detailedDescription', termMap);
  analyzeSection(patentData.descriptionOfDrawings, 'descriptionOfDrawings', termMap);

  // 提取核心术语（出现频次 >= 3 次）
  const coreTerms = Array.from(termMap.values())
    .filter((analysis) => analysis.totalCount >= 3)
    .sort((a, b) => b.totalCount - a.totalCount)
    .slice(0, 20);  // 最多20个核心术语

  // 检测术语变体
  const allTerms = Array.from(termMap.keys());
  const variantMap = detectVariants(allTerms);

  // 构建不一致报告
  const inconsistencies: Array<{
    baseForm: string;
    variants: string[];
    suggestion: string;
  }> = [];

  const processed = new Set<string>();
  variantMap.forEach((variants, base) => {
    if (!processed.has(base)) {
      const group = [base, ...variants].sort((a, b) => b.length - a.length);
      const baseForm = group[0];
      const variantForms = group.slice(1);

      if (variantForms.length > 0) {
        inconsistencies.push({
          baseForm,
          variants: variantForms,
          suggestion: `建议统一使用"${baseForm}"，避免使用${variantForms.map((v) => `"${v}"`).join('、')}`,
        });

        group.forEach((term) => processed.add(term));
      }
    }
  });

  // 检查禁用词
  const prohibitedTerms = checkProhibitedTerms(patentData);

  // 生成摘要
  const summary = `共识别 ${coreTerms.length} 个核心术语，发现 ${inconsistencies.length} 处可能的术语不一致，检出 ${prohibitedTerms.length} 处禁用词。`;

  return {
    coreTerms,
    inconsistencies,
    prohibitedTerms,
    summary,
  };
};

/**
 * 自动修复禁用词（简化版）
 */
export const fixProhibitedTerms = (text: string): string => {
  let fixed = text;

  PROHIBITED_TERMS.forEach(({ pattern }) => {
    // 简单替换示例（实际应用需要更智能的上下文替换）
    if (/最[佳优好]/.test(pattern.source)) {
      fixed = fixed.replace(pattern, '优选');
    } else if (/完美|完全解决|彻底解决/.test(pattern.source)) {
      fixed = fixed.replace(pattern, '有助于解决');
    } else if (/革命性|颠覆性|突破性/.test(pattern.source)) {
      fixed = fixed.replace(pattern, '显著改善');
    }
    // 其他替换规则可根据需要扩展
  });

  return fixed;
};
