import '../styles/preview.css';

type DocxPreviewPaneProps = {
  html: string;
};

export function DocxPreviewPane({ html }: DocxPreviewPaneProps) {
  return (
    <div className="preview-shell">
      <div
        className="preview-content"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
