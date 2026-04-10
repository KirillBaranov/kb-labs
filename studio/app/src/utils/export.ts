/**
 * @module @kb-labs/studio-app/utils/export
 * Export utilities for widget data (CSV, JSON, PNG)
 */

/**
 * Export data to CSV format
 */
export function exportToCSV(
  data: unknown[],
  filename: string = 'export.csv',
  options?: {
    headers?: string[];
    delimiter?: string;
  }
): void {
  if (!data || data.length === 0) {
    console.warn('No data to export');
    return;
  }

  const delimiter = options?.delimiter || ',';
  const rows: string[] = [];

  // Get headers
  let headers: string[] = [];
  if (options?.headers && options.headers.length > 0) {
    headers = options.headers;
  } else if (data.length > 0) {
    // Auto-detect headers from first object
    const firstItem = data[0];
    if (typeof firstItem === 'object' && firstItem !== null) {
      headers = Object.keys(firstItem as Record<string, unknown>);
    }
  }

  // Add header row
  if (headers.length > 0) {
    rows.push(headers.map((h) => escapeCSVValue(h)).join(delimiter));
  }

  // Add data rows
  for (const item of data) {
    if (typeof item === 'object' && item !== null) {
      const values = headers.map((header) => {
        const value = (item as Record<string, unknown>)[header];
        return escapeCSVValue(value);
      });
      rows.push(values.join(delimiter));
    } else {
      rows.push(escapeCSVValue(item));
    }
  }

  // Create blob and download
  const csvContent = rows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}

/**
 * Export data to JSON format
 */
export function exportToJSON(
  data: unknown,
  filename: string = 'export.json',
  options?: {
    pretty?: boolean;
  }
): void {
  const jsonContent = options?.pretty
    ? JSON.stringify(data, null, 2)
    : JSON.stringify(data);

  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  downloadBlob(blob, filename);
}

/**
 * Export chart/canvas to PNG
 */
export function exportToPNG(
  element: HTMLElement | HTMLCanvasElement,
  filename: string = 'export.png',
  options?: {
    backgroundColor?: string;
    scale?: number;
  }
): void {
  let canvas: HTMLCanvasElement;

  if (element instanceof HTMLCanvasElement) {
    canvas = element;
  } else {
    // Try to find canvas inside element
    const canvasElement = element.querySelector('canvas');
    if (!canvasElement) {
      console.error('No canvas element found for PNG export');
      return;
    }
    canvas = canvasElement;
  }

  // Create a new canvas for export
  const exportCanvas = document.createElement('canvas');
  const scale = options?.scale || 2; // Higher scale for better quality
  exportCanvas.width = canvas.width * scale;
  exportCanvas.height = canvas.height * scale;

  const ctx = exportCanvas.getContext('2d');
  if (!ctx) {
    console.error('Failed to get canvas context');
    return;
  }

  // Fill background if specified
  if (options?.backgroundColor) {
    ctx.fillStyle = options.backgroundColor;
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  }

  // Draw original canvas scaled up
  ctx.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);

  // Convert to blob and download
  exportCanvas.toBlob((blob) => {
    if (blob) {
      downloadBlob(blob, filename);
    } else {
      console.error('Failed to create PNG blob');
    }
  }, 'image/png');
}

/**
 * Escape CSV value (handle commas, quotes, newlines)
 */
function escapeCSVValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);
  
  // If value contains delimiter, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Download blob as file
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate filename with timestamp
 */
export function generateFilename(prefix: string, extension: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  return `${prefix}-${timestamp}.${extension}`;
}

