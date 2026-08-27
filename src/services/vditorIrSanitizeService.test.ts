// @vitest-environment jsdom
import 'vditor/dist/js/lute/lute.min.js';
import { describe, expect, it } from 'vitest';
import {
  FOLIA_IR_HTML_ALIGN_CENTER_CLASS,
  FOLIA_IR_HTML_ALIGN_RIGHT_CLASS,
  FOLIA_IR_HTML_WRAPPER_HIDDEN_CLASS,
  FOLIA_IR_SVG_FRAGMENT_CLASS,
  FOLIA_IR_SVG_ROOT_CLASS,
  repairSvgIrPreviewsFromMarkdown,
  repairSplitSvgIrPreviews,
  repairSplitWrapperHtmlIrPreviews,
  sanitizeVditorIrHtml,
} from './vditorIrSanitizeService';

type LuteInstance = {
  SetSanitize: (enable: boolean) => void;
  SetVditorIR: (enable: boolean) => void;
  Md2VditorIRDOM: (markdown: string) => string;
  VditorIRDOM2Md: (html: string) => string;
};

const Lute = (globalThis as unknown as { Lute: { New: () => LuteInstance } }).Lute;

function createIrHtml(markdown: string): { lute: LuteInstance; html: string } {
  const lute = Lute.New();
  // 模拟 Folia 为了保留 SVG 预览而允许 HTML 透传的 IR 场景。
  lute.SetSanitize(false);
  lute.SetVditorIR(true);
  return { lute, html: lute.Md2VditorIRDOM(markdown) };
}

describe('sanitizeVditorIrHtml', () => {
  it('同步清理 html-block marker，避免 VditorIRDOM2Md 保存时还原危险源码', () => {
    const { lute, html } = createIrHtml([
      '<div>',
      '<img src="x" onerror="alert(1)">',
      '<script>alert(2)</script>',
      '<svg onload="alert(3)" viewBox="0 0 10 10"><rect onclick="alert(4)" width="10"/></svg>',
      '</div>',
    ].join(''));

    const result = sanitizeVditorIrHtml(html);
    const markdown = lute.VditorIRDOM2Md(result.html);

    expect(result.changed).toBe(true);
    expect(markdown).toContain('<svg');
    expect(markdown).toContain('<rect');
    expect(markdown).not.toContain('<script');
    expect(markdown).not.toContain('onerror');
    expect(markdown).not.toContain('onload');
    expect(markdown).not.toContain('onclick');
    expect(markdown).not.toContain('alert(');
  });

  it('保留 Vditor IR 内部标记，避免破坏后续 round-trip', () => {
    const { html } = createIrHtml('<div><svg viewBox="0 0 10 10"><rect width="10"/></svg></div>');

    const result = sanitizeVditorIrHtml(html);

    expect(result.html).toContain('data-block="0"');
    expect(result.html).toContain('data-type="html-block"');
    expect(result.html).toContain('vditor-ir__preview');
    expect(result.html.toLowerCase()).toContain('<svg');
  });

  it('重组被 Lute 按空行拆开的多行 SVG 预览，同时保留 marker round-trip', () => {
    const markdown = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80">',
      '  <rect width="120" height="80" fill="#FFFFFF"/>',
      '',
      '  <!-- 标题 -->',
      '  <text x="60" y="24" font-size="14" fill="#111111" text-anchor="middle">标题</text>',
      '',
      '  <line x1="10" y1="48" x2="110" y2="48" stroke="#222222" stroke-width="2"/>',
      '</svg>',
    ].join('\n');
    const { lute, html } = createIrHtml(markdown);
    const sanitized = sanitizeVditorIrHtml(html);
    const root = document.createElement('div');
    root.innerHTML = sanitized.html;

    const htmlBlockNodes = root.querySelectorAll('.vditor-ir__node[data-type="html-block"]');
    expect(htmlBlockNodes.length).toBeGreaterThan(1);
    expect(root.querySelector('.vditor-ir__preview svg text')).toBeNull();

    const changed = repairSplitSvgIrPreviews(root);

    expect(changed).toBe(true);
    const repairedRoot = root.querySelector(`.${FOLIA_IR_SVG_ROOT_CLASS} .vditor-ir__preview`);
    expect(repairedRoot?.querySelector('svg text')?.textContent).toBe('标题');
    expect(repairedRoot?.querySelector('svg line')).not.toBeNull();
    expect(root.querySelectorAll(`.${FOLIA_IR_SVG_FRAGMENT_CLASS}`).length).toBeGreaterThan(0);

    const roundTrip = lute.VditorIRDOM2Md(root.innerHTML);
    expect(roundTrip).toContain('<svg');
    expect(roundTrip).toContain('<text');
    expect(roundTrip).toContain('标题');
    expect(roundTrip).toContain('</svg>');
  });

  it('清理被拆开的多行 SVG marker 中的危险属性，避免保存 round-trip 还原 onload/onclick', () => {
    const markdown = [
      '<svg onload="alert(1)" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80">',
      '  <rect width="120" height="80" fill="#FFFFFF"/>',
      '',
      '  <text onclick="alert(2)" x="60" y="24" font-size="14" fill="#111111" text-anchor="middle">标题</text>',
      '</svg>',
    ].join('\n');
    const { lute, html } = createIrHtml(markdown);
    const sanitized = sanitizeVditorIrHtml(html);
    const root = document.createElement('div');
    root.innerHTML = sanitized.html;

    repairSplitSvgIrPreviews(root);
    const roundTrip = lute.VditorIRDOM2Md(root.innerHTML);

    expect(roundTrip).toContain('<svg');
    expect(roundTrip).toContain('<text');
    expect(roundTrip).toContain('标题');
    expect(roundTrip).not.toContain('onload');
    expect(roundTrip).not.toContain('onclick');
    expect(roundTrip).not.toContain('alert(');
  });

  it('重组 SVG 时包含相邻 html-inline 片段且不会跨普通正文吞掉下一个 SVG', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<div data-block="0" data-type="html-block" class="vditor-ir__node">',
      '<pre class="vditor-ir__marker--pre vditor-ir__marker"><code data-type="html-block">&lt;svg viewBox="0 0 120 80" width="120" height="80"&gt;\n  &lt;rect width="120" height="80" fill="#FFFFFF"/&gt;</code></pre>',
      '<pre class="vditor-ir__preview" data-render="1"><svg viewBox="0 0 120 80"><rect width="120" height="80"></rect></svg></pre>',
      '</div>',
      '<div data-block="0" data-type="html-block" class="vditor-ir__node">',
      '<pre class="vditor-ir__marker--pre vditor-ir__marker"><code data-type="html-block">&lt;!-- 末尾片段 --&gt;</code></pre>',
      '<pre class="vditor-ir__preview" data-render="1"></pre>',
      '</div>',
      '<span data-type="html-inline" class="vditor-ir__node"><code class="vditor-ir__marker">&lt;path d="M 10 40 L 110 40" stroke="#222222"/&gt;</code></span>',
      '<span data-type="html-inline" class="vditor-ir__node"><code class="vditor-ir__marker">&lt;text x="60" y="60" font-size="14"&gt;回流&lt;/text&gt;</code></span>',
      '<span data-type="html-inline" class="vditor-ir__node"><code class="vditor-ir__marker">&lt;/svg&gt;</code></span>',
      '<div data-type="strong" class="vditor-ir__node"><span data-type="strong-marker">**</span>图注<span data-type="strong-marker">**</span></div>',
      '<div data-block="0" data-type="html-block" class="vditor-ir__node">',
      '<pre class="vditor-ir__marker--pre vditor-ir__marker"><code data-type="html-block">&lt;svg viewBox="0 0 50 50" width="50" height="50"&gt;\n  &lt;text x="25" y="25"&gt;第二图&lt;/text&gt;\n&lt;/svg&gt;</code></pre>',
      '<pre class="vditor-ir__preview" data-render="1"><svg viewBox="0 0 50 50"><text x="25" y="25">第二图</text></svg></pre>',
      '</div>',
    ].join('');

    const changed = repairSplitSvgIrPreviews(root);
    const repairedRoots = root.querySelectorAll(`.${FOLIA_IR_SVG_ROOT_CLASS}`);
    const firstSvg = repairedRoots[0]?.querySelector('svg');

    expect(changed).toBe(true);
    expect(repairedRoots).toHaveLength(1);
    expect(firstSvg?.querySelector('path')).not.toBeNull();
    expect(firstSvg?.querySelector('text')?.textContent).toBe('回流');
    expect(firstSvg?.textContent).not.toContain('第二图');
    expect(root.querySelectorAll(`.${FOLIA_IR_SVG_FRAGMENT_CLASS}`)).toHaveLength(4);
  });

  it('修复单个 html-block 中 marker 完整但 preview 只剩背景的 SVG', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<div data-block="0" data-type="html-block" class="vditor-ir__node">',
      '<pre class="vditor-ir__marker--pre vditor-ir__marker"><code data-type="html-block">',
      '&lt;svg viewBox="0 0 120 80" width="120" height="80"&gt;\n',
      '  &lt;rect width="120" height="80" fill="#FFFFFF"/&gt;\n',
      '  &lt;defs&gt;&lt;marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"&gt;&lt;path d="M0,0 L10,5 L0,10 z"/&gt;&lt;/marker&gt;&lt;/defs&gt;\n',
      '  &lt;line x1="10" y1="40" x2="110" y2="40" stroke="#222222" marker-end="url(#arr)"/&gt;\n',
      '  &lt;text x="60" y="62" font-size="14"&gt;完整内容&lt;/text&gt;\n',
      '&lt;/svg&gt;',
      '</code></pre>',
      '<pre class="vditor-ir__preview" data-render="1"><svg viewBox="0 0 120 80"><rect width="120" height="80"></rect></svg></pre>',
      '</div>',
    ].join('');

    const changed = repairSplitSvgIrPreviews(root);
    const repairedRoot = root.querySelector(`.${FOLIA_IR_SVG_ROOT_CLASS} .vditor-ir__preview`);
    const svg = repairedRoot?.querySelector('svg');

    expect(changed).toBe(true);
    expect(svg?.querySelector('text')?.textContent).toBe('完整内容');
    expect(svg?.querySelector('line')?.getAttribute('marker-end')).toBe('url(#arr)');
    expect(svg?.querySelector('marker')?.getAttribute('id')).toBe('arr');
    expect(root.querySelectorAll(`.${FOLIA_IR_SVG_FRAGMENT_CLASS}`)).toHaveLength(0);
  });

  it('从 Markdown 原文修复 Lute 已截断 marker 的 SVG 预览', () => {
    const markdown = [
      '<svg viewBox="0 0 120 80" width="120" height="80">',
      '  <rect width="120" height="80" fill="#FFFFFF"/>',
      '',
      '  <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>',
      '  <line x1="10" y1="40" x2="110" y2="40" stroke="#222222" marker-end="url(#arr)"/>',
      '  <text x="60" y="62" font-size="14">原文恢复</text>',
      '</svg>',
    ].join('\n');
    const root = document.createElement('div');
    root.innerHTML = [
      '<div data-block="0" data-type="html-block" class="vditor-ir__node">',
      '<pre class="vditor-ir__marker--pre vditor-ir__marker"><code data-type="html-block">',
      '&lt;svg viewBox="0 0 120 80" width="120" height="80"&gt;\n',
      '  &lt;rect width="120" height="80" fill="#FFFFFF"&gt;&lt;/rect&gt;&lt;/svg&gt;',
      '</code></pre>',
      '<pre class="vditor-ir__preview" data-render="1"><svg viewBox="0 0 120 80"><rect width="120" height="80"></rect></svg></pre>',
      '</div>',
    ].join('');

    const changed = repairSvgIrPreviewsFromMarkdown(root, markdown);
    const repairedRoot = root.querySelector(`.${FOLIA_IR_SVG_ROOT_CLASS} .vditor-ir__preview`);
    const svg = repairedRoot?.querySelector('svg');

    expect(changed).toBe(true);
    expect(svg?.querySelector('text')?.textContent).toBe('原文恢复');
    expect(svg?.querySelector('line')?.getAttribute('marker-end')).toBe('url(#arr)');
    expect(svg?.querySelector('marker')?.getAttribute('id')).toBe('arr');
  });

  it('从 Markdown 原文修复后隐藏被普通段落承载的 SVG 残留片段', () => {
    const markdown = [
      '<svg viewBox="0 0 120 80" width="120" height="80">',
      '  <rect width="120" height="80" fill="#FFFFFF"/>',
      '',
      '  <!-- 标题 -->',
      '  <text x="60" y="24" font-size="14">源标题</text>',
      '',
      '  <path d="M 10 40 L 110 40" stroke="#222222"/>',
      '',
      '  <text x="60" y="62" font-size="14">尾部</text>',
      '</svg>',
      '',
      '**图：源标题**',
    ].join('\n');
    const root = document.createElement('div');
    root.innerHTML = [
      '<div data-block="0" data-type="html-block" class="vditor-ir__node">',
      '<pre class="vditor-ir__marker--pre vditor-ir__marker"><code data-type="html-block">',
      '&lt;svg viewBox="0 0 120 80" width="120" height="80"&gt;\n',
      '  &lt;rect width="120" height="80" fill="#FFFFFF"/&gt;',
      '</code></pre>',
      '<pre class="vditor-ir__preview" data-render="1"><svg viewBox="0 0 120 80"><rect width="120" height="80"></rect></svg></pre>',
      '</div>',
      '<div data-block="0" data-type="html-block" class="vditor-ir__node">',
      '<pre class="vditor-ir__marker--pre vditor-ir__marker"><code data-type="html-block">&lt;!-- 标题 --&gt;</code></pre>',
      '<pre class="vditor-ir__preview" data-render="1"></pre>',
      '</div>',
      '<div data-block="0" data-type="html-block" class="vditor-ir__node">',
      '<pre class="vditor-ir__marker--pre vditor-ir__marker"><code data-type="html-block">&lt;text x="60" y="24" font-size="14"&gt;源标题&lt;/text&gt;</code></pre>',
      '<pre class="vditor-ir__preview" data-render="1"></pre>',
      '</div>',
      '<p><code class="vditor-ir__marker">&lt;path d="M 10 40 L 110 40" stroke="#222222"/&gt;</code></p>',
      '<div data-block="0" data-type="html-block" class="vditor-ir__node">',
      '<pre class="vditor-ir__marker--pre vditor-ir__marker"><code data-type="html-block">&lt;text x="60" y="62" font-size="14"&gt;尾部&lt;/text&gt;\n&lt;/svg&gt;</code></pre>',
      '<pre class="vditor-ir__preview" data-render="1"></pre>',
      '</div>',
      '<p>**图：源标题**</p>',
    ].join('');

    const changed = repairSvgIrPreviewsFromMarkdown(root, markdown);
    const repairedRoot = root.querySelector(`.${FOLIA_IR_SVG_ROOT_CLASS} .vditor-ir__preview`);
    const hiddenFragments = Array.from(root.querySelectorAll<HTMLElement>(`.${FOLIA_IR_SVG_FRAGMENT_CLASS}`));
    const caption = Array.from(root.querySelectorAll('p')).find((node) => node.textContent?.includes('图：源标题'));

    expect(changed).toBe(true);
    expect(repairedRoot?.querySelector('svg text')?.textContent).toContain('源标题');
    expect(repairedRoot?.querySelector('svg path')?.getAttribute('d')).toBe('M 10 40 L 110 40');
    expect(hiddenFragments).toHaveLength(4);
    expect(hiddenFragments.some((node) => node.tagName === 'P' && node.textContent?.includes('<path'))).toBe(true);
    expect(caption?.classList.contains(FOLIA_IR_SVG_FRAGMENT_CLASS)).toBe(false);
  });

  it('不会把安全的未闭合 SVG 起始 marker 补成截断完整 SVG', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<div data-block="0" data-type="html-block" class="vditor-ir__node">',
      '<pre class="vditor-ir__marker--pre vditor-ir__marker"><code data-type="html-block">',
      '&lt;svg viewBox="0 0 120 80" width="120" height="80"&gt;\n',
      '  &lt;rect width="120" height="80" fill="#FFFFFF"/&gt;',
      '</code></pre>',
      '<pre class="vditor-ir__preview" data-render="1"><svg viewBox="0 0 120 80"><rect width="120" height="80"></rect></svg></pre>',
      '</div>',
    ].join('');

    const result = sanitizeVditorIrHtml(root.innerHTML);
    const sanitizedRoot = document.createElement('div');
    sanitizedRoot.innerHTML = result.html;
    const marker = sanitizedRoot.querySelector<HTMLElement>('code[data-type="html-block"]');

    expect(result.sourceChanged).toBe(false);
    expect(marker?.textContent).toContain('<svg viewBox="0 0 120 80" width="120" height="80">');
    expect(marker?.textContent).toContain('<rect width="120" height="80" fill="#FFFFFF"/>');
    expect(marker?.textContent).not.toContain('</svg>');
  });

  it('不会把安全 SVG 子片段 marker 当普通 HTML 清洗后触发 sourceChanged', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<div data-block="0" data-type="html-block" class="vditor-ir__node">',
      '<pre class="vditor-ir__marker--pre vditor-ir__marker"><code data-type="html-block">',
      '&lt;text x="60" y="62" font-size="14" fill="#111111" text-anchor="middle"&gt;片段&lt;/text&gt;',
      '</code></pre>',
      '<pre class="vditor-ir__preview" data-render="1"></pre>',
      '</div>',
    ].join('');

    const result = sanitizeVditorIrHtml(root.innerHTML);
    const sanitizedRoot = document.createElement('div');
    sanitizedRoot.innerHTML = result.html;
    const marker = sanitizedRoot.querySelector<HTMLElement>('code[data-type="html-block"]');

    expect(result.sourceChanged).toBe(false);
    expect(marker?.textContent).toBe('<text x="60" y="62" font-size="14" fill="#111111" text-anchor="middle">片段</text>');
  });
});

// ISS-69：sanitizeVditorIrHtml 区分 changed（任何字节级差异，含序列化
// 规范化）/ sourceChanged（marker 源码被改写）/ securityChanged（确实
// 剥除了危险节点/属性/URI）。Folia 决定是否整体重写 IR DOM 走
// securityChanged 门控，避免 DOMPurify 序列化规范化摧毁 Selection 引发
// 「删除偶发未生效」。
describe('sanitizeVditorIrHtml ISS-69 securityChanged 语义', () => {
  it('C1: 纯文本段落不含任何危险内容，securityChanged === false', () => {
    const { html } = createIrHtml('# 标题\n\n这是一段纯正文文本。\n');
    const result = sanitizeVditorIrHtml(html);

    expect(result.securityChanged).toBe(false);
    expect(result.sourceChanged).toBe(false);
    expect(result.changed).toBe(false);
    expect(result.html).toBe(html);
  });

  it('C2: 含 <img onerror> 的 IR DOM，securityChanged === true', () => {
    const { html } = createIrHtml('<div><img src="x" onerror="alert(1)"></div>');
    const result = sanitizeVditorIrHtml(html);

    expect(result.securityChanged).toBe(true);
    expect(result.sourceChanged).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.html).not.toContain('onerror');
    expect(result.html).not.toContain('alert(');
  });

  it('C3: 含 marker 内嵌 <script> 危险源码，securityChanged === true', () => {
    // 模拟 marker 文本内已被 Lute 转义为 &lt;script&gt; 的危险源码
    const root = document.createElement('div');
    root.innerHTML = [
      '<div data-block="0" data-type="html-block" class="vditor-ir__node">',
      '<pre class="vditor-ir__marker--pre vditor-ir__marker"><code data-type="html-block">',
      '&lt;script&gt;alert(1)&lt;/script&gt;',
      '</code></pre>',
      '<pre class="vditor-ir__preview" data-render="2"></pre>',
      '</div>',
    ].join('');

    const result = sanitizeVditorIrHtml(root.innerHTML);
    const sanitizedRoot = document.createElement('div');
    sanitizedRoot.innerHTML = result.html;
    const marker = sanitizedRoot.querySelector<HTMLElement>('code[data-type="html-block"]');

    expect(result.securityChanged).toBe(true);
    expect(result.sourceChanged).toBe(true);
    expect(marker?.textContent).not.toContain('<script>');
    expect(marker?.textContent).not.toContain('alert(');
  });

  it('C4: 仅序列化规范化（无危险内容）的安全 SVG，securityChanged === false 且 changed 可能为 true', () => {
    // 构造一段属性顺序会被 DOMPurify 重排的安全 SVG，自身无危险属性
    // —— 这是关键回归：必须验证「changed 但 securityChanged false」，
    // 旧实现会把这种序列化差异误判为「需要整体重写 IR DOM」。
    const root = document.createElement('div');
    root.innerHTML = [
      '<div data-block="0" data-type="html-block" class="vditor-ir__node">',
      '<pre class="vditor-ir__marker--pre vditor-ir__marker"><code data-type="html-block">',
      '&lt;svg viewBox="0 0 10 10" width="10" height="10"&gt;&lt;rect width="10" height="10"/&gt;&lt;/svg&gt;',
      '</code></pre>',
      '<pre class="vditor-ir__preview" data-render="1">',
      '<svg viewBox="0 0 10 10" width="10" height="10"><rect width="10" height="10"></rect></svg>',
      '</pre>',
      '</div>',
    ].join('');

    const result = sanitizeVditorIrHtml(root.innerHTML);

    expect(result.securityChanged).toBe(false);
    expect(result.sourceChanged).toBe(false);
    // 至少确认 returned html 含 svg（保留预览），不含任何危险内容
    expect(result.html).toContain('<svg');
    expect(result.html).toContain('<rect');
    expect(result.html).not.toContain('<script');
    expect(result.html).not.toContain('onerror');
  });

  // ISS-69 安全缺口回归（C7/C8）：旧实现用「危险特征黑名单」计数判定
  // securityChanged，srcset / poster 不在黑名单属性名里，DOMPurify 虽已
  // 剥除危险值，计数不变会被误判为 false（fail-open，安全结果不写回 IR
  // DOM）。结构化 DOM 差异对比通过「属性数减少」判定，覆盖任意危险类型。
  //
  // 关键路径：危险内容只在 .vditor-ir__preview、marker 源码保持干净 ——
  // 这样 markerChanged=false，判定完全依赖 hasRemovedUnsafeContent，
  // 才能真正暴露黑名单漏判（若用 createIrHtml 走 marker 路径，marker
  // 清洗会让 markerChanged=true 提前短路，掩盖 hasRemovedUnsafeContent 的缺陷）。
  const wrapHtmlBlockWithPreview = (previewInner: string): string => [
    '<div data-block="0" data-type="html-block" class="vditor-ir__node">',
    '<pre class="vditor-ir__marker--pre vditor-ir__marker"><code data-type="html-block">',
    '&lt;svg viewBox="0 0 10 10"&gt;&lt;rect width="10"/&gt;&lt;/svg&gt;',
    '</code></pre>',
    `<pre class="vditor-ir__preview" data-render="1">${previewInner}</pre>`,
    '</div>',
  ].join('');

  it('C7: preview 含 <img srcset="javascript:">，securityChanged === true（修复前 fail-open）', () => {
    const result = sanitizeVditorIrHtml(wrapHtmlBlockWithPreview('<img src="x" srcset="javascript:alert(1)">'));

    expect(result.securityChanged).toBe(true);
    expect(result.sourceChanged).toBe(false);
    expect(result.html).not.toContain('javascript:alert');
    expect(result.html).not.toContain('alert(');
  });

  it('C8: preview 含 <video poster="javascript:">，securityChanged === true（修复前 fail-open）', () => {
    const result = sanitizeVditorIrHtml(wrapHtmlBlockWithPreview('<video src="x" poster="javascript:alert(1)"></video>'));

    expect(result.securityChanged).toBe(true);
    expect(result.sourceChanged).toBe(false);
    expect(result.html).not.toContain('javascript:alert');
    expect(result.html).not.toContain('alert(');
  });
});

// ISS-75：编辑二级标题（h1-h6 + bold）输入英文字符时，Vditor IR 模式偶
// 尔在 `<span data-type="strong">` 的内层 `<strong>` 文本中留下字面量
// `****`。Lute.VditorIRDOM2Md 会原样保留 `****`，导致编辑器 / 预览 / 导
// 出三方都显示 `致：XXX****市场监督管理局` 这种字面星号。手动删 `****`
// 后恢复正常。
//
// 修复：在 sanitize 流程中通过 repairBrokenStrongMarkers 剥离 strong IR
// 节点内的字面量 ****；要求 strong IR 节点同时具备开闭 marker span 与内
// 层 <strong> 元素，避免误伤普通 Markdown 中的 `****` 内容。清理后必须
// 触发 securityChanged=true，让父组件用修复后的 HTML 写回 IR DOM，否则
// Vditor 仍持有脏状态，会继续产出 ****。
describe('sanitizeVditorIrHtml ISS-75 strong IR 节点内字面量 **** 清理', () => {
  // 复现 issue 截图里的 IR DOM 形态：h2 + strong IR 节点 + 内层 <strong>
  // 文本里夹了字面量 ****。注意 strong IR 节点同时具备开闭
  // vditor-ir__marker--bi span，是 Lute 解析 `## **致：XXX****市场监督
  // 管理局**`（相邻空 bold 退化）后保留的字面态。
  const brokenIrHtml = [
    '<h2 data-block="0" class="vditor-ir__node" data-marker="#">',
    '<span class="vditor-ir__marker vditor-ir__marker--heading" data-type="heading-marker">## </span>',
    '<span data-type="strong" class="vditor-ir__node">',
    '<span class="vditor-ir__marker vditor-ir__marker--bi">**</span>',
    '<strong data-newline="1">致：XXX****市场监督管理局</strong>',
    '<span class="vditor-ir__marker vditor-ir__marker--bi">**</span>',
    '</span>',
    '</h2>',
  ].join('');

  it('剥离 strong 内层 <strong> 文本里的 **** 字面量，且能 round-trip 回正确 MD', () => {
    const { lute } = createIrHtml('## **致：XXX市场监督管理局**');
    const result = sanitizeVditorIrHtml(brokenIrHtml);
    const cleanedRoot = document.createElement('div');
    cleanedRoot.innerHTML = result.html;
    const innerStrong = cleanedRoot.querySelector(
      'span[data-type="strong"] strong',
    );

    expect(result.changed).toBe(true);
    expect(result.securityChanged).toBe(true);
    // 字面量 **** 被剥
    expect(innerStrong?.textContent).toBe('致：XXX市场监督管理局');
    expect(result.html).not.toContain('****');
    // round-trip 回正确 MD（不再有字面 ****，允许尾随换行）
    expect(lute.VditorIRDOM2Md(result.html).replace(/\n+$/, '')).toBe('## **致：XXX市场监督管理局**');
  });

  it('清理在 h1/h3/h4/h5/h6 等任何标题层级的 strong IR 节点都生效', () => {
    for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
      const html = brokenIrHtml.replace('<h2 ', `<${tag} `).replace('</h2>', `</${tag}>`);
      const result = sanitizeVditorIrHtml(html);
      expect(result.changed, `${tag}: 应当检测到 **** 残留`).toBe(true);
      expect(result.html, `${tag}: 修复后不含 ****`).not.toContain('****');
    }
  });

  it('对正常 strong IR 节点（无 **** 残留）保持幂等，不触发 securityChanged', () => {
    // 构造正常 h2+bold：开闭 marker + 内层 <strong> 含中文，无 ****
    const normalHtml = [
      '<h2 data-block="0" class="vditor-ir__node" data-marker="#">',
      '<span class="vditor-ir__marker vditor-ir__marker--heading" data-type="heading-marker">## </span>',
      '<span data-type="strong" class="vditor-ir__node">',
      '<span class="vditor-ir__marker vditor-ir__marker--bi">**</span>',
      '<strong data-newline="1">致：XXX市场监督管理局</strong>',
      '<span class="vditor-ir__marker vditor-ir__marker--bi">**</span>',
      '</span>',
      '</h2>',
    ].join('');
    const result = sanitizeVditorIrHtml(normalHtml);

    expect(result.changed).toBe(false);
    expect(result.securityChanged).toBe(false);
    expect(result.html).not.toContain('****');
  });

  it('缺失开闭 marker span 的 <strong> 不在清理范围（保护裸 strong 文本）', () => {
    // 用户直接在段落里写了 <strong>a****b</strong>，Folia 不应把
    // **** 当作 Vditor 边界 bug 误剥；只有 IR 强语义结构
    // （开闭 marker + inner <strong>）才触发清理。
    const userHtml = '<p><strong>a****b</strong></p>';
    const result = sanitizeVditorIrHtml(userHtml);

    expect(result.changed).toBe(false);
    expect(result.securityChanged).toBe(false);
    expect(result.html).toContain('a****b');
  });

  it('合法 IR strong 内层故意写 **** 字面量也会被剥（锁定语义，非 bug）', () => {
    // repairBrokenStrongMarkers 的设计取舍：在通过白名单的 IR 强语义结构
    // （开闭 marker + inner strong 齐备）内，无法可靠区分「Vditor 边界残留
    // 的 ****」与「用户故意写的字面 ****」——Vditor 的 bug 本身就是在
    // 合法 IR strong 结构内产生 ****。一旦尝试细分就会漏判 bug 情况，
    // 重新打开 ISS-75 的脏状态。因此该结构内的 **** 一律剥除，偏向清理。
    // 真要写字面星号应走裸 <strong>（上一用例已验证保留）或代码块/转义。
    // 本测试锁定此行为，防止后人误以为是 bug 又来改。
    const intentionalLiteralHtml = [
      '<h2 data-block="0" class="vditor-ir__node" data-marker="#">',
      '<span class="vditor-ir__marker vditor-ir__marker--heading" data-type="heading-marker">## </span>',
      '<span data-type="strong" class="vditor-ir__node">',
      '<span class="vditor-ir__marker vditor-ir__marker--bi">**</span>',
      '<strong data-newline="1">hello****world</strong>',
      '<span class="vditor-ir__marker vditor-ir__marker--bi">**</span>',
      '</span>',
      '</h2>',
    ].join('');
    const result = sanitizeVditorIrHtml(intentionalLiteralHtml);

    // 即使是「用户字面」的 ****，在 IR strong 结构内也一律剥除。
    expect(result.changed).toBe(true);
    expect(result.securityChanged).toBe(true);
    expect(result.html).not.toContain('****');
    expect(result.html).toContain('helloworld');
  });

  it('修复后 id / data-folia-toc-anchor 等 strong 节点外属性不被破坏', () => {
    // 真实 IR DOM 还带 id 与 folia 自定义属性，修复不应影响这些 attribute。
    const htmlWithAttrs = brokenIrHtml.replace(
      '<h2 data-block="0" class="vditor-ir__node" data-marker="#">',
      '<h2 data-block="0" class="vditor-ir__node" id="ir-致-XXX----市场监督管理局" data-marker="#" data-folia-toc-anchor="true">',
    );
    const result = sanitizeVditorIrHtml(htmlWithAttrs);
    const cleanedRoot = document.createElement('div');
    cleanedRoot.innerHTML = result.html;
    const h2 = cleanedRoot.querySelector('h2');

    expect(h2?.getAttribute('id')).toBe('ir-致-XXX----市场监督管理局');
    expect(h2?.getAttribute('data-folia-toc-anchor')).toBe('true');
    expect(h2?.getAttribute('data-marker')).toBe('#');
  });
});

describe('repairSplitWrapperHtmlIrPreviews (ISS-205)', () => {
  const WRAPPER_MD = [
    '<div align="center">民事起诉状</div>',
    '',
    '正文段落。',
    '',
    '<div align="right">',
    '',
    '具状人：武景怡',
    '',
    '2026年　月　日',
    '',
  'EOF_MARK',
  ].join('\n').replace('EOF_MARK', '</div>');

  it('隐藏孤立开/闭标签节点并为中间段落注入 right 对齐 class，round-trip 源码不变', () => {
    const { lute, html } = createIrHtml(WRAPPER_MD);
    const sanitized = sanitizeVditorIrHtml(html);
    const root = document.createElement('div');
    root.innerHTML = sanitized.html;

    const changed = repairSplitWrapperHtmlIrPreviews(root);

    expect(changed).toBe(true);
    // 孤立开标签 + 孤立闭标签两个节点被隐藏
    expect(root.querySelectorAll(`.${FOLIA_IR_HTML_WRAPPER_HIDDEN_CLASS}`).length).toBe(2);
    // 中间两段注入 right 对齐 class
    const aligned = Array.from(root.querySelectorAll(`.${FOLIA_IR_HTML_ALIGN_RIGHT_CLASS}`));
    expect(aligned.length).toBe(2);
    expect(aligned.map((el) => el.textContent)).toContain('具状人：武景怡');
    // 自足单行 center 块内容可见，不是包裹组，不注入任何 class
    expect(root.querySelectorAll(`.${FOLIA_IR_HTML_ALIGN_CENTER_CLASS}`).length).toBe(0);

    // round-trip 安全：marker 未被改写，源码逐字还原
    const roundTrip = lute.VditorIRDOM2Md(root.innerHTML);
    expect(roundTrip).toContain('<div align="center">民事起诉状</div>');
    expect(roundTrip).toContain('<div align="right">\n\n具状人：武景怡\n\n2026年　月　日\n\n</div>');
  });

  it('align=center 的多行包裹组注入 center class', () => {
    const md = ['<div align="center">', '', '居中甲段', '', '居中乙段', '', '</div>'].join('\n');
    const { html } = createIrHtml(md);
    const sanitized = sanitizeVditorIrHtml(html);
    const root = document.createElement('div');
    root.innerHTML = sanitized.html;

    repairSplitWrapperHtmlIrPreviews(root);

    const centered = Array.from(root.querySelectorAll(`.${FOLIA_IR_HTML_ALIGN_CENTER_CLASS}`));
    expect(centered.map((el) => el.textContent)).toEqual(['居中甲段', '居中乙段']);
  });

  it('无 align 属性的包裹组仅隐藏孤立标签，不注入对齐 class', () => {
    const md = ['<div>', '', '普通段', '', '</div>'].join('\n');
    const { html } = createIrHtml(md);
    const sanitized = sanitizeVditorIrHtml(html);
    const root = document.createElement('div');
    root.innerHTML = sanitized.html;

    const changed = repairSplitWrapperHtmlIrPreviews(root);

    expect(changed).toBe(true);
    expect(root.querySelectorAll(`.${FOLIA_IR_HTML_WRAPPER_HIDDEN_CLASS}`).length).toBe(2);
    expect(root.querySelectorAll('[class*="folia-html-align-"]').length).toBe(0);
  });

  it('找不到闭标签的悬挂开标签不做任何修改（give-up 安全）', () => {
    const md = ['正文前。', '', '<div align="right">', '', '悬挂段'].join('\n');
    const { html } = createIrHtml(md);
    const sanitized = sanitizeVditorIrHtml(html);
    const root = document.createElement('div');
    root.innerHTML = sanitized.html;

    const changed = repairSplitWrapperHtmlIrPreviews(root);

    expect(changed).toBe(false);
    expect(root.querySelectorAll(`.${FOLIA_IR_HTML_WRAPPER_HIDDEN_CLASS}`).length).toBe(0);
    expect(root.querySelectorAll(`.${FOLIA_IR_HTML_ALIGN_RIGHT_CLASS}`).length).toBe(0);
  });

  it('重复调用幂等：class 不叠加，DOM 状态稳定', () => {
    const { html } = createIrHtml(WRAPPER_MD);
    const sanitized = sanitizeVditorIrHtml(html);
    const root = document.createElement('div');
    root.innerHTML = sanitized.html;

    repairSplitWrapperHtmlIrPreviews(root);
    repairSplitWrapperHtmlIrPreviews(root);

    expect(root.querySelectorAll(`.${FOLIA_IR_HTML_WRAPPER_HIDDEN_CLASS}`).length).toBe(2);
    for (const el of Array.from(root.querySelectorAll('.folia-html-align-right'))) {
      const tokens = (el as HTMLElement).className.split(/\s+/).filter((c) => c === 'folia-html-align-right');
      expect(tokens.length).toBe(1);
    }
  });
});

describe('sanitizeVditorIrHtml marker 保真 (ISS-205 数据损坏修复)', () => {
  it('不含危险特征的孤立开/闭标签 marker 逐字保真，保存 round-trip 不改写源码', () => {
    const { lute, html } = createIrHtml('<div align="right">\n\n正文段落\n\n</div>');
    const result = sanitizeVditorIrHtml(html);
    const markdown = lute.VditorIRDOM2Md(result.html);
    expect(markdown).toBe('<div align="right">\n\n正文段落\n\n</div>\n');
  });

  it('含危险特征的 marker 仍被结构级清洗（快路径不降低安全性）', () => {
    const { lute, html } = createIrHtml('<div onload="alert(1)">\n\nx\n\n</div>');
    const result = sanitizeVditorIrHtml(html);
    const markdown = lute.VditorIRDOM2Md(result.html);
    expect(markdown).not.toContain('onload');
    expect(markdown).not.toContain('alert(');
  });
});
