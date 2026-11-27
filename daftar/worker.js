
// Daftar (Aswaq Taiba ledger) server: storage for the ledger copied from Claude, Google sign-in, and the app page.
const CH = 900 * 1024;
const PART_MAX = 320 * 1024 * 1024;
const GCID = "602073315832-ohi4d153hc72bt3hgc1lafmfggh4ugrn.apps.googleusercontent.com";
const OWNER = "tibh.esm@gmail.com";
/* owner 24 Nov: a second owner with the same rights */
const OWNERS = [OWNER, "amalmateq1@gmail.com"];
const STAFF_UID = "u_plcBBY5KGYlOLnOuuOKw5A";
const PUB = "https://tibhesm-hue.github.io/taibastore/daftar";
const SES_DAYS = 399;
// db access rules, same as the ledger's declared rules on Claude
const OWNER_READ = ["oledger", "omonths", "snap", "posinv", "posshift", "posord"];
const OWNER_WRITE = ["settings", "sales", "slqok", "slcat", "stockq", "slsales", "slday", "slrecent", "slcust", "pgoff", "appver", "notify", "oledger", "omonths", "rewards", "snap", "posinv", "posshift", "posord"];

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-Key" };
const json = (o, s, h) => new Response(JSON.stringify(o), { status: s || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...(h || {}) } });
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const sha = async s => hex(await crypto.subtle.digest("SHA-256", typeof s === "string" ? new TextEncoder().encode(s) : s));
const rnd = () => hex(crypto.getRandomValues(new Uint8Array(24)));
const b64u = t => { t = String(t).replace(/-/g, "+").replace(/_/g, "/"); while (t.length % 4) t += "="; return Uint8Array.from(atob(t), c => c.charCodeAt(0)); };
const bytes = b => typeof b === "string" ? Uint8Array.from(atob(b), c => c.charCodeAt(0)) : new Uint8Array(b);
const part = (env, p) => (p === 3 ? env.IMG3 : p === 2 ? env.IMG2 : env.IMG1);

/* owner 24 Nov: every page file fetched from GitHub is also kept in the server (table pubc); if GitHub is down the kept copy is served */
let PUBENV = null;
async function pub(p) {
  const f = p === "/" ? "/index.html" : p;
  if (!/^\/[A-Za-z0-9._-]+$/.test(f)) return null;
  const env = PUBENV;
  let r = null; try { r = await fetch(PUB + f + "?v=" + Math.floor(Date.now() / 60000), { cf: { cacheTtl: 60 } }); } catch (e) { r = null; }
  if (r && r.ok) {
    const buf = new Uint8Array(await r.arrayBuffer()), ct = r.headers.get("Content-Type") || "application/octet-stream";
    if (env && buf.byteLength < 1500000) { try { const h = await sha(buf); const old = await env.DB.prepare("SELECT h FROM pubc WHERE f=?").bind(f).first(); if (!old || old.h !== h) await env.DB.prepare("INSERT OR REPLACE INTO pubc (f,ct,b,h,at) VALUES (?,?,?,?,?)").bind(f, ct, buf, h, Date.now()).run(); } catch (e) { } }
    return new Response(buf, { status: 200, headers: { "Content-Type": ct, "Cache-Control": "no-cache" } });
  }
  if (env) { try { const c = await env.DB.prepare("SELECT ct,b FROM pubc WHERE f=?").bind(f).first(); if (c) return new Response(new Uint8Array(c.b), { status: 200, headers: { "Content-Type": c.ct, "Cache-Control": "no-cache", "X-From": "server-copy" } }); } catch (e) { } }
  return new Response("not found", { status: 404 });
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
    env.DB.prepare("CREATE TABLE IF NOT EXISTS apphtml (seq INTEGER PRIMARY KEY, txt TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS pubc (f TEXT PRIMARY KEY, ct TEXT, b BLOB, h TEXT, at INTEGER)")
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
  if (OWNERS.includes(email)) return { email, owner: true, uid: (u && u.uid) || "u_owner", name: (u && u.name) || "صاحب المحل" };
  if (!u) return null;
  return { email, owner: false, uid: u.uid || STAFF_UID, name: u.name || "" };
}
async function who(req, env) {
  const t = cookie(req, "dsid"); if (!t) return null;
  const s = await env.DB.prepare("SELECT email,at,pin FROM sess WHERE hh=?").bind(await sha("s|" + t)).first();
  if (!s || Date.now() - s.at > SES_DAYS * 864e5 || String(s.email).endsWith("@pos.taiba")) return null;
  const uu = await userOf(env, s.email); if (uu) uu.pinOk = s.pin === 1; return uu;
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
/* owner 25 Nov: an item a cashier adds from the ledger (slq kind add) reaches the POS catalogue at once — no waiting for the Smart Life post */
async function posSyncSlq(env) {
  const since = Date.now() - 36 * 3600e3;
  const rows = ((await env.DB.prepare("SELECT data FROM docs WHERE col='slq' AND at>? ORDER BY at").bind(since).all()).results || []).map(r => { try { return JSON.parse(r.data); } catch (e) { return null; } }).filter(Boolean);
  const nr = await env.DB.prepare("SELECT data FROM docs WHERE col='posnm' AND id='main'").first(); let no = { m: {} }; try { if (nr) no = JSON.parse(nr.data); } catch (e) { }
  no.n = no.n || {}; const c = await posCat(env); let ch = 0;
  for (const d of rows) { if (d.status === "cancelled" || d.status === "rejected") continue;
    for (const it of (d.items || [])) { if (!it || !it.add || !it.code) continue; const code = String(it.code), nm = String(it.newName || it.name || "").trim(), pr = +it.newPrice;
      if (!nm || !(pr > 0) || c.by.has(code) || no.n[code]) continue; no.n[code] = [code, nm, pr, 0, 0, 0, pr]; ch++; } }
  if (ch) { no.at = Date.now(); await writeDoc(env, "posnm", "main", no); POSCAT = null; }
  return ch;
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
    /* owner 24 Nov: the sales chart reads the whole slsales collection — the POS sales join here too, not only on single-month reads */
    if (col === "slsales") for (const d of L) { if (/^\d{4}-\d{2}$/.test(d.id) && d.id >= "2026-11") { try { d.data = await posSalesMerge(env, d.id, d.data) || d.data; } catch (e) { } } }
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
  if (op === "get") { if (!canRead(u, d.col)) return { exists: false }; const r = await env.DB.prepare("SELECT data FROM docs WHERE col=? AND id=?").bind(d.col, d.id).first(); if (d.col === "slsales" && /^\d{4}-\d{2}$/.test(d.id) && d.id >= "2026-11") { const x = r ? JSON.parse(r.data) : null; const m = await posSalesMerge(env, d.id, x); return m ? { exists: true, data: m } : { exists: false }; } /* owner 24 Nov: the owner's customer balances (slcust/main) also count the POS «آجل» invoices of the sales branch (read-time merge) */ if (d.col === "slcust" && d.id === "main" && r) { const x = JSON.parse(r.data); try { const L = await posCustList(env), m = new Map(L.map(z => [z[0], z[1]])); x.shop = (x.shop || []).map(z => m.has(String(z[0]).trim()) ? [z[0], m.get(String(z[0]).trim())] : z); } catch (e) { } return { exists: true, data: x }; } if (d.col === "slday" && /^inv-\d{4}-\d{2}-\d{2}$/.test(d.id)) { const m = await posSlMerge(env, d.id.slice(4), r ? JSON.parse(r.data) : null); return m ? { exists: true, data: m } : { exists: false }; } return r ? { exists: true, data: JSON.parse(r.data) } : { exists: false }; }
  if (!canWrite(u, d.col)) throw new Error("invalid_argument");
  /* owner 26 Nov: closings are balanced per POS shift only; the old time-window form can no longer create one (cashiers); updates/edits and the owner are untouched */
  if (op === "set" && !u.owner && /^months\/\d{4}-\d{2}\/closings$/.test(d.col) && isObj(o.data) && !(o.data.pos && o.data.pos.shift) && String(o.data.date || "") >= "2026-11-26") { const ex = await env.DB.prepare("SELECT 1 x FROM docs WHERE col=? AND id=?").bind(d.col, d.id).first(); if (!ex) throw new Error("old_closing_blocked"); }
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
  const mu = await env.DB.prepare("SELECT v FROM meta WHERE k='part_used'").first(); let used = mu ? JSON.parse(mu.v) : null;
  if (!used) { used = {}; for (const x of ((await env.DB.prepare("SELECT part, SUM(size) s FROM assets GROUP BY part").all()).results || [])) used[x.part] = x.s; }
  let pt = 1; while (pt < 3 && (used[pt] || 0) + size > PART_MAX) pt++;
  const P = part(env, pt), st = [P.prepare("DELETE FROM blobs WHERE id=?").bind(id)]; let n = 0;
  for (let o = 0; o < size; o += CH) st.push(P.prepare("INSERT INTO blobs (id,seq,b) VALUES (?,?,?)").bind(id, n++, new Uint8Array(buf.slice(o, o + CH))));
  await P.batch(st);
  await env.DB.prepare("INSERT OR REPLACE INTO assets (id,name,mime,size,part,n,sha,at) VALUES (?,?,?,?,?,?,?,?)").bind(id, "", mime || "application/octet-stream", size, pt, n, h, Date.now()).run();
  used[pt] = (used[pt] || 0) + size; await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES ('part_used',?)").bind(JSON.stringify(used)).run();
  return { id, url: "/_blob/" + id, sizeBytes: size, contentType: mime || "application/octet-stream" };
}
async function getAsset(env, id) {
  const a = await env.DB.prepare("SELECT * FROM assets WHERE id=?").bind(id).first(); if (!a) return null;
  const r = await part(env, a.part).prepare("SELECT b FROM blobs WHERE id=? ORDER BY seq").bind(a.id).all();
  return new Response(new Blob((r.results || []).map(x => bytes(x.b))), { headers: { "Content-Type": a.mime || "application/octet-stream", "Cache-Control": "private, max-age=31536000, immutable" } });
}

// ---------- customer price page: copied once from the old Claude page, then served here (public, no login) ----------
const PP_ORIGIN = "https://9e1ca49b-5d0c-4de6-a2fc-5dbc4640943a.frame.claudeusercontent.com";
const PP_BASE = PP_ORIGIN + "/_f/1795388767-44e4/";
const ppPaths = () => { const a = ["index.html"]; for (let i = 0; i <= 44; i++) a.push("s/" + i + ".jpg"); for (let i = 0; i <= 179; i++) a.push("z/" + i + ".jpg"); return a; };
async function ppSync(env) {
  const st = await env.DB.prepare("SELECT v FROM meta WHERE k='pp_state'").first();
  const S = st ? JSON.parse(st.v) : {};
  if (S.complete) return;
  const have = new Set(((await env.DB.prepare("SELECT id FROM assets WHERE id LIKE 'pp:%'").all()).results || []).map(r => r.id));
  const fail = {}; let n = 0;
  for (const path of ppPaths()) {
    if (have.has("pp:" + path)) continue;
    if (n >= 12) break;
    try {
      const r = await fetch(PP_BASE + path); if (!r.ok) throw new Error("st" + r.status);
      const buf = await r.arrayBuffer(); if (!buf.byteLength) throw new Error("empty");
      await putAsset(env, "pp:" + path, buf, r.headers.get("content-type") || (path.endsWith(".jpg") ? "image/jpeg" : "text/html; charset=utf-8")); n++;
    } catch (e) { fail[path] = String(e && e.message || e).slice(0, 60); }
  }
  const total = ppPaths().length, got = have.size + n;
  await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES ('pp_state',?)").bind(JSON.stringify({ complete: got >= total && !Object.keys(fail).length, got, total, fail, at: Date.now() })).run();
}
async function ppPage(env) {
  const r = await getAsset(env, "pp:index.html"); if (!r) return null;
  let html = (await r.text()).split("/_blob/").join("/p/b/");
  const tag = '<meta name="robots" content="noindex"><script>window.claude={use:function(){return Promise.resolve(null)}};</script>' + PP_ORDER_HOOK + PP_LOC_HOOK + PP_PV_HOOK;
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + tag) : tag + html;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

// ---------- customer price page: owner photos copy + instant update from approved cashier requests (no Claude involved) ----------
const PP_BASE_AT = 1795388767000;
const ppNorm = s => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
function ppBlock(html, name) {
  const tag = '<script type="application/json" id="' + name + '">';
  const a = html.indexOf(tag); if (a < 0) return null;
  const s = a + tag.length, e = html.indexOf("</script>", s); if (e < 0) return null;
  return { s, e, obj: JSON.parse(html.slice(s, e)) };
}
const ppJson = o => JSON.stringify(o).replace(/</g, "\\u003c");
async function ppUplSync(env) {
  const r = await getAsset(env, "pp:index.html"); if (!r) return;
  const B = ppBlock(await r.text(), "upl"); if (!B) return;
  const ids = [...new Set(Object.values(B.obj).filter(x => x && typeof x === "string"))];
  const st = await env.DB.prepare("SELECT v FROM meta WHERE k='pp_upl'").first();
  const S = st ? JSON.parse(st.v) : { fail: {}, how: -1 };
  const have = new Set(((await env.DB.prepare("SELECT id FROM assets WHERE id LIKE 'pp:b:%'").all()).results || []).map(x => x.id));
  const urls = id => [PP_ORIGIN + "/_blob/" + id, PP_BASE + "_blob/" + id, PP_ORIGIN + "/_assets/" + id];
  let n = 0;
  for (const id of ids) {
    if (have.has("pp:b:" + id) || (S.fail[id] || 0) >= 3) continue;
    if (n >= 40) break;
    let ok = false;
    const order = S.how >= 0 ? [S.how, ...[0, 1, 2].filter(x => x !== S.how)] : [0, 1, 2];
    for (const k of order) {
      try {
        const x = await fetch(urls(id)[k]); if (!x.ok) continue;
        const buf = await x.arrayBuffer(); if (!buf.byteLength) continue;
        await putAsset(env, "pp:b:" + id, buf, x.headers.get("content-type") || "image/jpeg"); S.how = k; ok = true; n++; break;
      } catch (e) { }
    }
    if (!ok) S.fail[id] = (S.fail[id] || 0) + 1;
  }
  const got = ids.filter(id => have.has("pp:b:" + id)).length + n;
  S.total = ids.length; S.got = got; S.at = Date.now();
  await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES ('pp_upl',?)").bind(JSON.stringify(S)).run();
}
async function ppCopyPhoto(env, id) {
  if (!id) return false;
  const h = await env.DB.prepare("SELECT 1 x FROM assets WHERE id=?").bind("pp:b:" + id).first(); if (h) return true;
  const r = await getAsset(env, id); if (!r) return false;
  const buf = await r.arrayBuffer(); if (!buf.byteLength) return false;
  await putAsset(env, "pp:b:" + id, buf, r.headers.get("Content-Type") || "image/jpeg"); return true;
}
async function ppUpdate(env) {
  const rows = (await env.DB.prepare("SELECT id,data FROM docs WHERE col='slq' AND json_extract(data,'$.status') IN ('done','partial','pending') AND COALESCE(json_extract(data,'$.doneAt'),json_extract(data,'$.approvedAt'))>? AND json_extract(data,'$.ppDone') IS NULL ORDER BY COALESCE(json_extract(data,'$.doneAt'),json_extract(data,'$.approvedAt')) LIMIT 40").bind(PP_BASE_AT).all()).results || [];
  if (!rows.length) return;
  const pr = await getAsset(env, "pp:index.html"); if (!pr) return;
  let html = await pr.text();
  const B = { data: ppBlock(html, "data"), upl: ppBlock(html, "upl"), disp: ppBlock(html, "disp") };
  if (!B.data || !B.upl || !B.disp) return;
  const D = B.data.obj, U = B.upl.obj, P = B.disp.obj;
  D.items = D.items || []; D.offers = D.offers || [];
  const n0 = D.items.length, good = x => x === "ok" || x === "already" || x === "exists";
  const find = nm => D.items.findIndex(x => ppNorm(x[0]) === ppNorm(nm));
  const num = v => (v == null || v === "" || isNaN(+v) ? null : +v);
  let any = false; const out = [];
  for (const r of rows) {
    const d0 = JSON.parse(r.data), c = { price: 0, photo: 0, add: 0, offer: 0, miss: 0, wait: 0 };
    const ok = await env.DB.prepare("SELECT data FROM docs WHERE col='slqok' AND id=?").bind(r.id).first();
    let items = ok ? JSON.parse(ok.data).items : (num(d0.approvedAt) && num(d0.approvedAt) < 1792777400000 ? d0.items : null);
    if (!Array.isArray(items)) { out.push({ r, d0, note: "بلا سجل اعتماد", c, wait: d0.status === "pending" }); continue; }
    if (d0.status === "pending" && !(items.length && items.every(i => i.photoOnly))) { out.push({ r, d0, c, wait: true }); continue; }
    const RM = {}; for (const e of (Array.isArray(d0.res) ? d0.res : [])) if (e && e.code != null) RM[String(e.code)] = e;
    for (const it of items) {
      const e = RM[String(it.code)] || null;
      const execd = !!(e && (good(e.del) || (!it.did && good(e.shop))));
      const offerP = it.offer && it.offer.price != null ? num(it.offer.price) : null;
      const price = offerP != null ? offerP : num(it.newPrice);
      let idx = find(it.name); if (idx < 0 && it.newName) idx = find(it.newName);
      if (it.add) {
        if (e && (e.del === "ok" || e.shop === "ok") && price != null) {
          const nm = ppNorm(it.newName || it.name);
          if (find(nm) < 0) { D.items.push([nm, price]); c.add++; any = true; }
          idx = find(nm);
        } else if (idx < 0) continue;
      } else if (idx < 0) { c.miss++; continue; }
      else if (!it.photoOnly && execd) {
        if (it.newName && ppNorm(it.newName) !== ppNorm(D.items[idx][0])) {
          const o = D.items[idx][0], nn = ppNorm(it.newName);
          D.items[idx][0] = nn; any = true;
          if (o in U) { U[nn] = U[o]; delete U[o]; } if (o in P) { P[nn] = P[o]; delete P[o]; }
          D.offers.forEach(x => { if (ppNorm(x[0]) === ppNorm(o)) x[0] = nn; });
        }
        const nm = D.items[idx][0], inOffers = D.offers.some(x => ppNorm(x[0]) === ppNorm(nm));
        if (it.offer && it.offer.rm) {
          D.offers = D.offers.filter(x => ppNorm(x[0]) !== ppNorm(nm)); c.offer++;
          if (price != null) D.items[idx][1] = price;
        } else if (offerP != null) {
          D.offers = D.offers.filter(x => ppNorm(x[0]) !== ppNorm(nm)); D.offers.push([nm, offerP, offerP]); D.items[idx][1] = offerP; c.offer++;
        } else if (price != null) {
          D.items[idx][1] = price;
          if (inOffers) D.offers = D.offers.map(x => (ppNorm(x[0]) === ppNorm(nm) ? [nm, price, price] : x));
        }
        c.price++; any = true;
      }
      if (it.photo && (it.photoOnly || execd || it.add)) {
        if (await ppCopyPhoto(env, it.photo)) { U[D.items[idx][0]] = it.photo; c.photo++; any = true; } else c.wait++;
      }
    }
    out.push({ r, d0, c, wait: c.wait > 0 && Date.now() - num(d0.doneAt) < 3 * 86400e3 });
  }
  if (any) {
    if (D.items.length < n0) return;
    D.updated = rday(0);
    const L = [["data", D], ["upl", U], ["disp", P]].map(([k, o]) => ({ ...B[k], o })).sort((a, b) => b.s - a.s);
    for (const x of L) html = html.slice(0, x.s) + ppJson(x.o) + html.slice(x.e);
    await putAsset(env, "pp:index.html", new TextEncoder().encode(html).buffer, "text/html; charset=utf-8");
    await writeDoc(env, "pgoff", "main", { offers: D.offers, at: Date.now(), by: "server" });
  }
  for (const o of out) {
    if (o.wait) continue;
    const c = o.c;
    await writeDoc(env, "slq", o.r.id, { ...o.d0, ...(o.d0.status === "pending" ? { status: "done", doneAt: Date.now(), result: "✅ صور فقط — طُبّقت على صفحة الأسعار", page: "done" } : {}), ppDone: Date.now(), ppNote: o.note || ("سعر " + c.price + "، صورة " + c.photo + "، جديد " + c.add + "، وفّر أكثر " + c.offer + (c.miss ? "، غير موجود في الصفحة " + c.miss : "")) });
  }
}
async function ppTick(env) {
  await ppSync(env);
  const st = await env.DB.prepare("SELECT v FROM meta WHERE k='pp_state'").first();
  if (!st || !JSON.parse(st.v).complete) return;
  await ppUplSync(env);
  await ppUpdate(env);
}

const CAP_SAMPLE = "<script>(function(){var u=window.claude&&window.claude.use;if(!u)return;function b64(b){return new Promise(function(res,rej){if(typeof b===\"string\"){var m=b.match(/^data:([^;]+);base64,(.*)$/);return m?res({mime:m[1],b64:m[2]}):rej(new Error(\"bad image\"))}var r=new FileReader();r.onload=function(){res({mime:b.type||\"image/jpeg\",b64:String(r.result).split(\",\")[1]})};r.onerror=function(){rej(new Error(\"read\"))};r.readAsDataURL(b)})}function call(p,o,j){o=o||{};return Promise.all((o.images||[]).map(b64)).then(function(im){return fetch(\"/api/sample\",{method:\"POST\",credentials:\"same-origin\",headers:{\"Content-Type\":\"application/json\"},body:JSON.stringify({prompt:p,images:im,json:j})})}).then(function(r){if(r.status===401){location.replace(\"/\");throw {code:\"revoked\",message:\"login\"}}return r.json().catch(function(){return {}})}).then(function(x){if(!x.ok)throw {code:x.code||\"unavailable\",message:x.err||\"error\"};return j?x.json:x.text})}var S=function(p,o){return call(p,o,false)};S.json=function(p,o){return call(p,o,true)};S.limits=function(){return Promise.resolve({})};window.claude.use=function(n){return n===\"sample\"?Promise.resolve(S):u(n)}})()</script>";
const CAP_LOGOUT = "<script>(function(){function add(){var p=document.getElementById(\"dwPanel\");if(!p||document.getElementById(\"dwOut\"))return;var w=document.createElement(\"div\");w.id=\"dwOut\";w.style.cssText=\"margin:14px 14px 0;padding-top:12px;border-top:1px solid rgba(255,255,255,.25)\";w.innerHTML='<div id=\"dwMail\" dir=\"ltr\" style=\"font-size:12px;opacity:.85;margin-bottom:8px;text-align:right\"></div><a href=\"/logout\" style=\"display:block;background:#fff;color:#c62828;border:1.5px solid #c62828;border-radius:10px;padding:12px;text-align:center;font-size:15px;font-weight:700;text-decoration:none\">تسجيل خروج</a>';p.appendChild(w);fetch(\"/api/me\",{credentials:\"same-origin\"}).then(function(r){return r.json()}).then(function(j){if(j&&j.email)document.getElementById(\"dwMail\").textContent=j.email}).catch(function(){})}if(document.readyState===\"loading\")document.addEventListener(\"DOMContentLoaded\",add);else add();setTimeout(add,3000)})()</script>";
const CAP_PIN = "<script>(function(){\nvar IS='display:block;width:100%;box-sizing:border-box;height:46px;margin:0 0 8px;padding:0 12px;border:1px solid #cfd8d3;border-radius:10px;font-size:16px;font-family:inherit;color:#1b2b24;background:#fff';\nfunction add(){var w=document.getElementById('dwOut');if(!w||document.getElementById('dwPinB'))return;var a=w.querySelector('a[href=\"/logout\"]');if(!a)return;\nvar g=document.createElement('div');g.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:10px';\nvar b=document.createElement('button');b.id='dwPinB';b.type='button';b.textContent='تغيير الرقم السري';b.style.cssText='background:#fff;color:#0e5a3c;border:1.5px solid #0e5a3c;border-radius:10px;padding:12px;font-size:15px;font-weight:700;font-family:inherit;cursor:pointer';\na.parentNode.insertBefore(g,a);g.appendChild(b);g.appendChild(a);\nvar f=document.createElement('div');f.id='dwPinF';f.style.cssText='display:none;margin-top:12px';\nf.innerHTML='<input id=\"pc\" type=\"password\" dir=\"ltr\" autocomplete=\"current-password\" placeholder=\"الرقم السري الحالي\" style=\"'+IS+'\"><input id=\"pn\" type=\"password\" dir=\"ltr\" autocomplete=\"new-password\" placeholder=\"الرقم السري الجديد\" style=\"'+IS+'\"><input id=\"pr\" type=\"password\" dir=\"ltr\" autocomplete=\"new-password\" placeholder=\"أعد كتابة الجديد\" style=\"'+IS+'\"><div style=\"font-size:12px;opacity:.9;margin:0 0 8px\">6 خانات على الأقل: 4 أرقام وحرف كبير وحرف صغير</div><div id=\"pm\" style=\"display:none;font-size:14px;padding:9px;border-radius:10px;margin-bottom:8px;background:#fff\"></div><button id=\"ps\" type=\"button\" style=\"width:100%;height:46px;border:0;border-radius:10px;background:#0e5a3c;color:#fff;font-size:15px;font-weight:700;font-family:inherit\">حفظ الرقم الجديد</button>';\nw.appendChild(f);\nfunction msg(t,ok){var m=document.getElementById('pm');m.style.display='block';m.style.color=ok?'#0e5a3c':'#c62828';m.textContent=t}\nb.onclick=function(){f.style.display=f.style.display==='none'?'block':'none'};\ndocument.getElementById('ps').onclick=function(){\nvar c=document.getElementById('pc').value,n=document.getElementById('pn').value,r=document.getElementById('pr').value;\nif(!c)return msg('اكتب الرقم السري الحالي');\nif(!/^(?=(?:\\D*\\d){4})(?=.*[A-Z])(?=.*[a-z])[A-Za-z0-9]{6,20}$/.test(n))return msg('الجديد: 6 خانات على الأقل، 4 أرقام وحرف كبير وحرف صغير، بلا رموز');\nif(n!==r)return msg('الرقمان الجديدان غير متطابقين');\nfetch('/api/pinchange',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({cur:c,nw:n})}).then(function(x){return x.json()}).then(function(j){\nif(j.ok){msg('تم حفظ الرقم الجديد',true);document.getElementById('pc').value='';document.getElementById('pn').value='';document.getElementById('pr').value=''}\nelse if(j.err==='wrong')msg('الرقم الحالي غير صحيح');\nelse if(j.err==='locked')msg('محاولات خاطئة كثيرة. جرّب بعد 15 دقيقة');\nelse if(j.err==='rule')msg('الرقم الجديد لا يطابق الشروط');\nelse msg('تعذّر الحفظ، حاول مرة ثانية')}).catch(function(){msg('تعذّر الاتصال')})}}\nif(document.readyState==='loading')document.addEventListener('DOMContentLoaded',add);else add();setTimeout(add,3200)})()</script>";
const GEM_G = "https://generativelanguage.googleapis.com/v1beta";
const GEM_MODELS = ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-flash-latest", "gemini-3-flash-preview", "gemini-3.1-flash-lite"];
async function gemStat(env, ok, err) {
  try {
    const day = rday(0), k = "gem_stat_" + day, r = await env.DB.prepare("SELECT v FROM meta WHERE k=?").bind(k).first();
    const o = r ? JSON.parse(r.v) : { ok: 0, fail: 0 }; if (ok) o.ok++; else { o.fail++; o.last = String(err || "").slice(0, 200); }
    await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)").bind(k, JSON.stringify(o)).run();
  } catch (e) {}
}
async function gemRead(env, prompt, images, wantJson) {
  const kr = await env.DB.prepare("SELECT v FROM meta WHERE k='gem_keys'").first();
  const keys = kr ? JSON.parse(kr.v) : []; if (!keys.length) throw Object.assign(new Error("no_keys"), { code: "unavailable" });
  const mr = await env.DB.prepare("SELECT v FROM meta WHERE k='gem_model'").first();
  const models = (mr && mr.v ? [mr.v] : []).concat(GEM_MODELS.filter(m => !mr || m !== mr.v));
  const parts = [{ text: String(prompt || "") }];
  for (const im of (images || []).slice(0, 12)) if (im && im.b64) parts.push({ inline_data: { mime_type: im.mime || "image/jpeg", data: im.b64 } });
  const body = { contents: [{ parts }], generationConfig: { temperature: 0, maxOutputTokens: 16384 } };
  if (wantJson) body.generationConfig.responseMimeType = "application/json";
  let lastErr = "", rate = false, start = Math.floor(Math.random() * keys.length);
  for (let mi = 0; mi < models.length; mi++) {
    for (let ki = 0; ki < keys.length; ki++) {
      const key = keys[(start + ki) % keys.length];
      try {
        const r = await fetch(GEM_G + "/models/" + models[mi] + ":generateContent", { method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const t = await r.text();
        if (!r.ok) { lastErr = r.status + " " + t.slice(0, 120); if (r.status === 429) rate = true; if (r.status === 400 || r.status === 413) throw Object.assign(new Error("bad_request " + lastErr), { code: "invalid_argument", stop: true }); continue; }
        const j = JSON.parse(t), pr = (((j.candidates || [])[0] || {}).content || {}).parts || [];
        const txt = pr.map(x => x.text || "").join("");
        if (!txt) { lastErr = "empty " + String((j.promptFeedback || {}).blockReason || (((j.candidates || [])[0] || {}).finishReason) || ""); continue; }
        if (!wantJson) return { text: txt, model: models[mi] };
        let o; const c = txt.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
        try { o = JSON.parse(c); } catch (e) { const a = c.indexOf("{"), b = c.lastIndexOf("}"); if (a >= 0 && b > a) { try { o = JSON.parse(c.slice(a, b + 1)); } catch (e2) {} } }
        if (o === undefined) { lastErr = "bad_json"; continue; }
        return { json: o, model: models[mi] };
      } catch (e) { if (e && e.stop) throw e; lastErr = String(e && e.message || e).slice(0, 120); }
    }
  }
  throw Object.assign(new Error(lastErr || "failed"), { code: rate ? "rate_limited" : "unavailable" });
}



async function gemSelf(env) {
  const f = await env.DB.prepare("SELECT v FROM meta WHERE k='gem_selftest'").first(); if (!f || f.v !== "1") return;
  await env.DB.prepare("DELETE FROM meta WHERE k='gem_selftest'").run();
  let out = {};
  try {
    const row = await env.DB.prepare("SELECT id, json_extract(data,'$.photo[0]') ph, json_extract(data,'$.ai.amount') amt, json_extract(data,'$.ai.name') nm FROM docs WHERE col='ledger' AND json_extract(data,'$.ai.amount')>100 AND json_extract(data,'$.ai.sumMatch')=1 AND json_extract(data,'$.photo[0]') IS NOT NULL ORDER BY at DESC LIMIT 1").first();
    const res = await getAsset(env, row.ph); const buf = new Uint8Array(await res.arrayBuffer()); let bin = ""; for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
    const t0 = Date.now(); const r = await gemRead(env, 'Read this supplier invoice photo. Return ONLY JSON {"supplier":string,"total":number,"lines":number}.', [{ mime: res.headers.get("Content-Type") || "image/jpeg", b64: btoa(bin) }], true);
    out = { id: row.id, stored: { amt: row.amt, nm: row.nm }, gem: r.json, model: r.model, ms: Date.now() - t0 };
  } catch (e) { out = { err: String(e && e.message || e).slice(0, 300), code: e && e.code }; }
  await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES ('gem_selftest_res',?)").bind(JSON.stringify(out).slice(0, 3000)).run();
}

// ---------- Claude backup reader (hourly Opus task). The task reaches the shop's data through the Cloudflare connector (D1), not the web:
// it reads meta gw_pending, reads the photos from the image DBs, and writes its reading into table claude_reads; this cron applies it. ----------
const gwN = x => { const n = parseFloat(x); return isFinite(n) ? Math.round(n * 100) / 100 : 0; };
async function gwPending(env) {
  const since = rday(-3);
  const rows = (await env.DB.prepare("SELECT id,data FROM docs WHERE col='ledger' AND json_extract(data,'$.type')='invoice' AND json_extract(data,'$.date')>=? ORDER BY at DESC LIMIT 600").bind(since).all()).results || [];
  const out = [];
  for (const r of rows) {
    let d; try { d = JSON.parse(r.data); } catch (e) { continue; }
    const ph = Array.isArray(d.photo) ? d.photo : []; if (!ph.length) continue;
    const cr = d.claudeRead || null, ai = d.ai || null;
    if (cr && cr.gwTry >= 3) continue;
    const need = (cr && cr.escalate) || (!cr && !(ai && ai.ok === true));
    if (!need) continue;
    const photos = [];
    for (const id of ph.slice(0, 6)) { const a = await env.DB.prepare("SELECT part,n,size FROM assets WHERE id=?").bind(id).first(); if (a) photos.push({ id, db: a.part === 3 ? "img3" : a.part === 2 ? "img2" : "img1", chunks: a.n, size: a.size }); }
    out.push({ id: r.id, date: d.date, recorded: { amount: d.amount, name: d.name || d.supplier || null, invoiceNo: d.invoiceNo || null, cashier: d.cashier || null }, photos, gemini: ai ? { total: ai.amount, name: ai.name || null, ok: ai.ok, note: String(ai.note || "").slice(0, 200) } : null, why: cr && cr.why ? String(cr.why).slice(0, 200) : null });
    if (out.length >= 15) break;
  }
  return out;
}
async function gwApply(env, id, x) {
  const row = await env.DB.prepare("SELECT data FROM docs WHERE col='ledger' AND id=?").bind(String(id)).first(); if (!row) return { err: "nodoc" };
  const d = JSON.parse(row.data), now = Date.now();
  if (!x || x.unreadable) { d.claudeRead = { ...(d.claudeRead || {}), at: now, by: "opus", ok: false, passes: 1, gwTry: ((d.claudeRead && d.claudeRead.gwTry) || 0) + 1, why: String((x && x.note) || "صورة غير مقروءة").slice(0, 200) }; delete d.claudeRead.escalate; await writeDoc(env, "ledger", String(id), d); return { unreadable: true }; }
  const items = (Array.isArray(x.items) ? x.items : []).slice(0, 300).map(i => ({ name: String(i.name || "").slice(0, 80), nameAr: i.nameAr ? String(i.nameAr).slice(0, 80) : undefined, qty: gwN(i.qty), price: i.price == null ? null : gwN(i.price), total: gwN(i.total) })).filter(i => i.name || i.nameAr);
  const sum = gwN(items.reduce((s, i) => s + i.total, 0)), tot = gwN(x.total), vat = gwN(x.vat), disc = gwN(x.discount);
  const sumMatch = items.length ? [sum, sum + vat, sum - disc, sum - disc + vat].some(c => Math.abs(c - tot) < 0.02) : false;
  const amountMatch = Math.abs(Math.abs(gwN(d.amount)) - tot) <= 1;
  const badLines = items.filter(i => i.price != null && Math.abs(i.qty * i.price - i.total) > 0.011).length;
  const ok = !!(sumMatch && amountMatch);
  const old = d.ai || {};
  d.ai = { ...old, amount: tot, date: String(x.date || old.date || "").slice(0, 20), dateISO: /^\d{4}-\d{2}-\d{2}$/.test(String(x.date || "")) ? x.date : old.dateISO, docType: x.docType || old.docType, invoiceNo: x.invoiceNo || old.invoiceNo || null, isTax: !!x.isTax, vatNumber: x.vatNumber || null, name: String(x.supplier || old.name || "").slice(0, 120), items, itemsSum: sum, subtotal: gwN(x.subtotal), discount: disc, vat, sumMatch, amountMatch, badLines, ok, note: String(x.note || "").slice(0, 400), at: now, verify: { at: now, by: "claude", passes: 1 } };
  d.claudeRead = { at: now, by: "opus", ok, passes: 1 };
  if (!amountMatch) d.claudeRead.why = "المقروء " + tot + " والمسجّل " + gwN(d.amount);
  await writeDoc(env, "ledger", String(id), d);
  return { sumMatch, amountMatch, badLines };
}
async function gwTick(env) {
  try {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS claude_reads (id TEXT PRIMARY KEY, r TEXT, at INTEGER, done INTEGER)").run();
    const rows = (await env.DB.prepare("SELECT id,r FROM claude_reads WHERE done IS NULL LIMIT 20").all()).results || [];
    for (const x of rows) { let res; try { res = await gwApply(env, x.id, JSON.parse(x.r)); } catch (e) { res = { err: String(e && e.message || e).slice(0, 100) }; } await env.DB.prepare("UPDATE claude_reads SET done=?, r=json_set(r,'$._res',json(?)) WHERE id=?").bind(Date.now(), JSON.stringify(res), x.id).run(); }
    const lp = await env.DB.prepare("SELECT json_extract(v,'$.at') a FROM meta WHERE k='gw_pending'").first(); if (lp && Date.now() - lp.a < 14 * 60e3 && !rows.length) return;
    const list = await gwPending(env);
    await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES ('gw_pending',?)").bind(JSON.stringify({ at: Date.now(), items: list })).run();
  } catch (e) { try { await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES ('gw_err',?)").bind(String(e && e.message || e).slice(0, 300)).run(); } catch (x) {} }
}


// ---------- copy missing ledger photos from the old Claude ledger (ids listed in meta old_copy) ----------
const OLD_ORIGIN = "https://bf168e60-6dfd-4775-ad44-91eaaa86413c.frame.claudeusercontent.com";
async function oldCopy(env) {
  const f = await env.DB.prepare("SELECT v FROM meta WHERE k='old_copy'").first(); if (!f) return;
  const ids = JSON.parse(f.v || "[]"); if (!ids.length) return;
  const res = {}; const left = [];
  for (const id of ids.slice(0, 20)) {
    const h = await env.DB.prepare("SELECT 1 x FROM assets WHERE id=?").bind(id).first(); if (h) { res[id] = "have"; continue; }
    let ok = false, last = "";
    for (const u of [OLD_ORIGIN + "/_blob/" + id, OLD_ORIGIN + "/_assets/" + id]) {
      try { const r = await fetch(u); last = u.slice(-50) + " " + r.status + " " + (r.headers.get("content-type") || ""); if (!r.ok) continue; const ct = r.headers.get("content-type") || ""; if (!/image|octet/.test(ct)) continue; const buf = await r.arrayBuffer(); if (!buf.byteLength) continue; await putAsset(env, id, buf, ct.split(";")[0] || "image/jpeg"); ok = true; break; } catch (e) { last = String(e && e.message || e).slice(0, 80); }
    }
    res[id] = ok ? "ok" : last; if (!ok) left.push(id);
  }
  await env.DB.prepare("DELETE FROM meta WHERE k='old_copy'").run();
  await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES ('old_copy_res',?)").bind(JSON.stringify({ at: Date.now(), res })).run();
}

const PIN_HTML = "<!doctype html><html lang=\"ar\" dir=\"rtl\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>دفتر أسواق طيبة</title><meta name=\"theme-color\" content=\"#0e5a3c\">\n<style>body{margin:0;font-family:Tahoma,system-ui,sans-serif;background:#f4f6f5;color:#1b2b24;text-align:center}main{max-width:420px;margin:0 auto;padding:40px 20px}.card{background:#fff;border:1px solid #dfe5e2;border-radius:18px;padding:26px 18px}.ic{width:64px;height:64px;border-radius:16px;background:#0e5a3c;color:#fff;margin:0 auto 10px;display:flex;align-items:center;justify-content:center;font-size:28px}h1{font-size:20px;margin:6px 0 4px}.em{color:#56665e;font-size:13px;margin-bottom:16px}label{display:block;font-size:15px;margin:10px 0 6px}input{width:100%;box-sizing:border-box;font-size:20px;padding:12px;border:1.5px solid #b9c4bf;border-radius:10px;text-align:center;letter-spacing:3px}button{width:100%;margin-top:14px;background:#0e5a3c;color:#fff;border:0;border-radius:10px;padding:13px;font-size:16px;font-weight:700}.n{color:#56665e;font-size:13px;line-height:1.8;margin-top:10px}#err{display:none;margin-top:12px;padding:10px;border-radius:10px;background:#fdecec;color:#a32d2d;font-size:14px}a{color:#c62828;text-decoration:none}</style></head>\n<body><main><div class=\"card\"><div class=\"ic\">&#128274;</div><h1>دفتر أسواق طيبة</h1><div class=\"em\" dir=\"ltr\">__EMAIL__</div>\n<form id=\"f\"><label for=\"p1\">__TITLE__</label><input id=\"p1\" type=\"password\" autocomplete=\"off\" autocapitalize=\"off\" spellcheck=\"false\" dir=\"ltr\">\n<div id=\"c\" __HIDE__><label for=\"p2\">أعد كتابته للتأكيد</label><input id=\"p2\" type=\"password\" autocomplete=\"off\" autocapitalize=\"off\" spellcheck=\"false\" dir=\"ltr\"></div>\n<div class=\"n\" __HIDE__>4 أرقام + حرف إنجليزي كبير + حرف صغير (مثل 1234Ab)</div>\n<button type=\"submit\">دخول</button></form><div id=\"err\"></div>\n<div class=\"n\">مو حسابك؟ <a href=\"/logout\">تسجيل خروج</a></div></div></main>\n<script>var SET=__SET__;document.getElementById('f').onsubmit=function(e){e.preventDefault();var a=document.getElementById('p1').value,b=document.getElementById('p2').value,er=document.getElementById('err');er.style.display='none';\nfunction bad(t){er.textContent=t;er.style.display='block'}\nif(!a)return bad('اكتب الرقم السري');\nif(SET){if(!/^(?=(?:\\D*\\d){4})(?=.*[A-Z])(?=.*[a-z])[A-Za-z0-9]{6,20}$/.test(a))return bad('لازم 4 أرقام وحرف كبير وحرف صغير');if(a!==b)return bad('الرقمين مو متطابقين')}\nfetch('/api/pin',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({pw:a,set:SET})}).then(function(r){return r.json()}).then(function(j){if(j.ok){location.replace('/');return}\nbad(j.err==='locked'?'محاولات كثيرة غلط. جرّب بعد '+(j.min||15)+' دقيقة':j.err==='rule'?'لازم 4 أرقام وحرف كبير وحرف صغير':'الرقم السري غلط'+(j.left!=null?' — باقي '+j.left+' محاولات':''))}).catch(function(){bad('تعذّر الاتصال، حاول مرة ثانية')})}</script></body></html>\n";
// ---------- ledger password after Google sign-in (owner 23 Nov): per email, hashed in meta pin_<email>; a session is marked once it passes ----------
const PIN_RULE = /^(?=(?:\D*\d){4})(?=.*[A-Z])(?=.*[a-z])[A-Za-z0-9]{6,20}$/;
async function pinHash(email, pw, salt) { return sha("pin|" + salt + "|" + email + "|" + pw); }
async function pinGet(env, email) { const r = await env.DB.prepare("SELECT v FROM meta WHERE k=?").bind("pin_" + email).first(); return r ? JSON.parse(r.v) : null; }
function pinPage(me, set) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  return new Response(PIN_HTML.replace("__EMAIL__", esc(me.email)).replace("__TITLE__", set ? "اختر رقماً سرياً للدفتر" : "اكتب الرقم السري للدفتر").split("__HIDE__").join(set ? "" : "hidden").replace("__SET__", set ? "true" : "false"), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
async function pinApi(env, req, me) {
  const o = await req.json().catch(() => ({})), pw = String(o.pw || ""), cur = await pinGet(env, me.email), now = Date.now();
  const t = cookie(req, "dsid"), hh = await sha("s|" + t);
  if (!cur) {
    if (!PIN_RULE.test(pw)) return json({ ok: false, err: "rule" });
    const salt = rnd().slice(0, 16);
    await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)").bind("pin_" + me.email, JSON.stringify({ salt, h: await pinHash(me.email, pw, salt), at: now })).run();
    await env.DB.prepare("UPDATE sess SET pin=1 WHERE hh=?").bind(hh).run();
    return json({ ok: true });
  }
  if (cur.lockUntil && cur.lockUntil > now) return json({ ok: false, err: "locked", min: Math.ceil((cur.lockUntil - now) / 60e3) });
  if (await pinHash(me.email, pw, cur.salt) === cur.h) {
    cur.fail = 0; delete cur.lockUntil;
    await env.DB.batch([env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)").bind("pin_" + me.email, JSON.stringify(cur)), env.DB.prepare("UPDATE sess SET pin=1 WHERE hh=?").bind(hh)]);
    return json({ ok: true });
  }
  cur.fail = (cur.fail || 0) + 1; let left = 5 - cur.fail;
  if (cur.fail >= 5) { cur.lockUntil = now + 15 * 60e3; cur.fail = 0; left = 0; }
  await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)").bind("pin_" + me.email, JSON.stringify(cur)).run();
  return json({ ok: false, err: left ? "wrong" : "locked", left, min: 15 });
}

// ---------- the app page: the ledger's own HTML (copied from Claude) with the bridge script in front ----------
async function appPage(env) {
  const av = await env.DB.prepare("SELECT v FROM meta WHERE k='appv'").first(); if (!av) return null;
  const v = +av.v, r = await env.DB.prepare("SELECT txt FROM apphtml WHERE seq>=? AND seq<? ORDER BY seq").bind(v * 1000, v * 1000 + 1000).all();
  let html = (r.results || []).map(x => x.txt).join("");
  if (!html) return null;
  /* MADA_ON (owner 24 Nov): on the new server the mada slip is read (Gemini) and filled in; the cashier corrects it if wrong */
  html = html.replace("const r0=(dd[d]||{})[String(dv.n)],xr=(dd[d]||{})['x'+dv.n];", "const r0=(dd[d]||{})[String(dv.n)],xr0=(dd[d]||{})['x'+dv.n],pr0=(dd[d]||{})['p'+dv.n],xr=(Array.isArray(xr0)||Array.isArray(pr0))?[0,1,2].map(i=>(+(xr0||[])[i]||0)+(+(pr0||[])[i]||0)):undefined;");
  /* owner 27 Nov: red counter «طلبات لم تُفوتر» on the «طلبات الرابط» square (window.plUnCnt from posl.js) */
  html = html.replace("(x[1]==='net'&&window.netCnt&&window.netCnt()?' ('+window.netCnt()+')':'')", "(x[1]==='net'&&window.netCnt&&window.netCnt()?' ('+window.netCnt()+')':(x[1]==='plink'&&window.plUnCnt&&window.plUnCnt()?' ('+window.plUnCnt()+')':''))");
  html = html.replace("async function readMada(){\n  if(NO_SLIP_READ)return madaReset();", "async function readMada(){\n  if(false)return madaReset();").replace("🤖 Claude يقرأ إيصال موازنة المدى…", "يقرأ إيصال الشبكة…");
  const tag = '<script src="/shim.js?v=' + Math.floor(Date.now() / 600e3) + '"></script>' + CAP_SAMPLE + CAP_LOGOUT + CAP_PIN + '<script src="/posl.js?v=' + Math.floor(Date.now() / 600e3) + '" defer></script>' + '<script>if("serviceWorker"in navigator)navigator.serviceWorker.register("/sw.js").catch(function(){})</script>' + '<link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#0e5a3c"><link rel="apple-touch-icon" href="/i192.png">';
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + tag) : tag + html;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

// ---------- Smart Life sales pull: runs on this server by cron, no Claude involved ----------
// Writes the same documents the old ledger's pull tasks wrote: slday/inv-<day> (invoice list for the closing) and slsales/<YYYY-MM> (daily, hourly and per-user sales).
// The two Smart Life API tokens live in the private meta table (sl_shop, sl_del), never in the code.
const SL_API = "https://smarterp.top/api/v3";
const SL_NAMES = {
  s: { "10": "مالك", "13": "أحمد", "11": "المدير", "12": "عاصف", "9": "فوزي", "8": "كاشير 3", "1": "المحاسب العام", "14": "المحاسب العام" },
  d: { "3": "أحمد", "2": "عاصف", "1": "المدير" }
};
const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const num = x => { const n = parseFloat(x); return isFinite(n) ? n : 0; };
const rday = off => new Date(Date.now() + 3 * 3600e3 + off * 864e5).toISOString().slice(0, 10); // Riyadh calendar day
const slName = (acct, x) => SL_NAMES[acct][String(x.created_by)] || ("مستخدم " + x.created_by);

async function slFetchAll(token, acct, minDay) {
  const seen = new Map(); let off = 0, pages = 0;
  while (pages < 8) {
    const url = SL_API + "/sales/sales_list?sort_by=id&sort_type=desc&limit=300&offset=" + off + (acct === "s" ? "&warehouse_id=1" : "");
    const r = await fetch(url, { headers: { Authorization: token, "User-Agent": "curl/8.5.0" } });
    if (!r.ok) throw new Error(acct + " http " + r.status);
    const j = await r.json();
    if (!j || j.success !== true || !Array.isArray(j.data)) throw new Error(acct + " bad response");
    const L = j.data; if (!L.length) break;
    let oldest = "9999";
    for (const x of L) {
      const d = String(x.date || ""); if (d < oldest) oldest = d;
      if (acct === "s" && String(x.warehouse_id) !== "1") continue;
      if (!seen.has(x.id)) seen.set(x.id, x);
    }
    off += L.length; pages++;
    if (oldest.slice(0, 10) < minDay) break;
  }
  return [...seen.values()];
}
function invList(rows, day, acct) {
  return rows.filter(x => String(x.date).slice(0, 10) === day)
    .map(x => [String(x.date).slice(11, 19), Number(x.id), String(x.reference_no), r2(num(x.grand_total)), r2(num(x.paid)), slName(acct, x)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
}
function slAgg(rows, day, acct) {
  const A = () => ({ t: [0, 0, 0, 0], h: Array(24).fill(0), n: Array(24).fill(0) });
  const tot = A(), users = {}; let f = 0, fn = 0;
  for (const x of rows) {
    if (String(x.date).slice(0, 10) !== day) continue;
    const g = num(x.grand_total), paid = num(x.paid), hr = parseInt(String(x.date).slice(11, 13), 10) || 0, nm = slName(acct, x);
    const u = users[nm] || (users[nm] = A());
    for (const a of [tot, u]) {
      a.h[hr] += g;
      if (g > 0) { a.t[0] += g; a.t[2] += g - paid; a.t[3] += 1; a.n[hr] += 1; } else if (g < 0) a.t[1] += g;
    }
    if (acct === "d" && g > 0) { const sh = num(x.total_shipping); f += sh; if (sh > 0) fn++; }
  }
  const fin = a => ({ t: a.t.map(r2), h: a.h.map(r2), n: a.n });
  return { tot: fin(tot), u: Object.keys(users).map(nm => ({ a: acct, name: nm, ...fin(users[nm]) })), f: r2(f), fn };
}
function slDay(S, D, day) {
  const s = slAgg(S, day, "s"), d = slAgg(D, day, "d");
  const u = s.u.concat(d.u).sort((a, b) => (a.a < b.a ? -1 : a.a > b.a ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { s: s.tot.t, d: d.tot.t, hs: s.tot.h, hd: d.tot.h, hns: s.tot.n, hnd: d.tot.n, u, f: d.f, fn: d.fn };
}
// Driver delivery levels from the sale notes (owner's rules of 8 and 20 Nov): note = courier digit (1,2,3) alone or repeated (manual level 1/11/111), or courier digit + 4-digit code that carries level and fee.
function dec4(c4, day) {
  const c = parseInt(c4, 10);
  if (c >= 9973) return null;
  const P = ((((c - 1234) * 3190) % 9973) + 9973) % 9973;
  if (P >= 6000) return null;
  const T = P % 25, t = Math.floor(P / 25);
  const E = Math.round(Date.parse(day + "T00:00:00Z") / 864e5);
  if (t % 3 !== ((E % 3) + 3) % 3 && t % 3 !== (((E - 1) % 3) + 3) % 3) return null;
  const lv = T === 0 ? 1 : T <= 2 ? 2 : 3;
  const lh = T < 3 ? [[2, 0], [3, 1], [4, 2]][T] : [4.5 + (T - 3) / 2, 4.5 + (T - 3) / 2];
  return [lv, lh[0], lh[1]];
}
function slLv(D, days) {
  const out = {};
  for (const d of days) out[d] = { "1": [0, 0, 0], "2": [0, 0, 0], "3": [0, 0, 0], t: 0, u: 0, md: { "1": 0, "2": 0, "3": 0 }, kd: { "1": 0, "2": 0, "3": 0 }, bl: [] };
  const rows = D.filter(x => days.includes(String(x.date).slice(0, 10)) && num(x.grand_total) > 0)
    .sort((a, b) => (String(a.date) < String(b.date) ? -1 : String(a.date) > String(b.date) ? 1 : Number(a.id) - Number(b.id)));
  const seen = new Set();
  for (const x of rows) {
    const day = String(x.date).slice(0, 10), o = out[day], ref = String(x.reference_no);
    const n = String(x.notes == null ? "" : x.notes).replace(/&Tab;/g, "").replace(/\s+/g, "").replace(/[٠-٩]/g, ch => String(ch.charCodeAt(0) - 1632));
    o.t++;
    let m = /^([123])\1{0,2}$/.exec(n);
    if (m) { o[m[1]][n.length - 1]++; o.md[m[1]]++; continue; }
    m = /^([123])(\d{4})$/.exec(n);
    if (!m) { o.u++; continue; }
    const c = m[1], code = m[2], r = dec4(code, day);
    if (!r) { o.u++; o.bl.push([ref, c, "bad"]); seen.add(code); continue; }
    if (seen.has(code)) { o.u++; o.bl.push([ref, c, "dup"]); continue; }
    seen.add(code);
    o[c][r[0] - 1]++; o.kd[c]++;
    const ship = num(x.total_shipping), want = (num(x.grand_total) - ship) >= 20 ? r[2] : r[1];
    if (ship < want - 0.01) o.bl.push([ref, c, "fee", r2(ship), want]);
  }
  return out;
}

/* owner 24 Nov: pull Smart Life at once when a closing is opened/saved (slreq / slPending), not only on the 5-minute cron */
async function slNow(env) {
  try {
    const r = await env.DB.prepare("SELECT v FROM meta WHERE k='slpull'").first();
    const at = r ? (JSON.parse(r.v).at || 0) : 0;
    if (Date.now() - at < 25000) return;
    await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES ('slpull',?)").bind(JSON.stringify({ at: Date.now(), busy: 1 })).run();
    await slPull(env);
  } catch (e) {}
}
async function slPull(env) {
  const t0 = Date.now(), log = { at: t0 };
  try {
    const m = {};
    for (const x of ((await env.DB.prepare("SELECT k,v FROM meta WHERE k IN ('sl_shop','sl_del')").all()).results || [])) m[x.k] = x.v;
    if (!m.sl_shop || !m.sl_del) throw new Error("tokens missing");
    const today = rday(0), yday = rday(-1);
    const [S, D] = await Promise.all([slFetchAll(m.sl_shop, "s", yday), slFetchAll(m.sl_del, "d", yday)]);
    const lastOf = L => L.reduce((a, x) => (String(x.date) > a ? String(x.date) : a), "");
    const last = { s: lastOf(S), d: lastOf(D) };
    log.n = [S.length, D.length];
    for (const day of [yday, today]) {
      await writeDoc(env, "slday", "inv-" + day, { s: invList(S, day, "s"), d: invList(D, day, "d"), at: Date.now(), last });
      const mon = day.slice(0, 7);
      const cur = await env.DB.prepare("SELECT data FROM docs WHERE col='slsales' AND id=?").bind(mon).first();
      const doc = cur ? JSON.parse(cur.data) : { days: {} };
      doc.days = doc.days || {};
      doc.days[day] = slDay(S, D, day);
      doc.at = Date.now(); doc.by = "server"; doc.last = last;
      await writeDoc(env, "slsales", mon, doc);
    }
    const lvd = slLv(D, [yday, today]);
    for (const mon of [...new Set([yday.slice(0, 7), today.slice(0, 7)])]) {
      const cur = await env.DB.prepare("SELECT data FROM docs WHERE col='slday' AND id=?").bind("lv-" + mon).first();
      const doc = cur ? JSON.parse(cur.data) : { days: {} };
      doc.days = doc.days || {};
      for (const d of Object.keys(lvd)) if (d.slice(0, 7) === mon) doc.days[d] = lvd[d];
      doc.at = Date.now(); doc.by = "server";
      await writeDoc(env, "slday", "lv-" + mon, doc);
    }
    log.ok = true;
  } catch (e) { log.ok = false; log.err = String(e && e.message || e).slice(0, 300); }
  log.ms = Date.now() - t0;
  try { await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES ('slpull',?)").bind(JSON.stringify(log)).run(); } catch (e) { }
  return log;
}

// ---------- POS (نقاط البيع) — owner 24 Nov: standalone point of sale on this server; branch comes from the worker's login ----------
const POS_BR = { shop: { name: "فرع المبيعات", vat: true, pi: 2 }, del: { name: "فرع التوصيل", vat: false, pi: 2 } }; /* owner 24 Nov: the delivery branch sells at the shop price (one price) */
const posDay = (t) => new Date((t || Date.now()) + 3 * 3600e3).toISOString().slice(0, 10);
const posTime = (t) => new Date((t || Date.now()) + 3 * 3600e3).toISOString().slice(11, 19);
const posR2 = x => Math.round(x * 100) / 100;
let POSCAT = null;
async function posCat(env) {
  const m = await env.DB.prepare("SELECT data FROM docs WHERE col='slcat' AND id='meta'").first();
  const nmr = await env.DB.prepare("SELECT data FROM docs WHERE col='posnm' AND id='main'").first();
  let nmo = {}, nma = 0, npr = {}, nnw = {}, npb = {}; try { if (nmr) { const o = JSON.parse(nmr.data); nmo = o.m || {}; nma = o.at || 0; npr = o.p || {}; nnw = o.n || {}; npb = o.pb || {}; } } catch (e) { }
  /* owner 24 Nov: a price change sent to Smart Life patches the slcat rows at once (daftar-jobs) — the newest row time is part of the key so the POS sees it straight away */
  const mx = await env.DB.prepare("SELECT MAX(at) a FROM docs WHERE col='slcat'").first();
  const mat = (m ? (JSON.parse(m.data).at || 0) : 0) + ":" + nma + ":" + ((mx && mx.a) || 0) + ":p2";
  if (POSCAT && POSCAT.at === mat) return POSCAT;
  const r = (await env.DB.prepare("SELECT id,data FROM docs WHERE col='slcat'").all()).results || [];
  const by = new Map();
  for (const x of r) { if (!/^c\d+$/.test(x.id)) continue; try { for (const w of (JSON.parse(x.data).rows || [])) by.set(String(w[0]), w); } catch (e) { } }
  /* owner 24 Nov: names corrected in the stocktake apply everywhere (they survive the Smart Life re-sync) */
  for (const k of Object.keys(nmo)) { const w = by.get(String(k)); if (w && nmo[k]) { const w2 = w.slice(); w2[1] = nmo[k]; by.set(String(k), w2); } }
  /* owner 25 Nov: items added and prices changed from the cashier screen live in posnm (p = price, n = new items) so they survive the Smart Life re-sync */
  for (const k of Object.keys(nnw)) { if (!by.has(String(k))) by.set(String(k), nnw[k]); }
  for (const k of Object.keys(npr)) { const w = by.get(String(k)); if (w && +npr[k] > 0 && (npb[k] === undefined || +w[2] === +npb[k])) { const w2 = w.slice(); w2[2] = +npr[k]; w2[6] = +npr[k]; by.set(String(k), w2); } }
  POSCAT = { at: mat, by }; return POSCAT;
}
/* owner 24 Nov: credit customers = the Smart Life sales-branch list (balance there) + POS «آجل» invoices (not in Smart Life) */
async function posCustList(env) {
  let L = []; try { const r = await env.DB.prepare("SELECT data FROM docs WHERE col='slcust' AND id='main'").first(); L = r ? (JSON.parse(r.data).shop || []) : []; } catch (e) { }
  const add = {}; try { const r = (await env.DB.prepare("SELECT json_extract(data,'$.cust') c, SUM(json_extract(data,'$.aj')) s FROM docs WHERE col LIKE 'posinv/%' AND json_extract(data,'$.aj') IS NOT NULL GROUP BY c").all()).results || []; for (const x of r) add[x.c] = +x.s || 0; } catch (e) { }
  return L.filter(x => x && x[0] && !/نقدي/.test(x[0])).map(x => [String(x[0]).trim(), posR2((+x[1] || 0) + (add[String(x[0]).trim()] || 0))]);
}
async function posBrMap(env) { const r = await env.DB.prepare("SELECT v FROM meta WHERE k='posbranch'").first(); try { return r ? JSON.parse(r.v) : {}; } catch (e) { return {}; } }
async function posBrOf(env, me) { const m = await posBrMap(env); return POS_BR[m[me.email]] ? m[me.email] : "shop"; }
const POS_SHOP = [26.3092878, 44.8183906];
function posLocParse(s) {
  s = String(s || ""); try { s = decodeURIComponent(s); } catch (e) { }
  const pats = [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /@(-?\d+\.\d+),\s*(-?\d+\.\d+)/, /[?&](?:q|query|ll|daddr|destination)=(?:loc:)?(-?\d+\.\d+),\s*(-?\d+\.\d+)/, /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/];
  for (const p of pats) { const m = s.match(p); if (m) { const la = +m[1], ln = +m[2]; if (la > 15 && la < 33 && ln > 34 && ln < 56) return [la, ln]; } }
  return null;
}
function posLocCalc(la, ln) {
  const R = 6371, r = x => x * Math.PI / 180, dl = r(la - POS_SHOP[0]), dn = r(ln - POS_SHOP[1]), a = Math.sin(dl / 2) ** 2 + Math.cos(r(POS_SHOP[0])) * Math.cos(r(la)) * Math.sin(dn / 2) ** 2, d = 2 * R * Math.asin(Math.sqrt(a));
  const T = [[0.75, 2, 0], [1.5, 3, 1], [2.25, 4, 2]]; let f0 = Math.min(15, Math.round(d * 4) / 2), f1 = f0; for (const t of T) if (d <= t[0]) { f0 = t[1]; f1 = t[2]; break; }
  return { d: Math.round(d * 100) / 100, lv: d <= 0.75 ? 1 : d <= 2.25 ? 2 : 3, fee0: f0, fee1: f1 };
}
function posPhone(s) {
  let d = String(s || "").replace(/[٠-٩]/g, c => "٠١٢٣٤٥٦٧٨٩".indexOf(c)).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2); if (d.startsWith("966")) d = d.slice(3); if (d.startsWith("0")) d = d.slice(1);
  return d.length >= 7 && d.length <= 12 ? d : "";
}
async function posDcSave(env, nm, ph, lrow, lid, by) {
  const p = posPhone(ph); if (!p) return null; const id = "c" + p.slice(-9), now = Date.now();
  const ex = await env.DB.prepare("SELECT data FROM docs WHERE col='pocust' AND id=?").bind(id).first(); const d = ex ? JSON.parse(ex.data) : { hist: [], at: now };
  if (!Array.isArray(d.hist)) d.hist = [];
  if (nm) d.name = String(nm).slice(0, 80); if (!d.name) d.name = p; d.phone = p;
  if (lrow) {
    if (d.lat != null && (d.lat !== lrow.lat || d.lng !== lrow.lng)) d.hist.push({ at: d.updAt || d.at, lat: d.lat, lng: d.lng, by: d.by || "" });
    d.lat = lrow.lat; d.lng = lrow.lng; d.d = lrow.d; d.lv = lrow.lv; d.fee0 = lrow.fee0; d.fee1 = lrow.fee1; d.updAt = now; d.by = String(by || "").slice(0, 60); delete d.pend;
    if (lid) { lrow.inv = { cust: id, day: posDay(now) }; try { await writeDoc(env, "poloc", lid, lrow); } catch (e) { } }
  } else if (d.lat == null) { d.pend = true; d.updAt = now; }
  await writeDoc(env, "pocust", id, d); try { await posCurSet(env, id, d.name); } catch (e) { } return { id, name: d.name, phone: p };
}
async function posCurGet(env) { const r = await env.DB.prepare("SELECT v FROM meta WHERE k='pos_curcust'").first(); if (!r) return null; try { const d = JSON.parse(r.v); return Date.now() - d.at < 18e5 ? d : null; } catch (e) { return null; } }
async function posCurSet(env, id, name) { if (!id) { await env.DB.prepare("DELETE FROM meta WHERE k='pos_curcust'").run(); return; } await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES ('pos_curcust',?)").bind(JSON.stringify({ id, name, at: Date.now() })).run(); }
async function posStrict(env) { const r = await env.DB.prepare("SELECT v FROM meta WHERE k='pos_strict'").first(); return !!(r && r.v === "1"); }
async function posApi(env, req, me, p, q) {
  const br = await posBrOf(env, me), B = POS_BR[br];
  { const rr = await posRetApi(env, req, me, p, q, br, B); if (rr) return rr; }
  { const rs = await posShiftApi(env, req, me, p, q, br, B); if (rs) return rs; }
  { const ro = await posOrdersApi(env, req, me, p, br); if (ro) return ro; }
  { const rj = await posJardApi(env, req, me, p, q); if (rj) return rj; }
  if (p === "/api/pos/plstats") { if (!me.owner) return json({ ok: false }, 403); return await ppStats(env, q); }
  if (p === "/api/pos/me") { let shop = {}; try { const r = await env.DB.prepare("SELECT v FROM meta WHERE k='posshop'").first(); if (r) shop = JSON.parse(r.v); } catch (e) { } let drivers = [{ n: 1, name: "عبدالملك البنقالي" }, { n: 2, name: "محمد الهندي" }, { n: 3, name: "مالك" }]; try { const dr = await env.DB.prepare("SELECT data FROM docs WHERE col='settings' AND id='dlvdrv'").first(); const L = dr && JSON.parse(dr.data).list; if (Array.isArray(L) && L.length) drivers = L.filter(x => x.n <= 9); } catch (e) { } return json({ shop, drivers, ok: true, email: me.email, name: me.name || me.email, owner: me.owner, br, brName: B.name, vat: B.vat, day: posDay() }); }
  if (p === "/api/pos/catv") { const c = await posCat(env); return json({ ok: true, at: c.at }); }
  if (p === "/api/pos/cat") {
    const c = await posCat(env), rows = [];
    /* owner 24 Nov: an item that exists only in the delivery company has no shop price — use its delivery price */
    for (const w of c.by.values()) rows.push([String(w[0]), String(w[1] || ""), +w[B.pi] || +w[6] || 0]);
    return json({ ok: true, at: c.at, br, rows });
  }
  if (p === "/api/pos/sale" && req.method === "POST") {
    const o = await req.json().catch(() => ({}));
    const cid = String(o.cid || ""); if (!/^[A-Za-z0-9_-]{8,40}$/.test(cid)) return json({ ok: false, err: "cid" }, 400);
    const at0 = +o.at && Math.abs(Date.now() - o.at) < 3 * 864e5 ? +o.at : Date.now(), day = posDay(at0), col = "posinv/" + day;
    const ex = await env.DB.prepare("SELECT data FROM docs WHERE col=? AND id=?").bind(col, cid).first();
    if (ex) { const d = JSON.parse(ex.data); return json({ ok: true, no: d.no, total: d.total, dup: true, zqr: (d.z && d.z.qr) || "" }); }
    const c = await posCat(env), lines = []; let total = 0;
    for (const l of (Array.isArray(o.lines) ? o.lines.slice(0, 300) : [])) {
      const code = String(l[0] || ""), qty = Math.round((+l[1] || 0) * 1000) / 1000; if (!(qty > 0 && qty < 10000)) continue;
      const w = c.by.get(code); if (!w) return json({ ok: false, err: "item", code }, 400);
      const pr = +w[B.pi] || +w[6] || 0, amt = posR2(pr * qty); total = posR2(total + amt);
      lines.push([code, String(w[1] || ""), pr, qty, amt, +w[3] || 0]);
    }
    if (!lines.length) return json({ ok: false, err: "empty" }, 400);
    let dlv = null, lrow = null, lid = "", dcr = null, dcId = "";
    if (br === "del" && o.dlv && typeof o.dlv === "object") {
      let fee = posR2(+o.dlv.fee || 0), n = Math.floor(+o.dlv.n || 0), lv = Math.floor(+o.dlv.lv || 0);
      dcId = String(o.dlv.cust || "");
      if (/^c\d{7,12}$/.test(dcId)) { const cw = await env.DB.prepare("SELECT data FROM docs WHERE col='pocust' AND id=?").bind(dcId).first(); if (cw) { const cd = JSON.parse(cw.data); if (cd.lat != null) { dcr = cd; const cc = posLocCalc(cd.lat, cd.lng); fee = total >= 20 ? cc.fee1 : cc.fee0; lv = cc.lv; } } }
      lid = String(o.dlv.loc || "");
      if (!dcr && /^l[a-f0-9]{20}$/.test(lid)) { const lw = await env.DB.prepare("SELECT data FROM docs WHERE col='poloc' AND id=?").bind(lid).first(); if (lw) { lrow = JSON.parse(lw.data); fee = total >= 20 ? lrow.fee1 : lrow.fee0; lv = lrow.lv; } }
      if (!lrow && !dcr && o.ord) { const ow = await env.DB.prepare("SELECT data FROM docs WHERE col='posord' AND id=?").bind(String(o.ord)).first(); if (ow) { const od = JSON.parse(ow.data); if (od.dist === "pickup") fee = 0; else if (od.loc) { const oc = posLocCalc(od.loc.lat, od.loc.lng); fee = total >= 20 ? oc.fee1 : oc.fee0; lv = oc.lv; } else if (!me.owner && String(o.dlv.esc || "").length < 2 && await posStrict(env)) return json({ ok: false, err: "noloc" }, 400); } }
      if (!lrow && !dcr && !o.ord && !me.owner && String(o.dlv.esc || "").length < 2 && await posStrict(env)) return json({ ok: false, err: "noloc" }, 400);
      if (!(fee >= 0 && fee <= 100)) return json({ ok: false, err: "fee" }, 400);
      if (!lrow && !dcr && !o.ord) lv = total >= 20 ? (fee <= 0 ? 1 : fee <= 1 ? 2 : 3) : (fee <= 2 ? 1 : fee <= 3 ? 2 : 3);
      dlv = { fee, n: n >= 1 && n <= 9 ? n : 0, lv: lv >= 1 && lv <= 3 ? lv : 0, name: String(o.dlv.name || "").slice(0, 40) };
      if (fee > 0) total = posR2(total + fee);
    }
    /* owner 24 Nov: «تحويل» (bank transfer) is its own payment — not cash in the drawer, not mada */
    const mode = ["cash", "card", "mix", "tr"].includes(o.mode) || (o.mode === "aj" && br === "shop") ? o.mode : "cash";
    /* owner 24 Nov: «آجل» — sales branch only, an existing customer (Smart Life list) */
    let ajc = ""; if (mode === "aj") { ajc = String(o.cust || "").trim().slice(0, 80); const cl = await posCustList(env); if (!cl.some(x => x[0] === ajc)) return json({ ok: false, err: "cust" }, 400); }
    let cash = mode === "cash" ? total : (mode === "card" || mode === "tr" || mode === "aj") ? 0 : posR2(+o.cash || 0); if (!(cash >= 0 && cash <= total)) return json({ ok: false, err: "pay" }, 400);
    const card = (mode === "tr" || mode === "aj") ? 0 : posR2(total - cash), tr = mode === "tr" ? total : 0;
    const rno = o.no ? await posResvTake(env, me, br, "s", o.no, o.dev) : 0;
    const nr = rno ? { v: rno } : await env.DB.prepare("INSERT INTO meta (k,v) VALUES (?, '1') ON CONFLICT(k) DO UPDATE SET v=CAST(v AS INTEGER)+1 RETURNING v").bind("posno_" + br).first();
    const no = +nr.v, vat = B.vat ? posR2(total * 15 / 115) : 0;
    const doc = { no, br, by: me.email, u: me.name || me.email, day, t: posTime(at0), at: at0, lines, total, vat, cash, card, mode }; if (tr) doc.tr = tr; if (mode === "aj") { doc.aj = total; doc.cust = ajc; }
    if (dlv) doc.dlv = dlv;
    if (mode === "tr") {
      const xid = String(o.xf || ""); let xr = null;
      if (/^x[a-f0-9]{20}$/.test(xid)) { const rw = await env.DB.prepare("SELECT data FROM docs WHERE col='postr' AND id=?").bind(xid).first(); if (rw) xr = JSON.parse(rw.data); }
      if (xr && !xr.inv) { doc.xf = xid; doc.xfAmt = xr.amt; const mis = Math.abs(xr.amt - total) > 0.5; if (mis) doc.xfMis = 1; xr.inv = { day, cid, no, br, total }; if (mis) xr.mis = 1; xr.by = me.email; await writeDoc(env, "postr", xid, xr); }
      else doc.xfBad = me.owner ? "owner" : (xr ? "used" : "none");
    }
    if (br === "del" && !dlv && !o.ord && !me.owner && await posStrict(env)) return json({ ok: false, err: "noloc" }, 400);
    if (lrow) { doc.loc = lid; if (lrow.inv) doc.locDup = 1; }
    if (dcr) doc.dc = dcId;
    if (dlv && !lrow && o.dlv && o.dlv.esc && !me.owner) doc.esc = String(o.dlv.esc).slice(0, 40);
    if (mode === "tr" && !doc.xf && o.xesc && !me.owner) doc.xesc = String(o.xesc).slice(0, 40);
    { const shc = await posShiftCur(env, me.email); if (shc) doc.sh = shc.id; }
    /* owner 27 Nov («الطلبيات اللي خلصها ما تطلع»): an opened order is closed only by an invoice that resembles it; a delivery invoice typed by hand closes the matching order of the last 6 hours by itself */
    let ordId = "", ordBack = "";
    if (o.ord) { try { const ow = await env.DB.prepare("SELECT data FROM docs WHERE col='posord' AND id=?").bind(String(o.ord)).first(); if (ow) { const sm = posOrdSim(JSON.parse(ow.data), lines); if (sm.r >= 0.5) ordId = String(o.ord); else { ordBack = String(o.ord); doc.ordMis = ordBack; } } } catch (e) { } }
    else if (br === "del") { try { const f = await posOrdFind(env, lines, at0); if (f) { ordId = f; doc.ordAuto = 1; } } catch (e) { } }
    if (ordId) doc.ord = ordId;
    await writeDoc(env, col, cid, doc);
    if (lrow) { lrow.inv = { day, cid, no, total }; try { await writeDoc(env, "poloc", lid, lrow); } catch (e) { } }
    /* owner 24 Nov: shop-branch invoices are signed for ZATCA when saved */
    let zqr = ""; try { const zr = await posZ(env, col, cid, doc); if (zr) zqr = zr.qr; } catch (e) { }
    if (dlv && dlv.n && dlv.lv) { try { await posLvAdd(env, day, dlv.n, dlv.lv); } catch (e) { } }
    if (ordId) { try { await posOrderDone(env, ordId, no, me.email, { br, day, cid, auto: doc.ordAuto ? 1 : 0 }); } catch (e) { } }
    if (ordBack) { try { const bw = await env.DB.prepare("SELECT data FROM docs WHERE col='posord' AND id=?").bind(ordBack).first(); if (bw) { const bd = JSON.parse(bw.data); if (bd.st === "taken") { bd.st = "new"; delete bd.by; delete bd.u; bd.misInv = no; await writeDoc(env, "posord", ordBack, bd); } } } catch (e) { } }
    return json({ ok: true, no, total, zqr });
  }
  if (p === "/api/pos/dcust") {
    if (req.method === "POST") {
      const o = await req.json().catch(() => ({})), lid = String(o.loc || ""); let lrow = null;
      if (/^l[a-f0-9]{20}$/.test(lid)) { const lw = await env.DB.prepare("SELECT data FROM docs WHERE col='poloc' AND id=?").bind(lid).first(); if (lw) lrow = JSON.parse(lw.data); }
      if (o.clear) { await posCurSet(env, ""); return json({ ok: true }); }
      const nm = String(o.name || "").trim(); if (nm.length < 2) return json({ ok: false, err: "name" }, 400);
      const r = await posDcSave(env, nm, o.phone, lrow, lrow ? lid : "", me.name || me.email); if (!r) return json({ ok: false, err: "phone" }, 400);
      return json({ ok: true, id: r.id });
    }
    const rows = (await env.DB.prepare("SELECT id,data FROM docs WHERE col='pocust' ORDER BY at DESC LIMIT 3000").all()).results || [], list = [];
    for (const x of rows) { const d = JSON.parse(x.data); list.push({ id: x.id, name: d.name, phone: d.phone, hasLoc: d.lat != null, d: d.d, lv: d.lv, fee0: d.fee0, fee1: d.fee1, upd: d.updAt || d.at, hist: (d.hist || []).length, by: me.owner ? d.by : undefined, lat: me.owner ? d.lat : undefined, lng: me.owner ? d.lng : undefined }); }
    return json({ ok: true, list, cur: await posCurGet(env) });
  }
  if (p === "/api/pos/xfer") {
    const rows = (await env.DB.prepare("SELECT id,data FROM docs WHERE col='postr' ORDER BY at DESC LIMIT 150").all()).results || [], since = Date.now() - 2 * 864e5, list = [];
    for (const x of rows) { const d = JSON.parse(x.data); if (!(d.at > since)) continue; if (d.inv && !me.owner) continue; list.push({ id: x.id, amt: d.amt, at: d.at, t: d.t, sender: d.sender, bank: d.bank, ref: d.ref, free: !d.inv, inv: d.inv ? d.inv.no : null, mis: d.mis ? 1 : 0, cn: d.cn || "" }); }
    const lrows = (await env.DB.prepare("SELECT id,data FROM docs WHERE col='poloc' ORDER BY at DESC LIMIT 60").all()).results || [], locs = [];
    for (const x of lrows) { const d = JSON.parse(x.data); if (d.at < Date.now() - 12 * 36e5) continue; if (d.inv && !me.owner) continue; locs.push({ id: x.id, at: d.at, t: d.t, d: d.d, lv: d.lv, fee0: d.fee0, fee1: d.fee1, lat: d.lat, lng: d.lng, free: !d.inv }); }
    list.sort((a, b) => b.at - a.at); return json({ ok: true, now: Date.now(), locs, strict: await posStrict(env), stale: list.filter(x => x.free && x.at < Date.now() - 72e5).length, list: me.owner ? list.slice(0, 40) : list.filter(x => x.free && x.at > Date.now() - 12 * 36e5) });
  }
  if (p === "/api/pos/xfimg") { const id = String(q.get("id") || ""); if (!/^x[a-f0-9]{20}$/.test(id)) return json({ ok: false }, 400); const r = await getAsset(env, "xf:" + id); return r || json({ ok: false }, 404); }
  if (p === "/api/pos/day") {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(q.get("d") || "") ? q.get("d") : posDay();
    const r = (await env.DB.prepare("SELECT data FROM docs WHERE col=?").bind("posinv/" + day).all()).results || [];
    let L = r.map(x => JSON.parse(x.data)); if (!me.owner) L = L.filter(d => d.by === me.email);
    const sum = {}; for (const k of Object.keys(POS_BR)) sum[k] = { n: 0, total: 0, cash: 0, card: 0, vat: 0 };
    for (const d of L) { const s = sum[d.br] || (sum[d.br] = { n: 0, total: 0, cash: 0, card: 0, vat: 0 }); if (d.kind === "ret") s.rn = (s.rn || 0) + 1; else s.n++; s.total = posR2(s.total + d.total); s.cash = posR2(s.cash + d.cash); s.card = posR2(s.card + d.card); s.tr = posR2((s.tr || 0) + (d.tr || 0)); s.aj = posR2((s.aj || 0) + (d.aj || 0)); s.vat = posR2(s.vat + (d.vat || 0)); }
    L.sort((a, b) => b.at - a.at);
    const full = q.get("full") === "1";
    return json({ ok: true, day, sum, inv: L.slice(0, full ? 500 : 30).map(d => full ? d : { kind: d.kind, refNo: d.refNo, no: d.no, br: d.br, u: d.u, t: d.t, total: d.total, cash: d.cash, card: d.card, tr: d.tr || 0, aj: d.aj || 0, cust: d.cust || "", mode: d.mode, lines: d.lines.map(l => [l[1], l[2], l[3], l[4]]), vat: d.vat }) });
  }
  if (p === "/api/pos/custs") { if (br !== "shop") return json({ ok: false }, 403); return json({ ok: true, list: (await posCustList(env)).map(x => [x[0]]) }); }
  if (p === "/api/pos/users") return await posUsersApi(env, req, me);
  if (p === "/api/pos/range") return await posRange(env, me, q);
  if (p === "/api/pos/branches") {
    if (!me.owner) return json({ ok: false }, 403);
    const map = await posBrMap(env);
    if (req.method === "POST") {
      const o = await req.json().catch(() => ({})), em = String(o.email || "").toLowerCase();
      if (!POS_BR[o.br] || !(await userOf(env, em))) return json({ ok: false, err: "bad" }, 400);
      map[em] = o.br; await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES ('posbranch',?)").bind(JSON.stringify(map)).run();
      return json({ ok: true, map });
    }
    const us = (await env.DB.prepare("SELECT email,name FROM users ORDER BY at").all()).results || [];
    return json({ ok: true, owner: OWNER, users: us, map });
  }
  return json({ ok: false, err: "nf" }, 404);
}

async function posUsers(env) { const r = await env.DB.prepare("SELECT v FROM meta WHERE k='posuser'").first(); try { return r ? JSON.parse(r.v) : {}; } catch (e) { return {}; } }
/* owner 24 Nov: user names may be typed with spaces and with any alef/yaa/taa-marbuta form («عاصف توصيل», «احمد توصيل») */
const posUnNorm = u => String(u || "").replace(/\s+/g, "").toLowerCase().replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[\u064B-\u0652\u0640]/g, "");
async function posUserEmail(env, u) { const m = await posUsers(env), k = posUnNorm(u); if (m[k]) return m[k]; for (const x of Object.keys(m)) if (posUnNorm(x) === k) return m[x]; return ""; }
async function posUsersApi(env, req, me) {
  if (!me.owner) return json({ ok: false }, 403);
  const um = await posUsers(env), bm = await posBrMap(env);
  const unOf = em => Object.keys(um).find(k => um[k] === em) || "";
  if (req.method === "POST") {
    const o = await req.json().catch(() => ({}));
    let email = String(o.email || "").trim().toLowerCase(); const un = String(o.username || "").replace(/\s+/g, "").toLowerCase(), name = String(o.name || "").trim().slice(0, 80), pw = String(o.pw || ""), br = o.br;
    if (!/^[a-z0-9._\u0621-\u064A\u0660-\u0669]{3,20}$/.test(un)) return json({ ok: false, err: "un" });
    if (!POS_BR[br]) return json({ ok: false, err: "br" });
    if (!email) { email = un + "@pos.taiba"; if (await userOf(env, email)) return json({ ok: false, err: "taken" }); if (!name) return json({ ok: false, err: "name" }); if (!pw) return json({ ok: false, err: "pw" }); }
    else if (!(await userOf(env, email))) return json({ ok: false, err: "nouser" });
    if (um[un] && um[un] !== email) return json({ ok: false, err: "taken" });
    if (pw && !PIN_RULE.test(pw)) return json({ ok: false, err: "rule" });
    if (!OWNERS.includes(email)) {
      if (!(await userOf(env, email))) await env.DB.prepare("INSERT INTO users (email,uid,name,at) VALUES (?,?,?,?)").bind(email, STAFF_UID, name, Date.now()).run();
      else if (name) await env.DB.prepare("UPDATE users SET name=? WHERE email=?").bind(name, email).run();
    }
    for (const k of Object.keys(um)) if (um[k] === email) delete um[k];
    um[un] = email; bm[email] = br;
    const B = [env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES ('posuser',?)").bind(JSON.stringify(um)), env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES ('posbranch',?)").bind(JSON.stringify(bm))];
    if (pw) { const salt = rnd().slice(0, 16); B.push(env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)").bind("pin_" + email, JSON.stringify({ salt, h: await pinHash(email, pw, salt), at: Date.now() }))); }
    await env.DB.batch(B);
    return json({ ok: true });
  }
  const us = (await env.DB.prepare("SELECT email,name FROM users ORDER BY at").all()).results || [];
  const L = [{ email: OWNER, name: "صاحب المحل" }].concat(us.filter(u => u.email !== OWNER)).map(u => ({ email: u.email, name: u.name || "", username: unOf(u.email), br: POS_BR[bm[u.email]] ? bm[u.email] : "shop" }));
  return json({ ok: true, users: L });
}

/* owner 24 Nov: offline selling — the laptop reserves invoice numbers while online and uses them when the internet is cut */
async function posZ(env, col, cid, doc) {
  const big = +doc.no >= 100000 || +doc.refNo >= 100000; if (!big) return await ZATCA.zSign(env, col, cid, doc);
  const L = "ABCDEGHIJKLMNOPQSTUVWXYZ", f = n => +n >= 100000 ? L.charAt(Math.floor(n / 100000) - 1) + (n % 100000) : n;
  const zd = Object.assign({}, doc, { no: f(doc.no) }); if (doc.refNo != null) zd.refNo = f(doc.refNo);
  let r = null; try { r = await ZATCA.zSign(env, col, cid, zd); } finally { if (zd.z) { doc.z = zd.z; await env.DB.prepare("UPDATE docs SET data=? WHERE col=? AND id=?").bind(JSON.stringify(doc), col, cid).run(); } }
  return r;
}
/* owner 24 Nov: invoice numbers — online every device takes the next number of one running series; offline each device (shop branch) uses its own lettered series, reserved while online */
async function posResvTake(env, me, br, k, no, dev) {
  no = Math.floor(+no || 0); if (!no) return 0;
  dev = String(dev || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  const key = (br === "shop" && dev.length >= 8) ? "posresv_" + k + "_dev_" + dev : "posresv_" + k + "_" + me.email, r = await env.DB.prepare("SELECT v FROM meta WHERE k=?").bind(key).first();
  let L = []; try { L = r ? JSON.parse(r.v) : []; } catch (e) { }
  if (!L.some(x => no >= x[0] && no <= x[1])) return 0;
  const used = await env.DB.prepare("SELECT 1 FROM docs WHERE col LIKE 'posinv/%' AND json_extract(data,'$.no')=? AND json_extract(data,'$.br')=? AND " + (k === "r" ? "json_extract(data,'$.kind')='ret'" : "json_extract(data,'$.kind') IS NULL") + " LIMIT 1").bind(no, br).first();
  return used ? 0 : no;
}
async function posResvApi(env, req, me, br) {
  const o = await req.json().catch(() => ({})), k = o.k === "r" ? "r" : "s", n = Math.max(1, Math.min(50, Math.floor(+o.n || 20)));
  const dev = String(o.dev || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  if (br === "shop" && dev.length >= 8) {
    const ik = "posdevi_shop_" + dev, ir = await env.DB.prepare("SELECT v FROM meta WHERE k=?").bind(ik).first();
    let idx = ir ? +ir.v : 0;
    if (!idx) {
      const dn = await env.DB.prepare("INSERT INTO meta (k,v) VALUES ('posdevn_shop','1') ON CONFLICT(k) DO UPDATE SET v=CAST(v AS INTEGER)+1 RETURNING v").first();
      idx = +dn.v; if (idx > 24) return json({ ok: false, err: "dev" }, 400);
      await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)").bind(ik, String(idx)).run();
    }
    const nr = await env.DB.prepare("INSERT INTO meta (k,v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=CAST(v AS INTEGER)+? RETURNING v").bind("posoff_" + k + "_shop_" + idx, String(n), n).first();
    const to = +nr.v, from = to - n + 1, key = "posresv_" + k + "_dev_" + dev, r = await env.DB.prepare("SELECT v FROM meta WHERE k=?").bind(key).first();
    let L = []; try { L = r ? JSON.parse(r.v) : []; } catch (e) { }
    L.push([idx * 100000 + from, idx * 100000 + to]); L = L.slice(-8);
    await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)").bind(key, JSON.stringify(L)).run();
    return json({ ok: true, k, from: idx * 100000 + from, to: idx * 100000 + to, br, idx });
  }
  const nr = await env.DB.prepare("INSERT INTO meta (k,v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=CAST(v AS INTEGER)+? RETURNING v").bind((k === "r" ? "posret_" : "posno_") + br, String(n), n).first();
  const to = +nr.v, from = to - n + 1, key = "posresv_" + k + "_" + me.email, r = await env.DB.prepare("SELECT v FROM meta WHERE k=?").bind(key).first();
  let L = []; try { L = r ? JSON.parse(r.v) : []; } catch (e) { }
  L.push([from, to]); L = L.slice(-8);
  await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)").bind(key, JSON.stringify(L)).run();
  return json({ ok: true, k, from, to, br });
}
async function posRetApi(env, req, me, p, q, br, B) {
  if (p === "/api/pos/resv" && req.method === "POST") return await posResvApi(env, req, me, br);
  /* owner 24 Nov: anything taken off a sale before it is saved (a line deleted, a quantity lowered, the basket emptied) is logged; the owner sees a red counter until he marks each «شفته» */
  if (p === "/api/pos/void" && req.method === "POST") {
    const o = await req.json().catch(() => ({})), cid = String(o.cid || ""); if (!/^[A-Za-z0-9_-]{8,40}$/.test(cid)) return json({ ok: false, err: "cid" }, 400);
    const ex = await env.DB.prepare("SELECT 1 FROM docs WHERE col='posvoid' AND id=?").bind(cid).first(); if (ex) return json({ ok: true, dup: true });
    const lines = (Array.isArray(o.lines) ? o.lines.slice(0, 200) : []).map(l => [String(l[0] || "").slice(0, 40), String(l[1] || "").slice(0, 120), posR2(+l[2] || 0), Math.round((+l[3] || 0) * 1000) / 1000]).filter(l => l[3] > 0);
    if (!lines.length) return json({ ok: false, err: "empty" });
    const at = +o.at && Math.abs(Date.now() - o.at) < 3 * 864e5 ? +o.at : Date.now(), kind = ["del", "dec", "clr"].includes(o.kind) ? o.kind : "del";
    const amt = posR2(lines.reduce((s, l) => s + l[2] * l[3], 0));
    await writeDoc(env, "posvoid", cid, { kind, lines, amt, n: lines.length, u: me.name || me.email, by: me.email, br, day: posDay(at), t: posTime(at), at, seen: false });
    return json({ ok: true });
  }
  /* owner 25 Nov: the cashier changes an item's name/price or adds an unknown item right from the POS; applies at once, is logged, and the owner sees a red counter */
  if (p === "/api/pos/item" && req.method === "POST") {
    const o = await req.json().catch(() => ({})), code = String(o.code || "").trim();
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(code)) return json({ ok: false, err: "code" }, 400);
    const nm = o.name == null ? null : String(o.name).replace(/\s+/g, " ").trim().slice(0, 80), pr = o.price == null || o.price === "" ? null : posR2(+o.price);
    if (nm !== null && nm.length < 2) return json({ ok: false, err: "name" }, 400);
    if (pr !== null && !(pr > 0 && pr <= 5000)) return json({ ok: false, err: "price" }, 400);
    const c = await posCat(env), w = c.by.get(code), now = Date.now();
    const nr = await env.DB.prepare("SELECT data FROM docs WHERE col='posnm' AND id='main'").first(); let no = { m: {} }; try { if (nr) no = JSON.parse(nr.data); } catch (e) { } no.m = no.m || {}; no.p = no.p || {}; no.n = no.n || {}; no.pb = no.pb || {};
    const logs = [];
    if (o.nw) {
      if (w) return json({ ok: false, err: "exists" }, 400); if (nm === null || pr === null) return json({ ok: false, err: "fields" }, 400);
      no.n[code] = [code, nm, pr, 0, 0, 0, pr]; logs.push({ k: "new", n1: nm, p1: pr });
    } else {
      if (!w) return json({ ok: false, err: "item" }, 400); if (nm === null && pr === null) return json({ ok: false, err: "fields" }, 400);
      if (pr !== null && pr !== +w[2]) { logs.push({ k: "price", n0: String(w[1] || ""), p0: +w[2] || 0, p1: pr }); if (no.p[code] === undefined) { if (no.n[code]) delete no.pb[code]; else no.pb[code] = +w[2]; } no.p[code] = pr; if (no.n[code]) no.n[code][2] = no.n[code][6] = pr; }
      if (nm !== null && nm !== String(w[1] || "")) { logs.push({ k: "name", n0: String(w[1] || ""), n1: nm }); no.m[code] = nm; if (no.n[code]) no.n[code][1] = nm; }
    }
    if (!logs.length) return json({ ok: true, same: true });
    no.at = now; await writeDoc(env, "posnm", "main", no); POSCAT = null;
    let i = 0; for (const L of logs) await writeDoc(env, "positem", "e" + now.toString(36) + (i++) + Math.random().toString(36).slice(2, 5), Object.assign({ code, u: me.name || me.email, by: me.email, br, day: posDay(now), t: posTime(now), at: now, seen: false }, L));
    const c2 = await posCat(env), w2 = c2.by.get(code);
    return json({ ok: true, row: [code, String(w2[1] || ""), +w2[2] || 0] });
  }
  if (p === "/api/pos/itemlog") {
    if (!me.owner) return json({ ok: false }, 403);
    const r = (await env.DB.prepare("SELECT id,data FROM docs WHERE col='positem' AND at>? ORDER BY at DESC LIMIT 200").bind(Date.now() - 14 * 864e5).all()).results || [];
    const L = r.map(x => Object.assign(JSON.parse(x.data), { id: x.id }));
    return json({ ok: true, unseen: L.filter(x => !x.seen).length, list: L });
  }
  if (p === "/api/pos/itemlog/seen" && req.method === "POST") {
    if (!me.owner) return json({ ok: false }, 403);
    const o = await req.json().catch(() => ({})), ids = o.all ? (((await env.DB.prepare("SELECT id FROM docs WHERE col='positem' AND json_extract(data,'$.seen')=0").all()).results) || []).map(x => x.id) : [String(o.id || "")];
    for (const id of ids) { const x = await env.DB.prepare("SELECT data FROM docs WHERE col='positem' AND id=?").bind(id).first(); if (!x) continue; const d = JSON.parse(x.data); d.seen = true; d.seenAt = Date.now(); await writeDoc(env, "positem", id, d); }
    return json({ ok: true, n: ids.length });
  }
  if (p === "/api/pos/voids") {
    if (!me.owner) return json({ ok: false }, 403);
    const since = Date.now() - 7 * 864e5;
    const r = (await env.DB.prepare("SELECT id,data FROM docs WHERE col='posvoid' AND at>? ORDER BY at DESC LIMIT 200").bind(since).all()).results || [];
    const L = r.map(x => Object.assign(JSON.parse(x.data), { id: x.id }));
    return json({ ok: true, unseen: L.filter(x => !x.seen).length, list: L });
  }
  if (p === "/api/pos/voids/seen" && req.method === "POST") {
    if (!me.owner) return json({ ok: false }, 403);
    const o = await req.json().catch(() => ({})), ids = o.all ? (((await env.DB.prepare("SELECT id FROM docs WHERE col='posvoid' AND json_extract(data,'$.seen')=0").all()).results) || []).map(x => x.id) : [String(o.id || "")];
    for (const id of ids) { const x = await env.DB.prepare("SELECT data FROM docs WHERE col='posvoid' AND id=?").bind(id).first(); if (!x) continue; const d = JSON.parse(x.data); d.seen = true; d.seenAt = Date.now(); await writeDoc(env, "posvoid", id, d); }
    return json({ ok: true, n: ids.length });
  }
  const sold = async (no) => {
    const r = await env.DB.prepare("SELECT id,data FROM docs WHERE col LIKE 'posinv/%' AND json_extract(data,'$.no')=? AND json_extract(data,'$.br')=? AND json_extract(data,'$.kind') IS NULL ORDER BY at DESC LIMIT 1").bind(no, br).first();
    if (!r) return null;
    const inv = JSON.parse(r.data); inv.cid = r.id;
    const rr = (await env.DB.prepare("SELECT data FROM docs WHERE col LIKE 'posinv/%' AND json_extract(data,'$.kind')='ret' AND json_extract(data,'$.ref')=?").bind(r.id).all()).results || [];
    const back = {}; for (const x of rr) for (const l of JSON.parse(x.data).lines) back[l[0]] = posR2((back[l[0]] || 0) + Math.abs(l[3]));
    return { inv, back };
  };
  if (p === "/api/pos/inv") {
    const no = Math.floor(+q.get("no") || 0); if (!no) return json({ ok: false, err: "no" });
    const s = await sold(no); if (!s) return json({ ok: false, err: "nf" });
    const d = s.inv;
    return json({ ok: true, inv: { cid: d.cid, no: d.no, day: d.day, t: d.t, u: d.u, total: d.total, mode: d.mode, cash: d.cash, card: d.card, lines: d.lines.map(l => ({ c: l[0], n: l[1], p: l[2], q: l[3], back: s.back[l[0]] || 0 })) } });
  }
  if (p === "/api/pos/ret" && req.method === "POST") {
    const o = await req.json().catch(() => ({}));
    const cid = String(o.cid || ""); if (!/^[A-Za-z0-9_-]{8,40}$/.test(cid)) return json({ ok: false, err: "cid" }, 400);
    const at0 = +o.at && Math.abs(Date.now() - o.at) < 3 * 864e5 ? +o.at : Date.now(), day = posDay(at0), col = "posinv/" + day;
    const ex = await env.DB.prepare("SELECT data FROM docs WHERE col=? AND id=?").bind(col, cid).first();
    if (ex) { const d = JSON.parse(ex.data); return json({ ok: true, no: d.no, total: d.total, dup: true, zqr: (d.z && d.z.qr) || "" }); }
    const s = await sold(Math.floor(+o.no || 0)); if (!s || s.inv.cid !== o.ref) return json({ ok: false, err: "nf" });
    const lines = []; let amt = 0;
    for (const l of (Array.isArray(o.lines) ? o.lines : [])) {
      const code = String(l[0] || ""), qty = Math.round((+l[1] || 0) * 1000) / 1000; if (!(qty > 0)) continue;
      const L = s.inv.lines.find(x => x[0] === code); if (!L) return json({ ok: false, err: "item" });
      if (qty > posR2(L[3] - (s.back[code] || 0)) + 1e-9) return json({ ok: false, err: "qty", code });
      const a = posR2(L[2] * qty); amt = posR2(amt + a);
      lines.push([code, L[1], L[2], -qty, -a, L[5] || 0]);
    }
    if (!lines.length) return json({ ok: false, err: "empty" });
    const how = s.inv.mode === "aj" ? "aj" : o.how === "card" ? "card" : "cash";
    const rrn = o.rno ? await posResvTake(env, me, br, "r", o.rno, o.dev) : 0;
    const nr = rrn ? { v: rrn } : await env.DB.prepare("INSERT INTO meta (k,v) VALUES (?, '1') ON CONFLICT(k) DO UPDATE SET v=CAST(v AS INTEGER)+1 RETURNING v").bind("posret_" + br).first();
    const total = -amt, vat = B.vat ? -posR2(amt * 15 / 115) : 0;
    const doc = { kind: "ret", ref: s.inv.cid, refNo: s.inv.no, no: +nr.v, br, by: me.email, u: me.name || me.email, day, t: posTime(at0), at: at0, lines, total, vat, cash: how === "cash" ? total : 0, card: how === "card" ? total : 0, mode: how }; if (how === "aj") { doc.aj = total; doc.cust = s.inv.cust || ""; }
    { const shc = await posShiftCur(env, me.email); if (shc) doc.sh = shc.id; }
    await writeDoc(env, col, cid, doc);
    let zqr = ""; try { const zr = await posZ(env, col, cid, doc); if (zr) zqr = zr.qr; } catch (e) { }
    return json({ ok: true, no: doc.no, total, zqr });
  }
  return null;
}

async function posRange(env, me, q) {
  if (!me.owner) return json({ ok: false }, 403);
  const re = /^\d{4}-\d{2}-\d{2}$/, f = re.test(q.get("f") || "") ? q.get("f") : posDay(), t = re.test(q.get("t") || "") ? q.get("t") : f;
  const r = (await env.DB.prepare("SELECT data FROM docs WHERE col>=? AND col<=?").bind("posinv/" + f, "posinv/" + t).all()).results || [];
  const z = () => ({ n: 0, total: 0, cash: 0, card: 0, rn: 0, ret: 0, vat: 0 }), all = z(), br = { shop: z(), del: z() }, us = {}, days = {}, dbr = {};
  for (const x of r) {
    const d = JSON.parse(x.data); if (!d || !d.day || d.day < f || d.day > t) continue;
    for (const s of [all, br[d.br] || (br[d.br] = z()), us[d.u] || (us[d.u] = z()), days[d.day] || (days[d.day] = z()), dbr[d.day + "|" + d.br] || (dbr[d.day + "|" + d.br] = z())]) {
      if (d.kind === "ret") { s.rn++; s.ret = posR2(s.ret + d.total); } else s.n++;
      s.total = posR2(s.total + d.total); s.cash = posR2(s.cash + d.cash); s.card = posR2(s.card + d.card); s.tr = posR2((s.tr || 0) + (d.tr || 0)); s.aj = posR2((s.aj || 0) + (d.aj || 0)); s.vat = posR2(s.vat + (d.vat || 0));
    }
  }
  return json({ ok: true, f, t, all, br, us, days, dbr });
}

/* owner 24 Nov: the POS has its own login (username + password); a cashier's ledger login does not open it */
const POS_LOGIN_HTML = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>نقاط البيع — الدخول</title><style>body{margin:0;font-family:Tahoma,system-ui,sans-serif;background:#eef1f4;color:#1b2430;display:flex;min-height:100vh;align-items:center;justify-content:center}.c{background:#fff;border:1px solid #dfe5ea;border-radius:18px;padding:34px 28px;width:360px;max-width:92vw;text-align:center}h1{font-size:22px;margin:0 0 4px}p{color:#64748b;margin:0 0 22px}label{display:block;text-align:right;font-size:14px;color:#475569;margin:0 2px 6px}input{width:100%;box-sizing:border-box;height:52px;border:1.5px solid #cfd8df;border-radius:12px;padding:0 14px;font-size:18px;margin-bottom:14px;font-family:inherit}input:focus{outline:none;border-color:#16a34a}button{width:100%;height:56px;border:0;border-radius:12px;background:#14532d;color:#fff;font-size:19px;font-weight:700;font-family:inherit;cursor:pointer}.e{background:#fee2e2;color:#991b1b;border-radius:10px;padding:10px;margin-bottom:14px;display:none}</style></head><body><form class="c" method="post" action="/poslogin"><h1>أسواق طيبة</h1><p>نقاط البيع</p><div class="e" id="e"></div><label for="u">اسم المستخدم</label><input id="u" name="u" autocomplete="username" autocapitalize="off" required autofocus><label for="pw">الرقم السري</label><input id="pw" name="pw" type="password" dir="ltr" autocomplete="current-password" autocapitalize="off" maxlength="20" required><button type="submit">دخول</button></form><script>var m=location.search.match(/e=(\w+)/);if(m){var T={wrong:"اسم المستخدم أو الرقم السري غير صحيح.",locked:"محاولات خاطئة كثيرة. الدخول موقوف 15 دقيقة.",x:"تعذّر الدخول، جرّب مرة ثانية."},e=document.getElementById("e");e.textContent=T[m[1]]||T.x;e.style.display="block"}</script></body></html>';
async function posWho(req, env) {
  const t = cookie(req, "psid"); if (!t) return null;
  const s = await env.DB.prepare("SELECT email,at FROM sess WHERE hh=?").bind(await sha("p|" + t)).first();
  if (!s || Date.now() - s.at > SES_DAYS * 864e5) return null;
  return await userOf(env, s.email);
}
async function posLogin(env, req) {
  const back = e => new Response(null, { status: 303, headers: { Location: "/pos/?e=" + e, "Cache-Control": "no-store" } });
  const fd = await req.formData().catch(() => null); if (!fd) { try { await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)").bind("login_dbg", JSON.stringify({ at: Date.now(), ct: req.headers.get("content-type"), cl: req.headers.get("content-length"), ua: (req.headers.get("user-agent") || "").slice(0, 160), used: req.bodyUsed })).run(); } catch (e) { } return back("x"); }
  const un = String(fd.get("u") || "").replace(/\s+/g, "").toLowerCase().slice(0, 40), pw = String(fd.get("pw") || "").trim().slice(0, 40), now = Date.now();
  const em = un ? (un.includes("@") ? un : await posUserEmail(env, un)) : "";
  const usr = em ? await userOf(env, em) : null; if (!usr) return back("wrong");
  const cur = await pinGet(env, usr.email); if (!cur) return back("wrong");
  if (cur.lockUntil && cur.lockUntil > now) return back("locked");
  if (pw && await pinHash(usr.email, pw, cur.salt) === cur.h) {
    cur.fail = 0; delete cur.lockUntil; const t = rnd();
    await env.DB.batch([env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)").bind("pin_" + usr.email, JSON.stringify(cur)), env.DB.prepare("INSERT INTO sess (hh,email,at,pin) VALUES (?,?,?,1)").bind(await sha("p|" + t), usr.email, now)]);
    return new Response(null, { status: 303, headers: { Location: "/pos/", "Cache-Control": "no-store", "Set-Cookie": "psid=" + t + "; Path=/; Max-Age=" + SES_DAYS * 86400 + "; HttpOnly; Secure; SameSite=Lax" } });
  }
  cur.fail = (cur.fail || 0) + 1; let lk = false; if (cur.fail >= 5) { cur.lockUntil = now + 15 * 60e3; cur.fail = 0; lk = true; }
  await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)").bind("pin_" + usr.email, JSON.stringify(cur)).run();
  return back(lk ? "locked" : "wrong");
}

/* owner 24 Nov: POS shifts — opening float before selling; blind closing count; the result goes to the owner */
/* owner 26 Nov: the shift that handed the drawer to this one — same branch, same device when both are named.
   owner 27 Nov («عدل كل العجوزات الوهمية»): the last one closed before THIS shift closes (not before it opened) — a cashier who opens while the other is still on the drawer takes the drawer from him when he hands over */
async function shPred(env, cur) {
  const r = (await env.DB.prepare("SELECT id,data FROM docs WHERE col='posshift' AND json_extract(data,'$.br')=? AND json_extract(data,'$.st')='closed' AND json_extract(data,'$.closeAt')<=? ORDER BY json_extract(data,'$.closeAt') DESC LIMIT 20").bind(cur.br, (+cur.closeAt || Date.now()) + 120000).all()).results || [];
  let first = null;
  for (const x of r) { if (x.id === cur.id) continue; const d = JSON.parse(x.data); d.id = x.id; if (!first) first = d; if (cur.dev && d.dev === cur.dev) return d; }
  return cur.dev ? (r.length && first && !first.dev ? first : (first && first.dev === cur.dev ? first : (first && !cur.dev ? first : first))) : first;
}
/* the cash a closed shift left in the drawer: its handover count, or (shifts before 26 Nov) the «leave» of its ledger closing */
const shKey = pr => pr.left != null ? +pr.leftAt || 0 : (pr.rec && pr.rec.at ? +pr.rec.at : 0);
async function shRecOf(env, pr) {
  if (pr.left != null) return +pr.left;
  if (pr.rec && pr.rec.cash != null) return +pr.rec.cash;
  const ym = posDay(pr.closeAt).slice(0, 7), nm = String(pr.u || "").replace(/\s+(مبيعات|توصيل)$/, "").trim(), sh = pr.br === "del" ? "توصيل" : "مبيعات";
  const row = await env.DB.prepare("SELECT data FROM docs WHERE col=? AND json_extract(data,'$.cashier')=? AND json_extract(data,'$.shift')=? AND json_extract(data,'$.at')>=? AND json_extract(data,'$.at')<=? ORDER BY at DESC LIMIT 1").bind("months/" + ym + "/closings", nm, sh, (+pr.closeAt || 0) - 3600e3, (+pr.closeAt || 0) + 12 * 3600e3).first();
  if (!row) return null; const c = JSON.parse(row.data); return c.leave != null ? +c.leave : null;
}
async function posShiftCur(env, email) {
  const r = await env.DB.prepare("SELECT id,data FROM docs WHERE col='posshift' AND json_extract(data,'$.by')=? AND json_extract(data,'$.st')='open' ORDER BY at DESC LIMIT 1").bind(email).first();
  if (!r) return null; const d = JSON.parse(r.data); d.id = r.id; return d;
}
/* owner 24 Nov: the cashier closes in the ledger from his phone; POS invoices join the day's invoice list the closing balances against (same shape as Smart Life: [time, id, ref, total, paid, user]) */
/* owner 24 Nov: the sales chart (and rewards) read slsales/<month>; the ledger's own POS sales join Smart Life's there, by branch, hour and cashier (read-time merge, nothing stored twice) */
async function posSalesMerge(env, ym, x) {
  let r; try { r = (await env.DB.prepare("SELECT col,data FROM docs WHERE col>=? AND col<?").bind("posinv/" + ym + "-", "posinv/" + ym + "-~").all()).results || []; } catch (e) { r = []; }
  if (!r.length) return x;
  x = x || { days: {} }; x.days = x.days || {};
  const z = () => new Array(24).fill(0), R2 = v => Math.round(v * 100) / 100;
  for (const row of r) {
    let v; try { v = JSON.parse(row.data); } catch (e) { continue; }
    const day = row.col.slice(7), a = v.br === "del" ? "d" : "s", tot = +v.total || 0, ret = v.kind === "ret", h = Math.min(23, Math.max(0, parseInt(String(v.t || "0").slice(0, 2), 10) || 0));
    const D = x.days[day] || (x.days[day] = {});
    const T = Array.isArray(D[a]) ? D[a] : (D[a] = [0, 0, 0, 0]);
    if (ret) T[1] = R2((+T[1] || 0) + tot); else { T[0] = R2((+T[0] || 0) + tot); T[3] = (+T[3] || 0) + 1; }
    const H = Array.isArray(D["h" + a]) ? D["h" + a] : (D["h" + a] = z()); H[h] = R2((+H[h] || 0) + tot);
    if (!ret) { const N = Array.isArray(D["hn" + a]) ? D["hn" + a] : (D["hn" + a] = z()); N[h] = (+N[h] || 0) + 1; }
    const U = Array.isArray(D.u) ? D.u : (D.u = []), nm = String(v.u || ""); let e = U.find(o => o && o.a === a && o.name === nm);
    if (!e) { e = { a, name: nm, t: [0, 0, 0, 0], h: z(), n: z() }; U.push(e); }
    if (ret) e.t[1] = R2((+e.t[1] || 0) + tot); else { e.t[0] = R2((+e.t[0] || 0) + tot); e.t[3] = (+e.t[3] || 0) + 1; e.n[h] = (+e.n[h] || 0) + 1; }
    e.h[h] = R2((+e.h[h] || 0) + tot);
    if (!ret && v.dlv && +v.dlv.fee > 0) { D.f = R2((+D.f || 0) + (+v.dlv.fee)); D.fn = (+D.fn || 0) + 1; }
    D.pos = 1;
  }
  return x;
}
async function posSlMerge(env, day, x) {
  let r; try { r = (await env.DB.prepare("SELECT data FROM docs WHERE col=?").bind("posinv/" + day).all()).results || []; } catch (e) { r = []; }
  if (!r.length) return x;
  x = x ? JSON.parse(JSON.stringify(x)) : { s: [], d: [], at: 0, last: {} };
  x.last = x.last || {}; let at = +x.at || 0;
  for (const row of r) {
    const v = JSON.parse(row.data), k = v.br === "del" ? "d" : "s", g = v.kind === "ret" ? -Math.abs(+v.total || 0) : (+v.total || 0);
    if (!Array.isArray(x[k])) x[k] = [];
    x[k].push([String(v.t || ""), "p" + v.no, (v.kind === "ret" ? "POSR/" : "POS/") + v.no, g, g, v.u || ""]);
    const lt = day + " " + String(v.t || "").slice(0, 8), cur = x.last[k]; if (!cur || String(cur) < lt) x.last[k] = lt;
    at = Math.max(at, +v.at || 0);
  }
  for (const k of ["s", "d"]) if (Array.isArray(x[k])) x[k].sort((a, b) => String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0);
  x.at = at; x.pos = 1; return x;
}
/* owner 24 Nov: stocktake (الجرد) — worker scans + types the count; new items and name fixes are kept for the owner */
/* owner 24 Nov: stock/main is keyed like the ledger (slBc: digits only, no leading zeros) */
const jdKey = c => { const k = String(c || "").replace(/\D/g, "").replace(/^0+/, ""); return k || String(c || ""); };
async function jdCur(env) { const r = await env.DB.prepare("SELECT id,data FROM docs WHERE col='jard' AND json_extract(data,'$.st')='open' ORDER BY at DESC LIMIT 1").first(); return r ? Object.assign(JSON.parse(r.data), { id: r.id }) : null; }
async function jdRows(env, id) { return ((await env.DB.prepare("SELECT id,data FROM docs WHERE col=?").bind("jardc/" + id).all()).results || []).map(x => JSON.parse(x.data)); }
async function posJardApi(env, req, me, p, q) {
  if (!p.startsWith("/api/pos/jard")) return null;
  const c = await posCat(env), total = c.by.size;
  if (p === "/api/pos/jard") {
    const cur = await jdCur(env); if (!cur) return json({ ok: true, cur: null, total });
    const R = await jdRows(env, cur.id), us = {}; for (const x of R) for (const u in (x.by || {})) us[u] = (us[u] || 0) + 1;
    const mine = R.filter(x => x.u === (me.name || me.email)).sort((a, b) => b.at - a.at).slice(0, 12);
    return json({ ok: true, cur, total, n: R.filter(x => !x.nw).length, nw: R.filter(x => x.nw).length, us, mine });
  }
  if (p === "/api/pos/jard/count" && req.method === "POST") {
    const o = await req.json().catch(() => ({})), code = String(o.code || "").trim().slice(0, 40), qv = Math.round((+o.q || 0) * 1000) / 1000;
    if (!code || !isFinite(qv) || Math.abs(qv) >= 1e6 || (!o.set && qv === 0)) return json({ ok: false, err: "num" });
    let cur = await jdCur(env), now = Date.now(), un = me.name || me.email;
    if (!cur) { const id = "j" + now.toString(36); cur = { st: "open", at: now, by: un, day: posDay(now) }; await writeDoc(env, "jard", id, cur); cur.id = id; }
    const w = c.by.get(code), nm = String(o.name || "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (!w && !nm) return json({ ok: false, err: "name" });
    const ex = await env.DB.prepare("SELECT data FROM docs WHERE col=? AND id=?").bind("jardc/" + cur.id, code).first();
    const row = ex ? JSON.parse(ex.data) : { code, name: w ? String(w[1] || "") : nm, q: 0, by: {} };
    const cid = String(o.cid || "").slice(0, 40); if (cid && Array.isArray(row.cids) && row.cids.includes(cid)) return json({ ok: true, row, jid: cur.id, dup: true });
    if (ex && !o.set && now - (+row.at || 0) > 8 * 3600e3) { row.q = 0; row.by = {}; row.prev = row.prev || []; }
    if (!w) { row.nw = 1; if (nm) row.name = nm; }
    else if (nm && nm !== String(w[1] || "")) { row.rn = nm; row.old = String(w[1] || ""); }
    const before = +row.q || 0; row.q = o.set ? Math.max(0, qv) : Math.round((before + qv) * 1000) / 1000; if (row.q < 0) row.q = 0;
    row.by = row.by || {}; row.by[un] = Math.round(((+row.by[un] || 0) + (row.q - before)) * 1000) / 1000; row.u = un; row.at = now; if (cid) row.cids = (row.cids || []).concat(cid).slice(-20);
    await writeDoc(env, "jardc/" + cur.id, code, row);
    /* owner 24 Nov: no approval step — every count is the shelf stock at once, a corrected name applies everywhere */
    if (w) {
      const sr = await env.DB.prepare("SELECT data FROM docs WHERE col='stock' AND id='main'").first(), st = sr ? JSON.parse(sr.data) : { items: {} };
      st.items = st.items || {}; const sk = jdKey(code); st.items[sk] = Object.assign({}, st.items[sk] || {}, { qty: row.q, at: now, by: "الجرد (" + un + ")", name: row.rn || row.name, src: "jard", jd: 1, pend: false }); st.at = now; await writeDoc(env, "stock", "main", st);
      if (row.rn) { const nr = await env.DB.prepare("SELECT data FROM docs WHERE col='posnm' AND id='main'").first(); let no = { m: {} }; try { if (nr) no = JSON.parse(nr.data); } catch (e) { } no.m = no.m || {}; no.m[code] = row.rn; no.at = now; await writeDoc(env, "posnm", "main", no); }
    }
    return json({ ok: true, row, jid: cur.id });
  }
  if (!me.owner) return json({ ok: false }, 403);
  if (p === "/api/pos/jard/rep") {
    const all = ((await env.DB.prepare("SELECT id,data FROM docs WHERE col='jard' ORDER BY at DESC LIMIT 20").all()).results || []).map(x => Object.assign(JSON.parse(x.data), { id: x.id }));
    const id = q.get("id") || (all[0] && all[0].id); const cur = all.find(x => x.id === id) || null;
    if (!cur) return json({ ok: true, cur: null, all, total });
    const R = await jdRows(env, cur.id), have = new Set(R.map(x => x.code)), miss = [];
    for (const w of c.by.values()) if (!have.has(String(w[0]))) miss.push([String(w[0]), String(w[1] || "")]);
    R.sort((a, b) => b.at - a.at);
    return json({ ok: true, cur, all, total, rows: R, miss: miss.slice(0, 4000), missN: miss.length });
  }
  if (p === "/api/pos/jard/close" && req.method === "POST") {
    const cur = await jdCur(env); if (!cur) return json({ ok: false, err: "none" });
    const id = cur.id; delete cur.id; const R = await jdRows(env, id), now = Date.now();
    /* the approved counts become the shelf stock (stock/main): expected = this count − what is sold after it (Smart Life + POS) */
    const sr = await env.DB.prepare("SELECT data FROM docs WHERE col='stock' AND id='main'").first(), st = sr ? JSON.parse(sr.data) : { items: {} };
    st.items = st.items || {}; let n = 0;
    for (const x of R) { if (x.nw) continue; const sk = jdKey(x.code); st.items[sk] = Object.assign({}, st.items[sk] || {}, { qty: x.q, at: x.at, by: "الجرد (" + (x.u || "") + ")", name: x.rn || x.name, src: "jard", jd: 1, pend: false }); n++; }
    st.at = now; await writeDoc(env, "stock", "main", st);
    { const nr = await env.DB.prepare("SELECT data FROM docs WHERE col='posnm' AND id='main'").first(); let no = { m: {} }; try { if (nr) no = JSON.parse(nr.data); } catch (e) { } no.m = no.m || {}; let rc = 0;
      for (const x of R) { if (x.nw || !x.rn) continue; no.m[String(x.code)] = x.rn; rc++; }
      if (rc) { no.at = now; await writeDoc(env, "posnm", "main", no); } cur.renamed = rc; }
    cur.st = "done"; cur.doneAt = now; cur.doneBy = me.name || me.email; cur.applied = n;
    await writeDoc(env, "jard", id, cur); return json({ ok: true, applied: n });
  }
  return null;
}
/* owner 24 Nov: the stocktake is done from the ledger (cashier tab), the owner follows it on his home screen */
async function jardLedger(env, req, me, p, q) {
  const who = String(q.get("who") || "").replace(/\s+/g, " ").trim().slice(0, 40);
  const m2 = Object.assign({}, me, { name: who || me.name || me.email });
  if (p === "/api/jard/read" && req.method === "POST") {
    /* owner 24 Nov: the phone camera could not read barcodes — read the digits printed under the barcode from a photo */
    const o = await req.json().catch(() => ({})), b64 = String(o.b64 || ""); if (b64.length < 200 || b64.length > 6e6) return json({ ok: false, err: "img" });
    try {
      const g = await gemRead(env, "This photo shows a product barcode. Read the digits printed under the barcode (EAN-13/EAN-8/UPC). Reply JSON only: {\"code\":\"digits only\"} or {\"code\":\"\"} if not readable.", [{ b64, mime: "image/jpeg" }], true);
      const d = String((g && (g.data || g.json || g.obj || g)).code || "").replace(/\D/g, "");
      await gemStat(env, true);
      return json({ ok: true, code: d });
    } catch (e) { await gemStat(env, false, e && e.message); return json({ ok: false, err: "ai" }); }
  }
  if (p === "/api/jard/find") {
    const c = await posCat(env), code = String(q.get("code") || "").trim();
    if (code) { let w = c.by.get(code); if (!w) { const z = code.replace(/^0+/, ""); for (const x of c.by.values()) if (String(x[0]).replace(/^0+/, "") === z) { w = x; break; } } return json({ ok: true, hit: w ? [String(w[0]), String(w[1] || "")] : null }); }
    const t = posNormName(q.get("q") || ""), L = []; if (t.length < 2) return json({ ok: true, list: [] });
    const dg = /^\d+$/.test(String(q.get("q") || "").trim()) ? String(q.get("q")).trim() : "";
    for (const x of c.by.values()) { if ((dg && String(x[0]).includes(dg)) || (!dg && posNormName(x[1]).includes(t))) { L.push([String(x[0]), String(x[1] || "")]); if (L.length >= 12) break; } }
    return json({ ok: true, list: L });
  }
  return (await posJardApi(env, req, m2, p.replace("/api/jard", "/api/pos/jard"), q)) || json({ ok: false }, 404);
}
async function posShiftApi(env, req, me, p, q, br, B) {
  if (p === "/api/pos/shift") return json({ ok: true, shift: await posShiftCur(env, me.email) });
  if (p === "/api/pos/shift/open" && req.method === "POST") {
    const cur = await posShiftCur(env, me.email); if (cur) return json({ ok: true, shift: cur });
    const o = await req.json().catch(() => ({})), fl = posR2(+o.float); if (!(fl >= 0 && fl < 1e6)) return json({ ok: false, err: "float" });
    const now = Date.now(), id = "sh" + now.toString(36) + rnd().slice(0, 6);
    const d = { by: me.email, u: me.name || me.email, br, st: "open", openAt: now, day: posDay(now), float: fl, dev: String(o.dev || "").slice(0, 24) || null };
    await writeDoc(env, "posshift", id, d); d.id = id; return json({ ok: true, shift: d });
  }
  if (p === "/api/pos/shift/close" && req.method === "POST") {
    const cur = await posShiftCur(env, me.email); if (!cur) return json({ ok: false, err: "noshift" });
    /* owner 26 Nov: the next cashier cannot close his shift until the one before him has balanced it on his phone and sent it to the group (owner is exempt) */
    if (!me.owner) {
      const pw = await shPred(env, cur);
      if (pw && (+pw.closeAt || 0) > Date.now() - 14 * 864e5) {
        let okp = !!(pw.rec && pw.rec.at);
        if (okp && pw.rec.closingId) { const cr = await env.DB.prepare("SELECT json_extract(data,'$.sent') s FROM docs WHERE id=? AND col LIKE 'months/%/closings'").bind(String(pw.rec.closingId)).first(); if (cr && !cr.s) okp = false; }
        if (!okp) return json({ ok: false, err: "predwait", who: String(pw.u || "").replace(/\s+(مبيعات|توصيل)$/, "") });
      }
    }
    const o = await req.json().catch(() => ({})), noCnt = o.cash == null && o.card == null, cash = posR2(+o.cash), card = posR2(+o.card);
    if (!noCnt && (!(cash >= 0) || !(card >= 0))) return json({ ok: false, err: "num" });
    const now = Date.now();
    const r = (await env.DB.prepare("SELECT data FROM docs WHERE col>=? AND col<=? AND json_extract(data,'$.sh')=?").bind("posinv/" + posDay(cur.openAt), "posinv/" + posDay(now), cur.id).all()).results || [];
    let sa = 0, sc = 0, sd = 0, st = 0, trx = 0, trn = 0, trb = 0, trm = 0, esc = 0, n = 0, rn = 0, sales = 0, ret = 0;
    for (const x of r) { const d = JSON.parse(x.data); sc = posR2(sc + d.cash); sd = posR2(sd + d.card); st = posR2(st + (d.tr || 0)); if (d.tr) { trn++; if (d.xf) { trx = posR2(trx + (d.xfAmt || 0)); if (d.xfMis) trm++; } else trb++; } if (d.esc || d.xesc) esc++; sa = posR2(sa + (d.aj || 0)); if (d.kind === "ret") { rn++; ret = posR2(ret + d.total); } else { n++; sales = posR2(sales + d.total); } }
    const exp = { cash: posR2(cur.float + sc), card: sd, tr: st, trx, trn, trb, trm, esc, aj: sa, sales, ret, n, rn };
    const lv = o.left != null && posR2(+o.left) >= 0 && posR2(+o.left) < 1e7 ? posR2(+o.left) : null;
    const d = Object.assign({}, cur, o.drawer ? { dev: String(o.drawer).slice(0, 24) } : {}, lv != null ? { left: lv, leftAt: now, leftAll: !!o.all } : {}, { st: "closed", closeAt: now, counted: noCnt ? null : { cash, card }, exp, diff: noCnt ? null : { cash: posR2(cash - exp.cash), card: posR2(card - exp.card) } }); delete d.id;
    await writeDoc(env, "posshift", cur.id, d);
    return json({ ok: true, shift: { id: cur.id, u: d.u, br: d.br, openAt: d.openAt, closeAt: now, float: d.float, counted: d.counted, n, rn } });
  }
  /* owner 26 Nov: handover — the next cashier sees the float he received (the drawer's count by the one before him) */
  /* owner 26 Nov: handover — the count of the cashier before shows on the next one's POS for 5 minutes with «استلام / رفض»; no answer = received */
  if (p === "/api/pos/float") {
    const cur = await posShiftCur(env, me.email); if (!cur) return json({ ok: true, st: "none" });
    const pr = await shPred(env, cur); if (!pr) return json({ ok: true, st: "none" });
    const amt = await shRecOf(env, pr), from = String(pr.u || "").replace(/\s+(مبيعات|توصيل)$/, "");
    if (amt == null) return json({ ok: true, st: "wait", from });
    const recAt = shKey(pr), now = Date.now(), base = Math.max(recAt, +cur.openAt || 0);
    let acc = !recAt || !!(cur.fAck && cur.fAck.recAt === recAt), rej = cur.fRej && cur.fRej.recAt === recAt ? cur.fRej : null;
    if (!acc && !rej && now - base > 300000) { const id = cur.id; delete cur.id; cur.fAck = { at: now, recAt, auto: true }; await writeDoc(env, "posshift", id, cur); acc = true; }
    return json({ ok: true, st: "ok", from, amt, acc, rej, left: acc || rej ? 0 : Math.max(0, 300000 - (now - base)) });
  }
  if (p === "/api/pos/float/ack" && req.method === "POST") {
    const cur = await posShiftCur(env, me.email); if (!cur) return json({ ok: false, err: "noshift" });
    const pr = await shPred(env, cur); if (!pr || !shKey(pr)) return json({ ok: false, err: "none" });
    const o = await req.json().catch(() => ({})), recAt = shKey(pr), id = cur.id; delete cur.id;
    if (o.ok) cur.fAck = { at: Date.now(), recAt }; else cur.fRej = { at: Date.now(), recAt, why: String(o.why || "").slice(0, 40), n: ((cur.fRej && cur.fRej.n) || 0) + 1, amt: await shRecOf(env, pr) };
    await writeDoc(env, "posshift", id, cur); return json({ ok: true });
  }
  if (p === "/api/pos/shifts") {
    if (!me.owner) return json({ ok: false }, 403);
    const re = /^\d{4}-\d{2}-\d{2}$/, f = re.test(q.get("f") || "") ? q.get("f") : posDay(), t = re.test(q.get("t") || "") ? q.get("t") : f;
    const r = (await env.DB.prepare("SELECT id,data FROM docs WHERE col='posshift' AND json_extract(data,'$.day')>=? AND json_extract(data,'$.day')<=? ORDER BY at DESC LIMIT 200").bind(f, t).all()).results || [];
    return json({ ok: true, shifts: r.map(x => Object.assign(JSON.parse(x.data), { id: x.id })) });
  }
  return null;
}

/* POS delivery orders count in the rewards like the Smart Life notes: slday/lvx-<ym> → days[d]["p"+driver] = [near, mid, far] */
async function posLvAdd(env, day, n, lv) {
  const id = "lvx-" + day.slice(0, 7), r = await env.DB.prepare("SELECT data FROM docs WHERE col='slday' AND id=?").bind(id).first();
  const d = r ? JSON.parse(r.data) : {}; d.days = d.days || {}; const D = d.days[day] = d.days[day] || {}; const k = "p" + n;
  const a = Array.isArray(D[k]) ? D[k].slice(0, 3) : [0, 0, 0]; while (a.length < 3) a.push(0); a[lv - 1] = (+a[lv - 1] || 0) + 1; D[k] = a;
  await writeDoc(env, "slday", id, d);
}

/* owner 24 Nov: orders sent from the price page are kept here and appear in the POS (delivery branch) */
const posNormName = s => String(s || "").toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ").trim();
async function posByName(env) {
  const c = await posCat(env);
  if (!c.byName) { c.byName = new Map(); for (const w of c.by.values()) { const k = posNormName(w[1]); if (k && !c.byName.has(k)) c.byName.set(k, String(w[0])); } }
  return c.byName;
}
async function posOrderIn(env, req) {
  const txt = (await req.text().catch(() => "")).slice(0, 60000); let o; try { o = JSON.parse(txt); } catch (e) { return json({ ok: false }, 400); }
  const ono = String(o.ono || "").replace(/\D/g, "").slice(0, 8); if (!ono) return json({ ok: false }, 400);
  if (o.upd) {
    const r0 = await env.DB.prepare("SELECT id,data FROM docs WHERE col='posord' AND json_extract(data,'$.ono')=? AND json_extract(data,'$.st') IN ('new','taken') ORDER BY at DESC LIMIT 1").bind(ono).first();
    if (!r0) return json({ ok: false });
    const d0 = JSON.parse(r0.data); if (Date.now() - (+d0.at || 0) > 3 * 3600e3) return json({ ok: false });
    d0.fee = posR2(Math.max(0, Math.min(50, +o.fee || 0))); d0.dist = String(o.dist || "").slice(0, 10);
    if (o.loc && isFinite(+o.loc.lat) && isFinite(+o.loc.lng)) d0.loc = { lat: +o.loc.lat, lng: +o.loc.lng };
    d0.updAt = Date.now(); await writeDoc(env, "posord", r0.id, d0); return json({ ok: true, upd: 1 });
  }
  const day = posDay(), cnt = await env.DB.prepare("SELECT COUNT(*) c FROM docs WHERE col='posord' AND json_extract(data,'$.day')=?").bind(day).first();
  if (cnt && cnt.c > 600) return json({ ok: false, err: "limit" }, 429);
  const bn = await posByName(env), items = [];
  for (const it of (Array.isArray(o.items) ? o.items.slice(0, 200) : [])) {
    const name = String(it[0] || "").slice(0, 120), q = Math.round((+it[1] || 0) * 1000) / 1000, p = posR2(+it[2] || 0); if (!name || !(q > 0 && q < 1000)) continue;
    items.push([name, q, p, bn.get(posNormName(name)) || ""]);
  }
  if (!items.length) return json({ ok: false }, 400);
  const pay = ["cash", "card", "both"].includes(o.pay) ? o.pay : "", now = Date.now();
  const d = { ono, edit: !!o.edit, day, at: now, t: posTime(now), items, sub: posR2(+o.sub || 0), fee: posR2(Math.max(0, Math.min(50, +o.fee || 0))), dist: String(o.dist || "").slice(0, 10), pay, cash: posR2(+o.cash || 0), cg: String(o.cg || "").slice(0, 10), loc: o.loc && isFinite(+o.loc.lat) && isFinite(+o.loc.lng) ? { lat: +o.loc.lat, lng: +o.loc.lng } : null, st: "new" };
  { const m = /(?:^|;\s*)ppv=([a-z0-9]{8,40})/.exec(req.headers.get("Cookie") || ""); if (m) d.vid = m[1]; }
  if (d.edit) {
    const prev = (await env.DB.prepare("SELECT id,data FROM docs WHERE col='posord' AND json_extract(data,'$.ono')=? AND json_extract(data,'$.st')='new'").bind(ono).all()).results || [];
    for (const x of prev) { const pd = JSON.parse(x.data); pd.st = "replaced"; await writeDoc(env, "posord", x.id, pd); }
  }
  await writeDoc(env, "posord", "o" + ono + "_" + now.toString(36), d);
  return json({ ok: true });
}
async function posOrdersApi(env, req, me, p, br) {
  if (p === "/api/pos/orders") {
    const since = posDay(Date.now() - 2 * 864e5);
    const r = (await env.DB.prepare("SELECT id,data FROM docs WHERE col='posord' AND json_extract(data,'$.day')>=? AND json_extract(data,'$.st') IN ('new','taken') ORDER BY at DESC LIMIT 60").bind(since).all()).results || [];
    const lim = Date.now() - POS_ORD_LIVE;
    const L = r.map(x => Object.assign(JSON.parse(x.data), { id: x.id })).filter(d => (+d.at || 0) >= lim && (d.st === "new" || d.by === me.email));
    return json({ ok: true, orders: L });
  }
  if (p === "/api/pos/orders/stale") {
    if (!me.owner) return json({ ok: false }, 403);
    const r = (await env.DB.prepare("SELECT id,data FROM docs WHERE col='posord' AND json_extract(data,'$.day')>=? AND json_extract(data,'$.st') IN ('new','taken') ORDER BY at DESC LIMIT 200").bind(posDay(Date.now() - 7 * 864e5)).all()).results || [];
    const L = [];
    for (const x of r) { const d = JSON.parse(x.data); if ((+d.at || 0) >= Date.now() - POS_ORD_LIVE) continue; let cand = null; try { cand = await posOrdCand(env, d); } catch (e) { } L.push({ id: x.id, ono: d.ono, day: d.day, t: d.t, at: d.at, st: d.st, u: d.u || "", sub: d.sub, fee: d.fee, dist: d.dist, items: d.items, misInv: d.misInv || 0, cand }); }
    return json({ ok: true, orders: L });
  }
  if (p === "/api/pos/orders/fix" && req.method === "POST") {
    if (!me.owner) return json({ ok: false }, 403);
    const o = await req.json().catch(() => ({})), id = String(o.id || "");
    const x = await env.DB.prepare("SELECT data FROM docs WHERE col='posord' AND id=?").bind(id).first(); if (!x) return json({ ok: false, err: "nf" });
    const d = JSON.parse(x.data); if (d.st !== "new" && d.st !== "taken") return json({ ok: false, err: d.st });
    if (o.act === "link") {
      const day = String(o.day || ""), cid = String(o.cid || ""); if (!/^\d{4}-\d\d-\d\d$/.test(day)) return json({ ok: false }, 400);
      const iw = await env.DB.prepare("SELECT data FROM docs WHERE col=? AND id=?").bind("posinv/" + day, cid).first(); if (!iw) return json({ ok: false, err: "inv" });
      const iv = JSON.parse(iw.data); if (iv.ord && iv.ord !== id) return json({ ok: false, err: "used" });
      iv.ord = id; await writeDoc(env, "posinv/" + day, cid, iv);
      await posOrderDone(env, id, iv.no, me.email, { br: iv.br, day, cid, owner: 1 });
      return json({ ok: true });
    }
    if (o.act === "close") { d.st = "closed"; d.closedBy = me.email; d.closedAt = Date.now(); await writeDoc(env, "posord", id, d); return json({ ok: true }); }
    return json({ ok: false }, 400);
  }
  if (p === "/api/pos/orders/take" && req.method === "POST") {
    const o = await req.json().catch(() => ({})), id = String(o.id || "");
    const x = await env.DB.prepare("SELECT data FROM docs WHERE col='posord' AND id=?").bind(id).first(); if (!x) return json({ ok: false, err: "nf" });
    const d = JSON.parse(x.data); if (d.st === "taken" && d.by !== me.email) return json({ ok: false, err: "taken", u: d.u }); if (d.st === "done" || d.st === "replaced") return json({ ok: false, err: d.st });
    d.st = "taken"; d.by = me.email; d.u = me.name || me.email; d.takenAt = Date.now(); await writeDoc(env, "posord", id, d);
    d.id = id; return json({ ok: true, order: d });
  }
  if (p === "/api/pos/orders/back" && req.method === "POST") {
    const o = await req.json().catch(() => ({})), id = String(o.id || "");
    const x = await env.DB.prepare("SELECT data FROM docs WHERE col='posord' AND id=?").bind(id).first(); if (!x) return json({ ok: false });
    const d = JSON.parse(x.data); if (d.st === "taken" && (d.by === me.email || me.owner)) { d.st = "new"; delete d.by; delete d.u; await writeDoc(env, "posord", id, d); }
    return json({ ok: true });
  }
  return null;
}
async function posOrderDone(env, id, no, email, ex) {
  const x = await env.DB.prepare("SELECT data FROM docs WHERE col='posord' AND id=?").bind(String(id || "")).first(); if (!x) return;
  const d = JSON.parse(x.data); d.st = "done"; d.invNo = no; d.doneBy = email; d.doneAt = Date.now();
  if (ex) { if (ex.br) d.invBr = ex.br; if (ex.day) d.invDay = ex.day; if (ex.cid) d.invCid = ex.cid; if (ex.auto) d.auto = 1; if (ex.owner) d.byOwner = 1; }
  await writeDoc(env, "posord", String(id), d);
}
/* owner 27 Nov: orders older than this leave the cashier's list and go to the owner («طلبات لم تُفوتر») */
const POS_ORD_LIVE = 12 * 3600e3;
/* how much an invoice resembles an order: r = share of the order's items found in it, rq = found with the same quantity, dsum = items-total difference */
function posOrdSim(od, lines) {
  const it = Array.isArray(od.items) ? od.items : [], n = it.length; if (!n) return { r: 0, rq: 0, dsum: 1e9 };
  const byC = new Map(), byN = new Map(); let sum = 0;
  for (const l of lines) { const q = +l[3] || 0; if (!(q > 0)) continue; const c = String(l[0]), k = posNormName(l[1]); byC.set(c, (byC.get(c) || 0) + q); if (k) byN.set(k, (byN.get(k) || 0) + q); sum += +l[4] || 0; }
  let m = 0, mq = 0;
  for (const x of it) { let q = x[3] ? byC.get(String(x[3])) : undefined; if (q == null) q = byN.get(posNormName(x[0])); if (q != null) { m++; if (Math.abs(q - (+x[1] || 0)) < 0.01) mq++; } }
  return { r: m / n, rq: mq / n, dsum: Math.abs(posR2(sum) - (+od.sub || 0)) };
}
const posOrdFits = (s, od) => s.r >= 0.5 && (s.rq >= 0.8 || s.dsum <= Math.max(1, 0.15 * (+od.sub || 0)));
const posOrdScore = s => s.rq * 2 + s.r - Math.min(1, s.dsum / 20);
/* a hand-typed delivery invoice: the open order of the last 6 hours it fits best */
async function posOrdFind(env, lines, at) {
  const r = (await env.DB.prepare("SELECT id,data FROM docs WHERE col='posord' AND json_extract(data,'$.day')>=? AND json_extract(data,'$.st') IN ('new','taken') ORDER BY at DESC LIMIT 60").bind(posDay(at - 864e5)).all()).results || [];
  let best = null, bs = -1;
  for (const x of r) { const d = JSON.parse(x.data), a = +d.at || 0; if (a < at - 6 * 3600e3 || a > at + 300e3) continue; const s = posOrdSim(d, lines); if (!posOrdFits(s, d)) continue; const sc = posOrdScore(s); if (sc > bs) { bs = sc; best = x.id; } }
  return best;
}
/* for the owner: a delivery invoice (not yet tied to an order) that fits an old open order, from its own day and the next */
async function posOrdCand(env, od) {
  const d0 = od.day, d1 = posDay((+od.at || 0) + 864e5), at = +od.at || 0, used = new Set();
  const dn = (await env.DB.prepare("SELECT data FROM docs WHERE col='posord' AND json_extract(data,'$.st')='done' AND json_extract(data,'$.day')>=?").bind(posDay(at - 864e5)).all()).results || [];
  for (const x of dn) { const d = JSON.parse(x.data); if (d.invNo) used.add((d.invBr || "del") + ":" + d.invNo); }
  const iv = (await env.DB.prepare("SELECT col,id,data FROM docs WHERE col IN (?,?) AND json_extract(data,'$.br')='del'").bind("posinv/" + d0, "posinv/" + d1).all()).results || [];
  let best = null, bs = -1;
  for (const x of iv) { const v = JSON.parse(x.data); if (v.ord || used.has("del:" + v.no) || !(v.total > 0)) continue; const a = +v.at || 0; if (a < at - 600e3 || a > at + 24 * 3600e3) continue; const s = posOrdSim(od, v.lines || []); if (!posOrdFits(s, od)) continue; const sc = posOrdScore(s) - (a - at) / 864e5; if (sc > bs) { bs = sc; best = { no: v.no, day: v.day, cid: x.id, t: v.t, u: v.u || "", total: v.total, r: Math.round(s.r * 100) }; } }
  return best;
}
const PP_PV_HOOK = "<script>(function(){try{var v=localStorage.getItem('ppv');if(!/^[a-z0-9]{8,40}$/.test(v||'')){v=Math.random().toString(36).slice(2,12)+Date.now().toString(36);localStorage.setItem('ppv',v)}document.cookie='ppv='+v+';path=/;max-age=31536000;samesite=lax;secure';if(navigator.sendBeacon)navigator.sendBeacon('/api/pv',v)}catch(e){}})();</script>";
async function ppVisit(env, req, me) {
  const ck = req.headers.get("Cookie") || "";
  if (me || /(^|;\s*)psid=/.test(ck)) return new Response(null, { status: 204 });
  const v = String(await req.text().catch(() => "")).trim().slice(0, 40);
  if (!/^[a-z0-9]{8,40}$/.test(v)) return new Response(null, { status: 204 });
  try { await env.DB.prepare("INSERT OR IGNORE INTO ppvis (d, vid, at) VALUES (?, ?, ?)").bind(posDay(), v, Date.now()).run(); } catch (e) { }
  return new Response(null, { status: 204 });
}
async function ppStats(env, q) {
  const re = /^\d{4}-\d{2}-\d{2}$/, today = posDay();
  let f = String(q.get("f") || today), t = String(q.get("t") || today); if (!re.test(f)) f = today; if (!re.test(t)) t = today; if (f > t) { const z = f; f = t; t = z; }
  const days = {}, D = k => days[k] || (days[k] = { v: 0, vo: 0, o: 0, dl: 0, pk: 0, s: 0 });
  const vr = (await env.DB.prepare("SELECT d, COUNT(*) c FROM ppvis WHERE d>=? AND d<=? GROUP BY d").bind(f, t).all()).results || [];
  for (const x of vr) D(x.d).v = x.c;
  const orr = (await env.DB.prepare("SELECT data FROM docs WHERE col='posord' AND json_extract(data,'$.day')>=? AND json_extract(data,'$.day')<=? AND json_extract(data,'$.st')<>'replaced'").bind(f, t).all()).results || [];
  const vs = {}, list = [];
  for (const x of orr) {
    const o = JSON.parse(x.data), k = D(o.day); k.o++; if (o.dist === "pickup") k.pk++; else k.dl++; k.s += (+o.sub || 0);
    if (o.vid) (vs[o.day] = vs[o.day] || new Set()).add(o.vid);
    if (o.day === today) list.push({ t: o.t, ono: o.ono, sub: o.sub, fee: o.fee, dist: o.dist, st: o.st, u: o.u || "", n: (o.items || []).length, at: o.at });
  }
  for (const k in vs) D(k).vo = vs[k].size;
  for (const k in days) days[k].s = Math.round(days[k].s * 100) / 100;
  let old = {}; try { const r = await env.DB.prepare("SELECT data FROM docs WHERE col='settings' AND id='plink_auto'").first(); if (r) old = JSON.parse(r.data).days || {}; } catch (e) { }
  for (const k in old) if (k >= f && k <= t && k < "2026-11-24" && !days[k]) { const x = old[k]; days[k] = { v: 0, vo: 0, o: (+x.n || 0) + (+x.p || 0), dl: +x.n || 0, pk: +x.p || 0, s: 0, old: 1 }; }
  list.sort((a, b) => b.at - a.at);
  return json({ ok: true, f, t, today, days, list: list.slice(0, 80) });
}
/* owner 24 Nov: the customer's location (and so the fee) is set after «أرسل الطلب» — it follows the order to the POS */
const PP_LOC_HOOK = "<script>(function(){var last=null;document.addEventListener(\"click\",function(e){var a=e.target&&e.target.closest&&e.target.closest(\"#wa\");if(!a||a.getAttribute(\"aria-disabled\")===\"true\")return;try{last={ono:curOno,at:Date.now()}}catch(x){}},true);window.addEventListener(\"message\",function(e){var d=e.data;if(!d||d.taibaLoc!==1||!last||Date.now()-last.at>3600e3)return;setTimeout(function(){try{if(typeof myLoc===\"undefined\"||!myLoc||!myLoc.lat)return;var fee=deliveryFee(subtotal(),myLoc.tier)||0;var body=JSON.stringify({ono:last.ono,upd:1,fee:fee,dist:myLoc.tier||\"\",loc:{lat:myLoc.lat,lng:myLoc.lng}});if(navigator.sendBeacon)navigator.sendBeacon(\"/api/order\",new Blob([body],{type:\"text/plain\"}));else fetch(\"/api/order\",{method:\"POST\",body:body,keepalive:true})}catch(x){}},150)})})();</script>";
const PP_ORDER_HOOK = "<script>document.addEventListener(\"click\",function(e){var a=e.target&&e.target.closest&&e.target.closest(\"#wa\");if(!a||a.getAttribute(\"aria-disabled\")===\"true\")return;try{var its=[];cart.forEach(function(q,k){var d=BYKEY.get(k);if(d)its.push([d.orig,q,d.p])});if(!its.length)return;var sub=0;its.forEach(function(x){sub+=x[1]*x[2]});sub=Math.round(sub*100)/100;var dist=document.getElementById(\"dist\").value;var fee=0;try{fee=deliveryFee(sub,(dist===\"del\"&&myLoc&&myLoc.tier)?myLoc.tier:dist)||0}catch(x){}var pe=document.querySelector(\"input[name=pay]:checked\"),cash=0;if(pe&&pe.value===\"both\"){cash=parseFloat(String(document.getElementById(\"cashAmt\").value||\"\").replace(/[٠-٩]/g,function(d){return d.charCodeAt(0)-1632}).replace(/[٫,]/g,\".\"))||0}var eb=document.getElementById(\"editBox\"),ie=document.getElementById(\"isEdit\");var body=JSON.stringify({ono:curOno,edit:!!(eb&&!eb.hidden&&ie&&ie.checked),items:its,sub:sub,fee:fee,dist:dist,pay:pe?pe.value:\"\",cash:cash,cg:(typeof cashGiven!==\"undefined\"&&cashGiven)?String(cashGiven):\"\",loc:(typeof myLoc!==\"undefined\"&&myLoc&&myLoc.lat)?{lat:myLoc.lat,lng:myLoc.lng}:null});if(navigator.sendBeacon)navigator.sendBeacon(\"/api/order\",new Blob([body],{type:\"text/plain\"}));else fetch(\"/api/order\",{method:\"POST\",body:body,keepalive:true})}catch(err){}},true);</script>";

/* owner 24 Nov: ZATCA (Fatoora phase 2) link for the shop branch — keys, CSR, signed UBL invoices; calls to ZATCA go through the relay extension on the shop laptop */
var ZATCA=(()=>{var Tt=Object.defineProperty;var Te=Object.getOwnPropertyDescriptor;var Ce=Object.getOwnPropertyNames;var Be=Object.prototype.hasOwnProperty;var He=(t,e)=>{for(var n in e)Tt(t,n,{get:e[n],enumerable:!0})},Re=(t,e,n,s)=>{if(e&&typeof e=="object"||typeof e=="function")for(let c of Ce(e))!Be.call(t,c)&&c!==n&&Tt(t,c,{get:()=>e[c],enumerable:!(s=Te(e,c))||s.enumerable});return t};var ke=t=>Re(Tt({},"__esModule",{value:!0}),t);var Cn={};He(Cn,{SELLER:()=>lt,relayApi:()=>Tn,relayAuth:()=>En,signDoc:()=>De,zSign:()=>An,zatcaApi:()=>wn});var Pe={p:0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn,n:0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n,h:1n,a:0n,b:7n,Gx:0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,Gy:0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n},{p:Z,n:L,Gx:ze,Gy:Ue,b:Gt}=Pe,C=32,tt=64,S=(t="")=>{throw new Error(t)},Xt=t=>typeof t=="bigint",Wt=t=>typeof t=="string",Le=t=>t instanceof Uint8Array||ArrayBuffer.isView(t)&&t.constructor.name==="Uint8Array",X=(t,e)=>!Le(t)||typeof e=="number"&&e>0&&t.length!==e?S("Uint8Array expected"):t,G=t=>new Uint8Array(t),Ne=t=>Uint8Array.from(t),Jt=(t,e)=>t.toString(16).padStart(e,"0"),pt=t=>Array.from(X(t)).map(e=>Jt(e,2)).join(""),z={_0:48,_9:57,A:65,F:70,a:97,f:102},Mt=t=>{if(t>=z._0&&t<=z._9)return t-z._0;if(t>=z.A&&t<=z.F)return t-(z.A-10);if(t>=z.a&&t<=z.f)return t-(z.a-10)},Pt=t=>{let e="hex invalid";if(!Wt(t))return S(e);let n=t.length,s=n/2;if(n%2)return S(e);let c=G(s);for(let r=0,i=0;r<s;r++,i+=2){let a=Mt(t.charCodeAt(i)),o=Mt(t.charCodeAt(i+1));if(a===void 0||o===void 0)return S(e);c[r]=a*16+o}return c},W=(t,e)=>X(Wt(t)?Pt(t):Ne(X(t)),e),Kt=()=>globalThis?.crypto,_e=()=>Kt()?.subtle??S("crypto.subtle must be defined"),J=(...t)=>{let e=G(t.reduce((s,c)=>s+X(c).length,0)),n=0;return t.forEach(s=>{e.set(s,n),n+=s.length}),e},zt=(t=C)=>Kt().getRandomValues(G(t)),et=BigInt,at=(t,e,n,s="bad number: out of range")=>Xt(t)&&e<=t&&t<n?t:S(s),h=(t,e=Z)=>{let n=t%e;return n>=0n?n:e+n},U=t=>h(t,L),bt=(t,e)=>{(t===0n||e<=0n)&&S("no inverse n="+t+" mod="+e);let n=h(t,e),s=e,c=0n,r=1n,i=1n,a=0n;for(;n!==0n;){let o=s/n,d=s%n,f=c-i*o,u=r-a*o;s=n,n=d,c=i,r=a,i=f,a=u}return s===1n?h(c,e):S("no inverse")},ve=t=>{let e=ft[t];return typeof e!="function"&&S("hashes."+t+" not set"),e},Vt=t=>t instanceof O?t:S("Point expected"),Qt=t=>h(h(t*t)*t+Gt),jt=t=>at(t,0n,Z),it=t=>at(t,1n,Z),Ct=t=>at(t,1n,L),Bt=t=>(t&1n)===0n,$=t=>Uint8Array.of(t),Yt=t=>$(Bt(t)?2:3),Oe=t=>{let e=Qt(it(t)),n=1n;for(let s=e,c=(Z+1n)/4n;c>0n;c>>=1n)c&1n&&(n=n*s%Z),s=s*s%Z;return h(n*n)===e?n:S("sqrt invalid")},O=class t{static BASE;static ZERO;px;py;pz;constructor(e,n,s){this.px=jt(e),this.py=it(n),this.pz=jt(s),Object.freeze(this)}static fromBytes(e){X(e);let n,s=e[0],c=e.subarray(1),r=ht(c,0,C),i=e.length;if(i===C+1&&[2,3].includes(s)){let a=Oe(r),o=Bt(a);Bt(et(s))!==o&&(a=h(-a)),n=new t(r,a,1n)}return i===tt+1&&s===4&&(n=new t(r,ht(c,C,tt),1n)),n?n.assertValidity():S("bad point: not on curve")}equals(e){let{px:n,py:s,pz:c}=this,{px:r,py:i,pz:a}=Vt(e),o=h(n*a),d=h(r*c),f=h(s*a),u=h(i*c);return o===d&&f===u}is0(){return this.equals(F)}negate(){return new t(this.px,h(-this.py),this.pz)}double(){return this.add(this)}add(e){let{px:n,py:s,pz:c}=this,{px:r,py:i,pz:a}=Vt(e),o=0n,d=Gt,f=0n,u=0n,l=0n,p=h(d*3n),x=h(n*r),b=h(s*i),w=h(c*a),E=h(n+s),m=h(r+i);E=h(E*m),m=h(x+b),E=h(E-m),m=h(n+c);let I=h(r+a);return m=h(m*I),I=h(x+w),m=h(m-I),I=h(s+c),f=h(i+a),I=h(I*f),f=h(b+w),I=h(I-f),l=h(o*m),f=h(p*w),l=h(f+l),f=h(b-l),l=h(b+l),u=h(f*l),b=h(x+x),b=h(b+x),w=h(o*w),m=h(p*m),b=h(b+w),w=h(x-w),w=h(o*w),m=h(m+w),x=h(b*m),u=h(u+x),x=h(I*m),f=h(E*f),f=h(f-x),x=h(E*b),l=h(I*l),l=h(l+x),new t(f,u,l)}multiply(e,n=!0){if(!n&&e===0n)return F;if(Ct(e),e===1n)return this;if(this.equals(k))return Je(e).p;let s=F,c=k;for(let r=this;e>0n;r=r.double(),e>>=1n)e&1n?s=s.add(r):n&&(c=c.add(r));return s}toAffine(){let{px:e,py:n,pz:s}=this;if(this.equals(F))return{x:0n,y:0n};if(s===1n)return{x:e,y:n};let c=bt(s,Z);return h(s*c)!==1n&&S("inverse invalid"),{x:h(e*c),y:h(n*c)}}assertValidity(){let{x:e,y:n}=this.toAffine();return it(e),it(n),h(n*n)===Qt(e)?this:S("bad point: not on curve")}toBytes(e=!0){let{x:n,y:s}=this.assertValidity().toAffine(),c=q(n);return e?J(Yt(s),c):J($(4),c,q(s))}static fromAffine(e){let{x:n,y:s}=e;return n===0n&&s===0n?F:new t(n,s,1n)}toHex(e){return pt(this.toBytes(e))}static fromPrivateKey(e){return k.multiply(ot(e))}static fromHex(e){return t.fromBytes(W(e))}get x(){return this.toAffine().x}get y(){return this.toAffine().y}toRawBytes(e){return this.toBytes(e)}},k=new O(ze,Ue,1n),F=new O(0n,1n,0n);O.BASE=k;O.ZERO=F;var qe=(t,e,n)=>k.multiply(e,!1).add(t.multiply(n,!1)).assertValidity(),ut=t=>et("0x"+(pt(t)||"0")),ht=(t,e,n)=>ut(t.subarray(e,n)),Me=2n**256n,q=t=>Pt(Jt(at(t,0n,Me),tt)),ot=t=>{let e=Xt(t)?t:ut(W(t,C));return at(e,1n,L,"private key invalid 3")},Ht=t=>t>L>>1n,$t=(t,e=!0)=>k.multiply(ot(t)).toBytes(e),Rt=class t{r;s;recovery;constructor(e,n,s){this.r=Ct(e),this.s=Ct(n),s!=null&&(this.recovery=s),Object.freeze(this)}static fromBytes(e){X(e,tt);let n=ht(e,0,C),s=ht(e,C,tt);return new t(n,s)}toBytes(){let{r:e,s:n}=this;return J(q(e),q(n))}addRecoveryBit(e){return new t(this.r,this.s,e)}hasHighS(){return Ht(this.s)}toCompactRawBytes(){return this.toBytes()}toCompactHex(){return pt(this.toBytes())}recoverPublicKey(e){return Fe(this,e)}static fromCompact(e){return t.fromBytes(W(e,tt))}assertValidity(){return this}normalizeS(){let{r:e,s:n,recovery:s}=this;return Ht(n)?new t(e,U(-n),s):this}},te=t=>{let e=t.length*8-256;e>1024&&S("msg invalid");let n=ut(t);return e>0?n>>et(e):n},ee=t=>U(te(X(t))),ne={lowS:!0};var Ve=(t,e,n=ne)=>{["der","recovered","canonical"].some(l=>l in n)&&S("option not supported");let{lowS:s,extraEntropy:c}=n;s==null&&(s=!0);let r=q,i=ee(W(t)),a=r(i),o=ot(e),d=[r(o),a];c&&d.push(c===!0?zt(C):W(c));let f=i,u=l=>{let p=te(l);if(!(1n<=p&&p<L))return;let x=k.multiply(p).toAffine(),b=U(x.x);if(b===0n)return;let w=bt(p,L),E=U(w*U(f+U(o*b)));if(E===0n)return;let m=E,I=(x.x===b?0:2)|Number(x.y&1n);return s&&Ht(E)&&(m=U(-E),I^=1),new Rt(b,m,I)};return{seed:J(...d),k2sig:u}},je=t=>{let e=G(C),n=G(C),s=0,c=G(0),r=()=>{e.fill(1),n.fill(0),s=0},i=1e3,a="drbg: tried 1000 values";if(t){let o=(...u)=>ft.hmacSha256Async(n,e,...u),d=async(u=c)=>{n=await o($(0),u),e=await o(),u.length!==0&&(n=await o($(1),u),e=await o())},f=async()=>(s++>=i&&S(a),e=await o(),e);return async(u,l)=>{r(),await d(u);let p;for(;!(p=l(await f()));)await d();return r(),p}}else{let o=(...u)=>ve("hmacSha256Sync")(n,e,...u),d=(u=c)=>{n=o($(0),u),e=o(),u.length!==0&&(n=o($(1),u),e=o())},f=()=>(s++>=i&&S(a),e=o(),e);return(u,l)=>{r(),d(u);let p;for(;!(p=l(f()));)d();return r(),p}}};var se=(t,e,n=ne)=>{let{seed:s,k2sig:c}=Ve(t,e,n);return je(!1)(s,c)};var Fe=(t,e)=>{let{r:n,s,recovery:c}=t;[0,1,2,3].includes(c)||S("recovery id invalid");let r=ee(W(e,C)),i=c===2||c===3?n+L:n;it(i);let a=Yt(et(c)),o=J(a,q(i)),d=O.fromBytes(o),f=bt(i,L),u=U(-r*f),l=U(s*f);return qe(d,u,l)};var re=t=>{t=W(t),(t.length<C+8||t.length>1024)&&S("expected 40-1024b");let e=h(ut(t),L-1n);return q(e+1n)},Ze=()=>re(zt(C+16)),Ge="SHA-256",ft={hexToBytes:Pt,bytesToHex:pt,concatBytes:J,bytesToNumberBE:ut,numberToBytesBE:q,mod:h,invert:bt,hmacSha256Async:async(t,...e)=>{let n=_e(),s="HMAC",c=await n.importKey("raw",t,{name:s,hash:{name:Ge}},!1,["sign"]);return G(await n.sign(s,c,J(...e)))},hmacSha256Sync:void 0,hashToPrivateKey:re,randomBytes:zt},ce={normPrivateKeyToScalar:ot,isValidPrivateKey:t=>{try{return!!ot(t)}catch{return!1}},randomPrivateKey:Ze,precompute:(t=8,e=k)=>(e.multiply(3n),e)},xt=8,Xe=256,ie=Math.ceil(Xe/xt)+1,kt=2**(xt-1),We=()=>{let t=[],e=k,n=e;for(let s=0;s<ie;s++){n=e,t.push(n);for(let c=1;c<kt;c++)n=n.add(e),t.push(n);e=n.double()}return t},Ft,Zt=(t,e)=>{let n=e.negate();return t?n:e},Je=t=>{let e=Ft||(Ft=We()),n=F,s=k,c=2**xt,r=c,i=et(c-1),a=et(xt);for(let o=0;o<ie;o++){let d=Number(t&i);t>>=a,d>kt&&(d-=r,t+=1n);let f=o*kt,u=f,l=f+Math.abs(d)-1,p=o%2!==0,x=d<0;d===0?s=s.add(Zt(p,e[u])):n=n.add(Zt(x,e[l]))}return{p:n,f:s}};function Qe(t){return t instanceof Uint8Array||ArrayBuffer.isView(t)&&t.constructor.name==="Uint8Array"}function oe(t){if(!Number.isSafeInteger(t)||t<0)throw new Error("positive integer expected, got "+t)}function st(t,...e){if(!Qe(t))throw new Error("Uint8Array expected");if(e.length>0&&!e.includes(t.length))throw new Error("Uint8Array expected of length "+e+", got length="+t.length)}function ae(t){if(typeof t!="function"||typeof t.create!="function")throw new Error("Hash should be wrapped by utils.createHasher");oe(t.outputLen),oe(t.blockLen)}function rt(t,e=!0){if(t.destroyed)throw new Error("Hash instance has been destroyed");if(e&&t.finished)throw new Error("Hash#digest() has already been called")}function ue(t,e){st(t);let n=e.outputLen;if(t.length<n)throw new Error("digestInto() expects output buffer of length at least "+n)}function K(...t){for(let e=0;e<t.length;e++)t[e].fill(0)}function gt(t){return new DataView(t.buffer,t.byteOffset,t.byteLength)}function R(t,e){return t<<32-e|t>>>e}function Ye(t){if(typeof t!="string")throw new Error("string expected");return new Uint8Array(new TextEncoder().encode(t))}function dt(t){return typeof t=="string"&&(t=Ye(t)),st(t),t}var nt=class{};function fe(t){let e=s=>t().update(dt(s)).digest(),n=t();return e.outputLen=n.outputLen,e.blockLen=n.blockLen,e.create=()=>t(),e}function $e(t,e,n,s){if(typeof t.setBigUint64=="function")return t.setBigUint64(e,n,s);let c=BigInt(32),r=BigInt(4294967295),i=Number(n>>c&r),a=Number(n&r),o=s?4:0,d=s?0:4;t.setUint32(e+o,i,s),t.setUint32(e+d,a,s)}function de(t,e,n){return t&e^~t&n}function le(t,e,n){return t&e^t&n^e&n}var mt=class extends nt{constructor(e,n,s,c){super(),this.finished=!1,this.length=0,this.pos=0,this.destroyed=!1,this.blockLen=e,this.outputLen=n,this.padOffset=s,this.isLE=c,this.buffer=new Uint8Array(e),this.view=gt(this.buffer)}update(e){rt(this),e=dt(e),st(e);let{view:n,buffer:s,blockLen:c}=this,r=e.length;for(let i=0;i<r;){let a=Math.min(c-this.pos,r-i);if(a===c){let o=gt(e);for(;c<=r-i;i+=c)this.process(o,i);continue}s.set(e.subarray(i,i+a),this.pos),this.pos+=a,i+=a,this.pos===c&&(this.process(n,0),this.pos=0)}return this.length+=e.length,this.roundClean(),this}digestInto(e){rt(this),ue(e,this),this.finished=!0;let{buffer:n,view:s,blockLen:c,isLE:r}=this,{pos:i}=this;n[i++]=128,K(this.buffer.subarray(i)),this.padOffset>c-i&&(this.process(s,0),i=0);for(let u=i;u<c;u++)n[u]=0;$e(s,c-8,BigInt(this.length*8),r),this.process(s,0);let a=gt(e),o=this.outputLen;if(o%4)throw new Error("_sha2: outputLen should be aligned to 32bit");let d=o/4,f=this.get();if(d>f.length)throw new Error("_sha2: outputLen bigger than state");for(let u=0;u<d;u++)a.setUint32(4*u,f[u],r)}digest(){let{buffer:e,outputLen:n}=this;this.digestInto(e);let s=e.slice(0,n);return this.destroy(),s}_cloneInto(e){e||(e=new this.constructor),e.set(...this.get());let{blockLen:n,buffer:s,length:c,finished:r,destroyed:i,pos:a}=this;return e.destroyed=i,e.finished=r,e.length=c,e.pos=a,c%n&&e.buffer.set(s),e}clone(){return this._cloneInto()}},N=Uint32Array.from([1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225]);var tn=Uint32Array.from([1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298]),M=new Uint32Array(64),yt=class extends mt{constructor(e=32){super(64,e,8,!1),this.A=N[0]|0,this.B=N[1]|0,this.C=N[2]|0,this.D=N[3]|0,this.E=N[4]|0,this.F=N[5]|0,this.G=N[6]|0,this.H=N[7]|0}get(){let{A:e,B:n,C:s,D:c,E:r,F:i,G:a,H:o}=this;return[e,n,s,c,r,i,a,o]}set(e,n,s,c,r,i,a,o){this.A=e|0,this.B=n|0,this.C=s|0,this.D=c|0,this.E=r|0,this.F=i|0,this.G=a|0,this.H=o|0}process(e,n){for(let u=0;u<16;u++,n+=4)M[u]=e.getUint32(n,!1);for(let u=16;u<64;u++){let l=M[u-15],p=M[u-2],x=R(l,7)^R(l,18)^l>>>3,b=R(p,17)^R(p,19)^p>>>10;M[u]=b+M[u-7]+x+M[u-16]|0}let{A:s,B:c,C:r,D:i,E:a,F:o,G:d,H:f}=this;for(let u=0;u<64;u++){let l=R(a,6)^R(a,11)^R(a,25),p=f+l+de(a,o,d)+tn[u]+M[u]|0,b=(R(s,2)^R(s,13)^R(s,22))+le(s,c,r)|0;f=d,d=o,o=a,a=i+p|0,i=r,r=c,c=s,s=p+b|0}s=s+this.A|0,c=c+this.B|0,r=r+this.C|0,i=i+this.D|0,a=a+this.E|0,o=o+this.F|0,d=d+this.G|0,f=f+this.H|0,this.set(s,c,r,i,a,o,d,f)}roundClean(){K(M)}destroy(){this.set(0,0,0,0,0,0,0,0),K(this.buffer)}};var he=fe(()=>new yt);var V=he;var wt=class extends nt{constructor(e,n){super(),this.finished=!1,this.destroyed=!1,ae(e);let s=dt(n);if(this.iHash=e.create(),typeof this.iHash.update!="function")throw new Error("Expected instance of class which extends utils.Hash");this.blockLen=this.iHash.blockLen,this.outputLen=this.iHash.outputLen;let c=this.blockLen,r=new Uint8Array(c);r.set(s.length>c?e.create().update(s).digest():s);for(let i=0;i<r.length;i++)r[i]^=54;this.iHash.update(r),this.oHash=e.create();for(let i=0;i<r.length;i++)r[i]^=106;this.oHash.update(r),K(r)}update(e){return rt(this),this.iHash.update(e),this}digestInto(e){rt(this),st(e,this.outputLen),this.finished=!0,this.iHash.digestInto(e),this.oHash.update(e),this.oHash.digestInto(e),this.destroy()}digest(){let e=new Uint8Array(this.oHash.outputLen);return this.digestInto(e),e}_cloneInto(e){e||(e=Object.create(Object.getPrototypeOf(this),{}));let{oHash:n,iHash:s,finished:c,destroyed:r,blockLen:i,outputLen:a}=this;return e=e,e.finished=c,e.destroyed=r,e.blockLen=i,e.outputLen=a,e.oHash=n._cloneInto(e.oHash),e.iHash=s._cloneInto(e.iHash),e}clone(){return this._cloneInto()}destroy(){this.destroyed=!0,this.oHash.destroy(),this.iHash.destroy()}},Ut=(t,e,n)=>new wt(t,e).update(n).digest();Ut.create=(t,e)=>new wt(t,e);ft.hmacSha256Sync=(t,...e)=>Ut(V,t,ft.concatBytes(...e));var en=new TextEncoder,j=t=>en.encode(t),Y=(...t)=>{let e=t.reduce((c,r)=>c+r.length,0),n=new Uint8Array(e),s=0;for(let c of t)n.set(c,s),s+=c.length;return n},St=t=>Array.from(t,e=>e.toString(16).padStart(2,"0")).join(""),pe=t=>Uint8Array.from(t.match(/../g).map(e=>parseInt(e,16))),ct=t=>{let e="";for(let n=0;n<t.length;n+=32768)e+=String.fromCharCode.apply(null,t.subarray(n,n+32768));return btoa(e)},Lt=t=>Uint8Array.from(atob(t),e=>e.charCodeAt(0)),Nt=t=>ct(j(t)),nn=t=>t<128?[t]:t<256?[129,t]:[130,t>>8,t&255],H=(t,e)=>Y(Uint8Array.from([t,...nn(e.length)]),e),T=(...t)=>H(48,Y(...t)),be=(...t)=>H(49,Y(...t)),Q=t=>{let e=t.split(".").map(Number),n=[40*e[0]+e[1]];for(let s of e.slice(2)){let c=[],r=s;do c.unshift(r&127),r=Math.floor(r/128);while(r);for(let i=0;i<c.length-1;i++)c[i]|=128;n.push(...c)}return H(6,Uint8Array.from(n))},_=t=>H(12,j(t)),sn=t=>H(19,j(t)),ge=t=>H(3,Y(Uint8Array.from([0]),t)),v=(t,e)=>be(T(Q(t),e)),xe=t=>{let e=0;for(;e<t.length-1&&t[e]===0;)e++;return t=t.subarray(e),t[0]&128&&(t=Y(Uint8Array.from([0]),t)),H(2,t)},me=(t,e)=>{let n=se(t,pe(e)).toCompactRawBytes();return T(xe(n.subarray(0,32)),xe(n.subarray(32)))};function ye(t,e=0,n=t.length){let s=[];for(;e<n;){let c=t[e],r=t[e+1],i=2;if(r&128){let f=r&127;r=0;for(let u=0;u<f;u++)r=r*256+t[e+2+u];i=2+f}let a=e+i,o=a+r,d={t:c,s:a,e:o,raw:t.subarray(e,o),v:t.subarray(a,o)};c&32&&(d.c=ye(t,a,o)),s.push(d),e=o}return s}var rn=t=>{let e=[Math.floor(t[0]/40),t[0]%40],n=0;for(let s=1;s<t.length;s++)n=n*128+(t[s]&127),t[s]&128||(e.push(n),n=0);return e.join(".")},cn={"2.5.4.3":"CN","2.5.4.6":"C","2.5.4.10":"O","2.5.4.11":"OU","2.5.4.7":"L","2.5.4.8":"ST","0.9.2342.19200300.100.1.25":"DC","1.2.840.113549.1.9.1":"emailAddress"};function we(){return St(ce.randomPrivateKey())}function on(t){return T(T(Q("1.2.840.10045.2.1"),Q("1.3.132.0.10")),ge($t(pe(t),!1)))}function Se(t,e){let n=T(v("2.5.4.6",sn("SA")),v("2.5.4.11",_(e.ou)),v("2.5.4.10",_(e.org)),v("2.5.4.3",_(e.cn))),s=T(v("2.5.4.4",_(e.sn)),v("0.9.2342.19200300.100.1.1",_(e.vat)),v("2.5.4.12",_(e.title||"0100")),v("2.5.4.26",_(e.addr)),v("2.5.4.15",_(e.cat))),c=T(T(Q("1.3.6.1.4.1.311.20.2"),H(4,_(e.prod?"ZATCA-Code-Signing":"TSTZATCA-Code-Signing"))),T(Q("2.5.29.17"),H(4,T(H(164,s))))),r=H(160,T(Q("1.2.840.113549.1.9.14"),be(c))),i=T(H(2,Uint8Array.from([0])),n,on(t),r),a=me(V(i),t),o=T(i,T(Q("1.2.840.10045.4.3.2")),ge(a));return`-----BEGIN CERTIFICATE REQUEST-----
`+ct(o).match(/.{1,64}/g).join(`
`)+`
-----END CERTIFICATE REQUEST-----
`}function an(t){let e=Lt(t),n=ye(e)[0],s=n.c[0],c=0;s.c[0].t===160&&(c=1);let r=s.c[c].v,i=s.c[c+2],a=s.c[c+5],o=0n;for(let u of r)o=o*256n+BigInt(u);let d=i.c.map(u=>{let l=u.c[0],p=rn(l.c[0].v);return(cn[p]||p)+"="+new TextDecoder().decode(l.c[1].v)}),f=n.c[2].v.subarray(1);return{hash:Nt(St(V(j(t)))),issuer:d.reverse().join(", "),serial:o.toString(10),pub:a.raw,sig:f}}var B=t=>String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/\r/g,"&#xD;"),P=t=>Math.round((t+Number.EPSILON)*100)/100,D=t=>P(t).toFixed(2),At="NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==";function _t(t){let e=t.seller,n="    ",s=0,c=[];t.lines.forEach((x,b)=>{let w=x.vat==null?.15:x.vat,E=P(x.unit/(1+w)),m=P(E*x.qty),I=P(m*w);s=P(s+m),c.push({i:b+1,l:x,rate:w,net:E,ln:m,lv:I})});let r=P(s*.15),i=P(s+r),a=P(t.lines.reduce((x,b)=>x+b.unit*b.qty,0)),o=P(a-i),d=[];d.push('<?xml version="1.0" encoding="UTF-8"?>'),d.push('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">'),d.push(n+"@@EXT@@"),d.push(n+"<cbc:ProfileID>reporting:1.0</cbc:ProfileID>"),d.push(n+"<cbc:ID>"+B(t.no)+"</cbc:ID>"),d.push(n+"<cbc:UUID>"+t.uuid+"</cbc:UUID>"),d.push(n+"<cbc:IssueDate>"+t.date+"</cbc:IssueDate>"),d.push(n+"<cbc:IssueTime>"+t.time+"</cbc:IssueTime>"),d.push(n+'<cbc:InvoiceTypeCode name="0200000">'+t.kind+"</cbc:InvoiceTypeCode>"),d.push(n+"<cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>"),d.push(n+"<cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>"),t.kind!=="388"&&d.push(n+"<cac:BillingReference>",n+n+"<cac:InvoiceDocumentReference>",n+n+n+"<cbc:ID>"+B(t.ref)+"</cbc:ID>",n+n+"</cac:InvoiceDocumentReference>",n+"</cac:BillingReference>"),d.push(n+"<cac:AdditionalDocumentReference>",n+n+"<cbc:ID>ICV</cbc:ID>",n+n+"<cbc:UUID>"+t.icv+"</cbc:UUID>",n+"</cac:AdditionalDocumentReference>"),d.push(n+"<cac:AdditionalDocumentReference>",n+n+"<cbc:ID>PIH</cbc:ID>",n+n+"<cac:Attachment>",n+n+n+'<cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">'+t.pih+"</cbc:EmbeddedDocumentBinaryObject>",n+n+"</cac:Attachment>",n+"</cac:AdditionalDocumentReference>"),d.push(n+"<cac:AdditionalDocumentReference>",n+n+"<cbc:ID>QR</cbc:ID>",n+n+"<cac:Attachment>",n+n+n+'<cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">@@QR@@</cbc:EmbeddedDocumentBinaryObject>',n+n+"</cac:Attachment>",n+"</cac:AdditionalDocumentReference>"),d.push(n+"<cac:Signature>",n+n+"<cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID>",n+n+"<cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod>",n+"</cac:Signature>");let f=n+n,u=f+n,l=u+n,p=l+n;d.push(n+"<cac:AccountingSupplierParty>",f+"<cac:Party>",u+"<cac:PartyIdentification>",l+'<cbc:ID schemeID="'+(e.crnScheme||"CRN")+'">'+B(e.crn)+"</cbc:ID>",u+"</cac:PartyIdentification>",u+"<cac:PostalAddress>",l+"<cbc:StreetName>"+B(e.street)+"</cbc:StreetName>",l+"<cbc:BuildingNumber>"+B(e.bld)+"</cbc:BuildingNumber>",l+"<cbc:PlotIdentification>"+B(e.plot||"0000")+"</cbc:PlotIdentification>",l+"<cbc:CitySubdivisionName>"+B(e.dist)+"</cbc:CitySubdivisionName>",l+"<cbc:CityName>"+B(e.city)+"</cbc:CityName>",l+"<cbc:PostalZone>"+B(e.zip)+"</cbc:PostalZone>",l+"<cac:Country>",p+"<cbc:IdentificationCode>SA</cbc:IdentificationCode>",l+"</cac:Country>",u+"</cac:PostalAddress>",u+"<cac:PartyTaxScheme>",l+"<cbc:CompanyID>"+B(e.vat)+"</cbc:CompanyID>",l+"<cac:TaxScheme>",p+"<cbc:ID>VAT</cbc:ID>",l+"</cac:TaxScheme>",u+"</cac:PartyTaxScheme>",u+"<cac:PartyLegalEntity>",l+"<cbc:RegistrationName>"+B(e.name)+"</cbc:RegistrationName>",u+"</cac:PartyLegalEntity>",f+"</cac:Party>",n+"</cac:AccountingSupplierParty>"),d.push(n+"<cac:AccountingCustomerParty></cac:AccountingCustomerParty>");for(let x of t.pay&&t.pay.length?t.pay:["10"])d.push(n+"<cac:PaymentMeans>",f+"<cbc:PaymentMeansCode>"+x+"</cbc:PaymentMeansCode>"),t.kind!=="388"&&d.push(f+"<cbc:InstructionNote>"+B(t.reason||"\u0645\u0631\u062A\u062C\u0639")+"</cbc:InstructionNote>"),d.push(n+"</cac:PaymentMeans>");d.push(n+"<cac:TaxTotal>",f+'<cbc:TaxAmount currencyID="SAR">'+D(r)+"</cbc:TaxAmount>",f+"<cac:TaxSubtotal>",u+'<cbc:TaxableAmount currencyID="SAR">'+D(s)+"</cbc:TaxableAmount>",u+'<cbc:TaxAmount currencyID="SAR">'+D(r)+"</cbc:TaxAmount>",u+"<cac:TaxCategory>",l+'<cbc:ID schemeAgencyID="6" schemeID="UN/ECE 5305">S</cbc:ID>',l+"<cbc:Percent>15.00</cbc:Percent>",l+"<cac:TaxScheme>",p+'<cbc:ID schemeAgencyID="6" schemeID="UN/ECE 5153">VAT</cbc:ID>',l+"</cac:TaxScheme>",u+"</cac:TaxCategory>",f+"</cac:TaxSubtotal>",n+"</cac:TaxTotal>"),d.push(n+"<cac:TaxTotal>",f+'<cbc:TaxAmount currencyID="SAR">'+D(r)+"</cbc:TaxAmount>",n+"</cac:TaxTotal>"),d.push(n+"<cac:LegalMonetaryTotal>",f+'<cbc:LineExtensionAmount currencyID="SAR">'+D(s)+"</cbc:LineExtensionAmount>",f+'<cbc:TaxExclusiveAmount currencyID="SAR">'+D(s)+"</cbc:TaxExclusiveAmount>",f+'<cbc:TaxInclusiveAmount currencyID="SAR">'+D(i)+"</cbc:TaxInclusiveAmount>",f+'<cbc:AllowanceTotalAmount currencyID="SAR">0.00</cbc:AllowanceTotalAmount>',f+'<cbc:PrepaidAmount currencyID="SAR">0.00</cbc:PrepaidAmount>'),o&&d.push(f+'<cbc:PayableRoundingAmount currencyID="SAR">'+D(o)+"</cbc:PayableRoundingAmount>"),d.push(f+'<cbc:PayableAmount currencyID="SAR">'+D(i+o)+"</cbc:PayableAmount>",n+"</cac:LegalMonetaryTotal>");for(let x of c)d.push(n+"<cac:InvoiceLine>",f+"<cbc:ID>"+x.i+"</cbc:ID>",f+'<cbc:InvoicedQuantity unitCode="PCE">'+(+x.l.qty).toFixed(x.l.qty%1?3:0)+"</cbc:InvoicedQuantity>",f+'<cbc:LineExtensionAmount currencyID="SAR">'+D(x.ln)+"</cbc:LineExtensionAmount>",f+"<cac:TaxTotal>",u+'<cbc:TaxAmount currencyID="SAR">'+D(x.lv)+"</cbc:TaxAmount>",u+'<cbc:RoundingAmount currencyID="SAR">'+D(x.ln+x.lv)+"</cbc:RoundingAmount>",f+"</cac:TaxTotal>",f+"<cac:Item>",u+"<cbc:Name>"+B(x.l.name)+"</cbc:Name>",u+"<cac:ClassifiedTaxCategory>",l+"<cbc:ID>S</cbc:ID>",l+"<cbc:Percent>15.00</cbc:Percent>",l+"<cac:TaxScheme>",p+"<cbc:ID>VAT</cbc:ID>",l+"</cac:TaxScheme>",u+"</cac:ClassifiedTaxCategory>",f+"</cac:Item>",f+"<cac:Price>",u+'<cbc:PriceAmount currencyID="SAR">'+D(x.net)+"</cbc:PriceAmount>",f+"</cac:Price>",n+"</cac:InvoiceLine>");return d.push("</Invoice>"),{xml:d.join(`
`),taxable:s,vat:r,incl:i,payable:P(i+o)}}function un(t){let e=t.replace(/^<\?xml[^>]*\?>\n?/,"").replace(/\s+$/,"");return e=e.replace(/<ext:UBLExtensions>[\s\S]*?<\/ext:UBLExtensions>/,"").replace("@@EXT@@",""),e=e.replace(/<cac:Signature>[\s\S]*?<\/cac:Signature>/,""),e=e.replace(/<cac:AdditionalDocumentReference>\s*<cbc:ID>QR<\/cbc:ID>[\s\S]*?<\/cac:AdditionalDocumentReference>/,""),ct(V(j(e)))}function fn(t){return ct(Y(...t.map((e,n)=>{let s=typeof e=="string"?j(e):e;return Y(Uint8Array.from([n+1,s.length]),s)})))}var dn=(t,e,n,s)=>`<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="xadesSignedProperties">
                                    <xades:SignedSignatureProperties>
                                        <xades:SigningTime>${t}</xades:SigningTime>
                                        <xades:SigningCertificate>
                                            <xades:Cert>
                                                <xades:CertDigest>
                                                    <ds:DigestMethod xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                                                    <ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${e}</ds:DigestValue>
                                                </xades:CertDigest>
                                                <xades:IssuerSerial>
                                                    <ds:X509IssuerName xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${n}</ds:X509IssuerName>
                                                    <ds:X509SerialNumber xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${s}</ds:X509SerialNumber>
                                                </xades:IssuerSerial>
                                            </xades:Cert>
                                        </xades:SigningCertificate>
                                    </xades:SignedSignatureProperties>
                                </xades:SignedProperties>`;function ln(t,e,n,s,c,r,i,a){return["<ext:UBLExtensions>","        <ext:UBLExtension>","            <ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>","            <ext:ExtensionContent>",'                <sig:UBLDocumentSignatures xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2" xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2" xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2">',"                    <sac:SignatureInformation>","                        <cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>","                        <sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>",'                        <ds:Signature Id="signature" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">',"                            <ds:SignedInfo>",'                                <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"></ds:CanonicalizationMethod>','                                <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"></ds:SignatureMethod>','                                <ds:Reference Id="invoiceSignedData" URI="">',"                                    <ds:Transforms>",'                                        <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">',"                                            <ds:XPath>not(//ancestor-or-self::ext:UBLExtensions)</ds:XPath>","                                        </ds:Transform>",'                                        <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">',"                                            <ds:XPath>not(//ancestor-or-self::cac:Signature)</ds:XPath>","                                        </ds:Transform>",'                                        <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">',"                                            <ds:XPath>not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])</ds:XPath>","                                        </ds:Transform>",'                                        <ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"></ds:Transform>',"                                    </ds:Transforms>",'                                    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>',"                                    <ds:DigestValue>"+t+"</ds:DigestValue>","                                </ds:Reference>",'                                <ds:Reference Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties" URI="#xadesSignedProperties">','                                    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>',"                                    <ds:DigestValue>"+e+"</ds:DigestValue>","                                </ds:Reference>","                            </ds:SignedInfo>","                            <ds:SignatureValue>"+n+"</ds:SignatureValue>","                            <ds:KeyInfo>","                                <ds:X509Data>","                                    <ds:X509Certificate>"+s+"</ds:X509Certificate>","                                </ds:X509Data>","                            </ds:KeyInfo>","                            <ds:Object>",'                            <xades:QualifyingProperties Target="signature" xmlns:xades="http://uri.etsi.org/01903/v1.3.2#">','                                <xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="xadesSignedProperties">',"                                    <xades:SignedSignatureProperties>","                                        <xades:SigningTime>"+c+"</xades:SigningTime>","                                        <xades:SigningCertificate>","                                            <xades:Cert>","                                                <xades:CertDigest>",'                                                    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>',"                                                    <ds:DigestValue>"+r+"</ds:DigestValue>","                                                </xades:CertDigest>","                                                <xades:IssuerSerial>","                                                    <ds:X509IssuerName>"+i+"</ds:X509IssuerName>","                                                    <ds:X509SerialNumber>"+a+"</ds:X509SerialNumber>","                                                </xades:IssuerSerial>","                                            </xades:Cert>","                                        </xades:SigningCertificate>","                                    </xades:SignedSignatureProperties>","                                </xades:SignedProperties>","                            </xades:QualifyingProperties>","                            </ds:Object>","                        </ds:Signature>","                    </sac:SignatureInformation>","                </sig:UBLDocumentSignatures>","            </ext:ExtensionContent>","        </ext:UBLExtension>","    </ext:UBLExtensions>"].join(`
`)}function vt(t,e,n,s,c){let r=un(t.xml),i=an(s),a=ct(me(V(Lt(r)),n)),o=fn([e.seller.name,e.seller.vat,e.date+"T"+e.time,D(t.payable),D(t.vat),r,a,i.pub,i.sig]),d=Nt(St(V(j(dn(c,i.hash,i.issuer,i.serial)))));return{xml:t.xml.replace("@@EXT@@",ln(r,d,a,s,c,i.hash,i.issuer,i.serial)).replace("@@QR@@",o),hash:r,qr:o}}var It={b64:ct,unb64:Lt,b64s:Nt,hex:St,sha256:V,u8:j};var qt={test:"https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal",prod:"https://gw-fatoora.zatca.gov.sa/e-invoicing/core"},lt={name:"\u0623\u0633\u0648\u0627\u0642 \u0637\u064A\u0628\u0629 \u0627\u0644\u0645\u0631\u0643\u0632\u064A\u0629",vat:"311103105600003",crn:"7026725452",crnScheme:"700",street:"\u0635\u0644\u0627\u062D \u0627\u0644\u062F\u064A\u0646",bld:"7887",plot:"0000",dist:"\u0627\u0644\u064A\u0631\u0645\u0648\u0643",city:"\u0627\u0644\u0632\u0644\u0641\u064A",zip:"15971"},xn={cn:"daftar-pos-shop1",ou:"Sales Branch",org:"Aswaq Taiba Central",sn:"1-Daftar|2-POS|3-shop1",vat:lt.vat,addr:"7887 Salah Aldin Alyarmouk Zulfi",cat:"Supermarket"},A=(t,e=200)=>new Response(JSON.stringify(t),{status:e,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});async function g(t,e){let n=await t.DB.prepare("SELECT v FROM meta WHERE k=?").bind(e).first();try{return n?JSON.parse(n.v):null}catch{return null}}async function y(t,e,n){await t.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)").bind(e,JSON.stringify(n)).run()}var pn=()=>{let t=new Date(Date.now()+108e5).toISOString();return{date:t.slice(0,10),time:t.slice(11,19)}},Ie=()=>new Date().toISOString().slice(0,19)+"Z",bn=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);async function Ot(t,e){let n=await g(t,"zq")||[];return e.id=bn(),e.at=Date.now(),n.push(e),await y(t,"zq",n),e.id}async function gn(t,e){let n=await g(t,"zq")||[];await y(t,"zq",n.filter(s=>s.mode!==e))}function mn(){let t=[{name:"\u0645\u0627\u0621 \u0631\u064A\u0646 330 \u0645\u0644",qty:2,unit:1.5},{name:"\u062E\u0628\u0632",qty:1,unit:1}];return[{kind:"388",no:"T-1",lines:t},{kind:"381",no:"TR-1",ref:"T-1",reason:"\u0625\u0631\u062C\u0627\u0639 \u0635\u0646\u0641",lines:[t[1]]},{kind:"383",no:"TD-1",ref:"T-1",reason:"\u062A\u0639\u062F\u064A\u0644 \u0633\u0639\u0631",lines:[t[1]]}]}function De(t,e,n,s){let{date:c,time:r}=pn(),i=Object.assign({uuid:crypto.randomUUID(),date:c,time:r,icv:e.icv+1,pih:e.pih,pay:t.pay||["10"],seller:lt},t),a=_t(i),o=vt(a,i,n,s,Ie());return{d:i,b:a,r:o}}var Et={"Content-Type":"application/json",Accept:"application/json","Accept-Version":"V2"};async function Ae(t,e,n){let s=we(),c=Se(s,Object.assign({prod:e==="prod"},xn));await gn(t,e);let r={mode:e,at:Date.now(),ok:!1,run:!0,step:"csid",log:[],priv:s};return await y(t,"zt_"+e,r),await Ot(t,{mode:e,k:"csid",url:qt[e]+"/compliance",headers:Object.assign({OTP:n},Et),body:JSON.stringify({csr:It.b64s(c)})}),r}var Ee=t=>{try{return JSON.parse(t)}catch{return null}};async function yn(t,e,n,s){let c=e.mode,r=await g(t,"zt_"+c);if(!r||!r.run)return;let i=Ee(s),a=qt[c];if(e.k==="csid"){if(r.log.push({s:"csid",status:n,t:i?JSON.stringify({requestID:i.requestID,dispositionMessage:i.dispositionMessage,errors:i.errors}):String(s).slice(0,600)}),!i||!i.binarySecurityToken){r.run=!1,await y(t,"zt_"+c,r);return}r.tok=i.binarySecurityToken,r.sec=i.secret,r.rq=i.requestID,r.wait=3;let o=atob(r.tok),d="Basic "+btoa(r.tok+":"+r.sec),f={icv:0,pih:At};await y(t,"zt_"+c,r);for(let u of mn()){let l=De(u,f,r.priv,o);await Ot(t,{mode:c,k:"doc"+u.kind,url:a+"/compliance/invoices",headers:Object.assign({"Accept-Language":"ar",Authorization:d},Et),body:JSON.stringify({invoiceHash:l.r.hash,uuid:l.d.uuid,invoice:It.b64s(l.r.xml)})}),f={icv:f.icv+1,pih:l.r.hash}}return}if(e.k.startsWith("doc")){let o=i&&i.validationResults,d=(n===200||n===202)&&i&&i.reportingStatus==="REPORTED";if(r.log.push({s:e.k,status:n,rep:i&&i.reportingStatus,warn:o&&o.warningMessages,err:o&&o.errorMessages,t:i?"":String(s).slice(0,600)}),d||(r.bad=1),r.wait=(r.wait||1)-1,r.wait>0){await y(t,"zt_"+c,r);return}if(r.bad){r.run=!1,await y(t,"zt_"+c,r);return}await y(t,"zt_"+c,r),await Ot(t,{mode:c,k:"pcsid",url:a+"/production/csids",headers:Object.assign({Authorization:"Basic "+btoa(r.tok+":"+r.sec)},Et),body:JSON.stringify({compliance_request_id:String(r.rq)})});return}e.k==="pcsid"&&(r.log.push({s:"pcsid",status:n,t:i?JSON.stringify({requestID:i.requestID,dispositionMessage:i.dispositionMessage,errors:i.errors}):String(s).slice(0,600)}),r.run=!1,i&&i.binarySecurityToken&&(r.ok=!0,c==="prod"&&await y(t,"zt_egs",{at:Date.now(),priv:r.priv,cert:atob(i.binarySecurityToken),tok:i.binarySecurityToken,secret:i.secret,rid:i.requestID,icv:0,pih:At})),await y(t,"zt_"+c,r))}var Dt=t=>t&&{mode:t.mode,at:t.at,ok:t.ok,run:t.run,log:t.log};async function wn(t,e,n,s){if(!n||!n.owner)return A({ok:!1},403);if(s==="/api/zatca/status"){let c=await g(t,"zt_test"),r=await g(t,"zt_prod"),i=await g(t,"zt_egs"),a=await g(t,"zt_relay"),o=await g(t,"zq")||[],d=await g(t,"zt_relay_req"),f=await g(t,"zrq")||[],u=await g(t,"zt_errs")||[],l=await g(t,"zt_chain");return A({ok:!0,test:Dt(c),prod:Dt(r),linked:!!i,egsAt:i&&i.at,seller:lt,relay:a,relayReq:d&&Date.now()-d.at<15*6e4?{at:d.at,ua:d.ua}:null,queue:o.length,pend:f.length,errs:u,signed:l?l.icv:0,now:Date.now()})}if(s==="/api/zatca/approve"&&e.method==="POST"){let c=await g(t,"zt_relay_req"),r=await g(t,"zrq")||[],i=await g(t,"zt_errs")||[],a=await g(t,"zt_chain");if(!c)return A({ok:!1,err:"none"},400);let o=await g(t,"zt_relay_ok")||[];return o.includes(c.id)||o.push(c.id),await y(t,"zt_relay_ok",o.slice(-5)),await t.DB.prepare("DELETE FROM meta WHERE k='zt_relay_req'").run(),A({ok:!0})}if(s==="/api/zatca/errseen"&&e.method==="POST")return await y(t,"zt_errs",[]),A({ok:!0});if(s==="/api/zatca/test"&&e.method==="POST")return A({ok:!0,r:Dt(await Ae(t,"test","123345"))});if(s==="/api/zatca/onboard"&&e.method==="POST"){let c=await e.json().catch(()=>({})),r=String(c.otp||"").trim();if(!/^\d{6}$/.test(r))return A({ok:!1,err:"otp"},400);let i=await g(t,"zt_test");return!i||!i.ok?A({ok:!1,err:"test_first"},400):A({ok:!0,r:Dt(await Ae(t,"prod",r))})}return A({ok:!1,err:"nf"},404)}var Sn={cash:["10"],card:["48"],tr:["42"],mix:["10","48"],aj:["30"]};async function An(t,e,n,s){if(!s||s.br!=="shop")return null;let c=await g(t,"zt_egs");if(!c)return null;let r=s.kind==="ret",i=(s.lines||[]).map(o=>({name:String(o[1]||"\u0635\u0646\u0641"),qty:Math.abs(+o[3]),unit:+o[2]})).filter(o=>o.qty>0);if(!i.length)return null;let a={kind:r?"381":"388",no:(r?"R":"")+s.no,uuid:crypto.randomUUID(),date:s.day,time:String(s.t||"").slice(0,8),pay:Sn[s.mode]||["10"],seller:lt,lines:i};r&&(a.ref=String(s.refNo),a.reason=s.why||"\u0625\u0631\u062C\u0627\u0639 \u0635\u0646\u0641");for(let o=0;o<8;o++){let d=await t.DB.prepare("SELECT v FROM meta WHERE k='zt_chain'").first(),f=d?JSON.parse(d.v):{icv:0,pih:At},u=Object.assign({},a,{icv:f.icv+1,pih:f.pih}),l=_t(u),p=vt(l,u,c.priv,c.cert,Ie()),x=JSON.stringify({icv:u.icv,pih:p.hash}),b=d?await t.DB.prepare("UPDATE meta SET v=? WHERE k='zt_chain' AND v=?").bind(x,d.v).run():await t.DB.prepare("INSERT OR IGNORE INTO meta (k,v) VALUES ('zt_chain',?)").bind(x).run();if(!b.meta||!b.meta.changes)continue;s.z={icv:u.icv,h:p.hash,qr:p.qr,u:u.uuid,st:"q",at:Date.now()},await t.DB.prepare("INSERT OR REPLACE INTO docs (col,id,data,v,at) VALUES (?,?,?,1,?)").bind("zx/"+s.day,n,JSON.stringify({x:It.b64s(p.xml)}),Date.now()).run(),await t.DB.prepare("UPDATE docs SET data=? WHERE col=? AND id=?").bind(JSON.stringify(s),e,n).run();let w=await g(t,"zrq")||[];return w.push({c:e,i:n}),await y(t,"zrq",w),{qr:p.qr}}return null}var ZSW=0;async function In(t){let e=await g(t,"zrq")||[],n=Date.now();if(n-ZSW>6e4){ZSW=n;try{let ch=0;for(const dd of [new Date(n+3*36e5).toISOString().slice(0,10),new Date(n-21*36e5).toISOString().slice(0,10)]){const rs=(await t.DB.prepare("SELECT id FROM docs WHERE col=? AND json_extract(data,'$.z.st')='q' AND json_extract(data,'$.z.at')<?").bind("posinv/"+dd,n-12e4).all()).results||[];for(const x of rs){if(e.some(f=>f.c==="posinv/"+dd&&f.i===x.id))continue;if(!(await t.DB.prepare("SELECT 1 FROM docs WHERE col=? AND id=?").bind("zx/"+dd,x.id).first()))continue;e.push({c:"posinv/"+dd,i:x.id});ch++}}if(ch)await y(t,"zrq",e)}catch(x){}}if(!e.length)return null;let s=e.find(f=>!f.tk||n-f.tk>9e4);if(!s)return null;let c=await g(t,"zt_egs");if(!c)return null;let r=await t.DB.prepare("SELECT data FROM docs WHERE col=? AND id=?").bind(s.c,s.i).first(),i=s.c.slice(7),a=await t.DB.prepare("SELECT data FROM docs WHERE col=? AND id=?").bind("zx/"+i,s.i).first();if(!r||!a)return await y(t,"zrq",e.filter(f=>f!==s)),null;let o=JSON.parse(r.data),d=JSON.parse(a.data);return s.tk=n,await y(t,"zrq",e),{id:"r:"+s.c+"|"+s.i,url:qt.prod+"/invoices/reporting/single",headers:Object.assign({"Accept-Language":"ar","Clearance-Status":"0",Authorization:"Basic "+btoa(c.tok+":"+c.secret)},Et),body:JSON.stringify({invoiceHash:o.z.h,uuid:o.z.u,invoice:d.x})}}async function Dn(t,e,n,s){let[c,r]=e.slice(2).split("|"),i=Ee(s),a=await g(t,"zrq")||[],o=await t.DB.prepare("SELECT data FROM docs WHERE col=? AND id=?").bind(c,r).first();if(!(n===200||n===202||n===409||n===400)){let x=a.find(b=>b.c===c&&b.i===r);x&&(x.tk=Date.now()+10*6e4-9e4,x.last=n,await y(t,"zrq",a));return}if(await y(t,"zrq",a.filter(x=>!(x.c===c&&x.i===r))),!o)return;let f=JSON.parse(o.data),u=i&&i.validationResults,l=u&&u.errorMessages||[],p=u&&u.warningMessages||[];if(f.z.st=n===400||l.length?"err":p.length?"warn":"ok",f.z.rt=Date.now(),f.z.st!=="ok"&&(f.z.m=l.concat(p).map(x=>(x.code||"")+" "+(x.message||"")).slice(0,5)),await t.DB.prepare("UPDATE docs SET data=? WHERE col=? AND id=?").bind(JSON.stringify(f),c,r).run(),f.z.st==="err"){let x=await g(t,"zt_errs")||[];x.push({c,i:r,no:(f.kind==="ret"?"R":"")+f.no,day:f.day,m:f.z.m,at:Date.now()}),await y(t,"zt_errs",x.slice(-50))}}async function En(t,e){let n=String(e.headers.get("CF-Connecting-IP")||"");n.includes(":")&&(n=n.split(":").slice(0,4).join(":")+"::/64");let s=n?"ip:"+n:"";return s?(await g(t,"zt_relay_ok")||[]).includes(s)?{name:"\u0643\u0645\u0628\u064A\u0648\u062A\u0631 \u0627\u0644\u0645\u062D\u0644",email:"relay"}:(await y(t,"zt_relay_req",{id:s,at:Date.now(),ua:String(e.headers.get("User-Agent")||"").slice(0,160)}),null):null}async function Tn(t,e,n,s){let c=new URL(e.url);if(await y(t,"zt_relay",{at:Date.now(),by:n.name||n.email,v:c.searchParams.get("v")||""}),s==="/api/zrelay/next"){let r=await g(t,"zq")||[],i=Date.now(),a=r.find(o=>!o.tk||i-o.tk>9e4);if(!a){let o=await In(t);return A({ok:!0,job:o})}return a.tk=i,await y(t,"zq",r),A({ok:!0,job:{id:a.id,url:a.url,headers:a.headers,body:a.body}})}if(s==="/api/zrelay/done"&&e.method==="POST"){let r=await e.json().catch(()=>({}));if(String(r.id||"").startsWith("r:"))return await Dn(t,String(r.id),+r.status||0,String(r.text||"")),A({ok:!0});let i=await g(t,"zq")||[],a=i.find(o=>o.id===r.id);return a?(await y(t,"zq",i.filter(o=>o.id!==r.id)),await yn(t,a,+r.status||0,String(r.text||"")),A({ok:!0})):A({ok:!0,gone:1})}return A({ok:!1},404)}return ke(Cn);})();

/* owner 25 Nov: invoices waiting for the ZATCA relay (the Chrome extension on the shop computer) while it has been silent — raise an alert in the ledger, once an hour */
async function zRelayWatch(env) {
  try {
    const q = await env.DB.prepare("SELECT v FROM meta WHERE k='zrq'").first(), rl = await env.DB.prepare("SELECT v FROM meta WHERE k='zt_relay'").first();
    const qq = q ? JSON.parse(q.v) : [], at = rl ? (JSON.parse(rl.v).at || 0) : 0, now = Date.now();
    if (!qq.length || now - at < 6 * 60e3) return;
    const la = await env.DB.prepare("SELECT v FROM meta WHERE k='zrq_alert'").first();
    if (la && now - (+la.v || 0) < 3600e3) return;
    await env.DB.prepare("INSERT INTO meta (k,v) VALUES ('zrq_alert',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(String(now)).run();
    const c = await env.DB.prepare("SELECT data FROM docs WHERE col='diag' AND id='alerts'").first(); let d = {}; try { if (c) d = JSON.parse(c.data); } catch (e) { }
    const items = (d.items || []).slice(); items.unshift({ at: now, t: "⚠️ " + qq.length + " فاتورة لم تصل لهيئة الزكاة: وسيط الهيئة على كمبيوتر المحل متوقف من " + Math.round((now - at) / 60000) + " دقيقة. افتح Chrome على كمبيوتر المحل وتصل تلقائياً." });
    d.items = items.slice(0, 200); await writeDoc(env, "diag", "alerts", d);
  } catch (e) { }
}
export default {
  async scheduled(ev, env, ctx) { await init(env); ctx.waitUntil(zRelayWatch(env)); ctx.waitUntil(slPull(env)); ctx.waitUntil(ppTick(env)); ctx.waitUntil(gemSelf(env)); ctx.waitUntil(gwTick(env)); ctx.waitUntil(oldCopy(env)); },
  async fetch(req, env, ctx) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const u = new URL(req.url), p = u.pathname, q = u.searchParams;
    try {
      await init(env); PUBENV = env;
      if (p === "/api/ping") return json({ daftar: "ready", db: 1 });

      if (p === "/plogin" && req.method === "POST") {
        const back = e => new Response(null, { status: 303, headers: { Location: PUB + "/g.html#e=" + e, "Cache-Control": "no-store" } });
        const fd = await req.formData().catch(() => null); if (!fd) return back("x");
        const email = String(fd.get("email") || "").trim().toLowerCase().slice(0, 120), pw = String(fd.get("pw") || "").trim().slice(0, 40), now = Date.now();
        let usr = email ? await userOf(env, email.includes("@") ? email : await posUserEmail(env, email)) : null; if (usr && usr.email.endsWith("@pos.taiba")) usr = null; if (!usr) { await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES ('plog',?)").bind(JSON.stringify({at:Date.now(),w:"nouser",em:email,pl:pw.length})).run(); return back("wrong"); }
        const cur = await pinGet(env, usr.email); if (!cur) { await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES ('plog',?)").bind(JSON.stringify({at:Date.now(),w:"nopin",em:email,pl:pw.length})).run(); return back("nopin"); }
        if (cur.lockUntil && cur.lockUntil > now) return back("locked");
        if (pw && await pinHash(usr.email, pw, cur.salt) === cur.h) {
          cur.fail = 0; delete cur.lockUntil; const t = rnd();
          await env.DB.batch([env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)").bind("pin_" + usr.email, JSON.stringify(cur)), env.DB.prepare("INSERT INTO sess (hh,email,at,pin) VALUES (?,?,?,1)").bind(await sha("s|" + t), usr.email, now)]);
          return new Response(null, { status: 303, headers: { Location: "/", "Cache-Control": "no-store", "Set-Cookie": "dsid=" + t + "; Path=/; Max-Age=" + SES_DAYS * 86400 + "; HttpOnly; Secure; SameSite=Lax" } });
        }
        await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES ('plog',?)").bind(JSON.stringify({at:Date.now(),w:"badpw",em:email,pl:pw.length})).run(); cur.fail = (cur.fail || 0) + 1; let lk = false;
        if (cur.fail >= 5) { cur.lockUntil = now + 15 * 60e3; cur.fail = 0; lk = true; }
        await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)").bind("pin_" + usr.email, JSON.stringify(cur)).run();
        return back(lk ? "locked" : "wrong");
      }
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
        const rec = { email, gname: cl(pl.name), name: cl(f.name), idno: cl(f.idno), phone: cl(f.phone), job: cl(f.job), nat: cl(f.nat), note: cl(f.note), photo: String(pl.picture || "").slice(0, 500), at: Date.now(), st: "wait" };
        if (!rec.name || !rec.idno || !rec.phone) return json({ ok: false, err: "fields" }, 400);
        await writeDoc(env, "staffreq", (await sha("r|" + email)).slice(0, 24), rec);
        return json({ ok: true });
      }
      if (p === "/logout" || p === "/out") { const t = cookie(req, "dsid"); if (t) await env.DB.prepare("DELETE FROM sess WHERE hh=?").bind(await sha("s|" + t)).run(); return new Response(null, { status: 302, headers: { Location: PUB + "/g.html", "Set-Cookie": "dsid=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax", "Cache-Control": "no-store" } }); }
      if (p === "/api/logout") { const t = cookie(req, "dsid"); if (t) await env.DB.prepare("DELETE FROM sess WHERE hh=?").bind(await sha("s|" + t)).run(); return json({ ok: true }, 200, { "Set-Cookie": "dsid=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax" }); }

      if (p === "/p") return Response.redirect(u.origin + "/p/", 302);
      if (p === "/p/") { const pg = await ppPage(env); return pg || new Response("الصفحة قيد التجهيز", { status: 503 }); }
      if (/^\/p\/b\/[\w-]+$/.test(p)) { const r = await getAsset(env, "pp:b:" + p.slice(5)); if (!r) return new Response("not found", { status: 404 }); r.headers.set("Cache-Control", "public, max-age=31536000, immutable"); return r; }
      if (/^\/p\/[sz]\/\d+\.jpg$/.test(p)) { const r = await getAsset(env, "pp:" + p.slice(3)); if (!r) return new Response("not found", { status: 404 }); r.headers.set("Cache-Control", "public, max-age=31536000, immutable"); return r; }
      const me = await who(req, env);
      if (p === "/app") return new Response(null, { status: 302, headers: { Location: "/app/", "Cache-Control": "no-store" } });
      if (p === "/pos") return new Response(null, { status: 302, headers: { Location: "/pos/", "Cache-Control": "no-store" } });
      if (p === "/poslogin" && req.method === "POST") return await posLogin(env, req);
      if (p === "/poslogout") { const t = cookie(req, "psid"); if (t) await env.DB.prepare("DELETE FROM sess WHERE hh=?").bind(await sha("p|" + t)).run(); return new Response(null, { status: 302, headers: { Location: "/pos/", "Set-Cookie": "psid=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax", "Cache-Control": "no-store" } }); }
      if (p === "/pos/") {
        const pm = (me && me.owner && me.pinOk) ? me : await posWho(req, env);
        if (!pm) return new Response(POS_LOGIN_HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
        const pr = await pub("/pos.html"); if (pr) pr.headers.set("Cache-Control", "no-store"); return pr || new Response("not found", { status: 404 });
      }
      if (p === "/" || p === "/app/") {
        if (!me) return Response.redirect(PUB + "/g.html", 302);
        if (p === "/" && cookie(req, "dto") === "pos") return new Response(null, { status: 302, headers: { Location: "/pos/", "Set-Cookie": "dto=; Path=/; Max-Age=0; Secure; SameSite=Lax", "Cache-Control": "no-store" } });
        if (p === "/") return new Response(null, { status: 302, headers: { Location: "/app/", "Cache-Control": "no-store" } });
        if (!me.pinOk) return pinPage(me, !(await pinGet(env, me.email)));
        const pg = await appPage(env); if (pg) return pg;
        return pub("/wait.html");
      }
      if (p === "/app/share" && req.method === "POST") {
        const pg = (ok, big, sm) => new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui,Tahoma;background:#f4f6f5;margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;direction:rtl"><div style="background:#fff;border-radius:16px;padding:28px 22px;text-align:center;max-width:340px;box-shadow:0 2px 14px #0002"><div style="font-size:54px;color:' + (ok ? "#0e5a3c" : "#b3261e") + '">' + (ok ? "&#10003;" : "&#10007;") + '</div><div style="font-size:22px;font-weight:700;margin:8px 0">' + big + '</div><div style="color:#555;font-size:16px;line-height:1.7">' + sm + '</div><button onclick="history.length>1?history.back():window.close()" style="margin-top:18px;padding:12px 26px;border:0;border-radius:12px;background:#0e5a3c;color:#fff;font-size:17px">رجوع</button></div>', { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
        try {
          const fd = await req.formData(); const f = fd.get("img");
          if (fd.get("cphone") && /^l[a-f0-9]{20}$/.test(String(fd.get("lid") || ""))) {
            const en = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"), lid0 = String(fd.get("lid")), nm0 = String(fd.get("cname") || "").trim();
            if (nm0.length < 2) return pg(false, "اكتب اسم العميل", "ارجع واكتب الاسم ثم احفظ.");
            const lw = await env.DB.prepare("SELECT data FROM docs WHERE col='poloc' AND id=?").bind(lid0).first(); if (!lw) return pg(false, "الموقع غير موجود", "شارك الموقع من جديد.");
            const sv0 = await posDcSave(env, nm0, String(fd.get("cphone")), JSON.parse(lw.data), lid0, "share"); if (!sv0) return pg(false, "الرقم غير صحيح", "اكتب رقم الجوال كاملاً.");
            return pg(true, "تم حفظ العميل", en(sv0.name) + " · " + en(sv0.phone) + "<br>اختره من نقاط البيع بالاسم أو الرقم.");
          }
          if (!f || typeof f === "string" || f.size < 300) {
            const tx = String(fd.get("text") || "") + " " + String(fd.get("title") || "");
            let vtxt = ""; const cf = fd.get("card"); if (cf && typeof cf !== "string") { try { vtxt = await cf.text(); } catch (e) { } } if (!vtxt && /BEGIN:VCARD/i.test(tx)) vtxt = tx;
            if (vtxt) {
              const fnm = /^FN[^:\r\n]*:(.+)$/mi.exec(vtxt), tel = /^TEL[^:\r\n]*:(.+)$/mi.exec(vtxt), vnm = (fnm ? fnm[1] : "").trim(), vph = posPhone(tel ? tel[1] : "");
              if (!vph) return pg(false, "ما لقيت رقم في البطاقة", "شارك بطاقة جهة اتصال فيها رقم.");
              const lrs = (await env.DB.prepare("SELECT id,data FROM docs WHERE col='poloc' ORDER BY at DESC LIMIT 10").all()).results || []; let vl = null, vlid = "";
              for (const x of lrs) { const d = JSON.parse(x.data); if (!d.inv && Date.now() - d.at < 18e5) { vl = d; vlid = x.id; break; } }
              const sv = await posDcSave(env, vnm, vph, vl, vlid, "share"); if (!sv) return pg(false, "تعذّر حفظ العميل", "جرّب مرة ثانية.");
              const en = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
              return pg(true, "تم حفظ العميل", en(sv.name) + " · " + en(sv.phone) + (vl ? "<br>مع موقعه (" + ["", "قريب", "متوسط", "بعيد"][vl.lv] + " · " + vl.d + " كم)" : "<br>ينتظر موقعه: شارك موقعه خلال 30 دقيقة"));
            }
            let ll = posLocParse(tx);
            if (!ll) { const um = /https?:\/\/[^\s]+/.exec(tx); if (um) { try { const rr = await fetch(um[0], { redirect: "follow" }); ll = posLocParse(rr.url) || posLocParse((await rr.text()).slice(0, 300000)); } catch (e) { } } }
            if (!ll) return pg(false, "ما وصلني شيء مفهوم", "شارك موقع العميل من الواتساب، أو صورة إيصال التحويل.");
            const lc = posLocCalc(ll[0], ll[1]); if (lc.d > 40) return pg(false, "الموقع بعيد جداً", "المسافة " + lc.d + " كم عن المحل — تأكد من الموقع.");
            const now = Date.now(); let lid = "l" + hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ll[0].toFixed(5) + "," + ll[1].toFixed(5)))).slice(0, 20);
            const ex = await env.DB.prepare("SELECT data FROM docs WHERE col='poloc' AND id=?").bind(lid).first();
            if (ex) { const d0 = JSON.parse(ex.data); if (!d0.inv && now - d0.at < 36e5 * 12) return pg(true, "سبق تسجيل هذا الموقع", "ينتظر في شاشة التوصيل."); lid = "l" + hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(lid + now))).slice(0, 20); }
            const ldoc = { at: now, day: posDay(now), t: posTime(now), lat: ll[0], lng: ll[1], d: lc.d, lv: lc.lv, fee0: lc.fee0, fee1: lc.fee1, inv: null }; await writeDoc(env, "poloc", lid, ldoc);
            let attN = ""; { const pcs = (await env.DB.prepare("SELECT id,data FROM docs WHERE col='pocust' ORDER BY at DESC LIMIT 6").all()).results || []; for (const x of pcs) { const d = JSON.parse(x.data); if (d.pend && now - (d.updAt || d.at) < 18e5) { const sv = await posDcSave(env, "", d.phone, ldoc, lid, "share"); if (sv) attN = sv.name; break; } } }
            if (attN) return pg(true, "تم تسجيل الموقع وربطه بالعميل", String(attN).replace(/&/g, "&amp;").replace(/</g, "&lt;") + "<br>" + ["", "قريب", "متوسط", "بعيد"][lc.lv] + " · " + lc.d + " كم");
            return pg(true, "تم تسجيل الموقع", ["", "قريب", "متوسط", "بعيد"][lc.lv] + " · " + lc.d + " كم<br>الرسوم " + lc.fee0 + " ر.س (أو " + lc.fee1 + " إذا الطلب 20 فأكثر)" + '<form method="post" action="/app/share" style="margin-top:14px"><input type="hidden" name="lid" value="' + lid + '"><input name="cname" placeholder="اسم العميل (كما في الواتساب)" style="width:100%;box-sizing:border-box;padding:12px;font-size:16px;border:1px solid #cfd8d5;border-radius:10px;margin-bottom:8px;font-family:inherit"><input name="cphone" inputmode="tel" placeholder="رقم الجوال" style="width:100%;box-sizing:border-box;padding:12px;font-size:16px;border:1px solid #cfd8d5;border-radius:10px;margin-bottom:8px;font-family:inherit"><button style="width:100%;padding:12px;border:0;border-radius:12px;background:#0e5a3c;color:#fff;font-size:17px;font-family:inherit">حفظ كعميل توصيل</button></form>');
          }
          if (f.size > 8e6) return pg(false, "الصورة كبيرة", "صوّرها بحجم أصغر.");
          const buf = await f.arrayBuffer(), id = "x" + hex(await crypto.subtle.digest("SHA-256", buf)).slice(0, 20), mime = /^image\//.test(f.type) ? f.type : "image/jpeg";
          const ex = await env.DB.prepare("SELECT data FROM docs WHERE col='postr' AND id=?").bind(id).first();
          if (ex) { const d0 = JSON.parse(ex.data); return pg(true, "سبق تسجيل هذا الإيصال", "مبلغ " + d0.amt + " ر.س" + (d0.inv ? " — واستُخدم في فاتورة" : " — ينتظر في شاشة نقاط البيع")); }
          const u8 = new Uint8Array(buf); let bin = ""; for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
          const PR = 'هذه صورة إيصال/إشعار تحويل بنكي (تطبيق بنك أو STC Pay أو غيره) مرسلة من عميل لمحل «أسواق طيبة». اقرأ الأرقام بدقة ولا تخمّن.\nأعد JSON فقط: {"isTransfer":true|false,"amount":0.00,"dateISO":"YYYY-MM-DD","time":"HH:MM","sender":"اسم المحوّل إن ظهر","bank":"اسم البنك إن ظهر","ref":"رقم المرجع/العملية إن ظهر"}\nإذا لم تكن الصورة إيصال تحويل فاجعل isTransfer=false.';
          let r = null, err = "";
          for (let i = 0; i < 2 && !(r && +r.amount > 0); i++) { try { const g = await gemRead(env, PR, [{ b64: btoa(bin), mime }], true); r = g && (g.json || g.data || g); await gemStat(env, true); } catch (e) { err = String(e && e.message || e); try { await gemStat(env, false, err); } catch (e2) { } } }
          if (!r || r.isTransfer === false || !(+r.amount > 0)) return pg(false, "ما قدرت أقرأ الإيصال", "تأكد أنها صورة إيصال تحويل واضحة وشاركها مرة ثانية.");
          const amt = Math.round(+r.amount * 100) / 100, now = Date.now();
          await putAsset(env, "xf:" + id, buf, mime);
          await writeDoc(env, "postr", id, { at: now, day: posDay(now), t: posTime(now), amt, sender: String(r.sender || "").slice(0, 60), bank: String(r.bank || "").slice(0, 40), ref: String(r.ref || "").slice(0, 40), dateISO: /^\d{4}-\d{2}-\d{2}$/.test(String(r.dateISO || "")) ? r.dateISO : null, inv: null, ...(await posCurGet(env).then(c => c ? { cust: c.id, cn: c.name } : {})) });
          return pg(true, "تم تسجيل التحويل", "مبلغ " + amt + " ر.س" + await posCurGet(env).then(c => c ? "<br>للعميل: " + String(c.name).replace(/&/g, "&amp;").replace(/</g, "&lt;") : "") + "<br>افتح شاشة نقاط البيع واختر «تحويل».");
        } catch (e) { return pg(false, "تعذّر التسجيل", String(e && e.message || e).slice(0, 120)); }
      }
      if (!p.startsWith("/api/") && !p.startsWith("/_blob/")) { const r = await pub(p); return r || json({ ok: false }, 404); }
      if (p === "/api/order" && req.method === "POST") return await posOrderIn(env, req);
      if (p === "/api/pv" && req.method === "POST") return await ppVisit(env, req, me);
      if (p.startsWith("/api/zrelay/")) { const zm = me || await posWho(req, env) || await ZATCA.relayAuth(env, req); if (!zm) { await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)").bind("zt_relay_fail", JSON.stringify({ at: Date.now(), ck: (req.headers.get("Cookie") || "").split(";").map(x => x.split("=")[0].trim()).join(","), ua: (req.headers.get("User-Agent") || "").slice(0, 120), org: req.headers.get("Origin") || "" })).run(); return json({ ok: false, err: "login" }, 401); } return await ZATCA.relayApi(env, req, zm, p); }
      if (p.startsWith("/api/pos/")) { const pm = (me && me.owner && me.pinOk) ? me : await posWho(req, env); if (!pm) return json({ ok: false, err: "login" }, 401); return await posApi(env, req, pm, p, q); }
      if (!me) return json({ ok: false, err: "login" }, 401);
      if (p === "/api/pin" && req.method === "POST") return await pinApi(env, req, me);
      if (!me.pinOk) return json({ ok: false, err: "pin" }, 401);
      if (p.startsWith("/api/jard")) return await jardLedger(env, req, me, p, q);
      if (p === "/api/zatca/list") {
        if (!me.owner) return json({ ok: false }, 403);
        const rs = await env.DB.prepare("SELECT col,id,data FROM docs WHERE col LIKE 'posinv/%' AND data LIKE '%\"z\":{%' ORDER BY at DESC LIMIT 300").all();
        const items = [];
        for (const row of (rs.results || [])) { let d; try { d = JSON.parse(row.data); } catch (e) { continue; } if (!d || !d.z) continue; const tot = Math.abs(+d.total || 0); items.push({ no: d.no, ret: d.kind === "ret" ? 1 : 0, ref: d.refNo || "", day: d.day, t: String(d.t || "").slice(0, 5), st: d.z.st, icv: d.z.icv, at: d.z.at, rt: d.z.rt || 0, m: d.z.m || [], tot: Math.round(tot * 100) / 100 }); }
        items.sort((x, y) => y.at - x.at);
        const zq = await env.DB.prepare("SELECT v FROM meta WHERE k='zrq'").first();
        return json({ ok: true, items: items.slice(0, 200), pend: zq ? JSON.parse(zq.v).length : 0, now: Date.now() });
      }
      if (p.startsWith("/api/zatca/")) return await ZATCA.zatcaApi(env, req, me, p);
      /* owner 26 Nov: the cashier balances his handed-over POS shift from the ledger on his phone — he sees the shifts waiting, and saves his drawer count */
      if (p === "/api/shift/pending") {
        const r = (await env.DB.prepare("SELECT id,data FROM docs WHERE col='posshift' AND json_extract(data,'$.st')='closed' AND json_extract(data,'$.rec') IS NULL AND json_extract(data,'$.closeAt')>? ORDER BY at DESC LIMIT 40").bind(Date.now() - 14 * 864e5).all()).results || [];
        const out = [];
        for (const x of r) { const d = JSON.parse(x.data); d.id = x.id; const pr = await shPred(env, d); out.push({ id: d.id, u: d.u, br: d.br, dev: d.dev || null, openAt: d.openAt, closeAt: d.closeAt, day: d.day, exp: d.exp || null, fShort: d.fShort || null, left: d.left != null ? d.left : null, leftAll: !!d.leftAll, pred: pr ? { id: pr.id, u: pr.u, closeAt: pr.closeAt, cash: await shRecOf(env, pr) } : null }); }
        return json({ ok: true, list: out });
      }
      if (p === "/api/shift/rejects") {
        const r = (await env.DB.prepare("SELECT id,data FROM docs WHERE col='posshift' AND json_extract(data,'$.st')='open' AND json_extract(data,'$.fRej') IS NOT NULL").all()).results || [];
        const out = [];
        for (const x of r) { const d = JSON.parse(x.data); d.id = x.id; const pr = await shPred(env, d); if (!pr || !shKey(pr) || shKey(pr) !== d.fRej.recAt) continue; out.push({ shift: d.id, u: d.u, why: d.fRej.why, n: d.fRej.n, at: d.fRej.at, pred: { id: pr.id, u: pr.u, br: pr.br, cash: await shRecOf(env, pr), left: pr.left != null, closingId: (pr.rec && pr.rec.closingId) || null } }); }
        return json({ ok: true, list: out });
      }
      if (p === "/api/shift/recfix" && req.method === "POST") {
        const o = await req.json().catch(() => ({})), id = String(o.id || ""), cash = Math.round((+o.cash) * 100) / 100;
        if (!id || !(cash >= 0 && cash < 1e7)) return json({ ok: false, err: "num" });
        const row = await env.DB.prepare("SELECT data FROM docs WHERE col='posshift' AND id=?").bind(id).first(); if (!row) return json({ ok: false, err: "noshift" });
        const d = JSON.parse(row.data);
        if (d.left != null) { if ((d.leftFixes || 0) >= 3 && !me.owner) return json({ ok: false, err: "many" }); d.leftPrev = d.left; d.left = cash; d.leftAt = Date.now(); d.leftFixes = (d.leftFixes || 0) + 1; await writeDoc(env, "posshift", id, d); return json({ ok: true }); }
        if (!d.rec) return json({ ok: false, err: "norec" }); if ((d.rec.fixes || 0) >= 3 && !me.owner) return json({ ok: false, err: "many" });
        d.rec = Object.assign({}, d.rec, { prevCash: d.rec.cash, cash, at: Date.now(), fixes: (d.rec.fixes || 0) + 1 }); await writeDoc(env, "posshift", id, d); return json({ ok: true });
      }
      /* owner 26 Nov: read the mada settlement slip photo (Gemini); the cashier confirms or corrects the number on his phone */
      if (p === "/api/shift/slip" && req.method === "POST") {
        const o = await req.json().catch(() => ({})), b64 = String(o.b64 || ""); if (b64.length < 200 || b64.length > 6e6) return json({ ok: false, err: "img" });
        /* owner 27 Nov («صلحه»): a long or sideways slip comes with zoomed pieces (cut on the phone) so no section is skipped */
        const pcs = (Array.isArray(o.parts) ? o.parts : []).map(x => String(x || "")).filter(x => x.length > 200 && x.length < 3e6).slice(0, 6);
        const IMGS = [{ b64, mime: "image/jpeg" }].concat(pcs.map(x => ({ b64: x, mime: "image/jpeg" })));
        const PRP = pcs.length ? "\nالصورة الأولى هي الإيصال كاملاً، وبعدها " + pcs.length + " مقاطع مكبّرة منه بالترتيب من أوله إلى آخره، بينها تداخل بسيط — اقرأ الأرقام من المقاطع، ولا تحسب القسم الذي ظهر في مقطعين إلا مرة واحدة. قد تكون الصورة مصوّرة بالعرض فاقرأها على اتجاهها." : "";
        const PR = 'هذه صورة إيصال موازنة/تسوية (Reconciliation / Settlement / إجمالي) من جهاز نقاط البيع «مدى» في محل «أسواق طيبة». اقرأ الأرقام بدقة ولا تخمّن.\nأعد JSON فقط: {"isTerminal":true|false,"dateISO":"YYYY-MM-DD","time":"HH:MM","terminalId":"","schemes":[{"name":"mada أو VISA أو MasterCard أو غيرها","count":0,"amount":0}],"refunds":0,"total":0}\nشكل الإيصال: قسم لكل نوع بطاقة بعنوانه (MASTERCARD، mada، VISA، UNIONPAY، AMERICAN EXPRESS، MAESTRO، GCCNET…). داخل كل قسم جدول «mada HOST / خادم مدى» ثم «POS TERMINAL / جهاز نقاط البيع» بنفس الأرقام — خذ «TOTALS / المجاميع» تحت POS TERMINAL لكل قسم مرة واحدة فقط. عبارة «خادم مدى» تظهر داخل قسم فيزا وماستركارد أيضاً، فاسم البطاقة هو عنوان القسم. الأقسام المكتوب تحتها «NO TRANSACTIONS / لا يوجد عمليات» = صفر. اجمع كل الأقسام. تحقق: مجموع amount لكل البطاقات − refunds ≈ total. وإن كان في الصورة أكثر من إيصال بتواريخ أو أوقات مختلفة فاجمع إجمالياتها كلها في total واكتب في time وقت أحدثها. refunds رقم موجب أو 0. إن لم تكن الصورة إيصال موازنة فأعد isTerminal=false.';
        const num = x => { const n = typeof x === "number" ? x : parseFloat(String(x == null ? "" : x).replace(/[,٬\s]/g, "").replace(/٫/g, ".")); return isFinite(n) ? n : null; };
        const chk = r => { const sc = Array.isArray(r && r.schemes) ? r.schemes : []; const sum = sc.reduce((a, y) => a + (num(y.amount) || 0), 0); return num(r && r.total) != null && (!sc.length || Math.abs(sum - (num(r.refunds) || 0) - num(r.total)) <= 0.06); };
        let r = null, ok = false, err = "";
        for (let i = 0; i < 3 && !ok; i++) {
          try { const g = await gemRead(env, PR + PRP + (i ? "\nقراءتك السابقة لم تتطابق مجاميعها؛ أعد القراءة بعناية." : ""), IMGS, true); r = g && (g.json || g.data || g); ok = !!(r && r.isTerminal !== false && chk(r)); await gemStat(env, true); if (r && r.isTerminal === false) break; } catch (e) { err = String(e && e.message || e).slice(0, 100); await gemStat(env, false, err); if (e && e.stop) break; }
        }
        /* the read is compared (server only — the cashier never sees it) with the shift's card sales; a read well under them is redone section by section and the fuller valid read is kept */
        if (r && r.isTerminal !== false && num(r.total) != null && o.sh) {
          try {
            const sw = await env.DB.prepare("SELECT data FROM docs WHERE col='posshift' AND id=?").bind(String(o.sh)).first();
            const ex = sw ? +((JSON.parse(sw.data).exp || {}).card) || 0 : 0;
            if (ex > 0 && num(r.total) < ex * 0.99 - 1) {
              const PR2 = PR + PRP + "\nتنبيه مهم: كثيراً ما يُغفَل قسم في أعلى الإيصال (ماستركارد، أمريكان إكسبريس، ديسكفر) أو في آخره (فيزا، يونيون باي). امشِ على الإيصال من أوله إلى آخره قسماً قسماً، واذكر في schemes كل قسم مجموعه غير صفر باسمه ومبلغه وعدده، وإن كان في الصور أكثر من إيصال فاذكر أقسام كل إيصال.";
              for (let i = 0; i < 2; i++) {
                try { const g = await gemRead(env, PR2, IMGS, true); const r2 = g && (g.json || g.data || g); await gemStat(env, true); if (r2 && r2.isTerminal !== false && chk(r2) && num(r2.total) > num(r.total) + 0.004) { r = r2; ok = true; } if (num(r.total) >= ex * 0.99 - 1) break; } catch (e) { await gemStat(env, false, String(e && e.message || e).slice(0, 100)); if (e && e.stop) break; }
              }
            }
          } catch (e) { }
        }
        if (!r || r.isTerminal === false || num(r.total) == null) return json({ ok: true, read: false, notSlip: !!(r && r.isTerminal === false), err });
        return json({ ok: true, read: true, sure: ok, total: Math.round(num(r.total) * 100) / 100, schemes: (Array.isArray(r.schemes) ? r.schemes : []).map(y => ({ name: String(y.name || "").slice(0, 30), amount: num(y.amount), count: y.count == null ? null : num(y.count) })), refunds: num(r.refunds) || 0, dateISO: /^\d{4}-\d{2}-\d{2}$/.test(String(r.dateISO || "")) ? r.dateISO : null, time: String(r.time || "").slice(0, 5), terminalId: String(r.terminalId || "").slice(0, 20) });
      }
      if (p === "/api/shift/rec" && req.method === "POST") {
        const o = await req.json().catch(() => ({})), id = String(o.id || ""), cash = Math.round((+o.cash) * 100) / 100;
        if (!id || !(cash >= 0 && cash < 1e7)) return json({ ok: false, err: "num" });
        const row = await env.DB.prepare("SELECT data FROM docs WHERE col='posshift' AND id=?").bind(id).first(); if (!row) return json({ ok: false, err: "noshift" });
        const d = JSON.parse(row.data); if (d.st !== "closed") return json({ ok: false, err: "open" }); if (d.rec && !me.owner) return json({ ok: false, err: "done" });
        d.rec = { cash, at: Date.now(), by: me.name || "", closingId: String(o.closingId || "").slice(0, 40) || null }; await writeDoc(env, "posshift", id, d); return json({ ok: true });
      }
      if (p.startsWith("/api/pos/")) return await posApi(env, req, me, p, q);

      if (p === "/api/pinchange" && req.method === "POST") {
        const o = await req.json().catch(() => ({})), c0 = String(o.cur || ""), nw = String(o.nw || ""), now = Date.now();
        const cur = await pinGet(env, me.email); if (!cur) return json({ ok: false, err: "nopin" });
        if (cur.lockUntil && cur.lockUntil > now) return json({ ok: false, err: "locked" });
        if (await pinHash(me.email, c0, cur.salt) !== cur.h) {
          cur.fail = (cur.fail || 0) + 1; const lk = cur.fail >= 5; if (lk) { cur.lockUntil = now + 15 * 60e3; cur.fail = 0; }
          await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)").bind("pin_" + me.email, JSON.stringify(cur)).run();
          return json({ ok: false, err: lk ? "locked" : "wrong" });
        }
        if (!PIN_RULE.test(nw)) return json({ ok: false, err: "rule" });
        const salt = rnd().slice(0, 16), hh = await sha("s|" + cookie(req, "dsid"));
        await env.DB.batch([
          env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)").bind("pin_" + me.email, JSON.stringify({ salt, h: await pinHash(me.email, nw, salt), at: now })),
          env.DB.prepare("UPDATE sess SET pin=0 WHERE email=? AND hh<>?").bind(me.email, hh)
        ]);
        return json({ ok: true });
      }
      if (p === "/api/me") return json({ ok: true, email: me.email, owner: me.owner, uid: me.uid, name: me.name });
      if (p === "/api/slpull" && req.method === "POST") { if (!me.owner) return json({ ok: false }, 403); return json({ ok: true, r: await slPull(env) }); }
      if (p === "/api/users") {
        if (!me.owner) return json({ ok: false }, 403);
        if (req.method === "POST") {
          const o = await req.json(), email = String(o.email || "").trim().toLowerCase();
          if (!/^[^@\s]+@[^@\s]+$/.test(email) || OWNERS.includes(email)) return json({ ok: false, err: "email" }, 400);
          if (o.remove) { await env.DB.batch([env.DB.prepare("DELETE FROM users WHERE email=?").bind(email), env.DB.prepare("DELETE FROM sess WHERE email=?").bind(email)]); return json({ ok: true }); }
          await env.DB.prepare("INSERT OR REPLACE INTO users (email,uid,name,at) VALUES (?,?,?,?)").bind(email, String(o.uid || STAFF_UID), String(o.name || "").slice(0, 80), Date.now()).run();
          return json({ ok: true });
        }
        const r = (await env.DB.prepare("SELECT email,uid,name,at FROM users ORDER BY at").all()).results || [];
        return json({ ok: true, users: r });
      }
      if (p === "/api/db" && req.method === "POST") {
        const o = await req.json();
        try { const rr = await dbOp(env, me, o); try { const s = JSON.stringify(o); if (ctx && (s.includes("slPending") || s.includes("slreq"))) ctx.waitUntil(slNow(env)); if (ctx && s.includes('"add":true') && s.includes("slq")) ctx.waitUntil(posSyncSlq(env)); } catch (e) {} return json({ ok: true, r: rr }); } catch (e) { const m = String(e && e.message || e); return json({ ok: false, code: m === "invalid_argument" ? "invalid_argument" : "unavailable", err: m }, 400); }
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
      if (p === "/api/sample" && req.method === "POST") {
        const o = await req.json().catch(() => null); if (!o || typeof o.prompt !== "string") return json({ ok: false, code: "invalid_argument", err: "prompt" }, 400);
        try { const r = await gemRead(env, o.prompt, Array.isArray(o.images) ? o.images : [], !!o.json); await gemStat(env, true); return json({ ok: true, ...r }); }
        catch (e) { await gemStat(env, false, e && e.message); const c = e && e.code || "unavailable"; return json({ ok: false, code: c, err: String(e && e.message || e).slice(0, 200) }, c === "rate_limited" ? 429 : 502); }
      }
      return json({ ok: false, err: "not_found" }, 404);
    } catch (e) {
      return json({ ok: false, err: String(e && e.message || e) }, 500);
    }
  }
};
