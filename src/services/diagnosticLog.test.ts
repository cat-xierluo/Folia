import { describe, expect, it } from 'vitest';
import { createDiagnosticLog, DIAGNOSTIC_EVENT_LIMIT, DIAGNOSTIC_ID_LIMIT } from './diagnosticLog';

describe('local diagnostic privacy and retention', () => {
  it('constructs only allowlisted fields, anonymizes identities and rejects raw string values', () => {
    const log = createDiagnosticLog();
    const sensitive = '/synthetic/private/client-case.md token=SECRET # Confidential title and body';
    log.record('read-start', { tabId: sensitive, request: 1, mode: 'source', path: sensitive, content: sensitive, error: new Error(sensitive) } as Parameters<typeof log.record>[1]);
    log.record('read-complete', { tabId: sensitive, request: 1 });
    log.record(sensitive as 'read-error');
    log.record('read-error', { request: sensitive, mode: sensitive } as unknown as Parameters<typeof log.record>[1]);
    const snapshot = log.snapshot();
    expect(snapshot.events).toHaveLength(3);
    expect(snapshot.events[0].tab).toBe(snapshot.events[1].tab);
    expect(JSON.stringify(snapshot)).not.toContain(sensitive);
    expect(snapshot.events[2]).not.toHaveProperty('request');
    expect(snapshot.events[2]).not.toHaveProperty('mode');
    expect(Object.keys(snapshot.events[0]).sort()).toEqual(['elapsedMs', 'event', 'mode', 'request', 'seq', 'tab']);
  });

  // ISS-227：update-check 事件只接受白名单终态枚举，不落原始错误文本。
  it('records update-check outcomes from the enum only and drops raw payloads', () => {
    const log = createDiagnosticLog();
    const rawMessage = 'error sending request for url https://example.invalid/latest.json';
    log.record('update-check', { outcome: 'error-retrying' });
    log.record('update-check', { outcome: 'error-final' });
    log.record('update-check', { outcome: 'available' });
    log.record('update-check', { outcome: 'nonsense' } as Parameters<typeof log.record>[1]);
    log.record('update-check', { outcome: rawMessage } as unknown as Parameters<typeof log.record>[1]);
    const events = log.snapshot().events;
    expect(events).toHaveLength(3);
    expect(events.map((event) => event.outcome)).toEqual(['error-retrying', 'error-final', 'available']);
    expect(JSON.stringify(log.snapshot())).not.toContain(rawMessage);
    expect(events[3]).toBeUndefined();
  });

  it('bounds events and alias storage, counts dropped events and returns independent snapshots', () => {
    const log = createDiagnosticLog();
    for (let i = 0; i < 1200; i++) log.record('tab-active', { tabId: `tab-${i}` });
    const snapshot = log.snapshot();
    expect(snapshot.events).toHaveLength(DIAGNOSTIC_EVENT_LIMIT);
    expect(snapshot.dropped).toBe(700);
    expect(snapshot.retention.retainedAliases).toBe(DIAGNOSTIC_ID_LIMIT);
    expect(snapshot.events[0].seq).toBe(701);
    snapshot.events.length = 0;
    expect(log.snapshot().events).toHaveLength(DIAGNOSTIC_EVENT_LIMIT);
    expect(JSON.stringify(log.snapshot()).length).toBeLessThan(128 * 1024);
    log.clear();
    expect(log.snapshot().events).toEqual([]);
    expect(log.snapshot().retention.retainedAliases).toBe(0);
    log.record('tab-active', { tabId: 'tab-0' });
    expect(log.snapshot().events[0].tab).toBe(1201);
  });

  it('uses session-local numbering with ordered request correlation', () => {
    const log = createDiagnosticLog();
    const a = log.nextRequest();
    const b = log.nextRequest();
    log.record('read-start', { request: a });
    log.record('read-start', { request: b });
    log.record('read-complete', { request: b });
    log.record('read-complete', { request: a });
    expect(log.snapshot().events.map((entry) => entry.request)).toEqual([a, b, b, a]);
    expect(log.snapshot().events.map((entry) => entry.seq)).toEqual([1, 2, 3, 4]);
    expect(createDiagnosticLog().nextRequest()).toBe(1);
  });
});
