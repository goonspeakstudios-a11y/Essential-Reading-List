(function () {
  "use strict";

  // Pristine copies of this page's own parts, captured before any rendering,
  // so the offline-app download rebuilds the page as authored.
  var PRISTINE = (function () {
    function html(sel) { var el = document.querySelector(sel); return el ? el.outerHTML : ""; }
    return {
      style: html("#app-style"),
      header: html("header.masthead"),
      main: html("main"),
      dialog: html("#detail"),
      script: document.currentScript ? document.currentScript.outerHTML : ""
    };
  })();

  var COURSE = JSON.parse(document.getElementById("course-data").textContent);
  var ESS = COURSE.essentials;
  var LS_KEY = "gwc-state-v1";
  var LS_UI = "gwc-ui-v1";
  var ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];
  var STATUS_LABEL = { "": "Not started", reading: "Reading", done: "Finished", skip: "Skipped" };
  var NEXT_STATUS = { "": "reading", reading: "done", done: "", skip: "" };

  // ---------- Indexes ----------
  var WORK = {}, SECTION = {}, PHASE_OF = {}, CORE_INFO = {}, UNIT = {};
  var MODULE_OF = {}, READ_INFO = {};
  COURSE.works.forEach(function (w) { WORK[w.id] = w; });
  COURSE.sections.forEach(function (s) { SECTION[s.n] = s; });
  COURSE.phases.forEach(function (p, i) {
    p.num = ROMAN[i];
    p.label = "Phase " + p.num;
    p.items = p.core;
    UNIT[p.id] = p;
    p.coreHours = 0;
    p.core.forEach(function (c, j) {
      PHASE_OF[c.id] = p.id;
      CORE_INFO[c.id] = { hours: c.hours, focus: c.focus, pos: j + 1, phase: p.id };
      p.coreHours += c.hours;
    });
    p.deeper.forEach(function (id) { PHASE_OF[id] = p.id; });
  });
  ESS.modules.forEach(function (m, i) {
    m.num = String(i + 1);
    m.label = "Module " + m.num;
    m.items = m.readings;
    UNIT[m.id] = m;
    m.readings.forEach(function (r, j) {
      MODULE_OF[r.id] = m.id;
      READ_INFO[r.id] = { hours: r.hours, read: r.read, pos: j + 1, module: m.id };
    });
    m.survey.forEach(function (id) { MODULE_OF[id] = m.id; });
  });
  var CORE_ORDER = [], READ_ORDER = [];
  COURSE.phases.forEach(function (p) { p.core.forEach(function (c) { CORE_ORDER.push(c.id); }); });
  ESS.modules.forEach(function (m) { m.readings.forEach(function (r) { READ_ORDER.push(r.id); }); });
  var SURVEY_TOTAL = ESS.modules.reduce(function (a, m) { return a + m.survey.length; }, 0);

  // ---------- State ----------
  function todayISO() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function blankState() { return { w: {}, ph: {}, e: { r: {}, sv: {}, upd: 0 }, set: { hpw: 7, start: todayISO(), track: "full" } }; }
  function lsGet(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } }
  function lsSet(key, val) { try { window.localStorage.setItem(key, val); } catch (e) { /* storage unavailable */ } }

  function adoptState(src) {
    var st = blankState();
    if (!src || typeof src !== "object") return st;
    Object.keys(src.w || {}).forEach(function (id) { if (WORK[id]) st.w[id] = src.w[id]; });
    Object.keys(src.ph || {}).forEach(function (uid) { if (UNIT[uid]) st.ph[uid] = src.ph[uid]; });
    if (src.e) {
      Object.keys(src.e.r || {}).forEach(function (id) { if (READ_INFO[id]) st.e.r[id] = src.e.r[id]; });
      Object.keys(src.e.sv || {}).forEach(function (id) { if (WORK[id] && src.e.sv[id]) st.e.sv[id] = true; });
      st.e.upd = src.e.upd || 0;
    }
    st.set = Object.assign(st.set, src.set || {});
    if (st.set.track !== "ess") st.set.track = "full";
    return st;
  }

  // Desktop app: the native host saves state to a file and hands it back at startup.
  var NATIVE = typeof window.gwcSave === "function";
  var NATIVE_SAVED = NATIVE && window.__GWC_SAVED__ && typeof window.__GWC_SAVED__ === "object" ? window.__GWC_SAVED__ : null;

  // An offline copy downloaded from the app carries a progress snapshot.
  var SEED = (function () { var el = document.getElementById("seed-state"); if (!el) return null; try { return JSON.parse(el.textContent); } catch (e) { return null; } })();
  var state = (function () {
    if (NATIVE_SAVED) return adoptState(NATIVE_SAVED);
    var raw = lsGet(LS_KEY);
    if (raw) { try { return adoptState(JSON.parse(raw)); } catch (e) { /* corrupt local copy */ } }
    return adoptState(SEED);
  })();

  var ui = { view: "course", unit: { full: COURSE.phases[0].id, ess: ESS.modules[0].id }, open: false };
  try { var savedUI = JSON.parse(lsGet(LS_UI) || "{}"); if (savedUI.unit) Object.assign(ui.unit, savedUI.unit); } catch (e) { /* ignore */ }
  if (!UNIT[ui.unit.full] || UNIT[ui.unit.full].core === undefined) ui.unit.full = COURSE.phases[0].id;
  if (!UNIT[ui.unit.ess] || UNIT[ui.unit.ess].readings === undefined) ui.unit.ess = ESS.modules[0].id;
  function saveUI() { lsSet(LS_UI, JSON.stringify({ unit: ui.unit })); }

  function track() { return state.set.track === "ess" ? "ess" : "full"; }
  function curUnit() { return UNIT[ui.unit[track()]]; }
  function ws(id) { return state.w[id] || {}; }
  function statusOf(id) { return ws(id).s || ""; }
  function readStatus(id) { return state.e.r[id] || ""; }
  function surveyed(id) { return !!state.e.sv[id]; }
  function hasNotes(id) { var r = ws(id); return !!((r.notes && r.notes.trim()) || (r.sum && r.sum.trim())); }

  // ---------- Sync: account db when available, localStorage always ----------
  var remote = null;
  var pending = {}, inflight = {};
  var syncEl = document.getElementById("sync");
  function setSync(s) {
    syncEl.dataset.state = s;
    if (NATIVE) {
      syncEl.textContent = s === "error" ? "Could not save to this computer" : s === "saving" ? "Saving" : "Saved on this computer";
      if (window.__GWC_NATIVE__ && window.__GWC_NATIVE__.dataFile) syncEl.title = window.__GWC_NATIVE__.dataFile;
      return;
    }
    syncEl.textContent = s === "synced" ? "Synced to your account" : s === "saving" ? "Saving" : s === "error" ? "Saved in this browser only" : "Saved in this browser";
  }

  var nativeTimer = null, nativeBusy = false, nativeDirty = false;
  function nativeFlush() {
    clearTimeout(nativeTimer); nativeTimer = null;
    if (nativeBusy) { nativeDirty = true; return; }
    nativeBusy = true; nativeDirty = false;
    var payload = JSON.stringify(state);
    Promise.resolve(window.gwcSave(payload)).then(function () {
      nativeBusy = false;
      if (nativeDirty) nativeFlush(); else setSync("synced");
    }, function (err) {
      nativeBusy = false;
      console.warn("[gwc] native save failed", err);
      setSync("error");
      nativeTimer = setTimeout(nativeFlush, 3000);
    });
  }
  function persistLocal() {
    lsSet(LS_KEY, JSON.stringify(state));
    if (NATIVE) { setSync("saving"); clearTimeout(nativeTimer); nativeTimer = setTimeout(nativeFlush, 250); }
  }
  if (NATIVE) {
    var flushNow = function () { if (nativeTimer) nativeFlush(); };
    window.addEventListener("pagehide", flushNow);
    window.addEventListener("beforeunload", flushNow);
    document.addEventListener("visibilitychange", function () { if (document.hidden) flushNow(); });
    // Web links open in the computer's browser instead of replacing the app.
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a[href]");
      if (!a) return;
      var href = a.getAttribute("href");
      if (!/^https?:\/\//i.test(href)) return;
      e.preventDefault(); e.stopPropagation();
      Promise.resolve(window.gwcOpenURL(href)).catch(function (err) { console.warn("[gwc] open link failed", err); });
    }, true);
  }

  function docFor(key) {
    if (key === "settings") return Object.assign({ kind: "settings" }, state.set);
    if (key === "essentials") return { kind: "essentials", r: state.e.r, sv: state.e.sv, upd: state.e.upd };
    if (key.indexOf("p-") === 0) return Object.assign({ kind: "unit", uid: key.slice(2) }, state.ph[key.slice(2)] || {});
    return Object.assign({ kind: "work" }, state.w[key] || {});
  }
  function queueRemote(key, delay) {
    if (!remote) return;
    clearTimeout(pending[key]);
    setSync("saving");
    pending[key] = setTimeout(function () { flush(key); }, delay == null ? 700 : delay);
  }
  function flush(key) {
    delete pending[key];
    var prev = inflight[key] || Promise.resolve();
    var p = prev.then(function () {
      if (!remote) return;
      return remote.db.collection("data/users/" + remote.uid).doc(key).set(docFor(key));
    }).then(function () {
      if (inflight[key] === p) delete inflight[key];
      if (remote && !Object.keys(pending).length && !Object.keys(inflight).length) setSync("synced");
    }, function (err) {
      if (inflight[key] === p) delete inflight[key];
      var code = err && err.code;
      if (code === "unavailable") { queueRemote(key, 1500 + Math.random() * 1500); return; }
      console.warn("[gwc] account save failed", key, code, err && err.message);
      if (code === "revoked" || code === "not_granted" || code === "invalid_argument" || code === "capability_disabled" || code === "capability_removed") remote = null;
      setSync("error");
    });
    inflight[key] = p;
  }

  function touchWork(id, patch) {
    var rec = Object.assign({}, state.w[id] || {}, patch, { upd: Date.now() });
    if (patch.s === "reading" && !rec.start) rec.start = todayISO();
    if (patch.s === "done" && !rec.end) rec.end = todayISO();
    state.w[id] = rec;
    persistLocal();
    queueRemote(id, patch.notes != null || patch.sum != null ? 900 : 200);
  }
  function touchEss(patchFn) {
    patchFn(state.e);
    state.e.upd = Date.now();
    persistLocal();
    queueRemote("essentials", 400);
  }
  function setReadStatus(id, s) {
    touchEss(function (e) { if (s) e.r[id] = s; else delete e.r[id]; });
    if (s === "reading" && !ws(id).start) touchWork(id, { start: todayISO() });
  }
  function touchUnit(uid, patch) {
    state.ph[uid] = Object.assign({}, state.ph[uid] || {}, patch, { upd: Date.now() });
    persistLocal();
    queueRemote("p-" + uid, 900);
  }
  function touchSettings(patch) {
    state.set = Object.assign({}, state.set, patch, { upd: Date.now() });
    persistLocal();
    queueRemote("settings", 600);
  }

  function connectRemote() {
    if (!window.claude || typeof window.claude.use !== "function") return;
    Promise.all([window.claude.use("db"), window.claude.use("user")]).then(function (res) {
      var db = res[0], user = res[1];
      if (!db || !user || typeof user.id !== "function") return null;
      return user.id().then(function (uid) {
        if (!uid) return null;
        return db.collection("data/users/" + uid).limit(1000).get().then(function (snap) {
          remote = { db: db, uid: uid };
          var toPush = {}, seen = {};
          snap.docs.forEach(function (doc) {
            var d = doc.data() || {};
            seen[doc.id] = true;
            var newer = function (local) { return (d.upd || 0) > ((local && local.upd) || 0); };
            var older = function (local) { return ((local && local.upd) || 0) > (d.upd || 0); };
            if (d.kind === "settings") {
              if (newer(state.set)) state.set = { hpw: d.hpw || 7, start: d.start || todayISO(), track: d.track === "ess" ? "ess" : "full", upd: d.upd };
              else if (older(state.set)) toPush.settings = true;
            } else if (d.kind === "essentials") {
              if (newer(state.e)) state.e = adoptState({ e: d }).e;
              else if (older(state.e)) toPush.essentials = true;
            } else if (d.kind === "unit" && UNIT[d.uid]) {
              if (newer(state.ph[d.uid])) state.ph[d.uid] = { synth: d.synth || "", upd: d.upd };
              else if (older(state.ph[d.uid])) toPush["p-" + d.uid] = true;
            } else if (d.kind === "work" && WORK[doc.id]) {
              if (newer(state.w[doc.id])) { var copy = Object.assign({}, d); delete copy.kind; state.w[doc.id] = copy; }
              else if (older(state.w[doc.id])) toPush[doc.id] = true;
            }
          });
          Object.keys(state.w).forEach(function (id) { if (!seen[id]) toPush[id] = true; });
          Object.keys(state.ph).forEach(function (uid) { if (!seen["p-" + uid]) toPush["p-" + uid] = true; });
          if (!seen.settings && state.set.upd) toPush.settings = true;
          if (!seen.essentials && state.e.upd) toPush.essentials = true;
          persistLocal();
          setSync("synced");
          Object.keys(toPush).forEach(function (k, i) { queueRemote(k, 150 * i); });
          renderAll();
          return true;
        });
      });
    }).catch(function (err) {
      console.warn("[gwc] account sync unavailable", err && err.code, err && err.message);
      remote = null;
      setSync("local");
    });
  }

  // ---------- Helpers ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDate(d) { return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
  function addWeeks(iso, weeks) { var d = new Date(iso + "T12:00:00"); if (isNaN(d)) d = new Date(); d.setDate(d.getDate() + Math.ceil(weeks * 7)); return d; }
  function hpw() { var n = Number(state.set.hpw); return n > 0 ? n : 7; }
  function fmtH(h) { return (Math.round(h * 10) / 10).toString(); }

  function findLinks(w) {
    var q = encodeURIComponent(w.q).replace(/%20/g, "+");
    var out = [];
    if (w.pd) out.push({ label: "Free text (Gutenberg)", url: "https://www.gutenberg.org/ebooks/search/?query=" + encodeURIComponent(w.pd).replace(/%20/g, "+"), pd: true });
    COURSE.genericSources.forEach(function (g) { out.push({ label: g.label, url: g.search.replace("{q}", q) }); });
    (COURSE.sectionSources[String(w.sec)] || []).forEach(function (s) { out.push({ label: s.label, url: s.search ? s.search.replace("{q}", q) : s.url }); });
    return out;
  }

  var ICON = {
    "": "",
    reading: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3.5h4.5c.8 0 1.5.7 1.5 1.5v8c0-.8-.7-1.3-1.5-1.3H2zM14 3.5H9.5C8.7 3.5 8 4.2 8 5v8c0-.8.7-1.3 1.5-1.3H14z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    done: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    skip: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  };

  function unitProgress(u) {
    var isEss = !!u.readings, done = 0, hoursLeft = 0;
    u.items.forEach(function (it) {
      var s = isEss ? readStatus(it.id) : statusOf(it.id);
      if (s === "done" || s === "skip") done++; else hoursLeft += it.hours;
    });
    var sv = 0;
    if (isEss) { u.survey.forEach(function (id) { if (surveyed(id)) sv++; }); hoursLeft += (u.survey.length - sv) * ESS.surveyMinutes / 60; }
    var total = u.items.length + (isEss ? u.survey.length : 0);
    return { done: done, total: u.items.length, sv: sv, svTotal: isEss ? u.survey.length : 0, hoursLeft: hoursLeft, frac: total ? (done + sv) / total : 0 };
  }

  function ring(frac) {
    var r = 8.5, c = 2 * Math.PI * r;
    return '<svg class="ring" viewBox="0 0 22 22" aria-hidden="true"><circle class="bg" cx="11" cy="11" r="' + r + '"/><circle class="fg" cx="11" cy="11" r="' + r + '" stroke-dasharray="' + (c * frac).toFixed(2) + " " + c.toFixed(2) + '"' + (frac === 0 ? ' stroke-opacity="0"' : "") + "/></svg>";
  }

  // mode: "core" (full-course core), "read" (essentials reading), "deeper", "survey", "lib"
  function workRow(id, mode, index) {
    var w = WORK[id], core = CORE_INFO[id], rd = READ_INFO[id];
    var ess = mode === "read";
    var s = ess ? readStatus(id) : statusOf(id);
    var tags = [];
    if (mode === "lib") {
      var p = UNIT[PHASE_OF[id]], m = UNIT[MODULE_OF[id]];
      tags.push('<span class="tag' + (core ? " core" : "") + '">' + p.num + (core ? " core" : "") + "</span>");
      if (rd) tags.push('<span class="tag core">M' + m.num + "</span>");
    }
    if (hasNotes(id)) tags.push('<span class="tag note">notes</span>');
    var hours = mode === "core" ? core.hours : mode === "read" ? rd.hours : null;
    var lead = mode === "core" ? core.focus : mode === "read" ? rd.read : w.desc;
    var ed = (mode === "core" || mode === "read") && w.ed ? '<p class="wed"><b>Edition:</b> ' + esc(w.ed) + "</p>" : "";
    var control = mode === "survey"
      ? '<button class="sv" data-act="survey" aria-pressed="' + surveyed(id) + '" aria-label="Mark ' + esc(w.title) + ' as surveyed">' + (surveyed(id) ? ICON.done : "") + "</button>"
      : '<button class="status" data-act="' + (ess ? "cycle-read" : "cycle") + '" data-s="' + s + '" aria-label="Status: ' + STATUS_LABEL[s] + ". Change status of " + esc(w.title) + '">' + ICON[s] + "</button>";
    return '<li class="work" data-id="' + esc(id) + '" data-mode="' + mode + '" data-s="' + (mode === "survey" ? (surveyed(id) ? "done" : "") : s) + '">' +
      (index != null ? '<span class="idx num">' + index + "</span>" : "") + control +
      '<div class="body" data-act="open" role="button" tabindex="0">' +
        (w.author ? '<div class="wa">' + esc(w.author) + "</div>" : "") +
        '<div class="wt">' + esc(w.work) + "</div>" +
        '<p class="wf">' + esc(lead) + "</p>" + ed +
      "</div>" +
      '<div class="meta">' + (hours != null ? '<span class="num">~' + fmtH(hours) + " h</span>" : "") + tags.join("") + "</div>" +
    "</li>";
  }

  // ---------- Header ----------
  function renderMeter() {
    var d = document.getElementById("meter-d"), r = document.getElementById("meter-r"), lab = document.getElementById("meter-label");
    var order = track() === "ess" ? READ_ORDER : CORE_ORDER;
    var st = track() === "ess" ? readStatus : statusOf;
    var done = 0, reading = 0;
    order.forEach(function (id) { var s = st(id); if (s === "done" || s === "skip") done++; else if (s === "reading") reading++; });
    d.style.width = (100 * done / order.length) + "%";
    r.style.width = (100 * reading / order.length) + "%";
    if (track() === "ess") {
      var sv = Object.keys(state.e.sv).filter(function (id) { return MODULE_OF[id] && !READ_INFO[id]; }).length;
      lab.textContent = done + " / " + order.length + " readings · " + sv + " / " + SURVEY_TOTAL + " surveyed";
    } else {
      var all = COURSE.works.filter(function (w) { return statusOf(w.id) === "done"; }).length;
      lab.textContent = done + " / " + order.length + " core · " + all + " / " + COURSE.works.length + " read";
    }
    document.querySelectorAll(".track button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.track === track())); });
  }

  // ---------- Course view ----------
  function nextUp() {
    var ess = track() === "ess", order = ess ? READ_ORDER : CORE_ORDER, st = ess ? readStatus : statusOf;
    for (var i = 0; i < order.length; i++) { if (!st(order[i])) return order[i]; }
    return null;
  }
  function units() { return track() === "ess" ? ESS.modules : COURSE.phases; }

  function renderRail() {
    document.getElementById("rail").innerHTML = units().map(function (u) {
      var pr = unitProgress(u);
      var sub = u.readings ? pr.done + " of " + pr.total + " readings · ~" + fmtH(u.readHours + u.surveyHours) + " h" : pr.done + " of " + pr.total + " core";
      return '<button data-unit="' + u.id + '" aria-current="' + (u.id === ui.unit[track()]) + '">' +
        '<span class="rn">' + u.num + "</span>" +
        '<span><span class="rt">' + esc(u.title) + '</span><br><span class="rp num">' + sub + "</span></span>" +
        ring(pr.frac) + "</button>";
    }).join("");
  }

  function upNextCard() {
    var nx = nextUp(), ess = track() === "ess";
    if (!nx) {
      return '<div class="upnext"><div><div class="eyebrow">' + (ess ? "All Essentials readings done" : "Core sequence complete") + "</div><h2>Every assigned work is finished or set aside.</h2><p>" +
        (ess ? "Finish the surveys, or switch to the full course and continue from there." : "Continue with the deeper shelves in each phase.") + "</p></div></div>";
    }
    var w = WORK[nx], u = UNIT[ess ? MODULE_OF[nx] : PHASE_OF[nx]], info = ess ? READ_INFO[nx] : CORE_INFO[nx];
    return '<div class="upnext"><div><div class="eyebrow">Up next · ' + u.label + " · " + info.pos + " of " + u.items.length + "</div>" +
      "<h2>" + esc(w.work) + "</h2><p>" + esc(w.author) + (w.author ? " — " : "") + esc(ess ? info.read : info.focus) + "</p></div>" +
      '<button class="go" data-act="start" data-id="' + nx + '">Start reading</button></div>';
  }

  function renderUnit() {
    var u = curUnit(), ess = !!u.readings, pr = unitProgress(u);
    var html = upNextCard();
    var reading = ess ? READ_ORDER.filter(function (id) { return readStatus(id) === "reading"; }) : COURSE.works.filter(function (w) { return statusOf(w.id) === "reading"; }).map(function (w) { return w.id; });
    if (reading.length) {
      html += '<div class="reading-now"><span class="eyebrow" style="align-self:center">On the desk</span>' + reading.map(function (id) {
        var t = WORK[id].work;
        return '<button class="chip reading" data-act="open" data-id="' + id + '">' + esc(t.length > 42 ? t.slice(0, 40) + "…" : t) + "</button>";
      }).join("") + "</div>";
    }
    var head = ess ? "About " + fmtH(u.readHours) + " h of reading and " + fmtH(u.surveyHours) + " h of survey" : esc(u.span);
    html += '<div class="phase-head"><div class="pn">' + u.label + " · " + head + "</div><h2>" + esc(u.title) + '</h2><p class="intro">' + esc(u.intro) + "</p>" +
      '<div class="phase-stats num"><span><b>' + pr.done + "</b> of " + pr.total + (ess ? " readings done" : " core works done") + "</span>" +
      (ess ? "<span><b>" + pr.sv + "</b> of " + pr.svTotal + " surveyed</span>" : "") +
      "<span><b>~" + fmtH(pr.hoursLeft) + "</b> h left</span><span>Reading-list sections " +
      u.sections.map(function (n) { return esc(n + ". " + SECTION[n].title); }).join("; ") + "</span></div></div>";
    if (ess) {
      html += '<div class="questions"><div class="eyebrow">What to take away</div><ol>' + u.takeaways.map(function (q) { return "<li>" + esc(q) + "</li>"; }).join("") + "</ol></div>";
      html += '<div class="list-head"><h3>Read</h3><span class="muted num" style="font-size:14px">Assigned passages, in order</span></div>';
      html += '<ul class="works">' + u.readings.map(function (r, i) { return workRow(r.id, "read", i + 1); }).join("") + "</ul>";
    } else {
      html += '<div class="questions"><div class="eyebrow">Carry these questions through the phase</div><ol>' + u.questions.map(function (q) { return "<li>" + esc(q) + "</li>"; }).join("") + "</ol></div>";
      html += '<div class="list-head"><h3>Core sequence</h3><span class="muted num" style="font-size:14px">Read in this order</span></div>';
      html += '<ul class="works">' + u.core.map(function (c, i) { return workRow(c.id, "core", i + 1); }).join("") + "</ul>";
    }
    var synth = (state.ph[u.id] || {}).synth || "";
    html += '<div class="synth"><div class="eyebrow">' + (ess ? "Module checkpoint" : "Phase checkpoint") + "</div><h3>" + (ess ? "Check yourself" : "Synthesis") + "</h3><p>" + esc(ess ? u.check : u.synthesis) + "</p>" +
      '<textarea id="synth-' + u.id + '" data-act="synth" data-uid="' + u.id + '" placeholder="Write your answer here">' + esc(synth) + "</textarea></div>";
    var shelf = ess ? u.survey : u.deeper;
    if (shelf.length) {
      var shelfDone = ess ? pr.sv : shelf.filter(function (id) { return statusOf(id) === "done"; }).length;
      html += '<details class="deeper"' + (ui.open || ess ? " open" : "") + ' id="deeper"><summary><h3>' + (ess ? "Survey" : "Deeper shelf") + '</h3><span class="muted num" style="font-size:14px">' + shelfDone + " of " + shelf.length + (ess ? " surveyed" : " read") + "</span></summary>" +
        (ess ? '<p class="muted" style="margin:0 0 8px;font-size:15px">Read each description and tick it. About ' + ESS.surveyMinutes + " minute each.</p>" : "") +
        '<ul class="works plain">' + shelf.map(function (id) { return workRow(id, ess ? "survey" : "deeper"); }).join("") + "</ul></details>";
    }
    document.getElementById("phase").innerHTML = html;
    var det = document.getElementById("deeper");
    if (det && !ess) det.addEventListener("toggle", function () { ui.open = det.open; });
  }

  // ---------- Library ----------
  var libLimit = 60;
  function initLibraryFilters() {
    var ess = track() === "ess";
    document.getElementById("f-phase-label").textContent = ess ? "Module" : "Phase";
    document.getElementById("f-phase").innerHTML = '<option value="">' + (ess ? "All modules" : "All phases") + "</option>" + units().map(function (u) { return '<option value="' + u.id + '">' + u.num + ". " + esc(u.title) + "</option>"; }).join("");
    document.getElementById("f-sec").innerHTML = '<option value="">All sections</option>' + COURSE.sections.map(function (s) { return '<option value="' + s.n + '">' + s.n + ". " + esc(s.title) + "</option>"; }).join("");
    document.querySelector('#f-core').parentNode.lastChild.textContent = ess ? " Assigned readings only" : " Core only";
  }
  function renderLibrary() {
    var ess = track() === "ess";
    var q = document.getElementById("f-q").value.trim().toLowerCase();
    var fp = document.getElementById("f-phase").value;
    var fs = document.getElementById("f-sec").value;
    var fst = document.getElementById("f-status").value;
    var fc = document.getElementById("f-core").checked;
    var terms = q ? q.split(/\s+/) : [];
    var hits = COURSE.works.filter(function (w) {
      if (fp && (ess ? MODULE_OF[w.id] : PHASE_OF[w.id]) !== fp) return false;
      if (fs && String(w.sec) !== fs) return false;
      if (fc && !(ess ? READ_INFO[w.id] : CORE_INFO[w.id])) return false;
      var s = statusOf(w.id);
      if (fst === "none" && s) return false;
      if (fst === "notes" && !hasNotes(w.id)) return false;
      if (fst && fst !== "none" && fst !== "notes" && s !== fst) return false;
      if (terms.length) {
        var hay = (w.title + " " + w.desc + " " + (w.ed || "")).toLowerCase();
        for (var i = 0; i < terms.length; i++) if (hay.indexOf(terms[i]) === -1) return false;
      }
      return true;
    });
    document.getElementById("lib-count").textContent = hits.length + (hits.length === 1 ? " work" : " works");
    document.getElementById("lib-list").innerHTML = hits.slice(0, libLimit).map(function (w) { return workRow(w.id, "lib"); }).join("");
    document.getElementById("lib-more").hidden = hits.length <= libLimit;
  }

  // ---------- Notebook ----------
  function renderNotebook() {
    var items = [];
    COURSE.works.forEach(function (w) { if (hasNotes(w.id)) items.push({ t: ws(w.id).upd || 0, kind: "w", id: w.id }); });
    Object.keys(state.ph).forEach(function (uid) { var r = state.ph[uid]; if (UNIT[uid] && r && r.synth && r.synth.trim()) items.push({ t: r.upd || 0, kind: "u", id: uid }); });
    items.sort(function (a, b) { return b.t - a.t; });
    var el = document.getElementById("notebook");
    if (!items.length) {
      el.innerHTML = '<div class="empty"><h3 style="font-size:22px;margin-bottom:6px">Nothing written yet</h3><p style="margin:0">Open any work to record a one-sentence summary and notes. Phase syntheses and module answers appear here too.</p></div>';
      return;
    }
    el.innerHTML = '<div class="entries">' + items.map(function (it) {
      if (it.kind === "u") {
        var u = UNIT[it.id];
        return '<article class="entry"><div class="eyebrow">' + u.label + (u.readings ? " answer" : " synthesis") + (it.t ? " · " + fmtDate(new Date(it.t)) : "") + "</div><h3>" + esc(u.title) + '</h3><p class="notes">' + esc(state.ph[it.id].synth) + "</p></article>";
      }
      var w = WORK[it.id], r = ws(it.id);
      return '<article class="entry"><div class="eyebrow">' + esc(w.author || "Anonymous") + " · " + STATUS_LABEL[r.s || ""] + (it.t ? " · " + fmtDate(new Date(it.t)) : "") + "</div>" +
        '<h3><a href="#" data-act="open" data-id="' + it.id + '" style="color:inherit">' + esc(w.work) + "</a></h3>" +
        (r.sum ? '<p class="sum">' + esc(r.sum) + "</p>" : "") + (r.notes ? '<p class="notes">' + esc(r.notes) + "</p>" : "") + "</article>";
    }).join("") + "</div>";
  }

  // ---------- Plan ----------
  function renderPlan() {
    var hp = hpw(), ess = track() === "ess";
    document.getElementById("p-hpw").value = hp;
    document.getElementById("p-start").value = state.set.start || todayISO();
    var list = units(), totalH = 0, leftH = 0;
    list.forEach(function (u) { totalH += ess ? u.readHours + u.surveyHours : u.coreHours; leftH += unitProgress(u).hoursLeft; });
    var weeks = leftH / hp, today = todayISO();
    var base = (state.set.start && state.set.start > today) ? state.set.start : today;
    document.getElementById("p-figures").innerHTML =
      '<div class="figure"><b class="num">~' + Math.round(leftH) + "</b><span>hours left of ~" + Math.round(totalH) + "</span></div>" +
      '<div class="figure"><b class="num">' + (weeks < 10 ? weeks.toFixed(1) : Math.round(weeks)) + "</b><span>weeks at " + hp + " h per week</span></div>" +
      '<div class="figure"><b>' + (leftH > 0.05 ? fmtDate(addWeeks(base, weeks)) : "Done") + "</b><span>projected finish</span></div>";
    document.getElementById("p-note").textContent = ess
      ? "Essentials track: assigned passages plus about " + ESS.surveyMinutes + " minute per surveyed work. Finished, skipped and surveyed items are subtracted."
      : "Full course: projections use the core sequence and the hour estimate on each work. Finished and skipped works are subtracted.";
    document.getElementById("p-sched-title").textContent = ess ? "Module schedule" : "Phase schedule";
    var cum = 0;
    var rows = list.map(function (u) {
      var pr = unitProgress(u);
      cum += pr.hoursLeft;
      return '<tr><td><span class="pn">' + u.num + "</span>" + esc(u.title) + "</td>" +
        '<td class="r"><span class="mini" aria-hidden="true"><i style="width:' + (100 * pr.frac).toFixed(1) + '%"></i></span></td>' +
        '<td class="r">' + pr.done + "/" + pr.total + "</td>" +
        '<td class="r">~' + fmtH(pr.hoursLeft) + "</td>" +
        '<td class="r">' + (pr.hoursLeft > 0.05 ? fmtDate(addWeeks(base, cum / hp)) : "Done") + "</td></tr>";
    }).join("");
    document.getElementById("p-table").innerHTML = '<thead><tr><th>' + (ess ? "Module" : "Phase") + '</th><th class="r">Progress</th><th class="r">' + (ess ? "Read" : "Core") + '</th><th class="r">Hours left</th><th class="r">Finish by</th></tr></thead><tbody>' + rows + "</tbody>";
    document.getElementById("about").textContent = ess ? ESS.about : COURSE.about;
    document.getElementById("about-2").textContent = ess
      ? "Every entry on the reading list appears once in Essentials, as an assigned reading or as a survey item. Switch to the full course at any time; notes are shared between tracks."
      : "Core works are ordered so each one prepares for the next. The deeper shelf in every phase holds the remaining works from that phase's sections of the reading list, in list order.";
  }

  // ---------- Detail dialog ----------
  var dlg = document.getElementById("detail");
  var dlgId = null, dlgMode = null;
  function openDetail(id, mode) {
    var w = WORK[id]; if (!w) return;
    dlgId = id;
    dlgMode = mode === "read" || (mode == null && track() === "ess" && READ_INFO[id]) ? "read" : "full";
    var r = ws(id), core = CORE_INFO[id], rd = READ_INFO[id], p = UNIT[PHASE_OF[id]], m = UNIT[MODULE_OF[id]];
    var s = dlgMode === "read" ? readStatus(id) : (r.s || "");
    var where = "Full course: " + p.label + ", " + esc(p.title) + (core ? " · core " + core.pos + " of " + p.core.length + " · ~" + core.hours + " h" : " · deeper shelf") +
      "<br>Essentials: " + m.label + ", " + esc(m.title) + (rd ? " · reading " + rd.pos + " of " + m.readings.length + " · ~" + fmtH(rd.hours) + " h" : " · survey") +
      "<br>Reading list section " + w.sec + ". " + esc(SECTION[w.sec].title);
    var assign = "";
    if (dlgMode === "read" && rd) assign = '<p class="focus"><b>Essentials reading.</b> ' + esc(rd.read) + "</p>";
    else if (core && core.focus) assign = '<p class="focus"><b>What to read and watch for.</b> ' + esc(core.focus) + "</p>";
    var other = dlgMode === "read" && core && core.focus ? '<p class="wed"><b>Full course:</b> ' + esc(core.focus) + "</p>" : (dlgMode === "full" && rd ? '<p class="wed"><b>Essentials:</b> ' + esc(rd.read) + "</p>" : "");
    dlg.innerHTML = '<div class="detail-inner">' +
      '<div class="detail-top"><div><div class="eyebrow">' + esc(w.author || "Anonymous") + '</div><h2 id="d-title">' + esc(w.work) + "</h2></div>" +
      '<button class="close" data-act="close" aria-label="Close">×</button></div>' +
      '<p class="src">' + where + "</p>" +
      '<p class="desc">' + esc(w.desc) + "</p>" + assign + other +
      '<div><div class="eyebrow" style="margin-bottom:6px">Where to find it</div>' +
        (w.ed ? '<p class="wed" style="margin:0 0 8px"><b>Recommended edition:</b> ' + esc(w.ed) + "</p>" : "") +
        '<div class="links">' + findLinks(w).map(function (l) { return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener"' + (l.pd ? ' class="pd"' : "") + ">" + esc(l.label) + "</a>"; }).join("") + "</div></div>" +
      '<div><div class="eyebrow" style="margin-bottom:6px">' + (dlgMode === "read" ? "Essentials reading status" : "Status") + "</div>" +
      '<div class="seg" role="group" aria-label="Status">' + ["", "reading", "done", "skip"].map(function (v) {
        return '<button data-act="set" data-v="' + v + '" aria-pressed="' + (s === v) + '">' + STATUS_LABEL[v] + "</button>";
      }).join("") + "</div></div>" +
      '<div class="dates"><label class="field"><span>Started</span><input type="date" id="d-start" value="' + esc(r.start || "") + '"></label>' +
      '<label class="field"><span>Finished</span><input type="date" id="d-end" value="' + esc(r.end || "") + '"></label></div>' +
      '<label class="field"><span>In one sentence</span><input type="text" id="d-sum" maxlength="400" placeholder="The central claim or event, in your own words" value="' + esc(r.sum || "") + '"></label>' +
      '<label class="field"><span>Notes</span><textarea id="d-notes" placeholder="Passages, arguments, connections to earlier works, questions">' + esc(r.notes || "") + "</textarea></label>" +
      "</div>";
    if (!dlg.open) { try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); } }
  }
  function closeDetail() { if (dlg.open) dlg.close(); }
  dlg.addEventListener("close", function () { dlgId = null; renderAll(); });
  dlg.addEventListener("click", function (e) {
    if (e.target === dlg) { closeDetail(); return; }
    var b = e.target.closest("[data-act]"); if (!b) return;
    if (b.dataset.act === "close") closeDetail();
    if (b.dataset.act === "set" && dlgId) {
      if (dlgMode === "read") setReadStatus(dlgId, b.dataset.v);
      else touchWork(dlgId, { s: b.dataset.v });
      openDetail(dlgId, dlgMode === "read" ? "read" : "full");
    }
  });
  dlg.addEventListener("input", function (e) {
    if (!dlgId) return;
    var t = e.target;
    if (t.id === "d-sum") touchWork(dlgId, { sum: t.value });
    else if (t.id === "d-notes") touchWork(dlgId, { notes: t.value });
    else if (t.id === "d-start") touchWork(dlgId, { start: t.value });
    else if (t.id === "d-end") touchWork(dlgId, { end: t.value });
  });

  // ---------- Downloads ----------
  var dlMsg = document.getElementById("dl-msg");
  function box(done) { return done ? "[x]" : "[ ]"; }
  function linksMd(w) { return findLinks(w).map(function (l) { return "[" + l.label + "](" + l.url + ")"; }).join(" · "); }
  function stamp() { return "Exported " + new Date().toISOString().slice(0, 10) + " from The Great Works Course. [x] marks finished or skipped works."; }

  function fullMarkdown() {
    var total = COURSE.phases.reduce(function (a, p) { return a + p.coreHours; }, 0);
    var L = ["# " + COURSE.title + ": full reading plan", "", stamp(), "", COURSE.about, "",
      "Core sequence: " + CORE_ORDER.length + " works, about " + total.toLocaleString() + " hours.", "", "## Contents", ""];
    COURSE.phases.forEach(function (p, i) { L.push((i + 1) + ". Phase " + p.num + ": " + p.title + " (" + p.core.length + " core works, ~" + p.coreHours + " h)"); });
    COURSE.phases.forEach(function (p) {
      L.push("", "## Phase " + p.num + ": " + p.title, "", "*" + p.span + ". About " + p.coreHours + " hours of core reading.*", "", p.intro, "", "**Questions to carry through the phase**", "");
      p.questions.forEach(function (q, i) { L.push((i + 1) + ". " + q); });
      L.push("", "### Core sequence", "");
      p.core.forEach(function (c, i) {
        var w = WORK[c.id], s = statusOf(c.id);
        L.push((i + 1) + ". " + box(s === "done" || s === "skip") + " **" + w.title + "** (~" + c.hours + " h)" + (s === "skip" ? " (skipped)" : ""));
        L.push("   - Read: " + c.focus);
        if (w.ed) L.push("   - Edition: " + w.ed);
        L.push("   - Find it: " + linksMd(w));
        var r = ws(c.id);
        if (r.sum) L.push("   - My summary: " + r.sum);
      });
      L.push("", "**Synthesis.** " + p.synthesis);
      var syn = (state.ph[p.id] || {}).synth;
      if (syn) L.push("", "> " + syn.replace(/\n/g, "\n> "));
      L.push("", "### Deeper shelf", "");
      p.deeper.forEach(function (id) {
        var w = WORK[id];
        L.push("- " + box(statusOf(id) === "done") + " **" + w.title + "**: " + w.desc);
        L.push("  - Find it: " + linksMd(w));
      });
    });
    return L.join("\n") + "\n";
  }

  function essMarkdown() {
    var rh = ESS.modules.reduce(function (a, m) { return a + m.readHours; }, 0);
    var sh = ESS.modules.reduce(function (a, m) { return a + m.surveyHours; }, 0);
    var L = ["# " + COURSE.title + ": Essentials (~" + Math.round(rh + sh) + " hours)", "", stamp(), "", ESS.about, "",
      "Assigned passages: about " + fmtH(rh) + " hours. Survey of the remaining works: about " + fmtH(sh) + " hours.", "", "## Contents", ""];
    ESS.modules.forEach(function (m) { L.push(m.num + ". Module " + m.num + ": " + m.title + " (~" + fmtH(m.readHours + m.surveyHours) + " h)"); });
    ESS.modules.forEach(function (m) {
      L.push("", "## Module " + m.num + ": " + m.title, "", "*About " + fmtH(m.readHours) + " hours of reading and " + fmtH(m.surveyHours) + " hours of survey.*", "", m.intro, "", "**What to take away**", "");
      m.takeaways.forEach(function (t) { L.push("- " + t); });
      L.push("", "### Read", "");
      m.readings.forEach(function (rr, i) {
        var w = WORK[rr.id], s = readStatus(rr.id);
        L.push((i + 1) + ". " + box(s === "done" || s === "skip") + " **" + w.title + "** (~" + fmtH(rr.hours) + " h)" + (s === "skip" ? " (skipped)" : ""));
        L.push("   - Read: " + rr.read);
        if (w.ed) L.push("   - Edition: " + w.ed);
        L.push("   - Find it: " + linksMd(w));
        var r = ws(rr.id);
        if (r.sum) L.push("   - My summary: " + r.sum);
      });
      L.push("", "**Check yourself.** " + m.check);
      var ans = (state.ph[m.id] || {}).synth;
      if (ans) L.push("", "> " + ans.replace(/\n/g, "\n> "));
      L.push("", "### Survey", "", "Read each description. That is enough to know what the work is and where it belongs.", "");
      m.survey.forEach(function (id) { var w = WORK[id]; L.push("- " + box(surveyed(id)) + " **" + w.title + "**: " + w.desc); });
    });
    return L.join("\n") + "\n";
  }

  function appHTML() {
    var data = document.getElementById("course-data").outerHTML;
    var seed = '<script type="application/json" id="seed-state">' + JSON.stringify(state).replace(/</g, "\\u003c") + "<\/script>";
    return '<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n<title>The Great Works Course</title>\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alegreya:ital,wght@0,400;0,500;0,700;1,400;1,500&family=Alegreya+Sans:ital,wght@0,400;0,500;0,700;1,400&display=swap">\n' +
      PRISTINE.style + "\n" + PRISTINE.header + "\n" + PRISTINE.main + "\n" + PRISTINE.dialog + "\n" + data + "\n" + seed + "\n" + PRISTINE.script + "\n";
  }

  var FILES = {
    full: function () { return { filename: "full-course.md", data: fullMarkdown(), type: "text/markdown" }; },
    ess: function () { return { filename: "essentials.md", data: essMarkdown(), type: "text/markdown" }; },
    app: function () { return { filename: "great-works-course.html", data: appHTML(), type: "text/html" }; },
    json: function () { return { filename: "great-works-progress.json", data: backupJSON(), type: "application/json" }; }
  };

  var downloadsNS = null;
  var inFrame = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();

  function blobSave(f) {
    var url = URL.createObjectURL(new Blob([f.data], { type: f.type + ";charset=utf-8" }));
    var a = document.createElement("a");
    a.href = url; a.download = f.filename; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    dlMsg.textContent = "Saved " + f.filename + ".";
  }

  function download(kind) {
    var f = FILES[kind]();
    if (NATIVE) {
      dlMsg.textContent = "Saving\u2026";
      Promise.resolve(window.gwcSaveFile(f.filename, f.data)).then(function (path) {
        dlMsg.textContent = "Saved to " + path;
      }, function (err) {
        console.warn("[gwc] save file failed", err);
        dlMsg.textContent = "Could not save the file: " + (err && err.message ? err.message : err);
      });
      return;
    }
    if (downloadsNS) {
      dlMsg.textContent = "Confirm the download in the prompt.";
      downloadsNS.save({ filename: f.filename, data: f.data }).then(function () {
        dlMsg.textContent = "Saved " + f.filename + ".";
      }, function (err) {
        var code = err && err.code;
        if (code === "declined") dlMsg.textContent = "Download cancelled.";
        else if (code === "rate_limited") dlMsg.textContent = "A download prompt is already open. Finish it, then try again.";
        else { console.warn("[gwc] download failed", code, err && err.message); dlMsg.textContent = "Downloads are not available in this view. Use Copy backup below, or open the reading plans in the repository."; }
      });
      return;
    }
    if (inFrame && window.claude) {
      dlMsg.textContent = "Downloads are not available in this view. Use Copy backup below, or open the reading plans in the repository.";
      return;
    }
    blobSave(f);
  }
  document.querySelectorAll("[data-dl]").forEach(function (b) { b.addEventListener("click", function () { download(b.dataset.dl); }); });
  if (window.claude && typeof window.claude.use === "function") {
    window.claude.use("downloads").then(function (ns) { downloadsNS = ns; }, function () { downloadsNS = null; });
  }

  // ---------- Global events ----------
  document.addEventListener("click", function (e) {
    if (dlg.contains(e.target)) return;
    var tb = e.target.closest("[data-track]");
    if (tb) {
      if (tb.dataset.track !== track()) { touchSettings({ track: tb.dataset.track }); initLibraryFilters(); libLimit = 60; renderAll(); }
      return;
    }
    var un = e.target.closest("[data-unit]");
    if (un) { ui.unit[track()] = un.dataset.unit; ui.open = false; saveUI(); renderCourse(); window.scrollTo({ top: 0 }); return; }
    var el = e.target.closest("[data-act]"); if (!el) return;
    var row = el.closest(".work");
    var id = el.dataset.id || (row && row.dataset.id);
    var mode = row ? row.dataset.mode : null;
    switch (el.dataset.act) {
      case "cycle": touchWork(id, { s: NEXT_STATUS[statusOf(id)] }); renderAll(); break;
      case "cycle-read": setReadStatus(id, NEXT_STATUS[readStatus(id)]); renderAll(); break;
      case "survey": touchEss(function (s) { if (s.sv[id]) delete s.sv[id]; else s.sv[id] = true; }); renderAll(); break;
      case "open": e.preventDefault(); openDetail(id, mode === "read" ? "read" : mode === "lib" || mode == null ? null : "full"); break;
      case "start":
        if (track() === "ess") { setReadStatus(id, "reading"); ui.unit.ess = MODULE_OF[id]; }
        else { touchWork(id, { s: "reading" }); ui.unit.full = PHASE_OF[id]; }
        saveUI(); renderAll(); openDetail(id, track() === "ess" ? "read" : "full");
        break;
    }
  });
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches('.body[data-act="open"]')) {
      e.preventDefault();
      var row = e.target.closest(".work");
      openDetail(row.dataset.id, row.dataset.mode === "read" ? "read" : row.dataset.mode === "lib" ? null : "full");
    }
  });
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.act === "synth") touchUnit(t.dataset.uid, { synth: t.value });
  });

  ["f-q", "f-phase", "f-sec", "f-status", "f-core"].forEach(function (id) {
    document.getElementById(id).addEventListener("input", function () { libLimit = 60; renderLibrary(); });
  });
  document.getElementById("lib-more").addEventListener("click", function () { libLimit += 120; renderLibrary(); });

  document.getElementById("p-hpw").addEventListener("change", function (e) {
    var n = Math.max(1, Math.min(80, Math.round(Number(e.target.value) || 7)));
    touchSettings({ hpw: n }); renderPlan();
  });
  document.getElementById("p-start").addEventListener("change", function (e) {
    if (e.target.value) { touchSettings({ start: e.target.value }); renderPlan(); }
  });

  // ---------- Backup ----------
  var bText = document.getElementById("b-text"), bMsg = document.getElementById("b-msg");
  function backupJSON() { return JSON.stringify({ format: "gwc-backup-1", saved: new Date().toISOString(), state: state }, null, 1); }
  document.getElementById("b-copy").addEventListener("click", function () {
    var txt = backupJSON();
    bText.value = txt;
    var done = function () { bMsg.textContent = "Copied. Paste it somewhere safe."; };
    var fallback = function () { bText.focus(); bText.select(); bMsg.textContent = "Selected. Copy it with your keyboard or the context menu."; };
    try { navigator.clipboard.writeText(txt).then(done, fallback); } catch (err) { fallback(); }
  });
  function pushAll() {
    Object.keys(state.w).forEach(function (id) { queueRemote(id, 100); });
    Object.keys(state.ph).forEach(function (uid) { queueRemote("p-" + uid, 100); });
    queueRemote("essentials", 100);
    queueRemote("settings", 100);
  }
  document.getElementById("b-restore").addEventListener("click", function () {
    var parsed;
    try { parsed = JSON.parse(bText.value); } catch (err) { bMsg.textContent = "That text is not valid JSON. Paste the full backup, from the first { to the last }."; return; }
    if (!parsed || parsed.format !== "gwc-backup-1" || !parsed.state || typeof parsed.state.w !== "object") { bMsg.textContent = "That JSON is not a backup from this course."; return; }
    var now = Date.now();
    state = adoptState(parsed.state);
    Object.keys(state.w).forEach(function (id) { state.w[id].upd = now; });
    Object.keys(state.ph).forEach(function (uid) { state.ph[uid].upd = now; });
    state.e.upd = now; state.set.upd = now;
    persistLocal(); pushAll();
    bMsg.textContent = "Restored " + Object.keys(state.w).length + " work records.";
    initLibraryFilters(); renderAll();
  });
  document.getElementById("b-reset").addEventListener("click", function () { document.getElementById("b-confirm").hidden = false; });
  document.getElementById("b-reset-no").addEventListener("click", function () { document.getElementById("b-confirm").hidden = true; });
  document.getElementById("b-reset-yes").addEventListener("click", function () {
    var now = Date.now();
    Object.keys(state.w).forEach(function (id) { state.w[id] = { upd: now }; });
    Object.keys(state.ph).forEach(function (uid) { state.ph[uid] = { synth: "", upd: now }; });
    state.e = { r: {}, sv: {}, upd: now };
    persistLocal(); pushAll();
    document.getElementById("b-confirm").hidden = true;
    bMsg.textContent = "All progress erased.";
    renderAll();
  });

  // ---------- Routing ----------
  var VIEWS = ["course", "library", "notebook", "plan"];
  function route() {
    var h = (location.hash || "").replace("#", "");
    ui.view = VIEWS.indexOf(h) >= 0 ? h : "course";
    VIEWS.forEach(function (v) { document.getElementById("view-" + v).hidden = v !== ui.view; });
    document.querySelectorAll(".tabs a").forEach(function (a) {
      if (a.dataset.view === ui.view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    renderView();
  }
  window.addEventListener("hashchange", route);

  function renderCourse() { renderRail(); renderUnit(); }
  function renderView() {
    if (ui.view === "course") renderCourse();
    else if (ui.view === "library") renderLibrary();
    else if (ui.view === "notebook") renderNotebook();
    else renderPlan();
  }
  function renderAll() {
    renderMeter();
    var active = document.activeElement;
    if (active && active.dataset && active.dataset.act === "synth") return;
    renderView();
  }

  initLibraryFilters();
  renderMeter();
  route();
  if (NATIVE) { setSync("synced"); if (!NATIVE_SAVED) persistLocal(); } else connectRemote();
})();
