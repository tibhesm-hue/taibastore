const CH = 900 * 1024;
const PART_MAX = 450 * 1024 * 1024;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-Key" };
const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");

// public pages (install page, manifest, icons) live in the GitHub repo folder daftar/ and are served here same-origin
const PUB = "https://tibhesm-hue.github.io/taibastore/daftar";
async function pub(p) {
  if (p.startsWith("/api/")) return null;
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
    env.DB.prepare("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, name TEXT, mime TEXT, size INTEGER, part INTEGER, n INTEGER, sha TEXT, at INTEGER)")
  ]);
  for (const P of [env.IMG1, env.IMG2, env.IMG3]) await P.prepare("CREATE TABLE IF NOT EXISTS blobs (id TEXT NOT NULL, seq INTEGER NOT NULL, b BLOB, PRIMARY KEY (id,seq))").run();
  ready = true;
}
const part = (env, p) => (p === 3 ? env.IMG3 : p === 2 ? env.IMG2 : env.IMG1);
const bytes = b => typeof b === "string" ? Uint8Array.from(atob(b), c => c.charCodeAt(0)) : new Uint8Array(b);

async function authed(req, env) {
  const k = req.headers.get("X-Key") || "";
  if (!k) return false;
  const r = await env.DB.prepare("SELECT v FROM meta WHERE k='wkey'").first();
  if (!r) return false;
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(k))) === r.v;
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const u = new URL(req.url), p = u.pathname, q = u.searchParams;
    const pg = await pub(p); if (pg) return pg;
    try {
      await init(env);
      if (p === "/api/ping") return json({ daftar: "ready", db: 1 });
      if (!(await authed(req, env))) return json({ ok: false, err: "key" }, 403);

      if (p === "/api/docs/put" && req.method === "POST") {
        const o = await req.json(), items = Array.isArray(o.items) ? o.items : [];
        if (items.length > 200) return json({ ok: false, err: "too_many" }, 400);
        const st = [];
        for (const it of items) {
          const col = String(it.col || ""), id = String(it.id || "");
          if (!col || !id) return json({ ok: false, err: "bad_item" }, 400);
          const data = it.data === undefined ? null : JSON.stringify(it.data), v = +it.v || 1, at = +it.at || Date.now();
          st.push(env.DB.prepare("INSERT INTO docs (col,id,data,v,at) VALUES (?,?,?,?,?) ON CONFLICT(col,id) DO UPDATE SET data=excluded.data, v=excluded.v, at=excluded.at WHERE excluded.at >= docs.at").bind(col, id, data, v, at));
        }
        if (st.length) await env.DB.batch(st);
        return json({ ok: true, n: st.length });
      }
      if (p === "/api/docs/list") {
        const col = q.get("col") || "", after = q.get("after") || "", lim = Math.min(1000, +q.get("limit") || 200);
        const r = await env.DB.prepare("SELECT id,data,v,at FROM docs WHERE col=? AND id>? ORDER BY id LIMIT ?").bind(col, after, lim).all();
        return json({ ok: true, docs: (r.results || []).map(x => ({ id: x.id, data: x.data == null ? null : JSON.parse(x.data), v: x.v, at: x.at })) });
      }
      if (p === "/api/docs/get") {
        const r = await env.DB.prepare("SELECT data,v,at FROM docs WHERE col=? AND id=?").bind(q.get("col") || "", q.get("id") || "").first();
        return json(r ? { ok: true, data: r.data == null ? null : JSON.parse(r.data), v: r.v, at: r.at } : { ok: false, err: "none" });
      }
      if (p === "/api/stats") {
        const r = await env.DB.prepare("SELECT col, COUNT(*) n, SUM(LENGTH(data)) bytes, MAX(at) last FROM docs GROUP BY col ORDER BY col").all();
        const a = await env.DB.prepare("SELECT COUNT(*) n, SUM(size) bytes FROM assets").first();
        return json({ ok: true, cols: r.results || [], assets: a });
      }
      if (p === "/api/docs/ids") {
        const r = await env.DB.prepare("SELECT id, v, at FROM docs WHERE col=? ORDER BY id").bind(q.get("col") || "").all();
        return json({ ok: true, ids: (r.results || []).map(x => [x.id, x.v, x.at]) });
      }

      if (p === "/api/asset" && req.method === "PUT") {
        const id = q.get("id") || "";
        if (!id) return json({ ok: false, err: "no_id" }, 400);
        const buf = await req.arrayBuffer(), size = buf.byteLength;
        if (!size) return json({ ok: false, err: "empty" }, 400);
        const sha = hex(await crypto.subtle.digest("SHA-256", buf));
        const old = await env.DB.prepare("SELECT sha,part FROM assets WHERE id=?").bind(id).first();
        if (old && old.sha === sha) return json({ ok: true, same: 1 });
        let pr = await env.DB.prepare("SELECT v FROM meta WHERE k='part'").first(); let pt = pr ? +pr.v : 1;
        const used = await env.DB.prepare("SELECT COALESCE(SUM(size),0) s FROM assets WHERE part=?").bind(pt).first();
        if (used.s + size > PART_MAX && pt < 3) { pt++; await env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES ('part',?)").bind(String(pt)).run(); }
        if (old) await part(env, old.part).prepare("DELETE FROM blobs WHERE id=?").bind(id).run();
        const P = part(env, pt), st = []; let n = 0;
        for (let o = 0; o < size; o += CH) st.push(P.prepare("INSERT OR REPLACE INTO blobs (id,seq,b) VALUES (?,?,?)").bind(id, n++, new Uint8Array(buf.slice(o, o + CH))));
        await P.batch(st);
        await env.DB.prepare("INSERT OR REPLACE INTO assets (id,name,mime,size,part,n,sha,at) VALUES (?,?,?,?,?,?,?,?)").bind(id, q.get("name") || "", q.get("mime") || "application/octet-stream", size, pt, n, sha, Date.now()).run();
        return json({ ok: true, size, part: pt, sha });
      }
      if (p === "/api/asset" && req.method === "GET") {
        const a = await env.DB.prepare("SELECT * FROM assets WHERE id=?").bind(q.get("id") || "").first();
        if (!a) return json({ ok: false, err: "none" }, 404);
        const r = await part(env, a.part).prepare("SELECT b FROM blobs WHERE id=? ORDER BY seq").bind(a.id).all();
        const parts = (r.results || []).map(x => bytes(x.b));
        return new Response(new Blob(parts), { headers: { ...cors, "Content-Type": a.mime, "Cache-Control": "private, max-age=86400" } });
      }
      if (p === "/api/assets/list") {
        const r = await env.DB.prepare("SELECT id,name,mime,size,part,sha,at FROM assets ORDER BY id").all();
        return json({ ok: true, assets: r.results || [] });
      }
      return json({ ok: false, err: "not_found" }, 404);
    } catch (e) {
      return json({ ok: false, err: String(e && e.message || e) }, 500);
    }
  }
};
