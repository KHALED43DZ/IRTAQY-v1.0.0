/* إرتقِ | IRTAQY — السبورة التفاعلية (Canvas) */
class IrtaqyBoard {
  constructor(canvas, opts = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.W = 1600; this.H = 900;
    canvas.width = this.W; canvas.height = this.H;
    this.editable = !!opts.editable;
    this.emit = opts.onEvent || function () {};
    this.strokes = []; this.cur = null;
    this.color = "#111827"; this.width = 14;
    this.pending = []; this.timer = null;
    this.redraw();
    if (this.editable) this.bind();
  }
  setTool(color, width) { this.color = color; this.width = width; }
  paper() { this.ctx.fillStyle = "#ffffff"; this.ctx.fillRect(0, 0, this.W, this.H); }
  redraw() { this.paper(); this.strokes.forEach((s) => this.drawStroke(s)); }
  style(s) {
    const c = this.ctx;
    c.strokeStyle = s.c; c.fillStyle = s.c; c.lineWidth = s.w;
    c.lineCap = "round"; c.lineJoin = "round";
  }
  drawStroke(s) {
    if (!s || !s.p || !s.p.length) return;
    const c = this.ctx; this.style(s);
    const P = s.p.map(([x, y]) => [x * this.W, y * this.H]);
    c.beginPath(); c.arc(P[0][0], P[0][1], s.w / 2, 0, Math.PI * 2); c.fill();
    if (P.length > 1) {
      c.beginPath(); c.moveTo(P[0][0], P[0][1]);
      for (let i = 1; i < P.length; i++) c.lineTo(P[i][0], P[i][1]);
      c.stroke();
    }
  }
  begin(color, width, x, y) {
    this.cur = { c: color, w: width, p: [[x, y]] };
    this.strokes.push(this.cur);
    this.drawStroke(this.cur);
  }
  extend(pts) {
    const s = this.cur; if (!s) return;
    const c = this.ctx; this.style(s);
    for (const p of pts) {
      const q = s.p[s.p.length - 1];
      s.p.push(p);
      c.beginPath(); c.moveTo(q[0] * this.W, q[1] * this.H); c.lineTo(p[0] * this.W, p[1] * this.H); c.stroke();
    }
  }
  end() { this.cur = null; }
  flush() {
    clearTimeout(this.timer); this.timer = null;
    if (this.pending.length) { this.emit({ t: "m", p: this.pending }); this.pending = []; }
  }
  clear() { this.strokes = []; this.cur = null; this.redraw(); this.emit({ t: "clear" }); }
  undo() { this.cur = null; this.strokes.pop(); this.redraw(); this.emit({ t: "undo" }); }
  load(strokes) { this.strokes = Array.isArray(strokes) ? strokes : []; this.cur = null; this.redraw(); }
  /* استقبال أحداث من الأستاذ (عند التلميذ) */
  apply(m) {
    try {
      if (m.t === "b") this.begin(String(m.c), Number(m.w), Number(m.x), Number(m.y));
      else if (m.t === "m") this.extend(m.p);
      else if (m.t === "e") this.end();
      else if (m.t === "clear") { this.strokes = []; this.cur = null; this.redraw(); }
      else if (m.t === "undo") { this.cur = null; this.strokes.pop(); this.redraw(); }
    } catch (e) { /* تجاهل الرسائل التالفة */ }
  }
  bind() {
    const cv = this.cv; let drawing = false;
    const pt = (e) => {
      const r = cv.getBoundingClientRect();
      const cl = (v) => Math.min(1, Math.max(0, v));
      return [+cl((e.clientX - r.left) / r.width).toFixed(4), +cl((e.clientY - r.top) / r.height).toFixed(4)];
    };
    cv.addEventListener("pointerdown", (e) => {
      if (e.button > 0) return;
      e.preventDefault(); cv.setPointerCapture(e.pointerId); drawing = true;
      const [x, y] = pt(e);
      this.begin(this.color, this.width, x, y);
      this.emit({ t: "b", c: this.color, w: this.width, x, y });
    });
    cv.addEventListener("pointermove", (e) => {
      if (!drawing) return;
      e.preventDefault();
      const p = pt(e); this.extend([p]); this.pending.push(p);
      if (!this.timer) this.timer = setTimeout(() => this.flush(), 40);
    });
    const up = () => {
      if (!drawing) return; drawing = false;
      this.flush(); this.end(); this.emit({ t: "e" });
    };
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
  }
}
window.IrtaqyBoard = IrtaqyBoard;
