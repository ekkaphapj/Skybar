import type { Hono, Context } from "hono";

export type User = { id: number; username: string; displayName: string; role: "admin" | "employee" };
export type AppEnv = {
  Bindings: { DB: D1Database; ASSETS: Fetcher };
  Variables: { user: User; sessionHash: string };
};
const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b), n => n.toString(16).padStart(2, "0")).join("");
export const tokenHash = async (token: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(token)));
export async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100000 }, key, 256));
}
const fail = (c: Context<AppEnv>, message: string, status: 400 | 401 | 403 | 404 | 409 | 429 = 400) => c.json({ error: message }, status);
const safeUser = (row: any): User => ({ id: Number(row.ID), username: row.Username, displayName: row.DisplayName, role: row.Role });
const cookieToken = (c: Context<AppEnv>) => c.req.header("Cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith("pos_session="))?.slice(12) || "";
async function session(c: Context<AppEnv>) {
  const token = cookieToken(c);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = await tokenHash(token);
  const row = await c.env.DB.prepare(`SELECT u.* FROM UserSessions s JOIN Users u ON u.ID = s.UserID
    WHERE s.TokenHash = ? AND s.ExpiresAt > ? AND u.Active = 1`).bind(hash, Date.now()).first();
  return row ? { user: safeUser(row), hash } : null;
}
function setCookie(c: Context<AppEnv>, token: string, age: number) {
  const secure = new URL(c.req.url).protocol === "https:" ? "; Secure" : "";
  c.header("Set-Cookie", `pos_session=${token}; Path=/; Max-Age=${age}; HttpOnly; SameSite=Strict${secure}`);
}
function equalHash(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export function installAuth(app: Hono<AppEnv>) {
  app.use("/api/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    const origin = c.req.header("Origin");
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) && origin && origin !== new URL(c.req.url).origin) return fail(c, "ไม่อนุญาตคำขอจากเว็บไซต์อื่น", 403);
    await next();
  });
  app.get("/api/auth/status", async c => {
    const active = await session(c);
    return c.json({ required: true, user: active?.user || null, sellers: active ? [active.user.displayName] : [], paymentTypes: ["เงินสด", "โอน", "อื่นๆ", "Voucher"] });
  });
  app.post("/api/login", async c => {
    const b = await c.req.json().catch(() => ({}));
    const username = String(b.username || "").trim().toLowerCase(), password = String(b.password || "");
    if (!/^[a-z0-9_.-]{1,40}$/.test(username) || !password || password.length > 128) return fail(c, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", 401);
    const attemptKey = await tokenHash((c.req.header("CF-Connecting-IP") || "local") + ":" + username);
    const now = Date.now();
    const attempt = await c.env.DB.prepare(`INSERT INTO LoginAttempts (AttemptKey, Count, StartedAt) VALUES (?, 1, ?)
      ON CONFLICT(AttemptKey) DO UPDATE SET Count = CASE WHEN StartedAt < ? THEN 1 ELSE Count + 1 END,
      StartedAt = CASE WHEN StartedAt < ? THEN excluded.StartedAt ELSE StartedAt END RETURNING Count`)
      .bind(attemptKey, now, now - 900000, now - 900000).first();
    if (Number(attempt?.Count) > 5) return fail(c, "เข้าสู่ระบบผิดหลายครั้ง กรุณารอ 15 นาที", 429);
    const row = await c.env.DB.prepare("SELECT * FROM Users WHERE Username = ? COLLATE NOCASE").bind(username).first();
    const hash = await passwordHash(password, String(row?.PasswordSalt || "invalid-account-salt"));
    if (!row || !row.Active || !equalHash(hash, String(row.PasswordHash))) return fail(c, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", 401);
    const token = hex(crypto.getRandomValues(new Uint8Array(32))), hashToken = await tokenHash(token);
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM LoginAttempts WHERE AttemptKey = ? OR StartedAt < ?").bind(attemptKey, now - 86400000),
      c.env.DB.prepare("DELETE FROM UserSessions WHERE ExpiresAt <= ?").bind(now),
      c.env.DB.prepare("INSERT INTO UserSessions (TokenHash, UserID, ExpiresAt) VALUES (?, ?, ?)").bind(hashToken, row.ID, now + 43200000),
    ]);
    setCookie(c, token, 43200);
    return c.json({ ok: true, user: safeUser(row) });
  });
  app.post("/api/logout", async c => {
    const token = cookieToken(c);
    if (token) await c.env.DB.prepare("DELETE FROM UserSessions WHERE TokenHash = ?").bind(await tokenHash(token)).run();
    setCookie(c, "", 0);
    return c.json({ ok: true });
  });
  app.use("/api/*", async (c, next) => {
    const active = await session(c);
    if (!active) return fail(c, "กรุณาเข้าสู่ระบบก่อนใช้งาน", 401);
    c.set("user", active.user); c.set("sessionHash", active.hash);
    if ((c.req.path.startsWith("/api/users") || ["/api/import", "/api/export"].includes(c.req.path)) && active.user.role !== "admin") return fail(c, "เฉพาะผู้ดูแลระบบเท่านั้น", 403);
    await next();
  });
  app.get("/api/users", async c => {
    const { results } = await c.env.DB.prepare("SELECT ID, Username, DisplayName, Role, Active, CreatedAt FROM Users ORDER BY ID").all();
    return c.json(results);
  });
  app.post("/api/users", async c => {
    const b = await c.req.json().catch(() => ({}));
    const username = String(b.username || "").trim().toLowerCase(), name = String(b.displayName || "").trim(), password = String(b.password || "");
    if (!/^[a-z0-9_.-]{1,40}$/.test(username)) return fail(c, "ชื่อผู้ใช้ใช้ a-z, 0-9, จุด, ขีดกลาง หรือขีดล่าง ไม่เกิน 40 ตัว");
    if (!name || name.length > 80 || password.length < 4 || password.length > 128) return fail(c, "ใส่ชื่อพนักงานและรหัสผ่าน 4–128 ตัวอักษร");
    const salt = hex(crypto.getRandomValues(new Uint8Array(16))), hash = await passwordHash(password, salt);
    try {
      const r = await c.env.DB.prepare("INSERT INTO Users (Username, DisplayName, PasswordSalt, PasswordHash, Role) VALUES (?, ?, ?, ?, 'employee')").bind(username, name, salt, hash).run();
      return c.json({ ok: true, id: r.meta.last_row_id });
    } catch (e) { if (String(e).includes("UNIQUE")) return fail(c, "ชื่อผู้ใช้นี้มีอยู่แล้ว", 409); throw e; }
  });
  app.put("/api/users/:id", async c => {
    const row = await c.env.DB.prepare("SELECT * FROM Users WHERE ID = ?").bind(c.req.param("id")).first();
    if (!row) return fail(c, "ไม่พบผู้ใช้", 404);
    const b = await c.req.json().catch(() => ({})), name = String(b.displayName ?? row.DisplayName).trim();
    if (!name || name.length > 80 || (b.active !== undefined && typeof b.active !== "boolean")) return fail(c, "ข้อมูลพนักงานไม่ถูกต้อง");
    const active = b.active === undefined ? Number(row.Active) : Number(b.active);
    if (row.Role === "admin" && !active) return fail(c, "ไม่สามารถปิดบัญชีแอดมิน");
    let salt = row.PasswordSalt, hash = row.PasswordHash;
    if (b.password !== undefined) {
      if (typeof b.password !== "string" || b.password.length < 4 || b.password.length > 128) return fail(c, "รหัสผ่านต้องมี 4–128 ตัวอักษร");
      salt = hex(crypto.getRandomValues(new Uint8Array(16))); hash = await passwordHash(b.password, String(salt));
    }
    const statements = [c.env.DB.prepare("UPDATE Users SET DisplayName = ?, Active = ?, PasswordSalt = ?, PasswordHash = ? WHERE ID = ?").bind(name, active, salt, hash, row.ID)];
    // Revoke all sessions whenever credentials, identity, or status change.
    statements.push(c.env.DB.prepare("DELETE FROM UserSessions WHERE UserID = ?").bind(row.ID));
    await c.env.DB.batch(statements);
    return c.json({ ok: true });
  });
}
