const baseUrl = (process.env.VITE_API_BASE_URL || "https://84-46-251-95.sslip.io").replace(/\/$/, "");
const latestVersion = process.env.MOBIT_APP_LATEST_VERSION || process.argv[2] || "";
const adminPassword = process.env.MOBIT_BROADCAST_ADMIN_PASSWORD;

if (!adminPassword) {
  console.error("MOBIT_BROADCAST_ADMIN_PASSWORD zorunlu. Bildirim yayını iptal edildi.");
  process.exit(1);
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.message || payload?.detail || `${response.status} ${response.statusText}`);
  }
  return payload;
}

const admin = await request("/erp/auth/admin-login", {
  method: "POST",
  body: JSON.stringify({
    username: process.env.MOBIT_BROADCAST_ADMIN_USERNAME || "admin",
    password: adminPassword,
  }),
});

const result = await request("/erp/app-update/broadcast", {
  method: "POST",
  headers: { Authorization: `Bearer ${admin.access_token}` },
  body: JSON.stringify(latestVersion ? { latest_version: latestVersion } : {}),
});

console.log("Güncelleme bildirimi gönderildi.");
console.log(`Sürüm: ${result.latest_version}`);
console.log(`Aktif cihaz kullanıcısı: ${result.active_device_users}`);
console.log(`Oluşturulan bildirim: ${result.notifications_created}`);
