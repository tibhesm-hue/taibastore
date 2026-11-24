/* نقاط البيع داخل الدفتر: زر «نقاط البيع» في شريط الأقسام، وبطاقة مبيعات نقاط البيع اللحظية تحت بطاقة المبيعات (للمالك) */
(function () {
  var BRN = { shop: "فرع المبيعات", del: "فرع التوصيل" };
  function f2(x) { return (Math.round((+x || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function tab() {
    var w = document.querySelector("nav.tabs .wrap"); if (!w || document.getElementById("posTab")) return;
    var b = document.createElement("button"); b.type = "button"; b.id = "posTab"; b.setAttribute("aria-selected", "false");
    b.innerHTML = '<span class="i">🖥️</span>نقاط البيع';
    b.addEventListener("click", function () { location.href = "/pos/"; });
    var c = w.querySelector('[data-go="close"]'); if (c && c.nextSibling) w.insertBefore(b, c.nextSibling); else w.appendChild(b);
  }
  var POSV = { show: false, sum: "" };
  function posBtn(vis) {
    var home = document.getElementById("tab-home"), bt = document.getElementById("posBtn"); if (!home) return;
    if (!bt) { bt = document.createElement("button"); bt.type = "button"; bt.id = "posBtn"; bt.style.cssText = "display:block;width:100%;box-sizing:border-box;margin:0 0 10px;padding:12px;border-radius:14px;border:2px solid #ea5b2b;background:#fff;color:#1f2937;font:inherit;font-weight:700;text-align:center;line-height:1.5"; var jb = document.getElementById("jdxBtn"); home.insertBefore(bt, jb ? jb.nextSibling : home.firstChild); }
    bt.hidden = !vis; var h = "🖥️ نقاط البيع<br><span style=\"font-weight:400;font-size:13px;color:#666\">" + (POSV.sum ? POSV.sum + " · " : "") + (POSV.show ? "▲" : "▼") + "</span>"; if (bt.__h !== h) { bt.innerHTML = h; bt.__h = h; }
  }
  document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("#posBtn")) { POSV.show = !POSV.show; if (card) card.hidden = !POSV.show; posBtn(true); } });
  var card = null, busy = false, last = 0;
  function sales() {
    var sg = document.getElementById("sgCard"); if (!sg) return;
    if (!card) {
      card = document.createElement("div"); card.className = "card"; card.id = "posSgCard"; card.hidden = true;
      card.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h2 style="margin:0">نقاط البيع</h2><span class="small muted" id="posSgDay"></span></div><div id="posSgBody" style="margin-top:8px"><p class="small muted">يحمّل…</p></div>';
      sg.parentNode.insertBefore(card, sg.nextSibling);
    }
    var vis = !sg.hidden && sg.offsetParent !== null; card.hidden = !vis || !POSV.show; posBtn(vis);
    if (vis && !busy && Date.now() - last > 4000) load();
  }
  function load() {
    busy = true; last = Date.now();
    fetch("/api/pos/day", { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) return;
      try { var tn = 0, tt = 0; for (var k in j.sum) { tn += j.sum[k].n || 0; tt += j.sum[k].total || 0; } POSV.sum = "اليوم " + tn + " فاتورة · " + f2(tt); posBtn(true); } catch (e) { }
      document.getElementById("posSgDay").textContent = "لحظي · " + j.day.split("-").reverse().map(function (x) { return +x; }).join("/");
      var box = function (k) { var s = j.sum[k] || { n: 0, total: 0, cash: 0, card: 0 }; return '<div style="flex:1;min-width:0;background:var(--brand-soft,#eef6f1);border-radius:12px;padding:10px"><div class="small muted">' + BRN[k] + '</div><div style="font-size:1.35em;font-weight:800;color:var(--brand,#0e5a3c)">' + f2(s.total) + '</div><div class="small muted">' + s.n + ' فاتورة' + (s.rn ? ' · ' + s.rn + ' مرتجع' : '') + '</div><div class="small muted">نقدي ' + f2(s.cash) + ' · شبكة ' + f2(s.card) + '</div></div>'; };
      var inv = (j.inv || []).slice(0, 8).map(function (d) { return '<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid var(--line,#e5e7eb);font-size:.92em' + (d.kind === 'ret' ? ';color:#b91c1c' : '') + '"><span>' + (d.kind === 'ret' ? 'مرتجع ' + d.no + ' عن ' + d.refNo : d.no) + ' · ' + esc(d.u) + ' · ' + (d.br === "del" ? "التوصيل" : "المبيعات") + ' · ' + String(d.t || "").slice(0, 5) + ' · ' + (d.mode === "cash" ? "نقدي" : d.mode === "card" ? "شبكة" : "نقدي + شبكة") + '</span><b>' + f2(d.total) + '</b></div>'; }).join("");
      document.getElementById("posSgBody").innerHTML = '<div style="display:flex;gap:8px">' + box("shop") + box("del") + '</div>' + '<div style="font-weight:700;margin:10px 0 4px">آخر الفواتير</div>' + (inv || '<p class="small muted">لا توجد فواتير اليوم</p>');
      fetch("/api/pos/shifts", { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json(); }).then(function (s) {
        if (!s || !s.ok) return; var el = document.getElementById("posSgSh"); if (!el) { el = document.createElement("div"); el.id = "posSgSh"; document.getElementById("posSgBody").appendChild(el); }
        var hm = function (x) { var d = new Date(x); return d.toTimeString().slice(0, 5); }, col = function (v) { return Math.abs(v) < 0.01 ? "color:#15803d" : "color:#b91c1c"; };
        el.innerHTML = '<div style="font-weight:700;margin:12px 0 4px">ورديات اليوم</div>' + (s.shifts.length ? s.shifts.map(function (h) {
          var top = '<div style="display:flex;justify-content:space-between;gap:8px"><b>' + esc(h.u) + ' · ' + (h.br === "del" ? "التوصيل" : "المبيعات") + '</b><span class="small muted">' + hm(h.openAt) + (h.closeAt ? ' – ' + hm(h.closeAt) : ' · مفتوحة') + '</span></div>';
          if (h.st !== "closed") return '<div style="padding:6px 0;border-bottom:1px solid var(--line,#e5e7eb)">' + top + '<div class="small muted">العهدة ' + f2(h.float) + '</div></div>';
          if (!h.counted) return '<div style="padding:6px 0;border-bottom:1px solid var(--line,#e5e7eb)">' + top + '<div class="small">العهدة ' + f2(h.float) + ' · ' + h.exp.n + ' فاتورة' + (h.exp.rn ? ' · ' + h.exp.rn + ' مرتجع' : '') + ' · مبيعات ' + f2(h.exp.sales) + '</div><div class="small muted">الإقفال والموازنة من الجوال في «الإقفالات»</div></div>';
          return '<div style="padding:6px 0;border-bottom:1px solid var(--line,#e5e7eb)">' + top + '<div class="small" style="display:flex;justify-content:space-between"><span>العهدة ' + f2(h.float) + ' · ' + h.exp.n + ' فاتورة' + (h.exp.rn ? ' · ' + h.exp.rn + ' مرتجع' : '') + '</span></div>'
            + '<div class="small" style="display:flex;justify-content:space-between"><span>النقد: متوقع ' + f2(h.exp.cash) + ' · معدود ' + f2(h.counted.cash) + '</span><b style="' + col(h.diff.cash) + '">' + (h.diff.cash > 0 ? "+" : "") + f2(h.diff.cash) + '</b></div>'
            + '<div class="small" style="display:flex;justify-content:space-between"><span>الشبكة: متوقع ' + f2(h.exp.card) + ' · مكتوب ' + f2(h.counted.card) + '</span><b style="' + col(h.diff.card) + '">' + (h.diff.card > 0 ? "+" : "") + f2(h.diff.card) + '</b></div></div>';
        }).join("") : '<p class="small muted">لا توجد ورديات اليوم</p>');
      }).catch(function () { });
    }).catch(function () { }).then(function () { busy = false; });
  }

  /* «📒 الدفتر»: زر ثالث في «تصفح المبيعات» يعرض فواتير نقاط البيع (المالك) */
  var PB = { on: false, per: "new", open: null, data: null, at: 0, busy: false };
  function ymd(d) { return d.toISOString().slice(0, 10); }
  function pbDays() { var t = new Date(Date.now() + 3 * 3600e3), y = new Date(t.getTime() - 864e5); return PB.per === "today" ? [ymd(t)] : PB.per === "yest" ? [ymd(y)] : [ymd(t), ymd(y)]; }
  function pbLoad() {
    if (PB.busy) return; PB.busy = true;
    var ds = pbDays();
    Promise.all(ds.map(function (d) { return fetch("/api/pos/day?full=1&d=" + d, { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json(); }).catch(function () { return null; }); }))
      .then(function (A) { var L = []; A.forEach(function (j) { if (j && j.ok) L = L.concat(j.inv || []); }); L.sort(function (a, b) { return b.at - a.at; }); PB.data = PB.per === "new" ? L.slice(0, 60) : L; PB.at = Date.now(); pbRender(); })
      .then(function () { PB.busy = false; }, function () { PB.busy = false; });
  }
  function pbTm(d) { var h = +String(d.t).slice(0, 2), m = String(d.t).slice(3, 5), today = ymd(new Date(Date.now() + 3 * 3600e3)); return (h % 12 || 12) + ":" + m + (h < 12 ? " ص" : " م") + (d.day !== today ? " · " + d.day.split("-").reverse().map(function (x) { return +x; }).join("/") : ""); }
  function pbRender() {
    var box = document.getElementById("sbIn"); if (!box || !PB.on) return;
    var L = PB.data, md = function (m) { return m === "cash" ? "نقدي" : m === "card" ? "شبكة" : "نقدي + شبكة"; };
    var list = !L ? '<p class="empty">⏳ يحمّل…</p>' : !L.length ? '<p class="empty">ما فيه فواتير نقاط بيع في هذي الفترة.</p>' : '<ul class="list">' + L.map(function (d, i) {
      var ret = d.kind === "ret", key = d.day + "|" + d.br + "|" + (ret ? "r" : "s") + d.no, open = PB.open === key, n = (d.lines || []).length;
      var det = open ? '<div style="width:100%;margin-top:6px;border-top:1px dashed var(--line);padding-top:6px">' + (d.lines || []).map(function (l) { return '<div class="small" style="display:flex;justify-content:space-between;gap:8px;padding:2px 0"><span>' + esc(l[1]) + ' <span class="muted">× ' + Math.abs(l[3]) + '</span></span><span style="white-space:nowrap">' + f2(l[2]) + ' = <b>' + f2(l[4]) + '</b></span></div>'; }).join("") + '<div class="small" style="margin-top:4px">' + (ret ? "مرتجع رقم " + d.no + " عن فاتورة " + d.refNo : "فاتورة رقم " + d.no) + " · نقدي " + f2(d.cash) + " · شبكة " + f2(d.card) + (d.vat ? " · الضريبة " + f2(d.vat) : "") + '</div></div>' : "";
      return '<li data-posi="' + esc(key) + '" style="flex-wrap:wrap;cursor:pointer' + (ret ? ';color:var(--err-fg,#b91c1c)' : '') + '"><div class="main"><b>' + pbTm(d) + '</b><span class="small muted">' + esc(d.u) + " · " + n + " صنف · " + (d.br === "del" ? "التوصيل" : "المبيعات") + " · " + (ret ? "↩️ مرتجع عن فاتورة " + d.refNo : md(d.mode)) + '</span></div><span class="amt" style="font-weight:700">' + f2(d.total) + '</span>' + det + '</li>';
    }).join("") + '</ul>';
    var sum = L && L.length ? L.reduce(function (a, x) { return a + (+x.total || 0); }, 0) : 0, cnt = L ? L.filter(function (x) { return x.kind !== "ret"; }).length : 0;
    box.innerHTML = '<div data-posview style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h3 style="margin:0">📒 فواتير نقاط البيع</h3><button class="btn sm ghost" type="button" data-sbx>✕</button></div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:8px 0"><div class="irq" style="margin:0"><button type="button" data-sba="shop" aria-pressed="false">🏪 المحل</button><button type="button" data-sba="del" aria-pressed="false">🛵 التوصيل</button><button type="button" data-posb aria-pressed="true">📒 الدفتر</button></div><div class="irq" style="margin:0">' + [["new", "🆕 الأحدث"], ["today", "اليوم"], ["yest", "أمس"]].map(function (a) { return '<button type="button" data-posper="' + a[0] + '" aria-pressed="' + (PB.per === a[0]) + '">' + a[1] + '</button>'; }).join("") + '</div></div>'
      + list + (L && L.length ? '<p class="small muted" style="text-align:center">' + cnt + " فاتورة · المجموع بعد المرتجع " + f2(sum) + " · اضغط على الفاتورة لتشوف أصنافها</p>" : "");
  }
  function pbTab() {
    if (PB.on) return; var box = document.getElementById("sbIn"); if (!box) return;
    var del = box.querySelector('[data-sba="del"]'); if (!del || box.querySelector("[data-posb]")) return;
    var b = document.createElement("button"); b.type = "button"; b.setAttribute("data-posb", ""); b.setAttribute("aria-pressed", "false"); b.textContent = "📒 الدفتر";
    del.parentNode.insertBefore(b, del.nextSibling);
  }
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t.closest("[data-posb]")) { PB.on = true; PB.data = null; pbRender(); pbLoad(); return; }
    if (t.closest("[data-sba]") || t.closest("[data-sbx]")) { PB.on = false; return; }
    if (!PB.on) return;
    var pe = t.closest("[data-posper]"); if (pe) { PB.per = pe.getAttribute("data-posper"); PB.data = null; PB.open = null; pbRender(); pbLoad(); return; }
    var li = t.closest("[data-posi]"); if (li) { var k = li.getAttribute("data-posi"); PB.open = PB.open === k ? null : k; pbRender(); }
  }, true);
  setInterval(function () {
    var box = document.getElementById("sbIn"), vis = box && box.offsetParent !== null;
    if (!vis) { PB.on = false; return; }
    if (PB.on) { if (!box.querySelector("[data-posview]")) pbRender(); if (Date.now() - PB.at > 5000) pbLoad(); } else pbTab();
  }, 400);

  /* «📒 الدفتر» في قائمة الحساب ببطاقة المبيعات: أرقام نقاط البيع للفترة المختارة */
  var SV = { on: false, busy: false, at: 0, key: "", data: null, hid: [] };
  function svSel() { var c = document.getElementById("sgCard"); if (!c) return null; var L = c.querySelectorAll("select.grpSel"); for (var i = 0; i < L.length; i++) { var o = L[i].options; for (var k = 0; k < o.length; k++) if (/التوصيل/.test(o[k].textContent)) return L[i]; } return null; }
  function svRange() { try { var R = sgRange(); return { f: R.f, t: R.t }; } catch (e) { var d = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); return { f: d, t: d }; } }
  function svBox() { var b = document.getElementById("posSgView"); if (!b) { var c = document.getElementById("sgCard"), sb = document.getElementById("sbOpen"); if (!c || !sb) return null; var row = sb.parentElement; while (row && row.parentElement !== c) row = row.parentElement; if (!row) return null; b = document.createElement("div"); b.id = "posSgView"; row.parentNode.insertBefore(b, row.nextSibling); } return b; }
  function svHide(on) {
    var b = svBox(); if (!b) return; var c = document.getElementById("sgCard");
    if (on) { var x = b.nextElementSibling; while (x) { if (!x.hasAttribute("data-svh") && x.style.display !== "none") { x.setAttribute("data-svh", "1"); x.style.display = "none"; } x = x.nextElementSibling; } b.hidden = false; }
    else { [].forEach.call(c.querySelectorAll("[data-svh]"), function (x) { x.style.display = ""; x.removeAttribute("data-svh"); }); b.hidden = true; }
  }
  function kpi(t, v, s) { return '<div style="min-width:0;border:1px solid var(--line,#e5e7eb);border-radius:14px;padding:10px 12px"><div class="small muted">' + t + '</div><div style="font-size:1.45em;font-weight:800">' + v + '</div>' + (s ? '<div class="small muted">' + s + '</div>' : '') + '</div>'; }
  function svDraw() {
    var b = svBox(); if (!b || !SV.on) return; var j = SV.data;
    if (!j) { b.innerHTML = '<p class="empty">⏳ يحمّل مبيعات نقاط البيع…</p>'; return; }
    var a = j.all, avg = a.n ? (a.total - a.ret) / a.n : 0, sh = j.br.shop || {}, dl = j.br.del || {};
    var U = Object.keys(j.us).sort(function (x, y) { return j.us[y].total - j.us[x].total; });
    b.innerHTML = '<div class="small muted" style="margin:2px 0 8px">📒 نقاط البيع (الدفتر) · ' + (j.f === j.t ? j.f.split("-").reverse().map(function (x) { return +x; }).join("/") : j.f.split("-").reverse().map(function (x) { return +x; }).join("/") + " – " + j.t.split("-").reverse().map(function (x) { return +x; }).join("/")) + ' · لحظي</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'
      + kpi("المبيعات (بعد المرتجع)", f2(a.total), "نقدي " + f2(a.cash) + " · شبكة " + f2(a.card))
      + kpi("عدد الفواتير", a.n, "متوسط الفاتورة " + f2(avg))
      + kpi("🏪 فرع المبيعات", f2(sh.total || 0), (sh.n || 0) + " فاتورة" + (sh.rn ? " · " + sh.rn + " مرتجع" : ""))
      + kpi("🛵 فرع التوصيل", f2(dl.total || 0), (dl.n || 0) + " فاتورة" + (dl.rn ? " · " + dl.rn + " مرتجع" : ""))
      + kpi("↩️ المرتجعات", f2(a.ret), a.rn + " مرتجع")
      + kpi("الضريبة", f2(a.vat), "فرع المبيعات فقط")
      + '</div>'
      + (U.length ? '<div style="font-weight:700;margin:10px 0 4px">حسب الكاشير</div>' + U.map(function (u) { var s = j.us[u]; return '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--line,#e5e7eb)"><span>' + esc(u) + ' <span class="small muted">· ' + s.n + ' فاتورة' + (s.rn ? ' · ' + s.rn + ' مرتجع' : '') + '</span></span><b>' + f2(s.total) + '</b></div>'; }).join("") : '<p class="small muted" style="margin-top:8px">ما فيه مبيعات نقاط بيع في هذي الفترة.</p>');
  }
  function svLoad(force) {
    var R = svRange(), k = R.f + "|" + R.t; if (SV.busy) return; if (!force && k === SV.key && Date.now() - SV.at < 4000) return;
    if (k !== SV.key) SV.data = null; SV.key = k; SV.busy = true; SV.at = Date.now(); svDraw();
    fetch("/api/pos/range?f=" + R.f + "&t=" + R.t, { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) { if (j && j.ok && SV.key === k) { SV.data = j; svDraw(); } }).catch(function () { }).then(function () { SV.busy = false; });
  }
  function svTick() {
    var sel = svSel(); if (!sel) return;
    if (!sel.querySelector('option[value="pos"]')) { var o = document.createElement("option"); o.value = "pos"; o.textContent = "📒 الدفتر"; sel.appendChild(o);
      sel.addEventListener("change", function (e) { if (sel.value === "pos") { e.stopImmediatePropagation(); SV.on = true; svHide(true); svLoad(true); } else if (SV.on) { SV.on = false; svHide(false); } }, true); }
    if (SV.on) { if (sel.value !== "pos") sel.value = "pos"; svHide(true); svLoad(false); }
  }

  /* price-link stats: counted by the server itself (visits on /p/ + orders that reach the POS) */
  var PLX = { key: "", at: 0, busy: false, data: null };
  function plxDays(n) { var a = [], t = new Date(Date.now() + 3 * 3600e3); for (var i = n - 1; i >= 0; i--) a.push(ymd(new Date(t.getTime() - i * 864e5))); return a; }
  function dm(k) { return k.split("-").slice(1).reverse().map(function (x) { return +x; }).join("/"); }
  function plxBox() {
    var c = document.getElementById("plCard"); if (!c) return null; var b = document.getElementById("plNew");
    if (!b) { b = document.createElement("div"); b.id = "plNew"; var cu = document.getElementById("plCust"); if (cu) cu.parentNode.insertBefore(b, cu.nextSibling); else c.appendChild(b); }
    [].forEach.call(c.children, function (x) { if (x.tagName !== "H2" && x.id !== "plPer" && x.id !== "plCust" && x.id !== "plNew" && x.style.display !== "none") x.style.display = "none"; });
    return b;
  }
  function plxDraw() {
    var b = plxBox(), j = PLX.data; if (!b || !j) return; var R = PLX.r, T = { v: 0, vo: 0, o: 0, dl: 0, pk: 0, s: 0, sn: 0 }, old = false;
    Object.keys(j.days).forEach(function (k) { if (k < R[0] || k > R[1]) return; var d = j.days[k]; T.v += d.v; T.vo += d.vo; T.o += d.o; T.dl += d.dl; T.pk += d.pk; T.s += d.s; if (d.old) old = true; else T.sn += d.o; });
    var no = Math.max(0, T.v - T.vo), pc = T.v ? Math.round(T.vo / T.v * 1000) / 10 : 0;
    var K = function (big, lbl, sub, col) { return '<div style="background:#f4f3ee;border-radius:10px;padding:8px 10px"><div style="font-size:12px;color:#666">' + lbl + '</div><b style="display:block;font-size:20px;line-height:1.4' + (col ? ';color:' + col : '') + '">' + big + '</b>' + (sub ? '<div style="font-size:11px;color:#666">' + sub + '</div>' : '') + '</div>'; };
    var h = '<div class="grid2">' + K(T.v, "دخلوا الرابط", "كل جوال يُحسب مرة باليوم")
      + K(T.o, "طلبوا", "توصيل " + T.dl + " · استلام " + T.pk, "#0f5c43")
      + K(no, "دخلوا وما طلبوا", T.v ? "من كل 100 زائر طلب " + pc : "", "#b91c1c")
      + K(f2(T.s) + " ر", "مجموع الطلبات", T.sn ? "متوسط الطلب " + f2(T.s / T.sn) + " ر" : "") + '</div>';
    if (old) h += '<p class="small" style="margin:6px 0 0;color:#666">الزوار ومبالغ الطلبات تُحسب من 24/11؛ قبلها عدد الطلبات فقط.</p>';
    var AR = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"], D7 = plxDays(7).reverse();
    h += '<h3 style="margin:12px 0 4px;font-size:15px">آخر 7 أيام</h3><table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="color:#666"><td>اليوم</td><td style="text-align:center">دخلوا</td><td style="text-align:center">طلبوا</td><td style="text-align:center">ما طلبوا</td></tr>'
      + D7.map(function (k) { var d = j.days[k] || { v: 0, vo: 0, o: 0 }, z = new Date(k + "T12:00:00"); return '<tr style="border-top:1px solid var(--line,#e5e7eb)"><td style="padding:5px 0">' + AR[z.getDay()] + ' ' + dm(k) + '</td><td style="text-align:center">' + (d.old ? "—" : d.v) + '</td><td style="text-align:center;color:#0f5c43;font-weight:700">' + d.o + '</td><td style="text-align:center;color:#b91c1c">' + (d.old ? "—" : Math.max(0, d.v - d.vo)) + '</td></tr>'; }).join("") + '</table>';
    var ST = function (o) { return o.st === "done" ? '<span style="color:#15803d">انتهى' + (o.u ? " · " + esc(o.u) : "") + '</span>' : o.st === "taken" ? '<span style="color:#1d4ed8">عند الكاشير ' + esc(o.u) + '</span>' : '<span style="color:#c2410c">جديد</span>'; };
    var tm = function (t) { var x = +String(t).slice(0, 2); return (x % 12 || 12) + ":" + String(t).slice(3, 5) + (x < 12 ? " ص" : " م"); };
    h += '<h3 style="margin:12px 0 4px;font-size:15px">طلبات اليوم <span class="small muted">(' + j.list.length + ')</span></h3>'
      + (j.list.length ? j.list.map(function (o) { return '<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--line,#e5e7eb);font-size:13px"><span>طلب ' + esc(o.ono) + ' · ' + tm(o.t) + ' · ' + (o.dist === "pickup" ? "استلام" : "توصيل") + ' · ' + o.n + ' صنف<br>' + ST(o) + '</span><b style="white-space:nowrap">' + f2((+o.sub || 0) + (+o.fee || 0)) + '</b></div>'; }).join("") : '<p class="small muted" style="margin:4px 0">ما وصل طلب من الرابط اليوم.</p>');
    h += '<p class="small muted" style="margin:8px 0 0">لحظي · يتحدث كل 20 ثانية</p>';
    if (b.__h !== h) { b.innerHTML = h; b.__h = h; }
  }
  function plxTick() {
    var c = document.getElementById("plCard"); if (!c || c.hidden || !c.offsetParent) return; plxBox();
    var r; try { r = plRange(); } catch (e) { r = null; } if (!r || !r[0]) { var t = ymd(new Date(Date.now() + 3 * 3600e3)); r = [t, t]; }
    var d7 = plxDays(7)[0], tod = plxDays(1)[0], f = r[0] < d7 ? r[0] : d7, t2 = r[1] > tod ? r[1] : tod, k = f + "|" + t2;
    PLX.r = r; if (PLX.data && PLX.key === k) plxDraw();
    if (PLX.busy || (PLX.key === k && Date.now() - PLX.at < 20000)) return; PLX.busy = true;
    fetch("/api/pos/plstats?f=" + f + "&t=" + t2, { credentials: "same-origin", cache: "no-store" }).then(function (x) { return x.json(); }).then(function (j) { if (j && j.ok) { PLX.data = j; PLX.key = k; PLX.at = Date.now(); plxDraw(); } }).catch(function () { }).then(function () { PLX.busy = false; });
  }

  /* stocktake card (الجرد) in the reports, owner only */
  var JDX = { show: false, at: 0, busy: false, data: null, tab: "c", ok2: 0 };
  function jdxBox() {
    var home = document.getElementById("tab-home"); if (!home) return null; var c = document.getElementById("jdxCard");
    if (!c) { c = document.createElement("div"); c.className = "card"; c.id = "jdxCard"; c.hidden = true; var sg = document.getElementById("sgCard"); if (sg && sg.parentElement === home) home.insertBefore(c, sg.nextSibling); else home.appendChild(c); }
    var bt = document.getElementById("jdxBtn");
    if (!bt) { bt = document.createElement("button"); bt.type = "button"; bt.id = "jdxBtn"; bt.style.cssText = "display:block;width:100%;box-sizing:border-box;margin:0 0 10px;padding:12px;border-radius:14px;border:2px solid #ea5b2b;background:#fff;color:#1f2937;font:inherit;font-weight:700;text-align:center;line-height:1.5"; home.insertBefore(bt, home.firstChild); }
    return c;
  }
  function jdxBtn() {
    var bt = document.getElementById("jdxBtn"), j = JDX.data, c = document.getElementById("jdxCard"); if (!bt) return;
    var t = "📦 الجرد", s = "", open = !!(j && j.cur && j.cur.st === "open");
    if (j && j.cur) {
      var n = (j.rows || []).filter(function (x) { return !x.nw; }).length, nn = (j.rows || []).length - n, d = new Date(j.cur.at), hh = d.getHours(), dd = d.getDate() + "/" + (d.getMonth() + 1);
      s = '<b style="color:' + (open ? "#ea5b2b" : "#666") + '">' + (open ? "جاري الجرد" : "آخر جرد معتمد") + '</b><br>بدأ ' + dd + " " + (hh % 12 || 12) + ":" + String(d.getMinutes()).padStart(2, "0") + (hh < 12 ? " ص" : " م") + '<br>انجرد ' + n.toLocaleString("en-US") + ' صنف من ' + (j.total || 0).toLocaleString("en-US") + (nn ? " · وغير مسجل " + nn : "");
    } else s = "ما فيه جرد للحين";
    var h = t + '<br><span style="font-weight:400;font-size:13px;color:#444">' + s + " " + (JDX.show ? "▲" : "▼") + '</span>';
    if (bt.__h !== h) { bt.innerHTML = h; bt.__h = h; }
    if (c) c.hidden = !JDX.show;
  }
  function jdxDraw() {
    var c = jdxBox(), j = JDX.data; jdxBtn(); if (!c || !j) return; c.hidden = !JDX.show;
    var K = function (t, v, col) { return '<div style="background:#f4f3ee;border-radius:10px;padding:8px 10px"><div style="font-size:12px;color:#666">' + t + '</div><b style="display:block;font-size:20px;line-height:1.4' + (col ? ';color:' + col : '') + '">' + v + '</b></div>'; };
    var h = '<h2>📦 الجرد</h2>';
    if (!j.cur) { c.innerHTML = h + '<p class="small muted">ما فيه جرد للحين. يبدأ الجرد أول ما يضغط الكاشير «📋 الجرد» في تبويب الكاشير ويجرد أول صنف.</p>'; return; }
    var R = j.rows || [], cnt = R.filter(function (x) { return !x.nw; }), nw = R.filter(function (x) { return x.nw; }), rn = R.filter(function (x) { return x.rn; }), us = {};
    R.forEach(function (x) { for (var u in (x.by || {})) us[u] = (us[u] || 0) + 1; });
    var open = j.cur.st === "open", dd = dm(j.cur.day || ymd(new Date(j.cur.at + 3 * 3600e3)));
    h += '<div class="grid2">' + K("جرد " + dd + (open ? " — شغّال" : " — معتمد"), cnt.length.toLocaleString("en-US") + " / " + (j.total || 0).toLocaleString("en-US"))
      + K("باقي ما انجرد", (j.missN || 0).toLocaleString("en-US"), "#b91c1c") + K("غير مسجلة", nw.length, "#c2410c")
      + '<div style="background:#f4f3ee;border-radius:10px;padding:8px 10px"><div style="font-size:12px;color:#666">العمال</div><b style="display:block;font-size:14px;line-height:1.6">' + (Object.keys(us).map(function (u) { return esc(u) + " " + us[u]; }).join(" · ") || "—") + '</b></div></div>';
    var T = [["c", "انجرد"], ["m", "ما انجرد"], ["n", "غير مسجلة"], ["r", "أسماء معدّلة"]];
    h += '<div class="irq" style="margin:10px 0 6px">' + T.map(function (t) { return '<button type="button" data-jdt="' + t[0] + '" aria-pressed="' + (JDX.tab === t[0]) + '">' + t[1] + '</button>'; }).join("") + '</div>';
    var tm = function (a) { var d = new Date(a), hh = d.getHours(); return (hh % 12 || 12) + ":" + String(d.getMinutes()).padStart(2, "0") + (hh < 12 ? " ص" : " م"); };
    var row = function (a, b, sub) { return '<div style="display:flex;justify-content:space-between;gap:8px;padding:7px 0;border-bottom:1px solid var(--line,#e5e7eb);font-size:14px"><span>' + a + (sub ? '<br><span class="small muted">' + sub + '</span>' : '') + '</span><b style="white-space:nowrap">' + b + '</b></div>'; };
    var L = JDX.tab === "c" ? cnt.map(function (x) { return row(esc(x.rn || x.name), x.q, esc(x.u || "") + " · " + tm(x.at)); })
      : JDX.tab === "m" ? (j.miss || []).slice(0, 300).map(function (x) { return row(esc(x[1]), '<span class="small muted" dir="ltr">' + esc(x[0]) + '</span>'); })
      : JDX.tab === "n" ? nw.map(function (x) { return row(esc(x.name), x.q, '<span dir="ltr">' + esc(x.code) + '</span> · ' + esc(x.u || "")); })
      : rn.map(function (x) { return row(esc(x.old) + ' ← <b>' + esc(x.rn) + '</b>', x.q, esc(x.u || "")); });
    h += '<div style="max-height:420px;overflow:auto">' + (L.length ? L.join("") : '<p class="small muted">ما فيه شيء هنا.</p>') + (JDX.tab === "m" && (j.missN || 0) > 300 ? '<p class="small muted">يظهر أول 300 من ' + j.missN + '</p>' : '') + '</div>';
    if (open) h += '<button type="button" class="btn" id="jdxOk" style="width:100%;margin-top:10px">' + (JDX.ok2 && Date.now() - JDX.ok2 < 4000 ? "اضغط مرة ثانية للتأكيد" : "أقفل الجرد") + '</button>';
    else h += '<p class="small muted" style="margin-top:8px">اعتُمد' + (j.cur.applied != null ? " · صار رصيد " + j.cur.applied + " صنف في المخزون" : "") + '. الجرد الجاي يبدأ مع أول صنف يجرده الكاشير.</p>';
    if (c.__h !== h) { c.innerHTML = h; c.__h = h; }
  }
  function jdxLoad(force) {
    if (JDX.busy || (!force && Date.now() - JDX.at < 30000)) return; JDX.busy = true;
    fetch("/api/jard/rep", { credentials: "same-origin", cache: "no-store" }).then(function (x) { return x.json(); }).then(function (j) { if (j && j.ok) { JDX.data = j; JDX.at = Date.now(); jdxDraw(); } }).catch(function () { }).then(function () { JDX.busy = false; });
  }
  function jdxTick() { var h = document.getElementById("tab-home"); if (!h || h.hidden) return; jdxBox(); jdxBtn(); jdxLoad(false); }
  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("#jdxBtn")) { JDX.show = !JDX.show; jdxDraw(); jdxBtn(); return; }
    var t = e.target.closest && e.target.closest("[data-jdt]"); if (t) { JDX.tab = t.dataset.jdt; jdxDraw(); return; }
    if (e.target.closest && e.target.closest("#jdxOk")) {
      if (!(JDX.ok2 && Date.now() - JDX.ok2 < 4000)) { JDX.ok2 = Date.now(); jdxDraw(); setTimeout(jdxDraw, 4100); return; }
      JDX.ok2 = 0; var b = document.getElementById("jdxOk"); if (b) { b.disabled = true; b.textContent = "⏳ يعتمد…"; }
      fetch("/api/jard/close", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" }).then(function (x) { return x.json(); }).then(function () { jdxLoad(true); }).catch(function () { jdxLoad(true); });
    }
  });

  /* cashier tab: «📋 الجرد» — scan with the phone camera (or type), write the count, save */
  var JC = { on: false, c: null, set: false, mine: [], cam: null, zx: null, t: null, busy: false };
  function jcWho() { try { return (typeof curCashier === "function" && curCashier()) || ""; } catch (e) { return ""; } }
  function jcQ(p) { return p + (p.indexOf("?") < 0 ? "?" : "&") + "who=" + encodeURIComponent(jcWho()); }
  function jcGet(p) { return fetch(jcQ(p), { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json(); }); }
  var JCW = (function () { function w(parts) { var sr = 22050, n = 0; parts.forEach(function (p) { n += Math.round(p[1] * sr); }); var b = new DataView(new ArrayBuffer(44 + n * 2)), s = function (o, t) { for (var i = 0; i < t.length; i++) b.setUint8(o + i, t.charCodeAt(i)); }; s(0, "RIFF"); b.setUint32(4, 36 + n * 2, true); s(8, "WAVEfmt "); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true); b.setUint32(24, sr, true); b.setUint32(28, sr * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); s(36, "data"); b.setUint32(40, n * 2, true); var o = 44; parts.forEach(function (p) { var m = Math.round(p[1] * sr); for (var i = 0; i < m; i++) { var v = p[0] ? (Math.sin(2 * Math.PI * p[0] * i / sr) > 0 ? 0.6 : -0.6) : 0; b.setInt16(o, v * 32767, true); o += 2; } }); var u = new Uint8Array(b.buffer), str = ""; for (var i = 0; i < u.length; i++) str += String.fromCharCode(u[i]); return "data:audio/wav;base64," + btoa(str); } return { ok: w([[1050, .12]]), bad: w([[380, .22], [0, .08], [380, .22], [0, .08], [260, .5]]) }; })();
  function jcBeep(ok) { try { var a = new Audio(ok ? JCW.ok : JCW.bad); a.play().catch(function () { }); } catch (e) { } try { if (!ok && navigator.vibrate) navigator.vibrate([200, 80, 200]); } catch (e) { } }
  function jcBtnInject() {
    var M = document.getElementById("cwMenu"); if (!M) return;
    var T = document.getElementById("tab-close"); if (T && T.dataset.cw && T.dataset.cw !== "menu") return;
    if (!JC.on && !M.querySelector("[data-jcgo]")) { var sk = M.querySelectorAll('[data-cwgo="sk"]'), last = sk[sk.length - 1]; var b = document.createElement("button"); b.type = "button"; b.className = "btn ghost"; b.setAttribute("data-jcgo", "1"); b.setAttribute("style", last ? (last.getAttribute("style") || "") : "display:block;width:100%;padding:16px 12px;margin:8px 0;border-radius:14px;font-size:1.15em;font-weight:800;text-align:center"); b.textContent = "📋 الجرد"; if (last) last.parentNode.insertBefore(b, last.nextSibling); else M.appendChild(b); }
  }
  function jcBox() { var b = document.getElementById("jcBox"); if (!b) { var M = document.getElementById("cwMenu"); if (!M) return null; b = document.createElement("div"); b.id = "jcBox"; b.hidden = true; M.parentNode.insertBefore(b, M.nextSibling); } return b; }
  function jcOpen() {
    var b = jcBox(), M = document.getElementById("cwMenu"); if (!b) return; JC.on = true; M.style.display = "none"; b.hidden = false;
    var BS = 'display:block;width:100%;padding:14px 12px;margin:8px 0;border-radius:14px;font-size:1.1em;font-weight:800;text-align:center';
    b.innerHTML = '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">📋 الجرد</h2><button type="button" class="btn sm ghost" data-jcback>رجوع</button></div>'
      + '<div class="small muted" id="jcProg" style="margin:6px 0 8px"></div>'
      + '<button type="button" class="btn" data-jccam style="' + BS + '">📷 امسح الباركود بالكاميرا</button>'
      + '<div id="jcCamW" hidden style="position:relative;border-radius:12px;overflow:hidden;background:#000;margin-bottom:8px"><video id="jcVid" playsinline muted style="width:100%;max-height:260px;object-fit:cover;display:block"></video><div style="position:absolute;left:12%;right:12%;top:45%;height:2px;background:#ef4444"></div></div>'
      + '<div style="display:flex;gap:6px"><input type="text" id="jcIn" placeholder="أو اكتب الباركود أو اسم الصنف" style="flex:1;min-width:0"><button type="button" class="btn sm" data-jcfind>بحث</button></div>'
      + '<div id="jcList"></div><div id="jcWarn" hidden style="margin-top:8px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:10px;padding:8px 10px"></div>'
      + '<div id="jcCur" hidden style="margin-top:10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:10px">'
      + '<b id="jcName" style="font-size:1.2em;display:block"></b><input type="text" id="jcNameIn" placeholder="اكتب اسم الصنف" hidden style="width:100%"><div class="small muted" id="jcCode" dir="ltr" style="text-align:right"></div>'
      + '<button type="button" class="btn sm ghost" data-jcren style="margin-top:4px">✏️ تعديل الاسم</button>'
      + '<div class="small" id="jcQL" style="margin-top:8px">العدد الموجود على الرف</div><input type="text" id="jcN" inputmode="decimal" style="width:100%;font-size:1.6em;font-weight:800;text-align:center">'
      + '<button type="button" class="btn" data-jcsave style="' + BS + '">احفظ</button></div>'
      + '<h3 style="margin:14px 0 4px;font-size:15px">آخر ما جردت <span class="small muted">(اضغط الصنف لتصحيح عدده)</span></h3><div id="jcMine"></div></div>';
    jcLoad();
  }
  function jcClose() { jcCamStop(); JC.on = false; JC.c = null; var b = document.getElementById("jcBox"), M = document.getElementById("cwMenu"); if (b) b.hidden = true; if (M) M.style.display = ""; }
  function jcShow(code, name, isNew, set, q) {
    JC.c = { c: code, n: name || "", nw: !!isNew }; JC.set = !!set; jcCamStop();
    var g = function (id) { return document.getElementById(id); };
    g("jcList").innerHTML = ""; g("jcCur").hidden = false; g("jcName").textContent = name || ""; g("jcName").hidden = !!isNew; g("jcNameIn").hidden = !isNew; g("jcNameIn").value = isNew ? "" : (name || ""); g("jcCode").textContent = code;
    document.querySelector("[data-jcren]").hidden = !!isNew; g("jcN").value = set && q != null ? q : ""; g("jcQL").textContent = set ? "العدد الصحيح (يستبدل اللي قبله)" : "العدد الموجود على الرف (ينضاف على اللي قبله)";
    if (isNew) { g("jcWarn").innerHTML = "🔊 باركود <b dir=ltr>" + esc(code) + "</b> غير مسجل — اكتب اسمه وعدده وينضاف"; g("jcWarn").hidden = false; jcBeep(false); g("jcNameIn").focus(); }
    else { g("jcWarn").hidden = true; jcBeep(true); setTimeout(function () { g("jcN").focus(); }, 50); }
    g("jcCur").scrollIntoView({ block: "center", behavior: "smooth" });
  }
  function jcFind(t) {
    t = String(t || "").trim(); if (!t) return; var L = document.getElementById("jcList");
    if (/^\d{4,}$/.test(t)) { jcGet("/api/jard/find?code=" + encodeURIComponent(t)).then(function (j) { if (!j.ok) return; if (j.hit) jcShow(j.hit[0], j.hit[1], false); else jcShow(t, "", true); }).catch(function () { L.innerHTML = '<p class="small" style="color:#b91c1c">تعذّر الاتصال</p>'; }); return; }
    jcGet("/api/jard/find?q=" + encodeURIComponent(t)).then(function (j) { var A = (j && j.list) || []; JC.hits = A;
      L.innerHTML = A.length ? A.map(function (x, i) { return '<div data-jch="' + i + '" style="padding:10px 4px;border-bottom:1px solid var(--line,#e5e7eb);cursor:pointer">' + esc(x[1]) + ' <span class="small muted" dir="ltr">' + esc(x[0]) + '</span></div>'; }).join("") : '<p class="small muted">ما لقيت صنف بهالاسم</p>'; }).catch(function () { });
  }
  function jcCamStop() { try { if (JC.zx) JC.zx.reset(); } catch (e) { } JC.zx = null; if (JC.cam) { JC.cam.getTracks().forEach(function (t) { t.stop(); }); JC.cam = null; } var w = document.getElementById("jcCamW"); if (w) w.hidden = true; }
  function jcCam() {
    if (JC.cam || JC.zx) { jcCamStop(); return; }
    var w = document.getElementById("jcCamW"), v = document.getElementById("jcVid"); w.hidden = false;
    var hit = function (code) { code = String(code || "").trim(); if (!code) return; jcCamStop(); document.getElementById("jcIn").value = code; jcFind(code); };
    var useZX = function () { (typeof loadZX === "function" ? loadZX() : Promise.reject()).then(function () { JC.zx = new ZXing.BrowserMultiFormatReader(); return JC.zx.decodeFromConstraints({ video: { facingMode: "environment" } }, v, function (r) { if (r) hit(r.getText()); }); }).catch(function () { jcCamStop(); alert("ما قدرت أفتح الكاميرا — اكتب الباركود"); }); };
    if ("BarcodeDetector" in window) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }).then(function (st) {
        JC.cam = st; v.srcObject = st; v.play(); var bd; try { bd = new BarcodeDetector(); } catch (e) { jcCamStop(); useZX(); return; }
        var tick = function () { if (!JC.cam) return; bd.detect(v).then(function (r) { if (r && r[0]) hit(r[0].rawValue); else setTimeout(tick, 150); }).catch(function () { setTimeout(tick, 300); }); }; tick();
      }).catch(function () { jcCamStop(); alert("ما سمحت للكاميرا — اسمح لها من إعدادات المتصفح أو اكتب الباركود"); });
    } else useZX();
  }
  function jcSave() {
    if (!JC.c || JC.busy) return; var g = function (id) { return document.getElementById(id); };
    var v = String(g("jcN").value || "").trim().replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 1632; }).replace(/[٫,]/g, ".");
    if (v === "" || isNaN(+v) || (+v === 0 && !JC.set)) { g("jcN").focus(); return; }
    var nm = !g("jcNameIn").hidden ? g("jcNameIn").value.trim() : ""; if (JC.c.nw && !nm) { g("jcNameIn").focus(); return; }
    JC.busy = true; var sb = document.querySelector("[data-jcsave]"); sb.disabled = true; sb.textContent = "⏳ يحفظ…";
    fetch(jcQ("/api/jard/count"), { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: JC.c.c, q: +v, set: JC.set, name: nm && nm !== JC.c.n ? nm : "" }) }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.ok) { jcBeep(true); g("jcCur").hidden = true; g("jcWarn").hidden = true; g("jcIn").value = ""; JC.c = null; g("jcProg").innerHTML = '<b style="color:#15803d">✓ ' + esc(j.row.rn || j.row.name) + ' · المجموع ' + j.row.q + '</b>'; jcLoad(true); }
      else alert(j.err === "name" ? "اكتب اسم الصنف" : "ما انحفظ، جرّب مرة ثانية");
    }).catch(function () { alert("تعذّر الاتصال، جرّب مرة ثانية"); }).then(function () { JC.busy = false; sb.disabled = false; sb.textContent = "احفظ"; });
  }
  function jcLoad(keepMsg) {
    jcGet("/api/jard").then(function (j) { if (!j.ok) return; var n = j.n || 0, T = j.total || 0, pc = T ? Math.min(100, Math.round(n / T * 100)) : 0, P = document.getElementById("jcProg");
      var line = j.cur ? "انجرد " + n.toLocaleString("en-US") + " من " + T.toLocaleString("en-US") + " صنف (" + pc + "%)" + (j.nw ? " · غير مسجلة " + j.nw : "") : "الجرد يبدأ مع أول صنف تجرده";
      if (P) P.innerHTML = (keepMsg ? P.innerHTML + "<br>" : "") + line;
      JC.mine = j.mine || []; var tm = function (a) { var d = new Date(a), h = d.getHours(); return (h % 12 || 12) + ":" + String(d.getMinutes()).padStart(2, "0") + (h < 12 ? " ص" : " م"); };
      var M = document.getElementById("jcMine"); if (M) M.innerHTML = JC.mine.length ? JC.mine.map(function (x, i) { return '<div data-jcm="' + i + '" style="display:flex;justify-content:space-between;gap:8px;padding:9px 2px;border-bottom:1px solid var(--line,#e5e7eb);cursor:pointer"><span>' + esc(x.rn || x.name) + (x.nw ? ' <span class="small" style="color:#c2410c">جديد</span>' : '') + (x.rn ? ' <span class="small" style="color:#1d4ed8">اسم معدّل</span>' : '') + '</span><span><b>' + x.q + '</b> <span class="small muted">' + tm(x.at) + '</span></span></div>'; }).join("") : '<p class="small muted">لسا ما جردت شي</p>';
    }).catch(function () { });
  }
  document.addEventListener("click", function (e) {
    var t = e.target; if (!t.closest) return;
    if (t.closest("[data-jcgo]")) { jcOpen(); return; }
    if (t.closest("[data-jcback]")) { jcClose(); return; }
    if (t.closest("[data-jccam]")) { jcCam(); return; }
    if (t.closest("[data-jcfind]")) { jcFind(document.getElementById("jcIn").value); return; }
    if (t.closest("[data-jcsave]")) { jcSave(); return; }
    if (t.closest("[data-jcren]")) { var a = document.getElementById("jcName"), b = document.getElementById("jcNameIn"); a.hidden = true; b.hidden = false; b.focus(); t.closest("[data-jcren]").hidden = true; return; }
    var h = t.closest("[data-jch]"); if (h) { var x = JC.hits[+h.dataset.jch]; jcShow(x[0], x[1], false); return; }
    var m = t.closest("[data-jcm]"); if (m) { var y = JC.mine[+m.dataset.jcm]; jcShow(y.code, y.rn || y.name, false, true, y.q); return; }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || !e.target || !e.target.id) return;
    if (e.target.id === "jcIn") { e.preventDefault(); jcFind(e.target.value); } else if (e.target.id === "jcN") { e.preventDefault(); jcSave(); } else if (e.target.id === "jcNameIn") { e.preventDefault(); document.getElementById("jcN").focus(); }
  });
  function jcTick() { var T = document.getElementById("tab-close"); if (!T || T.hidden) { if (JC.on) jcClose(); return; } jcBtnInject(); if (JC.on) { var M = document.getElementById("cwMenu"); if (M && M.style.display !== "none") M.style.display = "none"; } }
  function tick() { try { tab(); sales(); } catch (e) { } try { svTick(); } catch (e) { } try { plxTick(); } catch (e) { } try { jdxTick(); } catch (e) { } try { jcTick(); } catch (e) { } }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tick); else tick();
  setInterval(tick, 1000);
})();
