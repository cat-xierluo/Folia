// 跨窗口 tab 拖拽 IPC 服务（ISS-164，DEC-102）。
//
// 设计要点：
// - session 仍由前端 useSession 维护（方案 1 YAGNI），Rust 只追踪 label ↔ tabIds 映射，
//   用于关闭独立窗口时回收未移交的 tab。
// - 窗口间通过 Tauri event bus 同步：tab:tear-off / tab:merge-back /
//   session:full-sync / window:closed。
// - tab:merge-back payload 直接携带完整 tab 数据（不依赖 localStorage 同步窗口）；
//   tab 内容可能较大，但 MVP 阶段接受——后续可改为 OPFS / 后端转发。
// - 所有 invoke 在非 Tauri 运行时（浏览器 / 单测）下走 stub，避免测试炸。

import type { UnlistenFn } from '@tauri-apps/api/event';
import type { Tab } from '../types/session';

export const TAB_WINDOW_EVENTS = {
  tearOff: 'tab:tear-off',
  mergeBack: 'tab:merge-back',
  fullSync: 'session:full-sync',
  windowClosed: 'window:closed',
  /** ISS-164：拖到目标窗口 tab bar 后，目标 emit 信号给源，让源主动发起 merge-back。 */
  dropRequested: 'tab:drop-requested',
} as const;

export interface TabTearOffPayload {
  tabId: string;
  sourceLabel: string;
  dirty?: boolean;
}

export interface TabMergeBackPayload {
  tabId: string;
  sourceLabel: string;
  targetLabel: string;
  dirty?: boolean;
  /** 源窗口当前持有的 tab 数据；目标窗口无需再次拉取。 */
  tab?: Tab;
}

export interface SessionFullSyncPayload {
  requester: string;
  /** 拥有者（一般是 main）的当前 session 快照。 */
  session?: unknown;
}

export interface WindowClosedPayload {
  label: string;
  remainingTabIds: string[];
}

export interface TabDropRequestedPayload {
  tabId: string;
  sourceLabel: string;
  targetLabel: string;
  dirty?: boolean;
}

export type TabTearOffListener = (payload: TabTearOffPayload) => void;
export type TabMergeBackListener = (payload: TabMergeBackPayload) => void;
export type SessionFullSyncListener = (payload: SessionFullSyncPayload) => void;
export type WindowClosedListener = (payload: WindowClosedPayload) => void;
export type TabDropRequestedListener = (payload: TabDropRequestedPayload) => void;

let unlistenTearOff: UnlistenFn | null = null;
let unlistenMergeBack: UnlistenFn | null = null;
let unlistenFullSync: UnlistenFn | null = null;
let unlistenWindowClosed: UnlistenFn | null = null;
let unlistenDropRequested: UnlistenFn | null = null;

let tearOffListeners: Set<TabTearOffListener> = new Set();
let mergeBackListeners: Set<TabMergeBackListener> = new Set();
let fullSyncListeners: Set<SessionFullSyncListener> = new Set();
let windowClosedListeners: Set<WindowClosedListener> = new Set();
let dropRequestedListeners: Set<TabDropRequestedListener> = new Set();

let listenPromise: Promise<void> | null = null;

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function notify<T>(listeners: Set<(payload: T) => void>, payload: T): void {
  for (const listener of listeners) {
    try {
      listener(payload);
    } catch (error) {
      console.error('tabWindowService: listener threw', error);
    }
  }
}

function isTabTearOffPayload(value: unknown): value is TabTearOffPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as { tabId?: unknown; sourceLabel?: unknown };
  return typeof v.tabId === 'string' && typeof v.sourceLabel === 'string';
}

function isTabMergeBackPayload(value: unknown): value is TabMergeBackPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as { tabId?: unknown; sourceLabel?: unknown; targetLabel?: unknown };
  return typeof v.tabId === 'string'
    && typeof v.sourceLabel === 'string'
    && typeof v.targetLabel === 'string';
}

function isSessionFullSyncPayload(value: unknown): value is SessionFullSyncPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as { requester?: unknown };
  return typeof v.requester === 'string';
}

function isWindowClosedPayload(value: unknown): value is WindowClosedPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as { label?: unknown; remainingTabIds?: unknown };
  return typeof v.label === 'string' && Array.isArray(v.remainingTabIds);
}

function isTabDropRequestedPayload(value: unknown): value is TabDropRequestedPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as { tabId?: unknown; sourceLabel?: unknown; targetLabel?: unknown };
  return typeof v.tabId === 'string'
    && typeof v.sourceLabel === 'string'
    && typeof v.targetLabel === 'string';
}

async function ensureListening(): Promise<void> {
  if (unlistenTearOff && unlistenMergeBack && unlistenFullSync && unlistenWindowClosed && unlistenDropRequested) return;
  if (!isTauriRuntime()) return;
  if (listenPromise) return listenPromise;

  listenPromise = (async () => {
    const { listen } = await import('@tauri-apps/api/event');
    unlistenTearOff = await listen(TAB_WINDOW_EVENTS.tearOff, (event) => {
      if (isTabTearOffPayload(event.payload)) {
        notify(tearOffListeners, event.payload);
      } else {
        console.warn('tabWindowService: ignored malformed tab:tear-off payload', event.payload);
      }
    });
    unlistenMergeBack = await listen(TAB_WINDOW_EVENTS.mergeBack, (event) => {
      if (isTabMergeBackPayload(event.payload)) {
        notify(mergeBackListeners, event.payload);
      } else {
        console.warn('tabWindowService: ignored malformed tab:merge-back payload', event.payload);
      }
    });
    unlistenFullSync = await listen(TAB_WINDOW_EVENTS.fullSync, (event) => {
      if (isSessionFullSyncPayload(event.payload)) {
        notify(fullSyncListeners, event.payload);
      } else {
        console.warn('tabWindowService: ignored malformed session:full-sync payload', event.payload);
      }
    });
    unlistenWindowClosed = await listen(TAB_WINDOW_EVENTS.windowClosed, (event) => {
      if (isWindowClosedPayload(event.payload)) {
        notify(windowClosedListeners, event.payload);
      } else {
        console.warn('tabWindowService: ignored malformed window:closed payload', event.payload);
      }
    });
    unlistenDropRequested = await listen(TAB_WINDOW_EVENTS.dropRequested, (event) => {
      if (isTabDropRequestedPayload(event.payload)) {
        notify(dropRequestedListeners, event.payload);
      } else {
        console.warn('tabWindowService: ignored malformed tab:drop-requested payload', event.payload);
      }
    });
  })().catch((error) => {
    console.warn('tabWindowService: failed to attach listeners', error);
    unlistenTearOff = null;
    unlistenMergeBack = null;
    unlistenFullSync = null;
    unlistenWindowClosed = null;
    unlistenDropRequested = null;
  }).finally(() => {
    listenPromise = null;
  });

  return listenPromise;
}

interface TauriEventEmitModule {
  emit: (event: string, payload?: unknown) => Promise<void>;
}

async function emitEvent(event: string, payload?: unknown): Promise<void> {
  if (!isTauriRuntime()) return;
  const mod: TauriEventEmitModule = await import('@tauri-apps/api/event');
  await mod.emit(event, payload);
}

interface TauriInvokeModule {
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

async function invokeCommand<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error(`tabWindowService: invoke '${cmd}' requires Tauri runtime`);
  }
  const { invoke } = await import('@tauri-apps/api/core') as TauriInvokeModule;
  return invoke<T>(cmd, args);
}

// ──────── 顶层 API（前端消费） ────────

/** 当前 Tauri 窗口 label（main / tab-window-N），从 URL query 或 window.label() 解析。 */
export function detectCurrentWindowLabel(): string {
  if (typeof window === 'undefined') return 'main';
  try {
    const params = new URLSearchParams(window.location.search);
    const label = params.get('label');
    if (label && /^[a-zA-Z0-9_-]{1,64}$/.test(label)) return label;
  } catch {
    // ignore - 退化到默认 main。
  }
  return 'main';
}

/**
 * 拖出 tab 到独立窗口。
 *
 * - emit `tab:tear-off` 让其他窗口记录（不强制消费）。
 * - invoke `create_tab_window` 让 Rust 创建新 WebviewWindow。
 * - 失败时抛 Err，由调用方负责恢复本地 tab 状态。
 */
export async function tearOffTabToWindow(
  payload: TabTearOffPayload,
): Promise<void> {
  await emitEvent(TAB_WINDOW_EVENTS.tearOff, payload);
  await invokeCommand<void>('create_tab_window', {
    label: makeTabWindowLabel(payload.tabId, payload.sourceLabel),
    initialTabIds: [payload.tabId],
  });
}

/** 把独立窗口的 tab 拖回主窗口。 */
export async function mergeBackTab(
  payload: TabMergeBackPayload,
): Promise<void> {
  await emitEvent(TAB_WINDOW_EVENTS.mergeBack, payload);
  // 源窗口在 tab 移交后由 useTabWindowSync 触发 close_tab_window。
}

/** 同步 Rust 端的 label → tabIds 映射（前端 session 变更后调用）。 */
export async function syncWindowTabIds(label: string, tabIds: string[]): Promise<void> {
  try {
    await invokeCommand<void>('update_tab_window_tabs', { label, tabIds });
  } catch (error) {
    console.warn('tabWindowService: update_tab_window_tabs failed', label, error);
  }
}

/** 主动关闭独立窗口（merge-back 后调用，让 Rust 走 close 路径触发 window:closed）。 */
export async function closeTabWindow(label: string): Promise<void> {
  try {
    await invokeCommand<void>('close_tab_window', { label });
  } catch (error) {
    console.warn('tabWindowService: close_tab_window failed', label, error);
  }
}

/** 目标窗口被 drop 时 emit 信号给源窗口，让源主动发起 merge-back（携带完整 tab）。 */
export async function requestMergeBack(payload: TabDropRequestedPayload): Promise<void> {
  await emitEvent(TAB_WINDOW_EVENTS.dropRequested, payload);
}

/** 广播 session 全量快照（main 窗口响应新窗口的 full-sync 请求）。 */
export async function broadcastFullSync(payload: SessionFullSyncPayload): Promise<void> {
  await emitEvent(TAB_WINDOW_EVENTS.fullSync, payload);
}

/** 生成独立窗口的 label。基于 sourceLabel + tabId 哈希，避免冲突。 */
export function makeTabWindowLabel(tabId: string, sourceLabel: string): string {
  // 简单确定性 hash：djb2-like；目的只是让标签稳定可复现，不做安全用途。
  let hash = 5381;
  const combined = `${sourceLabel}:${tabId}`;
  for (let i = 0; i < combined.length; i += 1) {
    hash = ((hash << 5) + hash + combined.charCodeAt(i)) | 0;
  }
  const suffix = Math.abs(hash).toString(36);
  return `tab-window-${suffix}`;
}

// ──────── 事件订阅 API（消费方调用） ────────

export function onTabTearOff(listener: TabTearOffListener): () => void {
  tearOffListeners.add(listener);
  void ensureListening();
  return () => tearOffListeners.delete(listener);
}

export function onTabMergeBack(listener: TabMergeBackListener): () => void {
  mergeBackListeners.add(listener);
  void ensureListening();
  return () => mergeBackListeners.delete(listener);
}

export function onSessionFullSync(listener: SessionFullSyncListener): () => void {
  fullSyncListeners.add(listener);
  void ensureListening();
  return () => fullSyncListeners.delete(listener);
}

export function onWindowClosed(listener: WindowClosedListener): () => void {
  windowClosedListeners.add(listener);
  void ensureListening();
  return () => windowClosedListeners.delete(listener);
}

export function onTabDropRequested(listener: TabDropRequestedListener): () => void {
  dropRequestedListeners.add(listener);
  void ensureListening();
  return () => dropRequestedListeners.delete(listener);
}

// ──────── 测试 / 资源回收 ────────

/** 单测在每个 case 后重置 service 状态。 */
export function __resetTabWindowServiceForTests(): void {
  if (unlistenTearOff) {
    try { unlistenTearOff(); } catch { /* ignore */ }
    unlistenTearOff = null;
  }
  if (unlistenMergeBack) {
    try { unlistenMergeBack(); } catch { /* ignore */ }
    unlistenMergeBack = null;
  }
  if (unlistenFullSync) {
    try { unlistenFullSync(); } catch { /* ignore */ }
    unlistenFullSync = null;
  }
  if (unlistenWindowClosed) {
    try { unlistenWindowClosed(); } catch { /* ignore */ }
    unlistenWindowClosed = null;
  }
  if (unlistenDropRequested) {
    try { unlistenDropRequested(); } catch { /* ignore */ }
    unlistenDropRequested = null;
  }
  tearOffListeners = new Set();
  mergeBackListeners = new Set();
  fullSyncListeners = new Set();
  windowClosedListeners = new Set();
  dropRequestedListeners = new Set();
  listenPromise = null;
}
