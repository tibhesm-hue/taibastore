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
  var card = null, busy = false, last = 0;
  function sales() {
    var sg = document.getElementById("sgCard"); if (!sg) return;
    if (!card) {
      card = document.createElement("div"); card.className = "card"; card.id = "posSgCard"; card.hidden = true;
      card.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h2 style="margin:0">نقاط البيع</h2><span class="small muted" id="posSgDay"></span></div><div id="posSgBody" style="margin-top:8px"><p class="small muted">يحمّل…</p></div>';
      sg.parentNode.insertBefore(card, sg.nextSibling);
    }
    var vis = !sg.hidden && sg.offsetParent !== null; card.hidden = !vis;
    if (vis && !busy && Date.now() - last > 4000) load();
  }
  function load() {
    busy = true; last = Date.now();
    fetch("/api/pos/day", { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) return;
      document.getElementById("posSgDay").textContent = "لحظي · " + j.day.split("-").reverse().map(function (x) { return +x; }).join("/");
      var box = function (k) { var s = j.sum[k] || { n: 0, total: 0, cash: 0, card: 0 }; return '<div style="flex:1;min-width:0;background:var(--brand-soft,#eef6f1);border-radius:12px;padding:10px"><div class="small muted">' + BRN[k] + '</div><div style="font-size:1.35em;font-weight:800;color:var(--brand,#0e5a3c)">' + f2(s.total) + '</div><div class="small muted">' + s.n + ' فاتورة' + (s.rn ? ' · ' + s.rn + ' مرتجع' : '') + '</div><div class="small muted">نقدي ' + f2(s.cash) + ' · شبكة ' + f2(s.card) + '</div></div>'; };
      var inv = (j.inv || []).slice(0, 8).map(function (d) { return '<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid var(--line,#e5e7eb);font-size:.92em' + (d.kind === 'ret' ? ';color:#b91c1c' : '') + '"><span>' + (d.kind === 'ret' ? 'مرتجع ' + d.no + ' عن ' + d.refNo : d.no) + ' · ' + esc(d.u) + ' · ' + (d.br === "del" ? "التوصيل" : "المبيعات") + ' · ' + String(d.t || "").slice(0, 5) + ' · ' + (d.mode === "cash" ? "نقدي" : d.mode === "card" ? "شبكة" : "نقدي + شبكة") + '</span><b>' + f2(d.total) + '</b></div>'; }).join("");
      document.getElementById("posSgBody").innerHTML = '<div style="display:flex;gap:8px">' + box("shop") + box("del") + '</div>' + '<div style="font-weight:700;margin:10px 0 4px">آخر الفواتير</div>' + (inv || '<p class="small muted">لا توجد فواتير اليوم</p>');
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
  function tick() { try { tab(); sales(); } catch (e) { } }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tick); else tick();
  setInterval(tick, 1000);
})();
