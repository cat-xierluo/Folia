// ISS-164：tab 拖拽 payload 序列化工具。与 TabBar.tsx 解耦以满足 react-refresh/only-export-components。

export interface TabDragPayload {
  tabId: string;
  sourceLabel: string;
  dirty?: boolean;
}

export const TAB_DRAG_MIME = 'application/x-folia-tab';

export function encodeTabDragPayload(payload: TabDragPayload): string {
  return JSON.stringify(payload);
}

export function decodeTabDragPayload(raw: string): TabDragPayload | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const v = parsed as { tabId?: unknown; sourceLabel?: unknown; dirty?: unknown };
    if (typeof v.tabId !== 'string' || typeof v.sourceLabel !== 'string') return null;
    return {
      tabId: v.tabId,
      sourceLabel: v.sourceLabel,
      dirty: typeof v.dirty === 'boolean' ? v.dirty : undefined,
    };
  } catch {
    return null;
  }
}
