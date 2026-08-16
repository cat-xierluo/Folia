import { describe, expect, it } from 'vitest';
import { normalizeMarkdownImagePaths } from './markdownImagePathNormalizer';

// ISS-194 用户报告的真实文档行（听悟转录导出，目录名含空格 / `+` / 全角冒号）。
// 未经归一化时 Lute 按 CommonMark 拒绝解析为图片、整行按普通文本渲染。
const REAL_TRANSCRIPT_LINE =
  '![PPT 幻灯片 1](./260815 Agent + Skill：法律工作的AI变革-杨卫薪律师_slides/slide_001.webp)';

const REAL_TRANSCRIPT_LINE_NORMALIZED =
  '![PPT 幻灯片 1](./260815%20Agent%20+%20Skill：法律工作的AI变革-杨卫薪律师_slides/slide_001.webp)';

describe('normalizeMarkdownImagePaths', () => {
  it('把含未转义空格的图片目标地址编码为 %20（ISS-194 真实场景）', () => {
    expect(normalizeMarkdownImagePaths(REAL_TRANSCRIPT_LINE)).toBe(REAL_TRANSCRIPT_LINE_NORMALIZED);
  });

  it('多张图片在同一行时全部归一化，图片之外的文本不动', () => {
    const line = '前文 ![a](./x y/1.png) 中间 ![b](./x z/2.png) 后文';
    expect(normalizeMarkdownImagePaths(line)).toBe(
      '前文 ![a](./x%20y/1.png) 中间 ![b](./x%20z/2.png) 后文',
    );
  });

  it('没有可归一化构造的文档原字符串返回（引用相等）', () => {
    const doc = '# 标题\n\n正文没有图片。\n\n![ok](./slides/1.webp)\n';
    expect(normalizeMarkdownImagePaths(doc)).toBe(doc);
    const noImage = '普通文档';
    expect(normalizeMarkdownImagePaths(noImage)).toBe(noImage);
  });

  it('目标已 <> 包裹时不改写（CommonMark 合法形式，交 Lute 处理）', () => {
    const doc = '![alt](<./a b/c.webp>)';
    expect(normalizeMarkdownImagePaths(doc)).toBe(doc);
  });

  it('空格已反斜杠转义时不改写（本来就是合法语法）', () => {
    const doc = '![alt](./a\\ b/c.webp)';
    expect(normalizeMarkdownImagePaths(doc)).toBe(doc);
  });

  it('混合场景：未转义空格编码，转义空格对原样保留', () => {
    const doc = '![alt](./a\\ b/c d.webp)';
    expect(normalizeMarkdownImagePaths(doc)).toBe('![alt](./a\\ b/c%20d.webp)');
  });

  it('Tab 编码为 %09', () => {
    expect(normalizeMarkdownImagePaths('![a](./x\ty.png)')).toBe('![a](./x%09y.png)');
  });

  it('目标后的引号 title 保留，title 里的空格不编码', () => {
    expect(normalizeMarkdownImagePaths('![a](./x y.png "标题 一")'))
      .toBe('![a](./x%20y.png "标题 一")');
    expect(normalizeMarkdownImagePaths("![a](./x y.png 't t')"))
      .toBe("![a](./x%20y.png 't t')");
  });

  it('括号用配对扫描：目标内嵌平衡括号不截断', () => {
    expect(normalizeMarkdownImagePaths('![a](./屏幕截图 (1) 副本.png)'))
      .toBe('![a](./屏幕截图%20(1)%20副本.png)');
  });

  it('目标两侧的空白在重组时规范化', () => {
    expect(normalizeMarkdownImagePaths('![a](  ./x y.png  )')).toBe('![a](./x%20y.png)');
  });

  it('普通链接 […](…) 不在处理范围（缺陷范围最小变更）', () => {
    const doc = '[链接](./a b.md)';
    expect(normalizeMarkdownImagePaths(doc)).toBe(doc);
  });

  it('转义感叹号 \\![ 视为字面文本，不处理', () => {
    const doc = '\\![a](./x y.png)';
    expect(normalizeMarkdownImagePaths(doc)).toBe(doc);
  });

  it('围栏代码块（``` 与 ~~~）内逐字节保留', () => {
    const doc = [
      '```markdown',
      REAL_TRANSCRIPT_LINE,
      '```',
      '',
      '~~~',
      '![in fence](./a b.png)',
      '~~~',
      '',
      REAL_TRANSCRIPT_LINE,
    ].join('\n');
    const result = normalizeMarkdownImagePaths(doc);
    expect(result).toContain(REAL_TRANSCRIPT_LINE); // 围栏内第 2 行原样
    expect(result).toContain('![in fence](./a b.png)');
    // 围栏外最后一行被归一化
    expect(result.endsWith(REAL_TRANSCRIPT_LINE_NORMALIZED)).toBe(true);
  });

  it('行内代码 span 内的图片语法保留', () => {
    const doc = '示例 `![code](./a b.png)` 与 ![real](./c d.png)';
    expect(normalizeMarkdownImagePaths(doc)).toBe(
      '示例 `![code](./a b.png)` 与 ![real](./c%20d.png)',
    );
  });

  it('跨行未闭合的图片构造不改写', () => {
    const doc = '![a](./x y.png\n继续)';
    expect(normalizeMarkdownImagePaths(doc)).toBe(doc);
  });

  it('外部 URL 里的空格同样编码（修成可解析形式，语义不变）', () => {
    expect(normalizeMarkdownImagePaths('![a](https://x.com/a b.png)'))
      .toBe('![a](https://x.com/a%20b.png)');
  });

  it('幂等：归一化结果再跑一次不变', () => {
    const once = normalizeMarkdownImagePaths(REAL_TRANSCRIPT_LINE);
    expect(normalizeMarkdownImagePaths(once)).toBe(once);
  });
});

describe('normalizeMarkdownImagePaths 回归守卫（ISS-194：不得改坏任何原本能显示的图片）', () => {
  it('各类「原本就正常」的图片构造逐字节保留（引用相等）', () => {
    const docs = [
      '![a](./slides/slide_001.webp)',                              // 无空格相对路径
      '![a](slides/slide_001.webp)',                                // 无 ./ 前缀
      '![主体关系图](/Users/demo/图件/主体关系图.png)',               // POSIX 绝对路径（DEC-138 场景）
      '![a](C:\\Users\\demo\\图片\\1.png)',                          // Windows 绝对路径
      '![a](./260815%20Agent%20slides/slide_001.webp)',             // 已 %20 编码（幂等输入形态）
      '![a](<./a b/c.webp>)',                                       // <> 包裹
      '![a](./a\\ b/c.webp)',                                       // 反斜杠转义空格
      '![a](data:image/png;base64,iVBORw0KGgo=)',                   // data URI
      '![a](https://example.test/x.png)',                           // https
      '![a](http://example.test/x.png)',                            // http（v0.6.7 场景）
      '![a][ref]\n\n[ref]: ./slides/slide_001.webp',                // 引用式图片 + 定义
      '![alt 文本 可空格](./ok.webp)',                                // alt 含空格但目标正常
      '![a]()',                                                     // 空目标
    ];
    for (const doc of docs) {
      expect(normalizeMarkdownImagePaths(doc)).toBe(doc);
    }
  });

  it('绝对路径含空格同样归一化（与 DEC-138 绝对路径解析兼容）', () => {
    expect(normalizeMarkdownImagePaths('![a](/Users/demo/我的 图/1.png)'))
      .toBe('![a](/Users/demo/我的%20图/1.png)');
  });

  it('目标携带 query / fragment 时空格编码、query 保留', () => {
    expect(normalizeMarkdownImagePaths('![a](./x y.png?w=100#frag)'))
      .toBe('![a](./x%20y.png?w=100#frag)');
  });

  it('混合文档：坏图修复、好图不动、普通文本逐字节保留', () => {
    const doc = [
      '# 转录',
      '',
      REAL_TRANSCRIPT_LINE,
      '',
      '![好图](./slides/ok.webp)',
      '',
      '普通段落，含列表：',
      '- 条目一',
      '  ![缩进图](./deep/nested.webp)',
      '',
      '```python',
      'code = "![in code](./a b.png)"',
      '```',
      '',
      '| 表格 | 列 |',
      '| --- | --- |',
      '| ![表内图](./t/1.png) | 文本 |',
    ].join('\n');
    const result = normalizeMarkdownImagePaths(doc);
    expect(result).toContain(REAL_TRANSCRIPT_LINE_NORMALIZED);
    expect(result).toContain('![好图](./slides/ok.webp)');
    expect(result).toContain('  ![缩进图](./deep/nested.webp)');
    expect(result).toContain('| ![表内图](./t/1.png) | 文本 |');
    expect(result).toContain('code = "![in code](./a b.png)"');
    // 全文 diff 仅限坏图那一行
    const before = doc.split('\n');
    const after = result.split('\n');
    expect(before.length).toBe(after.length);
    const diffLines: number[] = [];
    before.forEach((line, i) => {
      if (line !== after[i]) diffLines.push(i);
    });
    expect(diffLines).toEqual([2]);
  });
});
