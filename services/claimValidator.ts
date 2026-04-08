/**
 * 权利要求书结构与格式校验服务
 *
 * 核心功能：
 * 1. 检查独立权利要求是否符合单句法律文体
 * 2. 验证从属权利要求引用链完整性
 * 3. 检查术语一致性
 * 4. 格式规范检查
 */

export interface ClaimItem {
  number: number;
  content: string;
  isIndependent: boolean;
  references?: number[];  // 引用的权利要求编号
}

export interface ValidationIssue {
  claimNumber: number;
  severity: 'error' | 'warning' | 'info';
  category: '格式规范' | '引用关系' | '术语一致性' | '逻辑完整性';
  message: string;
  suggestion?: string;
}

export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  claims: ClaimItem[];
  stats: {
    totalClaims: number;
    independentClaims: number;
    dependentClaims: number;
  };
}

/**
 * 解析权利要求文本，提取各项权利要求
 */
const parseClaims = (claimsText: string): ClaimItem[] => {
  const claims: ClaimItem[] = [];

  // 尝试 JSON 格式解析
  try {
    const parsed = JSON.parse(claimsText);
    if (parsed.independentClaims && Array.isArray(parsed.independentClaims)) {
      parsed.independentClaims.forEach((content: string, index: number) => {
        claims.push({
          number: index + 1,
          content: content.trim(),
          isIndependent: true,
        });
      });
    }
    if (parsed.dependentClaims && Array.isArray(parsed.dependentClaims)) {
      parsed.dependentClaims.forEach((content: string, index: number) => {
        const refs = extractReferences(content);
        claims.push({
          number: claims.length + 1,
          content: content.trim(),
          isIndependent: false,
          references: refs,
        });
      });
    }
    return claims;
  } catch (e) {
    // 非 JSON，尝试按编号解析
  }

  // 按 "1." "2." 或 "权利要求1" 等格式解析
  const lines = claimsText.split('\n');
  let currentClaim: { number: number; content: string[] } | null = null;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // 匹配权利要求编号：1. 或 权利要求1 或 【1】
    const match = trimmed.match(/^(?:权利要求|【)?(\d+)[】.)、]/);
    if (match) {
      // 保存上一条
      if (currentClaim) {
        const content = currentClaim.content.join(' ').trim();
        const refs = extractReferences(content);
        claims.push({
          number: currentClaim.number,
          content,
          isIndependent: refs.length === 0,
          references: refs.length > 0 ? refs : undefined,
        });
      }
      // 开始新一条
      currentClaim = {
        number: parseInt(match[1], 10),
        content: [trimmed.replace(/^(?:权利要求|【)?\d+[】.)、]\s*/, '')],
      };
    } else if (currentClaim) {
      currentClaim.content.push(trimmed);
    }
  });

  // 保存最后一条
  if (currentClaim) {
    const content = currentClaim.content.join(' ').trim();
    const refs = extractReferences(content);
    claims.push({
      number: currentClaim.number,
      content,
      isIndependent: refs.length === 0,
      references: refs.length > 0 ? refs : undefined,
    });
  }

  return claims;
};

/**
 * 从权利要求文本中提取引用的权利要求编号
 */
const extractReferences = (content: string): number[] => {
  const refs: number[] = [];

  // 匹配 "根据权利要求N所述" "如权利要求N所述" 等
  const patterns = [
    /根据权利要求\s*(\d+)\s*所述/g,
    /如权利要求\s*(\d+)\s*所述/g,
    /依据权利要求\s*(\d+)\s*所述/g,
    /权利要求\s*(\d+)\s*的/g,
  ];

  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const num = parseInt(match[1], 10);
      if (!refs.includes(num)) {
        refs.push(num);
      }
    }
  });

  return refs.sort((a, b) => a - b);
};

/**
 * 检查独立权利要求格式
 */
const validateIndependentClaim = (claim: ClaimItem): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  // 1. 检查是否包含句号（应为单句）
  if (claim.content.includes('。') && claim.content.lastIndexOf('。') < claim.content.length - 1) {
    issues.push({
      claimNumber: claim.number,
      severity: 'error',
      category: '格式规范',
      message: '独立权利要求不应包含多个句子（检测到句号分割）',
      suggestion: '将多个句子合并为一个完整的法律句式，使用"，"连接各技术特征',
    });
  }

  // 2. 检查是否包含"其特征在于"结构
  const hasCharacteristic = /[，；]其特征在于[：，]/.test(claim.content);
  if (!hasCharacteristic) {
    issues.push({
      claimNumber: claim.number,
      severity: 'warning',
      category: '格式规范',
      message: '独立权利要求建议使用"其特征在于"结构',
      suggestion: '采用"一种……，包括……；其特征在于……"的标准格式',
    });
  }

  // 3. 检查开头是否符合规范
  const validStarts = ['一种', '一个', '本发明', '本实用新型'];
  const hasValidStart = validStarts.some((start) => claim.content.startsWith(start));
  if (!hasValidStart) {
    issues.push({
      claimNumber: claim.number,
      severity: 'info',
      category: '格式规范',
      message: '独立权利要求建议以"一种"或"一个"开头',
      suggestion: '修改为：一种……的方法/装置/系统',
    });
  }

  // 4. 检查长度（不应过短）
  if (claim.content.length < 50) {
    issues.push({
      claimNumber: claim.number,
      severity: 'warning',
      category: '逻辑完整性',
      message: '独立权利要求内容过短，可能缺少必要技术特征',
      suggestion: '补充完整的技术方案，确保包含解决技术问题所需的全部必要技术特征',
    });
  }

  return issues;
};

/**
 * 检查从属权利要求格式与引用关系
 */
const validateDependentClaim = (claim: ClaimItem, allClaims: ClaimItem[]): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  // 1. 检查是否有引用
  if (!claim.references || claim.references.length === 0) {
    issues.push({
      claimNumber: claim.number,
      severity: 'error',
      category: '引用关系',
      message: '从属权利要求缺少引用关系',
      suggestion: '使用"根据权利要求X所述的……，其特征在于……"格式',
    });
    return issues;
  }

  // 2. 检查引用的权利要求是否存在且编号在前
  claim.references.forEach((refNum) => {
    if (refNum >= claim.number) {
      issues.push({
        claimNumber: claim.number,
        severity: 'error',
        category: '引用关系',
        message: `不能引用编号 ${refNum}（从属权利要求只能引用编号在前的权利要求）`,
        suggestion: `修正引用关系，确保只引用权利要求 1-${claim.number - 1}`,
      });
    }

    const referenced = allClaims.find((c) => c.number === refNum);
    if (!referenced) {
      issues.push({
        claimNumber: claim.number,
        severity: 'error',
        category: '引用关系',
        message: `引用的权利要求 ${refNum} 不存在`,
        suggestion: '检查并修正引用编号',
      });
    }
  });

  // 3. 检查是否包含"其特征在于"
  const hasCharacteristic = /[，；]其特征在于[：，]/.test(claim.content);
  if (!hasCharacteristic) {
    issues.push({
      claimNumber: claim.number,
      severity: 'info',
      category: '格式规范',
      message: '从属权利要求建议使用"其特征在于"引出附加特征',
      suggestion: '采用"根据权利要求X所述的……，其特征在于……"格式',
    });
  }

  return issues;
};

/**
 * 检查术语一致性（简化版，仅检查关键术语）
 */
const validateTerminologyConsistency = (claims: ClaimItem[]): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const termVariations: Record<string, string[]> = {};

  // 提取可能的术语（3-10字的中文词组）
  const extractTerms = (text: string): string[] => {
    const terms: string[] = [];
    // 简化：提取3-10字的连续中文
    const matches = text.match(/[\u4e00-\u9fa5]{3,10}/g) || [];
    matches.forEach((term) => {
      if (!/^(一种|一个|所述|其特征|包括|具有|设置|连接|用于)/.test(term)) {
        terms.push(term);
      }
    });
    return terms;
  };

  // 收集所有术语
  const allTerms: string[] = [];
  claims.forEach((claim) => {
    allTerms.push(...extractTerms(claim.content));
  });

  // 检测相似术语（简化：仅检查包含关系）
  const termSet = new Set(allTerms);
  termSet.forEach((term1) => {
    termSet.forEach((term2) => {
      if (term1 !== term2 && term1.length > 2 && term2.length > 2) {
        if (term1.includes(term2) || term2.includes(term1)) {
          const key = term1.length > term2.length ? term2 : term1;
          if (!termVariations[key]) {
            termVariations[key] = [];
          }
          termVariations[key].push(term1.length > term2.length ? term1 : term2);
        }
      }
    });
  });

  // 报告可能的术语不一致
  Object.entries(termVariations).forEach(([base, variations]) => {
    if (variations.length > 0) {
      const uniqueVariations = Array.from(new Set(variations));
      if (uniqueVariations.length > 1) {
        issues.push({
          claimNumber: 0, // 全局问题
          severity: 'warning',
          category: '术语一致性',
          message: `检测到相似术语：${base} 和 ${uniqueVariations.join('、')}`,
          suggestion: '检查是否应统一使用相同术语，确保权利要求书中术语前后一致',
        });
      }
    }
  });

  return issues;
};

/**
 * 校验权利要求书完整性与格式
 */
export const validateClaimStructure = (claimsText: string): ValidationResult => {
  const claims = parseClaims(claimsText);
  const issues: ValidationIssue[] = [];

  if (claims.length === 0) {
    return {
      isValid: false,
      issues: [
        {
          claimNumber: 0,
          severity: 'error',
          category: '格式规范',
          message: '无法解析权利要求书，请检查格式',
          suggestion: '确保每条权利要求有明确编号，如"1."或"权利要求1"',
        },
      ],
      claims: [],
      stats: { totalClaims: 0, independentClaims: 0, dependentClaims: 0 },
    };
  }

  // 统计
  const independentCount = claims.filter((c) => c.isIndependent).length;
  const dependentCount = claims.length - independentCount;

  // 基本检查
  if (independentCount === 0) {
    issues.push({
      claimNumber: 0,
      severity: 'error',
      category: '逻辑完整性',
      message: '缺少独立权利要求',
      suggestion: '至少需要1条独立权利要求描述完整技术方案',
    });
  }

  if (independentCount > 3) {
    issues.push({
      claimNumber: 0,
      severity: 'warning',
      category: '格式规范',
      message: `独立权利要求过多（${independentCount}条），建议控制在1-2条`,
      suggestion: '过多独立权利要求可能导致保护范围分散，建议合并或调整',
    });
  }

  // 逐条检查
  claims.forEach((claim) => {
    if (claim.isIndependent) {
      issues.push(...validateIndependentClaim(claim));
    } else {
      issues.push(...validateDependentClaim(claim, claims));
    }
  });

  // 术语一致性检查
  issues.push(...validateTerminologyConsistency(claims));

  // 判断是否通过
  const hasErrors = issues.some((issue) => issue.severity === 'error');

  return {
    isValid: !hasErrors,
    issues,
    claims,
    stats: {
      totalClaims: claims.length,
      independentClaims: independentCount,
      dependentClaims: dependentCount,
    },
  };
};

/**
 * 获取校验问题的摘要统计
 */
export const getValidationSummary = (result: ValidationResult): string => {
  const errorCount = result.issues.filter((i) => i.severity === 'error').length;
  const warningCount = result.issues.filter((i) => i.severity === 'warning').length;
  const infoCount = result.issues.filter((i) => i.severity === 'info').length;

  const parts: string[] = [];
  if (errorCount > 0) parts.push(`${errorCount} 个错误`);
  if (warningCount > 0) parts.push(`${warningCount} 个警告`);
  if (infoCount > 0) parts.push(`${infoCount} 条建议`);

  if (parts.length === 0) {
    return '格式规范，无明显问题';
  }

  return `发现 ${parts.join('、')}`;
};
