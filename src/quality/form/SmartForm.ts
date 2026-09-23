import { Page, Locator } from '@playwright/test';

export interface SmartFormFieldMap {
  [key: string]: string | number | boolean;
}

export class SmartForm {
  /**
   * Smartly fills form fields by resolving labels, placeholders, names, ids or testids
   */
  static async fill(page: Page, data: SmartFormFieldMap, root?: Locator): Promise<void> {
    const scope = root || page;

    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || value === null) continue;

      // Cascading smart locator: label -> placeholder -> name attr -> id -> testid
      const locator = scope
        .getByLabel(key, { exact: false })
        .or(scope.getByPlaceholder(key, { exact: false }))
        .or(scope.locator(`[name="${key}"]`))
        .or(scope.locator(`#${key}`))
        .or(scope.getByTestId(key))
        .first();

      if (typeof value === 'boolean') {
        if (value) {
          await locator.check().catch(async () => locator.click());
        } else {
          await locator.uncheck().catch(async () => locator.click());
        }
      } else {
        await locator.fill(String(value));
      }
    }
  }
}

export const fillForm = SmartForm.fill;
