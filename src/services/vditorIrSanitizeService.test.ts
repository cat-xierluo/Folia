// @vitest-environment jsdom
import 'vditor/dist/js/lute/lute.min.js';
import { describe, expect, it } from 'vitest';
import {
  FOLIA_IR_SVG_FRAGMENT_CLASS,
  FOLIA_IR_SVG_ROOT_CLASS,
  repairSvgIrPreviewsFromMarkdown,
  repairSplitSvgIrPreviews,
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
