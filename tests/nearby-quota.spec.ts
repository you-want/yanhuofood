import { expect, test } from "@playwright/test";
import {
  getPublicAmapQuotaConfig,
  publicAmapRequestUnits,
} from "@/lib/places/public-amap-quota";

function quotaEnv(values: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return { ...values } as NodeJS.ProcessEnv;
}

test.describe("公共高德 Key 每日额度配置", () => {
  test("未配置、0 或非法上限时关闭应用侧额度", () => {
    expect(getPublicAmapQuotaConfig(quotaEnv()).enabled).toBe(false);
    expect(
      getPublicAmapQuotaConfig(
        quotaEnv({ AMAP_PUBLIC_DAILY_REQUEST_LIMIT: "0" })
      ).enabled
    ).toBe(false);
    expect(
      getPublicAmapQuotaConfig(
        quotaEnv({ AMAP_PUBLIC_DAILY_REQUEST_LIMIT: "-1" })
      ).enabled
    ).toBe(false);
    expect(
      getPublicAmapQuotaConfig(
        quotaEnv({ AMAP_PUBLIC_DAILY_REQUEST_LIMIT: "not-a-number" })
      ).enabled
    ).toBe(false);
    expect(
      getPublicAmapQuotaConfig(
        quotaEnv({ AMAP_PUBLIC_DAILY_REQUEST_LIMIT: "1000001" })
      ).enabled
    ).toBe(false);
  });

  test("可以配置每日上限、清零时区和环境 bucket", () => {
    expect(
      getPublicAmapQuotaConfig(
        quotaEnv({
          AMAP_PUBLIC_DAILY_REQUEST_LIMIT: "150",
          AMAP_PUBLIC_QUOTA_TIME_ZONE: "America/New_York",
          AMAP_PUBLIC_QUOTA_BUCKET: "  staging  ",
        })
      )
    ).toEqual({
      enabled: true,
      dailyLimit: 150,
      timeZone: "America/New_York",
      bucket: "staging",
    });
  });

  test("非法时区和空 bucket 使用安全默认值", () => {
    expect(
      getPublicAmapQuotaConfig(
        quotaEnv({
          AMAP_PUBLIC_DAILY_REQUEST_LIMIT: "150",
          AMAP_PUBLIC_QUOTA_TIME_ZONE: "Mars/Office",
          AMAP_PUBLIC_QUOTA_BUCKET: "   ",
        })
      )
    ).toEqual({
      enabled: true,
      dailyLimit: 150,
      timeZone: "Asia/Shanghai",
      bucket: "default",
    });
  });

  test("按实际高德上游请求数量计算调用单位", () => {
    expect(publicAmapRequestUnits("geocode", "amap")).toBe(2);
    expect(publicAmapRequestUnits("search", "amap")).toBe(1);
    expect(publicAmapRequestUnits("search", "gps")).toBe(2);
    expect(publicAmapRequestUnits("reverse-geocode", "amap")).toBe(1);
    expect(publicAmapRequestUnits("reverse-geocode", "gps")).toBe(2);
  });
});
