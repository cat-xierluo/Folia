import { sanitizeHtml } from './sanitizeService';

export async function convertDocxToHtml(arrayBuffer: ArrayBuffer): Promise<string> {
  const { default: mammoth } = await import('mammoth');
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return sanitizeHtml(result.value);
}
