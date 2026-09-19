// 自动重读结果守卫（ISS-218）。
//
// ISS-188 的自动重读把磁盘内容原样写回当前 tab。云同步卷（iCloud「优化 Mac 存储」/
// OneDrive 按需文件）在卸载本地副本、按需下载、上传回写等阶段会连发文件事件，
// 极端时序下磁盘可能读回一份空文档。此时静默覆盖的后果是一条链：编辑器瞬间
// 空白 → session 持久化把空草稿固化到 localStorage（≤256KB 的 tab 整体持久化，
// 重启也不再从磁盘重读）→ 用户一敲键盘 dirty=true → autosave 800ms 把空内容写回
// 磁盘覆盖原文。
//
// 本模块刻意零依赖：AppLayout 静态导入，测试对 fileService 的整体 mock 不影响它。

import type { OpenedFile } from '../types/document';

/**
 * 磁盘读回为空而编辑器当前非空——多半不是用户在外部把文件清空，而是云占位态 /
 * 同步中间态。调用方应改走「外部修改」确认提示（内容原地保留），由用户显式决定
 * 是否放弃本地内容；真实的外部清空也仍可经该提示手动重载。
 *
 * docx 的 content 恒为空（正文在 docxHtml），不参与判定。
 */
export function isSuspiciousEmptyReload(opened: OpenedFile, current: OpenedFile): boolean {
  if (opened.fileType === 'docx') return false;
  return opened.content === '' && current.content !== '';
}
