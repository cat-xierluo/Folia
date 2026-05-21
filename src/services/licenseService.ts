export type LicenseStatus = 'inactive' | 'active';
export type LicensePlan = 'standard' | 'beta';

export interface LicenseState {
  status: LicenseStatus;
  plan: LicensePlan;
  codeLabel: string;
  activatedAt: string | null;
  expiresAt: string | null;
  customExportPresetLimit: number;
  customHtmlExportPresetLimit: number;
}

export type LicenseActivationResult =
  | { ok: true; license: LicenseState; message: string }
  | { ok: false; license: LicenseState; message: string };

export const STANDARD_PRESET_SLOT_LIMIT = 2;

export const DEFAULT_LICENSE_STATE: LicenseState = {
  status: 'inactive',
  plan: 'standard',
  codeLabel: '',
  activatedAt: null,
  expiresAt: null,
  customExportPresetLimit: STANDARD_PRESET_SLOT_LIMIT,
  customHtmlExportPresetLimit: STANDARD_PRESET_SLOT_LIMIT,
};

const LOCAL_BETA_CODES: Record<string, Pick<LicenseState, 'customExportPresetLimit' | 'customHtmlExportPresetLimit' | 'expiresAt'>> = {
  'FOLIA-BETA-2026': {
    customExportPresetLimit: 8,
    customHtmlExportPresetLimit: 8,
    expiresAt: null,
  },
};

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const timestamp = Date.parse(expiresAt);
  return Number.isFinite(timestamp) && timestamp < Date.now();
}

export function normalizeLicenseState(value: unknown): LicenseState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_LICENSE_STATE;
  }

  const candidate = value as Partial<LicenseState>;
  if (candidate.status !== 'active' || candidate.plan !== 'beta' || isExpired(candidate.expiresAt ?? null)) {
    return DEFAULT_LICENSE_STATE;
  }
  const codeLabel = typeof candidate.codeLabel === 'string' ? candidate.codeLabel.trim().toUpperCase() : '';
  const beta = LOCAL_BETA_CODES[codeLabel];
  if (!beta) {
    return DEFAULT_LICENSE_STATE;
  }

  return {
    status: 'active',
    plan: 'beta',
    codeLabel,
    activatedAt: typeof candidate.activatedAt === 'string' ? candidate.activatedAt : null,
    expiresAt: beta.expiresAt,
    customExportPresetLimit: beta.customExportPresetLimit,
    customHtmlExportPresetLimit: beta.customHtmlExportPresetLimit,
  };
}

export function activateBetaLicenseCode(rawCode: string, now: Date = new Date()): LicenseActivationResult {
  const code = rawCode.trim().toUpperCase();
  const beta = LOCAL_BETA_CODES[code];

  if (!beta) {
    return {
      ok: false,
      license: DEFAULT_LICENSE_STATE,
      message: '内测码无效，请检查后重新输入。',
    };
  }

  const license: LicenseState = {
    status: 'active',
    plan: 'beta',
    codeLabel: code,
    activatedAt: now.toISOString(),
    expiresAt: beta.expiresAt,
    customExportPresetLimit: beta.customExportPresetLimit,
    customHtmlExportPresetLimit: beta.customHtmlExportPresetLimit,
  };

  return {
    ok: true,
    license,
    message: '内测授权已启用。',
  };
}

export function getLicenseCustomExportPresetLimit(license: LicenseState): number {
  return normalizeLicenseState(license).customExportPresetLimit;
}

export function getLicenseCustomHtmlExportPresetLimit(license: LicenseState): number {
  return normalizeLicenseState(license).customHtmlExportPresetLimit;
}
