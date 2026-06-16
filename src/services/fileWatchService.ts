// 文件外部修改监听服务（ISS-162）。
//
// 设计目标：复用 ISS-043 `pathInvalid` 概念，监听后端 `notify` 上报的
// `watch:changed` / `watch:error` 事件，提示用户「文件已在外部修改」并提供
// 重新加载 / 保留本地两种处理路径。当前阶段不主动覆盖本地编辑（避免误丢），
// 仅标记状态 + 暴露回调；后续 `reloading` / `pathInvalid` UI 通道沿用
// AppLayout 的 StatusBar 三态提示。
//
// 事件来源：Rust `watch_path` command（src-tauri/src/lib.rs）。
// 错误事件（`watch:error`）只 console.warn，不抛——监听失败不该阻塞 UI。

import type { UnlistenFn } from '@tauri-apps/api/event';

export type WatchEventKind = 'modify' | 'create' | 'remove';

export interface WatchChangedEvent {
  /** 触发事件的文件 / 目录绝对路径。 */
  path: string;
  /** 事件类型：modify / create / remove。 */
  kind: WatchEventKind;
}

export interface WatchErrorEvent {
  /** 触发错误的监听根路径。 */
  path: string;
  /** 后端错误信息（notify crate Error 转字符串）。 */
  message: string;
}

export type WatchChangedListener = (event: WatchChangedEvent) => void;
export type WatchErrorListener = (event: WatchErrorEvent) => void;

interface TauriEventModule {
  listen: (
    event: string,
    handler: (event: { payload: unknown }) => void,
  ) => Promise<UnlistenFn>;
}

let unlistenChanged: UnlistenFn | null = null;
let unlistenError: UnlistenFn | null = null;
let changedListeners: Set<WatchChangedListener> = new Set();
let errorListeners: Set<WatchErrorListener> = new Set();
let listenPromise: Promise<void> | null = null;

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function notifyChanged(event: WatchChangedEvent): void {
  for (const listener of changedListeners) {
    try {
      listener(event);
    } catch (error) {
      console.error('fileWatchService: changed listener threw', error);
    }
  }
}

function notifyError(event: WatchErrorEvent): void {
  for (const listener of errorListeners) {
    try {
      listener(event);
    } catch (error) {
      console.error('fileWatchService: error listener threw', error);
    }
  }
}

function isWatchChangedEvent(payload: unknown): payload is WatchChangedEvent {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = payload as { path?: unknown; kind?: unknown };
  if (typeof candidate.path !== 'string') return false;
  return candidate.kind === 'modify'
    || candidate.kind === 'create'
    || candidate.kind === 'remove';
}

function isWatchErrorEvent(payload: unknown): payload is WatchErrorEvent {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = payload as { path?: unknown; message?: unknown };
  return typeof candidate.path === 'string' && typeof candidate.message === 'string';
}

/**
 * 启动 Tauri 事件订阅（懒加载 + 幂等）。
 *
 * 在非 Tauri 运行时（浏览器 / 测试）下直接返回，调用方无需做平台判断。
 */
async function ensureListening(): Promise<void> {
  if (unlistenChanged && unlistenError) return;
  if (!isTauriRuntime()) return;
  if (listenPromise) return listenPromise;

  listenPromise = (async () => {
    const { listen }: TauriEventModule = await import('@tauri-apps/api/event');
    unlistenChanged = await listen('watch:changed', (event) => {
      if (isWatchChangedEvent(event.payload)) {
        notifyChanged(event.payload);
      } else {
        console.warn('fileWatchService: ignored malformed watch:changed payload', event.payload);
      }
    });
    unlistenError = await listen('watch:error', (event) => {
      if (isWatchErrorEvent(event.payload)) {
        notifyError(event.payload);
      } else {
        console.warn('fileWatchService: ignored malformed watch:error payload', event.payload);
      }
    });
  })().catch((error) => {
    // 订阅失败（IPC 不可用 / 没注册 capabilities）时只 warn，不阻塞调用方。
    console.warn('fileWatchService: failed to attach listeners', error);
    unlistenChanged = null;
    unlistenError = null;
  }).finally(() => {
    listenPromise = null;
  });

  return listenPromise;
}

/**
 * 调用后端 `watch_path` 命令监听一条路径（文件或目录）。
 *
 * 后端会做黑名单 / 相对路径 / 存在性校验并拒绝不合法输入；本函数不重复
 * 校验，把错误透传给调用方，由 UI 决定是否提示。
 */
async function watchPath(path: string): Promise<void> {
  if (!isTauriRuntime()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('watch_path', { path });
}

/**
 * 调用后端 `unwatch_path` 命令取消监听。
 *
 * 对未注册 / 失效路径后端返回 Ok(())（幂等），所以这里吞掉所有错误：
 * 关 tab 时无脑 unwatch 是安全动作。
 */
async function unwatchPath(path: string): Promise<void> {
  if (!isTauriRuntime()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  try {
    await invoke('unwatch_path', { path });
  } catch (error) {
    console.warn('fileWatchService: unwatch_path failed', path, error);
  }
}

/**
 * 注册 `watch:changed` 监听器；返回反注册函数。
 *
 * 首次注册时自动建立 Tauri 事件订阅。
 */
export function onWatchChanged(listener: WatchChangedListener): () => void {
  changedListeners.add(listener);
  void ensureListening();
  return () => {
    changedListeners.delete(listener);
  };
}

/**
 * 注册 `watch:error` 监听器；返回反注册函数。
 */
export function onWatchError(listener: WatchErrorListener): () => void {
  errorListeners.add(listener);
  void ensureListening();
  return () => {
    errorListeners.delete(listener);
  };
}

/**
 * 顶层 API：把单条路径加入监听（重复调用去重）。
 */
export function watchFile(path: string): Promise<void> {
  return watchPath(path);
}

/**
 * 顶层 API：取消对单条路径的监听。
 */
export function unwatchFile(path: string): Promise<void> {
  return unwatchPath(path);
}

/**
 * 测试 / 资源回收：解绑全部 Tauri 事件订阅并清空监听器。
 * 正常使用无需调用；提供该入口方便单测在每个 case 后重置。
 */
export function __resetFileWatchServiceForTests(): void {
  if (unlistenChanged) {
    try {
      unlistenChanged();
    } catch {
      // ignore
    }
    unlistenChanged = null;
  }
  if (unlistenError) {
    try {
      unlistenError();
    } catch {
      // ignore
    }
    unlistenError = null;
  }
  changedListeners = new Set();
  errorListeners = new Set();
  listenPromise = null;
}
