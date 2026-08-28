import fs from 'fs';
import path from 'path';
import type { Page } from '@playwright/test';
import { getTestFlyConfig } from '../../core/config';


export class AuthManager {
  private currentToken: string | null = null;

  /**
   * Set active authentication token in memory
   */
  public setToken(token: string): void {
    this.currentToken = token;
  }

  /**
   * Get active authentication token
   */
  public getToken(): string | null {
    return this.currentToken;
  }

  /**
   * Save browser cookies and localStorage state to disk
   */
  public async saveStorageState(page: Page, customPath?: string): Promise<string> {
    const config = getTestFlyConfig();
    const targetPath = customPath || config.auth.storageStatePath;
    const resolvedPath = path.resolve(process.cwd(), targetPath);

    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await page.context().storageState({ path: resolvedPath });
    return resolvedPath;
  }

  /**
   * Check if saved session file exists
   */
  public hasSession(customPath?: string): boolean {
    const config = getTestFlyConfig();
    const targetPath = customPath || config.auth.storageStatePath;
    const resolvedPath = path.resolve(process.cwd(), targetPath);
    return fs.existsSync(resolvedPath);
  }

  /**
   * Clear saved session file
   */
  public async clearSession(customPath?: string): Promise<void> {
    const config = getTestFlyConfig();
    const targetPath = customPath || config.auth.storageStatePath;
    const resolvedPath = path.resolve(process.cwd(), targetPath);
    if (fs.existsSync(resolvedPath)) {
      fs.unlinkSync(resolvedPath);
    }
    this.currentToken = null;
  }
}
