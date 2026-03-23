import { exec } from 'node:child_process';
import { platform } from 'node:os';

/**
 * Open a URL in the user's default browser.
 * Returns true if the command was dispatched, false on error.
 */
export function openBrowser(url: string): boolean {
  try {
    const cmd = platform() === 'darwin'
      ? `open "${url}"`
      : platform() === 'win32'
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
    exec(cmd);
    return true;
  } catch {
    return false;
  }
}
