/**
 * 深度问卷功能测试脚本
 *
 * 测试 disclosureTemplateService.ts 的所有导出函数
 */

import {
  generateDeepQuestionnaire,
  validateEvidenceMaterials,
  hasQuantitativeData,
} from '../services/disclosureTemplateService';

// 测试用例
const runTests = () => {
  console.log('🧪 开始测试深度问卷功能...\n');

  // Test 1: 生成 AI 领域发明专利问卷
  console.log('测试 1: 生成 AI 领域发明专利问卷');
  const aiQuestions = generateDeepQuestionnaire('invention', 'AI');
  console.log(`  ✓ 生成 ${aiQuestions.length} 个问题`);
  console.log(`  ✓ 基础问题: ${aiQuestions.slice(0, 4).map(q => q.id).join(', ')}`);
  console.log(`  ✓ 专业问题: ${aiQuestions.slice(4, 7).map(q => q.id).join(', ')}`);
  console.log(`  ✓ 证据问题: ${aiQuestions.slice(7).map(q => q.id).join(', ')}`);

  // 验证问题结构
  const evidenceQ1 = aiQuestions.find(q => q.id === 'q_evidence_1');
  if (evidenceQ1) {
    console.log(`  ✓ 证据问题 1: ${evidenceQ1.question.substring(0, 30)}...`);
    console.log(`  ✓ 必填: ${evidenceQ1.required ? '是' : '否'}`);
    console.log(`  ✓ 示例: ${evidenceQ1.placeholder ? '有' : '无'}`);
  }
  console.log('');

  // Test 2: 生成实用新型问卷
  console.log('测试 2: 生成实用新型（机械领域）问卷');
  const utilityQuestions = generateDeepQuestionnaire('utility', '机械');
  console.log(`  ✓ 生成 ${utilityQuestions.length} 个问题`);
  const structureQuestions = utilityQuestions.filter(q => q.id.startsWith('q_structure'));
  console.log(`  ✓ 结构问题数量: ${structureQuestions.length}`);
  console.log('');

  // Test 3: 测试所有 10 个技术领域
  console.log('测试 3: 测试所有 10 个技术领域');
  const fields = ['AI', '新能源', '医疗器械', '软件', '机械', '化工', '电子', '通信', '生物', '材料'];
  fields.forEach(field => {
    const questions = generateDeepQuestionnaire('invention', field);
    const professionalQuestions = questions.filter(q => q.category === 'professional');
    console.log(`  ✓ ${field}: ${professionalQuestions.length} 个专业问题`);
  });
  console.log('');

  // Test 4: 量化数据检测
  console.log('测试 4: 量化数据检测');
  const testCases = [
    {
      input: '在COCO数据集上mAP达到42.5%（输入分辨率640×640，推理时间25ms/张）',
      expected: true,
      desc: '包含百分比、分辨率、时间'
    },
    {
      input: '相比ResNet-50，参数量减少45%（25.6M → 14.1M）',
      expected: true,
      desc: '包含百分比、参数量'
    },
    {
      input: '采用先进的神经网络架构，性能优异',
      expected: false,
      desc: '无量化数据'
    },
    {
      input: '电池容量为5000mAh，充电时间30分钟，续航48小时',
      expected: true,
      desc: '包含容量、时间'
    },
    {
      input: '温度范围-40°C至85°C，压力最大10MPa',
      expected: true,
      desc: '包含温度、压力'
    }
  ];

  testCases.forEach(({ input, expected, desc }, idx) => {
    const result = hasQuantitativeData(input);
    const status = result === expected ? '✓' : '✗';
    console.log(`  ${status} 测试 ${idx + 1}: ${desc}`);
    console.log(`    输入: "${input.substring(0, 50)}..."`);
    console.log(`    期望: ${expected}, 结果: ${result}`);
  });
  console.log('');

  // Test 5: 证据材料验证
  console.log('测试 5: 证据材料验证');
  const validationCases = [
    {
      materials: [
        '在COCO数据集上mAP达到42.5%（输入分辨率640×640）',
        '相比ResNet-50，参数量减少45%（25.6M → 14.1M）'
      ],
      expectedValid: true,
      desc: '2 条有效证据'
    },
    {
      materials: [
        '采用先进的架构'
      ],
      expectedValid: false,
      desc: '仅 1 条，不满足要求'
    },
    {
      materials: [
        '性能优异',
        '效果很好'
      ],
      expectedValid: false,
      desc: '2 条但无量化数据'
    },
    {
      materials: [],
      expectedValid: false,
      desc: '空数组'
    }
  ];

  validationCases.forEach(({ materials, expectedValid, desc }) => {
    const result = validateEvidenceMaterials(materials);
    const status = result.valid === expectedValid ? '✓' : '✗';
    console.log(`  ${status} ${desc}`);
    console.log(`    期望: ${expectedValid}, 结果: ${result.valid}`);
    console.log(`    消息: ${result.message}`);
  });
  console.log('');

  // Test 6: 边界情况测试
  console.log('测试 6: 边界情况测试');

  // 测试空字符串
  const emptyValidation = validateEvidenceMaterials(['', '']);
  console.log(`  ✓ 空字符串处理: ${emptyValidation.valid ? '失败 (应为 false)' : '通过'}`);

  // 测试单个数字但无单位
  const noUnitData = hasQuantitativeData('参数量为 25600000 个');
  console.log(`  ✓ 仅数字无单位检测: ${noUnitData ? '通过' : '失败 (应检测到数字)'}`);

  // 测试多个单位组合
  const multiUnitData = hasQuantitativeData('功率 100W，电压 220V，电流 0.45A');
  console.log(`  ✓ 多个单位组合: ${multiUnitData ? '通过' : '失败 (应检测到)'}`);

  console.log('');
  console.log('✅ 所有测试完成！');
};

// 运行测试
try {
  runTests();
} catch (error) {
  console.error('❌ 测试失败:', error);
  process.exit(1);
}
