import type { OpenedFile } from '../types/document';

export const DIAGNOSTIC_EVENT_LIMIT = 500;
export const DIAGNOSTIC_ID_LIMIT = 128;
const EVENTS = ['tab-open', 'file-result', 'file-applied', 'tab-active', 'read-start', 'read-complete', 'read-error', 'editor-source', 'editor-ready', 'editor-input', 'editor-error', 'save-start', 'save-complete', 'save-cancelled', 'save-error', 'io-error', 'export-complete', 'export-error'] as const;
type EventName = typeof EVENTS[number];
type Details = { tabId?: string; request?: number; mode?: 'source' | 'wysiwyg' };
type Event = { seq: number; elapsedMs: number; event: EventName; tab?: number; request?: number; mode?: 'source' | 'wysiwyg' };

/** 白名单构造：从不序列化调用方对象、原始错误或文件信息。窗口内存上限 500 条，退出即清。 */
export function createDiagnosticLog() {
  const started = performance.now();
  const entries: Event[] = [];
  const aliases = new Map<string, number>();
  let seq = 0;
  let nextAlias = 0;
  let request = 0;
  let dropped = 0;
  const record = (event: EventName, details: Details = {}) => {
    if (!EVENTS.includes(event)) return;
    const entry: Event = { seq: ++seq, elapsedMs: Math.max(0, Math.round(performance.now() - started)), event };
    if (typeof details.tabId === 'string' && details.tabId.length <= 128) {
      if (!aliases.has(details.tabId)) {
        if (aliases.size >= DIAGNOSTIC_ID_LIMIT) aliases.delete(aliases.keys().next().value!);
        aliases.set(details.tabId, ++nextAlias);
      }
      entry.tab = aliases.get(details.tabId);
    }
    if (Number.isSafeInteger(details.request) && details.request! > 0) entry.request = details.request;
    if (details.mode === 'source' || details.mode === 'wysiwyg') entry.mode = details.mode;
    entries.push(entry);
    if (entries.length > DIAGNOSTIC_EVENT_LIMIT) { entries.shift(); dropped++; }
  };
  return {
    record,
    nextRequest: () => ++request,
    clear: () => { entries.length = 0; aliases.clear(); dropped = 0; },
    snapshot: () => ({ schemaVersion: 1, retention: { maxEvents: DIAGNOSTIC_EVENT_LIMIT, maxAliases: DIAGNOSTIC_ID_LIMIT, retainedAliases: aliases.size }, dropped, events: entries.map((entry) => ({ ...entry })) }),
  };
}

export const diagnosticLog = createDiagnosticLog();
const fileRequests = new WeakMap<OpenedFile, number>();
export function bindDiagnosticRequest(file: OpenedFile, request: number) { fileRequests.set(file, request); }
export function diagnosticRequestFor(file: OpenedFile) { return fileRequests.get(file); }
