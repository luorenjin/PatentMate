/**
 * 图片标注服务测试脚本
 *
 * 测试 imageAnnotationService.ts 的所有导出函数
 */

import {
  generateAnnotation,
  generateBatchAnnotations,
  generateDrawingDescription,
  extractReferenceNumbers,
  isValidReferenceNumber,
  suggestNextReferenceNumber,
  formatReferenceList,
  parseReferenceInput,
} from '../services/imageAnnotationService';

// 测试用例
const runTests = () => {
  console.log('🧪 开始测试图片标注服务...\n');

  // Test 1: 提取参考标号
  console.log('测试 1: 从描述中提取参考标号');
  const extractionCases = [
    {
      input: '101为主体框架，102为支撑杆，103为连接件',
      expectedCount: 3,
      desc: '标准格式'
    },
    {
      input: '101:主体框架，102:支撑杆',
      expectedCount: 2,
      desc: '冒号格式'
    },
    {
      input: '101-主体，102-支架',
      expectedCount: 2,
      desc: '横线格式'
    },
    {
      input: '图中包含主体101、支架102和连接件103等部件',
      expectedCount: 0,
      desc: '不符合格式'
    }
  ];

  extractionCases.forEach(({ input, expectedCount, desc }) => {
    const refs = extractReferenceNumbers(input);
    const status = refs.length === expectedCount ? '✓' : '✗';
    console.log(`  ${status} ${desc}: 提取 ${refs.length} 个标号 (期望 ${expectedCount})`);
    if (refs.length > 0) {
      console.log(`    标号: ${refs.map(r => `${r.number}=${r.label}`).join(', ')}`);
    }
  });
  console.log('');

  // Test 2: 验证标号格式
  console.log('测试 2: 验证参考标号格式');
  const validationCases = [
    { num: '101', valid: true },
    { num: '1001', valid: true },
    { num: '10', valid: false, reason: '仅 2 位' },
    { num: '12345', valid: false, reason: '5 位' },
    { num: 'A101', valid: false, reason: '包含字母' },
  ];

  validationCases.forEach(({ num, valid, reason }) => {
    const result = isValidReferenceNumber(num);
    const status = result === valid ? '✓' : '✗';
    const desc = reason ? ` (${reason})` : '';
    console.log(`  ${status} "${num}": ${result ? '有效' : '无效'}${desc}`);
  });
  console.log('');

  // Test 3: 建议下一个标号
  console.log('测试 3: 建议下一个参考标号');
  const suggestionCases = [
    { existing: [], expected: '101', desc: '空数组' },
    { existing: ['101', '102', '103'], expected: '104', desc: '连续标号' },
    { existing: ['101', '105', '110'], expected: '111', desc: '不连续标号' },
    { existing: ['1001', '1002'], expected: '1003', desc: '4 位标号' },
    { existing: ['ABC'], expected: '101', desc: '无效标号' },
  ];

  suggestionCases.forEach(({ existing, expected, desc }) => {
    const result = suggestNextReferenceNumber(existing);
    const status = result === expected ? '✓' : '✗';
    console.log(`  ${status} ${desc}: ${result} (期望 ${expected})`);
  });
  console.log('');

  // Test 4: 生成单个标注
  console.log('测试 4: 生成单个附图标注');
  const annotation1 = generateAnnotation({
    figureNumber: '图1',
    patentTitle: '一种智能折叠伞',
    technicalField: '机械',
    inventionSummary: '包含四级伸缩伞骨，实现超小收纳体积',
    userDescription: '101为主体框架，102为伞骨，103为连接件，整体构成可折叠结构',
  });

  console.log(`  ✓ 图号: ${annotation1.figureNumber}`);
  console.log(`  ✓ 类型: ${annotation1.type}`);
  console.log(`  ✓ 标号数量: ${annotation1.referenceNumbers.length}`);
  console.log(`  ✓ 描述: ${annotation1.description.substring(0, 60)}...`);
  console.log(`  ✓ 标号详情:`);
  annotation1.referenceNumbers.forEach(ref => {
    console.log(`    - ${ref.number}: ${ref.label}${ref.importance ? ` (${ref.importance})` : ''}`);
  });
  console.log('');

  // Test 5: 附图类型推断
  console.log('测试 5: 附图类型推断');
  const typeCases = [
    { desc: '展示系统整体架构和各模块之间的关系', field: 'AI', expectedType: '系统架构示意图' },
    { desc: '用户登录的完整流程步骤', field: '软件', expectedType: '流程示意图' },
    { desc: '电路板的电路连接关系', field: '电子', expectedType: '电路示意图' },
    { desc: '设备的纵向剖面结构', field: '机械', expectedType: '剖面示意图' },
    { desc: '各部件的分解展示', field: '机械', expectedType: '爆炸示意图' },
  ];

  typeCases.forEach(({ desc, field, expectedType }) => {
    const annotation = generateAnnotation({
      figureNumber: '图测试',
      patentTitle: '测试专利',
      technicalField: field,
      inventionSummary: '测试',
      userDescription: desc,
    });
    const status = annotation.type === expectedType ? '✓' : '✗';
    console.log(`  ${status} "${desc.substring(0, 20)}..." → ${annotation.type} (期望: ${expectedType})`);
  });
  console.log('');

  // Test 6: 批量生成标注
  console.log('测试 6: 批量生成附图标注');
  const batchRequests = [
    {
      figureNumber: '图1',
      patentTitle: '一种数据处理系统',
      technicalField: 'AI',
      inventionSummary: '...',
      userDescription: '101为数据采集模块，102为处理单元',
    },
    {
      figureNumber: '图2',
      patentTitle: '一种数据处理系统',
      technicalField: 'AI',
      inventionSummary: '...',
      userDescription: '展示数据处理流程的步骤',
    },
  ];

  const batchAnnotations = generateBatchAnnotations(batchRequests);
  console.log(`  ✓ 批量生成 ${batchAnnotations.length} 个标注`);
  batchAnnotations.forEach((ann, idx) => {
    console.log(`    ${idx + 1}. ${ann.figureNumber} (${ann.type}), 标号数: ${ann.referenceNumbers.length}`);
  });
  console.log('');

  // Test 7: 生成完整附图说明文本
  console.log('测试 7: 生成完整附图说明文本');
  const completeAnnotations = [
    generateAnnotation({
      figureNumber: '图1',
      patentTitle: '测试',
      technicalField: '机械',
      inventionSummary: '...',
      userDescription: '101为主体，102为支架',
    }),
    generateAnnotation({
      figureNumber: '图2',
      patentTitle: '测试',
      technicalField: '机械',
      inventionSummary: '...',
      userDescription: '201为电机，202为齿轮',
    }),
  ];

  const markdown = generateDrawingDescription(completeAnnotations);
  console.log(`  ✓ 生成的 Markdown 文档长度: ${markdown.length} 字符`);
  console.log(`  ✓ 包含 "附图说明" 标题: ${markdown.includes('## 附图说明') ? '是' : '否'}`);
  console.log(`  ✓ 包含 "参考标号说明" 标题: ${markdown.includes('## 参考标号说明') ? '是' : '否'}`);
  console.log(`  ✓ 预览:\n${markdown.substring(0, 200)}...\n`);

  // Test 8: 格式化和解析
  console.log('测试 8: 参考标号格式化和解析');
  const refs = [
    { number: '101', label: '主体' },
    { number: '102', label: '支架' },
  ];

  const formatted = formatReferenceList(refs);
  console.log(`  ✓ 格式化输出:\n${formatted.split('\n').map(line => `    ${line}`).join('\n')}`);

  const parsed = parseReferenceInput('101为主体，102为支架，103为连接件');
  console.log(`  ✓ 解析字典: ${JSON.stringify(parsed)}`);
  console.log('');

  // Test 9: 边界情况
  console.log('测试 9: 边界情况处理');

  // 空描述
  const emptyAnnotation = generateAnnotation({
    figureNumber: '图空',
    patentTitle: '测试',
    technicalField: '机械',
    inventionSummary: '...',
    userDescription: '',
  });
  console.log(`  ✓ 空描述处理: 类型=${emptyAnnotation.type}, 标号数=${emptyAnnotation.referenceNumbers.length}`);

  // 空标注数组
  const emptyMarkdown = generateDrawingDescription([]);
  console.log(`  ✓ 空标注数组: ${emptyMarkdown.includes('（无附图）') ? '通过' : '失败'}`);

  // 已知标号与提取标号合并
  const mergedAnnotation = generateAnnotation({
    figureNumber: '图合并',
    patentTitle: '测试',
    technicalField: '机械',
    inventionSummary: '...',
    userDescription: '102为支架，103为连接件',
    knownLabels: { '101': '主体', '102': '已知支架' },
  });
  console.log(`  ✓ 标号合并: ${mergedAnnotation.referenceNumbers.length} 个标号`);
  console.log(`    - 优先使用已知标号: ${mergedAnnotation.referenceNumbers[0].number === '101' && mergedAnnotation.referenceNumbers[0].label === '主体' ? '是' : '否'}`);
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
