/* نقاط البيع داخل الدفتر: زر «نقاط البيع» في شريط الأقسام، وبطاقة مبيعات نقاط البيع اللحظية تحت بطاقة المبيعات (للمالك) */
(function () {
  var BRN = { shop: "فرع المبيعات", del: "فرع التوصيل" };
  function fmtNo(n) { n = +n; if (!n) return ""; return n >= 100000 ? "ABCDEGHIJKLMNOPQSTUVWXYZ".charAt(Math.floor(n / 100000) - 1) + (n % 100000) : String(n); }
  function f2(x) { return (Math.round((+x || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function tab() {
    var w = document.querySelector("nav.tabs .wrap"); if (!w || document.getElementById("posTab")) return;
    var b = document.createElement("button"); b.type = "button"; b.id = "posTab"; b.setAttribute("aria-selected", "false");
    b.innerHTML = '<span class="i">🖥️</span>نقاط البيع';
    b.addEventListener("click", function () { location.href = "/pos/"; });
    var c = w.querySelector('[data-go="close"]'); if (c && c.nextSibling) w.insertBefore(b, c.nextSibling); else w.appendChild(b);
  }
  var POSV = { show: false };
  var card = null, busy = false, last = 0;
  /* owner 26 Nov («ابنه»): «نقاط البيع» merged into «المبيعات» — its card shows under the sales card whenever المبيعات is open, and its red counter sits on المبيعات */
  function posInSales() { try { return typeof S !== "undefined" && !!S.owner && S.tab === "home" && !JX && !!document.querySelector('#sxV [data-sxv="h|sales"]:not(.ghost)'); } catch (e) { return false; } }
  function sales() {
    var sg = document.getElementById("sgCard"); if (!sg) return;
    if (!card) {
      card = document.createElement("div"); card.className = "card"; card.id = "posSgCard"; card.hidden = true;
      card.innerHTML = '<div id="posSgBody"></div>';
      sg.parentNode.insertBefore(card, sg.nextSibling);
    }
    var vis = POSV.show || posInSales(); card.hidden = !vis;
    if (vis && !busy && Date.now() - last > 4000) load();
  }
  function load() {
    busy = true; last = Date.now();
    fetch("/api/pos/day", { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) return;
      var box = function (k) { var s = j.sum[k] || { n: 0, total: 0, cash: 0, card: 0 }; return '<div style="flex:1;min-width:0;background:var(--brand-soft,#eef6f1);border-radius:12px;padding:10px"><div class="small muted">' + BRN[k] + '</div><div style="font-size:1.35em;font-weight:800;color:var(--brand,#0e5a3c)">' + f2(s.total) + '</div><div class="small muted">' + s.n + ' فاتورة' + (s.rn ? ' · ' + s.rn + ' مرتجع' : '') + '</div><div class="small muted">نقدي ' + f2(s.cash) + ' · شبكة ' + f2(s.card) + '</div></div>'; };
      var inv = (j.inv || []).slice(0, 8).map(function (d) { return '<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid var(--line,#e5e7eb);font-size:.92em' + (d.kind === 'ret' ? ';color:#b91c1c' : '') + '"><span>' + (d.kind === 'ret' ? 'مرتجع ' + fmtNo(d.no) + ' عن ' + fmtNo(d.refNo) : fmtNo(d.no)) + ' · ' + esc(d.u) + ' · ' + (d.br === "del" ? "التوصيل" : "المبيعات") + ' · ' + String(d.t || "").slice(0, 5) + ' · ' + (d.mode === "cash" ? "نقدي" : d.mode === "card" ? "شبكة" : "نقدي + شبكة") + '</span><b>' + f2(d.total) + '</b></div>'; }).join("");
      /* owner 26 Nov: the two branches (with cash / card) sit inside the sales card under its title; the «آخر الفواتير» list is dropped (the sales card already covers it) */
      /* 26 Nov: the branch boxes are drawn by svDraw (period + branch aware) */
      document.getElementById("posSgBody").innerHTML = "";
      /* owner 26 Nov («وردية أحمد وينها»): a shift opened yesterday and still open shows too (the server lists one day only) */
      /* owner 26 Nov («كلها تعرض الورديات المفتوحة سواء اليوم او قبل سنة»): every shift still open, however old, plus today's closed ones */
      var openQ = (typeof S !== "undefined" && S.db) ? S.db.collection("posshift").where("st", "==", "open").get().then(function (sn) { return sn.docs.map(function (d) { return Object.assign({}, d.data(), { id: d.id }); }); }).catch(function () { return []; }) : Promise.resolve([]);
      Promise.all([fetch("/api/pos/shifts", { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json(); }), openQ]).then(function (R) {
        var s = R[0]; if (!s || !s.ok) return; var seen = {}; s.shifts = (s.shifts || []).concat(R[1]).filter(function (h) { if (!h || seen[h.id]) return false; seen[h.id] = 1; return h.day === j.day || h.st !== "closed"; }).sort(function (x, y) { return (y.openAt || 0) - (x.openAt || 0); }); var el = document.getElementById("posSgSh"); if (!el) { el = document.createElement("div"); el.id = "posSgSh"; document.getElementById("posSgBody").appendChild(el); }
        var hm = function (x) { var d = new Date(x); return d.toTimeString().slice(0, 5); }, col = function (v) { return Math.abs(v) < 0.01 ? "color:#15803d" : "color:#b91c1c"; };
        el.innerHTML = '<div style="font-weight:700;margin:12px 0 4px">ورديات اليوم</div>' + (s.shifts.length ? s.shifts.map(function (h) {
          var top = '<div style="display:flex;justify-content:space-between;gap:8px"><b>' + esc(h.u) + ' · ' + (h.br === "del" ? "التوصيل" : "المبيعات") + '</b><span class="small muted">' + (h.day && h.day !== j.day ? h.day.split("-").reverse().map(Number).slice(0, 2).join("/") + " · " : "") + hm(h.openAt) + (h.closeAt ? ' – ' + hm(h.closeAt) : ' · مفتوحة') + '</span></div>';
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
  /* owner 26 Nov («خله المبيعات التوصيل، سمارت الان نبي نوقفه»): the sales browser shows only the POS invoices, as two tabs المبيعات / التوصيل; the Smart Life views are gone */
  var PB = { on: false, per: "new", open: null, data: null, at: 0, busy: false, br: "shop" };
  function ymd(d) { return d.toISOString().slice(0, 10); }
  function pbDays() { var t = new Date(Date.now() + 3 * 3600e3), y = new Date(t.getTime() - 864e5); return PB.per === "today" ? [ymd(t)] : PB.per === "yest" ? [ymd(y)] : [ymd(t), ymd(y)]; }
  function pbLoad() {
    if (PB.busy) return; PB.busy = true;
    var ds = pbDays();
    Promise.all(ds.map(function (d) { return fetch("/api/pos/day?full=1&d=" + d, { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json(); }).catch(function () { return null; }); }))
      .then(function (A) { var L = []; A.forEach(function (j) { if (j && j.ok) L = L.concat(j.inv || []); }); L.sort(function (a, b) { return b.at - a.at; }); PB.data = L; PB.at = Date.now(); pbRender(); })
      .then(function () { PB.busy = false; }, function () { PB.busy = false; });
  }
  function pbTm(d) { var h = +String(d.t).slice(0, 2), m = String(d.t).slice(3, 5), today = ymd(new Date(Date.now() + 3 * 3600e3)); return (h % 12 || 12) + ":" + m + (h < 12 ? " ص" : " م") + (d.day !== today ? " · " + d.day.split("-").reverse().map(function (x) { return +x; }).join("/") : ""); }
  function pbRender() {
    var box = document.getElementById("sbIn"); if (!box || !PB.on) return;
    var L = PB.data ? PB.data.filter(function (d) { return d.br === PB.br; }) : null; if (L && PB.per === "new") L = L.slice(0, 60); var md = function (m) { return m === "cash" ? "نقدي" : m === "card" ? "شبكة" : "نقدي + شبكة"; };
    var list = !L ? '<p class="empty">⏳ يحمّل…</p>' : !L.length ? '<p class="empty">ما فيه فواتير نقاط بيع في هذي الفترة.</p>' : '<ul class="list">' + L.map(function (d, i) {
      var ret = d.kind === "ret", key = d.day + "|" + d.br + "|" + (ret ? "r" : "s") + d.no, open = PB.open === key, n = (d.lines || []).length;
      var det = open ? '<div style="width:100%;margin-top:6px;border-top:1px dashed var(--line);padding-top:6px">' + (d.lines || []).map(function (l) { return '<div class="small" style="display:flex;justify-content:space-between;gap:8px;padding:2px 0"><span>' + esc(l[1]) + ' <span class="muted">× ' + Math.abs(l[3]) + '</span></span><span style="white-space:nowrap">' + f2(l[2]) + ' = <b>' + f2(l[4]) + '</b></span></div>'; }).join("") + '<div class="small" style="margin-top:4px">' + (ret ? "مرتجع رقم " + fmtNo(d.no) + " عن فاتورة " + fmtNo(d.refNo) : "فاتورة رقم " + fmtNo(d.no)) + " · نقدي " + f2(d.cash) + " · شبكة " + f2(d.card) + (d.vat ? " · الضريبة " + f2(d.vat) : "") + '</div></div>' : "";
      return '<li data-posi="' + esc(key) + '" style="flex-wrap:wrap;cursor:pointer' + (ret ? ';color:var(--err-fg,#b91c1c)' : '') + '"><div class="main"><b>' + pbTm(d) + '</b><span class="small muted">' + esc(d.u) + " · " + n + " صنف · " + (d.br === "del" ? "التوصيل" : "المبيعات") + " · " + (ret ? "↩️ مرتجع عن فاتورة " + fmtNo(d.refNo) : md(d.mode)) + '</span></div><span class="amt" style="font-weight:700">' + f2(d.total) + '</span>' + det + '</li>';
    }).join("") + '</ul>';
    var sum = L && L.length ? L.reduce(function (a, x) { return a + (+x.total || 0); }, 0) : 0, cnt = L ? L.filter(function (x) { return x.kind !== "ret"; }).length : 0;
    box.innerHTML = '<div data-posview style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h3 style="margin:0">آخر المبيعات</h3><button class="btn sm ghost" type="button" data-sbx>✕</button></div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:8px 0"><div class="irq" style="margin:0"><button type="button" data-posbr="shop" aria-pressed="' + (PB.br === "shop") + '">المبيعات</button><button type="button" data-posbr="del" aria-pressed="' + (PB.br === "del") + '">التوصيل</button></div><div class="irq" style="margin:0">' + [["new", "🆕 الأحدث"], ["today", "اليوم"], ["yest", "أمس"]].map(function (a) { return '<button type="button" data-posper="' + a[0] + '" aria-pressed="' + (PB.per === a[0]) + '">' + a[1] + '</button>'; }).join("") + '</div></div>'
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
    var bb = t.closest("[data-posbr]"); if (bb) { PB.br = bb.getAttribute("data-posbr"); PB.open = null; pbRender(); return; }
    var pe = t.closest("[data-posper]"); if (pe) { PB.per = pe.getAttribute("data-posper"); PB.data = null; PB.open = null; pbRender(); pbLoad(); return; }
    var li = t.closest("[data-posi]"); if (li) { var k = li.getAttribute("data-posi"); PB.open = PB.open === k ? null : k; pbRender(); }
  }, true);
  setInterval(function () {
    var box = document.getElementById("sbIn"), vis = box && box.offsetParent !== null;
    if (!vis) { PB.on = false; return; }
    if (!PB.on) { PB.on = true; PB.data = null; pbRender(); pbLoad(); return; }
    if (!box.querySelector("[data-posview]")) pbRender(); if (Date.now() - PB.at > 5000) pbLoad();
  }, 400);

  /* owner 26 Nov («فوق مبيعات اليوم وبجنبها عدد الفواتير، تحت فرع المبيعات وفرع التوصيل، والرسم تحت الكل، والدفتر شيلها»):
     the sales card reads the POS for the chosen period and branch; the Smart Life numbers, the users list and the «الدفتر» option are gone */
  var SV = { busy: false, at: 0, key: "", data: null, hr: null, hk: "", hy: null, tap: -1 };
  function svRange() { try { var R = sgRange(); return { f: R.f, t: R.t }; } catch (e) { var d = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); return { f: d, t: d }; } }
  function svAcc() { var a = (typeof S !== "undefined" && S.sgAcc) || "all"; return a === "s" ? "shop" : a === "d" ? "del" : "all"; }
  function svSetAcc(k) { var a = k === "shop" ? "s" : k === "del" ? "d" : "all"; var b = document.querySelector('#sgAcc [data-a="' + a + '"]'); if (b) b.click(); }
  function svDm(d) { return d.split("-").reverse().map(function (x) { return +x; }).slice(0, 2).join("/"); }
  function svBox(t, v, s, k, on) { return '<div' + (k ? ' data-svbr="' + k + '"' : '') + ' style="min-width:0;border-radius:14px;padding:10px 12px;background:' + (on ? "#3C3489;color:#fff" : "#efede6") + (k ? ";cursor:pointer" : "") + '"><div class="small" style="opacity:.75">' + t + '</div><div style="font-size:1.45em;font-weight:800;direction:ltr;text-align:right">' + v + '</div>' + (s ? '<div class="small" style="opacity:.75">' + s + '</div>' : '') + '</div>'; }
  function svDraw() {
    var pb = document.getElementById("posBr"); if (!pb) return; var j = SV.data, A = svAcc(), R = svRange(), one = R.f === R.t, td = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
    if (!j) { if (!pb.__h) pb.innerHTML = '<p class="empty">⏳ يحمّل…</p>'; return; }
    var z = { n: 0, total: 0, cash: 0, card: 0, rn: 0, ret: 0 }, a = A === "all" ? j.all : (j.br[A] || z), sh = j.br.shop || z, dl = j.br.del || z;
    var lbl = one ? (R.f === td ? "مبيعات اليوم" : "مبيعات " + svDm(R.f)) : "المبيعات";
    var h = '<div class="small muted" style="margin:0 0 6px">محدّث ' + (function (t) { var d = new Date(t), h = d.getHours(); return (h % 12 || 12) + ":" + String(d.getMinutes()).padStart(2, "0") + ":" + String(d.getSeconds()).padStart(2, "0") + (h < 12 ? " ص" : " م"); })(SV.got || Date.now()) + '</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'
      + svBox(lbl, f2(a.total), "نقدي " + f2(a.cash) + "<br>شبكة " + f2(a.card))
      + svBox("عدد الفواتير", (a.n || 0).toLocaleString("en-US"), a.n ? "متوسط " + f2((a.total) / a.n) : "")
      + svBox(BRN.shop, f2(sh.total), (sh.n || 0) + " فاتورة" + (sh.rn ? " · " + sh.rn + " مرتجع" : ""), "shop", A === "shop")
      + svBox(BRN.del, f2(dl.total), (dl.n || 0) + " فاتورة" + (dl.rn ? " · " + dl.rn + " مرتجع" : ""), "del", A === "del")
      + '</div><a class="btn sm ghost" href="/pos/" style="display:block;margin-top:8px;text-align:center">فتح نقاط البيع</a>';
    if (pb.__h !== h) { pb.innerHTML = h; pb.__h = h; }
    svChart();
  }
  function svChart() {
    var c = document.getElementById("sgCard"), dc = document.getElementById("dayChart"); if (!c || !dc) return;
    var el = document.getElementById("posChart"); if (!el) { el = document.createElement("div"); el.id = "posChart"; el.style.marginTop = "10px"; dc.parentNode.insertBefore(el, dc.nextSibling); }
    var j = SV.data, A = svAcc(), R = svRange(), one = R.f === R.t, bars = [];
    if (one) { if (!SV.hr || SV.hk !== R.f) { el.innerHTML = ""; return; }
      var H = []; for (var i = 0; i < 24; i++) H.push({ l: (i % 12 || 12) + (i < 12 ? "ص" : "م"), s: 0, d: 0 });
      SV.hr.forEach(function (x) { var k = +String(x.t || "").slice(0, 2); if (!(k >= 0 && k < 24)) return; if (x.br === "del") H[k].d += +x.total || 0; else H[k].s += +x.total || 0; });
      /* owner 27 Nov: yesterday beside today, hour by hour (gray bar), like the old chart */
      var YOK = !!(SV.hy && SV.hyk === R.f); if (YOK) { H.forEach(function (x) { x.y = 0; }); SV.hy.forEach(function (x) { var k = +String(x.t || "").slice(0, 2); if (!(k >= 0 && k < 24)) return; if (A === "shop" && x.br === "del") return; if (A === "del" && x.br !== "del") return; H[k].y += +x.total || 0; }); }
      var lo = 24, hi = -1; H.forEach(function (x, i) { if (x.s || x.d || x.y) { lo = Math.min(lo, i); hi = Math.max(hi, i); } }); if (hi < 0) { el.innerHTML = '<p class="small muted" style="text-align:center">ما فيه مبيعات</p>'; return; }
      bars = H.slice(lo, hi + 1);
    } else { if (!j || !j.dbr) { el.innerHTML = ""; return; }
      var D = {}, d = new Date(R.f + "T12:00:00"), e = new Date(R.t + "T12:00:00"), n = 0;
      var keys = Object.keys(j.days || {}).sort(); if (keys.length && keys[0] > R.f) d = new Date(keys[0] + "T12:00:00");
      var span = Math.round((e - d) / 864e5) + 1, mon = span > 62;
      for (; d <= e && n < 800; d = new Date(d.getTime() + 864e5), n++) { var iso = d.toISOString().slice(0, 10), k = mon ? iso.slice(0, 7) : iso; if (!D[k]) { D[k] = { l: mon ? (+iso.slice(5, 7)) + "/" + iso.slice(2, 4) : svDm(iso), s: 0, d: 0 }; bars.push(D[k]); } var s1 = j.dbr[iso + "|shop"], d1 = j.dbr[iso + "|del"]; if (s1) D[k].s += s1.total; if (d1) D[k].d += d1.total; }
    }
    if (A === "shop") bars.forEach(function (x) { x.d = 0; }); if (A === "del") bars.forEach(function (x) { x.s = 0; });
    var mx = Math.max.apply(null, bars.map(function (x) { return Math.max(x.s + x.d, x.y || 0); }).concat([1])), W = 34, Hh = 150, wd = Math.max(bars.length * W, 40);
    var nB = bars.length, hasY = bars.some(function (x) { return x.y !== undefined; }), BW = hasY ? 10 : W - 12, g = bars.map(function (x, i0) { var i = nB - 1 - i0; var hs = x.s / mx * Hh, hd = x.d / mx * Hh, hy = (x.y || 0) / mx * Hh, X = i * W + 4, on = SV.tap === i0, op = (on || SV.tap < 0 ? 1 : .45); return '<g data-svbar="' + i0 + '" style="cursor:pointer"><rect x="' + (i * W) + '" y="0" width="' + W + '" height="' + (Hh + 30) + '" fill="transparent"/>' + (hy ? '<rect x="' + (X + BW + 1) + '" y="' + (Hh - hy) + '" width="' + BW + '" height="' + hy + '" rx="2" fill="#9a998f" opacity="' + (op * .55) + '"/>' : '') + (hs ? '<rect x="' + X + '" y="' + (Hh - hs) + '" width="' + BW + '" height="' + hs + '" rx="3" fill="#3C3489" opacity="' + op + '"/>' : '') + (hd ? '<rect x="' + X + '" y="' + (Hh - hs - hd) + '" width="' + BW + '" height="' + hd + '" rx="3" fill="#c9a227" opacity="' + op + '"/>' : '') + '<text x="' + (i * W + W / 2) + '" y="' + (Hh + 16) + '" font-size="10" text-anchor="middle" direction="rtl" unicode-bidi="plaintext" fill="#6b6a64">' + x.l + '</text></g>'; }).join("");
    var yTot = "";
    if (hasY) { var nowH = new Date(Date.now() + 3 * 3600e3).getUTCHours(), isTd = R.f === ymd(new Date(Date.now() + 3 * 3600e3)), tT = 0, yT = 0, yAll = 0; H.forEach(function (x, i) { tT += x.s + x.d; yAll += x.y || 0; if (!isTd || i <= nowH) yT += x.y || 0; }); var pc = yT > 0 ? Math.round((tT - yT) / yT * 1000) / 10 : null; yTot = '<div class="small" style="margin:0 0 4px"><b>اليوم ' + f2(tT) + '</b> · أمس ' + (isTd ? 'لنفس الساعة ' : '') + f2(yT) + (pc !== null ? ' <b style="color:' + (pc < 0 ? '#c0392b' : '#2e7d32') + '">' + (pc < 0 ? '▼ ' : '▲ ') + Math.abs(pc) + '%</b>' : '') + (isTd ? ' · أمس كامل ' + f2(yAll) : '') + '</div>'; }
    var t = SV.tap >= 0 && bars[SV.tap] ? bars[SV.tap] : null;
    var cap = t ? '<b>' + t.l + '</b> · ' + f2(t.s + t.d) + (t.y !== undefined ? ' · أمس ' + f2(t.y) : '') + (A === "all" ? ' <span class="muted">(المبيعات ' + f2(t.s) + ' · التوصيل ' + f2(t.d) + ')</span>' : '') : (A === "all" ? '<i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#3C3489;vertical-align:middle"></i> المبيعات &nbsp; <i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#c9a227;vertical-align:middle"></i> التوصيل' : '') + (hasY && !t ? ' &nbsp; <i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#9a998f;opacity:.6;vertical-align:middle"></i> أمس' : '');
    var h = yTot + '<div class="small" style="margin:0 0 4px;min-height:1.4em">' + cap + '</div><div class="scroll-x" style="overflow-x:auto"><svg viewBox="0 0 ' + wd + ' ' + (Hh + 24) + '" width="' + wd + '" height="' + (Hh + 24) + '" direction="ltr" style="display:block">' + g + '</svg></div>';
    if (el.__h !== h) { el.innerHTML = h; el.__h = h; var sx = el.querySelector(".scroll-x"); if (sx && SV.sk !== SV.key) { SV.sk = SV.key; sx.scrollLeft = -1e6; } }
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-svbr]"); if (b) { var k = b.getAttribute("data-svbr"); svSetAcc(svAcc() === k ? "all" : k); SV.tap = -1; setTimeout(svDraw, 50); return; }
    var g = e.target.closest && e.target.closest("[data-svbar]"); if (g) { var i = +g.getAttribute("data-svbar"); SV.tap = SV.tap === i ? -1 : i; svChart(); }
  }, true);
  function svLoad() {
    var R = svRange(), k = R.f + "|" + R.t; if (SV.busy) return; if (k === SV.key && Date.now() - SV.at < 15000) return;
    if (k !== SV.key) { SV.data = null; SV.tap = -1; } SV.key = k; SV.busy = true; SV.at = Date.now(); svDraw();
    var P = [fetch("/api/pos/range?f=" + R.f + "&t=" + R.t, { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json(); })];
    if (R.f === R.t) { P.push(fetch("/api/pos/day?full=1&d=" + R.f, { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json(); })); P.push(fetch("/api/pos/day?full=1&d=" + ymd(new Date(new Date(R.f + "T12:00:00").getTime() - 864e5)), { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json(); })); }
    Promise.all(P).then(function (A) { if (SV.key !== k) return; if (A[0] && A[0].ok) { SV.data = A[0]; SV.got = Date.now(); } if (A[1] && A[1].ok) { SV.hr = A[1].inv || []; SV.hk = R.f; } if (A[2] && A[2].ok) { SV.hy = A[2].inv || []; SV.hyk = R.f; } svDraw(); }).catch(function () { }).then(function () { SV.busy = false; });
  }
  function svTick() {
    var c = document.getElementById("sgCard"); if (!c || c.offsetParent === null || !((typeof S !== "undefined" && S.owner) || document.documentElement.classList.contains("ownV"))) return;
    var pb = document.getElementById("posBr"); if (!pb) { pb = document.createElement("div"); pb.id = "posBr"; pb.style.margin = "8px 0"; } /* owner 26 Nov («أمس وتصفح المبيعات، السطرين هذه حطهم فوق»): the numbers sit under the period and browse rows */
    var sb = document.getElementById("sbOpen"), row = sb; while (row && row.parentElement !== c) row = row.parentElement; if (row) { if (row.nextElementSibling !== pb) row.parentNode.insertBefore(pb, row.nextSibling); } else if (pb.parentNode !== c) c.insertBefore(pb, c.children[1] || null);
    ["sgSum", "dayCap", "dayChart", "sgAtL", "sgNow", "sgUser"].forEach(function (id) { var x = document.getElementById(id); if (x && x.style.display !== "none") x.style.display = "none"; });
    [].forEach.call(c.querySelectorAll("option,#sgAcc button"), function (o) { var t = o.textContent; if (/المحل/.test(t) && !/فرع/.test(t)) o.textContent = "فرع المبيعات"; else if (/^\W*التوصيل$/.test(t.trim())) o.textContent = "فرع التوصيل"; if (o.value === "pos") o.remove(); });
    svLoad();
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
  /* owner 27 Nov: link-orders the cashiers never invoiced (older than 12 hours) — red counter on «طلبات الرابط», and here each one with the invoice that fits it */
  var PLU = { n: 0, at: 0, busy: false, list: [], ok2: "" };
  window.plUnCnt = function () { return PLU.n; };
  function pluLoad(force) {
    if (PLU.busy || !document.body.classList.contains("sxOwn") || (!force && Date.now() - PLU.at < 60000)) return; PLU.busy = true;
    fetch("/api/pos/orders/stale", { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) { if (j && j.ok) { PLU.list = j.orders || []; PLU.n = PLU.list.length; PLU.at = Date.now(); try { plxDraw(); } catch (e) { } } }).catch(function () { }).then(function () { PLU.busy = false; });
  }
  function pluHtml() {
    if (!PLU.list.length) return "";
    var tm = function (t) { var x = +String(t).slice(0, 2); return (x % 12 || 12) + ":" + String(t).slice(3, 5) + (x < 12 ? " ص" : " م"); };
    var bs = "display:block;width:100%;padding:10px;border-radius:12px;font-weight:700;font-size:14px;margin-top:6px;cursor:pointer;";
    return '<div style="border:2px solid #dc2626;border-radius:14px;padding:10px;margin:0 0 12px"><h3 style="margin:0 0 4px;font-size:15px;color:#b91c1c">طلبات لم تُفوتر <span style="background:#dc2626;color:#fff;border-radius:999px;padding:0 8px">' + PLU.n + '</span></h3><p class="small muted" style="margin:0 0 6px">مضى عليها أكثر من 12 ساعة، فاختفت من شاشة الكاشير.</p>'
      + PLU.list.map(function (o) {
        var c = o.cand, k = PLU.ok2 === o.id;
        return '<div style="border-top:1px solid var(--line,#e5e7eb);padding:8px 0;font-size:13px"><b>طلب ' + esc(o.ono) + ' · ' + dm(o.day) + ' ' + tm(o.t) + ' · ' + f2(o.sub) + '</b><br><span class="small muted">' + (o.items || []).length + ' صنف · ' + (o.st === "taken" ? "فتحه " + esc(o.u) + " وما فوتره" : "ما فتحه أحد") + (o.misInv ? " · فُتح وحُفظت بدله فاتورة " + o.misInv + " لا تشبهه" : "") + '</span>'
          + '<div class="small" style="margin-top:4px">' + (o.items || []).slice(0, 8).map(function (x) { return esc(x[0]) + " × " + x[1]; }).join("، ") + ((o.items || []).length > 8 ? "…" : "") + '</div>'
          + (c ? '<button type="button" data-plu="link" data-id="' + esc(o.id) + '" data-day="' + esc(c.day) + '" data-cid="' + esc(c.cid) + '" style="' + bs + 'background:#0f5c43;color:#fff;border:0">اربطه بفاتورة ' + c.no + ' · ' + f2(c.total) + ' · ' + tm(c.t) + ' · ' + esc(c.u) + '</button>' : '<div class="small" style="color:#b91c1c;margin-top:4px">ما لقيت فاتورة تشبهه</div>')
          + '<button type="button" data-plu="close" data-id="' + esc(o.id) + '" style="' + bs + 'background:#fff;color:#b91c1c;border:2px solid #dc2626">' + (k ? "اضغط مرة ثانية للتأكيد" : "أقفله بلا فاتورة") + '</button></div>';
      }).join("") + '</div>';
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-plu]"); if (!b) return;
    var id = b.dataset.id, act = b.dataset.plu;
    if (act === "close" && PLU.ok2 !== id) { PLU.ok2 = id; plxDraw(); setTimeout(function () { if (PLU.ok2 === id) { PLU.ok2 = ""; plxDraw(); } }, 4000); return; }
    PLU.ok2 = ""; b.disabled = true; b.textContent = "⏳";
    fetch("/api/pos/orders/fix", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: id, act: act, day: b.dataset.day, cid: b.dataset.cid }) }).then(function (r) { return r.json(); }).catch(function () { }).then(function () { pluLoad(true); });
  });
  function plxDraw() {
    var b = plxBox(), j = PLX.data; if (!b || !j) return; var R = PLX.r, T = { v: 0, vo: 0, o: 0, dl: 0, pk: 0, s: 0, sn: 0 }, old = false;
    Object.keys(j.days).forEach(function (k) { if (k < R[0] || k > R[1]) return; var d = j.days[k]; T.v += d.v; T.vo += d.vo; T.o += d.o; T.dl += d.dl; T.pk += d.pk; T.s += d.s; if (d.old) old = true; else T.sn += d.o; });
    var no = Math.max(0, T.v - T.vo), pc = T.v ? Math.round(T.vo / T.v * 1000) / 10 : 0;
    var K = function (big, lbl, sub, col) { return '<div style="background:#f4f3ee;border-radius:10px;padding:8px 10px"><div style="font-size:12px;color:#666">' + lbl + '</div><b style="display:block;font-size:20px;line-height:1.4' + (col ? ';color:' + col : '') + '">' + big + '</b>' + (sub ? '<div style="font-size:11px;color:#666">' + sub + '</div>' : '') + '</div>'; };
    var h = pluHtml() + '<div class="grid2">' + K(T.v, "دخلوا الرابط", "كل جوال يُحسب مرة باليوم")
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
  function jcView() { var v = document.getElementById("jcView"); if (!v) { var H = document.getElementById("tab-home"); if (!H) return null; v = document.createElement("div"); v.id = "jcView"; H.parentNode.insertBefore(v, H); } return v; }
  function jdxBox() {
    var v = jcView(); if (!v) return null; var c = document.getElementById("jdxCard");
    if (!c) { c = document.createElement("div"); c.className = "card"; c.id = "jdxCard"; c.hidden = true; v.appendChild(c); }
    return c;
  }
  function jdxDraw() {
    var c = jdxBox(), j = JDX.data; if (!c || !j) return; c.hidden = !JDX.show;
    var K = function (t, v, col) { return '<div style="background:#f4f3ee;border-radius:10px;padding:8px 10px"><div style="font-size:12px;color:#666">' + t + '</div><b style="display:block;font-size:20px;line-height:1.4' + (col ? ';color:' + col : '') + '">' + v + '</b></div>'; };
    var h = '<h2>📦 متابعة الجرد</h2>';
    if (!j.cur) { c.innerHTML = h + '<p class="small muted">ما فيه جرد للحين. يبدأ الجرد أول ما يضغط الكاشير «📋 الجرد» في تبويب الكاشير ويجرد أول صنف.</p>'; return; }
    var R = j.rows || [], cnt = R.filter(function (x) { return !x.nw; }), nw = R.filter(function (x) { return x.nw; }), rn = R.filter(function (x) { return x.rn; }), us = {};
    R.forEach(function (x) { for (var u in (x.by || {})) us[u] = (us[u] || 0) + 1; });
    var open = j.cur.st === "open", dd = dm(j.cur.day || ymd(new Date(j.cur.at + 3 * 3600e3)));
    var sd = new Date(j.cur.at), sh = sd.getHours();
    h += '<p style="margin:0 0 8px;font-weight:700;color:' + (open ? "#ea5b2b" : "#555") + '">' + (open ? "جاري الجرد" : "آخر جرد معتمد") + ' · بدأ ' + sd.getDate() + "/" + (sd.getMonth() + 1) + " " + (sh % 12 || 12) + ":" + String(sd.getMinutes()).padStart(2, "0") + (sh < 12 ? " ص" : " م") + ' · انجرد ' + cnt.length.toLocaleString("en-US") + ' صنف</p>';
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
  function jdxTick() { var h = document.getElementById("tab-home"); if (!h || h.hidden) return; jdxBox(); if (JDX.show) jdxLoad(false); }
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-jdt]"); if (t) { JDX.tab = t.dataset.jdt; jdxDraw(); return; }
    if (e.target.closest && e.target.closest("#jdxOk")) {
      if (!(JDX.ok2 && Date.now() - JDX.ok2 < 4000)) { JDX.ok2 = Date.now(); jdxDraw(); setTimeout(jdxDraw, 4100); return; }
      JDX.ok2 = 0; var b = document.getElementById("jdxOk"); if (b) { b.disabled = true; b.textContent = "⏳ يعتمد…"; }
      fetch("/api/jard/close", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" }).then(function (x) { return x.json(); }).then(function () { jdxLoad(true); }).catch(function () { jdxLoad(true); });
    }
  });

  /* cashier tab: «📋 الجرد» — scan with the phone camera (or type), write the count, save */
  var JC = { on: false, c: null, set: false, mine: [], cam: null, zx: null, t: null, busy: false };
  function jcWho() { var w = ""; try { w = (typeof curCashier === "function" && curCashier()) || ""; } catch (e) { } return w || (document.body.classList.contains("sxOwn") ? "المالك" : ""); }
  function jcQ(p) { return p + (p.indexOf("?") < 0 ? "?" : "&") + "who=" + encodeURIComponent(jcWho()); }
  function jcGet(p) { return fetch(jcQ(p), { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json(); }); }
  var JCW = (function () { function w(parts) { var sr = 22050, n = 0; parts.forEach(function (p) { n += Math.round(p[1] * sr); }); var b = new DataView(new ArrayBuffer(44 + n * 2)), s = function (o, t) { for (var i = 0; i < t.length; i++) b.setUint8(o + i, t.charCodeAt(i)); }; s(0, "RIFF"); b.setUint32(4, 36 + n * 2, true); s(8, "WAVEfmt "); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true); b.setUint32(24, sr, true); b.setUint32(28, sr * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); s(36, "data"); b.setUint32(40, n * 2, true); var o = 44; parts.forEach(function (p) { var m = Math.round(p[1] * sr); for (var i = 0; i < m; i++) { var v = p[0] ? (Math.sin(2 * Math.PI * p[0] * i / sr) > 0 ? 0.6 : -0.6) : 0; b.setInt16(o, v * 32767, true); o += 2; } }); var u = new Uint8Array(b.buffer), str = ""; for (var i = 0; i < u.length; i++) str += String.fromCharCode(u[i]); return "data:audio/wav;base64," + btoa(str); } return { ok: w([[1050, .12]]), bad: w([[380, .22], [0, .08], [380, .22], [0, .08], [260, .5]]) }; })();
  function jcBeep(ok) { try { var a = new Audio(ok ? JCW.ok : JCW.bad); a.play().catch(function () { }); } catch (e) { } try { if (!ok && navigator.vibrate) navigator.vibrate([200, 80, 200]); } catch (e) { } }
  function jcBtnInject() {
    var M = document.getElementById("cwMenu"); if (!M) return;
    var T = document.getElementById("tab-close"); if (T && T.dataset.cw && T.dataset.cw !== "menu") return;
    var ob = M.querySelector("[data-jcgo]"); if (ob) ob.remove();
    if (false) { var sk = M.querySelectorAll('[data-cwgo="sk"]'), last = sk[sk.length - 1]; var b = document.createElement("button"); b.type = "button"; b.className = "btn ghost"; b.setAttribute("data-jcgo", "1"); b.setAttribute("style", last ? (last.getAttribute("style") || "") : "display:block;width:100%;padding:16px 12px;margin:8px 0;border-radius:14px;font-size:1.15em;font-weight:800;text-align:center"); b.textContent = "📋 الجرد"; if (last) last.parentNode.insertBefore(b, last.nextSibling); else M.appendChild(b); }
  }
  function jcBox() { var v = jcView(); if (!v) return null; var b = document.getElementById("jcBox"); if (!b) { b = document.createElement("div"); b.id = "jcBox"; b.hidden = true; v.insertBefore(b, v.firstChild); } else if (b.parentNode !== v) v.insertBefore(b, v.firstChild); return b; }
  function jcOpen() {
    var b = jcBox(); if (!b) return; JC.on = true; document.body.classList.add("jcFull"); b.hidden = false; try { window.scrollTo({ top: 0 }); } catch (e) { } if (document.body.classList.contains("sxOwn")) { JDX.show = true; var jc = jdxBox(); if (jc) jc.hidden = false; jdxLoad(true); }
    var BS = 'display:block;width:100%;padding:14px 12px;margin:8px 0;border-radius:14px;font-size:1.1em;font-weight:800;text-align:center';
    b.innerHTML = '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">📋 الجرد</h2><button type="button" class="btn sm ghost" data-jcback>رجوع</button></div>'
      + '<div class="small muted" id="jcProg" style="margin:6px 0 8px"></div>'
      + '<div style="display:flex;gap:8px"><button type="button" class="btn" data-jccam style="' + BS + ';flex:2">📷 امسح بالكاميرا</button><button type="button" class="btn ghost" data-jcphoto style="' + BS + ';flex:1">📸 صوّر</button></div>'
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
  function jcClose() { jcCamStop(); JC.on = false; JC.c = null; document.body.classList.remove("jcFull"); var b = document.getElementById("jcBox"); if (b) b.hidden = true; JDX.show = false; var jc = document.getElementById("jdxCard"); if (jc) jc.hidden = true; }
  function jcShow(code, name, isNew, set, q) {
    JC.c = { c: code, n: name || "", nw: !!isNew }; JC.set = !!set; JC.cid = null; jcCamStop();
    var g = function (id) { return document.getElementById(id); };
    g("jcList").innerHTML = ""; g("jcCur").hidden = false; g("jcName").textContent = name || ""; g("jcName").hidden = !!isNew; g("jcNameIn").hidden = !isNew; g("jcNameIn").value = isNew ? "" : (name || ""); g("jcCode").textContent = code;
    document.querySelector("[data-jcren]").hidden = !!isNew; g("jcN").value = set && q != null ? q : ""; g("jcQL").textContent = set ? "العدد الصحيح (يستبدل اللي قبله)" : "العدد الموجود على الرف (ينضاف على اللي قبله)";
    if (isNew) { g("jcWarn").innerHTML = "🔊 باركود <b dir=ltr>" + esc(code) + "</b> غير مسجل — اكتب اسمه وعدده وينضاف"; g("jcWarn").hidden = false; jcBeep(false); g("jcNameIn").focus(); }
    else { g("jcWarn").hidden = true; jcBeep(true); setTimeout(function () { g("jcN").focus(); }, 50); }
    g("jcCur").scrollIntoView({ block: "center", behavior: "smooth" });
  }
  function jcFind(t) {
    t = String(t || "").trim().replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 1632; }).replace(/[۰-۹]/g, function (d) { return d.charCodeAt(0) - 1776; }); if (!t) return; var L = document.getElementById("jcList");
    /* owner 24 Nov: a full barcode that is not in the catalogue is a new item; part of a barcode lists the matches (never a wrong «new item») */
    if (/^\d{4,}$/.test(t)) { jcGet("/api/jard/find?code=" + encodeURIComponent(t)).then(function (j) { if (!j.ok) return; if (j.hit) { jcShow(j.hit[0], j.hit[1], false); return; }
        jcGet("/api/jard/find?q=" + encodeURIComponent(t)).then(function (k) { var A = (k && k.list) || []; JC.hits = A;
          if (A.length === 1 && t.length < 8) { jcShow(A[0][0], A[0][1], false); return; }
          if (A.length && t.length < 8) { L.innerHTML = A.map(function (x, i) { return '<div data-jch="' + i + '" style="padding:10px 4px;border-bottom:1px solid var(--line,#e5e7eb);cursor:pointer">' + esc(x[1]) + ' <span class="small muted" dir="ltr">' + esc(x[0]) + '</span></div>'; }).join(""); return; }
          if (t.length >= 8) jcShow(t, "", true); else L.innerHTML = '<p class="small muted">ما لقيت صنف بهالرقم — اكتب الباركود كامل أو اسم الصنف</p>'; }); }).catch(function () { L.innerHTML = '<p class="small" style="color:#b91c1c">تعذّر الاتصال</p>'; }); return; }
    jcGet("/api/jard/find?q=" + encodeURIComponent(t)).then(function (j) { var A = (j && j.list) || []; JC.hits = A;
      L.innerHTML = A.length ? A.map(function (x, i) { return '<div data-jch="' + i + '" style="padding:10px 4px;border-bottom:1px solid var(--line,#e5e7eb);cursor:pointer">' + esc(x[1]) + ' <span class="small muted" dir="ltr">' + esc(x[0]) + '</span></div>'; }).join("") : '<p class="small muted">ما لقيت صنف بهالاسم</p>'; }).catch(function () { });
  }
  function jcCamStop() { try { if (JC.zx) JC.zx.reset(); } catch (e) { } JC.zx = null; if (JC.cam) { JC.cam.getTracks().forEach(function (t) { t.stop(); }); JC.cam = null; } var w = document.getElementById("jcCamW"); if (w) w.hidden = true; }
  function loadZX() {
    if (window.ZXing) return Promise.resolve();
    if (window.__zxp) return window.__zxp;
    var U = ["https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js", "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js"];
    window.__zxp = new Promise(function (ok, no) {
      var i = 0, nx = function () { if (i >= U.length) { window.__zxp = null; no(); return; } var sc = document.createElement("script"); sc.src = U[i++]; sc.onload = function () { window.ZXing ? ok() : nx(); }; sc.onerror = nx; document.head.appendChild(sc); }; nx();
    });
    return window.__zxp;
  }
  /* owner 24 Nov: live video reading failed on the shop phones — take a photo instead and read it (phone reader, then ZXing, then the server reads the printed digits) */
  function jcSt(t) { var e = document.getElementById("jcCamS"); if (!e) { var cw = document.getElementById("jcCamW"); if (!cw) return; e = document.createElement("div"); e.id = "jcCamS"; e.style.cssText = "margin:0 0 8px;font-weight:700"; cw.parentNode.insertBefore(e, cw.nextSibling); } e.textContent = t; }
  /* owner 24 Nov: «يقرأ دايركت» — live camera, no photo/confirm step. Each frame: phone reader, then ZXing on a sharp centre crop; every 3 s a frame goes to the server which reads the printed digits */
  function jcCam() {
    if (JC.cam) { jcCamStop(); jcSt(""); return; }
    var w = document.getElementById("jcCamW"), v = document.getElementById("jcVid"); w.hidden = false; jcSt("⏳ يفتح الكاميرا…");
    var done = false, busyS = false, lastS = 0, t0 = Date.now(), bd = null, rd = null;
    var hit = function (code) { code = String(code || "").replace(/\s/g, ""); if (!code || done) return; done = true; jcCamStop(); jcSt(""); document.getElementById("jcIn").value = code; jcFind(code); };
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }).then(function (st0) {
      JC.cam = st0; v.srcObject = st0; v.play();
      try { var tr = st0.getVideoTracks()[0], cp = tr.getCapabilities ? tr.getCapabilities() : {}; if (cp.focusMode && cp.focusMode.indexOf("continuous") >= 0) tr.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch (e) { }
      if ("BarcodeDetector" in window) { try { bd = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"] }); } catch (e) { try { bd = new BarcodeDetector(); } catch (e2) { } } }
      loadZX().then(function () { var h = new Map(); h.set(ZXing.DecodeHintType.TRY_HARDER, true); rd = new ZXing.MultiFormatReader(); rd.setHints(h); }).catch(function () { });
      jcSt("📷 وجّه الكاميرا على الباركود — يقرأ لوحده");
      var cv = document.createElement("canvas"), cx = cv.getContext("2d", { willReadFrequently: true });
      var loop = function () {
        if (done || !JC.cam) return;
        if (Date.now() - t0 > 45000) { jcCamStop(); jcSt("ما انقرأ — اضغط الكاميرا مرة ثانية أو اكتب الرقم اللي تحت الباركود"); return; }
        var W = v.videoWidth, H = v.videoHeight; if (!W) { setTimeout(loop, 150); return; }
        var p1 = bd ? bd.detect(v).then(function (r) { if (r && r[0] && r[0].rawValue) hit(r[0].rawValue); }).catch(function () { }) : Promise.resolve();
        p1.then(function () {
          if (done) return;
          var cw = Math.round(W * 0.9), ch = Math.round(H * 0.6), sx = Math.round((W - cw) / 2), sy = Math.round((H - ch) / 2);
          cv.width = cw; cv.height = ch; cx.drawImage(v, sx, sy, cw, ch, 0, 0, cw, ch);
          if (rd) {
            try { var d = cx.getImageData(0, 0, cw, ch).data, L = new Uint8ClampedArray(cw * ch); for (var i = 0, j = 0; i < L.length; i++, j += 4) L[i] = (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 1000;
              var src = new ZXing.RGBLuminanceSource(L, cw, ch); try { hit(rd.decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(src))).getText()); } catch (e) { try { hit(rd.decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(src.rotateCounterClockwise()))).getText()); } catch (e2) { } } } catch (e) { }
          }
          if (!done && !busyS && Date.now() - t0 > 2500 && Date.now() - lastS > 3000) {
            busyS = true; lastS = Date.now(); var k = Math.min(1, 1400 / Math.max(cw, ch)), c2 = document.createElement("canvas"); c2.width = Math.round(cw * k); c2.height = Math.round(ch * k); c2.getContext("2d").drawImage(cv, 0, 0, c2.width, c2.height);
            fetch(jcQ("/api/jard/read"), { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ b64: c2.toDataURL("image/jpeg", 0.85).split(",")[1] }) }).then(function (r) { return r.json(); }).then(function (j) { if (j && j.ok && j.code && j.code.length >= 6) hit(j.code); }).catch(function () { }).then(function () { busyS = false; });
          }
          setTimeout(loop, 200);
        });
      };
      loop();
    }).catch(function () { jcCamStop(); jcSt("ما سمحت للكاميرا — اسمح لها من إعدادات المتصفح، أو اكتب الرقم"); });
  }
  function jcRead(f) {
    jcSt("⏳ يقرأ الباركود…");
    var done = false, hit = function (code) { code = String(code || "").replace(/\s/g, ""); if (!code || done) return; done = true; jcSt(""); document.getElementById("jcIn").value = code; jcFind(code); };
    var url = URL.createObjectURL(f), img = new Image();
    img.onerror = function () { jcSt("ما قدرت أفتح الصورة — صوّر مرة ثانية"); };
    img.onload = function () {
      var W = img.naturalWidth, H = img.naturalHeight, cv = function (mx) { var k = Math.min(1, mx / Math.max(W, H)), c = document.createElement("canvas"); c.width = Math.round(W * k); c.height = Math.round(H * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); return c; };
      var server = function () {
        if (done) return; jcSt("⏳ يقرأ الرقم من الصورة…");
        var c = cv(1400), b64 = c.toDataURL("image/jpeg", 0.85).split(",")[1];
        fetch(jcQ("/api/jard/read"), { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ b64: b64 }) }).then(function (r) { return r.json(); }).then(function (j) { if (j && j.ok && j.code && j.code.length >= 6) hit(j.code); else if (!done) jcSt("ما انقرأ — قرّب الباركود وصوّر مرة ثانية، أو اكتب الرقم اللي تحته"); }).catch(function () { if (!done) jcSt("ما انقرأ — تأكد من الإنترنت أو اكتب الرقم اللي تحت الباركود"); });
      };
      var zx = function () {
        if (done) return;
        loadZX().then(function () {
          var h = new Map(); h.set(ZXing.DecodeHintType.TRY_HARDER, true);
          var rd = new ZXing.MultiFormatReader(); rd.setHints(h);
          var sizes = [1600, 1000, 2400];
          for (var i = 0; i < sizes.length && !done; i++) {
            var c = cv(sizes[i]), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, L = new Uint8ClampedArray(c.width * c.height);
            for (var p = 0, q = 0; p < L.length; p++, q += 4) L[p] = (d[q] * 299 + d[q + 1] * 587 + d[q + 2] * 114) / 1000;
            var src = new ZXing.RGBLuminanceSource(L, c.width, c.height);
            var tries = [src]; try { tries.push(src.rotateCounterClockwise()); } catch (e) { }
            for (var t = 0; t < tries.length && !done; t++) { try { hit(rd.decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(tries[t]))).getText()); } catch (e) { } }
          }
          server();
        }).catch(server);
      };
      if ("BarcodeDetector" in window) { try { new BarcodeDetector().detect(img).then(function (r) { if (r && r[0] && r[0].rawValue) hit(r[0].rawValue); else zx(); }).catch(zx); } catch (e) { zx(); } } else zx();
    };
    img.src = url;
  }
  function jcSave() {
    if (!JC.c || JC.busy) return; var g = function (id) { return document.getElementById(id); };
    var v = String(g("jcN").value || "").trim().replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 1632; }).replace(/[٫,]/g, ".");
    if (v === "" || isNaN(+v) || +v < 0 || (+v === 0 && !JC.set)) { g("jcN").focus(); return; }
    if (!JC.cid) JC.cid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    var nm = !g("jcNameIn").hidden ? g("jcNameIn").value.trim() : ""; if (JC.c.nw && !nm) { g("jcNameIn").focus(); return; }
    JC.busy = true; var sb = document.querySelector("[data-jcsave]"); sb.disabled = true; sb.textContent = "⏳ يحفظ…";
    fetch(jcQ("/api/jard/count"), { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: JC.c.c, q: +v, set: JC.set, cid: JC.cid, name: nm && nm !== JC.c.n ? nm : "" }) }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.ok) { JC.cid = null; jcBeep(true); g("jcCur").hidden = true; g("jcWarn").hidden = true; g("jcIn").value = ""; JC.c = null; g("jcProg").innerHTML = '<b style="color:#15803d">✓ ' + esc(j.row.rn || j.row.name) + ' · المجموع ' + j.row.q + '</b>'; jcLoad(true); }
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
    
    
    if (t.closest("[data-jcback]")) { jcClose(); return; }
    if (t.closest("[data-jccam]")) { jcCam(); return; } if (t.closest("[data-jcphoto]")) { jcCamStop(); var fi = document.getElementById("jcFile"); if (!fi) { fi = document.createElement("input"); fi.type = "file"; fi.accept = "image/*"; fi.setAttribute("capture", "environment"); fi.id = "jcFile"; fi.style.display = "none"; document.body.appendChild(fi); fi.addEventListener("change", function () { var f = fi.files && fi.files[0]; fi.value = ""; if (f) jcRead(f); }); } fi.click(); return; }
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
  function jcTick() { jcBtnInject(); }

  /* owner 24 Nov: «الجرد» and «نقاط البيع» are squares in the same top bar as المبيعات/الدرج/…, and open their card under it */
  var JXST = document.createElement("style");
  JXST.textContent = "body.jcFull nav.tabs button[aria-selected=true]:not(#jcNavB){color:var(--muted)!important;background:none!important}body.jcFull #jcNavB{color:var(--brand)!important;background:var(--brand-soft)!important}#jcView{display:none}body.jcFull #jcView{display:block}body.jcFull section[data-tab]{display:none!important}body.jcFull [data-jcback]{display:none!important}body.jxOn #tab-home>:not(#sxV):not(#jdxCard):not(#posSgCard):not(#jcBox):not(#ztCard){display:none!important}#ztCard{display:none}body.jxZ #ztCard{display:block}body.jxZ #tab-home>#posSgCard,body.jxZ #tab-home>#jdxCard{display:none!important}body.jcOn [data-jcback]{display:none!important}body.jxJ #tab-home>#posSgCard{display:none!important}body.jxP #tab-home>#jdxCard{display:none!important}";
  document.head.appendChild(JXST);
  var JX = "";
  function jxSet(k) {
    JX = k; JDX.show = k === "j"; POSV.show = k === "p";
    document.body.classList.toggle("jxOn", !!k); document.body.classList.toggle("jxJ", k === "j"); document.body.classList.toggle("jxP", k === "p"); document.body.classList.toggle("jxZ", k === "z"); if (k === "z") { try { ztLoad(); } catch (e) { } }
    try { jdxBox();  } catch (e) { }
    try { sales(); } catch (e) { }
  }
  function jxTiles() {
    var v = document.getElementById("sxV");
    if (!v || !document.body.classList.contains("sxOwn")) return;
    if (typeof S !== "undefined" && S.tab !== "home" && JX) jxSet("");
    var oldP = v.querySelector('[data-jx="p"]'); if (oldP) oldP.remove();
    [["z", "الربط مع الهيئة"]].forEach(function (t) {
      var b = v.querySelector('[data-jx="' + t[0] + '"]');
      if (!b) { b = document.createElement("button"); b.type = "button"; b.dataset.jx = t[0]; b.textContent = t[1]; }
      var anc = t[0] === "j" ? v.querySelector('[data-sxv="c|sk"]') : null; if (anc) { if (anc.nextSibling !== b) anc.parentNode.insertBefore(b, anc.nextSibling); } else if (b.parentNode !== v) v.appendChild(b);
      var cls = "btn sm" + (JX === t[0] ? "" : " ghost"); if (b.className !== cls) b.className = cls;
    });
    [].forEach.call(v.querySelectorAll("[data-sxv]"), function (b) { if (JX && !b.classList.contains("ghost")) b.classList.add("ghost"); });
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-jx]");
    if (t) { var k = t.dataset.jx; try { if (S.tab !== "home") go("home"); } catch (x) { } jxSet(JX === k ? "" : k); jxTiles(); try { window.scrollTo({ top: 0 }); } catch (x) { } return; }
    if (JX && e.target.closest && (e.target.closest("[data-sxv]") || e.target.closest("nav.tabs"))) jxSet("");
  }, true);
  setInterval(function () { try { jxTiles(); } catch (e) { } }, 300);

  /* owner 24 Nov: «الربط مع الهيئة» — the shop branch's ZATCA (Fatoora phase 2) link: a test on ZATCA's test portal, then the real link with the OTP; owner only */
  var ZT = { d: null, busy: false, at: 0 };
  var ZTS = { csid: "طلب الشهادة", doc388: "فاتورة مبسطة", doc381: "إشعار دائن (مرتجع)", doc383: "إشعار مدين", pcsid: "شهادة الإنتاج" };
  function ztLoad() {
    if (ZT.busy) return;
    fetch("/api/zatca/status", { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) { if (j && j.ok) { ZT.d = j; ZT.at = Date.now(); ztDraw(); } }).catch(function () { });
  }
  function ztErrs(r) { if (!r || r.ok) return 0; var n = 0; (r.log || []).forEach(function (x) { n += (x.err && x.err.length) || (x.status && x.status !== 200 && x.status !== 202 ? 1 : 0); }); return n || 1; }
  function ztRes(r, ttl) {
    if (!r) return '<div class="small muted" style="margin-top:8px">' + ttl + ': لم تُجرَّب بعد</div>';
    var d = new Date(r.at), when = d.getDate() + "/" + (d.getMonth() + 1) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    var h = '<div style="margin-top:10px;border-top:1px solid var(--line,#e5e7eb);padding-top:8px"><b>' + ttl + " · " + when + ' · <span style="color:' + (r.run ? "#b45309" : r.ok ? "#15803d" : "#c2410c") + '">' + (r.run ? "جارية…" : r.ok ? "نجحت" : "لم تنجح") + "</span></b>";
    (r.log || []).forEach(function (x) {
      var good = (x.status === 200 || x.status === 202) && !(x.err && x.err.length);
      h += '<div class="small" style="margin-top:6px"><b style="color:' + (good ? "#15803d" : "#c2410c") + '">' + (good ? "✓ " : "✗ ") + (ZTS[x.s] || x.s) + "</b>" + (x.rep ? " · " + esc(x.rep) : "") + (good ? "" : " · رمز " + x.status) + "</div>";
      (x.err || []).forEach(function (m) { h += '<div class="small" style="color:#c2410c">' + esc(m.code || "") + " " + esc(m.message || "") + "</div>"; });
      (x.warn || []).forEach(function (m) { h += '<div class="small muted">تنبيه: ' + esc(m.code || "") + " " + esc(m.message || "") + "</div>"; });
      if (!good && x.t) h += '<div class="small muted" style="direction:ltr;text-align:left;word-break:break-all">' + esc(String(x.t).slice(0, 300)) + "</div>";
    });
    return h + "</div>";
  }
  var ZL = { d: null, f: "all", at: 0, o: "" };
  function ztList() { fetch("/api/zatca/list", { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) { if (j && j.ok) { ZL.d = j; ZL.at = Date.now(); ztDraw(); } }).catch(function () { }); }
  function ztKind(x) { return x.st === "err" ? "e" : x.st === "ok" || x.st === "warn" ? "o" : "p"; }
  function ztListH() {
    var d = ZL.d; if (!d) return '<div class="small muted" style="margin:8px 0">جاري تحميل قائمة الفواتير…</div>';
    var it = d.items || [], n = { o: 0, p: 0, e: 0 }; it.forEach(function (x) { n[ztKind(x)]++; });
    var col = { o: "#15803d", p: "#b45309", e: "#c2410c" }, nm = { o: "وصلت", p: "معلّقة", e: "مرفوضة" };
    var bs = "padding:10px 4px;border-radius:12px;font-size:15px;border:1px solid var(--line,#e5e7eb);background:none";
    var h = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:6px 0">' + ["o", "p", "e"].map(function (k) { return '<button type="button" data-zlf="' + k + '" style="' + bs + (ZL.f === k ? ";border:2px solid " + col[k] : "") + '"><b style="color:' + col[k] + ';font-size:20px">' + n[k] + '</b><div class="small">' + nm[k] + "</div></button>"; }).join("") + "</div>" +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin:2px 0 6px"><span class="small muted">' + (ZL.f === "all" ? "كل الفواتير" : "المعروض: " + nm[ZL.f]) + (ZL.f !== "all" ? ' · <a href="#" data-zlf="all">الكل</a>' : "") + '</span><button type="button" class="btn sm ghost" data-zlr="1">تحديث</button></div>';
    var rows = it.filter(function (x) { return ZL.f === "all" || ztKind(x) === ZL.f; });
    if (!rows.length) return h + '<div class="small muted" style="padding:8px 0">لا توجد فواتير.</div>';
    return h + rows.slice(0, 60).map(function (x) {
      var k = ztKind(x), id = x.day + "|" + x.no + "|" + x.ret, no = (x.ret ? "R" : "") + fmtNo(x.no), op = ZL.o === id;
      return '<div data-zlo="' + esc(id) + '" style="border-top:1px solid var(--line,#e5e7eb);padding:8px 0"><div style="display:flex;justify-content:space-between;gap:8px"><b style="direction:ltr">' + esc(no) + '</b><b style="color:' + col[k] + '">' + (x.st === "warn" ? "وصلت (تنبيه)" : nm[k]) + '</b></div><div class="small muted">' + esc(x.day.slice(8) + "/" + x.day.slice(5, 7)) + " " + esc(x.t) + " · " + x.tot + " ريال</div>" +
        (op ? '<div class="small" style="margin-top:4px">تسلسل الهيئة: ' + x.icv + (x.ret && x.ref ? " · عن فاتورة " + esc(fmtNo(x.ref)) : "") + (x.rt ? " · أُرسلت " + new Date(x.rt).getHours() + ":" + String(new Date(x.rt).getMinutes()).padStart(2, "0") : "") + ((x.m || []).length ? '<div style="color:' + col[k] + ';direction:ltr;text-align:left">' + esc(x.m.join(" | ")) + "</div>" : "") + "</div>" : "") + "</div>";
    }).join("");
  }
  function ztDraw() {
    var home = document.getElementById("tab-home"); if (!home) return;
    var c = document.getElementById("ztCard"); if (!c) { c = document.createElement("div"); c.id = "ztCard"; c.className = "card"; home.appendChild(c); }
    var j = ZT.d || {}, t = j.test, p = j.prod, S2 = j.seller || {};
    var rl = j.relay, rOn = rl && j.now - rl.at < 120000, run = (t && t.run) || (p && p.run);
    var rh = rOn ? '<div class="small" style="margin:4px 0 8px">الاتصال بالهيئة: <b style="color:#15803d">' + (rl.v === "page" ? "من الدفتر على الجهاز المفتوح" : "من كمبيوتر المحل") + "</b></div>" : '<div style="margin-bottom:8px"></div>';
    var st = j.linked ? '<b style="color:#15803d">مربوط بالهيئة</b>' : t && t.ok ? "التجربة نجحت — جاهز للربط الفعلي" : "غير مربوط";
    var bx = "display:block;width:100%;padding:16px 8px;border-radius:14px;font-size:16px";
    var h = '<h3 style="margin:0 0 4px">مبيعات — نقاط البيع</h3><div class="small muted">' + esc(S2.name || "") + " · " + esc(S2.vat || "") + "<br>" + esc((S2.bld || "") + " " + (S2.street || "") + "، " + (S2.dist || "") + "، " + (S2.city || "") + " " + (S2.zip || "")) + '</div><div style="margin:8px 0 0">الحالة: ' + st + "</div>" + rh +
      (j.linked ? ztListH() : "") +
      (j.linked ? '<div class="small" style="margin:0 0 8px">فواتير موقّعة: <b>' + (j.signed || 0) + '</b> · بانتظار الإرسال للهيئة: <b style="color:' + (j.pend ? "#b45309" : "#15803d") + '">' + (j.pend || 0) + "</b></div>" : "") +
      ((j.errs || []).length ? '<div style="border:2px solid #c2410c;border-radius:14px;padding:10px;margin:0 0 10px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="color:#c2410c">فواتير رفضتها الهيئة (' + j.errs.length + ')</b><button type="button" class="btn sm ghost" data-zterr="1">شفتها</button></div>' + j.errs.slice(-10).reverse().map(function (e) { return '<div class="small" style="margin-top:6px"><b>' + esc(e.no) + "</b> · " + esc(e.day) + '<div class="muted" style="direction:ltr;text-align:left">' + esc((e.m || []).join(" | ")) + "</div></div>"; }).join("") + "</div>" : "") +
      (j.relayReq ? '<div style="border:2px solid #c2410c;border-radius:14px;padding:10px;margin:0 0 10px"><b>جهاز يطلب أن يكون وسيط الهيئة</b><div class="small muted" style="margin:4px 0 8px">' + (/Windows/.test(j.relayReq.ua) ? "كمبيوتر ويندوز" : "جهاز") + " · " + (/Chrome/.test(j.relayReq.ua) ? "كروم" : "متصفح") + " · " + new Date(j.relayReq.at).getHours() + ":" + String(new Date(j.relayReq.at).getMinutes()).padStart(2, "0") + '</div><button type="button" class="btn" data-ztok="1" style="display:block;width:100%;padding:14px;border-radius:14px;font-size:16px">اعتماده (كمبيوتر المحل)</button></div>' : "") +
      (run ? '<div style="padding:14px;text-align:center"><b>' + (rOn ? "جاري الإرسال للهيئة عن طريق الوسيط…" : "بانتظار كمبيوتر المحل — يكون شغّال وكروم مفتوح") + "</b></div>" : ZT.busy ? '<div style="padding:14px;text-align:center"><b>جاري الاتصال بالهيئة…</b></div>' :
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button type="button" class="btn ghost" data-zt="test" style="' + bx + '">تجربة الربط</button><button type="button" class="btn' + (t && t.ok ? "" : " ghost") + '" data-zt="prod" style="' + bx + '">الربط الفعلي</button></div>' +
      (t && t.ok && !j.linked ? '<input id="ztOtp" inputmode="numeric" maxlength="6" placeholder="رمز OTP من بوابة فاتورة (6 أرقام)" style="width:100%;margin-top:8px;padding:12px;font-size:16px;text-align:center">' : "")) +
      '<div id="ztMsg" class="small" style="color:#c2410c;margin-top:6px"></div>' + ztRes(t, "التجربة") + (p ? ztRes(p, "الربط الفعلي") : "");
    if (c.__h !== h) { var ov = document.getElementById("ztOtp"); var keep = ov ? ov.value : ""; c.innerHTML = h; c.__h = h; var nv = document.getElementById("ztOtp"); if (nv && keep) nv.value = keep; }
    var n = j.relayReq ? 1 : j.linked ? (j.errs || []).length : ztErrs(p && !p.ok ? p : t);
    pvBadge(document.querySelector('[data-jx="z"]'), n);
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-zt]"); if (!b || ZT.busy) return;
    var m = document.getElementById("ztMsg"), k = b.dataset.zt, body = {};
    if (k === "prod") {
      var t = ZT.d && ZT.d.test; if (!t || !t.ok) { if (m) m.textContent = "اضغط «تجربة الربط» أولاً، ولما تنجح يتفعّل الربط الفعلي."; return; }
      var o = document.getElementById("ztOtp"), v = o ? o.value.replace(/\D/g, "") : ""; if (v.length !== 6) { if (m) m.textContent = "اكتب رمز OTP من بوابة فاتورة (6 أرقام)."; if (o) o.focus(); return; }
      body.otp = v;
    }
    ZT.busy = true; ztDraw();
    fetch(k === "prod" ? "/api/zatca/onboard" : "/api/zatca/test", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); }).catch(function () { return null; })
      .then(function (j) { ZT.busy = false; if (!j || !j.ok) { ztLoad(); setTimeout(function () { var mm = document.getElementById("ztMsg"); if (mm) mm.textContent = "ما تم الاتصال، حاول مرة ثانية."; }, 400); return; } ztLoad(); });
  });
  /* owner 24 Nov: the ledger page itself tries to be the relay — it takes the queued ZATCA request and sends it from this phone/browser (Saudi internet); if the browser blocks it, ZATCA's answer is replaced by the reason */
  var ZR = { busy: false };
  function ztRelay() {
    if (ZR.busy) return; ZR.busy = true;
    fetch("/api/zrelay/next?v=page", { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.job) return;
      var job = j.job;
      return fetch(job.url, { method: "POST", headers: job.headers, body: job.body, mode: "cors", credentials: "omit" })
        .then(function (z) { return z.text().then(function (t) { return { status: z.status, text: t }; }); })
        .catch(function (e) { return { status: 0, text: "المتصفح منع الاتصال بالهيئة من داخل الصفحة: " + (e && e.message || e) }; })
        .then(function (o) { return fetch("/api/zrelay/done?v=page", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: job.id, status: o.status, text: String(o.text).slice(0, 20000) }) }); })
        .then(function () { ZT.at = 0; });
    }).catch(function () { }).then(function () { ZR.busy = false; });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-ztok]"); if (!b) return; b.disabled = true;
    fetch("/api/zatca/approve", { method: "POST", credentials: "same-origin" }).then(function () { ZT.at = 0; ztLoad(); }).catch(function () { b.disabled = false; });
  });
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-zterr]"); if (!b) return; b.disabled = true;
    fetch("/api/zatca/errseen", { method: "POST", credentials: "same-origin" }).then(function () { ZT.at = 0; ztLoad(); }).catch(function () { b.disabled = false; });
  });
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-zlf],[data-zlr],[data-zlo]"); if (!t) return; e.preventDefault();
    if (t.dataset.zlf) { ZL.f = ZL.f === t.dataset.zlf ? "all" : t.dataset.zlf; ztDraw(); }
    else if (t.dataset.zlr) { ZT.at = 0; ztLoad(); ztList(); }
    else if (t.dataset.zlo) { ZL.o = ZL.o === t.dataset.zlo ? "" : t.dataset.zlo; ztDraw(); }
  });
  function ztTick() { if (!document.body.classList.contains("sxOwn")) return; if (ZT.d && ZT.d.linked && Date.now() - ZL.at > (document.body.classList.contains("jxZ") ? 30000 : 120000)) ztList(); var d = ZT.d, run = d && ((d.test && d.test.run) || (d.prod && d.prod.run)); if (Date.now() - ZT.at > (run && document.body.classList.contains("jxZ") ? 5000 : 60000)) ztLoad(); }

  /* owner 24 Nov: «الجرد» in the bottom bar, between «الكاشير» and «نقاط البيع» */
  function jcNav() {
    var w = document.querySelector("nav.tabs .wrap"), pt = document.getElementById("posTab"); if (!w || !pt) return;
    var b = document.getElementById("jcNavB");
    if (!b) { b = document.createElement("button"); b.type = "button"; b.id = "jcNavB"; b.setAttribute("role", "tab"); b.innerHTML = '<span class="i">📋</span>الجرد';
      b.addEventListener("click", function (e) { e.stopPropagation(); if (JC.on) return; jcOpen(); jcLoad();       }); }
    if (pt.previousSibling !== b) w.insertBefore(b, pt);
    /* owner 24 Nov: the ledger's own tab code keeps re-marking its tab every 0.7 s; fighting it made the bar flicker — the Jard highlight is done in CSS instead */
    if (b.getAttribute("aria-selected") !== "false") b.setAttribute("aria-selected", "false");
    if (!w.__jc) { w.__jc = 1; w.addEventListener("click", function (e) { var x = e.target.closest && e.target.closest("button"); if (x && x.id !== "jcNavB" && JC.on) jcClose(); }, true); }
  }

  /* owner 24 Nov: items taken off a sale before it was saved (line deleted, quantity lowered, basket emptied) — red counter on «نقاط البيع», list inside its card, «شفته» clears one */
  var PV = { at: 0, d: null, e: null, busy: false };
  function pvLoad() {
    if (PV.busy || !document.body.classList.contains("sxOwn")) return; PV.busy = true;
    fetch("/api/pos/itemlog", { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) { if (j && j.ok) PV.e = j; }).catch(function () { }).then(function () { return fetch("/api/pos/voids", { credentials: "same-origin", cache: "no-store" }); }).then(function (r) { return r.json(); }).then(function (j) { if (j && j.ok) { PV.d = j; pvDraw(); } }).catch(function () { }).then(function () { PV.busy = false; PV.at = Date.now(); });
  }
  function pvBadge(el, n) {
    if (!el) return; var b = el.querySelector(".pvB");
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement("b"); b.className = "pvB"; b.style.cssText = "position:absolute;top:2px;inset-inline-end:6px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#c2410c;color:#fff;font-size:12px;line-height:20px;text-align:center"; if (getComputedStyle(el).position === "static") el.style.position = "relative"; el.appendChild(b); }
    if (b.textContent !== String(n)) b.textContent = n;
  }
  function pvDraw() {
    var j = PV.d; if (!j) return; var n = j.unseen || 0;
    /* owner 26 Nov («وش علاقتها بالمبيعات»): cashier item edits (price / name / new item) live in «الأسعار» with their own counter; «المبيعات» keeps only the items taken off a sale */
    pvBadge(document.getElementById("posTab"), n); pvBadge(document.querySelector('#sxV [data-sxv="h|sales"]'), n);
    pvBadge(document.querySelector('#sxV [data-sxv="h|prices"]'), (PV.e && PV.e.unseen) || 0);
    var pz = document.getElementById("pzCard"); if (pz) { var ib = document.getElementById("ilBox"); if (!ib) { ib = document.createElement("div"); ib.id = "ilBox"; } if (ib.parentNode !== pz) pz.insertBefore(ib, pz.firstChild); var ih = ilHtml(); if (ib.__h !== ih) { ib.innerHTML = ih; ib.__h = ih; } }
    var card = document.getElementById("posSgCard"); if (!card) return;
    var box = document.getElementById("pvBox"); if (!box) { box = document.createElement("div"); box.id = "pvBox"; card.insertBefore(box, card.firstChild); }
    var L = (j.list || []).filter(function (x) { return !x.seen; }).slice(0, 40), K = { del: "حذف صنف", dec: "نقّص الكمية", clr: "فرّغ السلة" };
    var h = !L.length ? "" : '<div style="border:2px solid #c2410c;border-radius:14px;padding:10px;margin:0 0 12px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px"><b style="color:#c2410c">حذوفات قبل الحفظ (' + L.length + ')</b><button type="button" class="btn sm ghost" data-pvall="1">شفتها كلها</button></div>' +
      L.map(function (x) { var d = x.day.split("-"), dd = (+d[2]) + "/" + (+d[1]); return '<div style="padding:8px 2px;border-top:1px solid var(--line,#e5e7eb)"><div style="display:flex;justify-content:space-between;gap:8px"><b>' + esc(x.u) + " · " + (K[x.kind] || "حذف") + '</b><b style="color:#c2410c">' + Number(x.amt).toFixed(2) + '</b></div><div class="small muted">' + dd + " · " + String(x.t || "").slice(0, 5) + " · " + (x.br === "del" ? "التوصيل" : "المبيعات") + '</div><div class="small">' + x.lines.map(function (l) { return esc(l[1]) + " × " + l[3]; }).join("، ") + '</div><button type="button" class="btn sm ghost" data-pvseen="' + esc(x.id) + '" style="margin-top:6px">شفته</button></div>'; }).join("") + "</div>";
    if (box.__h !== h) { box.innerHTML = h; box.__h = h; }
  }
  /* owner 25 Nov: item edits made by cashiers from the POS (name / price / new item) — applied at once; here the owner sees who changed what, as a red counter */
  function ilHtml() {
    var L = ((PV.e && PV.e.list) || []).filter(function (x) { return !x.seen; }).slice(0, 40); if (!L.length) return "";
    var K = { price: "تغيير سعر", name: "تغيير اسم", "new": "صنف جديد" };
    return '<div style="border:2px solid #c2410c;border-radius:14px;padding:10px;margin:0 0 12px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px"><b style="color:#c2410c">تعديلات الأصناف من الكاشير (' + L.length + ')</b><button type="button" class="btn sm ghost" data-ilall="1">شفتها كلها</button></div>' +
      L.map(function (x) {
        var d = String(x.day || "").split("-"), dd = (+d[2]) + "/" + (+d[1]);
        var ch = x.k === "price" ? esc(x.n0) + ": " + Number(x.p0).toFixed(2) + " ← <b>" + Number(x.p1).toFixed(2) + "</b>" : x.k === "name" ? esc(x.n0) + " ← <b>" + esc(x.n1) + "</b>" : "<b>" + esc(x.n1) + "</b> · " + Number(x.p1).toFixed(2) + " · تكلفته تُضاف";
        return '<div style="padding:8px 2px;border-top:1px solid var(--line,#e5e7eb)"><div style="display:flex;justify-content:space-between;gap:8px"><b>' + esc(x.u) + " · " + (K[x.k] || "") + '</b><button type="button" class="btn sm ghost" data-ilseen="' + esc(x.id) + '">شفته</button></div><div class="small muted">' + dd + " · " + String(x.t || "").slice(0, 5) + " · " + (x.br === "del" ? "التوصيل" : "المبيعات") + " · " + esc(x.code) + '</div><div class="small">' + ch + "</div></div>";
      }).join("") + "</div>";
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-ilseen],[data-ilall]"); if (!b) return;
    var body = b.dataset.ilall ? { all: 1 } : { id: b.dataset.ilseen }; b.disabled = true;
    fetch("/api/pos/itemlog/seen", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function () { PV.at = 0; pvLoad(); }).catch(function () { b.disabled = false; });
  });
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-pvseen],[data-pvall]"); if (!b) return;
    var body = b.dataset.pvall ? { all: 1 } : { id: b.dataset.pvseen }; b.disabled = true;
    fetch("/api/pos/voids/seen", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function () { PV.at = 0; pvLoad(); }).catch(function () { b.disabled = false; });
  });
  function pvTick() { if (Date.now() - PV.at > 30000) pvLoad(); else pvDraw(); }
  function tick() { try { tab(); sales(); } catch (e) { } try { svTick(); } catch (e) { } try { plxTick(); } catch (e) { } try { pluLoad(false); } catch (e) { } try { jdxTick(); } catch (e) { } try { jcTick(); } catch (e) { } try { jcNav(); } catch (e) { } try { pvTick(); } catch (e) { } try { ztTick(); } catch (e) { } }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tick); else tick();
  setInterval(tick, 1000); tick(); var tk0 = setInterval(tick, 150); setTimeout(function () { clearInterval(tk0); }, 8000);
})();
