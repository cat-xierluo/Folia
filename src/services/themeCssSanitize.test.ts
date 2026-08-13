import { describe, expect, it } from 'vitest';
import { sanitizeThemeCss } from './themeCssSanitize';

describe('sanitizeThemeCss', () => {
  it('returns empty input untouched', () => {
    expect(sanitizeThemeCss('')).toEqual({ css: '', stripped: [] });
    // @ts-expect-error 验证对非字符串容错
    expect(sanitizeThemeCss(null)).toEqual({ css: '', stripped: [] });
    // @ts-expect-error 验证对非字符串容错
    expect(sanitizeThemeCss(undefined)).toEqual({ css: '', stripped: [] });
  });

  it('passes through safe CSS unchanged', () => {
    const safe = `.preview-content { background: var(--bg); color: var(--fg); }
.preview-content h1 { text-align: center; }
.preview-content ::selection { background: var(--selection-bg); }
.preview-content mark { background: var(--highlight-bg); }`;
    const { css, stripped } = sanitizeThemeCss(safe);
    expect(stripped).toEqual([]);
    expect(css).toBe(safe);
  });

  it('strips @import statements and reports them', () => {
    const dirty = `@import url("evil.css");
@import "evil2.css";
@import url('evil3.css');
.preview-content { color: red; }`;
    const { css, stripped } = sanitizeThemeCss(dirty);
    expect(css).not.toContain('@import');
    expect(css).toContain('.preview-content { color: red; }');
    expect(stripped.length).toBe(3);
    expect(stripped[0]).toMatch(/@import/);
  });

  it('strips dangerous url() protocols (javascript / vbscript / data:text/html)', () => {
    const dirty = `.x { background: url(javascript:alert(1)); }
.y { background: url(VbScript:msgbox(1)); }
.z { background: url("data:text/html,<script>alert(1)</script>"); }
.ok { background: url(https://cdn.example.com/bg.png); }`;
    const { css, stripped } = sanitizeThemeCss(dirty);
    expect(css).not.toMatch(/javascript:/i);
    expect(css).not.toMatch(/vbscript:/i);
    expect(css).not.toContain('data:text/html');
    expect(css).toContain('https://cdn.example.com/bg.png');
    expect(stripped.some((s) => s.startsWith('url()'))).toBe(true);
    expect(stripped.length).toBeGreaterThanOrEqual(3);
  });

  it('strips data:application protocols', () => {
    const dirty = `.x { background: url("data:application/javascript,alert(1)"); }`;
    const { css, stripped } = sanitizeThemeCss(dirty);
    expect(css).not.toMatch(/data:application/i);
    expect(stripped.length).toBeGreaterThanOrEqual(1);
  });

  it('preserves data:image url() payloads', () => {
    const dirty = `.x { background: url("data:image/png;base64,iVBORw0K"); }
.y { background: url('data:image/svg+xml;utf8,<svg/>'); }`;
    const { css, stripped } = sanitizeThemeCss(dirty);
    expect(css).toContain('data:image/png;base64');
    expect(css).toContain('data:image/svg+xml');
    expect(stripped).toEqual([]);
  });

  it('preserves http(s) and relative urls', () => {
    const dirty = `.x { background: url(/local/bg.png); }
.y { background: url("./local.png"); }
.z { background: url("../up.png"); }
.h { background: url("#fragment"); }`;
    const { css, stripped } = sanitizeThemeCss(dirty);
    expect(css).toContain('url(/local/bg.png)');
    expect(css).toContain('url("./local.png")');
    expect(css).toContain('url("../up.png")');
    expect(css).toContain('url("#fragment")');
    expect(stripped).toEqual([]);
  });

  it('strips @font-face blocks containing dangerous src urls', () => {
    const dirty = `@font-face {
  font-family: Evil;
  src: url("data:text/html,<script>alert(1)</script>") format("truetype");
}
@font-face {
  font-family: Safe;
  src: url("data:image/png;base64,iVBORw0K");
}
.x { color: red; }`;
    const { css, stripped } = sanitizeThemeCss(dirty);
    expect(css).not.toContain('font-family: Evil');
    expect(css).toContain('font-family: Safe');
    expect(stripped.some((s) => s.startsWith('@font-face src'))).toBe(true);
    expect(css).toContain('.x { color: red; }');
  });

  it('strips expression() and -moz-binding and behavior:', () => {
    const dirty = `.a { width: expression(document.body.clientWidth); }
.b { -moz-binding: url("evil.xml#x"); }
.c { behavior: url(evil.htc); }`;
    const { css, stripped } = sanitizeThemeCss(dirty);
    expect(css).not.toMatch(/expression\(/i);
    expect(css).not.toContain('-moz-binding');
    expect(css).not.toMatch(/behavior\s*:/);
    expect(stripped.some((s) => s.startsWith('expression()'))).toBe(true);
    expect(stripped.some((s) => s.startsWith('-moz-binding'))).toBe(true);
    expect(stripped.some((s) => s.startsWith('behavior:'))).toBe(true);
  });

  it('does not limit selectors — anything user-defined is kept', () => {
    const dirty = `.foo > .bar[data-x="y"]:not(#id)::before { content: "hi"; }
html[data-theme='builtin:dark'] .preview-content { color: red; }
@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`;
    const { css, stripped } = sanitizeThemeCss(dirty);
    expect(css).toBe(dirty);
    expect(stripped).toEqual([]);
  });

  it('reports multiple strip kinds together', () => {
    const dirty = `@import url("e.css");
.a { background: url(javascript:alert(1)); width: expression(1); -moz-binding: url(x); behavior: url(y); }`;
    const { stripped } = sanitizeThemeCss(dirty);
    expect(stripped.some((s) => s.startsWith('@import'))).toBe(true);
    expect(stripped.some((s) => s.startsWith('url()'))).toBe(true);
    expect(stripped.some((s) => s.startsWith('expression()'))).toBe(true);
    expect(stripped.some((s) => s.startsWith('-moz-binding'))).toBe(true);
    expect(stripped.some((s) => s.startsWith('behavior:'))).toBe(true);
  });
});