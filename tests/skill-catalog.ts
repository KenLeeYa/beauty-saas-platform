import {expect, type Locator, type Page} from "@playwright/test";

export async function waitForSkillCatalog(root: Locator | Page) {
  for (const browser of await root.locator("[data-skill-browser]").all()) {
    await expect(browser.locator("nav")).toBeVisible();
  }
}
