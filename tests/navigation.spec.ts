import { expect, test } from "@playwright/test";

test("全局导航在窄屏和宽屏都能进入菜单页", async ({ page }) => {
  await page.goto("/");

  const navigation = page.getByRole("navigation", { name: "全局导航" });
  await expect(navigation).toBeVisible();
  const menuLink = navigation.getByRole("link", { name: "菜单", exact: true });
  await expect(menuLink).toBeVisible();
  await menuLink.click();

  await expect(page).toHaveURL(/\/menus$/);
});
