// ISS-171：本测试既要用 `node:fs` 读 fixture，又要在 docx 解析链路里用到
// `document.createElement`（style-mapping.ts 解析 HTML 表格）。两者冲突——
// vitest 的 jsdom 环境会把 `node:` 内置模块 externalize 报 "No such built-in
// module"。解法：用 node 环境（`node:fs` 原生可用），并用项目已装的 jsdom
// 依赖手动注入全局 `document` / `window`，满足 docx 解析对 DOM 的最小需求。
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

// 为 docx 解析链路提供最小 DOM。仅本文件作用域，不影响其他测试。
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
(globalThis as typeof globalThis & { document?: Document }).document = dom.window.document;
(globalThis as typeof globalThis & { window?: typeof dom.window }).window = dom.window;
(globalThis as typeof globalThis & { DOMParser?: typeof dom.window.DOMParser }).DOMParser =
  dom.window.DOMParser;
// `Node.TEXT_NODE` 等常量在 htmlTableModel.ts 里被直接引用，node 环境没有这些 DOM 常量。
(globalThis as typeof globalThis & { Node?: typeof dom.window.Node }).Node = dom.window.Node;
(globalThis as typeof globalThis & { Element?: typeof dom.window.Element }).Element =
  dom.window.Element;

import { DEFAULT_PRESET_ID, getPreset } from './config';
import { markdownToDocx } from './parser';
import type { PresetConfig } from './types';

async function readDocxZip(markdown: string, preset: PresetConfig = getPreset(DEFAULT_PRESET_ID)): Promise<JSZip> {
  const blob = await markdownToDocx(markdown, preset);
  return JSZip.loadAsync(await blob.arrayBuffer());
}

async function readZipText(zip: JSZip, path: string): Promise<string> {
  const text = await zip.file(path)?.async('string');
  if (!text) {
    throw new Error(`${path} not found in generated DOCX`);
  }
  return text;
}

async function optionalZipText(zip: JSZip, path: string): Promise<string | undefined> {
  return zip.file(path)?.async('string');
}

async function readDocumentXml(markdown: string, preset: PresetConfig = getPreset(DEFAULT_PRESET_ID)): Promise<string> {
  return readZipText(await readDocxZip(markdown, preset), 'word/document.xml');
}

async function readDocumentRelationships(markdown: string, preset: PresetConfig): Promise<{
  documentXml: string;
  headerXml?: string;
  footerXml?: string;
}> {
  const zip = await readDocxZip(markdown, preset);
  return {
    documentXml: await readZipText(zip, 'word/document.xml'),
    headerXml: await optionalZipText(zip, 'word/header1.xml'),
    footerXml: await optionalZipText(zip, 'word/footer1.xml'),
  };
}

function countXmlNodes(xml: string, nodeName: string): number {
  return xml.match(new RegExp(`<${nodeName}\\b`, 'g'))?.length ?? 0;
}

function xmlAttr(xml: string, tag: string, attr: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*${attr}="([^"]+)"`));
  return match?.[1];
}

function allXmlAttrs(xml: string, tag: string, attr: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}\\b[^>]*${attr}="([^"]+)"`, 'g'))].map((match) => match[1]);
}

describe('markdownToDocx XML output', () => {
  it('preserves key merge and header nodes for legal HTML tables', async () => {
    const markdown = readFileSync(
      join(process.cwd(), 'fixtures', 'legal-html-tables', 'evidence-directory.md'),
      'utf8',
    );

    const documentXml = await readDocumentXml(markdown);

    expect(documentXml).toMatch(/<w:gridSpan\b[^>]*w:val="3"/);
    expect(documentXml).toMatch(/<w:vMerge\b[^>]*w:val="restart"/);
    expect(documentXml).toMatch(/<w:vMerge\b(?![^>]*w:val="restart")/);
    expect(countXmlNodes(documentXml, 'w:tblHeader')).toBe(2);
    expect(countXmlNodes(documentXml, 'w:tr')).toBeGreaterThanOrEqual(7);
  });

  it('applies extended table and header page-number preset values to DOCX XML', async () => {
    const base = getPreset(DEFAULT_PRESET_ID);
    const preset: PresetConfig = {
      ...base,
      page_number: {
        enabled: true,
        format: '1',
        font: 'Times New Roman',
        size: 10.5,
        position: 'header',
        align: 'right',
      },
      table: {
        ...base.table,
        border_enabled: false,
        alignment: 'center',
        vertical_align: 'bottom',
        cell_margins: {
          top: 40 / 567,
          bottom: 40 / 567,
          left: 60 / 567,
          right: 60 / 567,
        },
        header_background_color: '1E3A5F',
        row_odd_background_color: 'F5F0ED',
        row_even_background_color: 'FFFFFF',
      },
    };

    const { documentXml, headerXml, footerXml } = await readDocumentRelationships([
      '| 事项 | 说明 |',
      '| --- | --- |',
      '| 第一行 | 奇数背景 |',
      '| 第二行 | 偶数背景 |',
    ].join('\n'), preset);

    expect(headerXml).toBeDefined();
    expect(footerXml).toBeUndefined();
    expect(headerXml).toMatch(/<w:jc\b[^>]*w:val="right"/);
    expect(headerXml).toMatch(/<w:instrText\b[^>]*>\s*PAGE\s*<\/w:instrText>/);
    expect(headerXml).not.toMatch(/NUMPAGES/);

    expect(documentXml).toMatch(/<w:jc\b[^>]*w:val="center"/);
    expect(documentXml).toMatch(/<w:vAlign\b[^>]*w:val="bottom"/);
    expect(documentXml).toMatch(/<w:top\b[^>]*w:val="none"/);
    expect(documentXml).toMatch(/<w:bottom\b[^>]*w:val="none"/);
    expect(xmlAttr(documentXml, 'w:top', 'w:w')).toBe('40');
    expect(xmlAttr(documentXml, 'w:left', 'w:w')).toBe('60');
    expect(allXmlAttrs(documentXml, 'w:shd', 'w:fill')).toEqual(expect.arrayContaining([
      '1E3A5F',
      'F5F0ED',
      'FFFFFF',
    ]));
  });

  it('exports image captions when enabled and alt text exists', async () => {
    const base = getPreset(DEFAULT_PRESET_ID);
    const preset: PresetConfig = {
      ...base,
      image: {
        ...base.image,
        show_caption: true,
      },
    };

    const documentXml = await readDocumentXml('![证据图片](https://example.com/image.png)', preset);

    expect(documentXml).toContain('[图片: 证据图片]');
    expect(documentXml).toContain('证据图片');
  });

  it('applies reusable markdown and HTML style mappings to DOCX XML', async () => {
    const base = getPreset(DEFAULT_PRESET_ID);
    const preset: PresetConfig = {
      ...base,
      image: {
        ...base.image,
        show_caption: true,
      },
      styles: {
        mappedHeading: {
          font: '微软雅黑',
          ascii: 'Arial',
          size: 18,
          color: '445566',
          bold: true,
          align: 'right',
        },
        mappedParagraph: {
          font: '楷体',
          ascii: 'Georgia',
          size: 13,
          color: '112233',
          line_spacing: 1.8,
          first_line_indent: 1,
        },
        mappedTable: {
          table: {
            cell_margin: 40 / 567,
            header_background_color: 'ABCDEF',
            row_odd_background_color: 'F0F0F0',
          },
        },
        evidenceTable: {
          table: {
            header_background_color: '123456',
            row_odd_background_color: '654321',
            row_even_background_color: '654321',
          },
        },
        mappedCaption: {
          font: '黑体',
          ascii: 'Arial',
          size: 9,
          color: '777777',
        },
        mappedCode: {
          font: 'Courier New',
          ascii: 'Courier New',
          size: 11,
          color: '990000',
          left_indent: 18,
          line_spacing: 1.1,
        },
        mappedList: {
          font: '宋体',
          ascii: 'Arial',
          size: 10,
          color: '336699',
          left_indent: 30,
          line_spacing: 1.1,
        },
        mappedRule: {
          font: 'Arial',
          ascii: 'Arial',
          size: 8,
          color: '222222',
          bold: true,
          align: 'center',
        },
      },
      markdown_mapping: {
        heading1: 'mappedHeading',
        paragraph: 'mappedParagraph',
        table: 'mappedTable',
        image_caption: 'mappedCaption',
        code_block: 'mappedCode',
        list: 'mappedList',
        horizontal_rule: 'mappedRule',
      },
      html_mapping: {
        selectors: {
          'table.evidence-table': 'evidenceTable',
        },
      },
    };

    const documentXml = await readDocumentXml([
      '# 映射标题',
      '',
      '映射正文',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '<table class="evidence-table"><tr><th>证据</th></tr><tr><td>合同</td></tr></table>',
      '',
      '```ts',
      'const a = 1',
      '```',
      '',
      '- 映射列表',
      '',
      '---',
      '',
      '![证据图](https://example.com/evidence.png)',
    ].join('\n'), preset);

    expect(documentXml).toMatch(/<w:rFonts\b(?=[^>]*w:eastAsia="微软雅黑")(?=[^>]*w:ascii="Arial")/);
    expect(documentXml).toMatch(/<w:rFonts\b(?=[^>]*w:eastAsia="楷体")(?=[^>]*w:ascii="Georgia")/);
    expect(documentXml).toMatch(/<w:rFonts\b(?=[^>]*w:eastAsia="Courier New")(?=[^>]*w:ascii="Courier New")/);
    expect(documentXml).toMatch(/<w:rFonts\b(?=[^>]*w:eastAsia="宋体")(?=[^>]*w:ascii="Arial")/);
    expect(allXmlAttrs(documentXml, 'w:color', 'w:val')).toEqual(expect.arrayContaining([
      '445566',
      '112233',
      '777777',
      '990000',
      '336699',
      '222222',
    ]));
    expect(allXmlAttrs(documentXml, 'w:shd', 'w:fill')).toEqual(expect.arrayContaining([
      'ABCDEF',
      'F0F0F0',
      '123456',
      '654321',
    ]));
    expect(allXmlAttrs(documentXml, 'w:top', 'w:w')).toEqual(expect.arrayContaining(['40']));
  });
});
