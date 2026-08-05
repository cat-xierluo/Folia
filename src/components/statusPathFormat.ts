/** ISS-90：超过该长度的路径折叠中段显示，避免长路径撑满状态栏。 */
const PATH_DISPLAY_MAX_LENGTH = 48;
/** 中段折叠时保留的尾部片段数（文件名 + 其上一层目录）。 */
const PATH_TAIL_SEGMENTS = 2;
/** 中段折叠时保留的头部片段数（如 `/Users/maoking`：根目录 + 用户名）。 */
const PATH_HEAD_SEGMENTS = 2;
const PATH_ELLIPSIS = '…';

/** 尾部省略：保留 path 前 (maxLength - 省略号宽) 个字符 + …。Math.max 防 maxLength 过小的边界。 */
function truncateTail(path: string, maxLength: number): string {
  return `${path.slice(0, Math.max(0, maxLength - PATH_ELLIPSIS.length))}${PATH_ELLIPSIS}`;
}

/**
 * ISS-90：把过长的绝对路径折叠成 `/Users/maoking/…/notes/2026-08-04.md` 形式。
 * 路径首尾识别价值最高（根目录 / 用户名 + 文件名），因此折叠中段而非尾部。
 * 纯函数，仅用于显示；复制与 title 始终使用完整路径。
 */
export function formatDisplayPath(path: string, maxLength = PATH_DISPLAY_MAX_LENGTH): string {
  if (path.length <= maxLength) return path;

  const separator = path.includes('/') ? '/' : '\\';
  const segments = path.split(separator);
  // 绝对路径以分隔符开头时 segments[0] 为空串，保留它才能还原前导 `/`。
  const headCount = segments[0] === '' ? PATH_HEAD_SEGMENTS + 1 : PATH_HEAD_SEGMENTS;
  // 头尾片段之间至少要有一段可折叠，否则没有中段可省，退化为尾部省略。
  if (segments.length <= headCount + PATH_TAIL_SEGMENTS) {
    return truncateTail(path, maxLength);
  }

  const tail = segments.slice(-PATH_TAIL_SEGMENTS).join(separator);
  const head = segments.slice(0, headCount).join(separator);
  const folded = `${head}${separator}${PATH_ELLIPSIS}${separator}${tail}`;
  // 折叠后仍超长（例如文件名本身极长）时，退化为尾部省略保证不撑破布局。
  return folded.length <= maxLength ? folded : truncateTail(path, maxLength);
}
