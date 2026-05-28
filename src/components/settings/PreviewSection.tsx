import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  getNativeWordPreviewStatus,
  openLibreOfficeDownloadPage,
  type NativeWordPreviewStatus,
} from '../../services/nativeWordPreviewService';
import { getSettings, updateSettings, type AppSettings } from '../../services/settingsService';
import type { PreviewFontFamily, PreviewWidth } from '../../services/settingsService';

const FONT_SIZES = [13, 14, 15, 16, 18];
const LINE_HEIGHTS = [1.5, 1.6, 1.7, 1.8, 2.0, 2.5];
const PREVIEW_FONTS: PreviewFontFamily[] = ['Iowan Old Style', 'Georgia', 'System Default'];
const PREVIEW_WIDTHS: PreviewWidth[] = [640, 680, 720, 800];

export function PreviewSection() {
  const [settings, setSettings] = useState(() => getSettings());
  const [nativePreviewStatus, setNativePreviewStatus] = useState<NativeWordPreviewStatus | null>(null);

  const handleChange = (patch: Partial<AppSettings>) => {
    updateSettings(patch);
    setSettings(getSettings());
  };

  useEffect(() => {
    void getNativeWordPreviewStatus().then(setNativePreviewStatus);
  }, []);

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">预览</h3>

      <div className="settings-row">
        <div>
          <div className="settings-label">预览字体</div>
        </div>
        <select
          className="settings-select"
          value={settings.previewFontFamily}
          onChange={(e) => handleChange({ previewFontFamily: e.target.value as PreviewFontFamily })}
        >
          {PREVIEW_FONTS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">预览宽度</div>
        </div>
        <select
          className="settings-select"
          value={settings.previewWidth}
          onChange={(e) => handleChange({ previewWidth: Number(e.target.value) as PreviewWidth })}
        >
          {PREVIEW_WIDTHS.map((w) => (
            <option key={w} value={w}>{w}px</option>
          ))}
        </select>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">正文字号</div>
        </div>
        <select
          className="settings-select"
          value={settings.previewFontSize}
          onChange={(e) => handleChange({ previewFontSize: Number(e.target.value) })}
        >
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>{s}px</option>
          ))}
        </select>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">行距</div>
        </div>
        <select
          className="settings-select"
          value={settings.previewLineHeight}
          onChange={(e) => handleChange({ previewLineHeight: Number(e.target.value) })}
        >
          {LINE_HEIGHTS.map((lh) => (
            <option key={lh} value={lh}>{lh}</option>
          ))}
        </select>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">Word 真实预览</div>
          <div className="settings-desc">
            {nativePreviewStatus?.available
              ? `LibreOffice 已启用${nativePreviewStatus.path ? ` · ${nativePreviewStatus.path}` : ''}`
              : '未检测到 LibreOffice，导出产物将使用 HTML 回退预览'}
          </div>
        </div>
        <button
          type="button"
          className="settings-action-button"
          onClick={() => void openLibreOfficeDownloadPage()}
        >
          <Download size={14} />
          获取 LibreOffice
        </button>
      </div>
    </div>
  );
}
