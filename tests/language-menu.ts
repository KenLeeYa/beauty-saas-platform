import {expect, type Page, type Locator} from '@playwright/test';
import {isLanguagePreference} from '../src/lib/i18n/locale';

export async function chooseLanguage(root: Page | Locator, locale: string) {
  if (!isLanguagePreference(locale)) throw new Error('Unsupported test locale');
  const trigger = root.locator('[data-language-trigger]').first();
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  await root.locator(`[data-language-option="${locale}"]`).click();
  await expect(root.locator('[data-language-option][aria-disabled="true"]')).toHaveCount(0);
}
