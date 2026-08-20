const required = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_AUTH_SITE_URL",
  "SUPABASE_AUTH_REDIRECT_URLS",
];

for (const name of required) {
  if (!process.env[name]?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

const token = process.env.SUPABASE_ACCESS_TOKEN.trim();
const projectRef = process.env.SUPABASE_PROJECT_REF.trim();
const siteUrl = new URL(process.env.SUPABASE_AUTH_SITE_URL.trim()).origin;
const requiredRedirectUrls = process.env.SUPABASE_AUTH_REDIRECT_URLS
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => new URL(value).toString().replace(/\/$/, ""));
const endpoint = `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/config/auth`;
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

const currentResponse = await fetch(endpoint, { headers });
if (!currentResponse.ok) {
  throw new Error(`Unable to read Supabase Auth config (${currentResponse.status}): ${await currentResponse.text()}`);
}
const current = await currentResponse.json();
const existingRedirectUrls = Array.isArray(current.uri_allow_list)
  ? current.uri_allow_list
  : String(current.uri_allow_list || "").split(",");
const redirectUrls = [...new Set([
  ...existingRedirectUrls.map((value) => String(value).trim()).filter(Boolean),
  ...requiredRedirectUrls,
])];

const updateResponse = await fetch(endpoint, {
  method: "PATCH",
  headers,
  body: JSON.stringify({
    site_url: siteUrl,
    uri_allow_list: redirectUrls.join(","),
  }),
});
if (!updateResponse.ok) {
  throw new Error(`Unable to update Supabase Auth config (${updateResponse.status}): ${await updateResponse.text()}`);
}

console.log(`Supabase Auth Site URL: ${siteUrl}`);
console.log(`Supabase Auth redirect URLs ensured: ${requiredRedirectUrls.join(", ")}`);
