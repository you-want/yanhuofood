"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  Crosshair,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LocateFixed,
  MapPinned,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { NearbyPlaceCard } from "@/components/nearby/NearbyPlaceCard";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select";
import { trackProductEvent } from "@/lib/analytics/client";
import { filterNearbyPlaces, nearbyPlaceKey } from "@/lib/domain/nearby-filters";
import { rankNearbyPlaces } from "@/lib/domain/nearby-ranking";
import { pickWeightedRecommendations } from "@/lib/domain/nearby-random";
import {
  clearLocalAmapConfig,
  DEFAULT_LOCAL_AMAP_CONFIG,
  readLocalAmapConfig,
  saveLocalAmapConfig,
} from "@/lib/local-amap-config";
import {
  clearNearbyLocalData,
  loadNearbyPlaceFeedback,
  loadNearbyPreferences,
  loadNearbyRecentChoices,
  loadSavedNearbyLocations,
  recordNearbyChoice,
  removeNearbyPlaceFeedback,
  saveNearbyLocation,
  saveNearbyPreferences,
  setNearbyPlaceFeedback,
} from "@/lib/nearby-local-store";
import {
  geocodeNearbyAddress,
  getNearbyMapStatus,
  NearbyApiError,
  reverseGeocodeNearbyLocation,
  searchNearbyPlaces,
  type NearbySearchApiInput,
  type NearbySearchApiResponse,
} from "@/lib/nearby-api";
import type { LocalAmapConfig } from "@/lib/schemas/nearby";
import type {
  CoordinateSystem,
  GeoPoint,
  NearbyPlaceFeedback,
  NearbyPlaceFeedbackValue,
  NearbyPreferences,
  NearbyRecentChoice,
  NearbyRecommendation,
  SavedNearbyLocation,
} from "@/lib/places/types";

const QUICK_CATEGORIES = ["全部", "快餐", "轻食", "米饭", "粉面", "川菜", "日料", "韩餐"];

interface ActiveLocation {
  label: string;
  formattedAddress?: string;
  point: GeoPoint;
  coordinateSystem: CoordinateSystem;
  accuracyM?: number;
}

function readableError(error: unknown) {
  if (error instanceof NearbyApiError) return error.message;
  if (error instanceof GeolocationPositionError) {
    if (error.code === error.PERMISSION_DENIED) return "定位权限被拒绝，请输入公司或当前位置附近的地址。";
    if (error.code === error.TIMEOUT) return "定位超时，请重试或手动输入地址。";
  }
  return "操作失败，请稍后重试。";
}

export function NearbyPageClient() {
  const queryClient = useQueryClient();
  const [preferences, setPreferences] = useState<NearbyPreferences>({
    radiusM: 1_500,
    openNow: false,
    recommendationMode: "balanced",
  });
  const [activeLocation, setActiveLocation] = useState<ActiveLocation | null>(null);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("全部");
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "locating" | "resolving" | "ready" | "error"
  >("idle");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationWarning, setLocationWarning] = useState<string | null>(null);
  const [recentChoices, setRecentChoices] = useState<NearbyRecentChoice[]>([]);
  const [feedback, setFeedback] = useState<NearbyPlaceFeedback[]>([]);
  const [savedLocations, setSavedLocations] = useState<SavedNearbyLocation[]>([]);
  const [recommendations, setRecommendations] = useState<NearbyRecommendation[]>([]);
  const [searchResults, setSearchResults] = useState<NearbySearchApiResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [localAmapConfig, setLocalAmapConfig] = useState<LocalAmapConfig>(
    DEFAULT_LOCAL_AMAP_CONFIG
  );
  const [savedLocalAmapConfig, setSavedLocalAmapConfig] = useState<LocalAmapConfig>(
    DEFAULT_LOCAL_AMAP_CONFIG
  );
  const [showAmapKey, setShowAmapKey] = useState(false);
  const [showAmapInstructions, setShowAmapInstructions] = useState(false);
  const [showMapConfig, setShowMapConfig] = useState(false);
  const [mapConfigNotice, setMapConfigNotice] = useState<string | null>(null);
  const [clientReady, setClientReady] = useState(false);

  useEffect(() => {
    setPreferences(loadNearbyPreferences());
    setRecentChoices(loadNearbyRecentChoices());
    setFeedback(loadNearbyPlaceFeedback());
    setSavedLocations(loadSavedNearbyLocations());
    const storedAmapConfig = readLocalAmapConfig();
    setLocalAmapConfig(storedAmapConfig);
    setSavedLocalAmapConfig(storedAmapConfig);
    setClientReady(true);
  }, []);

  useEffect(() => {
    saveNearbyPreferences(preferences);
  }, [preferences]);

  const mapStatus = useQuery({
    queryKey: ["nearby-map-status"],
    queryFn: getNearbyMapStatus,
    staleTime: 5 * 60_000,
  });
  const localAmapKey = savedLocalAmapConfig.enabled
    ? savedLocalAmapConfig.webServiceKey.trim()
    : "";
  const serverMapConfigured = Boolean(mapStatus.data?.server.configured);
  const hostedMapConfigured = Boolean(mapStatus.data?.server.hostedConfigured);
  const hostedMapLocked = hostedMapConfigured && !serverMapConfigured && !localAmapKey;
  const publicQuota = mapStatus.data?.server.publicQuota;
  const publicQuotaBlocked = Boolean(
    serverMapConfigured &&
      publicQuota?.enabled &&
      (!publicQuota.available || publicQuota.remaining === 0)
  );
  const serverMapAvailable = serverMapConfigured && !publicQuotaBlocked;
  const mapAvailabilityKnown = Boolean(localAmapKey) || !mapStatus.isPending;
  const mapAvailable = Boolean(localAmapKey) || serverMapAvailable;
  const mapBlocked = mapAvailabilityKnown && !mapAvailable;

  function refreshPublicQuotaStatus() {
    if (!localAmapKey) {
      void queryClient.invalidateQueries({ queryKey: ["nearby-map-status"] });
    }
  }

  useEffect(() => {
    if (mapBlocked) {
      setShowMapConfig(true);
      setShowAmapInstructions(true);
    }
  }, [mapBlocked]);

  const searchMutation = useMutation({
    mutationFn: searchNearbyPlaces,
    onSuccess: (data, variables) => {
      const isNextPage = (variables.page || 1) > 1;
      setSearchResults((current) => {
        if (!isNextPage || !current) return data;
        const placesById = new Map(
          [...current.places, ...data.places].map((place) => [nearbyPlaceKey(place), place])
        );
        return { ...data, places: [...placesById.values()] };
      });
      if (!isNextPage) setRecommendations([]);
      trackProductEvent("nearby_search_completed", {
        result_count: data.places.length,
        radius_m: variables.radiusM,
        source: variables.coordinateSystem,
      });
      if (!isNextPage && data.places.length === 0) {
        trackProductEvent("nearby_no_result", {
          radius_m: variables.radiusM,
          has_keyword: Boolean(variables.keyword),
        });
      }
    },
    onSettled: refreshPublicQuotaStatus,
  });

  const geocodeMutation = useMutation({
    mutationFn: ({ address: value, city: cityValue }: { address: string; city?: string }) =>
      geocodeNearbyAddress(value, cityValue, localAmapKey || undefined),
    onSuccess: (location) => {
      const nextLocation: ActiveLocation = {
        label: location.name,
        formattedAddress: location.formattedAddress,
        point: location.location,
        coordinateSystem: location.coordinateSystem,
      };
      setActiveLocation(nextLocation);
      setLocationStatus("ready");
      setLocationError(null);
      setLocationWarning(null);
      trackProductEvent("nearby_manual_location_used", { has_city: Boolean(city.trim()) });
      runSearch(nextLocation);
    },
    onSettled: refreshPublicQuotaStatus,
  });

  const reverseGeocodeMutation = useMutation({
    mutationFn: ({ location }: { location: GeoPoint; accuracyM?: number }) =>
      reverseGeocodeNearbyLocation(location, "gps", localAmapKey || undefined),
    onSuccess: (resolved, variables) => {
      const nextLocation: ActiveLocation = {
        label: resolved.formattedAddress,
        formattedAddress: resolved.formattedAddress,
        point: resolved.location,
        coordinateSystem: resolved.coordinateSystem,
        accuracyM: variables.accuracyM,
      };
      setActiveLocation(nextLocation);
      setLocationStatus("ready");
      setLocationError(null);
      setLocationWarning(null);
      runSearch(nextLocation);
    },
    onError: (error, variables) => {
      const fallbackLocation: ActiveLocation = {
        label: "当前位置（详细地址解析失败）",
        point: variables.location,
        coordinateSystem: "gps",
        accuracyM: variables.accuracyM,
      };
      setActiveLocation(fallbackLocation);
      setLocationStatus("ready");
      setLocationError(null);
      setLocationWarning(
        `已获取定位坐标，但详细地址解析失败：${readableError(error)}。仍会使用该坐标搜索；你也可以重新定位或输入公司地址。`
      );
      runSearch(fallbackLocation);
    },
    onSettled: refreshPublicQuotaStatus,
  });

  const searchKeyword = [keyword.trim(), category === "全部" ? "" : category]
    .filter(Boolean)
    .join(" ");

  function searchInput(location: ActiveLocation, preferenceOverride = preferences): NearbySearchApiInput {
    return {
      location: location.point,
      coordinateSystem: location.coordinateSystem,
      locationAccuracyM: location.accuracyM,
      radiusM: preferenceOverride.radiusM,
      keyword: searchKeyword || undefined,
      pageSize: 25,
      amapWebServiceKey: localAmapKey || undefined,
    };
  }

  function ensureMapAvailable() {
    if (!mapBlocked) return true;
    setMapConfigNotice("请先填写并保存你自己的高德 Web 服务 Key，再使用定位和搜索功能。");
    setShowAmapInstructions(true);
    return false;
  }

  function runSearch(location = activeLocation, preferenceOverride = preferences) {
    if (!ensureMapAvailable()) return;
    if (!location) {
      setLocationError("请先使用当前位置，或输入一个地址。 ");
      return;
    }
    setNotice(null);
    searchMutation.mutate({ ...searchInput(location, preferenceOverride), page: 1 });
  }

  function requestCurrentLocation() {
    if (!ensureMapAvailable()) return;
    trackProductEvent("nearby_location_requested");
    setLocationStatus("locating");
    setLocationError(null);
    setLocationWarning(null);
    if (!("geolocation" in navigator)) {
      setLocationStatus("error");
      setLocationError("当前浏览器不支持定位，请手动输入地址。 ");
      trackProductEvent("nearby_location_denied", { reason: "unsupported" });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const gpsLocation: GeoPoint = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setActiveLocation({
          label: "当前位置（正在解析详细地址）",
          point: gpsLocation,
          coordinateSystem: "gps",
          accuracyM: position.coords.accuracy,
        });
        setLocationStatus("resolving");
        trackProductEvent("nearby_location_granted", {
          accuracy_bucket:
            position.coords.accuracy <= 100
              ? "good"
              : position.coords.accuracy <= 500
                ? "fair"
                : "poor",
        });
        reverseGeocodeMutation.mutate({
          location: gpsLocation,
          accuracyM: position.coords.accuracy,
        });
      },
      (error) => {
        setLocationStatus("error");
        setLocationError(readableError(error));
        trackProductEvent("nearby_location_denied", {
          reason:
            error.code === error.PERMISSION_DENIED
              ? "permission_denied"
              : "position_unavailable",
        });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  }

  const filters = useMemo(
    () => ({
      maxDistanceM: preferences.radiusM,
      maxPrice: preferences.maxPrice,
      minRating: preferences.minRating,
      openNow: preferences.openNow,
      categories: category === "全部" ? undefined : [category],
    }),
    [category, preferences]
  );

  const filteredPlaces = useMemo(
    () => filterNearbyPlaces(searchResults?.places || [], filters, feedback),
    [feedback, filters, searchResults?.places]
  );
  const ranked = useMemo(
    () => rankNearbyPlaces(filteredPlaces, { filters, recentChoices, feedback }),
    [feedback, filteredPlaces, filters, recentChoices]
  );
  const feedbackMap = useMemo(
    () => new Map(feedback.map((item) => [`${item.provider}:${item.providerPlaceId}`, item.value])),
    [feedback]
  );

  function randomPick(count: number, excludeCurrent = false) {
    const currentIds = new Set(recommendations.map((item) => nearbyPlaceKey(item.place)));
    const candidates = excludeCurrent
      ? ranked.filter((item) => !currentIds.has(nearbyPlaceKey(item.place)))
      : ranked;
    const picked = pickWeightedRecommendations(
      candidates.length ? candidates : ranked,
      preferences.recommendationMode,
      count
    );
    setRecommendations(picked);
    trackProductEvent("nearby_random_requested", {
      mode: preferences.recommendationMode,
      candidate_count: ranked.length,
      requested_count: count,
    });
    if (!picked.length) setNotice("当前筛选条件下没有可推荐的门店，请放宽条件后重试。 ");
  }

  function choosePlace(recommendation: NearbyRecommendation) {
    setRecentChoices(recordNearbyChoice(recommendation.place));
    setRecommendations([recommendation]);
    setNotice(`已选择“${recommendation.place.name}”，下次随机推荐会降低近期重复概率。`);
    trackProductEvent("nearby_place_selected", {
      provider: recommendation.place.provider,
      has_price: recommendation.place.averageCost !== undefined,
      has_rating: recommendation.place.rating !== undefined,
    });
  }

  function updateFeedback(
    recommendation: NearbyRecommendation,
    value: NearbyPlaceFeedbackValue
  ) {
    const currentValue = feedbackMap.get(nearbyPlaceKey(recommendation.place));
    if (currentValue === value) {
      setFeedback(removeNearbyPlaceFeedback(recommendation.place));
      return;
    }
    setFeedback(setNearbyPlaceFeedback(recommendation.place, value));
    if (value === "blocked") {
      setRecommendations((current) =>
        current.filter((item) => nearbyPlaceKey(item.place) !== nearbyPlaceKey(recommendation.place))
      );
      trackProductEvent("nearby_place_blocked", { provider: recommendation.place.provider });
    }
  }

  async function copyName(name: string) {
    await navigator.clipboard.writeText(name);
    setNotice(`已复制“${name}”。`);
  }

  function saveCurrentLocation() {
    if (!activeLocation) return;
    const saved: SavedNearbyLocation = {
      id: "work",
      name: "公司",
      formattedAddress: activeLocation.formattedAddress || activeLocation.label,
      location: activeLocation.point,
      coordinateSystem: activeLocation.coordinateSystem,
      updatedAt: new Date().toISOString(),
    };
    setSavedLocations(saveNearbyLocation(saved));
    setNotice("已把当前位置保存为“公司”，数据只保存在本浏览器。 ");
  }

  function activateSavedLocation(saved: SavedNearbyLocation) {
    const nextLocation: ActiveLocation = {
      label: saved.name,
      formattedAddress: saved.formattedAddress,
      point: saved.location,
      coordinateSystem: saved.coordinateSystem,
    };
    setActiveLocation(nextLocation);
    setLocationStatus("ready");
    setLocationError(null);
    setLocationWarning(null);
    runSearch(nextLocation);
  }

  function clearLocalData() {
    clearNearbyLocalData();
    setPreferences({ radiusM: 1_500, openNow: false, recommendationMode: "balanced" });
    setRecentChoices([]);
    setFeedback([]);
    setSavedLocations([]);
    setNotice("附近推荐的本地偏好、位置和选择历史已清除。 ");
  }

  function widenSearch() {
    const nextPreferences = { ...preferences, radiusM: 3_000 };
    setPreferences(nextPreferences);
    if (activeLocation) runSearch(activeLocation, nextPreferences);
  }

  function clearSearchFilters() {
    const nextPreferences = { ...preferences, maxPrice: undefined, minRating: undefined };
    setPreferences(nextPreferences);
    if (activeLocation) runSearch(activeLocation, nextPreferences);
  }

  function saveAmapKey() {
    const webServiceKey = localAmapConfig.webServiceKey.trim();
    if (webServiceKey.length < 8) {
      setMapConfigNotice("请输入有效的高德 Web 服务 Key；不要填写 Web JS API Key。 ");
      setShowMapConfig(true);
      setShowAmapInstructions(true);
      return;
    }

    const nextConfig: LocalAmapConfig = { enabled: true, webServiceKey };
    saveLocalAmapConfig(nextConfig);
    setLocalAmapConfig(nextConfig);
    setSavedLocalAmapConfig(nextConfig);
    setShowMapConfig(false);
    setShowAmapInstructions(false);
    setShowAmapKey(false);
    setMapConfigNotice("高德 Web 服务 Key 已保存到当前浏览器，之后搜索会优先使用它，不占用站点公共额度。 ");
    searchMutation.reset();
    geocodeMutation.reset();
  }

  function clearAmapKey() {
    clearLocalAmapConfig();
    setLocalAmapConfig(DEFAULT_LOCAL_AMAP_CONFIG);
    setSavedLocalAmapConfig(DEFAULT_LOCAL_AMAP_CONFIG);
    setShowAmapKey(false);
    searchMutation.reset();
    geocodeMutation.reset();
    setRecommendations([]);
    if (!serverMapAvailable) setSearchResults(null);
    setShowMapConfig(true);
    setMapConfigNotice(
      serverMapAvailable
        ? "本浏览器保存的 Key 已清除，接下来会使用站点提供的地图服务。"
        : publicQuotaBlocked
          ? "本浏览器保存的 Key 已清除；站点公共额度当前不可用，需要重新配置自己的 Key 后才能搜索。"
          : "本浏览器保存的 Key 已清除；当前站点没有公共 Key，需要重新配置后才能搜索。"
    );
  }

  const searchError = searchMutation.error ? readableError(searchMutation.error) : null;
  const geocodeError = geocodeMutation.error ? readableError(geocodeMutation.error) : null;
  const providerError =
    searchMutation.error instanceof NearbyApiError
      ? searchMutation.error
      : geocodeMutation.error instanceof NearbyApiError
        ? geocodeMutation.error
        : reverseGeocodeMutation.error instanceof NearbyApiError
          ? reverseGeocodeMutation.error
          : null;
  const providerConfigurationError = providerError
    ? [
        "MAP_PROVIDER_NOT_CONFIGURED",
        "MAP_PROVIDER_INVALID_KEY",
        "MAP_PROVIDER_QUOTA_EXCEEDED",
        "PUBLIC_MAP_DAILY_LIMIT_REACHED",
        "PUBLIC_MAP_QUOTA_UNAVAILABLE",
      ].includes(providerError.code)
    : false;
  const hasNextPage = Boolean(searchResults?.hasMore);
  const activeFilterLabels = [
    category !== "全部" ? category : null,
    preferences.maxPrice ? `${preferences.maxPrice} 元以内` : null,
    preferences.minRating ? `${preferences.minRating} 分以上` : null,
    preferences.openNow ? "当前营业" : null,
  ].filter(Boolean) as string[];

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <div className="space-y-6">
        <PageHeader
          className="mb-2"
          eyebrow={<><Badge>工作餐决策器</Badge><Badge variant="outline">真实地图 POI</Badge></>}
          title="附近吃什么"
          description="用当前位置或公司地址搜索真实餐馆，再按距离、预算、评分和近期选择筛选，最后让系统帮你快速决定。"
        />
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-6 text-warning" role="note">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>地图信息可能有延迟；是否支持外卖、实时营业、配送范围和价格，请在下单平台再次确认。</p>
        </div>

        <Card
          className={
            mapBlocked
              ? "border-warning/40 bg-warning/10"
              : localAmapKey
                ? "border-primary/30 bg-primary/10"
                : undefined
          }
        >
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="flex items-center gap-2">
                    <KeyRound className="h-5 w-5 text-primary" />
                    地图数据配置
                  </CardTitle>
                  {localAmapKey ? (
                    <Badge variant="secondary">使用本浏览器 Key</Badge>
                  ) : mapStatus.isPending ? (
                    <Badge variant="outline">检查站点配置中</Badge>
                  ) : publicQuotaBlocked ? (
                    <Badge variant="amber">公共额度不可用</Badge>
                  ) : hostedMapLocked ? (
                    <Badge variant="amber">需登录授权</Badge>
                  ) : serverMapConfigured ? (
                    <Badge variant="secondary">站点已提供</Badge>
                  ) : (
                    <Badge variant="amber">需要配置</Badge>
                  )}
                </div>
                <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
                  {!showMapConfig && mapConfigNotice
                    ? mapConfigNotice
                    : showMapConfig
                      ? "可在这里配置当前浏览器专用的高德 Web 服务 Key；配置只用于附近搜索。"
                      : localAmapKey
                      ? "已配置当前浏览器专用 Key，附近搜索会优先使用它，不占用站点公共额度。"
                      : publicQuota?.enabled && publicQuota.available
                        ? `站点地图服务可用，今日公共额度剩余 ${publicQuota.remaining ?? 0} / ${publicQuota.dailyLimit} 个调用单位；一次完整 GPS 定位并搜索通常消耗 3 个单位。`
                        : serverMapAvailable
                          ? "站点地图服务可用，无需额外配置；如有需要，也可改用自己的 Key。"
                          : "需要配置高德 Web 服务 Key 后才能使用定位和附近搜索。"}
                </p>
              </div>
              <Button
                type="button"
                variant={showMapConfig ? "outline" : "ghost"}
                size="sm"
                className="w-full shrink-0 sm:w-auto"
                onClick={() => setShowMapConfig((current) => !current)}
                aria-expanded={showMapConfig}
                aria-controls="nearby-map-config-content"
                disabled={!clientReady}
              >
                {showMapConfig ? "收起配置" : localAmapKey ? "管理 Key" : "展开配置"}
              </Button>
            </div>
          </CardHeader>
          {showMapConfig ? (
            <CardContent id="nearby-map-config-content">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                <div className="space-y-4">
                  {localAmapKey ? (
                    <div className="rounded-md border border-primary/20 bg-primary/10 px-3 py-3 text-sm leading-6 text-primary">
                      正在优先使用保存在当前浏览器的高德 Web 服务 Key，不占用站点公共额度。
                    </div>
                  ) : publicQuotaBlocked ? (
                    <div className="rounded-md border border-warning/40 bg-warning/15 px-3 py-3 text-sm leading-6 text-warning">
                      <strong>
                        {publicQuota?.remaining === 0
                          ? "站点今天的公共地图额度已经用完。"
                          : "站点暂时无法确认公共地图剩余额度。"}
                      </strong>
                      请填写你自己的高德 Web 服务 Key 后继续使用。
                    </div>
                  ) : hostedMapLocked ? (
                    <div className="rounded-md border border-warning/40 bg-warning/15 px-3 py-3 text-sm leading-6 text-warning">
                      <strong>站点地图服务需要登录并完成公众号关注绑定。</strong>
                      完成绑定后即可使用站点提供的高德 Key；也可以填写自己的 Key，仅使用自己的额度。
                    </div>
                  ) : serverMapConfigured ? (
                    <div className="rounded-md border border-primary/20 bg-primary/10 px-3 py-3 text-sm leading-6 text-primary">
                      <p>站点已经提供地图服务，你无需配置。也可以填写自己的 Key，并优先使用本地配置。</p>
                      {publicQuota?.enabled && publicQuota.available ? (
                        <p className="mt-1 text-xs text-primary">
                          今日公共额度剩余 {publicQuota.remaining ?? 0} / {publicQuota.dailyLimit}
                          个调用单位；一次完整 GPS 定位并搜索通常消耗 3 个单位。
                        </p>
                      ) : null}
                    </div>
                  ) : mapStatus.isError ? (
                    <div className="rounded-md border border-border bg-muted px-3 py-3 text-sm leading-6 text-foreground">
                      暂时无法确认站点是否提供地图服务。你仍可以填写自己的 Key，或直接尝试搜索。
                    </div>
                  ) : mapBlocked ? (
                    <div className="rounded-md border border-warning/40 bg-warning/15 px-3 py-3 text-sm leading-6 text-warning">
                      <strong>当前站点没有提供公共地图 Key。</strong>
                      请先申请并填写你自己的高德 Web 服务 Key，保存后即可搜索附近餐馆。
                    </div>
                  ) : null}

                  <label className="block space-y-1.5 text-sm font-medium text-foreground">
                    高德 Web 服务 Key
                    <span className="relative block">
                      <Input
                        type={showAmapKey ? "text" : "password"}
                        value={localAmapConfig.webServiceKey}
                        onChange={(event) => {
                          setLocalAmapConfig({ enabled: true, webServiceKey: event.target.value });
                          setMapConfigNotice(null);
                        }}
                        placeholder="粘贴高德 Web 服务 Key"
                        aria-label="高德 Web 服务 Key"
                        autoComplete="off"
                        spellCheck={false}
                        className="pr-10 font-mono"
                      />
                      <button
                        type="button"
                        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                        onClick={() => setShowAmapKey((current) => !current)}
                        aria-label={showAmapKey ? "隐藏高德 Key" : "显示高德 Key"}
                      >
                        {showAmapKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </span>
                  </label>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button onClick={saveAmapKey} disabled={!localAmapConfig.webServiceKey.trim()}>
                      <Save className="h-4 w-4" />
                      保存 Key
                    </Button>
                    <Button
                      variant="outline"
                      onClick={clearAmapKey}
                      disabled={!localAmapKey && !localAmapConfig.webServiceKey}
                    >
                      <Trash2 className="h-4 w-4" />
                      清除 Key
                    </Button>
                  </div>

                  {mapConfigNotice ? (
                    <p className="rounded-md border border-border bg-card px-3 py-2 text-xs leading-5 text-foreground">
                      {mapConfigNotice}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-4 rounded-lg border border-border bg-card p-4">
                  <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p>
                      Key 仅保存在当前浏览器 localStorage，不写入 Supabase。地址解析或附近搜索时，
                      Key 会随本次请求临时发送给当前站点后端，由后端调用高德，服务端不会保存。
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-between px-1 text-foreground"
                    onClick={() => setShowAmapInstructions((current) => !current)}
                    aria-expanded={showAmapInstructions}
                  >
                    {showAmapInstructions ? "收起申请与配置说明" : "查看如何申请高德 Key"}
                    <span aria-hidden>{showAmapInstructions ? "−" : "+"}</span>
                  </Button>

                  {showAmapInstructions ? (
                    <div className="space-y-3 border-t border-border pt-4 text-sm leading-6 text-foreground">
                      <ol className="list-decimal space-y-2 pl-5">
                        <li>打开高德开放平台并登录，按平台要求完成个人或企业认证。</li>
                        <li>进入“控制台 → 应用管理 → 我的应用”，创建一个应用。</li>
                        <li>
                          在应用中“添加 Key”，服务平台务必选择
                          <strong className="mx-1 text-foreground">Web 服务</strong>
                          ，不要选择 Web JS API。
                        </li>
                        <li>复制生成的 Key，粘贴到左侧输入框并保存，然后再定位或搜索。</li>
                      </ol>
                      <div className="space-y-2 rounded-md bg-muted p-3 text-xs leading-5 text-muted-foreground">
                        <p>
                          高德可能提供基础免费额度，超额、增值能力或商业使用可能收费；具体以高德控制台、价格页和服务条款为准。
                        </p>
                        <p>
                          如果你给 Key 设置了 IP 白名单，需要放行当前部署站点后端的出口 IP，而不是只填写浏览器所在网络的 IP。
                        </p>
                        <p className="font-medium text-warning">不要在公司公用电脑或其他不可信设备上长期保存个人 Key。</p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <a
                          href="https://lbs.amap.com/api/webservice/create-project-and-key"
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
                        >
                          官方申请教程
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        <a
                          href="https://lbs.amap.com/pages/base_service_price"
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
                        >
                          价格与配额说明
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </CardContent>
          ) : null}
        </Card>

        <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="space-y-5 xl:sticky xl:top-20 xl:self-start">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LocateFixed className="h-5 w-5 text-primary" />
                  1. 选择位置
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  className="w-full"
                  onClick={requestCurrentLocation}
                  disabled={
                    !clientReady ||
                    !mapAvailabilityKnown ||
                    locationStatus === "locating" ||
                    locationStatus === "resolving" ||
                    mapBlocked
                  }
                >
                  {locationStatus === "locating" || locationStatus === "resolving" ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Crosshair className="h-4 w-4" />
                  )}
                  {locationStatus === "locating"
                    ? "正在定位"
                    : locationStatus === "resolving"
                      ? "正在解析位置"
                      : "使用当前位置"}
                </Button>

                <div className="relative py-1 text-center text-xs text-muted-foreground">
                  <span className="relative z-10 bg-card px-2">或输入公司地址</span>
                  <span className="absolute inset-x-0 top-1/2 border-t border-border" />
                </div>

                <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
                  <Input
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    placeholder="城市（可选）"
                    aria-label="城市"
                    disabled={!clientReady}
                  />
                  <Input
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder="公司、园区或详细地址"
                    aria-label="公司地址"
                    disabled={!clientReady}
                  />
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={
                    !clientReady ||
                    !mapAvailabilityKnown ||
                    address.trim().length < 2 ||
                    geocodeMutation.isPending ||
                    mapBlocked
                  }
                  onClick={() => {
                    if (!ensureMapAvailable()) return;
                    geocodeMutation.mutate({
                      address: address.trim(),
                      city: city.trim() || undefined,
                    });
                  }}
                >
                  {geocodeMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  解析地址并搜索
                </Button>

                {savedLocations.length ? (
                  <div className="space-y-2 border-t border-border pt-4">
                    <p className="text-xs font-semibold text-muted-foreground">本浏览器常用地点</p>
                    {savedLocations.map((saved) => (
                      <button
                        type="button"
                        key={saved.id}
                        className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-sm hover:border-primary/30 hover:bg-primary/10"
                        disabled={mapBlocked}
                        onClick={() => activateSavedLocation(saved)}
                      >
                        <Building2 className="h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0">
                          <span className="block font-medium text-foreground">{saved.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{saved.formattedAddress}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {activeLocation ? (
                  <div className="rounded-md border border-primary/20 bg-primary/10 px-3 py-3 text-sm">
                    <p className="text-xs font-semibold text-primary">当前搜索点</p>
                    <p className="mt-1 font-medium leading-6 text-primary">
                      {activeLocation.formattedAddress || activeLocation.label}
                    </p>
                    {activeLocation.formattedAddress &&
                    activeLocation.label !== activeLocation.formattedAddress ? (
                      <p className="mt-0.5 text-xs text-primary">{activeLocation.label}</p>
                    ) : null}
                    {locationStatus === "resolving" ? (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-primary">
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        正在解析附近道路和门牌信息…
                      </p>
                    ) : null}
                    <p className="mt-2 break-all font-mono text-xs text-primary">
                      经纬度：{activeLocation.point.latitude.toFixed(6)}, {" "}
                      {activeLocation.point.longitude.toFixed(6)}（
                      {activeLocation.coordinateSystem === "amap" ? "高德坐标" : "浏览器 GPS"}
                      ）
                    </p>
                    {activeLocation.accuracyM !== undefined ? (
                      <p
                        className={
                          activeLocation.accuracyM > 500
                            ? "mt-1 text-xs text-warning"
                            : "mt-1 text-xs text-primary"
                        }
                      >
                        定位精度约 {Math.round(activeLocation.accuracyM)} 米
                        {activeLocation.accuracyM > 500
                          ? "，精度较低，建议重试或输入地址"
                          : ""}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      如果地址或精度不正确，请重新定位，或输入公司/园区地址。
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2 px-0 text-primary"
                      disabled={locationStatus === "resolving"}
                      onClick={saveCurrentLocation}
                    >
                      <Building2 className="h-4 w-4" />
                      保存为公司（仅本浏览器）
                    </Button>
                  </div>
                ) : null}
                {locationWarning ? (
                  <p className="text-sm leading-6 text-warning">{locationWarning}</p>
                ) : null}
                {locationError || geocodeError ? (
                  <p className="text-sm leading-6 text-destructive">
                    {locationError || geocodeError}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5 text-primary" />
                  2. 填写条件
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="block space-y-1.5 text-sm font-medium text-foreground">
                  关键词
                  <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="例如：盖饭、清淡、牛肉面" />
                </label>

                <div>
                  <p className="mb-2 text-sm font-medium text-foreground">快捷分类</p>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_CATEGORIES.map((item) => (
                      <button
                        type="button"
                        key={item}
                        onClick={() => {
                          setCategory(item);
                          trackProductEvent("nearby_filter_applied", { filter: "category", value: item });
                        }}
                        className={
                          category === item
                            ? "rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                            : "rounded-full border border-input bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                        }
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1.5 text-sm font-medium text-foreground">
                    搜索半径
                    <SelectNative
                      value={preferences.radiusM}
                      onChange={(event) => setPreferences((current) => ({ ...current, radiusM: Number(event.target.value) }))}
                    >
                      <option value={500}>500 米</option>
                      <option value={1000}>1 公里</option>
                      <option value={1500}>1.5 公里</option>
                      <option value={3000}>3 公里</option>
                      <option value={5000}>5 公里</option>
                    </SelectNative>
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-foreground">
                    人均预算
                    <SelectNative
                      value={preferences.maxPrice || ""}
                      onChange={(event) => setPreferences((current) => ({ ...current, maxPrice: event.target.value ? Number(event.target.value) : undefined }))}
                    >
                      <option value="">不限</option>
                      <option value={20}>20 元以内</option>
                      <option value={30}>30 元以内</option>
                      <option value={50}>50 元以内</option>
                      <option value={80}>80 元以内</option>
                      <option value={120}>120 元以内</option>
                    </SelectNative>
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-foreground">
                    最低评分
                    <SelectNative
                      value={preferences.minRating || ""}
                      onChange={(event) => setPreferences((current) => ({ ...current, minRating: event.target.value ? Number(event.target.value) : undefined }))}
                    >
                      <option value="">不限</option>
                      <option value={3.5}>3.5 分</option>
                      <option value={4}>4.0 分</option>
                      <option value={4.5}>4.5 分</option>
                    </SelectNative>
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-foreground">
                    随机风格
                    <SelectNative
                      value={preferences.recommendationMode}
                      onChange={(event) => setPreferences((current) => ({ ...current, recommendationMode: event.target.value as NearbyPreferences["recommendationMode"] }))}
                    >
                      <option value="safe">稳妥优先</option>
                      <option value="balanced">平衡推荐</option>
                      <option value="surprise">多点惊喜</option>
                    </SelectNative>
                  </label>
                </div>

                <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2.5 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={preferences.openNow}
                    onChange={(event) => setPreferences((current) => ({ ...current, openNow: event.target.checked }))}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  优先当前营业
                </label>

                <Button
                  className="w-full"
                  onClick={() => runSearch()}
                  disabled={
                    !clientReady ||
                    !mapAvailabilityKnown ||
                    !activeLocation ||
                    searchMutation.isPending ||
                    mapBlocked
                  }
                >
                  {searchMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {searchMutation.isPending
                    ? "正在搜索附近餐馆"
                    : !activeLocation
                      ? "先选择位置"
                      : searchResults
                        ? "重新搜索"
                        : "开始搜索附近餐馆"}
                </Button>
              </CardContent>
            </Card>

            <Button variant="ghost" className="w-full text-muted-foreground" onClick={clearLocalData}>
              <Trash2 className="h-4 w-4" />
              清除附近偏好与选择历史
            </Button>
          </aside>

          <section className="min-w-0 space-y-5">
            <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-[0_1px_2px_rgb(28_25_23/0.04)] sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <MapPinned className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">搜索结果</p>
                    <p className="truncate text-xs text-muted-foreground">{activeLocation ? `搜索位置：${activeLocation.formattedAddress || activeLocation.label}` : "还没有选择搜索位置"}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {searchResults ? <Badge variant="secondary">{ranked.length} 家符合条件</Badge> : <Badge variant="outline">等待搜索</Badge>}
                  {activeFilterLabels.map((label) => <Badge key={label} variant="outline">{label}</Badge>)}
                </div>
              </div>
            </div>
            <Card>
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">3. 让系统帮你决定</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {ranked.length ? `当前有 ${ranked.length} 家符合条件的候选` : "先定位并搜索附近餐馆"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  <Button onClick={() => randomPick(1)} disabled={!ranked.length}>
                    <Sparkles className="h-4 w-4" />
                    帮我选一家
                  </Button>
                  <Button variant="secondary" onClick={() => randomPick(3)} disabled={!ranked.length}>
                    给我三个选择
                  </Button>
                  {recommendations.length ? (
                    <Button variant="outline" onClick={() => randomPick(1, true)} disabled={!ranked.length}>
                      <RefreshCw className="h-4 w-4" />
                      换一家
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            {notice ? <div className="rounded-md border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">{notice}</div> : null}

            {providerConfigurationError && providerError ? (
              <Card className="border-warning/40 bg-warning/10">
                <CardContent className="p-6">
                  <div className="flex items-start gap-3">
                    <MapPinned className="mt-0.5 h-6 w-6 shrink-0 text-warning" />
                    <div>
                      <h2 className="font-semibold text-warning">
                        {providerError.code === "MAP_PROVIDER_INVALID_KEY"
                          ? "高德 Key 无法使用"
                          : providerError.code === "MAP_PROVIDER_QUOTA_EXCEEDED"
                            ? "高德 Key 额度不足"
                            : "地图服务尚未配置"}
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-warning">
                        {providerError.message}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-warning">
                        请回到左侧“地图数据配置”检查或更换自己的高德 Web 服务 Key。系统不会用虚构门店替代真实搜索结果。
                      </p>
                      <Button
                        variant="outline"
                        className="mt-4"
                        onClick={() => setShowAmapInstructions(true)}
                      >
                        <KeyRound className="h-4 w-4" />
                        查看配置说明
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : searchError ? (
              <Card className="border-destructive/30">
                <CardContent className="p-6 text-sm text-destructive">
                  <p className="font-semibold">搜索失败</p>
                  <p className="mt-2 leading-6">{searchError}</p>
                  <Button variant="outline" className="mt-4" onClick={() => runSearch()}>
                    <RefreshCw className="h-4 w-4" />
                    重新搜索
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {searchMutation.isPending ? (
              <Card>
                <CardContent className="flex min-h-48 items-center justify-center gap-3 p-8 text-muted-foreground">
                  <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
                  正在获取附近真实门店…
                </CardContent>
              </Card>
            ) : null}

            {!searchMutation.isPending && searchResults && ranked.length === 0 && !searchError ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Search className="mx-auto h-8 w-8 text-muted-foreground" />
                  <h2 className="mt-3 font-semibold text-foreground">没有找到符合条件的门店</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">可以扩大搜索半径、取消价格或评分限制，或换一个更宽泛的关键词。</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Button size="sm" variant="outline" onClick={widenSearch}>扩大到 3 公里</Button>
                    <Button size="sm" variant="outline" onClick={clearSearchFilters}>清除预算和评分</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setKeyword(""); setCategory("全部"); if (activeLocation) runSearch(activeLocation); }}>清除关键词</Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {recommendations.length ? (
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-foreground">本次推荐</h2>
                  <Badge variant="secondary">{recommendations.length} 个选择</Badge>
                </div>
                <div className="grid gap-4 2xl:grid-cols-2">
                  {recommendations.map((recommendation) => (
                    <NearbyPlaceCard
                      key={nearbyPlaceKey(recommendation.place)}
                      recommendation={recommendation}
                      highlighted
                      feedback={feedbackMap.get(nearbyPlaceKey(recommendation.place))}
                      onChoose={choosePlace}
                      onFeedback={updateFeedback}
                      onCopy={copyName}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {ranked.length ? (
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">附近候选</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      已加载 {searchResults?.places.length || 0} 家，筛选后显示 {ranked.length} 家
                    </p>
                  </div>
                  {searchResults?.limitations?.length ? <Badge variant="amber">第三方数据仅供参考</Badge> : null}
                </div>
                <div className="grid gap-4 2xl:grid-cols-2">
                  {ranked.map((recommendation) => (
                    <NearbyPlaceCard
                      key={nearbyPlaceKey(recommendation.place)}
                      recommendation={recommendation}
                      feedback={feedbackMap.get(nearbyPlaceKey(recommendation.place))}
                      onChoose={choosePlace}
                      onFeedback={updateFeedback}
                      onCopy={copyName}
                    />
                  ))}
                </div>
                {hasNextPage && activeLocation ? (
                  <div className="mt-5 flex justify-center">
                    <Button
                      variant="outline"
                      disabled={searchMutation.isPending}
                      onClick={() =>
                        searchMutation.mutate({
                          ...searchInput(activeLocation),
                          page: (searchResults?.page || 1) + 1,
                        })
                      }
                    >
                      {searchMutation.isPending ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      加载更多附近门店
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : !searchResults && !searchMutation.isPending ? (
              <Card>
                <CardContent className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
                  <MapPinned className="h-10 w-10 text-primary" />
                  <h2 className="mt-4 text-lg font-semibold text-foreground">从一个位置开始</h2>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">点击&ldquo;使用当前位置&rdquo;，或输入公司地址。只有你主动操作后浏览器才会请求定位权限。</p>
                </CardContent>
              </Card>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
