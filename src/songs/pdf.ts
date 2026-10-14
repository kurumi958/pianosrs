import type { PDFDocumentProxy } from 'pdfjs-dist';

/** pdf.js is large, so it loads the first time a PDF is opened. */
let pdfjs: Promise<typeof import('pdfjs-dist')> | null = null;
const loadPdfjs = () =>
  (pdfjs ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  }));

export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const lib = await loadPdfjs();
  // pdf.js takes ownership of the buffer it's given, so hand it a copy.
  return lib.getDocument({ data: bytes.slice() }).promise;
}

/**
 * Draw one page (from 1) as a PNG, its longer side `size` pixels. Claude reads images up to about 1568 pixels on
 * the long side, so that's the default for transcription.
 */
export async function renderPage(doc: PDFDocumentProxy, page: number, size = 1568): Promise<string> {
  const p = await doc.getPage(page);
  const base = p.getViewport({ scale: 1 });
  const viewport = p.getViewport({ scale: size / Math.max(base.width, base.height) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d')!;
  // White paper behind transparent PDFs, so the notes stay readable.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await p.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/png');
}

/** A region of a page, in fractions of its width and height (0–1). */
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Draw part of a page (from 1), redrawn from the PDF rather than enlarged from an image, its longer side `size`
 * pixels. `maxScale` caps the magnification relative to the page's own size (a scan has no more detail to give).
 */
export async function renderRegion(doc: PDFDocumentProxy, page: number, r: Region, size = 1568, maxScale = 8): Promise<string> {
  const p = await doc.getPage(page);
  const base = p.getViewport({ scale: 1 });
  const w = r.width * base.width;
  const h = r.height * base.height;
  const scale = Math.min(size / Math.max(w, h), maxScale);
  const viewport = p.getViewport({ scale, offsetX: -r.x * base.width * scale, offsetY: -r.y * base.height * scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await p.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/png');
}

/** Width and height of a PNG data URL, read from its header. */
export function pngSize(dataUrl: string): { width: number; height: number } {
  const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1, dataUrl.indexOf(',') + 33)), (c) => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export const isPdf = (bytes: Uint8Array) => bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
