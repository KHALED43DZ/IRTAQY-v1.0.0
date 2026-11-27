/* إرتقِ | IRTAQY — منطق التطبيق (أستاذ / تلميذ) عبر WebRTC بواسطة PeerJS */
(() => {
  "use strict";
  const C = window.IRTAQY_CONFIG;
  const $ = (s) => document.querySelector(s);
  const h = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    kids.flat().forEach((c) => { if (c != null) e.append(c.nodeType ? c : document.createTextNode(c)); });
    return e;
  };

  const S = {
    role: null, name: "", code: "", peer: null, board: null, local: null,
    students: new Map(),      // عند الأستاذ: peerId -> {conn,name,mic,cam,hand}
    conn: null, roster: [],   // عند التلميذ
    outCalls: new Map(), inCalls: new Map(), tiles: new Map(),
    hand: false, ended: false, wake: null
  };
  const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  let tab = "chat", unread = 0;

  /* ---------- أدوات عامة ---------- */
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 3200);
  }
  function homeErr(msg) { const e = $("#homeErr"); e.textContent = msg || ""; e.hidden = !msg; }
  function busy(on) { $("#btnTeacher").disabled = on; $("#btnStudent").disabled = on; }
  function show(id) { $("#home").hidden = id !== "home"; $("#room").hidden = id !== "room"; }
  const peerOpts = () => ({ config: { iceServers: C.ICE_SERVERS }, debug: 0 });
  function genCode() {
    const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return [...crypto.getRandomValues(new Uint8Array(6))].map((n) => a[n % a.length]).join("");
  }
  async function keepAwake() {
    try { if ("wakeLock" in navigator) S.wake = await navigator.wakeLock.request("screen"); } catch (e) {}
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.role) keepAwake(); });
  function safePlay(v) { const p = v.play(); if (p && p.catch) p.catch(() => { $("#tapPlay").hidden = false; }); }
  function setStatus(ok) { $("#status").classList.toggle("ok", ok); }
  function cleanup(url) {
    S.ended = true;
    try { S.local && S.local.getTracks().forEach((t) => t.stop()); } catch (e) {}
    try { S.peer && S.peer.destroy(); } catch (e) {}
    try { S.wake && S.wake.release(); } catch (e) {}
    location.href = url || location.pathname;
  }

  /* ---------- الدردشة والتبويبات ---------- */
  function setTab(t) {
    tab = t;
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("sel", b.dataset.tab === t));
    $("#panelChat").hidden = t !== "chat"; $("#panelPeople").hidden = t !== "people";
    if (t === "chat") { unread = 0; $("#badge").hidden = true; }
  }
  function addChat(m, sys) {
    const box = $("#chatLog");
    box.append(sys ? h("div", { class: "sys", text: m }) : h("div", { class: "msg" }, h("b", { text: m.name + ": " }), h("span", { text: m.text })));
    box.scrollTop = box.scrollHeight;
    if (!sys && tab !== "chat") { unread++; const b = $("#badge"); b.textContent = unread; b.hidden = false; }
  }
  const sys = (t) => addChat(t, true);
  function broadcast(m) { S.students.forEach((st) => { try { if (st.conn.open) st.conn.send(m); } catch (e) {} }); }

  /* ---------- مقاطع المشاركين (تلاميذ مسموح لهم) ---------- */
  function nameOf(id) {
    if (S.role === "teacher") { const s = S.students.get(id); return s ? s.name : "مشارك"; }
    const r = S.roster.find((x) => x.id === id); return r ? r.name : "مشارك";
  }
  function addTile(id, stream) {
    let t = S.tiles.get(id);
    const hasVideo = stream.getVideoTracks().length > 0;
    if (!t) {
      const v = h("video", { autoplay: "", playsinline: "" });
      t = h("div", { class: "tile" }, v, h("span", { text: nameOf(id) }));
      S.tiles.set(id, t); $("#tiles").append(t);
    }
    t.classList.toggle("audio", !hasVideo);
    const v = t.querySelector("video"); v.srcObject = stream; safePlay(v);
  }
  function removeTile(id) { const t = S.tiles.get(id); if (t) { t.remove(); S.tiles.delete(id); } }

  /* ---------- مكالمات واردة (للأستاذ والتلميذ) ---------- */
  function onIncomingCall(call) {
    const kind = call.metadata && call.metadata.kind;
    call.answer();
    S.inCalls.set(call.peer, call);
    call.on("stream", (s) => {
      if (kind === "teacher") {
        const v = $("#mainVideo"); v.muted = false; v.srcObject = s; safePlay(v);
        $("#pip").classList.toggle("novid", s.getVideoTracks().length === 0);
        $("#pipLabel").textContent = "الأستاذ";
      } else addTile(call.peer, s);
    });
    const end = () => { if (kind !== "teacher") removeTile(call.peer); };
    call.on("close", end); call.on("error", end);
  }

  /* ---------- أدوات السبورة (الأستاذ) ---------- */
  function initTools() {
    const tb = $("#toolbar"); let color = "#111827", width = 14, eraser = false;
    const apply = () => S.board.setTool(eraser ? "#ffffff" : color, eraser ? 60 : width);
    const mark = () => {
      tb.querySelectorAll("[data-c]").forEach((b) => b.classList.toggle("sel", !eraser && b.dataset.c === color));
      tb.querySelectorAll("[data-w]").forEach((b) => b.classList.toggle("sel", !eraser && +b.dataset.w === width));
      $("#btnEraser").classList.toggle("sel", eraser);
    };
    tb.querySelectorAll("[data-c]").forEach((b) => (b.onclick = () => { color = b.dataset.c; eraser = false; mark(); apply(); }));
    tb.querySelectorAll("[data-w]").forEach((b) => (b.onclick = () => { width = +b.dataset.w; eraser = false; mark(); apply(); }));
    $("#btnEraser").onclick = () => { eraser = !eraser; mark(); apply(); };
    $("#btnUndo").onclick = () => S.board.undo();
    $("#btnClear").onclick = () => { if (confirm("مسح السبورة بالكامل؟")) S.board.clear(); };
    mark(); apply();
  }

  function enterRoom() {
    show("room"); document.body.dataset.role = S.role;
    $("#codeText").textContent = S.code;
    $("#verRoom").textContent = "v" + C.VERSION;
    S.board = new IrtaqyBoard($("#board"), { editable: S.role === "teacher", onEvent: (m) => broadcast(m) });
    if (S.role === "teacher") {
      initTools(); setTab("people");
      const v = $("#mainVideo"); v.muted = true;
      if (S.local && S.local.getTracks().length) { v.srcObject = S.local; safePlay(v); }
      $("#pip").classList.toggle("novid", !(S.local && S.local.getVideoTracks().length));
      $("#pipLabel").textContent = "أنت";
      if (!S.local) { $("#btnMic").disabled = true; $("#btnCam").disabled = true; }
      sys("الحصة جاهزة. شارك الرمز " + S.code + " مع تلاميذك.");
    } else { setTab("chat"); }
    renderPeople(); keepAwake(); window.scrollTo(0, 0);
  }

  /* ---------- قائمة التلاميذ ---------- */
  function renderPeople() {
    const box = $("#studentList"); box.replaceChildren();
    if (S.role === "teacher") {
      $("#count").textContent = S.students.size;
      if (!S.students.size) { box.append(h("p", { class: "muted", text: "لا يوجد تلاميذ بعد. أرسل لهم رمز الحصة." })); return; }
      [...S.students.entries()].sort((a, b) => b[1].hand - a[1].hand).forEach(([id, st]) => {
        box.append(h("div", { class: "row" + (st.hand ? " hand" : "") },
          h("span", { class: "nm", text: (st.hand ? "✋ " : "") + st.name }),
          h("button", { class: "chip" + (st.mic ? " on" : ""), title: "المايك", onclick: () => setPerm(id, "mic"), text: "🎤" }),
          h("button", { class: "chip" + (st.cam ? " on" : ""), title: "الكاميرا", onclick: () => setPerm(id, "cam"), text: "📷" }),
          h("button", { class: "chip danger", title: "إخراج", onclick: () => kick(id), text: "✕" })));
      });
    } else {
      $("#count").textContent = S.roster.length;
      if (!S.roster.length) box.append(h("p", { class: "muted", text: "أنت وحدك مع الأستاذ حالياً." }));
      S.roster.forEach((r) => box.append(h("div", { class: "row" }, h("span", { class: "nm", text: r.name }))));
    }
  }
  function rosterList() { return [...S.students.entries()].map(([id, s]) => ({ id, name: s.name })); }
  function broadcastRoster() { broadcast({ t: "roster", list: rosterList() }); }
  function setPerm(id, key) {
    const st = S.students.get(id); if (!st) return;
    st[key] = !st[key];
    if (st.mic || st.cam) st.hand = false;
    try { st.conn.send({ t: "perm", mic: st.mic, cam: st.cam }); } catch (e) {}
    renderPeople();
  }
  function kick(id) {
    const st = S.students.get(id); if (!st) return;
    if (!confirm("إخراج " + st.name + " من الحصة؟")) return;
    try { st.conn.send({ t: "kick" }); } catch (e) {}
    setTimeout(() => { try { st.conn.close(); } catch (e) {} }, 300);
    dropStudent(id);
  }
  function dropStudent(id) {
    const st = S.students.get(id); if (!st) return;
    S.students.delete(id);
    [S.outCalls, S.inCalls].forEach((m) => { try { m.get(id) && m.get(id).close(); } catch (e) {} m.delete(id); });
    removeTile(id); broadcastRoster(); renderPeople(); sys(st.name + " غادر الحصة");
  }

  /* ================== الأستاذ ================== */
  async function startTeacher() {
    const name = $("#tName").value.trim();
    if (!name) return homeErr("اكتب اسمك أولاً.");
    if (!navigator.mediaDevices || !window.Peer) return homeErr("المتصفح لا يدعم الاتصال المباشر أو أن الإنترنت غير متاح لتحميل المكتبات.");
    homeErr(""); busy(true);
    S.role = "teacher"; S.name = name;
    const q = $("#tQuality").value; let stream = null;
    if (q !== "audio") {
      const Q = C.QUALITY[q];
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: Q.width }, height: { ideal: Q.height }, frameRate: { ideal: Q.frameRate }, facingMode: "user" }, audio: AUDIO });
      } catch (e) {}
    }
    if (!stream) { try { stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO }); } catch (e) {} }
    if (!stream) toast("لم يتم تشغيل المايك أو الكاميرا. ستكون الحصة سبورة فقط.");
    S.local = stream;
    openTeacherPeer(0);
  }
  function openTeacherPeer(tries) {
    S.code = genCode();
    const peer = new Peer(C.ID_PREFIX + S.code, peerOpts());
    S.peer = peer;
    peer.on("open", () => { setStatus(true); enterRoom(); });
    peer.on("connection", onStudentConn);
    peer.on("call", onIncomingCall);
    peer.on("disconnected", () => { setStatus(false); try { peer.reconnect(); } catch (e) {} });
    peer.on("error", (err) => {
      if (err.type === "unavailable-id" && tries < 5) { peer.destroy(); return openTeacherPeer(tries + 1); }
      if ($("#room").hidden) { busy(false); homeErr("تعذر الاتصال بالخادم (" + err.type + "). تحقق من الإنترنت وأعد المحاولة."); }
      else toast("مشكلة في الاتصال: " + err.type);
    });
  }
  function onStudentConn(conn) {
    conn.on("data", (m) => {
      if (!m || typeof m !== "object") return;
      const st = S.students.get(conn.peer);
      if (m.t === "hello") {
        if (S.students.size >= C.MAX_STUDENTS) { try { conn.send({ t: "full" }); } catch (e) {} setTimeout(() => conn.close(), 500); return; }
        const name = String(m.name || "تلميذ").slice(0, 30);
        S.students.set(conn.peer, { conn, name, mic: false, cam: false, hand: false });
        conn.send({ t: "welcome", teacher: S.name, strokes: S.board.strokes, roster: rosterList() });
        if (S.local && S.local.getTracks().length) {
          const call = S.peer.call(conn.peer, S.local, { metadata: { kind: "teacher" } });
          S.outCalls.set(conn.peer, call);
        }
        broadcastRoster(); renderPeople(); sys(name + " انضم إلى الحصة");
      } else if (!st) { return; }
      else if (m.t === "hand") { st.hand = !!m.on; renderPeople(); if (st.hand) toast("✋ " + st.name + " يرفع يده"); }
      else if (m.t === "chat") {
        const text = String(m.text || "").slice(0, 300); if (!text) return;
        const msg = { t: "chat", name: st.name, text }; broadcast(msg); addChat(msg);
      }
    });
    conn.on("close", () => dropStudent(conn.peer));
    conn.on("error", () => dropStudent(conn.peer));
  }

  /* ================== التلميذ ================== */
  function fail(msg) {
    try { S.peer && S.peer.destroy(); } catch (e) {}
    S.peer = null; S.ended = true; busy(false); show("home"); homeErr(msg);
  }
  function startStudent() {
    const name = $("#sName").value.trim();
    const code = $("#sCode").value.trim().toUpperCase();
    if (!name) return homeErr("اكتب اسمك أولاً.");
    if (!/^[A-Z0-9]{6}$/.test(code)) return homeErr("رمز الحصة يتكون من 6 أحرف وأرقام.");
    if (!window.Peer) return homeErr("تعذر تحميل مكتبة الاتصال. تحقق من الإنترنت.");
    homeErr(""); busy(true);
    S.role = "student"; S.name = name; S.code = code; S.ended = false;
    const peer = new Peer(undefined, peerOpts()); S.peer = peer; let joined = false;
    const timer = setTimeout(() => { if (!joined) fail("تعذر دخول الحصة. تأكد من الرمز ومن أن الأستاذ بدأ الحصة."); }, 20000);
    peer.on("open", () => {
      const conn = peer.connect(C.ID_PREFIX + code, { reliable: true });
      S.conn = conn;
      conn.on("open", () => { joined = true; clearTimeout(timer); conn.send({ t: "hello", name }); });
      conn.on("data", onTeacherData);
      conn.on("close", lost);
    });
    peer.on("call", onIncomingCall);
    peer.on("disconnected", () => { try { peer.reconnect(); } catch (e) {} });
    peer.on("error", (err) => {
      clearTimeout(timer);
      if (!joined) fail(err.type === "peer-unavailable" ? "رمز الحصة غير صحيح أو أن الأستاذ لم يبدأ الحصة بعد." : "خطأ في الاتصال (" + err.type + ").");
    });
  }
  function lost() {
    if (S.ended) return; S.ended = true; setStatus(false);
    if (confirm("انقطع الاتصال بالأستاذ. هل تريد إعادة الدخول؟")) cleanup(location.pathname + "?room=" + S.code);
    else cleanup();
  }
  function onTeacherData(m) {
    if (!m || typeof m !== "object") return;
    switch (m.t) {
      case "welcome":
        S.roster = (m.roster || []).filter((r) => r.id !== S.peer.id);
        enterRoom(); setStatus(true); S.board.load(m.strokes);
        sys("انضممت إلى حصة " + (m.teacher || "الأستاذ"));
        break;
      case "b": case "m": case "e": case "clear": case "undo": S.board && S.board.apply(m); break;
      case "roster":
        S.roster = (m.list || []).filter((r) => r.id !== S.peer.id);
        [...S.tiles.keys()].forEach((id) => { if (!S.roster.some((r) => r.id === id)) removeTile(id); });
        renderPeople(); callPeers(); break;
      case "perm": applyPerm(!!m.mic, !!m.cam); break;
      case "chat": addChat({ name: String(m.name || ""), text: String(m.text || "") }); break;
      case "full": fail("الحصة ممتلئة (الحد الأقصى " + C.MAX_STUDENTS + " تلاميذ)."); break;
      case "kick": S.ended = true; alert("تم إخراجك من الحصة من طرف الأستاذ."); cleanup(); break;
      case "end": S.ended = true; alert("أنهى الأستاذ الحصة. شكراً لك."); cleanup(); break;
    }
  }
  /* إذن المايك/الكاميرا من الأستاذ */
  function stopLocal() {
    S.outCalls.forEach((c) => { try { c.close(); } catch (e) {} }); S.outCalls.clear();
    if (S.local) { S.local.getTracks().forEach((t) => t.stop()); S.local = null; }
  }
  async function applyPerm(mic, cam) {
    stopLocal();
    S.hand = false; $("#btnHand").textContent = "✋ رفع اليد";
    if (!mic && !cam) {
      $("#btnSelfMic").hidden = true; $("#permNote").hidden = true; toast("تم إلغاء إذن المشاركة"); return;
    }
    try {
      S.local = await navigator.mediaDevices.getUserMedia({
        audio: mic ? AUDIO : false,
        video: cam ? { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 12 }, facingMode: "user" } : false });
    } catch (e) { toast("تعذر تشغيل المايك أو الكاميرا. تحقق من أذونات المتصفح."); return; }
    $("#permNote").textContent = "سمح لك الأستاذ بالمشاركة" + (mic ? " 🎤" : "") + (cam ? " 📷" : "");
    $("#permNote").hidden = false; $("#btnSelfMic").hidden = !mic;
    $("#btnSelfMic").textContent = "🎤 مايكي يعمل"; $("#btnSelfMic").classList.remove("off");
    callPeers(true);
  }
  function callPeers(fresh) {
    if (!S.local || !S.peer) return;
    const targets = [C.ID_PREFIX + S.code, ...S.roster.map((r) => r.id)];
    targets.forEach((id) => {
      if (S.outCalls.has(id) && !fresh) return;
      const call = S.peer.call(id, S.local, { metadata: { kind: "student" } });
      S.outCalls.set(id, call);
      call.on("close", () => { if (S.outCalls.get(id) === call) S.outCalls.delete(id); });
    });
  }

  /* ---------- ربط الأزرار ---------- */
  function toggleTrack(kind, btn, on, off) {
    if (!S.local) return;
    const tr = kind === "audio" ? S.local.getAudioTracks() : S.local.getVideoTracks();
    if (!tr.length) return toast("غير متاح");
    const v = !tr[0].enabled; tr.forEach((t) => (t.enabled = v));
    btn.textContent = v ? on : off; btn.classList.toggle("off", !v);
  }
  $("#btnTeacher").onclick = startTeacher;
  $("#btnStudent").onclick = startStudent;
  $("#btnMic").onclick = () => toggleTrack("audio", $("#btnMic"), "🎤 المايك يعمل", "🔇 المايك متوقف");
  $("#btnCam").onclick = () => toggleTrack("video", $("#btnCam"), "📷 الكاميرا تعمل", "🚫 الكاميرا متوقفة");
  $("#btnSelfMic").onclick = () => toggleTrack("audio", $("#btnSelfMic"), "🎤 مايكي يعمل", "🔇 مايكي متوقف");
  $("#btnHand").onclick = () => {
    S.hand = !S.hand; $("#btnHand").textContent = S.hand ? "✋ إنزال اليد" : "✋ رفع اليد";
    try { S.conn.send({ t: "hand", on: S.hand }); } catch (e) {}
  };
  $("#btnInvite").onclick = async () => {
    const url = location.origin + location.pathname + "?room=" + S.code;
    const text = "انضم إلى حصتي على إرتقِ. الرمز: " + S.code + "\n" + url;
    try { if (navigator.share) { await navigator.share({ title: "إرتقِ", text }); return; } } catch (e) { return; }
    try { await navigator.clipboard.writeText(text); toast("تم نسخ رابط الدعوة"); } catch (e) { prompt("انسخ الدعوة:", text); }
  };
  $("#codeChip").onclick = async () => { try { await navigator.clipboard.writeText(S.code); toast("تم نسخ الرمز"); } catch (e) { toast("الرمز: " + S.code); } };
  $("#btnEnd").onclick = () => {
    if (!confirm("إنهاء الحصة لجميع التلاميذ؟")) return;
    broadcast({ t: "end" }); setTimeout(() => cleanup(), 400);
  };
  $("#btnLeave").onclick = () => { if (confirm("مغادرة الحصة؟")) { S.ended = true; cleanup(); } };
  $("#btnFull").onclick = () => { const s = $("#stage"); try { document.fullscreenElement ? document.exitFullscreen() : s.requestFullscreen(); } catch (e) {} };
  $("#pip").onclick = () => $("#pip").classList.toggle("big");
  $("#tapPlay").onclick = () => { document.querySelectorAll("#room video").forEach((v) => v.play().catch(() => {})); $("#tapPlay").hidden = true; };
  document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
  $("#chatForm").onsubmit = (e) => {
    e.preventDefault();
    const inp = $("#chatInput"), text = inp.value.trim(); if (!text) return; inp.value = "";
    if (S.role === "teacher") { const m = { t: "chat", name: S.name, text }; broadcast(m); addChat(m); }
    else { try { S.conn.send({ t: "chat", text }); } catch (er) {} }
  };
  window.addEventListener("beforeunload", (e) => { if (S.role === "teacher" && !S.ended && S.students.size) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- البداية ---------- */
  const v = "v" + C.VERSION;
  $("#verTop").textContent = "الإصدار " + C.VERSION; $("#verFoot").textContent = v; $("#verRoom").textContent = v;
  const room = new URLSearchParams(location.search).get("room");
  if (room) { $("#sCode").value = room.toUpperCase().slice(0, 6); $("#cardStudent").scrollIntoView({ block: "center" }); $("#sName").focus(); }
  $("#sCode").addEventListener("input", (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")));
})();
