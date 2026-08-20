import { expect, test } from "@playwright/test";
import { haversineDistanceM } from "@/lib/places/distance";
import { normalizeAmapPoi } from "@/lib/places/providers/amap";
import { filterNearbyPlaces } from "@/lib/domain/nearby-filters";
import { rankNearbyPlaces } from "@/lib/domain/nearby-ranking";
import { pickWeightedRecommendations } from "@/lib/domain/nearby-random";
import type { NearbyPlace } from "@/lib/places/types";

const BASE_PLACE: NearbyPlace = {
  provider: "amap",
  providerPlaceId: "base",
  name: "测试餐厅",
  address: "测试路 1 号",
  location: { latitude: 31.2304, longitude: 121.4737 },
  distanceM: 300,
  categoryName: "中式快餐",
  rating: 4.5,
  averageCost: 28,
  openStatus: "unknown",
  dataConfidence: 0.8,
};

test("Haversine 距离对相同坐标为零，并能计算城市内距离", () => {
  expect(haversineDistanceM(BASE_PLACE.location, BASE_PLACE.location)).toBe(0);
  const distance = haversineDistanceM(
    { latitude: 31.2304, longitude: 121.4737 },
    { latitude: 31.2404, longitude: 121.4737 }
  );
  expect(distance).toBeGreaterThan(1_100);
  expect(distance).toBeLessThan(1_120);
});

test("筛选会排除超预算、超距离和拉黑门店，但保留未知价格", () => {
  const places: NearbyPlace[] = [
    BASE_PLACE,
    { ...BASE_PLACE, providerPlaceId: "expensive", averageCost: 80 },
    { ...BASE_PLACE, providerPlaceId: "far", distanceM: 2_000 },
    { ...BASE_PLACE, providerPlaceId: "unknown-price", averageCost: undefined },
  ];
  const filtered = filterNearbyPlaces(
    places,
    { maxDistanceM: 1_500, maxPrice: 40 },
    [
      {
        provider: "amap",
        providerPlaceId: "base",
        value: "blocked",
        updatedAt: new Date().toISOString(),
      },
    ]
  );
  expect(filtered.map((item) => item.providerPlaceId)).toEqual(["unknown-price"]);
});

test("排序优先距离近、评分高且近期未选的门店", () => {
  const places: NearbyPlace[] = [
    BASE_PLACE,
    {
      ...BASE_PLACE,
      providerPlaceId: "better",
      name: "更近的快餐",
      distanceM: 120,
      rating: 4.8,
    },
  ];
  const ranked = rankNearbyPlaces(places, {
    filters: { maxDistanceM: 1_500, maxPrice: 40, categories: ["快餐"] },
    recentChoices: [
      {
        provider: "amap",
        providerPlaceId: "base",
        name: BASE_PLACE.name,
        selectedAt: new Date().toISOString(),
      },
    ],
  });
  expect(ranked[0].place.providerPlaceId).toBe("better");
  expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
});

test("加权随机不重复并尊重请求数量", () => {
  const ranked = Array.from({ length: 6 }, (_, index) => ({
    place: { ...BASE_PLACE, providerPlaceId: String(index), name: `门店 ${index}` },
    score: 90 - index,
    reasons: [],
    warnings: [],
  }));
  const picked = pickWeightedRecommendations(ranked, "balanced", 3, () => 0.5);
  expect(picked).toHaveLength(3);
  expect(new Set(picked.map((item) => item.place.providerPlaceId)).size).toBe(3);
});


test("高德响应标准化能处理数组地址、字符串数字和缺失业务字段", () => {
  const normalized = normalizeAmapPoi(
    {
      id: "amap-1",
      name: "示例门店",
      location: "121.4740,31.2310",
      address: ["创新路", "8 号"],
      type: "餐饮服务;中餐厅;中式快餐",
      typecode: "050100",
      cityname: [],
      adname: "浦东新区",
      business: { rating: "4.6", cost: "32", opentime_today: [] },
    },
    BASE_PLACE.location
  );
  expect(normalized).not.toBeNull();
  expect(normalized?.address).toBe("创新路 8 号");
  expect(normalized?.rating).toBe(4.6);
  expect(normalized?.averageCost).toBe(32);
  expect(normalized?.categoryName).toBe("中式快餐");
  expect(normalized?.cityName).toBeUndefined();
  expect(normalized?.openStatus).toBe("unknown");
});
