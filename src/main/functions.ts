import { win } from './window';

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runJs(code: string) {
  // return code;
  return win.webContents.executeJavaScript(code);
}
