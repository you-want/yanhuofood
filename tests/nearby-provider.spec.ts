import { expect, test } from "@playwright/test";
import { AmapPlaceProvider } from "@/lib/places/providers/amap";

const SEARCH_INPUT = {
  location: { latitude: 31.2304, longitude: 121.4737 },
  coordinateSystem: "amap" as const,
  radiusM: 1_500,
  page: 1,
  pageSize: 20,
};

test("高德 Provider 将异常门店列表识别为上游响应错误", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.AMAP_WEB_SERVICE_KEY;
  process.env.AMAP_WEB_SERVICE_KEY = "test-key";
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ status: "1", count: "1", pois: {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  try {
    await expect(new AmapPlaceProvider().searchNearby(SEARCH_INPUT)).rejects.toMatchObject({
      code: "MAP_PROVIDER_INVALID_RESPONSE",
      retryable: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.AMAP_WEB_SERVICE_KEY;
    else process.env.AMAP_WEB_SERVICE_KEY = originalKey;
  }
});

test("高德 Provider 在上游超时后返回可重试错误", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.AMAP_WEB_SERVICE_KEY;
  const originalTimeout = process.env.AMAP_REQUEST_TIMEOUT_MS;
  process.env.AMAP_WEB_SERVICE_KEY = "test-key";
  process.env.AMAP_REQUEST_TIMEOUT_MS = "1000";
  globalThis.fetch = async (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });
    });

  try {
    await expect(new AmapPlaceProvider().searchNearby(SEARCH_INPUT)).rejects.toMatchObject({
      code: "MAP_PROVIDER_TIMEOUT",
      retryable: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.AMAP_WEB_SERVICE_KEY;
    else process.env.AMAP_WEB_SERVICE_KEY = originalKey;
    if (originalTimeout === undefined) delete process.env.AMAP_REQUEST_TIMEOUT_MS;
    else process.env.AMAP_REQUEST_TIMEOUT_MS = originalTimeout;
  }
});

test("高德 Provider 将满页结果标记为可继续分页", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.AMAP_WEB_SERVICE_KEY;
  process.env.AMAP_WEB_SERVICE_KEY = "test-key";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        status: "1",
        count: "20",
        pois: Array.from({ length: 20 }, (_, index) => ({
          id: `poi-${index}`,
          name: `门店 ${index}`,
          location: `121.473${index % 10},31.230${index % 10}`,
          type: "餐饮服务;中餐厅",
          typecode: "050100",
          business: { rating: "4.2", cost: "30" },
        })),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  try {
    const result = await new AmapPlaceProvider().searchNearby(SEARCH_INPUT);
    expect(result.places).toHaveLength(20);
    expect(result.hasMore).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.AMAP_WEB_SERVICE_KEY;
    else process.env.AMAP_WEB_SERVICE_KEY = originalKey;
  }
});

test("高德 Provider 在不足一页时停止分页", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.AMAP_WEB_SERVICE_KEY;
  process.env.AMAP_WEB_SERVICE_KEY = "test-key";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        status: "1",
        count: "1",
        pois: [
          {
            id: "poi-1",
            name: "门店 1",
            location: "121.4737,31.2304",
            type: "餐饮服务;中餐厅",
            typecode: "050100",
            business: { rating: "4.2", cost: "30" },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  try {
    const result = await new AmapPlaceProvider().searchNearby(SEARCH_INPUT);
    expect(result.places).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.AMAP_WEB_SERVICE_KEY;
    else process.env.AMAP_WEB_SERVICE_KEY = originalKey;
  }
});

test("高德 Provider 可使用用户传入的 Key 覆盖服务端配置", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.AMAP_WEB_SERVICE_KEY;
  delete process.env.AMAP_WEB_SERVICE_KEY;
  let requestedKey: string | null = null;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requestedKey = url.searchParams.get("key");
    return new Response(JSON.stringify({ status: "1", count: "0", pois: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await new AmapPlaceProvider({ apiKey: "local-test-key" }).searchNearby(
      SEARCH_INPUT
    );
    expect(result.places).toEqual([]);
    expect(requestedKey).toBe("local-test-key");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.AMAP_WEB_SERVICE_KEY;
    else process.env.AMAP_WEB_SERVICE_KEY = originalKey;
  }
});

test("高德 Provider 优先用 POI 搜索解析公司或园区地址", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requestedUrls.push(url);
    expect(url.pathname).toBe("/v5/place/text");
    expect(url.searchParams.get("keywords")).toBe("上海张江人工智能岛");
    expect(url.searchParams.get("region")).toBe("上海市");
    expect(url.searchParams.get("city_limit")).toBe("true");
    return new Response(
      JSON.stringify({
        status: "1",
        count: "1",
        pois: [
          {
            id: "poi-company-1",
            name: "上海张江人工智能岛",
            pname: "上海市",
            cityname: "上海市",
            adname: "浦东新区",
            address: "集创路 200 号",
            location: "121.6000,31.2000",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const result = await new AmapPlaceProvider({ apiKey: "text-test-key" }).geocodeAddress({
      address: "上海张江人工智能岛",
      city: "上海市",
    });

    expect(requestedUrls).toHaveLength(1);
    expect(result).toMatchObject({
      providerPlaceId: "poi-company-1",
      name: "上海张江人工智能岛",
      formattedAddress: "上海市浦东新区集创路 200 号",
      location: { latitude: 31.2, longitude: 121.6 },
      city: "上海市",
      district: "浦东新区",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("高德 Provider 在 POI 名称未命中时回退到门牌地理编码", async () => {
  const originalFetch = globalThis.fetch;
  const requestedPaths: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requestedPaths.push(url.pathname);
    if (url.pathname === "/v5/place/text") {
      return new Response(JSON.stringify({ status: "1", count: "0", pois: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    expect(url.pathname).toBe("/v3/geocode/geo");
    expect(url.searchParams.get("address")).toBe("上海市浦东新区测试园区");
    return new Response(
      JSON.stringify({
        status: "1",
        count: "1",
        geocodes: [
          {
            id: "geo-address-1",
            formatted_address: "上海市浦东新区测试路88号",
            location: "121.4738,31.2305",
            province: "上海市",
            city: "上海市",
            district: "浦东新区",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const result = await new AmapPlaceProvider({ apiKey: "fallback-test-key" }).geocodeAddress({
      address: "上海市浦东新区测试园区",
    });

    expect(requestedPaths).toEqual(["/v5/place/text", "/v3/geocode/geo"]);
    expect(result.location).toEqual({ latitude: 31.2305, longitude: 121.4738 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("高德 Provider 会按道路和门牌号匹配详细地址候选", async () => {
  const originalFetch = globalThis.fetch;
  const requestedPaths: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requestedPaths.push(url.pathname);
    expect(url.pathname).toBe("/v5/place/text");
    return new Response(
      JSON.stringify({
        status: "1",
        count: "2",
        pois: [
          {
            name: "附近无关商铺",
            id: "poi-unrelated",
            pname: "上海市",
            cityname: "上海市",
            adname: "浦东新区",
            address: "银东路491号",
            location: "121.6335,31.2062",
          },
          {
            name: "目标公司楼宇",
            id: "poi-target",
            pname: "上海市",
            cityname: "上海市",
            adname: "浦东新区",
            address: "集创路200号",
            location: "121.6335,31.2062",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const result = await new AmapPlaceProvider({ apiKey: "address-test-key" }).geocodeAddress({
      address: "上海市浦东新区集创路200号",
    });

    expect(requestedPaths).toEqual(["/v5/place/text"]);
    expect(result).toMatchObject({
      providerPlaceId: "poi-target",
      name: "目标公司楼宇",
      formattedAddress: "上海市浦东新区集创路200号",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("高德 Provider 将无效 Key 映射为明确错误", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ status: "0", info: "INVALID_USER_KEY", infocode: "10001" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  try {
    await expect(
      new AmapPlaceProvider({ apiKey: "invalid-test-key" }).searchNearby(SEARCH_INPUT)
    ).rejects.toMatchObject({
      code: "MAP_PROVIDER_INVALID_KEY",
      retryable: false,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("高德 Provider 将额度限制映射为可重试错误", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ status: "0", info: "DAILY_QUERY_OVER_LIMIT", infocode: "10003" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  try {
    await expect(
      new AmapPlaceProvider({ apiKey: "quota-test-key" }).searchNearby(SEARCH_INPUT)
    ).rejects.toMatchObject({
      code: "MAP_PROVIDER_QUOTA_EXCEEDED",
      retryable: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("高德 Provider 可逆地理编码高德坐标", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl: URL | undefined;
  globalThis.fetch = async (input) => {
    requestedUrl = new URL(String(input));
    return new Response(
      JSON.stringify({
        status: "1",
        regeocode: {
          formatted_address: "上海市浦东新区测试路88号",
          addressComponent: {
            province: "上海市",
            city: [],
            district: "浦东新区",
          },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const result = await new AmapPlaceProvider({ apiKey: "reverse-test-key" })
      .reverseGeocodeLocation({
        location: { latitude: 31.2305, longitude: 121.4738 },
        coordinateSystem: "amap",
      });

    expect(requestedUrl?.pathname).toBe("/v3/geocode/regeo");
    expect(requestedUrl?.searchParams.get("location")).toBe("121.473800,31.230500");
    expect(result).toMatchObject({
      formattedAddress: "上海市浦东新区测试路88号",
      location: { latitude: 31.2305, longitude: 121.4738 },
      coordinateSystem: "amap",
      city: "上海市",
      district: "浦东新区",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("高德 Provider 逆地理编码 GPS 坐标前先执行坐标转换", async () => {
  const originalFetch = globalThis.fetch;
  const requestedPaths: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requestedPaths.push(url.pathname);
    if (url.pathname === "/v3/assistant/coordinate/convert") {
      expect(url.searchParams.get("coordsys")).toBe("gps");
      expect(url.searchParams.get("locations")).toBe("121.4737,31.2304");
      return new Response(JSON.stringify({ status: "1", locations: "121.4782,31.2285" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    expect(url.pathname).toBe("/v3/geocode/regeo");
    expect(url.searchParams.get("location")).toBe("121.478200,31.228500");
    return new Response(
      JSON.stringify({
        status: "1",
        regeocode: {
          formatted_address: "上海市黄浦区测试路1号",
          addressComponent: {
            province: "上海市",
            city: [],
            district: "黄浦区",
          },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const result = await new AmapPlaceProvider({ apiKey: "reverse-test-key" })
      .reverseGeocodeLocation({
        location: { latitude: 31.2304, longitude: 121.4737 },
        coordinateSystem: "gps",
      });

    expect(requestedPaths).toEqual([
      "/v3/assistant/coordinate/convert",
      "/v3/geocode/regeo",
    ]);
    expect(result.location).toEqual({ latitude: 31.2285, longitude: 121.4782 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("高德 Provider 在逆地理编码缺少地址时返回 LOCATION_NOT_FOUND", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ status: "1", regeocode: {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  try {
    await expect(
      new AmapPlaceProvider({ apiKey: "reverse-test-key" }).reverseGeocodeLocation({
        location: { latitude: 31.2304, longitude: 121.4737 },
        coordinateSystem: "amap",
      })
    ).rejects.toMatchObject({ code: "LOCATION_NOT_FOUND", retryable: false });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
