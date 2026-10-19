/**
 * ISS-228（Issue #186 Part A）：编辑器历史（撤销/重做）桥接接口。
 *
 * WYSIWYG（Vditor 统一 Undo 类）与源码（CodeMirror 6 history）两种编辑器
 * 都通过该接口把撤销/重做透出给外壳；Toolbar 只依赖此抽象，不感知具体
 * 编辑器实现。api 为 null 表示当前没有可操作的活动编辑器（只读 docx /
 * HTML 演示态 / 编辑器尚未就绪），此时工具栏按钮禁用。
 */
export type EditorHistoryApi = {
  undo: () => void;
  redo: () => void;
};
