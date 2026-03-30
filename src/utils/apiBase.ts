/**
 * Returns the base URL for API calls.
 * - In web/dev mode: empty string (relative URLs like /api/compile)
 * - In Electron production: http://127.0.0.1:<port> (local API server)
 */
export function getApiBase(): string {
  const port = (window as Record<string, unknown>).__DSPLAB_API_PORT__;
  if (typeof port === 'number') {
    return `http://127.0.0.1:${port}`;
  }
  return '';
}

export function apiUrl(path: string): string {
  return `${getApiBase()}${path}`;
}
