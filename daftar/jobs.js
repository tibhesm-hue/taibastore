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
            e[k] = a.r;
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
    await patchDoc(env, "slq", r.id, x => { const y = { ...x, status, doneAt: Date.now(), result, res: R.map(e => ({ code: e.code, shop: e.shop, del: e.del })), page: "pending" }; if (allAlready) y.already = true; delete y.runAt; return y; });
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

async function run(env) {
  B.n = 0;
  const t0 = Date.now(), log = { at: t0 };
  const m = await metaGet(env, ["sl_shop", "sl_del"]);
  if (!m.sl_shop || !m.sl_del) { await metaSet(env, "jobslog", JSON.stringify({ at: t0, err: "tokens missing" })); return; }
  const fl = await metaGet(env, ["post_on", "post_dry", "cat_force"]);
  for (const [k, f] of [["post", jPost], ["recent", jRecent], ["bal", jBal], ["stock", jStock], ["cat", jCat]]) {
    try { log[k] = await f(env, m, fl); } catch (e) { log[k] = "ERR " + String(e && e.message || e).slice(0, 160); }
  }
  log.ms = Date.now() - t0; log.calls = B.n;
  await metaSet(env, "jobslog", JSON.stringify(log));
}
export default { async scheduled(ev, env, ctx) { ctx.waitUntil(run(env)); } };
