import { haversineDistanceM } from "@/lib/places/distance";
import { PlaceProviderError, type PlaceProvider } from "@/lib/places/provider";
import type {
  GeoPoint,
  GeocodeInput,
  NearbyPlace,
  NearbySearchInput,
  NearbySearchResult,
  ReverseGeocodeInput,
  ResolvedLocation,
} from "@/lib/places/types";

const AMAP_AROUND_SEARCH_URL = "https://restapi.amap.com/v5/place/around";
const AMAP_TEXT_SEARCH_URL = "https://restapi.amap.com/v5/place/text";
const AMAP_GEOCODE_URL = "https://restapi.amap.com/v3/geocode/geo";
const AMAP_REVERSE_GEOCODE_URL = "https://restapi.amap.com/v3/geocode/regeo";
const AMAP_COORDINATE_CONVERT_URL = "https://restapi.amap.com/v3/assistant/coordinate/convert";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_RESTAURANT_TYPE_CODE = "050000";
const AMAP_MAX_AROUND_RESULTS = 200;

interface AmapBaseResponse {
  status?: unknown;
  info?: unknown;
  infocode?: unknown;
}

interface AmapAroundResponse extends AmapBaseResponse {
  count?: unknown;
  pois?: unknown;
}

interface AmapTextSearchResponse extends AmapBaseResponse {
  count?: unknown;
  pois?: unknown;
}

interface AmapCoordinateResponse extends AmapBaseResponse {
  locations?: unknown;
}

interface AmapGeocodeResponse extends AmapBaseResponse {
  count?: unknown;
  geocodes?: unknown;
}

interface AmapReverseGeocodeResponse extends AmapBaseResponse {
  regeocode?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asTrimmedString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function asFlexibleString(value: unknown) {
  if (Array.isArray(value)) {
    const joined = value
      .map(asTrimmedString)
      .filter((item): item is string => Boolean(item))
      .join(" ");
    return joined || undefined;
  }
  return asTrimmedString(value);
}

function asFiniteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePoint(value: unknown): GeoPoint | null {
  const location = asTrimmedString(value);
  if (!location) return null;
  const [longitudeText, latitudeText] = location.split(",");
  const longitude = Number(longitudeText);
  const latitude = Number(latitudeText);

  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    return null;
  }

  return { latitude, longitude };
}

function parsePositiveInteger(value: unknown) {
  const number = asFiniteNumber(value);
  return number !== undefined && number >= 0 ? Math.trunc(number) : 0;
}

function looksLikeDetailedAddress(address: string) {
  // 有门牌号的输入优先走地理编码，避免把“XX路 200 号”当成关键字，
  // 被 POI 搜索返回的同名商铺或附近场所抢走第一条结果。
  return /(?:\d+\s*(?:号|弄|栋|幢|座|室|楼|单元)|(?:路|街|巷|道)\s*\d+|\d+\s+(?:road|street|avenue|ave|st)\b)/iu.test(
    address
  );
}

function normalizeAmapLocationPoi(value: unknown): ResolvedLocation | null {
  const poi = asRecord(value);
  if (!poi) return null;

  const location = parsePoint(poi.location);
  const name = asTrimmedString(poi.name);
  if (!location || !name) return null;

  const province = asFlexibleString(poi.pname);
  const city = asFlexibleString(poi.cityname);
  const district = asFlexibleString(poi.adname);
  const address = asFlexibleString(poi.address);
  const administrativeAddress = [province, city, district]
    .filter(Boolean)
    .filter((part, index, parts) => index === 0 || part !== parts[index - 1])
    .join("");
  const formattedAddress = [administrativeAddress, address]
    .filter(Boolean)
    .join("") || name;

  return {
    provider: "amap",
    providerPlaceId: asTrimmedString(poi.id),
    name,
    formattedAddress,
    location,
    coordinateSystem: "amap",
    province,
    city,
    district,
  };
}

function chooseAmapLocationPoi(candidates: ResolvedLocation[], query: string) {
  if (!candidates.length) return null;
  if (!looksLikeDetailedAddress(query)) return candidates[0];

  const normalizedQuery = query.replace(/\s+/g, "");
  const roadNames = query.match(/[^\s,，区县市省]{1,20}(?:路|街|巷|道)/gu) || [];
  const numbers = query.match(/\d+/g) || [];
  const ranked = candidates
    .map((candidate) => {
      const haystack = `${candidate.name}${candidate.formattedAddress}`.replace(/\s+/g, "");
      let score = 0;
      if (haystack.includes(normalizedQuery)) score += 100;
      for (const roadName of roadNames) {
        if (haystack.includes(roadName)) score += 8;
      }
      for (const number of numbers) {
        if (haystack.includes(number)) score += 8;
      }
      return { candidate, score };
    })
    .sort((left, right) => right.score - left.score);

  // 详细地址至少要命中道路或门牌号，否则第一条可能只是附近的无关 POI。
  return ranked[0]?.score ? ranked[0].candidate : null;
}

function calculateConfidence(place: Omit<NearbyPlace, "dataConfidence">) {
  let confidence = 0.5;
  if (place.address) confidence += 0.08;
  if (place.categoryCode || place.categoryName) confidence += 0.08;
  if (place.rating !== undefined) confidence += 0.12;
  if (place.averageCost !== undefined) confidence += 0.1;
  if (place.openingHours) confidence += 0.07;
  if (place.businessArea) confidence += 0.05;
  return Math.min(1, Number(confidence.toFixed(2)));
}

export function normalizeAmapPoi(value: unknown, origin: GeoPoint): NearbyPlace | null {
  const poi = asRecord(value);
  if (!poi) return null;

  const providerPlaceId = asTrimmedString(poi.id);
  const name = asTrimmedString(poi.name);
  const location = parsePoint(poi.location);
  if (!providerPlaceId || !name || !location) return null;

  const business = asRecord(poi.business);
  const typePath = asTrimmedString(poi.type);
  const categorySegments = typePath?.split(";").map((item) => item.trim()).filter(Boolean) || [];
  const rating = asFiniteNumber(business?.rating);
  const averageCost = asFiniteNumber(business?.cost);
  const openingHours =
    asFlexibleString(business?.opentime_today) || asFlexibleString(business?.opentime_week);

  const normalizedWithoutConfidence: Omit<NearbyPlace, "dataConfidence"> = {
    provider: "amap",
    providerPlaceId,
    name,
    address: asFlexibleString(poi.address),
    location,
    distanceM: haversineDistanceM(origin, location),
    categoryCode: asTrimmedString(poi.typecode),
    categoryName: categorySegments.at(-1) || typePath,
    businessArea: asFlexibleString(business?.business_area),
    cityName: asFlexibleString(poi.cityname),
    districtName: asFlexibleString(poi.adname),
    rating: rating !== undefined && rating >= 0 ? rating : undefined,
    averageCost: averageCost !== undefined && averageCost >= 0 ? averageCost : undefined,
    openStatus: "unknown",
    openingHours,
  };

  return {
    ...normalizedWithoutConfidence,
    dataConfidence: calculateConfidence(normalizedWithoutConfidence),
  };
}

function getTimeoutMs() {
  const configured = Number(process.env.AMAP_REQUEST_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 1_000 && configured <= 30_000
    ? configured
    : DEFAULT_TIMEOUT_MS;
}

function requireApiKey(overrideApiKey?: string) {
  const apiKey = overrideApiKey?.trim() || process.env.AMAP_WEB_SERVICE_KEY?.trim();
  if (!apiKey) {
    throw new PlaceProviderError(
      "MAP_PROVIDER_NOT_CONFIGURED",
      "地图服务尚未配置，请先在页面填写你自己的高德 Web 服务 Key，或由站点管理员配置。"
    );
  }
  return apiKey;
}

function assertSuccessfulResponse(response: AmapBaseResponse) {
  if (String(response.status) === "1") return;
  const infocode = asTrimmedString(response.infocode);
  const invalidKeyCodes = [
    "10001",
    "10002",
    "10005",
    "10006",
    "10007",
    "10008",
    "10009",
    "10012",
    "10013",
  ];
  if (invalidKeyCodes.includes(infocode || "")) {
    throw new PlaceProviderError(
      "MAP_PROVIDER_INVALID_KEY",
      infocode === "10009"
        ? "这个 Key 不是“Web 服务”类型，请在高德控制台重新添加 Web 服务 Key。"
        : infocode === "10005"
          ? "这个 Key 的 IP 白名单不包含当前服务器出口 IP，请检查高德控制台安全设置。"
          : "高德 Key 无效、已过期或没有当前接口权限，请检查后重试。",
      false
    );
  }
  const quotaCodes = [
    "10003",
    "10004",
    "10010",
    "10014",
    "10015",
    "10019",
    "10020",
    "10021",
    "10029",
    "10044",
    "10045",
    "40000",
    "40002",
  ];
  if (quotaCodes.includes(infocode || "")) {
    throw new PlaceProviderError(
      "MAP_PROVIDER_QUOTA_EXCEEDED",
      "这个高德 Key 的调用额度、QPS 或账户余额已不足，请稍后重试或前往高德控制台检查用量。",
      true
    );
  }
  const upstreamMessage = asTrimmedString(response.info) || "地图服务返回失败";
  throw new PlaceProviderError(
    "MAP_PROVIDER_UPSTREAM_ERROR",
    `地图服务请求失败：${upstreamMessage}`,
    true
  );
}

async function fetchAmapJson<T extends AmapBaseResponse>(url: URL): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new PlaceProviderError(
        "MAP_PROVIDER_UPSTREAM_ERROR",
        `地图服务暂时不可用（HTTP ${response.status}）。`,
        response.status >= 500
      );
    }

    const body: unknown = await response.json();
    const record = asRecord(body);
    if (!record) {
      throw new PlaceProviderError(
        "MAP_PROVIDER_INVALID_RESPONSE",
        "地图服务返回了无法识别的数据。",
        true
      );
    }

    assertSuccessfulResponse(record);
    return record as T;
  } catch (error) {
    if (error instanceof PlaceProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new PlaceProviderError(
        "MAP_PROVIDER_TIMEOUT",
        "地图服务请求超时，请稍后重试。",
        true
      );
    }
    throw new PlaceProviderError(
      "MAP_PROVIDER_UPSTREAM_ERROR",
      "无法连接地图服务，请稍后重试。",
      true
    );
  } finally {
    clearTimeout(timeout);
  }
}

export class AmapPlaceProvider implements PlaceProvider {
  readonly name = "amap" as const;

  constructor(private readonly options: { apiKey?: string } = {}) {}

  private async normalizeInputLocation(input: ReverseGeocodeInput) {
    if (input.coordinateSystem === "amap") return input.location;

    const url = new URL(AMAP_COORDINATE_CONVERT_URL);
    url.searchParams.set("key", requireApiKey(this.options.apiKey));
    url.searchParams.set("locations", `${input.location.longitude},${input.location.latitude}`);
    url.searchParams.set("coordsys", "gps");

    const response = await fetchAmapJson<AmapCoordinateResponse>(url);
    const converted = parsePoint(response.locations);
    if (!converted) {
      throw new PlaceProviderError(
        "MAP_PROVIDER_INVALID_RESPONSE",
        "地图服务未返回有效的坐标转换结果。",
        true
      );
    }
    return converted;
  }

  async searchNearby(input: NearbySearchInput): Promise<NearbySearchResult> {
    const apiKey = requireApiKey(this.options.apiKey);
    const origin = await this.normalizeInputLocation(input);
    const url = new URL(AMAP_AROUND_SEARCH_URL);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("location", `${origin.longitude},${origin.latitude}`);
    url.searchParams.set("radius", String(input.radiusM));
    url.searchParams.set("sortrule", "distance");
    url.searchParams.set("page_size", String(input.pageSize));
    url.searchParams.set("page_num", String(input.page));
    url.searchParams.set("show_fields", "business");
    url.searchParams.set(
      "types",
      input.categoryCodes?.length ? input.categoryCodes.join("|") : DEFAULT_RESTAURANT_TYPE_CODE
    );
    if (input.keyword) url.searchParams.set("keywords", input.keyword);

    const response = await fetchAmapJson<AmapAroundResponse>(url);
    if (!Array.isArray(response.pois)) {
      throw new PlaceProviderError(
        "MAP_PROVIDER_INVALID_RESPONSE",
        "地图服务未返回有效的门店列表。",
        true
      );
    }

    const places = response.pois
      .map((poi) => normalizeAmapPoi(poi, origin))
      .filter((place): place is NearbyPlace => place !== null)
      .filter((place) => place.distanceM <= input.radiusM);

    // 高德 WebService v5 的 count 是本次请求实际返回的数据条数，不是所有分页的总数。
    // 因此不能用 count 计算总页数；满页时保守地允许继续加载，直到返回不足一页
    // 或达到高德单次检索最多 200 条的限制。
    const upstreamReturnedCount = Math.max(
      parsePositiveInteger(response.count),
      response.pois.length
    );
    const hasMore =
      upstreamReturnedCount >= input.pageSize &&
      input.page * input.pageSize < AMAP_MAX_AROUND_RESULTS;

    return {
      provider: this.name,
      places,
      page: input.page,
      pageSize: input.pageSize,
      hasMore,
    };
  }

  async geocodeAddress(input: GeocodeInput): Promise<ResolvedLocation> {
    const apiKey = requireApiKey(this.options.apiKey);

    const resolveByGeocode = async () => {
      const geocodeUrl = new URL(AMAP_GEOCODE_URL);
      geocodeUrl.searchParams.set("key", apiKey);
      geocodeUrl.searchParams.set("address", input.address);
      if (input.city) geocodeUrl.searchParams.set("city", input.city);

      const response = await fetchAmapJson<AmapGeocodeResponse>(geocodeUrl);
      const first = Array.isArray(response.geocodes) ? asRecord(response.geocodes[0]) : null;
      const location = parsePoint(first?.location);

      if (!first || !location || parsePositiveInteger(response.count) < 1) return null;

      const formattedAddress = asFlexibleString(first.formatted_address) || input.address;
      return {
        provider: this.name,
        providerPlaceId: asTrimmedString(first.id),
        name: formattedAddress,
        formattedAddress,
        location,
        coordinateSystem: "amap" as const,
        province: asFlexibleString(first.province),
        city: asFlexibleString(first.city),
        district: asFlexibleString(first.district),
      } satisfies ResolvedLocation;
    };

    const resolveByPoi = async () => {
      if (input.address.length > 80) return null;

      const textUrl = new URL(AMAP_TEXT_SEARCH_URL);
      textUrl.searchParams.set("key", apiKey);
      textUrl.searchParams.set("keywords", input.address);
      textUrl.searchParams.set("page_size", "10");
      if (input.city) {
        textUrl.searchParams.set("region", input.city);
        textUrl.searchParams.set("city_limit", "true");
      }

      const textResponse = await fetchAmapJson<AmapTextSearchResponse>(textUrl);
      if (
        Array.isArray(textResponse.pois) &&
        (parsePositiveInteger(textResponse.count) > 0 || textResponse.pois.length > 0)
      ) {
        const candidates = textResponse.pois
          .map(normalizeAmapLocationPoi)
          .filter((location): location is ResolvedLocation => location !== null);
        const poiLocation = chooseAmapLocationPoi(candidates, input.address);
        if (poiLocation) return poiLocation;
      }
      return null;
    };

    // 公司、园区和大厦名称是 POI，不是严格意义上的“门牌地址”。
    // POI 搜索可以返回真实楼宇坐标；详细地址会先按道路和门牌号筛选候选，
    // 没有可信候选时再回退到 v3 地理编码。
    const resolved = (await resolveByPoi()) || (await resolveByGeocode());

    if (!resolved) {
      throw new PlaceProviderError("LOCATION_NOT_FOUND", "没有找到这个地址，请补充城市或更详细的地址。", false);
    }
    return resolved;
  }

  async reverseGeocodeLocation(input: ReverseGeocodeInput): Promise<ResolvedLocation> {
    const location = await this.normalizeInputLocation(input);
    const url = new URL(AMAP_REVERSE_GEOCODE_URL);
    url.searchParams.set("key", requireApiKey(this.options.apiKey));
    url.searchParams.set(
      "location",
      `${location.longitude.toFixed(6)},${location.latitude.toFixed(6)}`
    );
    url.searchParams.set("extensions", "base");

    const response = await fetchAmapJson<AmapReverseGeocodeResponse>(url);
    const regeocode = asRecord(response.regeocode);
    const addressComponent = asRecord(regeocode?.addressComponent);
    const formattedAddress = asFlexibleString(regeocode?.formatted_address);

    if (!regeocode || !formattedAddress) {
      throw new PlaceProviderError(
        "LOCATION_NOT_FOUND",
        "已获取定位坐标，但没有解析到具体地址。",
        false
      );
    }

    return {
      provider: this.name,
      name: formattedAddress,
      formattedAddress,
      location,
      coordinateSystem: "amap",
      province: asFlexibleString(addressComponent?.province),
      city:
        asFlexibleString(addressComponent?.city) ||
        asFlexibleString(addressComponent?.province),
      district: asFlexibleString(addressComponent?.district),
    };
  }
}
