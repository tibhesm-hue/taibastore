// Daftar jobs worker: Smart Life automation that the old Claude scheduled tasks did, now on the owner's own Cloudflare.
// Tokens live only in the D1 meta table (sl_shop, sl_del). Writing to Smart Life (price posting) runs only when meta post_on = 1.
const SL_API = "https://smarterp.top/api/v3";
const SL_NAMES = {
  s: { "10": "مالك", "13": "أحمد", "11": "المدير", "12": "عاصف", "9": "فوزي", "8": "كاشير 3", "1": "المحاسب العام", "14": "المحاسب العام" },
  d: { "3": "أحمد", "2": "عاصف", "1": "المدير" }
};
const num = x => { const n = parseFloat(x); return isFinite(n) ? n : 0; };
const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const r4 = x => Math.round((x + Number.EPSILON) * 10000) / 10000;
const rday = off => new Date(Date.now() + 3 * 3600e3 + off * 864e5).toISOString().slice(0, 10);
const slName = (acct, x) => SL_NAMES[acct][String(x.created_by)] || ("مستخدم " + x.created_by);
const zs = c => String(c == null ? "" : c).trim().replace(/^0+/, "");
const msOf = d => Date.parse(String(d).replace(" ", "T") + "+03:00");
const B = { n: 0, cap: 44 };
const left = () => B.cap - B.n;
const hdrs = tok => ({ Authorization: tok, "User-Agent": "curl/8.5.0" });

async function smGet(tok, path) {
  B.n++;
  const r = await fetch(SL_API + path, { headers: hdrs(tok) });
  if (!r.ok) throw new Error("http " + r.status);
  const j = await r.json();
  if (!j || j.success !== true) throw new Error("bad response");
  return j;
}
async function smPost(tok, path, body) {
  B.n++;
  const r = await fetch(SL_API + path, { method: "POST", headers: { ...hdrs(tok), "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("http " + r.status);
  const j = await r.json().catch(() => null);
  if (!j || j.success === false) throw new Error("rejected " + String((j && j.message) || "").slice(0, 80));
  return j;
}
async function smProd(tok, id) {
  const j = await smGet(tok, "/products/product/" + id);
  const p = j.data;
  if (!p || String(p.id) !== String(id)) throw new Error("no product " + id);
  return p;
}

async function writeDoc(env, col, id, data) {
  const at = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO docs (col,id,data,v,at) VALUES (?,?,?,1,?) ON CONFLICT(col,id) DO UPDATE SET data=excluded.data, v=docs.v+1, at=excluded.at").bind(col, id, JSON.stringify(data), at),
    env.DB.prepare("DELETE FROM dels WHERE col=? AND id=?").bind(col, id)
  ]);
  return at;
}
async function getDoc(env, col, id) {
  const r = await env.DB.prepare("SELECT data,v FROM docs WHERE col=? AND id=?").bind(col, id).first();
  return r ? { d: JSON.parse(r.data), v: r.v } : null;
}
async function casDoc(env, col, id, data, v) {
  const r = await env.DB.prepare("UPDATE docs SET data=?, v=v+1, at=? WHERE col=? AND id=? AND v=?").bind(JSON.stringify(data), Date.now(), col, id, v).run();
  return !!(r.meta && r.meta.changes > 0);
}
// read-modify-write with a version check; fn returns the new doc, or false to leave it alone
async function patchDoc(env, col, id, fn) {
  for (let i = 0; i < 4; i++) {
    const c = await getDoc(env, col, id);
    if (!c) return null;
    const nd = fn(c.d);
    if (nd === false) return null;
    if (await casDoc(env, col, id, nd, c.v)) return nd;
  }
  return null;
}
async function alertAdd(env, t) {
  for (let i = 0; i < 4; i++) {
    const c = await getDoc(env, "diag", "alerts");
    const items = ((c && c.d.items) || []).slice();
    items.unshift({ at: Date.now(), t: String(t).slice(0, 600) });
    const nd = { ...(c ? c.d : {}), items: items.slice(0, 200) };
    if (!c) { await writeDoc(env, "diag", "alerts", nd); return; }
    if (await casDoc(env, "diag", "alerts", nd, c.v)) return;
  }
}
async function metaGet(env, ks) {
  const m = {};
  const r = await env.DB.prepare("SELECT k,v FROM meta WHERE k IN (" + ks.map(() => "?").join(",") + ")").bind(...ks).all();
  for (const x of (r.results || [])) m[x.k] = x.v;
  return m;
}
const metaSet = (env, k, v) => env.DB.prepare("INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)").bind(k, v).run();
const metaDel = (env, k) => env.DB.prepare("DELETE FROM meta WHERE k=?").bind(k).run();

async function slFetchAll(token, acct, minDay, maxPages) {
  const seen = new Map(); let off = 0, pages = 0;
  while (pages < maxPages && left() > 3) {
    const j = await smGet(token, "/sales/sales_list?sort_by=id&sort_type=desc&limit=300&offset=" + off + (acct === "s" ? "&warehouse_id=1" : ""));
    if (!Array.isArray(j.data)) throw new Error(acct + " bad list");
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
  return { rows: [...seen.values()], pages, cover: minDay };
}

// ---------------- recent invoices (slrecent) and driver notes (slday/drv-<day>) ----------------
const cleanNote = n => String(n == null ? "" : n).replace(/&Tab;/g, "").replace(/\s+/g, "").replace(/[٠-٩]/g, ch => String(ch.charCodeAt(0) - 1632));
const itemRows = x => (x.items || []).map(i => [String(i.product_name || ""), String(i.product_code || ""), num(i.quantity), num(i.unit_price), num(i.total)]);
async function jRecent(env, m) {
  const out = {};
  for (const [acct, key, tok] of [["s", "shop", m.sl_shop], ["d", "del", m.sl_del]]) {
    if (left() < 4) return "budget";
    const j = await smGet(tok, "/sales/sales_list?sort_by=id&sort_type=desc&limit=40&offset=0" + (acct === "s" ? "&warehouse_id=1" : ""));
    const L = (j.data || []).filter(x => acct !== "s" || String(x.warehouse_id) === "1");
    const sales = L.map(x => ({ by: slName(acct, x), cust: String(x.customer || ""), date: String(x.date), id: Number(x.id), items: itemRows(x), paid: r2(num(x.paid)), ref: String(x.reference_no), total: r2(num(x.grand_total)) }));
    await writeDoc(env, "slrecent", key, { at: Date.now(), by: "server", sales });
    out[key] = sales.length;
  }
  // driver notes of the delivery account, today and yesterday
  if (left() >= 4) {
    const yday = rday(-1), today = rday(0);
    const F = await slFetchAll(m.sl_del, "d", yday, 3);
    for (const day of [yday, today]) {
      const mp = {};
      for (const x of F.rows) { if (String(x.date).slice(0, 10) !== day) continue; const n = cleanNote(x.notes); if (n) mp[String(x.reference_no)] = n; }
      await writeDoc(env, "slday", "drv-" + day, { m: mp, at: Date.now(), by: "server" });
    }
    out.drv = F.rows.length;
  }
  return out;
}

// ---------------- customer balances (slcust/main) ----------------
async function jBal(env, m) {
  const doc = { at: Date.now(), by: "server" };
  for (const [key, tok] of [["shop", m.sl_shop], ["del", m.sl_del]]) {
    const rows = []; let off = 0;
    for (let p = 0; p < 6 && left() > 2; p++) {
      const j = await smGet(tok, "/clients/clients_list?limit=100&offset=" + off);
      const L = j.data || []; if (!L.length) break;
      for (const c of L) { const b = r2(num(c.current_balance)); if (b !== 0) rows.push([String(c.name || ""), b]); }
      off += L.length;
      if (off >= num(j.total_count)) break;
    }
    doc[key] = rows;
  }
  await writeDoc(env, "slcust", "main", doc);
  return [doc.shop.length, doc.del.length];
}

// ---------------- shelf stock (stockq/main) ----------------
async function jStock(env, m) {
  const st = await getDoc(env, "stock", "main");
  const items = (st && st.d && st.d.items) || {};
  const keys = Object.keys(items);
  if (!keys.length) return "no stock";
  const old = ((await getDoc(env, "stockq", "main")) || { d: {} }).d.q || {};
  const from = {}, prev = {};
  let minFrom = Date.now();
  for (const k of keys) {
    const it = items[k], e = old[k], at = num(it.at);
    if (!at) continue;
    if (Array.isArray(e) && e[0] === 0 && e[1] === at) { prev[k] = -num(e[2]); from[k] = num(e[3]) || at; } else { prev[k] = 0; from[k] = at; }
    if (from[k] < minFrom) minFrom = from[k];
  }
  const minDay = new Date(minFrom + 3 * 3600e3).toISOString().slice(0, 10);
  const earliest = rday(-5);
  const useDay = minDay < earliest ? earliest : minDay;
  if (left() < 10) return "budget";
  const t0 = Date.now();
  const S = await slFetchAll(m.sl_shop, "s", useDay, 14);
  const D = await slFetchAll(m.sl_del, "d", useDay, 14);
  const cover = Date.parse(useDay + "T00:00:00+03:00");
  const sold = {}, bcs = {};
  for (const k of keys) { const z = zs(k); if (from[k] != null) (bcs[z] = bcs[z] || []).push(k); }
  for (const x of S.rows.concat(D.rows)) {
    const g = num(x.grand_total), sg = g < 0 ? -1 : 1, ms = msOf(x.date);
    if (!isFinite(ms) || ms > t0) continue;
    for (const i of (x.items || [])) {
      const ks = bcs[zs(i.product_code)]; if (!ks) continue;
      for (const k of ks) if (ms > from[k]) sold[k] = (sold[k] || 0) + sg * Math.abs(num(i.quantity));
    }
  }
  const q = {}; let skipped = 0;
  for (const k of keys) {
    if (from[k] == null) continue;
    if (from[k] < cover) { skipped++; if (old[k]) q[k] = old[k]; continue; }
    q[k] = [0, num(items[k].at), -r4(prev[k] + (sold[k] || 0)), t0];
  }
  await writeDoc(env, "stockq", "main", { q, at: Date.now(), by: "server" });
  return { n: keys.length, skipped };
}

// ---------------- catalogue (slcat) refreshed in pages ----------------
async function jCat(env, m, fl) {
  const meta = await getDoc(env, "slcat", "meta");
  const job = await metaGet(env, ["catjob"]);
  let st = job.catjob ? JSON.parse(job.catjob) : null;
  const hr = new Date(Date.now() + 3 * 3600e3).getUTCHours();
  const stale = !meta || Date.now() - num(meta.d.at) > 20 * 3600e3;
  if (!st) {
    if (!(fl.cat_force === "1" || (hr >= 4 && stale))) return "idle";
    st = { s: { off: 0, done: false, k: 0 }, d: { off: 0, done: false, k: 0 }, at: Date.now() };
    await metaDel(env, "cat_force");
  }
  let pages = 0;
  for (const [a, tok] of [["s", m.sl_shop], ["d", m.sl_del]]) {
    const S = st[a];
    while (!S.done && left() > 1 && pages < 24) {
      const j = await smGet(tok, "/products/get_products_list?limit=500&offset=" + S.off);
      const L = j.data || [];
      await metaSet(env, "cj-" + a + "-" + S.k, JSON.stringify(L.map(p => [String(p.id), String(p.code), String(p.name || ""), r4(num(p.price)), r4(num(p.cost))])));
      S.k++; S.off += L.length; pages++;
      if (!L.length || S.off >= num(j.total_count)) S.done = true;
    }
  }
  if (!(st.s.done && st.d.done)) { await metaSet(env, "catjob", JSON.stringify(st)); return "progress " + st.s.off + "/" + st.d.off; }
  // merge both accounts by barcode
  const pg = {}; for (const x of ((await env.DB.prepare("SELECT k,v FROM meta WHERE k LIKE 'cj-%'").all()).results || [])) pg[x.k] = x.v;
  const load = a => { const rows = []; for (let k = 0; k < st[a].k; k++) { if (pg["cj-" + a + "-" + k] == null) throw new Error("catalogue page missing " + a + k); for (const r of JSON.parse(pg["cj-" + a + "-" + k])) rows.push(r); } return rows; };
  const SR = load("s"), DR = load("d");
  const idx = new Map(), out = [];
  for (const r of SR) { const z = zs(r[1]); if (idx.has(z)) continue; const row = [r[1], r[2], r[3], r[4], Number(r[0]), 0, null, null]; idx.set(z, row); out.push(row); }
  for (const r of DR) {
    const z = zs(r[1]); const row = idx.get(z);
    if (row) { if (!row[5]) { row[5] = Number(r[0]); row[6] = r[3]; row[7] = r[4]; } }
    else { const nr = [r[1], r[2], null, null, 0, Number(r[0]), r[3], r[4]]; idx.set(z, nr); out.push(nr); }
  }
  const chunks = Math.ceil(out.length / 500);
  const at = Date.now(), up = "INSERT INTO docs (col,id,data,v,at) VALUES ('slcat',?,?,1,?) ON CONFLICT(col,id) DO UPDATE SET data=excluded.data, v=docs.v+1, at=excluded.at";
  const stm = [];
  for (let c = 0; c < chunks; c++) stm.push(env.DB.prepare(up).bind("c" + String(c).padStart(2, "0"), JSON.stringify({ rows: out.slice(c * 500, c * 500 + 500) }), at));
  stm.push(env.DB.prepare("DELETE FROM docs WHERE col='slcat' AND id LIKE 'c%' AND id>?").bind("c" + String(chunks - 1).padStart(2, "0")));
  stm.push(env.DB.prepare(up).bind("meta", JSON.stringify({ at, n: out.length, chunks, cols: ["code", "name", "price", "cost", "shopId", "delId", "delPrice", "delCost"], by: "server" }), at));
  stm.push(env.DB.prepare("DELETE FROM meta WHERE k LIKE 'cj-%' OR k='catjob'"));
  await env.DB.batch(stm);
  return "done " + out.length;
}

// ---------------- price posting (old step 11) ----------------
// Each approved request in slq (status pending) is written to Smart Life exactly as approved: cost and price from slqok items,
// four fields per update (name, code, price, cost), verified by a second read, rolled back on damage.
async function applyAcct(tok, id, code, want, oldv, dry) {
  const p = await smProd(tok, id);
  if (zs(p.code) !== zs(code)) return { r: "code mismatch" };
  const cur = { price: num(p.price), cost: num(p.cost), name: String(p.name || "") };
  const chg = {};
  for (const f of ["price", "cost"]) {
    if (want[f] == null) continue;
    if (Math.abs(cur[f] - want[f]) <= 0.01) continue;
    if (oldv[f] != null && Math.abs(cur[f] - oldv[f]) > 0.01) return { r: "stale: " + f + " now " + cur[f] + " was " + oldv[f], stale: true };
    chg[f] = want[f];
  }
  const nameChg = want.name && want.name !== cur.name;
  if (!Object.keys(chg).length && !nameChg) return { r: "already", v: cur };
  if (dry) return { r: "would", chg, nameChg: !!nameChg };
  const body = { name: nameChg ? want.name : cur.name, code: String(p.code), price: chg.price != null ? chg.price : cur.price, cost: chg.cost != null ? chg.cost : cur.cost };
  await smPost(tok, "/products/update/" + id, body);
  const q = await smProd(tok, id);
  const good = zs(q.code) === zs(p.code) && String(q.name) === body.name && Math.abs(num(q.price) - body.price) <= 0.01 && Math.abs(num(q.cost) - body.cost) <= 0.01;
  if (good) return { r: "ok", v: { name: String(q.name), price: num(q.price), cost: num(q.cost) }, tax: String(q.tax_method) !== String(p.tax_method) };
  if (String(q.name).trim() === "no_name" || zs(q.code) !== zs(p.code)) {
    try { await smPost(tok, "/products/update/" + id, { name: cur.name, code: String(p.code), price: cur.price, cost: cur.cost }); } catch (e) { }
    return { r: "verify failed, rolled back", bad: true };
  }
  return { r: "verify failed", bad: true };
}
function sanity(it) {
  if (!it.code) return "no code";
  const op = num(it.oldPrice), np = it.newPrice != null ? num(it.newPrice) : null;
  if (np != null && !(np > 0)) return "bad price";
  if (np != null && op > 0 && np > 5 * op) return "price over 5x";
  if (it.newCost != null && !(num(it.newCost) >= 0)) return "bad cost";
  if (it.offer && it.offer.price != null) { const o = num(it.offer.price); if (!(o > 0) || (np != null && o > np)) return "bad offer"; }
  if (it.newName != null) { const n = String(it.newName).trim(); if (!n || n.length > 120) return "bad name"; }
  return "";
}
async function tailHas(tok, code) {
  const j0 = await smGet(tok, "/products/get_products_list?limit=1&offset=0");
  const tot = num(j0.total_count); if (!tot) return null;
  const j = await smGet(tok, "/products/get_products_list?limit=100&offset=" + Math.max(0, tot - 100));
  const f = (j.data || []).find(p => zs(p.code) === zs(code));
  return f ? String(f.id) : null;
}
async function addAcct(tok, it, price, cost, name) {
  await smPost(tok, "/products/add", { name, code: String(it.code), price, cost });
  const id = await tailHas(tok, it.code);
  if (!id) return { r: "added but not found by code" };
  const q = await smProd(tok, id);
  const ok = zs(q.code) === zs(it.code) && String(q.name) === name && Math.abs(num(q.price) - price) <= 0.01 && Math.abs(num(q.cost) - cost) <= 0.01;
  return ok ? { r: "ok", id, v: { name, price, cost } } : { r: "added, verify failed", id };
}
async function catIndex(env) {
  const meta = await getDoc(env, "slcat", "meta");
  if (!meta || Date.now() - num(meta.d.at) > 26 * 3600e3) return null;
  const idx = new Map();
  for (let c = 0; c < num(meta.d.chunks); c++) { const d = await getDoc(env, "slcat", "c" + String(c).padStart(2, "0")); if (d) for (const r of d.d.rows) idx.set(zs(r[0]), r); }
  return idx;
}
async function jPost(env, m, fl) {
  const dry = fl.post_dry === "1";
  if (!dry && fl.post_on !== "1") return "off";
  const rows = ((await env.DB.prepare("SELECT id,data,v FROM docs WHERE col='slq' ORDER BY at").all()).results || []).map(r => ({ id: r.id, d: JSON.parse(r.data), v: r.v }));
  const now = Date.now(), res = { docs: 0, items: 0, ok: 0, fail: 0 }, dryOut = [];
  // cashier finished reviewing an invoice -> one alert line
  if (!dry) for (const r of rows) {
    const d = r.d; if (!d.reviewed || d.notified) continue;
    const sib = rows.filter(x => x.id !== r.id && x.d.invId === d.invId && !x.d.reviewed && x.d.status !== "cancelled" && x.d.status !== "rejected");
    const ch = sib.reduce((s, x) => s + ((x.d.items || []).length), 0);
    const aw = sib.filter(x => x.d.status === "await").reduce((s, x) => s + (x.d.items || []).length, 0);
    const pe = sib.filter(x => x.d.status === "pending" || x.d.status === "running").reduce((s, x) => s + (x.d.items || []).length, 0);
    await alertAdd(env, "✅ خلّص " + (d.cashier || "") + " مراجعة فاتورة " + (d.sup || "") + " (" + (d.n || 0) + " صنف): تغيّر سعره " + ch + " صنف" + (aw ? "، 🖊️ " + aw + " تنتظر اعتمادك" : "") + (pe ? "، ⏳ " + pe + " تُنفّذ" : "") + ((d.skip && d.skip.length) ? "، 🚫 ما نبيعه " + d.skip.length : ""));
    await patchDoc(env, "slq", r.id, x => (x.notified ? false : { ...x, notified: true }));
  }
  const cand = rows.filter(r => !r.d.reviewed && (r.d.status === "pending" || (r.d.status === "running" && now - num(r.d.runAt) > 7200e3)));
  let idx = null, idxTried = false;
  const applied = [];
  for (const r of cand) {
    if (left() < 7) break;
    const d0 = r.d;
    const ok = await getDoc(env, "slqok", r.id);
    let items;
    if (ok && Array.isArray(ok.d.items)) items = ok.d.items;
    else if (num(d0.approvedAt) && num(d0.approvedAt) < 1792777400000) items = d0.items || [];
    else {
      if (!dry) { await patchDoc(env, "slq", r.id, x => ({ ...x, status: "await", note: "رجع للاعتماد: ما وُجد سجل اعتماد" })); await alertAdd(env, "⚠️ طلب أسعار (" + (d0.cashier || "") + "، " + (d0.items || []).length + " صنف) صار «معتمد» بدون اعتمادك — رجّعته لبطاقة الاعتماد، راجعه"); }
      continue;
    }
    items = items.filter(i => !i.photoOnly);
    if (!items.length) continue;
    if (!dry) {
      let got = false;
      await patchDoc(env, "slq", r.id, x => { if (!(x.status === "pending" || (x.status === "running" && now - num(x.runAt) > 7200e3))) return false; got = true; return { ...x, status: "running", runAt: Date.now() }; });
      if (!got) continue;
    }
    res.docs++;
    const done = {}; for (const e of (d0.res || [])) if (e && e.code != null && e.fin) done[String(e.code)] = e;
    const R = [], names = []; let budgetStop = false;
    for (const it of items) {
      const prior = done[String(it.code)];
      if (prior) { R.push(prior); continue; }
      const adds = !!it.add;
      if (left() < (adds ? 12 : 7)) { budgetStop = true; break; }
      const e = { code: it.code, shop: "-", del: "-", fin: true };
      const bad = sanity(it);
      if (bad) { e.shop = e.del = "invalid: " + bad; R.push(e); res.items++; res.fail++; continue; }
      const offerP = it.offer && it.offer.price != null ? num(it.offer.price) : null;
      const price = offerP != null ? offerP : (it.newPrice != null ? num(it.newPrice) : null);
      const cost = it.offerOnly ? null : (it.newCost != null ? num(it.newCost) : null);
      const name = it.newName ? String(it.newName).trim() : null;
      try {
        if (adds) {
          if (!idxTried) { idx = await catIndex(env); idxTried = true; }
          if (!idx) { e.shop = e.del = "catalogue not fresh, retry later"; e.fin = false; R.push(e); continue; }
          if (price == null || cost == null || !name) { e.shop = e.del = "invalid: add needs name, price, cost"; R.push(e); res.fail++; continue; }
          const row = idx.get(zs(it.code));
          for (const [k, tok, pos] of [["shop", m.sl_shop, 4], ["del", m.sl_del, 5]]) {
            if (row && row[pos]) { e[k] = "exists"; continue; }
            if (dry) { e[k] = "would add"; continue; }
            if (it.addTried && it.addTried[k]) { const f = await tailHas(tok, it.code); if (f) { e[k] = "exists"; continue; } }
            await patchDoc(env, "slq", r.id, x => ({ ...x, items: (x.items || []).map(y => (y.code === it.code ? { ...y, addTried: { ...(y.addTried || {}), [k]: 1 } } : y)) }));
            const a = await addAcct(tok, it, price, cost, name);
            e[k] = a.r; if (a.id) e[k === "shop" ? "sid" : "did"] = a.id;
          }
        } else {
          const want = { price, cost, name };
          if (!it.sid && !it.did) { e.shop = e.del = "no product id"; R.push(e); res.items++; res.fail++; continue; }
          let stale = false;
          if (it.sid) {
            const a = await applyAcct(m.sl_shop, it.sid, it.code, want, { price: it.oldPrice != null ? num(it.oldPrice) : null, cost: it.oldCost != null ? num(it.oldCost) : null }, dry);
            e.shop = a.r; if (a.stale) stale = true; if (a.v && !dry) applied.push({ code: it.code, k: "shop", v: a.v });
            if (a.tax) await alertAdd(env, "⚠️ تغيّرت طريقة الضريبة لصنف " + it.code + " بعد التحديث في سمارت (المحل) — راجعه");
            if (a.bad) await alertAdd(env, "⚠️ تحديث " + it.code + " في المحل لم يتحقق: " + a.r);
          }
          if (it.did) {
            if (stale) e.del = "skipped (stale in shop)";
            else {
              const a = await applyAcct(m.sl_del, it.did, it.code, want, { price: it.oldDPrice != null ? num(it.oldDPrice) : null, cost: it.oldDCost != null ? num(it.oldDCost) : null }, dry);
              e.del = a.r; if (a.v && !dry) applied.push({ code: it.code, k: "del", v: a.v });
              if (a.bad) await alertAdd(env, "⚠️ تحديث " + it.code + " في التوصيل لم يتحقق: " + a.r);
            }
          }
          if (stale) await alertAdd(env, "⚠️ ما نفّذت سعر " + (it.name || it.code) + " (طلب " + (d0.cashier || "") + "): سعره في سمارت لايف تغيّر بعد الطلب — راجعه");
        }
      } catch (err) { const em = "error: " + String(err && err.message || err).slice(0, 80); if (e.shop === "-" && (adds || it.sid)) e.shop = em; if (e.del === "-" && (adds || it.did)) e.del = em; e.fin = !/http|rejected|bad response/.test(String(err && err.message)); }
      R.push(e); res.items++;
      const good = x => x === "ok" || x === "already" || x === "-" || x === "exists";
      if (good(e.shop) && good(e.del)) res.ok++; else res.fail++;
      if (dry) dryOut.push({ code: it.code, shop: e.shop, del: e.del });
    }
    if (dry) continue;
    const good = x => x === "ok" || x === "already" || x === "-" || x === "exists";
    const allOk = !budgetStop && R.every(e => good(e.shop) && good(e.del));
    const anyOk = R.some(e => e.shop === "ok" || e.del === "ok");
    const none = R.length && R.every(e => !good(e.shop) && !good(e.del));
    const nOk = R.filter(e => good(e.shop) && good(e.del)).length;
    if (budgetStop) { await patchDoc(env, "slq", r.id, x => { const y = { ...x, status: "pending", res: R }; delete y.runAt; return y; }); continue; }
    const status = allOk ? "done" : none ? "failed" : "partial";
    const allAlready = allOk && !anyOk && R.some(e => e.shop === "already" || e.del === "already");
    const bads = R.filter(e => !(good(e.shop) && good(e.del))).map(e => e.code + ": " + (good(e.shop) ? e.del : e.shop));
    const result = (allAlready ? "✅ مطبّق من قبل — " : "") + "نُفّذ " + nOk + " من " + R.length + (bads.length ? "؛ لم يُنفّذ: " + bads.slice(0, 5).join(" | ") : "");
    await patchDoc(env, "slq", r.id, x => { const y = { ...x, status, doneAt: Date.now(), result, res: R.map(e => ({ code: e.code, shop: e.shop, del: e.del, sid: e.sid, did: e.did })), page: "pending" }; if (allAlready) y.already = true; delete y.runAt; return y; });
    await alertAdd(env, "💲 " + (d0.cashier || "") + ": " + nOk + " من " + R.length + " صنف نُفّذ في سمارت لايف" + (d0.sup ? " (فاتورة " + d0.sup + ")" : "") + (bads.length ? " — فشل: " + bads.slice(0, 3).join(" | ") : ""));
  }
  if (applied.length) {
    const meta = await getDoc(env, "slcat", "meta");
    if (meta) {
      const ix = new Map(applied.map(a => [zs(a.code), 0]));
      for (let c = 0; c < num(meta.d.chunks); c++) {
        const id = "c" + String(c).padStart(2, "0"), d = await getDoc(env, "slcat", id); if (!d) continue;
        let ch = false;
        for (const row of d.d.rows) {
          if (!ix.has(zs(row[0]))) continue;
          for (const a of applied.filter(a => zs(a.code) === zs(row[0]))) {
            if (a.k === "shop") { row[1] = a.v.name; row[2] = a.v.price; row[3] = a.v.cost; } else { if (!row[4]) row[1] = row[1] || a.v.name; row[6] = a.v.price; row[7] = a.v.cost; }
            ch = true;
          }
        }
        if (ch) await casDoc(env, "slcat", id, d.d, d.v);
      }
    }
  }
  if (dry) { await metaSet(env, "postdry", JSON.stringify({ at: now, cand: cand.length, out: dryOut }).slice(0, 6000)); await metaDel(env, "post_dry"); }
  return res;
}

// ---- hourly gate: a job runs at most once per N minutes ----
async function due(env, key, mins) {
  const r = await env.DB.prepare("SELECT v FROM meta WHERE k=?").bind("due_" + key).first();
  if (r && Date.now() - num(r.v) < mins * 60e3) return false;
  await metaSet(env, "due_" + key, String(Date.now()));
  return true;
}
const normAr = s => String(s == null ? "" : s).replace(/[ً-ْـ\s]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");

// ---- last cost/price the shop itself entered per barcode (costhist/main), built from slq; internal only ----
async function jCost(env) {
  if (!(await due(env, "cost", 55))) return "wait";
  const c = await getDoc(env, "costhist", "main"); if (!c) return "no costhist";
  const since = num(c.d.at), items = { ...(c.d.items || {}) };
  const rows = ((await env.DB.prepare("SELECT data FROM docs WHERE col='slq' AND at>? ORDER BY at LIMIT 400").bind(since).all()).results || []).map(r => JSON.parse(r.data));
  let maxAt = since, n = 0;
  for (const d of rows.sort((a, b) => num(a.at) - num(b.at))) {
    if (d.status !== "done" && d.status !== "pending") continue;
    if (num(d.at) > maxAt) maxAt = num(d.at);
    const bad = new Set(); for (const e of (d.res || [])) if (e && e.code != null && /^(invalid|stale)/.test(String(e.shop) + "|" + String(e.del))) bad.add(String(e.code));
    for (const it of (d.items || [])) {
      const code = String(it.code == null ? "" : it.code).trim();
      if (!code || /^تالف/.test(code) || it.photoOnly || it.offerOnly || bad.has(code)) continue;
      const old = items[code] || [null, null, 0];
      const nc = it.newCost != null ? num(it.newCost) : old[0], np = it.newPrice != null ? num(it.newPrice) : old[1];
      if (nc == null && np == null) continue;
      items[code] = [nc, np, Math.floor(num(d.at) / 1000)]; n++;
    }
  }
  if (!n && maxAt === since) return "same";
  const ok = await patchDoc(env, "costhist", "main", x => ({ ...x, items, at: maxAt }));
  return ok ? "updated " + n : "conflict";
}

// ---- carton sold -> pieces: keeps the carton base/current quantities in stockq/car ----
async function jCar(env, m) {
  if (!(await due(env, "car", 55))) return "wait";
  const c = await getDoc(env, "stockq", "car"); if (!c || !Array.isArray(c.d.pairs) || !c.d.pairs.length) return "no pairs";
  const st = await getDoc(env, "stock", "main"); const sitems = (st && st.d.items) || {};
  const q = { ...(c.d.q || {}) }, pairs = c.d.pairs;
  const pos = num((await metaGet(env, ["carpos"])).carpos);
  let ch = 0, seen = 0;
  for (let k = 0; k < pairs.length && left() > 8 && seen < 14; k++) {
    const p = pairs[(pos + k) % pairs.length]; seen++;
    try {
      const pr = await smProd(m.sl_shop, p.sid), cur = num(pr.quantity), now = Date.now();
      const e = q[p.pc], cnt = sitems[p.pc] ? num(sitems[p.pc].at) : 0;
      const nv = (!e || cnt > num(e[1])) ? [cur, now, cur, now] : [e[0], e[1], cur, now];
      if (!e || e[2] !== cur || nv[0] !== e[0]) ch++;
      q[p.pc] = nv;
    } catch (err) { /* skip this pair */ }
  }
  await metaSet(env, "carpos", String((pos + seen) % pairs.length));
  if (!ch) return "same (" + seen + ")";
  const ok = await patchDoc(env, "stockq", "car", x => ({ ...x, q: { ...(x.q || {}), ...q }, at: Date.now() }));
  return ok ? "updated " + ch : "conflict";
}

// ---- tax method «شامل» (tax_method 0) for items added in the last 36h; writes to Smart Life, so only when post_on = 1 ----
async function jTax(env, m, fl) {
  if (fl.post_on !== "1") return "off";
  if (!(await due(env, "tax", 55))) return "wait";
  const doneRaw = (await metaGet(env, ["taxdone"])).taxdone; const done = new Set(doneRaw ? JSON.parse(doneRaw) : []);
  const rows = ((await env.DB.prepare("SELECT id,data FROM docs WHERE col='slq' AND at>? ORDER BY at").bind(Date.now() - 36 * 3600e3).all()).results || []).map(r => JSON.parse(r.data));
  let fixed = 0, checked = 0;
  for (const d of rows) {
    if (d.status !== "done") continue;
    for (const it of (d.items || [])) {
      if (!it.add) continue;
      const ids = [];
      for (const e of (d.res || [])) if (e && String(e.code) === String(it.code)) { if (e.sid) ids.push(["shop", String(e.sid)]); if (e.did) ids.push(["del", String(e.did)]); }
      for (const [k, id] of ids) {
        const key = k + ":" + id; if (done.has(key) || left() < 8) continue;
        const tok = k === "shop" ? m.sl_shop : m.sl_del;
        try {
          const p = await smProd(tok, id); checked++;
          if (String(p.tax_method) === "1") {
            await smPost(tok, "/products/update/" + id, { name: p.name, code: p.code, price: p.price, cost: p.cost, tax_method: 0 });
            const v = await smProd(tok, id);
            if (String(v.tax_method) !== "0" || v.name !== p.name || String(v.code) !== String(p.code) || num(v.price) !== num(p.price) || num(v.cost) !== num(p.cost)) {
              await smPost(tok, "/products/update/" + id, { name: p.name, code: p.code, price: p.price, cost: p.cost, tax_method: num(p.tax_method) });
              await alertAdd(env, "⚠️ ضبط الضريبة: تغيّر " + (it.name || it.code) + " — راجعه");
            } else fixed++;
          }
          done.add(key);
        } catch (err) { /* retry next hour */ }
      }
    }
  }
  await metaSet(env, "taxdone", JSON.stringify([...done].slice(-400)));
  return "checked " + checked + " fixed " + fixed;
}

// ---- customer credit settlements (custpay) -> Smart Life catch receipt. Writes money documents: only when bond_on = 1 (dry run with bond_dry = 1) ----
async function jBond(env, m) {
  const f = await metaGet(env, ["bond_on", "bond_dry", "bond_lock"]);
  const dry = f.bond_dry === "1";
  if (!dry && f.bond_on !== "1") return "off";
  if (num(f.bond_lock) > Date.now()) return "locked";
  const rows = ((await env.DB.prepare("SELECT id,data FROM docs WHERE col='custpay'").all()).results || []).map(r => ({ id: r.id, d: JSON.parse(r.data) }));
  // deleted settlements that already have a bond: alert once, never touch Smart Life
  if (!dry) for (const r of rows) { const d = r.d; if (d.deleted && d.slBond && !d.slBondDelNotified) { await alertAdd(env, "⚠️ دفتر طيبة: سداد " + (d.cust || "") + " " + num(d.amount) + " ريال انحذف من الدفتر وله سند قبض رقم " + d.slBond.bond_number + " في سمارت لايف — عدّله أو احذفه هناك بنفسك."); await patchDoc(env, "custpay", r.id, x => ({ ...x, slBondDelNotified: Date.now() })); } }
  const todo = rows.filter(r => !r.d.deleted && !r.d.slBond && !r.d.slBondErr && num(r.d.amount) > 0 && String(r.d.cust || "").trim());
  if (!todo.length) { if (dry) { await metaSet(env, "bonddry", JSON.stringify({ at: Date.now(), n: 0 })); await metaDel(env, "bond_dry"); } return "none"; }
  if (left() < 8) return "budget";
  if (!dry) await metaSet(env, "bond_lock", String(Date.now() + 8 * 60e3));
  const out = [];
  try {
    const cm = await getDoc(env, "settings", "slcustmap"), cb = await getDoc(env, "settings", "custbal");
    const map = (cm && cm.d.map) || {}, alias = {}; for (const x of ((cb && cb.d.list) || [])) for (const a of (x.aliases || [])) alias[normAr(a)] = x.name;
    const cl = (await smGet(m.sl_shop, "/clients/clients_list?limit=500")).data || [];
    const ac = (await smGet(m.sl_shop, "/accounting/accounts?limit=1000")).data || [];
    const cash = ac.find(a => String(a.account_number) === "1030301");
    for (const r of todo) {
      if (left() < 4) break;
      const d = r.d, want = normAr(map[d.cust] || d.cust);
      const hits = cl.filter(c => String(c.id) !== "5" && (normAr(c.name) === want || normAr(c.name) === normAr(alias[normAr(d.cust)] || "\u0000")));
      const err = msg => patchDoc(env, "custpay", r.id, x => ({ ...x, slBondErr: { msg, at: Date.now() } }));
      if (hits.length !== 1) { out.push([r.id, "name", hits.length]); if (!dry) await err(hits.length ? "الاسم «" + d.cust + "» يطابق أكثر من عميل في سمارت لايف" : "الاسم «" + d.cust + "» غير موجود في سمارت لايف"); continue; }
      const acct = ac.find(a => String(a.account_number) === String(hits[0].account_num));
      if (!acct || !cash) { out.push([r.id, "noacct"]); if (!dry) await err("لم يوجد حساب العميل أو الصندوق في سمارت لايف"); continue; }
      const tm = new Date(num(d.at) + 3 * 3600e3).toISOString(), dt = String(d.date) + " " + tm.slice(11, 19);
      const body = { type: "catch_receipt", date: dt, due_date: String(d.date), branch_id: 1, from_account: acct.id, to_account: cash.id, payment_method: 1, amount: num(d.amount), sub_amount: num(d.amount), currency: "SAR", currency_rate: 1, reference: "دفتر طيبة R-" + r.id.slice(0, 6).toUpperCase(), recipient_name: hits[0].name, notes: "سند قبض نقدي من العميل " + hits[0].name + " — من دفتر طيبة (" + (d.cashier || "") + ")", sub_statement: "سداد آجل " + hits[0].name, cost_center: 0, operation_type: "manual", pay_all_bills: 1, pay_all_bills_type: "oldest_to_newest", completed_invoices_only: 0, exclude_fully_returned: 1 };
      if (dry) { out.push([r.id, "would", hits[0].name, num(d.amount), acct.id, cash.id]); continue; }
      const again = await getDoc(env, "custpay", r.id); if (!again || again.d.slBond || again.d.deleted) continue;
      try {
        const j = await smPost(m.sl_shop, "/accounting/add_bond?type=catch_receipt", body);
        const dd = j.data || {}; if (!dd.id) throw new Error("no bond id");
        const sb = { id: dd.id, bond_number: dd.bond_number, number: String(dd.number), entry: dd.main_daily_id, method: "نقدي", at: Date.now(), by: "daftar-server" };
        await patchDoc(env, "custpay", r.id, x => ({ ...x, slBond: sb }));
        const rp = String(d.receipt || "").split("/"); if (rp.length > 2) { const rid = rp.pop(); await patchDoc(env, rp.join("/"), rid, x => ({ ...x, slBond: sb })); }
        out.push([r.id, "ok", dd.bond_number]);
      } catch (e) { await err("فشل الإرسال: " + String(e && e.message || e).slice(0, 80)); out.push([r.id, "fail"]); }
    }
  } finally { if (!dry) await metaSet(env, "bond_lock", "0"); }
  if (dry) { await metaSet(env, "bonddry", JSON.stringify({ at: Date.now(), out }).slice(0, 5000)); await metaDel(env, "bond_dry"); }
  return out.length ? out.length + " handled" : "none";
}

async function run(env) {
  B.n = 0;
  const t0 = Date.now(), log = { at: t0 };
  const m = await metaGet(env, ["sl_shop", "sl_del"]);
  if (!m.sl_shop || !m.sl_del) { await metaSet(env, "jobslog", JSON.stringify({ at: t0, err: "tokens missing" })); return; }
  const fl = await metaGet(env, ["post_on", "post_dry", "cat_force"]);
  for (const [k, f] of [["post", jPost], ["bond", jBond], ["tax", jTax], ["recent", jRecent], ["bal", jBal], ["stock", jStock], ["car", jCar], ["cost", jCost], ["cat", jCat]]) {
    try { log[k] = await f(env, m, fl); } catch (e) { log[k] = "ERR " + String(e && e.message || e).slice(0, 160); }
  }
  log.ms = Date.now() - t0; log.calls = B.n;
  await metaSet(env, "jobslog", JSON.stringify(log));
}
export default { async scheduled(ev, env, ctx) { ctx.waitUntil(run(env)); } };
