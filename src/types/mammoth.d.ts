declare module 'mammoth' {
  interface Result {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }

  interface ConvertOptions {
    arrayBuffer?: ArrayBuffer;
    path?: string;
  }

  export function convertToHtml(options: ConvertOptions): Promise<Result>;
  export function convertToMarkdown(options: ConvertOptions): Promise<Result>;
  export function extractRawText(options: ConvertOptions): Promise<Result>;
}
