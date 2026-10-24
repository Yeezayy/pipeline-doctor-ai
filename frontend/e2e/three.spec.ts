import { expect, test } from "@playwright/test";

test.use({
  launchOptions: {
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  },
  reducedMotion: "reduce",
});

test("real WebGL scene renders, supports stage selection and motion controls", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.locator(".landing-showcase").scrollIntoViewIfNeeded();
  const canvas = page.locator(".landing-3d-stage canvas");
  await expect(canvas).toBeVisible({ timeout: 20000 });
  await expect(canvas).toHaveAttribute("data-scene-ready", "true", {
    timeout: 20000,
  });
  const version = await canvas.evaluate((element) =>
    (element as HTMLCanvasElement).getContext("webgl2")?.getParameter(0x1f02),
  );
  expect(version).toContain("WebGL 2");
  await expect(
    page.getByText("Reduced motion enabled · select a stage to explore"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Select deploy stage" }).click();
  await expect(page.locator(".landing-stage-description")).toContainText(
    "Deployment stays blocked",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Pause 3D animation" }).click();
  await expect(
    page.getByRole("button", { name: "Play 3D animation" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("without WebGL the illustration and keyboard controls still work", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      value: function (this: HTMLCanvasElement, type: string) {
        return type === "webgl2" ? null : original.call(this, type as "2d");
      },
    });
  });
  await page.goto("/");
  await page.locator(".landing-showcase").scrollIntoViewIfNeeded();
  await expect(
    page.getByText(
      "WebGL unavailable · the pipeline remains explorable without 3D",
    ),
  ).toBeVisible();
  const checkout = page.getByRole("button", { name: "Select checkout stage" });
  await checkout.focus();
  await page.keyboard.press("Enter");
  await expect(checkout).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".landing-stage-description")).toContainText(
    "Source checked out",
  );
});
