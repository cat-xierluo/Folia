import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { prefersStableHtmlPreview } from './documentViewMode';

const fixtureDir = join(process.cwd(), 'fixtures', 'legal-html-tables');

const fixtures = {
  evidenceDirectory: join(fixtureDir, 'evidence-directory.md'),
  litigationMaterials: join(fixtureDir, 'litigation-materials.html'),
};

function readFixture(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

describe('legal HTML table fixtures', () => {
  it('keeps the baseline fixture files available', () => {
    expect(existsSync(fixtures.evidenceDirectory)).toBe(true);
    expect(existsSync(fixtures.litigationMaterials)).toBe(true);
  });

  it('covers realistic evidence directory table features', () => {
    const source = readFixture(fixtures.evidenceDirectory);

    expect(source).toContain('证据目录');
    expect(source).toMatch(/<table(?:\s|>)/i);
    expect(source).toContain('rowspan="2"');
    expect(source).toContain('colspan="3"');
    expect(source).toContain('<td></td>');
    expect(source).toContain('https://evidence.example.test/archive/case/2026-0101-1234');
    expect(source).toContain('相关沟通过程能够与邮件、微信记录及对账单相互印证');
  });

  it('covers material list features with complex headers and multiple tbody sections', () => {
    const source = readFixture(fixtures.litigationMaterials);
    const tbodyCount = (source.match(/<tbody\b/gi) ?? []).length;

    expect(source).toContain('诉讼材料清单');
    expect(source).toContain('rowspan="2"');
    expect(source).toContain('colspan="4"');
    expect(tbodyCount).toBeGreaterThanOrEqual(3);
    expect(source).toContain('<td></td>');
    expect(source).toContain('https://court-materials.example.test/notice-delivery/2026/long-path');
    expect(source).toContain('上海市黄浦区某某路某某大厦十五层法务部签收回执');
  });

  it('routes raw HTML table fixtures to the stable reading preview', () => {
    expect(prefersStableHtmlPreview(readFixture(fixtures.evidenceDirectory), 'markdown')).toBe(true);
    expect(prefersStableHtmlPreview(readFixture(fixtures.litigationMaterials), 'html')).toBe(true);
  });
});
