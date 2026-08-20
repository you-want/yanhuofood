import { expect, test } from "@playwright/test";

const email = "local-login-test@example.com";
const userId = "00000000-0000-4000-8000-000000000001";

function base64Url(value: object) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  return [
    base64Url({ alg: "HS256", typ: "JWT" }),
    base64Url({ sub: userId, aud: "authenticated", role: "authenticated", email, iat: now, exp: now + 3600 }),
    "local-test-signature",
  ].join(".");
}

test("邮箱密码登录可以请求 Supabase 并建立页面会话", async ({ page }) => {
  let signedIn = false;
  let submittedCredentials: Record<string, string> | null = null;
  const now = new Date().toISOString();

  await page.route("**/api/account/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: signedIn,
        user: signedIn ? { id: userId, email, authProvider: "email" } : null,
        access: { allowed: false, reason: signedIn ? "wechat_follow_required" : "auth_required", modelConfigured: false, amapConfigured: false },
        wechat: { configured: true, loginConfigured: false, codeLoginConfigured: true, publicAccountName: "烟火食间", codeLoginTtlSeconds: 600, status: "unbound", openidBound: false, followedAt: null, statusCheckedAt: null },
      }),
    });
  });

  await page.route("http://127.0.0.1:54321/auth/v1/token?grant_type=password", async (route) => {
    submittedCredentials = route.request().postDataJSON() as Record<string, string>;
    signedIn = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: fakeAccessToken(),
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "local-refresh-token",
        user: {
          id: userId,
          aud: "authenticated",
          role: "authenticated",
          email,
          email_confirmed_at: now,
          app_metadata: { provider: "email", providers: ["email"] },
          user_metadata: {},
          identities: [],
          created_at: now,
          updated_at: now,
        },
      }),
    });
  });

  const response = await page.goto("/account");
  expect(response?.headers()["content-security-policy"]).toContain("http://127.0.0.1:54321");

  await expect(page.getByLabel("邮箱")).toBeVisible();
  await page.getByLabel("邮箱").fill("LOCAL-LOGIN-TEST@EXAMPLE.COM ");
  await page.getByLabel("密码").fill("password123");
  await page.getByRole("button", { name: "邮箱登录" }).click();

  await expect.poll(() => submittedCredentials).toEqual({ email, password: "password123", gotrue_meta_security: {} });
  await expect(page.getByRole("heading", { name: "资源访问与公众号授权" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
});

test("邮箱密码错误会显示中文提示", async ({ page }) => {
  await page.route("**/api/account/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: false,
        user: null,
        access: { allowed: false, reason: "auth_required", modelConfigured: false, amapConfigured: false },
        wechat: { configured: true, loginConfigured: false, codeLoginConfigured: true, publicAccountName: "烟火食间", codeLoginTtlSeconds: 600, status: "unbound", openidBound: false, followedAt: null, statusCheckedAt: null },
      }),
    });
  });
  await page.route("http://127.0.0.1:54321/auth/v1/token?grant_type=password", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ code: "invalid_credentials", message: "Invalid login credentials" }),
    });
  });

  await page.goto("/account");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill("wrong-password");
  await page.getByRole("button", { name: "邮箱登录" }).click();

  await expect(page.getByText("邮箱或密码不正确。")).toBeVisible();
});

test("过期验证链接会回到账户页并提示重新发送", async ({ page }) => {
  await page.route("**/api/account/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: false,
        user: null,
        access: { allowed: false, reason: "auth_required", modelConfigured: false, amapConfigured: false },
        wechat: { configured: true, loginConfigured: false, codeLoginConfigured: true, publicAccountName: "烟火食间", codeLoginTtlSeconds: 600, status: "unbound", openidBound: false, followedAt: null, statusCheckedAt: null },
      }),
    });
  });

  const error = "error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";
  await page.goto(`/?${error}#${error}`);

  await expect(page).toHaveURL("/account");
  await expect(page.getByText(/邮箱验证链接无效或已过期/)).toBeVisible();
});

test("可以重新发送指向当前站点账户页的验证邮件", async ({ page, baseURL }) => {
  let resendRequest: { url: string; body: Record<string, unknown> } | null = null;

  await page.route("**/api/account/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: false,
        user: null,
        access: { allowed: false, reason: "auth_required", modelConfigured: false, amapConfigured: false },
        wechat: { configured: true, loginConfigured: false, codeLoginConfigured: true, publicAccountName: "烟火食间", codeLoginTtlSeconds: 600, status: "unbound", openidBound: false, followedAt: null, statusCheckedAt: null },
      }),
    });
  });
  await page.route("http://127.0.0.1:54321/auth/v1/resend**", async (route) => {
    resendRequest = {
      url: route.request().url(),
      body: route.request().postDataJSON() as Record<string, unknown>,
    };
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.goto("/account");
  await page.getByLabel("邮箱").fill("LOCAL-LOGIN-TEST@EXAMPLE.COM ");
  await page.getByRole("button", { name: "验证链接无效或过期？重新发送" }).click();

  await expect.poll(() => resendRequest).not.toBeNull();
  expect(resendRequest).toMatchObject({ body: { type: "signup", email } });
  expect(new URL(resendRequest!.url).searchParams.get("redirect_to")).toBe(`${baseURL}/account`);
  await expect(page.getByText("验证邮件已重新发送。请只使用最新邮件中的验证链接。")).toBeVisible();
});

test("公众号扫码登录不可用时会保留验证码登录入口", async ({ page }) => {
  let submitted: Record<string, string> | null = null;

  await page.route("**/api/account/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: false,
        user: null,
        access: { allowed: false, reason: "auth_required", modelConfigured: false, amapConfigured: false },
        wechat: {
          configured: true,
          loginConfigured: false,
          scanLoginConfigured: false,
          codeLoginConfigured: true,
          publicAccountName: "烟火食间",
          codeLoginTtlSeconds: 600,
          status: "unbound",
          openidBound: false,
          followedAt: null,
          statusCheckedAt: null,
        },
      }),
    });
  });
  await page.route("**/api/auth/wechat/code/qr", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        qrCodeUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'/%3E",
        expiresAt: null,
        accountName: "烟火食间",
        source: "static",
      }),
    });
  });
  await page.route("**/api/auth/wechat/code/verify", async (route) => {
    submitted = route.request().postDataJSON() as Record<string, string>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, returnTo: "/account?verified=1" }),
    });
  });

  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "公众号验证码登录" })).toBeVisible();
  await expect(page.getByRole("img", { name: "烟火食间公众号登录二维码" })).toBeVisible();
  await expect(page.getByText("在公众号对话中回复【登录】", { exact: true })).toBeVisible();

  await page.getByLabel("公众号验证码").fill("123456");
  await page.getByRole("button", { name: "验证并登录" }).click();

  await expect.poll(() => submitted).toEqual({ code: "123456", returnTo: "/account" });
  await expect(page).toHaveURL(/\/account\?verified=1$/);
});

test("扫描公众号参数二维码后会自动完成登录", async ({ page }) => {
  let statusChecks = 0;
  let completedChallenge: string | null = null;

  await page.route("**/api/account/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: false,
        user: null,
        access: { allowed: false, reason: "auth_required", modelConfigured: false, amapConfigured: false },
        wechat: {
          configured: true,
          loginConfigured: false,
          scanLoginConfigured: true,
          codeLoginConfigured: true,
          publicAccountName: "烟火食间",
          codeLoginTtlSeconds: 600,
          status: "unbound",
          openidBound: false,
          followedAt: null,
          statusCheckedAt: null,
        },
      }),
    });
  });
  await page.route("**/api/auth/wechat/scan", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        challengeId: "scan-challenge-1",
        displayCode: "123456",
        qrCodeUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'/%3E",
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        accountName: "烟火食间",
      }),
    });
  });
  await page.route("**/api/auth/wechat/login/status**", async (route) => {
    statusChecks += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: statusChecks >= 2 ? "authorized" : "pending",
        displayCode: "123456",
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        failureCode: null,
      }),
    });
  });
  await page.route("**/api/auth/wechat/login/complete", async (route) => {
    completedChallenge = (route.request().postDataJSON() as { challengeId: string }).challengeId;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, returnTo: "/account?scan=success" }),
    });
  });

  await page.goto("/account");
  await expect(page.getByRole("img", { name: "烟火食间公众号登录二维码" })).toBeVisible();
  await expect.poll(() => completedChallenge, { timeout: 8000 }).toBe("scan-challenge-1");
  await expect(page).toHaveURL(/\/account\?scan=success$/);
});

test("已关注账户会把授权状态与服务端资源配置分开显示", async ({ page }) => {
  let signedIn = false;
  let refreshRequested = false;
  const now = new Date().toISOString();

  await page.route("**/api/account/me**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("refreshWechat") === "1") refreshRequested = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: signedIn,
        user: signedIn ? { id: userId, email: null, authProvider: "wechat" } : null,
        access: {
          allowed: signedIn,
          reason: signedIn ? "authenticated" : "auth_required",
          modelConfigured: false,
          amapConfigured: false,
          modelHostedConfigured: false,
          amapHostedConfigured: false,
        },
        wechat: {
          configured: true,
          loginConfigured: false,
          codeLoginConfigured: true,
          followStatusRefreshEnabled: true,
          publicAccountName: "烟火食间",
          codeLoginTtlSeconds: 600,
          status: signedIn ? "following" : "unbound",
          openidBound: signedIn,
          followedAt: signedIn ? now : null,
          statusCheckedAt: signedIn ? now : null,
        },
      }),
    });
  });

  await page.route("http://127.0.0.1:54321/auth/v1/token?grant_type=password", async (route) => {
    signedIn = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: fakeAccessToken(),
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "local-refresh-token",
        user: {
          id: userId,
          aud: "authenticated",
          role: "authenticated",
          email,
          email_confirmed_at: now,
          app_metadata: { provider: "email", providers: ["email"] },
          user_metadata: {},
          identities: [],
          created_at: now,
          updated_at: now,
        },
      }),
    });
  });

  await page.goto("/account");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill("password123");
  await page.getByRole("button", { name: "邮箱登录" }).click();

  await expect(page.getByText("账户授权已生效")).toBeVisible();
  await expect(page.getByText("授权正常，服务端未配置")).toHaveCount(2);
  await expect(page.getByText("账户已授权")).toBeVisible();
  await expect(page.getByText("等待授权或未配置")).toHaveCount(0);

  await page.getByRole("button", { name: "重新校验关注状态" }).click();
  await expect.poll(() => refreshRequested).toBe(true);
  await expect(page.getByText("公众号关注状态已重新确认，账户授权正常。")).toBeVisible();
});
