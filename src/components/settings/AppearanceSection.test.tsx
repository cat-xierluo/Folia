// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AppearanceSection } from './AppearanceSection';
import {
  BUILT_IN_THEME_PRESETS,
  type BuiltInThemePresetId,
} from '../../services/themePresets';
import {
  getSettings,
  updateSettings,
  type CustomThemePreset,
} from '../../services/settingsService';

// 锁定 settingsService 中与导入/槽位相关的副作用入口；其它读写维持真实链路，
// 让单测覆盖「契约层 ↔ UI 真实集成」。
const settingsServiceMock = vi.hoisted(() => ({
  addCustomThemePreset: vi.fn(),
  removeCustomThemePreset: vi.fn(),
  setCustomThemePresetEnabled: vi.fn(),
}));

vi.mock('../../services/settingsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/settingsService')>();
  return {
    ...actual,
    addCustomThemePreset: settingsServiceMock.addCustomThemePreset,
    removeCustomThemePreset: settingsServiceMock.removeCustomThemePreset,
    setCustomThemePresetEnabled: settingsServiceMock.setCustomThemePresetEnabled,
  };
});

function makeCustomTheme(id: string, name: string): CustomThemePreset {
  return {
    id: id as CustomThemePreset['id'],
    name,
    css: `.preview-content { background: oklch(50% 0.1 200); }`,
    createdAt: '2026-08-14T00:00:00.000Z',
  };
}

function findButtonByLabel(root: HTMLElement, label: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
    .find((button) => button.getAttribute('aria-label') === label);
}

describe('AppearanceSection ISS-191 Wave 2-B', () => {
  let host: HTMLDivElement;
  let root: Root;
  let originalConfirm: typeof window.confirm;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    originalConfirm = window.confirm;
    settingsServiceMock.addCustomThemePreset.mockReset();
    settingsServiceMock.removeCustomThemePreset.mockReset();
    settingsServiceMock.setCustomThemePresetEnabled.mockReset();
    // 每次测试重置 settings 到稳定起点。
    updateSettings({
      themeId: 'builtin:light',
      customThemePresets: [],
      disabledThemePresetIds: [],
    });
  });

  afterEach(() => {
    window.confirm = originalConfirm;
    act(() => root.unmount());
    host.remove();
  });

  it('renders all 6 built-in theme cards with preview swatches', async () => {
    await act(async () => {
      root.render(<AppearanceSection />);
    });

    const cards = host.querySelectorAll('.settings-theme-card--built-in');
    expect(cards.length).toBe(BUILT_IN_THEME_PRESETS.length);
    expect(cards.length).toBe(6);
    // 每张色卡包含 bg/fg/accent 三个预览色块。
    cards.forEach((card) => {
      const swatches = card.querySelectorAll('.settings-theme-card-swatch');
      expect(swatches.length).toBe(2);
    });
  });

  it('shows license-locked row when license is inactive and routes click to onOpenLicense', async () => {
    const onOpenLicense = vi.fn();
    await act(async () => {
      root.render(<AppearanceSection onOpenLicense={onOpenLicense} />);
    });

    const lockedCard = host.querySelector('.settings-theme-card--locked');
    expect(lockedCard).toBeTruthy();

    await act(async () => {
      (lockedCard as HTMLButtonElement).click();
    });

    expect(onOpenLicense).toHaveBeenCalledTimes(1);
  });

  it('hides license-locked row when license is active', async () => {
    // 模拟激活 license：填一个 fake active 状态（normalizeLicenseState 会因未知 code 退回默认，
    // 所以直接覆盖 license 字段为 active 不会被 settingsService 接受；本测试改用
    // 直接构造 settings，避开 normalize）。
    const settings = getSettings();
    expect(settings.license.status).toBe('inactive');
    // 通过替换 license 字段后写回来模拟（normalize 在 updateSettings 会被调用）。
    updateSettings({
      license: {
        status: 'active',
        plan: 'beta',
        codeLabel: 'YWXLAW',
        activatedAt: '2026-08-14T00:00:00.000Z',
        expiresAt: null,
        customExportPresetLimit: 8,
        customHtmlExportPresetLimit: 8,
        customThemePresetLimit: 8,
      },
    });

    await act(async () => {
      root.render(<AppearanceSection />);
    });

    expect(host.querySelector('.settings-theme-card--locked')).toBeNull();
  });

  it('renders custom slot count "{count}/{limit}" using current license limits', async () => {
    await act(async () => {
      root.render(<AppearanceSection />);
    });

    // 默认 license 标准槽位 = 2
    expect(host.textContent).toMatch(/0\s*\/\s*2|0\/2/);
  });

  it('renders empty custom slots as import buttons and shows "可用" badge', async () => {
    await act(async () => {
      root.render(<AppearanceSection />);
    });

    const emptyCards = host.querySelectorAll('.settings-theme-card--empty');
    // 默认 customLimit=2，应展示 2 个空槽位
    expect(emptyCards.length).toBe(2);
    emptyCards.forEach((card) => {
      expect(card.textContent).toContain('可用');
    });
  });

  it('imports a CSS file: reads → sanitize → names → addCustomThemePreset → success message', async () => {
    settingsServiceMock.addCustomThemePreset.mockImplementation((preset) => {
      updateSettings({
        customThemePresets: [preset],
        themeId: preset.id,
      });
      return getSettings();
    });

    await act(async () => {
      root.render(<AppearanceSection />);
    });

    const fileInput = host.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).toBeTruthy();

    const file = new File(['.x { color: red; }'], 'My Theme.css', { type: 'text/css' });
    Object.defineProperty(file, 'text', {
      value: async () => '.x { color: red; }',
    });

    await act(async () => {
      // jsdom 中 file input 的 files 是只读，需要绕过。
      Object.defineProperty(fileInput!, 'files', { value: [file], configurable: true });
      fileInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // 给 microtask 一个回合让 await file.text() / sanitize / addCustomThemePreset 链路完成。
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(settingsServiceMock.addCustomThemePreset).toHaveBeenCalledTimes(1);
    const call = settingsServiceMock.addCustomThemePreset.mock.calls[0][0] as CustomThemePreset;
    expect(call.id).toBe('custom:my-theme');
    expect(call.name).toBe('My Theme');
    expect(call.css).toBe('.x { color: red; }');

    const message = host.querySelector('.settings-message');
    expect(message).toBeTruthy();
    expect(message?.classList.contains('ok')).toBe(true);
    expect(message?.textContent).toContain('My Theme');
  });

  it('同名 CSS 导入时追加 -2/-3 后缀，避免静默覆盖（review MAJOR 2）', async () => {
    // 预置已存在的 custom:my-theme，模拟重名场景。
    updateSettings({
      customThemePresets: [
        { id: 'custom:my-theme', name: 'My Theme', css: '.a{}', createdAt: '2026-08-14T00:00:00.000Z' },
      ],
      disabledThemePresetIds: [],
    });
    settingsServiceMock.addCustomThemePreset.mockImplementation((preset) => {
      updateSettings({ customThemePresets: [preset], themeId: preset.id });
      return getSettings();
    });

    await act(async () => {
      root.render(<AppearanceSection />);
    });

    const fileInput = host.querySelector<HTMLInputElement>('input[type="file"]');
    const file = new File(['.x { color: red; }'], 'My Theme.css', { type: 'text/css' });
    Object.defineProperty(file, 'text', { value: async () => '.x { color: red; }' });

    await act(async () => {
      Object.defineProperty(fileInput!, 'files', { value: [file], configurable: true });
      fileInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const call = settingsServiceMock.addCustomThemePreset.mock.calls[0][0] as CustomThemePreset;
    // 重名 → 追加 -2，name 带 " 2"，不覆盖既有 custom:my-theme。
    expect(call.id).toBe('custom:my-theme-2');
    expect(call.name).toBe('My Theme 2');
  });

  it('surfaces a sanitize-stripped warning when the imported CSS contains dangerous content', async () => {
    settingsServiceMock.addCustomThemePreset.mockImplementation((preset) => {
      updateSettings({
        customThemePresets: [preset],
        themeId: preset.id,
      });
      return getSettings();
    });

    await act(async () => {
      root.render(<AppearanceSection />);
    });

    const fileInput = host.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).toBeTruthy();

    // 含 @import 与 javascript: url；sanitize 应剥除并报告 stripped。
    const css = '@import url("evil.css");\n.a { background: url(javascript:alert(1)); }\n.ok { color: red; }';
    const file = new File([css], 'dirty.css', { type: 'text/css' });
    Object.defineProperty(file, 'text', { value: async () => css });

    await act(async () => {
      Object.defineProperty(fileInput!, 'files', { value: [file], configurable: true });
      fileInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const call = settingsServiceMock.addCustomThemePreset.mock.calls[0][0] as CustomThemePreset;
    expect(call.css).not.toContain('@import');
    expect(call.css).not.toMatch(/javascript:/i);
    expect(call.css).toContain('.ok { color: red; }');

    const message = host.querySelector('.settings-message');
    expect(message).toBeTruthy();
    expect(message?.classList.contains('warning')).toBe(true);
    expect(message?.textContent).toMatch(/已移除.*不安全内容/);
  });

  it('surfaces a license-limit error when addCustomThemePreset throws CustomThemePresetLimitError', async () => {
    const { CustomThemePresetLimitError } = await import('../../services/settingsService');
    settingsServiceMock.addCustomThemePreset.mockImplementation(() => {
      throw new CustomThemePresetLimitError();
    });

    await act(async () => {
      root.render(<AppearanceSection />);
    });

    const fileInput = host.querySelector<HTMLInputElement>('input[type="file"]');
    const file = new File(['.x { color: red; }'], 'demo.css', { type: 'text/css' });
    Object.defineProperty(file, 'text', { value: async () => '.x { color: red; }' });

    await act(async () => {
      Object.defineProperty(fileInput!, 'files', { value: [file], configurable: true });
      fileInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const message = host.querySelector('.settings-message');
    expect(message).toBeTruthy();
    expect(message?.classList.contains('error')).toBe(true);
    expect(message?.textContent).toContain('授权页面输入内测码');
  });

  it('surfaces a read error when file.text() throws', async () => {
    await act(async () => {
      root.render(<AppearanceSection />);
    });

    const fileInput = host.querySelector<HTMLInputElement>('input[type="file"]');
    const file = new File([''], 'broken.css', { type: 'text/css' });
    Object.defineProperty(file, 'text', {
      value: async () => {
        throw new Error('EACCES');
      },
    });

    await act(async () => {
      Object.defineProperty(fileInput!, 'files', { value: [file], configurable: true });
      fileInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const message = host.querySelector('.settings-message');
    expect(message?.classList.contains('error')).toBe(true);
    expect(message?.textContent).toMatch(/EACCES|无法读取/);
  });

  it('clicking toggle on a custom theme calls setCustomThemePresetEnabled with toggled value', async () => {
    const custom = makeCustomTheme('custom:paper', 'Paper');
    updateSettings({
      themeId: 'builtin:light',
      customThemePresets: [custom],
      disabledThemePresetIds: [],
    });

    await act(async () => {
      root.render(<AppearanceSection />);
    });

    const toggle = host.querySelector<HTMLButtonElement>('.settings-theme-card--custom .toggle-switch');
    expect(toggle).toBeTruthy();
    settingsServiceMock.setCustomThemePresetEnabled.mockImplementation((id, enabled) => {
      // 真实链路：保持禁用集合与 themeId 同步
      const settings = getSettings();
      const disabled = new Set(settings.disabledThemePresetIds);
      if (enabled) disabled.delete(id);
      else disabled.add(id);
      return updateSettings({ disabledThemePresetIds: Array.from(disabled), themeId: settings.themeId });
    });

    await act(async () => {
      toggle!.click();
    });

    expect(settingsServiceMock.setCustomThemePresetEnabled).toHaveBeenCalledWith('custom:paper', false);
  });

  it('clicking delete confirms via window.confirm then calls removeCustomThemePreset', async () => {
    window.confirm = vi.fn(() => true);
    const custom = makeCustomTheme('custom:paper', 'Paper');
    updateSettings({
      themeId: 'builtin:light',
      customThemePresets: [custom],
      disabledThemePresetIds: [],
    });

    await act(async () => {
      root.render(<AppearanceSection />);
    });

    const deleteBtn = findButtonByLabel(host, '删除') ?? findButtonByLabel(host, 'Delete');
    expect(deleteBtn).toBeTruthy();

    await act(async () => {
      deleteBtn!.click();
    });

    expect(window.confirm).toHaveBeenCalled();
    expect(settingsServiceMock.removeCustomThemePreset).toHaveBeenCalledWith('custom:paper');
  });

  it('selecting a built-in theme updates themeId immediately (instant preview)', async () => {
    await act(async () => {
      root.render(<AppearanceSection />);
    });

    // 选中 builtin:dark
    const darkCard = Array.from(host.querySelectorAll<HTMLButtonElement>('.settings-theme-card--built-in'))
      .find((card) => card.getAttribute('aria-label')?.includes('深色'));
    expect(darkCard).toBeTruthy();

    await act(async () => {
      darkCard!.click();
    });

    expect(getSettings().themeId).toBe<BuiltInThemePresetId>('builtin:dark');
    // 高亮态切换
    expect(darkCard!.classList.contains('active')).toBe(true);
  });
});
