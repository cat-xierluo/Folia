// useTabWindowSync —— 跨窗口 tab 事件 → 本地 sessionReducer dispatch（ISS-164，DEC-102）。
//
// 工作模式：
// - 主窗口：listen `tab:tear-off` / `tab:merge-back` / `session:full-sync` / `window:closed`，
//   把事件 payload 翻译成本地 reducer action。
// - 独立窗口：listen `tab:tear-off` / `tab:merge-back` / `session:full-sync`，挂载时主动
//   emit `session:full-sync { requester: <label> }` 拉一次全量。
//
// 设计上保持「事件总线为唯一真相」：本地 dispatch 后立刻 emit 给其他窗口，
// 避免 race condition（同一 tab 被两个窗口同时操作）。

import { useEffect, useRef } from 'react';
import {
  onTabMergeBack,
  onTabTearOff,
  onSessionFullSync,
  onWindowClosed,
  detectCurrentWindowLabel,
  type TabTearOffPayload,
  type TabMergeBackPayload,
  type SessionFullSyncPayload,
  type WindowClosedPayload,
} from '../services/tabWindowService';
import type { Tab } from '../types/session';

export interface UseTabWindowSyncOptions {
  /** 当前窗口所有 tab 的 id → tab 映射（用于 window:closed 收回时重组 tab 对象）。 */
  tabsById: Record<string, Tab>;
  /** 触发本地 reducer dispatch 的回调。 */
  dispatch: (action:
    | { type: 'receiveTab'; tab: Tab }
    | { type: 'windowClosed'; remainingTabIds: string[]; tabsById: Record<string, Tab> }
  ) => void;
  /**
   * 主窗口专用：响应其他窗口 `session:full-sync` 请求，回传当前 session 快照。
   * 独立窗口忽略。
   */
  onProvideFullSync?: (requester: string) => void;
}

export interface UseTabWindowSyncResult {
  /** 当前窗口 label（main / tab-window-xxx），用于 IPC payload。 */
  windowLabel: string;
  /** 是否主窗口。 */
  isMain: boolean;
}

/** 启动跨窗口事件订阅。返回当前 windowLabel 与 isMain。 */
export function useTabWindowSync(opts: UseTabWindowSyncOptions): UseTabWindowSyncResult {
  const { tabsById, dispatch, onProvideFullSync } = opts;
  const tabsByIdRef = useRef(tabsById);
  useEffect(() => { tabsByIdRef.current = tabsById; }, [tabsById]);

  const windowLabel = detectCurrentWindowLabel();
  const isMain = windowLabel === 'main';

  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    unlisteners.push(onTabTearOff((payload: TabTearOffPayload) => {
      // 主窗口 listen：本地已通过调用方 removeTabById 移除，
      // 这里只 log 防 trace。
      if (payload.sourceLabel === windowLabel) return;
      // 其他窗口发出的事件：记录即可（当前 MVP 不做主窗口外的 tear-off 触发）。
    }));

    unlisteners.push(onTabMergeBack((payload: TabMergeBackPayload) => {
      // 目标窗口：把 tab 加回本地。
      if (payload.targetLabel === windowLabel) {
        const cached = tabsByIdRef.current[payload.tabId];
        if (!cached) return;
        // 去重：避免其他窗口重复发同一 payload 导致重复 receive。
        dispatch({ type: 'receiveTab', tab: cached });
      }
    }));

    unlisteners.push(onSessionFullSync((payload: SessionFullSyncPayload) => {
      // 独立窗口收到主窗口的回包 → 用 payload.session 覆盖本地状态（简化：未来做）。
      // 当前 MVP 阶段，独立窗口不依赖该 payload（启动时通过 windowLabel 隔离）。
      if (payload.requester === windowLabel) {
        // 自己发的 full-sync 被自己回环，忽略。
        return;
      }
      // 主窗口被请求：回传当前 session。
      if (isMain && onProvideFullSync) {
        onProvideFullSync(payload.requester);
      }
    }));

    unlisteners.push(onWindowClosed((payload: WindowClosedPayload) => {
      // 只有主窗口回收 tab（独立窗口关闭时由主窗口兜底）。
      if (!isMain) return;
      if (payload.label === windowLabel) return;
      dispatch({
        type: 'windowClosed',
        remainingTabIds: payload.remainingTabIds,
        tabsById: tabsByIdRef.current,
      });
    }));

    return () => {
      for (const un of unlisteners) un();
    };
  }, [windowLabel, isMain, dispatch, onProvideFullSync]);

  return { windowLabel, isMain };
}
