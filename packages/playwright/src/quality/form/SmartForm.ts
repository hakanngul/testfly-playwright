import type { Locator, Page } from '@playwright/test';

/** Field name → value map for {@link FormClient.fill}. @public */
export type SmartFormFieldMap = Record<string, string | number | boolean>;

/**
 * Fills form fields found by label, placeholder, `name`, `id` or test id.
 * Exposed as the `form` fixture.
 *
 * @public
 */
export class FormClient {
  constructor(private readonly page: Page) {}

  /** Fill every field of `data`; booleans check/uncheck, everything else is typed as text. */
  async fill(data: SmartFormFieldMap, root?: Locator): Promise<void> {
    const scope: Page | Locator = root ?? this.page;
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || value === null) continue;
      const escaped = key.replace(/(["\\])/g, '\\$1');
      const field = scope
        .getByLabel(key)
        .or(scope.getByPlaceholder(key))
        .or(scope.locator(`[name="${escaped}"]`))
        .or(scope.locator(`[id="${escaped}"]`))
        .or(scope.getByTestId(key))
        .first();
      if (typeof value === 'boolean') {
        await field.setChecked(value);
      } else {
        await field.fill(String(value));
      }
    }
  }
}
