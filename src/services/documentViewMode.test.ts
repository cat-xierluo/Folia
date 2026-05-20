import { describe, expect, it } from 'vitest';
import { prefersStableHtmlPreview } from './documentViewMode';

describe('prefersStableHtmlPreview', () => {
  it('keeps plain Markdown in WYSIWYG mode', () => {
    expect(prefersStableHtmlPreview('# 标题\n\n普通正文', 'markdown')).toBe(false);
  });

  it('keeps Markdown pipe tables editable in WYSIWYG mode', () => {
    expect(prefersStableHtmlPreview('| 序号 | 内容 |\n| --- | --- |\n| 1 | 正文 |', 'markdown')).toBe(false);
  });

  it('routes raw HTML tables to the stable reading preview', () => {
    expect(prefersStableHtmlPreview(`
<table>
  <tr><th rowspan="2">序号</th><th colspan="2">证据</th></tr>
  <tr><td>1</td><td>复杂证据目录</td></tr>
</table>
`, 'markdown')).toBe(true);
  });

  it('does not treat fenced HTML examples as rendered document tables', () => {
    expect(prefersStableHtmlPreview(`
\`\`\`html
<table><tr><td>示例</td></tr></table>
\`\`\`
`, 'markdown')).toBe(false);
  });

  it('does not route documents to stable preview for hidden table markup only', () => {
    expect(prefersStableHtmlPreview(`
<!-- <table><tr><td>注释示例</td></tr></table> -->
<script>const html = '<table><tr><td>脚本示例</td></tr></table>';</script>
`, 'markdown')).toBe(false);
  });

  it('routes opened HTML files to the stable reading preview', () => {
    expect(prefersStableHtmlPreview('<h1>证据目录</h1>', 'html')).toBe(true);
  });
});
