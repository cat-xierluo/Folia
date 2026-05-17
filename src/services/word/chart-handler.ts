import {
  Paragraph,
  TextRun,
} from 'docx';
import type { PresetConfig } from './types';

/**
 * 从 Mermaid 源码创建 Word 段落（文本回退方案）
 *
 * 根据 Mermaid 图表类型调用对应解析器，
 * 无法识别时回退为纯代码块。
 */
export function createMermaidFallback(
  code: string,
  config: PresetConfig,
): Paragraph[] {
  const trimmed = code.trim();
  const firstLine = trimmed.split('\n')[0].trim();

  if (/^(graph|flowchart)\b/.test(firstLine)) {
    return parseFlowchart(trimmed, config);
  }
  if (/^sequenceDiagram\b/.test(firstLine)) {
    return parseSequence(trimmed, config);
  }
  if (/^pie\b/.test(firstLine)) {
    return parsePie(trimmed, config);
  }
  if (/^gantt\b/.test(firstLine)) {
    return parseGantt(trimmed, config);
  }

  return createCodeFallback(trimmed, 'mermaid', config);
}

/**
 * 解析简单流程图，提取节点连接关系。
 *
 * 匹配 "ID[文本] -->" 或 "ID[文本] ---" 等模式，
 * 输出 "NodeA -> NodeB -> NodeC" 形式。
 */
export function parseFlowchart(
  code: string,
  config: PresetConfig,
): Paragraph[] {
  const lines = code.split('\n').map((l) => l.trim());
  const nodes = new Map<string, string>();
  const edges: Array<{ from: string; to: string }> = [];

  // 匹配节点定义和边
  const nodePattern =
    /([A-Za-z0-9_]+)\[([^\]]*)\]/;
  const edgePattern =
    /([A-Za-z0-9_]+)\s*---?>*-?\s*([A-Za-z0-9_]+)/;

  for (const line of lines) {
    // 提取节点标签
    let m = line.match(nodePattern);
    if (m) {
      const id = m[1];
      const label = m[2].trim();
      if (!nodes.has(id)) nodes.set(id, label || id);
    }

    // 提取边
    m = line.match(edgePattern);
    if (m) {
      edges.push({ from: m[1], to: m[2] });
    }
  }

  const { content_font, left_indent, line_spacing } = config.code_block;

  const paragraphs: Paragraph[] = [
    new Paragraph({
      spacing: { after: line_spacing * 20 },
      indent: { left: left_indent },
      children: [
        new TextRun({
          text: '[流程图]',
          font: { eastAsia: content_font.name, ascii: content_font.ascii },
          size: content_font.size * 2,
          bold: true,
          color: content_font.color,
        }),
      ],
    }),
  ];

  if (edges.length > 0) {
    // 沿着边构建链式输出
    const chain = new Map<string, string[]>();
    for (const e of edges) {
      if (!chain.has(e.from)) chain.set(e.from, []);
      chain.get(e.from)!.push(e.to);
    }

    // 找到起始节点（不作为任何边的目标）
    const targets = new Set(edges.map((e) => e.to));
    const starts = edges
      .map((e) => e.from)
      .filter((id) => !targets.has(id));
    const uniqueStarts = [...new Set(starts)];

    const visited = new Set<string>();

    for (const start of uniqueStarts) {
      const path: string[] = [];
      let current: string | undefined = start;

      while (current && !visited.has(current)) {
        visited.add(current);
        path.push(nodes.get(current) || current);
        const next = chain.get(current);
        current = next?.[0];
      }

      if (path.length > 0) {
        paragraphs.push(
          new Paragraph({
            spacing: { after: line_spacing * 20 },
            indent: { left: left_indent },
            children: [
              new TextRun({
                text: path.join(' → '),
                font: { eastAsia: content_font.name, ascii: content_font.ascii },
                size: content_font.size * 2,
                color: content_font.color,
              }),
            ],
          }),
        );
      }
    }
  } else if (nodes.size > 0) {
    // 只有节点没有边
    const labelList = [...nodes.values()].join(' → ');
    paragraphs.push(
      new Paragraph({
        spacing: { after: line_spacing * 20 },
        indent: { left: left_indent },
        children: [
          new TextRun({
            text: labelList,
            font: { eastAsia: content_font.name, ascii: content_font.ascii },
            size: content_font.size * 2,
            color: content_font.color,
          }),
        ],
      }),
    );
  }

  return paragraphs;
}

/**
 * 解析时序图，提取参与者与消息。
 *
 * 匹配 "participant X as Y" 和 "X->>Y: message"，
 * 输出 "X → Y: message" 形式。
 */
export function parseSequence(
  code: string,
  config: PresetConfig,
): Paragraph[] {
  const lines = code.split('\n').map((l) => l.trim());
  const participants = new Map<string, string>();
  const messages: Array<{ from: string; to: string; text: string }> = [];

  const participantPattern =
    /^participant\s+(\S+)(?:\s+as\s+(.+))?$/;
  const messagePattern =
    /^(\S+)\s*->>+(\S+)\s*:\s*(.+)$/;

  for (const line of lines) {
    let m = line.match(participantPattern);
    if (m) {
      const id = m[1];
      const alias = m[2]?.trim() || id;
      participants.set(id, alias);
      continue;
    }

    m = line.match(messagePattern);
    if (m) {
      messages.push({
        from: m[1],
        to: m[2],
        text: m[3].trim(),
      });
    }
  }

  const { content_font, left_indent, line_spacing } = config.code_block;

  const paragraphs: Paragraph[] = [
    new Paragraph({
      spacing: { after: line_spacing * 20 },
      indent: { left: left_indent },
      children: [
        new TextRun({
          text: '[时序图]',
          font: { eastAsia: content_font.name, ascii: content_font.ascii },
          size: content_font.size * 2,
          bold: true,
          color: content_font.color,
        }),
      ],
    }),
  ];

  // 参与者列表
  if (participants.size > 0) {
    const names = [...participants.values()].join(', ');
    paragraphs.push(
      new Paragraph({
        spacing: { after: line_spacing * 20 },
        indent: { left: left_indent },
        children: [
          new TextRun({
            text: `参与者: ${names}`,
            font: { eastAsia: content_font.name, ascii: content_font.ascii },
            size: content_font.size * 2,
            color: content_font.color,
          }),
        ],
      }),
    );
  }

  // 消息列表
  const resolve = (id: string) => participants.get(id) || id;
  for (const msg of messages) {
    paragraphs.push(
      new Paragraph({
        spacing: { after: line_spacing * 20 },
        indent: { left: left_indent },
        children: [
          new TextRun({
            text: `${resolve(msg.from)} → ${resolve(msg.to)}: ${msg.text}`,
            font: { eastAsia: content_font.name, ascii: content_font.ascii },
            size: content_font.size * 2,
            color: content_font.color,
          }),
        ],
      }),
    );
  }

  return paragraphs;
}

/**
 * 解析饼图，提取标签和数值。
 *
 * 匹配 "Label" : value 行，
 * 输出 "  Label: value" 形式。
 */
export function parsePie(
  code: string,
  config: PresetConfig,
): Paragraph[] {
  const lines = code.split('\n').map((l) => l.trim());
  const items: Array<{ label: string; value: string }> = [];

  const piePattern = /^"([^"]+)"\s*:\s*(\d+\.?\d*)\s*$/;

  let title = '饼图';
  const titlePattern = /^title\s+(.+)$/;

  for (const line of lines) {
    const tm = line.match(titlePattern);
    if (tm) {
      title = tm[1].trim();
      continue;
    }

    const m = line.match(piePattern);
    if (m) {
      items.push({ label: m[1], value: m[2] });
    }
  }

  const { content_font, left_indent, line_spacing } = config.code_block;

  const paragraphs: Paragraph[] = [
    new Paragraph({
      spacing: { after: line_spacing * 20 },
      indent: { left: left_indent },
      children: [
        new TextRun({
          text: `[${title}]`,
          font: { eastAsia: content_font.name, ascii: content_font.ascii },
          size: content_font.size * 2,
          bold: true,
          color: content_font.color,
        }),
      ],
    }),
  ];

  for (const item of items) {
    paragraphs.push(
      new Paragraph({
        spacing: { after: line_spacing * 20 },
        indent: { left: left_indent },
        children: [
          new TextRun({
            text: `• ${item.label}: ${item.value}`,
            font: { eastAsia: content_font.name, ascii: content_font.ascii },
            size: content_font.size * 2,
            color: content_font.color,
          }),
        ],
      }),
    );
  }

  return paragraphs;
}

/**
 * 解析甘特图，提取任务名称和时间范围。
 *
 * 匹配 "taskName : a1, 2024-01-01, 30d" 行，
 * 输出 "  taskName (2024-01-01, 30d)" 形式。
 */
export function parseGantt(
  code: string,
  config: PresetConfig,
): Paragraph[] {
  const lines = code.split('\n').map((l) => l.trim());
  const tasks: Array<{ name: string; detail: string }> = [];

  // 匹配 "taskName : alias, startDate, duration" 或 "taskName : startDate, duration"
  const taskPattern =
    /^\s*(.+?)\s*:\s*(?:\w+\s*,\s*)?(\d{4}-\d{2}-\d{2})\s*,\s*(.+)$/;

  // 也匹配 "taskName : alias, after other, duration" 等变体
  const simpleTaskPattern =
    /^\s*(.+?)\s*:\s*(.+)$/;

  for (const line of lines) {
    if (line.startsWith('title ') || line.startsWith('dateFormat') ||
        line.startsWith('axisFormat') || line.startsWith('section')) {
      continue;
    }

    const m = line.match(taskPattern);
    if (m) {
      tasks.push({
        name: m[1].trim(),
        detail: `${m[2]}, ${m[3].trim()}`,
      });
      continue;
    }

    // 回退：尝试匹配简单格式 "taskName : something"
    if (/^\s*[^%\n]+\s*:\s*.+$/.test(line) && !/^(title|dateFormat|axisFormat|section)\b/.test(line)) {
      const sm = line.match(simpleTaskPattern);
      if (sm) {
        tasks.push({
          name: sm[1].trim(),
          detail: sm[2].trim(),
        });
      }
    }
  }

  const { content_font, left_indent, line_spacing } = config.code_block;

  const paragraphs: Paragraph[] = [
    new Paragraph({
      spacing: { after: line_spacing * 20 },
      indent: { left: left_indent },
      children: [
        new TextRun({
          text: '[甘特图]',
          font: { eastAsia: content_font.name, ascii: content_font.ascii },
          size: content_font.size * 2,
          bold: true,
          color: content_font.color,
        }),
      ],
    }),
  ];

  for (const task of tasks) {
    paragraphs.push(
      new Paragraph({
        spacing: { after: line_spacing * 20 },
        indent: { left: left_indent },
        children: [
          new TextRun({
            text: `• ${task.name} (${task.detail})`,
            font: { eastAsia: content_font.name, ascii: content_font.ascii },
            size: content_font.size * 2,
            color: content_font.color,
          }),
        ],
      }),
    );
  }

  return paragraphs;
}

/**
 * 通用代码块回退。
 *
 * 将代码按行输出为等宽字体的 Word 段落。
 */
export function createCodeFallback(
  code: string,
  language: string,
  config: PresetConfig,
): Paragraph[] {
  const { content_font, left_indent, line_spacing } = config.code_block;
  const lines = code.split('\n');

  const paragraphs: Paragraph[] = [];

  // 语言标签
  if (language) {
    paragraphs.push(
      new Paragraph({
        spacing: { after: 0 },
        indent: { left: left_indent },
        children: [
          new TextRun({
            text: language,
            font: {
              eastAsia: config.code_block.label_font.name,
              ascii: config.code_block.label_font.ascii,
            },
            size: config.code_block.label_font.size * 2,
            color: config.code_block.label_font.color,
          }),
        ],
      }),
    );
  }

  for (const line of lines) {
    paragraphs.push(
      new Paragraph({
        spacing: { after: line_spacing * 20 },
        indent: { left: left_indent },
        children: [
          new TextRun({
            text: line || ' ',
            font: { eastAsia: content_font.name, ascii: content_font.ascii },
            size: content_font.size * 2,
            color: content_font.color,
          }),
        ],
      }),
    );
  }

  return paragraphs;
}
