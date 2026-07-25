// @ts-check
/**
 * v0.7 法律文档模板（ROADMAP）：证据目录、材料清单、时间线。
 *
 * 设计要点：
 * - 模板用 Markdown 管道表格 / 列表，**不**用原生 HTML `<table>` + rowspan/colspan。
 *   原因：复杂 HTML 表在 Vditor IR 模式会被 `lockComplexTables` 锁定为
 *   contenteditable=false（见 WysiwygEditorPane.tsx），用户无法在锁定的表里编辑
 *   单元格，只能整体替换源码。模板的目的是「能快速填的结构」，必须可编辑。
 * - 内容是精简骨架（表头 + 少量占位空行），不是完整样例——用户要填充，不是删除。
 * - 证据目录、材料清单预留 `data-hide-last-column` 属性挂载点（如需隐藏内部备注列，
 *   用户在生成的表上补属性即可，参见 ROADMAP 表格列隐藏规则）。
 */

export interface LegalTemplate {
  id: string;
  /** i18n key for the template title shown in the menu. */
  titleI18nKey: string;
  /** Markdown skeleton inserted at the cursor. */
  markdown: string;
}

export const LEGAL_TEMPLATES: readonly LegalTemplate[] = [
  {
    id: 'evidence-directory',
    titleI18nKey: 'templateEvidenceDirectory',
    markdown: [
      '## 证据目录',
      '',
      '案号：（　）　民初　　号',
      '',
      '| 序号 | 证据名称 | 来源/形成时间 | 证明目的 | 页码 |',
      '| --- | --- | --- | --- | --- |',
      '| 1 |  |  |  |  |',
      '| 2 |  |  |  |  |',
      '| 3 |  |  |  |  |',
      '',
    ].join('\n'),
  },
  {
    id: 'litigation-materials',
    titleI18nKey: 'templateLitigationMaterials',
    markdown: [
      '## 诉讼材料清单',
      '',
      '案由：',
      '',
      '| 编号 | 名称 | 份数 | 说明 | 接收情况 |',
      '| --- | --- | --- | --- | --- |',
      '| A-01 | 民事起诉状 |  |  |  |',
      '| A-02 | 主体资格证明 |  |  |  |',
      '| B-01 |  |  |  |  |',
      '',
    ].join('\n'),
  },
  {
    id: 'case-timeline',
    titleI18nKey: 'templateCaseTimeline',
    markdown: [
      '## 案件时间线',
      '',
      '- 20　年　月　日：',
      '- 20　年　月　日：',
      '- 20　年　月　日：',
      '',
    ].join('\n'),
  },
];

/** CustomEvent name for the Toolbar → active WysiwygEditorPane bridge. */
export const TOOLBAR_INSERT_TEMPLATE_EVENT = 'folia:toolbar-insert-template';
