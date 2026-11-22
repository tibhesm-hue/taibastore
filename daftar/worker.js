// Daftar (Aswaq Taiba ledger) server: storage for the ledger copied from Claude, Google sign-in, and the app page.
const CH = 900 * 1024;
const PART_MAX = 320 * 1024 * 1024;
const GCID = "602073315832-ohi4d153hc72bt3hgc1lafmfggh4ugrn.apps.googleusercontent.com";
const OWNER = "tibh.esm@gmail.com";
const STAFF_UID = "u_plcBBY5KGYlOLnOuuOKw5A";
const PUB = "https://tibhesm-hue.github.io/taibastore/daftar";
const SES_DAYS = 120;
// db access rules, same as the ledger's declared rules on Claude
const OWNER_READ = ["oledger", "omonths", "snap"];
const OWNER_WRITE = ["settings", "sales", "slqok", "slcat", "stockq", "slsales", "slday", "slrecent", "slcust", "pgoff", "appver", "notify", "oledger", "omonths", "rewards", "snap"];

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-Key" };
const json = (o, s, h) => new Response(JSON.stringify(o), { status: s || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...(h || {}) } });
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const sha = async s => hex(await crypto.subtle.digest("SHA-256", typeof s === "string" ? new TextEncoder().encode(s) : s));
const rnd = () => hex(crypto.getRandomValues(new Uint8Array(24)));
const b64u = t => { t = String(t).replace(/-/g, "+").replace(/_/g, "/"); while (t.length % 4) t += "="; return Uint8Array.from(atob(t), c => c.charCodeAt(0)); };
const bytes = b => typeof b === "string" ? Uint8Array.from(atob(b), c => c.charCodeAt(0)) : new Uint8Array(b);
const part = (env, p) => (p === 3 ? env.IMG3 : p === 2 ? env.IMG2 : env.IMG1);

async function pub(p) {
  const f = p === "/" ? "/index.html" : p;
  if (!/^\/[A-Za-z0-9._-]+$/.test(f)) return null;
  const r = await fetch(PUB + f + "?v=" + Math.floor(Date.now() / 60000), { cf: { cacheTtl: 60 } });
  if (!r.ok) return new Response("not found", { status: 404 });
  const h = new Headers(r.headers); h.set("Cache-Control", "no-cache"); h.delete("x-github-request-id");
  return new Response(r.body, { status: 200, headers: h });
}

let ready = false;
async function init(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS docs (col TEXT NOT NULL, id TEXT NOT NULL, data TEXT, v INTEGER DEFAULT 1, at INTEGER, PRIMARY KEY (col,id))"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS docs_at ON docs(at)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS dels (col TEXT NOT NULL, id TEXT NOT NULL, at INTEGER, PRIMARY KEY (col,id))"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS dels_at ON dels(at)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, name TEXT, mime TEXT, size INTEGER, part INTEGER, n INTEGER, sha TEXT, at INTEGER)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, uid TEXT, name TEXT, at INTEGER)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS sess (hh TEXT PRIMARY KEY, email TEXT, at INTEGER)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS apphtml (seq INTEGER PRIMARY KEY, txt TEXT)")
  ]);
  for (const P of [env.IMG1, env.IMG2, env.IMG3]) await P.prepare("CREATE TABLE IF NOT EXISTS blobs (id TEXT NOT NULL, seq INTEGER NOT NULL, b BLOB, PRIMARY KEY (id,seq))").run();
  ready = true;
}

// ---------- Google sign-in (ID token from Google Identity Services) ----------
let GCERT = null;
async function gVerify(tok, env) {
  const P = String(tok || "").split("."); if (P.length !== 3) return null;
  let hd, pl; try { hd = JSON.parse(new TextDecoder().decode(b64u(P[0]))); pl = JSON.parse(new TextDecoder().decode(b64u(P[1]))); } catch (e) { return null; }
  if (!GCERT || Date.now() - GCERT.at > 3600e3) { const j = env && env.__GCERTS ? env.__GCERTS : await (await fetch("https://www.googleapis.com/oauth2/v3/certs")).json(); GCERT = { at: Date.now(), keys: j.keys || [] }; }
  const k = GCERT.keys.find(x => x.kid === hd.kid); if (!k || hd.alg !== "RS256") return null;
  const key = await crypto.subtle.importKey("jwk", { kty: k.kty, n: k.n, e: k.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64u(P[2]), new TextEncoder().encode(P[0] + "." + P[1])))) return null;
  if (pl.aud !== GCID || !["accounts.google.com", "https://accounts.google.com"].includes(pl.iss) || !(pl.exp * 1000 > Date.now()) || !(pl.email_verified === true || pl.email_verified === "true") || !pl.email) return null;
  return pl;
}
function cookie(req, n) { const m = (req.headers.get("Cookie") || "").match(new RegExp("(?:^|; )" + n + "=([^;]+)")); return m ? m[1] : ""; }
async function userOf(env, email) {
  email = String(email || "").toLowerCase();
  const u = await env.DB.prepare("SELECT uid,name FROM users WHERE email=?").bind(email).first();
  if (email === OWNER) return { email, owner: true, uid: (u && u.uid) || "u_owner", name: (u && u.name) || "صاحب المحل" };
  if (!u) return null;
  return { email, owner: false, uid: u.uid || STAFF_UID, name: u.name || "" };
}
async function who(req, env) {
  const t = cookie(req, "dsid"); if (!t) return null;
  const s = await env.DB.prepare("SELECT email,at FROM sess WHERE hh=?").bind(await sha("s|" + t)).first();
  if (!s || Date.now() - s.at > SES_DAYS * 864e5) return null;
  return userOf(env, s.email);
}

// ---------- document store with the ledger's rules ----------
const top = p => String(p).split("/")[0];
const canRead = (u, col) => u.owner || !OWNER_READ.includes(top(col));
const canWrite = (u, col) => u.owner || !OWNER_WRITE.includes(top(col));
const isObj = x => x && typeof x === "object" && !Array.isArray(x);
function merge(a, b) { const o = isObj(a) ? { ...a } : {}; for (const k of Object.keys(b)) o[k] = isObj(b[k]) && isObj(o[k]) ? merge(o[k], b[k]) : b[k]; return o; }
function splitDoc(path) { const s = String(path || "").split("/"); if (s.length < 2 || s.length % 2 || s.some(x => !x)) return null; return { col: s.slice(0, -1).join("/"), id: s[s.length - 1] }; }
function getf(o, f) { return String(f).split(".").reduce((x, k) => (x == null ? undefined : x[k]), o); }
function cmp(a, b) { if (a === b) return 0; if (a === undefined) return 1; if (b === undefined) return -1; return a < b ? -1 : a > b ? 1 : 0; }
const J = x => JSON.stringify(x);
function test(v, op, x) {
  switch (op) {
    case "==": return J(v) === J(x);
    case "!=": return v !== undefined && J(v) !== J(x);
    case "<": return v !== undefined && v < x; case "<=": return v !== undefined && v <= x;
    case ">": return v !== undefined && v > x; case ">=": return v !== undefined && v >= x;
    case "in": return Array.isArray(x) && x.some(y => J(y) === J(v));
    case "not-in": return v !== undefined && Array.isArray(x) && !x.some(y => J(y) === J(v));
    case "array-contains": return Array.isArray(v) && v.some(y => J(y) === J(x));
  }
  return false;
}
async function writeDoc(env, col, id, data) {
  const at = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO docs (col,id,data,v,at) VALUES (?,?,?,1,?) ON CONFLICT(col,id) DO UPDATE SET data=excluded.data, v=docs.v+1, at=excluded.at").bind(col, id, JSON.stringify(data), at),
    env.DB.prepare("DELETE FROM dels WHERE col=? AND id=?").bind(col, id)
  ]);
  return at;
}
async function dbOp(env, u, o) {
  const op = o.op;
  if (op === "query") {
    const col = String(o.col || ""); if (!col || !canRead(u, col)) return { docs: [] };
    const r = await env.DB.prepare("SELECT id,data FROM docs WHERE col=?").bind(col).all();
    let L = (r.results || []).map(x => ({ id: x.id, data: JSON.parse(x.data) }));
    for (const w of (o.where || [])) L = L.filter(d => test(getf(d.data, w[0]), w[1], w[2]));
    if (o.orderBy) {
      const [f, dir] = o.orderBy;
      const has = L.filter(d => getf(d.data, f) !== undefined), no = L.filter(d => getf(d.data, f) === undefined);
      has.sort((a, b) => cmp(getf(a.data, f), getf(b.data, f)) || (a.id < b.id ? -1 : 1)); if (dir === "desc") has.reverse();
      no.sort((a, b) => (a.id < b.id ? -1 : 1)); L = has.concat(no);
    } else L.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (o.limit) L = L.slice(0, Math.max(1, Math.min(1000, +o.limit)));
    return { docs: L };
  }
  const d = splitDoc(o.path); if (!d) throw new Error("invalid_argument");
  if (op === "get") { if (!canRead(u, d.col)) return { exists: false }; const r = await env.DB.prepare("SELECT data FROM docs WHERE col=? AND id=?").bind(d.col, d.id).first(); return r ? { exists: true, data: JSON.parse(r.data) } : { exists: false }; }
  if (!canWrite(u, d.col)) throw new Error("invalid_argument");
  if (op === "set") { if (!isObj(o.data)) throw new Error("invalid_argument"); return { at: await writeDoc(env, d.col, d.id, o.data) }; }
  if (op === "update") {
    const r = await env.DB.prepare("SELECT data FROM docs WHERE col=? AND id=?").bind(d.col, d.id).first();
    if (!r || !isObj(o.data)) throw new Error("invalid_argument");
    return { at: await writeDoc(env, d.col, d.id, merge(JSON.parse(r.data), o.data)) };
  }
  if (op === "delete") {
    const at = Date.now();
    await env.DB.batch([env.DB.prepare("DELETE FROM docs WHERE col=? AND id=?").bind(d.col, d.id), env.DB.prepare("INSERT OR REPLACE INTO dels (col,id,at) VALUES (?,?,?)").bind(d.col, d.id, at)]);
    return { at };
  }
  throw new Error("invalid_argument");
}

// ---------- photos ----------
async function putAsset(env, id, buf, mime) {
  const size = buf.byteLength, h = hex(await crypto.subtle.digest("SHA-256", buf));
  const used = {}; for (const x of ((await env.DB.prepare("SELECT part, SUM(size) s FROM assets GROUP BY part").all()).results || [])) used[x.part] = x.s;
  let pt = 1; while (pt < 3 && (used[pt] || 0) + size > PART_MAX) pt++;
  const P = part(env, pt), st = [P.prepare("DELETE FROM blobs WHERE id=?").bind(id)]; let n = 0;
  for (let o = 0; o < size; o += CH) st.push(P.prepare("INSERT INTO blobs (id,seq,b) VALUES (?,?,?)").bind(id, n++, new Uint8Array(buf.slice(o, o + CH))));
  await P.batch(st);
  await env.DB.prepare("INSERT OR REPLACE INTO assets (id,name,mime,size,part,n,sha,at) VALUES (?,?,?,?,?,?,?,?)").bind(id, "", mime || "application/octet-stream", size, pt, n, h, Date.now()).run();
  return { id, url: "/_blob/" + id, sizeBytes: size, contentType: mime || "application/octet-stream" };
}
async function getAsset(env, id) {
  const a = await env.DB.prepare("SELECT * FROM assets WHERE id=?").bind(id).first(); if (!a) return null;
  const r = await part(env, a.part).prepare("SELECT b FROM blobs WHERE id=? ORDER BY seq").bind(a.id).all();
  return new Response(new Blob((r.results || []).map(x => bytes(x.b))), { headers: { "Content-Type": a.mime || "application/octet-stream", "Cache-Control": "private, max-age=31536000, immutable" } });
}

// ---------- the app page: the ledger's own HTML (copied from Claude) with the bridge script in front ----------
async function appPage(env) {
  const av = await env.DB.prepare("SELECT v FROM meta WHERE k='appv'").first(); if (!av) return null;
  const v = +av.v, r = await env.DB.prepare("SELECT txt FROM apphtml WHERE seq>=? AND seq<? ORDER BY seq").bind(v * 1000, v * 1000 + 1000).all();
  let html = (r.results || []).map(x => x.txt).join("");
  if (!html) return null;
  const tag = '<script src="/shim.js?v=' + Math.floor(Date.now() / 600e3) + '"></script><link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#0e5a3c"><link rel="apple-touch-icon" href="/i192.png">';
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + tag) : tag + html;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const u = new URL(req.url), p = u.pathname, q = u.searchParams;
    try {
      await init(env);
      if (p === "/api/ping") return json({ daftar: "ready", db: 1 });
      if (p === "/api/login" && req.method === "POST") {
        const o = await req.json().catch(() => ({})), pl = await gVerify(o.t, env);
        if (!pl) return json({ ok: false, err: "token" }, 401);
        const usr = await userOf(env, pl.email);
        if (!usr) return json({ ok: false, err: "not_allowed", email: String(pl.email).toLowerCase() }, 403);
        const t = rnd();
        await env.DB.prepare("INSERT INTO sess (hh,email,at) VALUES (?,?,?)").bind(await sha("s|" + t), usr.email, Date.now()).run();
        return json({ ok: true }, 200, { "Set-Cookie": "dsid=" + t + "; Path=/; Max-Age=" + SES_DAYS * 86400 + "; HttpOnly; Secure; SameSite=Lax" });
      }
      if (p === "/api/register" && req.method === "POST") {
        const o = await req.json().catch(() => ({})), pl = await gVerify(o.t, env);
        if (!pl) return json({ ok: false, err: "token" }, 401);
        const email = String(pl.email).toLowerCase();
        if (await userOf(env, email)) return json({ ok: false, err: "already" }, 400);
        const f = o.f || {}, cl = x => String(x == null ? "" : x).trim().slice(0, 120);
        const rec = { email, gname: cl(pl.name), name: cl(f.name), idno: cl(f.idno), phone: cl(f.phone), job: cl(f.job), nat: cl(f.nat), note: cl(f.note), photo: cl(pl.picture).slice(0, 500), at: Date.now(), st: "wait" };
        if (!rec.name || !rec.idno || !rec.phone) return json({ ok: false, err: "fields" }, 400);
        await writeDoc(env, "staffreq", (await sha("r|" + email)).slice(0, 24), rec);
        return json({ ok: true });
      }
      if (p === "/api/logout") { const t = cookie(req, "dsid"); if (t) await env.DB.prepare("DELETE FROM sess WHERE hh=?").bind(await sha("s|" + t)).run(); return json({ ok: true }, 200, { "Set-Cookie": "dsid=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax" }); }

      const me = await who(req, env);
      if (p === "/") {
        if (!me) return Response.redirect(PUB + "/g.html", 302);
        const pg = await appPage(env); if (pg) return pg;
        return pub("/wait.html");
      }
      if (!p.startsWith("/api/") && !p.startsWith("/_blob/")) { const r = await pub(p); return r || json({ ok: false }, 404); }
      if (!me) return json({ ok: false, err: "login" }, 401);

      if (p === "/api/me") return json({ ok: true, email: me.email, owner: me.owner, uid: me.uid, name: me.name });
      if (p === "/api/users") {
        if (!me.owner) return json({ ok: false }, 403);
        if (req.method === "POST") {
          const o = await req.json(), email = String(o.email || "").trim().toLowerCase();
          if (!/^[^@\s]+@[^@\s]+$/.test(email) || email === OWNER) return json({ ok: false, err: "email" }, 400);
          if (o.remove) { await env.DB.batch([env.DB.prepare("DELETE FROM users WHERE email=?").bind(email), env.DB.prepare("DELETE FROM sess WHERE email=?").bind(email)]); return json({ ok: true }); }
          await env.DB.prepare("INSERT OR REPLACE INTO users (email,uid,name,at) VALUES (?,?,?,?)").bind(email, String(o.uid || STAFF_UID), String(o.name || "").slice(0, 80), Date.now()).run();
          return json({ ok: true });
        }
        const r = (await env.DB.prepare("SELECT email,uid,name,at FROM users ORDER BY at").all()).results || [];
        return json({ ok: true, users: r });
      }
      if (p === "/api/db" && req.method === "POST") {
        const o = await req.json();
        try { return json({ ok: true, r: await dbOp(env, me, o) }); } catch (e) { const m = String(e && e.message || e); return json({ ok: false, code: m === "invalid_argument" ? "invalid_argument" : "unavailable", err: m }, 400); }
      }
      if (p === "/api/changes") {
        const since = +q.get("since") || 0, now = Date.now();
        const a = (await env.DB.prepare("SELECT col,id,at FROM docs WHERE at>? ORDER BY at LIMIT 3000").bind(since).all()).results || [];
        const d = (await env.DB.prepare("SELECT col,id,at FROM dels WHERE at>? ORDER BY at LIMIT 3000").bind(since).all()).results || [];
        return json({ ok: true, now, full: a.length >= 3000 || d.length >= 3000, ch: a.concat(d).filter(x => canRead(me, x.col)).map(x => [x.col, x.id, x.at]) });
      }
      if (p.startsWith("/_blob/")) { const r = await getAsset(env, decodeURIComponent(p.slice(7))); return r || new Response("not found", { status: 404 }); }
      if (p === "/api/asset" && req.method === "PUT") {
        const buf = await req.arrayBuffer(); if (!buf.byteLength) return json({ ok: false, err: "empty" }, 400);
        if (buf.byteLength > 20 * 1048576) return json({ ok: false, err: "too_big" }, 413);
        return json({ ok: true, r: await putAsset(env, "d" + Date.now().toString(36) + rnd().slice(0, 10), buf, req.headers.get("Content-Type")) });
      }
      if (p === "/api/assets") {
        const r = (await env.DB.prepare("SELECT id,mime,size FROM assets ORDER BY at").all()).results || [];
        const tot = r.reduce((s, x) => s + (+x.size || 0), 0);
        return json({ ok: true, assets: r.map(x => ({ id: x.id, url: "/_blob/" + x.id, sizeBytes: x.size, contentType: x.mime })), usage: { bytes: tot, maxBytes: 3 * PART_MAX } });
      }
      if (p === "/api/asset/delete" && req.method === "POST") {
        if (!me.owner) return json({ ok: false }, 403);
        const o = await req.json(), id = String(o.id || ""), a = await env.DB.prepare("SELECT part FROM assets WHERE id=?").bind(id).first();
        if (a) { await part(env, a.part).prepare("DELETE FROM blobs WHERE id=?").bind(id).run(); await env.DB.prepare("DELETE FROM assets WHERE id=?").bind(id).run(); }
        return json({ ok: true });
      }
      return json({ ok: false, err: "not_found" }, 404);
    } catch (e) {
      return json({ ok: false, err: String(e && e.message || e) }, 500);
    }
  }
};
