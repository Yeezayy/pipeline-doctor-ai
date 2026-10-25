import { expect, test } from "@playwright/test";

test("custom brand artwork loads on the landing and workbench under a project subpath", async ({
  page,
}) => {
  await page.goto("./");
  const landingLogos = page.locator(".landing-brand .brand-logo");
  await expect(landingLogos).toHaveCount(2);
  for (const logo of await landingLogos.all()) {
    await expect(logo).toHaveAttribute(
      "src",
      "/pipeline-doctor-ai/brand/logo.png",
    );
    await expect(logo).toBeVisible();
    expect(
      await logo.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    ).toBe(512);
  }
  await expect(
    page.getByRole("link", { name: "Pipeline Doctor home" }),
  ).toHaveCount(2);
  await page
    .getByRole("link", { name: "Explore the demo", exact: true })
    .first()
    .click();
  await expect(page.locator(".brand .brand-logo")).toBeVisible();
  await expect(page.locator(".user-avatar .brand-logo")).toBeVisible();
  await expect(page.locator(".footer-brand .brand-logo")).toBeVisible();
  for (const logo of await page.locator(".brand-logo").all()) {
    expect(
      await logo.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    ).toBe(512);
  }
});

test("favicon, touch icon and social artwork are served as local PNG assets", async ({
  page,
  request,
}) => {
  await page.goto("./");
  const icons = page.locator('link[rel="icon"], link[rel="apple-touch-icon"]');
  await expect(icons).toHaveCount(3);
  for (const icon of await icons.all()) {
    const href = await icon.getAttribute("href");
    expect(href).toMatch(/^\/pipeline-doctor-ai\//);
    const response = await request.get(href!);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
    expect((await response.body()).subarray(0, 8).toString("hex")).toBe(
      "89504e470d0a1a0a",
    );
  }
  const social = await request.get("/pipeline-doctor-ai/brand/social.png");
  expect(social.ok()).toBe(true);
  expect(social.headers()["content-type"]).toContain("image/png");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://pipeline-doctor.jordybarrere.dev/brand/social.png",
  );
});

for (const width of [320, 390, 900]) {
  test(`custom brand stays readable without horizontal overflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./");
    await expect(page.locator(".landing-header .brand-logo")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.goto("./#/settings");
    if (width < 760) {
      await page.getByRole("button", { name: "Open navigation" }).click();
    }
    await expect(
      page.getByRole("link", { name: "Pipeline Doctor workbench" }),
    ).toBeVisible();
    await expect(page.locator(".brand .brand-logo")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  });
}
