import mammoth from 'mammoth';

export async function convertDocxToHtml(arrayBuffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return result.value;
}
