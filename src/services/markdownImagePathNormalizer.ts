/**
 * Markdown 图片目标地址空格归一化（ISS-194）。
 *
 * 背景：听悟等转录 / 导出工具生成的 Markdown 常写出
 * `![PPT 幻灯片 1](./xxx Agent + Skill：…_slides/slide_001.webp)` 这种
 * **图片目标地址内含未转义空格**的语法。CommonMark 规范规定：非 `<>` 包裹
 * 的行内图片目标地址不允许出现空格（遇到空格目标即结束、后面的内容无法
 * 构成合法 title，整个构造解析失败）。Vditor 的 Lute 引擎严格遵循规范，
 * 这类「图片」整段按普通文本输出、不产生 `<img>` 节点，后续
 * localImageResolver（相对路径 → Tauri asset URL）没有目标可处理，
 * 用户看到的就是「插图不渲染、显示成一段原始语法文本」。
 *
 * 策略（DEC-140）：在装载层（fileService.openPath 的 markdown 分支）对全文
 * 做一次纯文本归一化——把图片目标地址里的**未转义**空格 / Tab 百分号编码
 * 为 `%20` / `%09`。选 `%20` 而不是 `<…>` 包裹的原因：
 * 1. 与 Lute 自身的序列化行为一致（`![a](<./x y.png>)` 经 Lute 输出 src 时
 *    空格同样编码为 %20），编辑器 IR 往返（getValue）不会产生二次 diff；
 * 2. `%20` 是 CommonMark 合法目标形式，在 GitHub / VS Code / cmark 等任何
 *    严格解析器下都可解析，URL 解码后与原路径语义完全一致——相对原文是
 *    strictly better 的改写。
 *
 * 保守边界（宁可漏改、不可误改）：
 * - 围栏代码块（``` / ~~~）内不处理；行内代码 span（`…`）内不处理；
 * - 目标已 `<>` 包裹、空白已全部 `\` 转义、或不含未转义空白 → 原样保留；
 * - 只处理图片 `![…](…)`，不碰普通链接 `[…](…)`（缺陷范围最小变更）；
 * - `\![…](…)`（转义感叹号，字面文本）不处理；
 * - 幂等：已归一化文本再次输入无变化（%20 串内没有可命中的空格）。
 *
 * 落盘语义：归一化只发生在读盘装载层，content 与 lastSavedContent 同步取
 * 归一化结果（不误标 dirty）。用户不编辑则磁盘文件永不重写；一旦编辑保存，
 * 落盘的是等价但严格合法的 Markdown（空格 → %20）。
 */

/** 匹配 `![alt](` 开头；alt 允许 `\]` 等转义，不允许嵌套未转义 `]`。 */
const IMAGE_OPENER_PATTERN = /!\[(?:[^\]\\]|\\.)*\]\(/g;

/** 行内代码 span：同长度反引号串配对（CommonMark 近似），span 内不做任何改写。 */
const INLINE_CODE_PATTERN = /(`+)(?:(?!\1)[^\n])*?\1/g;

/** 围栏代码块开始行：行首 ≤3 空格 + 3 个以上 ` 或 ~。 */
const FENCE_OPEN_PATTERN = /^ {0,3}(`{3,}|~{3,})/;

/** 围栏代码块结束行：同字符、长度 ≥ 开栏串、行尾仅余空白。 */
const FENCE_CLOSE_PATTERN = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

/**
 * 行内图片目标里尾随的可选 title（"…" / '…' / (…)），与目标之间至少一个
 * 空白。lazy `.*?` 保证 title 取最短合法后缀（`./x y "a b"` 的目标是
 * `./x y` 而不是 `./x`）。title 内允许反斜杠转义。
 */
const TRAILING_TITLE_PATTERN = /^(.*?)(\s+)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\((?:[^)\\]|\\.)*\))$/;

/**
 * 从 `![alt](` 之后、配对 `)` 之前的内容里拆出「目标 + 可选 title」。
 * 内容两侧的空白会被丢弃（原本就是非法语法的一部分，重组时统一为
 * `(dest)` 或 `(dest title)` 规范形式）。
 */
function splitDestinationAndTitle(inner: string): { destination: string; title: string | null } {
  const trimmed = inner.trim();
  const titled = TRAILING_TITLE_PATTERN.exec(trimmed);
  if (titled && titled[1].length > 0) {
    return { destination: titled[1], title: titled[3] };
  }
  return { destination: trimmed, title: null };
}

/** 目标地址里是否存在**未转义**的空格 / Tab（`\ ` 是合法转义，不算）。 */
function hasUnescapedWhitespace(destination: string): boolean {
  let escaped = false;
  for (const ch of destination) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === ' ' || ch === '\t') return true;
  }
  return false;
}

/** 把目标地址里未转义的空格 / Tab 编码为 %20 / %09；`\x` 转义对原样保留。 */
function encodeUnescapedWhitespace(destination: string): string {
  let out = '';
  let i = 0;
  while (i < destination.length) {
    const ch = destination.charAt(i);
    if (ch === '\\' && i + 1 < destination.length) {
      out += ch + destination.charAt(i + 1);
      i += 2;
      continue;
    }
    if (ch === ' ') {
      out += '%20';
      i += 1;
      continue;
    }
    if (ch === '\t') {
      out += '%09';
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** 该目标是否需要归一化：空目标 / `<>` 包裹 / 无未转义空白的一律不动。 */
function shouldNormalizeDestination(destination: string): boolean {
  if (!destination) return false;
  if (destination.startsWith('<')) return false;
  return hasUnescapedWhitespace(destination);
}

/**
 * 归一化单行文本（不含换行）里的所有行内图片目标。跨行未闭合的 `![alt](…`
 * 保持原样（CommonMark 行内构造本就不跨行，交给 Lute 按普通文本处理）。
 */
function normalizeImageDestinationsInLine(line: string): string {
  if (!line.includes('![')) return line;

  let out = '';
  let cursor = 0;
  IMAGE_OPENER_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMAGE_OPENER_PATTERN.exec(line)) !== null) {
    // `\![` 是转义感叹号 + 普通链接，字面文本，不处理
    if (match.index > 0 && line.charAt(match.index - 1) === '\\') continue;

    const openParenIndex = match.index + match[0].length - 1;
    let depth = 1;
    let closeIndex = -1;
    for (let i = openParenIndex + 1; i < line.length; i += 1) {
      const ch = line.charAt(i);
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          closeIndex = i;
          break;
        }
      }
    }
    if (closeIndex < 0) continue; // 未闭合（可能跨行）→ 不动

    const { destination, title } = splitDestinationAndTitle(
      line.slice(openParenIndex + 1, closeIndex),
    );
    if (!shouldNormalizeDestination(destination)) continue;

    out += line.slice(cursor, openParenIndex + 1)
      + encodeUnescapedWhitespace(destination)
      + (title === null ? '' : ` ${title}`);
    cursor = closeIndex;
    IMAGE_OPENER_PATTERN.lastIndex = closeIndex + 1;
  }
  if (cursor === 0) return line;
  return out + line.slice(cursor);
}

/** 把一行按行内代码 span 切开，仅对 span 之外的部分做图片目标归一化。 */
function normalizeOutsideInlineCode(line: string): string {
  if (!line.includes('![')) return line;

  let out = '';
  let cursor = 0;
  INLINE_CODE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_CODE_PATTERN.exec(line)) !== null) {
    out += normalizeImageDestinationsInLine(line.slice(cursor, match.index)) + match[0];
    cursor = match.index + match[0].length;
  }
  return out + normalizeImageDestinationsInLine(line.slice(cursor));
}

/**
 * 归一化 Markdown 全文里图片目标地址中的未转义空格 / Tab（→ %20 / %09）。
 * 纯函数：不修改入参；围栏代码块与行内代码内容逐字节保留；不含
 * `![…](…)` 构造的文档原字符串返回（引用相等，热路径零分配）。
 * CRLF（\r\n）文档与 LF 文档同等处理，换行风格逐字节保留（不顺手改写）。
 */
export function normalizeMarkdownImagePaths(markdown: string): string {
  if (!markdown || !markdown.includes('](')) return markdown;

  const lines = markdown.split('\n');
  let fenceMarker: string | null = null;
  let changed = false;
  const out: string[] = [];

  for (const line of lines) {
    // CRLF（\r\n）文档：split('\n') 后行尾残留 \r。围栏闭合模式以 $ 收尾、
    // 不吞 \r，残留会让 CRLF 文档的围栏永不闭合、其后所有行被当作代码块
    // 跳过（PR #131 review M-1）。剥离 \r 参与判定，输出时原样回接——
    // 换行风格逐字节保留，CRLF 文件不会被顺手改写成 LF。
    const crlfSuffix = line.endsWith('\r') ? '\r' : '';
    const content = crlfSuffix ? line.slice(0, -1) : line;

    if (fenceMarker !== null) {
      out.push(line);
      const closing = FENCE_CLOSE_PATTERN.exec(content);
      if (closing && closing[1].charAt(0) === fenceMarker.charAt(0) && closing[1].length >= fenceMarker.length) {
        fenceMarker = null;
      }
      continue;
    }

    const opening = FENCE_OPEN_PATTERN.exec(content);
    if (opening) {
      // 开栏行本身（含 info string）不改写——info string 里出现 `![](` 也是
      // 代码语义的一部分（如 markdown 教学文档的示例围栏）。
      fenceMarker = opening[1];
      out.push(line);
      continue;
    }

    const normalized = normalizeOutsideInlineCode(content);
    changed = changed || normalized !== content;
    out.push(normalized + crlfSuffix);
  }

  return changed ? out.join('\n') : markdown;
}
