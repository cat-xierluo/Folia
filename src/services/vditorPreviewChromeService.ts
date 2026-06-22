export function removeVditorPreviewChrome(root: ParentNode): void {
  root.querySelectorAll(
    '.vditor-tooltipped, .vditor-copy, .vditor-code-copy, [data-clipboard-text]',
  ).forEach((element) => {
    element.remove();
  });
}

export function stripVditorPreviewChrome(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  removeVditorPreviewChrome(template.content);
  return template.innerHTML;
}
