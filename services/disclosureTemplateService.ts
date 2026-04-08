/**
 * 技术交底深度问卷模板服务
 *
 * 按技术领域动态生成深度交底问卷，包含领域特定问题和量化证据要求。
 */

import { PatentType, TechnicalField, TemplateQuestion } from '../types';

/**
 * 生成技术领域特定的深度问卷
 * @param patentType 专利类型（发明/实用新型）
 * @param technicalField 技术领域
 * @returns 深度问卷问题列表
 */
export const generateDeepQuestionnaire = (
  patentType: PatentType,
  technicalField: TechnicalField
): TemplateQuestion[] => {
  if (patentType === 'utility') {
    return getUtilityModelQuestions();
  }

  // 发明专利：根据技术领域返回深度问卷
  const baseQuestions = getInventionBaseQuestions();
  const fieldSpecificQuestions = getFieldSpecificQuestions(technicalField);
  const evidenceQuestions = getEvidenceQuestions(technicalField);

  return [...baseQuestions, ...fieldSpecificQuestions, ...evidenceQuestions];
};

/**
 * 获取发明专利基础问题（通用，适用所有领域）
 */
const getInventionBaseQuestions = (): TemplateQuestion[] => [
  {
    id: 'q1',
    question: '发明目的 - 您的发明旨在解决什么技术问题？',
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
];

/**
 * 获取技术领域特定问题
 */
const getFieldSpecificQuestions = (field: TechnicalField): TemplateQuestion[] => {
  const fieldQuestions: Record<TechnicalField, TemplateQuestion[]> = {
    AI: [
      {
        id: 'q_ai_1',
        question: '模型架构 - 请详细描述使用的模型架构或网络结构？',
        helpText: '包括层数、激活函数、损失函数、优化器等关键参数',
        exampleAnswer: '采用改进的Transformer架构，包含12层编码器和6层解码器；使用GELU激活函数；损失函数为交叉熵+KL散度；优化器为AdamW，学习率0.0001',
        placeholder: '描述模型架构细节',
      },
      {
        id: 'q_ai_2',
        question: '训练数据 - 使用了什么数据集？数据预处理方法是什么？',
        helpText: '说明数据集规模、来源、标注方式、预处理步骤',
        exampleAnswer: '使用ImageNet-1K数据集（120万张训练图片）；预处理包括随机裁剪、翻转、归一化；采用Mixup数据增强',
        placeholder: '描述训练数据和预处理',
      },
      {
        id: 'q_ai_3',
        question: '推理部署 - 模型如何部署？推理性能如何？',
        helpText: '说明部署方式、推理延迟、吞吐量、资源占用等',
        exampleAnswer: '使用ONNX格式部署到GPU服务器；单张图片推理时间15ms；吞吐量66 FPS；显存占用2GB',
        placeholder: '描述部署方式和性能指标',
      },
    ],
    新能源: [
      {
        id: 'q_energy_1',
        question: '能量转换 - 您的发明如何实现能量转换或存储？',
        helpText: '描述能量转换原理、转换效率、存储容量等关键参数',
        exampleAnswer: '通过三元锂电池实现电能存储，能量密度达到280Wh/kg；充电效率95%；循环寿命2000次以上',
        placeholder: '描述能量转换/存储机制',
      },
      {
        id: 'q_energy_2',
        question: '材料组成 - 使用了哪些材料？材料特性如何？',
        helpText: '说明材料成分、物理化学性质、成本、环保性',
        exampleAnswer: '正极材料为NCM811（镍钴锰比例8:1:1），负极为石墨；电解液为六氟磷酸锂；成本约500元/kWh',
        placeholder: '描述材料组成和特性',
      },
      {
        id: 'q_energy_3',
        question: '安全性能 - 采取了哪些安全措施？通过了哪些测试？',
        helpText: '说明安全设计、热失控防护、通过的认证标准',
        exampleAnswer: '采用陶瓷涂层隔膜防止短路；通过针刺、挤压、过充测试；符合GB 38031-2020标准',
        placeholder: '描述安全设计和测试',
      },
    ],
    医疗器械: [
      {
        id: 'q_medical_1',
        question: '临床应用 - 该器械用于什么临床场景？如何使用？',
        helpText: '描述适应症、使用方法、操作流程',
        exampleAnswer: '用于心血管疾病诊断；通过超声探头扫描获取心脏图像；自动分析心脏功能参数；操作时间约5分钟',
        placeholder: '描述临床应用场景',
      },
      {
        id: 'q_medical_2',
        question: '生物相容性 - 材料是否与人体接触？如何保证安全性？',
        helpText: '说明材料选择、生物相容性测试、灭菌方式',
        exampleAnswer: '接触材料为医用硅胶和316L不锈钢；通过ISO 10993生物相容性测试；采用环氧乙烷灭菌',
        placeholder: '描述生物相容性和安全措施',
      },
      {
        id: 'q_medical_3',
        question: '临床数据 - 是否有临床试验数据？效果如何？',
        helpText: '提供临床试验样本量、有效性指标、统计显著性',
        exampleAnswer: '完成120例临床试验；诊断准确率95%；敏感性92%，特异性97%；p<0.01显著优于对照组',
        placeholder: '描述临床试验数据',
      },
    ],
    软件: [
      {
        id: 'q_software_1',
        question: '系统架构 - 软件系统采用什么架构？包含哪些模块？',
        helpText: '描述架构模式（如微服务、分层）、核心模块、模块间通信',
        exampleAnswer: '采用微服务架构；包含用户管理、订单处理、支付网关、消息队列等模块；通过gRPC通信',
        placeholder: '描述系统架构',
      },
      {
        id: 'q_software_2',
        question: '核心算法 - 使用了哪些关键算法？算法复杂度如何？',
        helpText: '说明算法原理、时间/空间复杂度、优化方法',
        exampleAnswer: '使用改进的A*算法进行路径规划；时间复杂度O(n log n)；通过启发式函数优化减少搜索空间50%',
        placeholder: '描述核心算法',
      },
      {
        id: 'q_software_3',
        question: '性能指标 - 系统性能如何？如何保证高可用？',
        helpText: '提供响应时间、并发量、可用性、容错机制',
        exampleAnswer: '平均响应时间100ms；支持10万并发；可用性99.9%；采用主备冗余+自动故障转移',
        placeholder: '描述性能和可用性',
      },
    ],
    机械: [
      {
        id: 'q_mech_1',
        question: '结构设计 - 关键部件的结构是什么？运动原理如何？',
        helpText: '描述关键零部件、连接方式、运动传递路径',
        exampleAnswer: '包含齿轮传动机构和凸轮机构；通过皮带传动实现动力传递；齿轮比1:3.5；凸轮轮廓为椭圆形',
        placeholder: '描述机械结构和运动',
      },
      {
        id: 'q_mech_2',
        question: '材料强度 - 使用什么材料？强度是否满足要求？',
        helpText: '说明材料牌号、力学性能、强度计算、安全系数',
        exampleAnswer: '主体材料为45号钢；屈服强度355MPa；经有限元分析，最大应力280MPa；安全系数1.27',
        placeholder: '描述材料和强度',
      },
      {
        id: 'q_mech_3',
        question: '加工工艺 - 如何制造？有哪些关键工艺？',
        helpText: '说明加工方法、精度要求、表面处理',
        exampleAnswer: '采用数控铣削加工；公差等级IT7；表面粗糙度Ra1.6；关键部位淬火处理提高硬度',
        placeholder: '描述加工工艺',
      },
    ],
    化工: [
      {
        id: 'q_chem_1',
        question: '化学反应 - 涉及哪些化学反应？反应条件是什么？',
        helpText: '写出反应方程式、反应温度/压力/催化剂、反应时间',
        exampleAnswer: '2A + B → C + D；反应温度180°C；压力2MPa；催化剂为铂碳；反应时间4小时；产率92%',
        placeholder: '描述化学反应',
      },
      {
        id: 'q_chem_2',
        question: '物质特性 - 原料和产物的理化性质是什么？',
        helpText: '说明熔点、沸点、溶解性、稳定性、毒性等',
        exampleAnswer: '产物为白色晶体；熔点125-127°C；易溶于乙醇，微溶于水；常温常压稳定；低毒性，LD50>2000mg/kg',
        placeholder: '描述理化性质',
      },
      {
        id: 'q_chem_3',
        question: '工艺优化 - 如何提高收率或降低成本？',
        helpText: '说明优化方法、成本降低幅度、收率提升效果',
        exampleAnswer: '通过回流冷凝回收溶剂，溶剂损失从15%降至3%；优化催化剂用量从5%降至2%；综合成本降低25%',
        placeholder: '描述工艺优化',
      },
    ],
    电子: [
      {
        id: 'q_elec_1',
        question: '电路设计 - 核心电路结构是什么？关键元器件有哪些？',
        helpText: '提供电路框图、关键芯片型号、电路参数',
        exampleAnswer: '采用双运放差分放大电路；运放选用OPA2134；增益60dB；带宽20Hz-20kHz；THD<0.001%',
        placeholder: '描述电路设计',
      },
      {
        id: 'q_elec_2',
        question: '电气参数 - 工作电压/电流/功耗是多少？',
        helpText: '说明供电要求、功耗大小、效率指标',
        exampleAnswer: '工作电压5V±10%；静态电流50μA；峰值电流200mA；待机功耗0.25mW；转换效率90%',
        placeholder: '描述电气参数',
      },
      {
        id: 'q_elec_3',
        question: '信号处理 - 如何处理输入信号？算法是什么？',
        helpText: '说明信号采集、滤波、放大、AD转换等过程',
        exampleAnswer: '通过24位ADC采样；采样率192kHz；使用8阶Butterworth低通滤波；截止频率20kHz；动态范围120dB',
        placeholder: '描述信号处理',
      },
    ],
    通信: [
      {
        id: 'q_comm_1',
        question: '通信协议 - 使用什么通信协议？数据格式如何？',
        helpText: '说明协议栈、数据帧结构、编解码方式',
        exampleAnswer: '采用LoRa物联网协议；使用扩频因子SF7；数据帧包含帧头（2字节）+负载（最大255字节）+CRC（2字节）',
        placeholder: '描述通信协议',
      },
      {
        id: 'q_comm_2',
        question: '传输性能 - 通信距离、速率、可靠性如何？',
        helpText: '提供传输距离、数据速率、误码率、抗干扰能力',
        exampleAnswer: '空旷环境传输距离5km；数据速率5kbps；误码率<10^-6；支持多径衰落和频偏补偿',
        placeholder: '描述传输性能',
      },
      {
        id: 'q_comm_3',
        question: '网络拓扑 - 组网方式是什么？支持多少节点？',
        helpText: '说明拓扑结构（星型/网状/树形）、节点数量、路由算法',
        exampleAnswer: '采用星型网络拓扑；网关支持1024个终端节点；使用TDMA时分多址避免冲突；支持动态休眠降低功耗',
        placeholder: '描述网络拓扑',
      },
    ],
    生物: [
      {
        id: 'q_bio_1',
        question: '生物材料 - 使用了哪些生物材料？来源和特性如何？',
        helpText: '说明细胞系、菌株、蛋白、核酸等来源、保存条件',
        exampleAnswer: '使用大肠杆菌BL21菌株表达重组蛋白；质粒为pET-28a；保存于-80°C甘油菌种；蛋白分子量45kDa',
        placeholder: '描述生物材料',
      },
      {
        id: 'q_bio_2',
        question: '实验方法 - 采用了哪些关键实验技术？',
        helpText: '说明分子克隆、细胞培养、分析检测等方法',
        exampleAnswer: '使用PCR扩增目的基因；限制性内切酶EcoRI和XhoI双酶切；Western blot检测蛋白表达；ELISA测定活性',
        placeholder: '描述实验方法',
      },
      {
        id: 'q_bio_3',
        question: '生物活性 - 产物的生物学功能是什么？如何验证？',
        helpText: '说明活性测定方法、IC50值、功能验证实验',
        exampleAnswer: '体外抗肿瘤活性测试，IC50为2.5μM；细胞凋亡率78%；动物实验肿瘤体积缩小65%（p<0.01）',
        placeholder: '描述生物活性',
      },
    ],
    材料: [
      {
        id: 'q_mat_1',
        question: '材料制备 - 如何制备该材料？工艺参数是什么？',
        helpText: '说明制备方法、温度/压力/时间、后处理工艺',
        exampleAnswer: '采用溶胶凝胶法制备；前驱体溶液浓度0.5M；80°C干燥12h；600°C煅烧2h；冷却速率5°C/min',
        placeholder: '描述材料制备',
      },
      {
        id: 'q_mat_2',
        question: '微观结构 - 材料的微观结构是什么？如何表征？',
        helpText: '说明晶体结构、形貌、孔隙率、比表面积等',
        exampleAnswer: '通过XRD确认为立方晶系；SEM观察颗粒尺寸50-100nm；BET比表面积280m²/g；孔径分布集中在2-5nm',
        placeholder: '描述微观结构',
      },
      {
        id: 'q_mat_3',
        question: '性能测试 - 材料性能如何？与现有材料相比优势在哪？',
        helpText: '提供力学、电学、光学、热学等性能数据和对比',
        exampleAnswer: '抗拉强度580MPa，比普通材料提高40%；导电率1.2×10^6 S/m；热膨胀系数5×10^-6/K；循环稳定性1000次无明显衰减',
        placeholder: '描述性能测试',
      },
    ],
  };

  return fieldQuestions[field] || [];
};

/**
 * 获取量化证据问题（适用所有领域）
 */
const getEvidenceQuestions = (field: TechnicalField): TemplateQuestion[] => [
  {
    id: 'q_evidence_1',
    question: '【必填】量化证据 1 - 请提供第一组对比实验数据或测试结果',
    helpText: '必须包含具体数字、单位、测试条件。格式：指标名称 + 数值 + 单位 + 测试条件',
    exampleAnswer: field === 'AI'
      ? '在COCO数据集上mAP达到42.5%（输入分辨率640×640，推理时间25ms/张，GPU为RTX 3090）'
      : field === '新能源'
      ? '电池能量密度280Wh/kg，循环寿命2000次（25°C，1C充放电）'
      : field === '医疗器械'
      ? '诊断准确率95.2%（样本量120例，敏感性92%，特异性97%）'
      : '性能提升30%（测试条件：常温常压，测试方法：GB/T xxxx）',
    placeholder: '必填：指标 + 具体数值 + 单位 + 测试条件',
  },
  {
    id: 'q_evidence_2',
    question: '【必填】量化证据 2 - 请提供第二组对比数据（与现有技术对比）',
    helpText: '必须包含现有技术数据和本发明数据的对比，说明提升幅度',
    exampleAnswer: field === 'AI'
      ? '相比ResNet-50，参数量减少45%（25.6M → 14.1M），推理速度提升60%（40ms → 25ms）'
      : field === '新能源'
      ? '相比传统锂电池，充电时间缩短50%（2小时 → 1小时），循环寿命提升25%（1600次 → 2000次）'
      : field === '医疗器械'
      ? '相比人工诊断，诊断时间缩短80%（30分钟 → 6分钟），漏诊率降低60%（15% → 6%）'
      : '相比现有技术，成本降低20%，效率提升25%',
    placeholder: '必填：现有技术数据 vs 本发明数据 + 提升幅度',
  },
  {
    id: 'q_evidence_3',
    question: '【可选】量化证据 3 - 其他支持数据（如可靠性、成本、用户反馈等）',
    helpText: '提供额外的量化证据，如可靠性测试、成本分析、用户满意度等',
    exampleAnswer: '可靠性测试：MTBF达到50000小时；成本：相比现有方案降低30%（500元 → 350元）；用户满意度：4.8/5.0（n=200）',
    placeholder: '可选：其他量化数据',
  },
];

/**
 * 获取实用新型问题（结构为主，不区分技术领域）
 */
const getUtilityModelQuestions = (): TemplateQuestion[] => [
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

/**
 * 验证 evidenceMaterials 是否满足最低要求（≥2 条）
 * @param evidenceMaterials 证据材料数组
 * @returns 验证结果 { valid: boolean, message: string }
 */
export const validateEvidenceMaterials = (
  evidenceMaterials: string[]
): { valid: boolean; message: string } => {
  const validEvidence = evidenceMaterials.filter(
    (item) => item && item.trim().length > 10
  );

  if (validEvidence.length === 0) {
    return {
      valid: false,
      message: '请至少提供 2 条量化证据（包含具体数字、单位、测试条件）',
    };
  }

  if (validEvidence.length === 1) {
    return {
      valid: false,
      message: '量化证据不足，请再提供至少 1 条对比数据（当前已提供 1 条）',
    };
  }

  return {
    valid: true,
    message: `已提供 ${validEvidence.length} 条量化证据，满足要求`,
  };
};

/**
 * 检查证据是否包含量化数据
 * @param evidence 证据文本
 * @returns 是否包含数字和单位
 */
export const hasQuantitativeData = (evidence: string): boolean => {
  // 检查是否包含数字
  const hasNumber = /\d+(\.\d+)?/.test(evidence);
  // 检查是否包含常见单位或百分比
  const hasUnit =
    /%|ms|秒|分钟|小时|天|kg|g|mg|米|cm|mm|°C|℃|MPa|kPa|V|A|W|Hz|bit|byte|MB|GB/.test(
      evidence
    );

  return hasNumber && hasUnit;
};
