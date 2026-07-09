const baseUrl = (process.env.VITE_API_BASE_URL || "https://84-46-251-95.sslip.io").replace(/\/$/, "");

const checks = [];

async function check(name, action) {
  const started = Date.now();
  try {
    const result = await action();
    checks.push({ name, ok: true, duration: Date.now() - started, result });
    console.log(`OK  ${name}`);
    return result;
  } catch (error) {
    checks.push({ name, ok: false, duration: Date.now() - started, error });
    console.error(`ERR ${name}: ${error.message}`);
    return null;
  }
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

async function loginAdmin() {
  const adminPassword = process.env.MOBIT_SMOKE_ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error("MOBIT_SMOKE_ADMIN_PASSWORD ortam değişkeni zorunludur.");
  }
  return request("/erp/auth/admin-login", {
    method: "POST",
    body: JSON.stringify({
      username: "admin",
      password: adminPassword,
    }),
  });
}

async function loginEmployee() {
  const userPassword = process.env.MOBIT_SMOKE_USER_PASSWORD;
  if (!userPassword) {
    throw new Error("MOBIT_SMOKE_USER_PASSWORD ortam değişkeni zorunludur.");
  }
  return request("/erp/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: process.env.MOBIT_SMOKE_USER_EMAIL || "user@mobit.com.tr",
      password: userPassword,
    }),
  });
}

function authHeaders(session) {
  return { Authorization: `Bearer ${session.access_token}` };
}

console.log(`Mobit production smoke: ${baseUrl}`);

const health = await check("health", () => request("/health"));
const admin = await check("admin login", loginAdmin);
const employee = await check("employee login", loginEmployee);

if (admin) {
  await check("admin ERP overview", () => request("/erp/overview", { headers: authHeaders(admin) }));
  await check("admin account requests", () => request("/erp/account-requests", { headers: authHeaders(admin) }));
  await check("admin document groups", () => request("/document-groups", { headers: authHeaders(admin) }));
  await check("admin app update info", () => request("/erp/app-update?current_version=1.0.6", { headers: authHeaders(admin) }));
}

if (employee) {
  await check("employee ERP overview", () => request("/erp/overview", { headers: authHeaders(employee) }));
  await check("employee notifications", () => request("/erp/notifications", { headers: authHeaders(employee) }));
  await check("employee direct messages", () => request("/erp/messages", { headers: authHeaders(employee) }));
  await check("employee app update info", () => request("/erp/app-update?current_version=1.0.6", { headers: authHeaders(employee) }));
}

const failed = checks.filter(item => !item.ok);
console.log("");
console.log(`Smoke result: ${checks.length - failed.length}/${checks.length} passed`);
for (const item of checks) {
  console.log(`${item.ok ? "PASS" : "FAIL"} ${String(item.duration).padStart(5)}ms ${item.name}`);
}

if (!health || failed.length > 0) {
  process.exitCode = 1;
}
