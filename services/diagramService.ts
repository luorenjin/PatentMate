/**
 * 专利附图生成服务 - 增强版
 *
 * 核心功能：
 * 1. 生成 Mermaid 流程图、架构图
 * 2. 生成 PlantUML 类图、组件图、部署图
 * 3. 提供图表类型选择和参数配置
 * 4. 支持图表代码导出和预览
 */

import { generateText } from './aiService';

export type DiagramType =
  | 'flowchart'      // Mermaid 流程图
  | 'sequence'       // Mermaid 时序图
  | 'architecture'   // Mermaid 架构图
  | 'class'          // PlantUML 类图
  | 'component'      // PlantUML 组件图
  | 'deployment';    // PlantUML 部署图

export interface DiagramRequest {
  type: DiagramType;
  description: string;  // 图表内容描述
  title?: string;       // 图表标题
  context?: {
    patentTitle?: string;
    technicalField?: string;
    inventionContent?: string;
  };
}

export interface DiagramResult {
  code: string;         // 图表代码（Mermaid 或 PlantUML）
  type: DiagramType;
  language: 'mermaid' | 'plantuml';
  renderUrl?: string;   // 渲染服务 URL（可选）
}

/**
 * 生成 Mermaid 流程图代码
 */
export const generateMermaidFlowchart = async (
  description: string,
  context?: DiagramRequest['context']
): Promise<string> => {
  const prompt = `
你是专利附图专家。请根据以下技术描述，生成一个清晰的 Mermaid 流程图代码。

${context?.patentTitle ? `发明名称：${context.patentTitle}` : ''}
${context?.technicalField ? `技术领域：${context.technicalField}` : ''}

图表描述：
${description}

${context?.inventionContent ? `技术方案参考：\n${context.inventionContent.slice(0, 500)}` : ''}

要求：
1. 使用 flowchart TD（自上而下）或 flowchart LR（从左到右）语法
2. 节点文字简洁，每个节点不超过10个中文字符
3. 使用合适的节点形状：矩形[]、菱形{}、圆角()、椭圆([])
4. 连线要有清晰的逻辑关系，必要时加上文字说明
5. 严格遵守 Mermaid 语法规范，不要添加任何解释文字
6. 只输出纯 Mermaid 代码，不要包含 \`\`\` 代码块标记

示例输出格式：
flowchart TD
    A[开始] --> B{判断条件}
    B -->|是| C[执行步骤1]
    B -->|否| D[执行步骤2]
    C --> E[结束]
    D --> E
  `;

  try {
    const { text } = await generateText(prompt, 'pro');
    // 清理可能的代码块标记
    let code = text.trim();
    code = code.replace(/^```(?:mermaid)?\s*/i, '');
    code = code.replace(/\s*```$/,'');
    return code;
  } catch (error) {
    console.error('generateMermaidFlowchart failed:', error);
    return 'flowchart TD\n    A[开始] --> B[结束]';
  }
};

/**
 * 生成 Mermaid 时序图代码
 */
export const generateMermaidSequence = async (
  description: string,
  context?: DiagramRequest['context']
): Promise<string> => {
  const prompt = `
你是专利附图专家。请根据以下交互流程描述，生成一个 Mermaid 时序图代码。

${context?.patentTitle ? `发明名称：${context.patentTitle}` : ''}

时序描述：
${description}

要求：
1. 使用 sequenceDiagram 语法
2. 清晰标注参与者（participant）
3. 使用箭头表示消息流向：->>（实线）、-->>（虚线）
4. 必要时添加 Note 说明
5. 只输出纯 Mermaid 代码，不要包含代码块标记

示例输出格式：
sequenceDiagram
    participant 用户
    participant 客户端
    participant 服务器
    用户->>客户端: 发起请求
    客户端->>服务器: 转发请求
    服务器-->>客户端: 返回结果
    客户端-->>用户: 显示结果
  `;

  try {
    const { text } = await generateText(prompt, 'pro');
    let code = text.trim();
    code = code.replace(/^```(?:mermaid)?\s*/i, '');
    code = code.replace(/\s*```$/, '');
    return code;
  } catch (error) {
    console.error('generateMermaidSequence failed:', error);
    return 'sequenceDiagram\n    participant A\n    participant B\n    A->>B: 消息';
  }
};

/**
 * 生成 Mermaid 架构图代码
 */
export const generateMermaidArchitecture = async (
  description: string,
  context?: DiagramRequest['context']
): Promise<string> => {
  const prompt = `
你是专利附图专家。请根据以下系统架构描述，生成一个 Mermaid 架构图代码。

${context?.patentTitle ? `发明名称：${context.patentTitle}` : ''}

架构描述：
${description}

要求：
1. 使用 graph LR（从左到右）或 graph TB（从上到下）语法
2. 使用子图（subgraph）表示模块分组
3. 节点形状反映组件类型：数据库[(DB)]、服务[Service]等
4. 连线表示数据流或调用关系
5. 只输出纯 Mermaid 代码，不要包含代码块标记

示例输出格式：
graph LR
    subgraph 前端层
        A[用户界面]
    end
    subgraph 业务层
        B[业务逻辑]
        C[数据处理]
    end
    subgraph 数据层
        D[(数据库)]
    end
    A --> B
    B --> C
    C --> D
  `;

  try {
    const { text } = await generateText(prompt, 'pro');
    let code = text.trim();
    code = code.replace(/^```(?:mermaid)?\s*/i, '');
    code = code.replace(/\s*```$/, '');
    return code;
  } catch (error) {
    console.error('generateMermaidArchitecture failed:', error);
    return 'graph LR\n    A[模块A] --> B[模块B]';
  }
};

/**
 * 生成 PlantUML 类图代码
 */
export const generatePlantUMLClass = async (
  description: string,
  context?: DiagramRequest['context']
): Promise<string> => {
  const prompt = `
你是专利附图专家。请根据以下类结构描述，生成一个 PlantUML 类图代码。

${context?.patentTitle ? `发明名称：${context.patentTitle}` : ''}

类结构描述：
${description}

要求：
1. 使用 @startuml 和 @enduml 包裹
2. 清晰表示类、接口、抽象类
3. 标注继承（<|--）、实现（<|..)、关联（-->）、组合（*-->）关系
4. 简化属性和方法，只列出关键的
5. 只输出纯 PlantUML 代码

示例输出格式：
@startuml
class 基类 {
  - 属性1: string
  + 方法1()
}

class 子类 extends 基类 {
  - 属性2: int
  + 方法2()
}

基类 <|-- 子类
@enduml
  `;

  try {
    const { text } = await generateText(prompt, 'pro');
    let code = text.trim();
    code = code.replace(/^```(?:plantuml)?\s*/i, '');
    code = code.replace(/\s*```$/, '');
    if (!code.includes('@startuml')) {
      code = '@startuml\n' + code;
    }
    if (!code.includes('@enduml')) {
      code = code + '\n@enduml';
    }
    return code;
  } catch (error) {
    console.error('generatePlantUMLClass failed:', error);
    return '@startuml\nclass 示例类\n@enduml';
  }
};

/**
 * 生成 PlantUML 组件图代码
 */
export const generatePlantUMLComponent = async (
  description: string,
  context?: DiagramRequest['context']
): Promise<string> => {
  const prompt = `
你是专利附图专家。请根据以下组件描述，生成一个 PlantUML 组件图代码。

${context?.patentTitle ? `发明名称：${context.patentTitle}` : ''}

组件描述：
${description}

要求：
1. 使用 @startuml 和 @enduml 包裹
2. 使用 component、package、interface 等关键字
3. 清晰表示组件之间的依赖关系
4. 简洁表达，避免过度复杂
5. 只输出纯 PlantUML 代码

示例输出格式：
@startuml
package "系统包" {
  [组件A]
  [组件B]
}

[组件A] --> [组件B]
@enduml
  `;

  try {
    const { text } = await generateText(prompt, 'pro');
    let code = text.trim();
    code = code.replace(/^```(?:plantuml)?\s*/i, '');
    code = code.replace(/\s*```$/, '');
    if (!code.includes('@startuml')) {
      code = '@startuml\n' + code;
    }
    if (!code.includes('@enduml')) {
      code = code + '\n@enduml';
    }
    return code;
  } catch (error) {
    console.error('generatePlantUMLComponent failed:', error);
    return '@startuml\n[组件示例]\n@enduml';
  }
};

/**
 * 生成 PlantUML 部署图代码
 */
export const generatePlantUMLDeployment = async (
  description: string,
  context?: DiagramRequest['context']
): Promise<string> => {
  const prompt = `
你是专利附图专家。请根据以下部署架构描述，生成一个 PlantUML 部署图代码。

${context?.patentTitle ? `发明名称：${context.patentTitle}` : ''}

部署描述：
${description}

要求：
1. 使用 @startuml 和 @enduml 包裹
2. 使用 node、artifact、database 等关键字
3. 清晰表示物理节点和部署关系
4. 简洁表达系统部署拓扑
5. 只输出纯 PlantUML 代码

示例输出格式：
@startuml
node "Web服务器" {
  artifact "应用程序"
}

node "数据库服务器" {
  database "数据库"
}

"应用程序" --> "数据库"
@enduml
  `;

  try {
    const { text } = await generateText(prompt, 'pro');
    let code = text.trim();
    code = code.replace(/^```(?:plantuml)?\s*/i, '');
    code = code.replace(/\s*```$/, '');
    if (!code.includes('@startuml')) {
      code = '@startuml\n' + code;
    }
    if (!code.includes('@enduml')) {
      code = code + '\n@enduml';
    }
    return code;
  } catch (error) {
    console.error('generatePlantUMLDeployment failed:', error);
    return '@startuml\nnode "示例节点"\n@enduml';
  }
};

/**
 * 统一的图表生成接口
 */
export const generateDiagram = async (request: DiagramRequest): Promise<DiagramResult> => {
  let code: string;
  let language: 'mermaid' | 'plantuml';

  switch (request.type) {
    case 'flowchart':
      code = await generateMermaidFlowchart(request.description, request.context);
      language = 'mermaid';
      break;

    case 'sequence':
      code = await generateMermaidSequence(request.description, request.context);
      language = 'mermaid';
      break;

    case 'architecture':
      code = await generateMermaidArchitecture(request.description, request.context);
      language = 'mermaid';
      break;

    case 'class':
      code = await generatePlantUMLClass(request.description, request.context);
      language = 'plantuml';
      break;

    case 'component':
      code = await generatePlantUMLComponent(request.description, request.context);
      language = 'plantuml';
      break;

    case 'deployment':
      code = await generatePlantUMLDeployment(request.description, request.context);
      language = 'plantuml';
      break;

    default:
      throw new Error(`Unsupported diagram type: ${request.type}`);
  }

  // 生成渲染 URL（可选，用于在线渲染）
  let renderUrl: string | undefined;
  if (language === 'plantuml') {
    // PlantUML 在线渲染服务（需要 encode）
    // renderUrl = `http://www.plantuml.com/plantuml/svg/${encodePlantUML(code)}`;
  }

  return {
    code,
    type: request.type,
    language,
    renderUrl,
  };
};

/**
 * 获取图表类型的中文名称
 */
export const getDiagramTypeName = (type: DiagramType): string => {
  const nameMap: Record<DiagramType, string> = {
    flowchart: '流程图',
    sequence: '时序图',
    architecture: '架构图',
    class: '类图',
    component: '组件图',
    deployment: '部署图',
  };
  return nameMap[type];
};

/**
 * 获取图表类型的描述
 */
export const getDiagramTypeDescription = (type: DiagramType): string => {
  const descMap: Record<DiagramType, string> = {
    flowchart: '展示流程步骤、决策分支和执行顺序',
    sequence: '展示对象或组件之间的消息交互顺序',
    architecture: '展示系统模块、层次结构和数据流向',
    class: '展示类的属性、方法和继承关系',
    component: '展示软件组件及其依赖关系',
    deployment: '展示系统部署的物理节点和拓扑结构',
  };
  return descMap[type];
};
