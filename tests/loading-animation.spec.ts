import { expect, test } from "@playwright/test";

test.use({ contextOptions: { reducedMotion: "reduce" } });

test("loading indicators remain animated when reduced motion is enabled", async ({ page }) => {
  await page.goto("/");

  await page.locator("body").evaluate((body) => {
    const spinner = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    spinner.setAttribute("class", "animate-spin");
    spinner.setAttribute("data-testid", "loading-spinner");
    body.appendChild(spinner);
  });

  const animation = await page.getByTestId("loading-spinner").evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      duration: styles.animationDuration,
      iterationCount: styles.animationIterationCount,
      name: styles.animationName,
    };
  });

  expect(animation.name).toBe("spin");
  expect(animation.duration).toBe("1s");
  expect(animation.iterationCount).toBe("infinite");
});
