import { expect, test } from "@playwright/test";

const PLACES = [
  {
    provider: "amap",
    providerPlaceId: "poi-1",
    name: "园区轻食碗",
    address: "创新路 8 号",
    location: { latitude: 31.2305, longitude: 121.4738 },
    distanceM: 260,
    categoryCode: "050100",
    categoryName: "轻食",
    rating: 4.6,
    averageCost: 32,
    openStatus: "unknown",
    openingHours: "10:00-21:00",
    dataConfidence: 0.9,
  },
  {
    provider: "amap",
    providerPlaceId: "poi-2",
    name: "老街牛肉饭",
    address: "创新路 18 号",
    location: { latitude: 31.231, longitude: 121.474 },
    distanceM: 520,
    categoryCode: "050100",
    categoryName: "中式快餐",
    rating: 4.3,
    averageCost: 26,
    openStatus: "unknown",
    dataConfidence: 0.85,
  },
];

test.beforeEach(async ({ page }) => {
  await page.route("**/api/nearby/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        server: { configured: true },
        localKeySupported: true,
      }),
    });
  });
  await page.route("**/api/nearby/geocode", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        location: {
          provider: "amap",
          name: "上海市测试园区",
          formattedAddress: "上海市测试园区",
          location: { latitude: 31.2304, longitude: 121.4737 },
          coordinateSystem: "amap",
          city: "上海市",
        },
      }),
    });
  });
  await page.route("**/api/nearby/reverse-geocode", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        location: {
          provider: "amap",
          name: "上海市浦东新区测试路88号",
          formattedAddress: "上海市浦东新区测试路88号",
          location: { latitude: 31.2305, longitude: 121.4738 },
          coordinateSystem: "amap",
          city: "上海市",
          district: "浦东新区",
        },
      }),
    });
  });
  await page.route("**/api/nearby/search", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "amap",
        places: PLACES,
        page: 1,
        pageSize: 25,
        hasMore: false,
        limitations: ["第三方数据仅供参考"],
      }),
    });
  });
});

test("可以用地址搜索、筛选并随机选择真实门店", async ({ page }) => {
  await page.goto("/nearby");
  await expect(page.getByRole("heading", { name: "附近吃什么" })).toBeVisible();
  await page.getByLabel("城市").fill("上海");
  await page.getByLabel("公司地址").fill("测试园区");
  await page.getByRole("button", { name: "解析地址并搜索" }).click();

  await expect(page.getByText("园区轻食碗", { exact: true })).toBeVisible();
  await expect(page.getByText("老街牛肉饭", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "帮我选一家" }).click();
  await expect(page.getByText("本次推荐", { exact: true }).first()).toBeVisible();
});


test("当前位置会展示逆地理编码后的详细地址、坐标系和定位精度", async ({
  page,
  context,
}) => {
  let reverseBody: Record<string, unknown> | undefined;
  let searchBody: Record<string, unknown> | undefined;

  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 31.2304,
    longitude: 121.4737,
    accuracy: 35,
  });
  await page.unroute("**/api/nearby/reverse-geocode");
  await page.route("**/api/nearby/reverse-geocode", async (route) => {
    reverseBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        location: {
          provider: "amap",
          name: "上海市浦东新区测试路88号",
          formattedAddress: "上海市浦东新区测试路88号",
          location: { latitude: 31.2305, longitude: 121.4738 },
          coordinateSystem: "amap",
          city: "上海市",
          district: "浦东新区",
        },
      }),
    });
  });
  await page.unroute("**/api/nearby/search");
  await page.route("**/api/nearby/search", async (route) => {
    searchBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "amap",
        places: PLACES,
        page: 1,
        pageSize: 25,
        hasMore: false,
        limitations: [],
      }),
    });
  });

  await page.goto("/nearby");
  await page.getByRole("button", { name: "使用当前位置" }).click();

  await expect(page.getByText("上海市浦东新区测试路88号", { exact: true })).toBeVisible();
  await expect(page.getByText("定位精度约 35 米", { exact: false })).toBeVisible();
  await expect(page.getByText("31.230500", { exact: false })).toBeVisible();
  await expect(page.getByText("121.473800", { exact: false })).toBeVisible();
  await expect(page.getByText("高德坐标", { exact: false })).toBeVisible();
  await expect(page.getByText("园区轻食碗", { exact: true })).toBeVisible();

  expect(reverseBody).toMatchObject({
    latitude: 31.2304,
    longitude: 121.4737,
    coordinate_system: "gps",
  });
  expect(searchBody).toMatchObject({
    latitude: 31.2305,
    longitude: 121.4738,
    coordinate_system: "amap",
    location_accuracy_m: 35,
  });
});

test("详细地址解析失败时保留 GPS 坐标并继续搜索", async ({ page, context }) => {
  let searchBody: Record<string, unknown> | undefined;

  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 31.2304,
    longitude: 121.4737,
    accuracy: 80,
  });
  await page.unroute("**/api/nearby/reverse-geocode");
  await page.route("**/api/nearby/reverse-geocode", async (route) => {
    await route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "MAP_PROVIDER_UPSTREAM_ERROR",
          message: "地图服务暂时不可用。",
          retryable: true,
        },
      }),
    });
  });
  await page.unroute("**/api/nearby/search");
  await page.route("**/api/nearby/search", async (route) => {
    searchBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "amap",
        places: PLACES,
        page: 1,
        pageSize: 25,
        hasMore: false,
        limitations: [],
      }),
    });
  });

  await page.goto("/nearby");
  await page.getByRole("button", { name: "使用当前位置" }).click();

  await expect(page.getByText("当前位置（详细地址解析失败）", { exact: true })).toBeVisible();
  await expect(page.getByText("详细地址解析失败", { exact: false }).last()).toBeVisible();
  await expect(page.getByText("31.230400", { exact: false })).toBeVisible();
  await expect(page.getByText("121.473700", { exact: false })).toBeVisible();
  await expect(page.getByText("浏览器 GPS", { exact: false })).toBeVisible();
  await expect(page.getByText("园区轻食碗", { exact: true })).toBeVisible();

  expect(searchBody).toMatchObject({
    latitude: 31.2304,
    longitude: 121.4737,
    coordinate_system: "gps",
    location_accuracy_m: 80,
  });
});

test("地图未配置时显示明确提示，不展示虚构门店", async ({ page }) => {
  await page.route("**/api/nearby/search", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "MAP_PROVIDER_NOT_CONFIGURED",
          message:
            "地图服务尚未配置，请先在页面填写你自己的高德 Web 服务 Key，或由站点管理员配置。",
        },
      }),
    });
  });
  await page.goto("/nearby");
  await page.getByLabel("公司地址").fill("测试园区");
  await page.getByRole("button", { name: "解析地址并搜索" }).click();
  await expect(page.getByRole("heading", { name: "地图服务尚未配置" })).toBeVisible();
  await expect(page.getByText("园区轻食碗", { exact: true })).toHaveCount(0);
});

test("可以分页加载更多附近门店", async ({ page }) => {
  await page.route("**/api/nearby/search", async (route) => {
    const requestBody = route.request().postDataJSON() as { page?: number };
    const isNextPage = requestBody.page === 2;
    const places = isNextPage
      ? [
          {
            ...PLACES[1],
            providerPlaceId: "poi-page-2",
            name: "第二页工作餐",
            distanceM: 900,
          },
        ]
      : [PLACES[0]];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "amap",
        places,
        page: isNextPage ? 2 : 1,
        pageSize: 25,
        hasMore: !isNextPage,
        limitations: [],
      }),
    });
  });

  await page.goto("/nearby");
  await page.getByLabel("公司地址").fill("测试园区");
  await page.getByRole("button", { name: "解析地址并搜索" }).click();
  await expect(page.getByText("园区轻食碗", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "加载更多附近门店" }).click();
  await expect(page.getByText("第二页工作餐", { exact: true })).toBeVisible();
});

test("站点未提供公共 Key 时可保存并使用本浏览器高德 Key", async ({ page }) => {
  const localKey = "test-user-amap-web-service-key";
  let geocodeBody: Record<string, unknown> | undefined;
  let searchBody: Record<string, unknown> | undefined;

  await page.unroute("**/api/nearby/status");
  await page.route("**/api/nearby/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        server: { configured: false },
        localKeySupported: true,
      }),
    });
  });
  await page.unroute("**/api/nearby/geocode");
  await page.route("**/api/nearby/geocode", async (route) => {
    geocodeBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        location: {
          provider: "amap",
          name: "上海市测试园区",
          formattedAddress: "上海市测试园区",
          location: { latitude: 31.2304, longitude: 121.4737 },
          coordinateSystem: "amap",
          city: "上海市",
        },
      }),
    });
  });
  await page.unroute("**/api/nearby/search");
  await page.route("**/api/nearby/search", async (route) => {
    searchBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "amap",
        places: PLACES,
        page: 1,
        pageSize: 25,
        hasMore: false,
        limitations: [],
      }),
    });
  });

  const statusResponsePromise = page.waitForResponse("**/api/nearby/status");
  await page.goto("/nearby");
  await statusResponsePromise;
  await expect(page.getByText("当前站点没有提供公共地图 Key。", { exact: false })).toBeVisible();
  await expect(page.getByText("Web 服务", { exact: true })).toBeVisible();
  await page.getByLabel("高德 Web 服务 Key").fill(localKey);
  await page.getByRole("button", { name: "保存 Key" }).click();
  await expect(page.getByText("高德 Web 服务 Key 已保存到当前浏览器", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "管理 Key" })).toBeVisible();
  await expect(page.getByLabel("高德 Web 服务 Key")).toHaveCount(0);

  const storedConfig = await page.evaluate(() =>
    window.localStorage.getItem("yanhuofood.localAmapConfig")
  );
  expect(JSON.parse(storedConfig || "null")).toEqual({
    version: 1,
    data: { enabled: true, webServiceKey: localKey },
  });

  await page.reload();
  await expect(page.getByRole("button", { name: "管理 Key" })).toBeVisible();
  await expect(page.getByLabel("高德 Web 服务 Key")).toHaveCount(0);

  await page.getByLabel("公司地址").fill("测试园区");
  await page.getByRole("button", { name: "解析地址并搜索" }).click();
  await expect(page.getByText("园区轻食碗", { exact: true })).toBeVisible();
  expect(geocodeBody?.amap_web_service_key).toBe(localKey);
  expect(searchBody?.amap_web_service_key).toBe(localKey);

  await page.getByRole("button", { name: "管理 Key" }).click();
  await page.getByRole("button", { name: "清除 Key" }).click();
  await expect(page.getByText("当前站点没有公共 Key，需要重新配置", { exact: false })).toBeVisible();
  expect(
    await page.evaluate(() => window.localStorage.getItem("yanhuofood.localAmapConfig"))
  ).toBeNull();
});

test("站点提供公共 Key 时展示当日剩余调用单位", async ({ page }) => {
  await page.unroute("**/api/nearby/status");
  await page.route("**/api/nearby/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        server: {
          configured: true,
          publicQuota: {
            enabled: true,
            dailyLimit: 150,
            used: 30,
            remaining: 120,
            timeZone: "Asia/Shanghai",
            available: true,
          },
        },
        localKeySupported: true,
      }),
    });
  });

  const statusResponsePromise = page.waitForResponse("**/api/nearby/status");
  await page.goto("/nearby");
  await statusResponsePromise;
  await expect(page.getByText(/今日公共额度剩余 120 \/ 150/)).toBeVisible();
  await expect(page.getByText(/一次完整 GPS 定位并搜索通常消耗 3 个单位/)).toBeVisible();
});

test("站点公共额度耗尽时阻止公共搜索并提示使用自己的 Key", async ({ page }) => {
  await page.unroute("**/api/nearby/status");
  await page.route("**/api/nearby/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        server: {
          configured: true,
          publicQuota: {
            enabled: true,
            dailyLimit: 150,
            used: 150,
            remaining: 0,
            timeZone: "Asia/Shanghai",
            available: true,
          },
        },
        localKeySupported: true,
      }),
    });
  });

  const statusResponsePromise = page.waitForResponse("**/api/nearby/status");
  await page.goto("/nearby");
  await statusResponsePromise;
  await expect(page.getByText("公共额度不可用", { exact: true })).toBeVisible();
  await expect(
    page.getByText("站点今天的公共地图额度已经用完。", { exact: true })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "使用当前位置" })).toBeDisabled();
  await page.getByLabel("公司地址").fill("测试园区");
  await expect(page.getByRole("button", { name: "解析地址并搜索" })).toBeDisabled();
});

test("用户自己的高德 Key 可以绕过已耗尽的站点公共额度", async ({ page }) => {
  const localKey = "test-user-key-bypasses-public-quota";
  let geocodeBody: Record<string, unknown> | undefined;

  await page.unroute("**/api/nearby/status");
  await page.route("**/api/nearby/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        server: {
          configured: true,
          publicQuota: {
            enabled: true,
            dailyLimit: 150,
            used: 150,
            remaining: 0,
            timeZone: "Asia/Shanghai",
            available: true,
          },
        },
        localKeySupported: true,
      }),
    });
  });
  await page.unroute("**/api/nearby/geocode");
  await page.route("**/api/nearby/geocode", async (route) => {
    geocodeBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        location: {
          provider: "amap",
          name: "上海市测试园区",
          formattedAddress: "上海市测试园区",
          location: { latitude: 31.2304, longitude: 121.4737 },
          coordinateSystem: "amap",
          city: "上海市",
        },
      }),
    });
  });

  const statusResponsePromise = page.waitForResponse("**/api/nearby/status");
  await page.goto("/nearby");
  await statusResponsePromise;
  await expect(page.getByText("公共额度不可用", { exact: true })).toBeVisible();
  await page.getByLabel("高德 Web 服务 Key").fill(localKey);
  await page.getByRole("button", { name: "保存 Key" }).click();
  await expect(page.getByText(/不占用站点公共额度/)).toBeVisible();

  await page.getByLabel("公司地址").fill("测试园区");
  await expect(page.getByRole("button", { name: "解析地址并搜索" })).toBeEnabled();
  await page.getByRole("button", { name: "解析地址并搜索" }).click();
  await expect(page.getByText("园区轻食碗", { exact: true })).toBeVisible();
  expect(geocodeBody?.amap_web_service_key).toBe(localKey);
});
