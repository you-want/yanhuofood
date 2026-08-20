import { expect, test } from "@playwright/test";

test("附近搜索 API 拒绝非法坐标和过大半径", async ({ request }) => {
  const response = await request.post("/api/nearby/search", {
    data: { latitude: 200, longitude: 121, radius_m: 99_999 },
  });
  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.error.code).toBe("INVALID_REQUEST");
  expect(body.error.issues.length).toBeGreaterThan(0);
});

test("未配置地图 Key 时返回明确错误", async ({ request }) => {
  const response = await request.post("/api/nearby/search", {
    data: {
      latitude: 31.2304,
      longitude: 121.4737,
      coordinate_system: "amap",
      radius_m: 1_500,
    },
  });
  test.skip(response.status() !== 503, "当前 Next.js 服务已配置真实地图 Key");
  expect(response.status()).toBe(503);
  const body = await response.json();
  expect(body.error.code).toBe("MAP_PROVIDER_NOT_CONFIGURED");
});

test("地图状态 API 只返回服务端是否配置，不泄露 Key", async ({ request }) => {
  const response = await request.get("/api/nearby/status");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(typeof body.server.configured).toBe("boolean");
  expect(typeof body.server.publicQuota.enabled).toBe("boolean");
  expect(typeof body.server.publicQuota.dailyLimit).toBe("number");
  expect(typeof body.server.publicQuota.timeZone).toBe("string");
  expect(typeof body.server.publicQuota.available).toBe("boolean");
  expect(
    body.server.publicQuota.used === null ||
      typeof body.server.publicQuota.used === "number"
  ).toBe(true);
  expect(
    body.server.publicQuota.remaining === null ||
      typeof body.server.publicQuota.remaining === "number"
  ).toBe(true);
  expect(body.localKeySupported).toBe(true);
  expect(JSON.stringify(body)).not.toContain("AMAP_WEB_SERVICE_KEY");
});

test("逆地理编码 API 拒绝非法坐标", async ({ request }) => {
  const response = await request.post("/api/nearby/reverse-geocode", {
    data: {
      latitude: 91,
      longitude: 181,
      coordinate_system: "gps",
    },
  });
  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.error.code).toBe("INVALID_REQUEST");
  expect(body.error.issues.length).toBeGreaterThan(0);
});
