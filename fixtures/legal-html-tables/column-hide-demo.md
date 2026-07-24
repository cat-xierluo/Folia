# 表格列隐藏规则样例（data-hide-last-column）

本样例用于回归 v0.7「表格列隐藏规则」（ROADMAP）。在 `<table>` 上加布尔属性 `data-hide-last-column` 后，所有阅读 / 预览 / 导出 surface 隐藏该表格的最后一列（主编辑器如实显示完整表格）。典型场景：证据目录 / 材料清单的最后一列是「内部备注」，不希望出现在对外预览与导出文档中。

## 规整表格（无 rowspan / colspan）

末列「内部备注」应在预览 / 导出中隐藏；前三列正常显示。

<table data-hide-last-column>
  <thead>
    <tr>
      <th>序号</th>
      <th>材料名称</th>
      <th>页码</th>
      <th>内部备注</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1</td>
      <td>起诉状</td>
      <td>P1-P3</td>
      <td>已签字盖章</td>
    </tr>
    <tr>
      <td>2</td>
      <td>证据目录</td>
      <td>P4-P5</td>
      <td>与立案提交一致</td>
    </tr>
    <tr>
      <td>3</td>
      <td>授权委托书</td>
      <td>P6</td>
      <td>原件在卷宗</td>
    </tr>
  </tbody>
</table>

## 含 colspan 跨越末列的表格

表头第二格 `colspan="3"` 覆盖「材料 / 页码 / 内部备注」三列，隐藏末列后导出的合并表头应缩减为 `colspan="2"`（DOCX 侧按网格列精确处理；HTML 预览为 best-effort）。

<table data-hide-last-column>
  <thead>
    <tr>
      <th>序号</th>
      <th colspan="3">立案材料明细</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1</td>
      <td>起诉状</td>
      <td>P1-P3</td>
      <td>已签字</td>
    </tr>
    <tr>
      <td>2</td>
      <td>答辩状</td>
      <td>P4-P7</td>
      <td>待补充</td>
    </tr>
  </tbody>
</table>
