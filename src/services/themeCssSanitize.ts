/**
 * 主题 CSS 清洗（ISS-191）。
 *
 * 堵真实 CSS 攻击面，保留用户可表达的全部视觉自由度：
 * - 剥离 @import（禁止外部样式表引入）。
 * - 剥离 url() / @font-face src 中的 javascript: / vbscript: / data:text/html 等危险协议；
 *   保留 http(s): / data:image（图片内联合法）。
 * - 剥离历史 IE 漏洞向量：expression( / -moz-binding / behavior:（现代浏览器已禁用，
 *   保险起见仍清洗）。
 * - 选择器不限（只影响用户自己的 DOM）。
 *
 * 返回清洗后的 CSS、被剥离项摘要（供 UI 回显「已移除 N 处不安全内容」），
 * 以及检测到的外部网络请求域名（http/https url 不剥离——CSS 属性选择器 +
 * background:url 可作为数据外泄通道——但需告知用户，由其决定是否信任）。
 */

export interface ThemeCssSanitizeResult {
  css: string;
  stripped: string[];
  /** 检测到的外部 http/https 域名（去重）。不剥离，仅警示。 */
  externalDomains: string[];
}

const DANGEROUS_URL_PROTOCOLS = ['javascript', 'vbscript', 'data:text/html', 'data:application'];

/**
 * 匹配 url( ... ) 内部协议。允许 http(s): / data:image；其余协议视为危险。
 * 用非贪婪匹配括号内单条 url，避免误剥多条。括号可有可选引号包裹。
 */
const URL_PROTOCOL_RE = /url\(\s*([\s\S]*?)\s*\)/gi;

const DANGEROUS_PROTOCOL_HEAD_RE = new RegExp(
  `\\b(?:${DANGEROUS_URL_PROTOCOLS.join('|')})\\s*:`,
  'i',
);

/** @import 后跟任意 url(...) 或 "url" 字符串，统一剥除整条 @import（含可选 media query 后缀）。 */
const IMPORT_AT_RULE_RE = /@import\s+(?:url\(\s*[\s\S]*?\s*\)|"[^"]+"|'[^']+')\s*(?:[^;]*)?\s*;?/gi;

const EXPRESSION_RE = /expression\s*\(/gi;
const MOZ_BINDING_RE = /-moz-binding\s*:/gi;
const BEHAVIOR_RE = /behavior\s*:/gi;

const FONT_FACE_SRC_RE = /(@font-face\s*\{[\s\S]*?\})/gi;

/**
 * 从 url/http(s) payload 提取域名（供外部网络请求警示去重展示）。
 * 无法解析出域名的（相对路径/锚点）返回 null。
 */
function extractDomain(payload: string): string | null {
  const match = payload.match(/^https?:\/\/([^/]+)/i);
  return match ? match[1] : null;
}

function describeUrlStrip(match: string, payload: string): string {
  const snippet = payload.length > 40 ? `${payload.slice(0, 40)}…` : payload;
  return `${match} → url(${snippet})`;
}

export function sanitizeThemeCss(raw: string): ThemeCssSanitizeResult {
  const stripped: string[] = [];
  const externalDomains = new Set<string>();

  if (typeof raw !== 'string' || raw.length === 0) {
    return { css: '', stripped, externalDomains: [] };
  }

  let css = raw;

  // 1) @import：整条规则移除。
  const importMatches = css.match(IMPORT_AT_RULE_RE);
  if (importMatches) {
    for (const match of importMatches) {
      stripped.push(`@import: ${match.length > 60 ? `${match.slice(0, 60)}…` : match}`);
    }
    css = css.replace(IMPORT_AT_RULE_RE, '');
  }

  // 2) @font-face src 中的危险协议：先于 url() 整体移除整条 @font-face，
  //    避免 url() 替换留下残破声明（如 `src: ; }`）。
  css = css.replace(FONT_FACE_SRC_RE, (block) => {
    const urls = block.match(URL_PROTOCOL_RE) ?? [];
    for (const urlFull of urls) {
      const payload = urlFull.replace(/^url\(\s*|\s*\)$/g, '').trim().replace(/^['"]|['"]$/g, '');
      const lower = payload.toLowerCase();
      if (
        lower.startsWith('http://')
        || lower.startsWith('https://')
      ) {
        const domain = extractDomain(payload);
        if (domain) externalDomains.add(domain);
        continue;
      }
      if (
        lower.startsWith('/')
        || lower.startsWith('./')
        || lower.startsWith('../')
        || lower.startsWith('#')
        || lower.startsWith('data:image/')
      ) {
        continue;
      }
      if (lower.startsWith('data:') || DANGEROUS_PROTOCOL_HEAD_RE.test(lower)) {
        stripped.push(`@font-face src: ${payload.length > 40 ? `${payload.slice(0, 40)}…` : payload}`);
        return '';
      }
    }
    return block;
  });

  // 3) url() 中的危险协议：逐条剥除；放行的 http/https 记录外部域名供警示。
  css = css.replace(URL_PROTOCOL_RE, (full, payload: string) => {
    const trimmed = payload.trim().replace(/^['"]|['"]$/g, '');
    const lower = trimmed.toLowerCase();
    if (
      lower.startsWith('http://')
      || lower.startsWith('https://')
    ) {
      const domain = extractDomain(trimmed);
      if (domain) externalDomains.add(domain);
      return full;
    }
    if (
      lower.startsWith('/')
      || lower.startsWith('./')
      || lower.startsWith('../')
      || lower.startsWith('#')
      || lower.startsWith('data:image/')
    ) {
      return full;
    }
    // data: 协议只允许 image/*；其它 data:*（text/html、application、svg 等非 image）一律危险。
    if (lower.startsWith('data:') && !lower.startsWith('data:image/')) {
      stripped.push(describeUrlStrip('url()', trimmed));
      return '';
    }
    if (DANGEROUS_PROTOCOL_HEAD_RE.test(lower)) {
      stripped.push(describeUrlStrip('url()', trimmed));
      return '';
    }
    return full;
  });

  // 4) 历史漏洞向量：expression / -moz-binding / behavior:。
  // 替换文本刻意不带原词，避免残留子串触发后续扫描或被攻击者识别。
  const exprMatches = css.match(EXPRESSION_RE);
  if (exprMatches) {
    stripped.push(`expression(): ${exprMatches.length} 处`);
    css = css.replace(EXPRESSION_RE, 'legacy-css-eval-blocked(');
  }
  const bindingMatches = css.match(MOZ_BINDING_RE);
  if (bindingMatches) {
    stripped.push(`-moz-binding: ${bindingMatches.length} 处`);
    css = css.replace(MOZ_BINDING_RE, 'legacy-xbl-blocked :');
  }
  const behaviorMatches = css.match(BEHAVIOR_RE);
  if (behaviorMatches) {
    stripped.push(`behavior: ${behaviorMatches.length} 处`);
    css = css.replace(BEHAVIOR_RE, 'legacy-ie-behavior-blocked :');
  }

  // 5) 深度防御：转义可能提前闭合 <style> / 注入 <script> 的字面序列。
  //    当前 <style data-folia-theme> 用 React textContent 渲染（不触发 HTML 解析），
  //    但防止将来误改成 dangerouslySetInnerHTML 或引入 SSR。
  css = css.replace(/<\/(style|script)/gi, '<\\/$1');

  return { css, stripped, externalDomains: [...externalDomains] };
}