import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LICENSE_STATE,
  STANDARD_PRESET_SLOT_LIMIT,
  activateBetaLicenseCode,
  getLicenseCustomExportPresetLimit,
  getLicenseCustomHtmlExportPresetLimit,
  getLicenseCustomThemePresetLimit,
  normalizeLicenseState,
  type LicenseState,
} from './licenseService';

describe('licenseService — customThemePresetLimit (ISS-191)', () => {
  it('standard limit is 2 by default', () => {
    expect(STANDARD_PRESET_SLOT_LIMIT).toBe(2);
    expect(DEFAULT_LICENSE_STATE.customThemePresetLimit).toBe(2);
    expect(getLicenseCustomThemePresetLimit(DEFAULT_LICENSE_STATE)).toBe(2);
  });

  it('beta YWXLAW raises the custom theme slot limit to 8', () => {
    const result = activateBetaLicenseCode('ywxlaw');

    expect(result.ok).toBe(true);
    expect(result.license.customThemePresetLimit).toBe(8);
    expect(result.license.customExportPresetLimit).toBe(8);
    expect(result.license.customHtmlExportPresetLimit).toBe(8);
    expect(getLicenseCustomThemePresetLimit(result.license)).toBe(8);
  });

  it('invalid codes keep standard limits and return error result', () => {
    const result = activateBetaLicenseCode('bad-code');

    expect(result.ok).toBe(false);
    expect(result.license).toBe(DEFAULT_LICENSE_STATE);
    expect(getLicenseCustomThemePresetLimit(result.license)).toBe(2);
  });

  it('normalizes tampered beta license state back to known limits (8)', () => {
    const tampered: LicenseState = {
      status: 'active',
      plan: 'beta',
      codeLabel: 'YWXLAW',
      activatedAt: '2026-08-14T00:00:00.000Z',
      expiresAt: null,
      customExportPresetLimit: 999,
      customHtmlExportPresetLimit: 999,
      customThemePresetLimit: 999,
    };

    const normalized = normalizeLicenseState(tampered);
    expect(normalized.customThemePresetLimit).toBe(8);
    expect(getLicenseCustomThemePresetLimit(tampered)).toBe(8);
  });

  it('rejects persisted active license with unknown code labels', () => {
    const tampered: LicenseState = {
      status: 'active',
      plan: 'beta',
      codeLabel: 'UNKNOWN',
      activatedAt: '2026-08-14T00:00:00.000Z',
      expiresAt: null,
      customExportPresetLimit: 8,
      customHtmlExportPresetLimit: 8,
      customThemePresetLimit: 8,
    };

    expect(normalizeLicenseState(tampered)).toBe(DEFAULT_LICENSE_STATE);
    expect(getLicenseCustomExportPresetLimit(tampered)).toBe(2);
    expect(getLicenseCustomHtmlExportPresetLimit(tampered)).toBe(2);
    expect(getLicenseCustomThemePresetLimit(tampered)).toBe(2);
  });

  it('keeps the three slot limits aligned across custom export, html and theme', () => {
    const license = DEFAULT_LICENSE_STATE;
    expect(getLicenseCustomExportPresetLimit(license)).toBe(2);
    expect(getLicenseCustomHtmlExportPresetLimit(license)).toBe(2);
    expect(getLicenseCustomThemePresetLimit(license)).toBe(2);

    const activated = activateBetaLicenseCode('YWXLAW').license;
    expect(getLicenseCustomExportPresetLimit(activated)).toBe(8);
    expect(getLicenseCustomHtmlExportPresetLimit(activated)).toBe(8);
    expect(getLicenseCustomThemePresetLimit(activated)).toBe(8);
  });
});