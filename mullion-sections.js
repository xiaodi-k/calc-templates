/* Geometry, section icons and dimension editor ported from mullion.html.
 * Source: xiaodi-k/calc-templates @ 59c8825f74d974440259a22a9e883fe2931c0ef6.
 * Stability formulas are intentionally kept in steel-beam-column-core.js.
 * Changes: geometry validation, standalone exports, correct I-web leader.
 */
(function(root){
  'use strict';
  const SECTIONS = {
    circle: { name: '圆形', dims: [['D', '直径 D', 160]] },
    tube:   { name: '圆管', dims: [['D', '外径 D', 160], ['t', '壁厚 t', 12]] },
    rect:   { name: '矩形', dims: [['H', '高度 H', 160], ['B', '宽度 B', 70]] },
    box:    { name: '箱型', dims: [['H', '高度 H', 160], ['B', '宽度 B', 70], ['tf', '翼缘厚 t_f', 12], ['tw', '腹板厚 t_w', 8]] },
    stri:   { name: '实心三角形', dims: [['H', '高度 H', 160], ['B', '底宽 B', 140]] },
    htri:   { name: '空心三角形', dims: [['H', '高度 H', 200], ['B', '底宽 B', 180], ['t', '壁厚 t', 10]] },
    rhomb:  { name: '菱形', dims: [['H', '高度 H', 160], ['B', '宽度 B', 120]] },
    hrhomb: { name: '空心菱形', dims: [['H', '高度 H', 160], ['B', '宽度 B', 120], ['t', '壁厚 t', 8]] },
    tee:    { name: 'T形', dims: [['H', '总高 H', 160], ['B', '翼缘宽 B', 90], ['tf', '翼缘厚 t_f', 12], ['tw', '腹板厚 t_w', 8]] },
    trap:   { name: '梯形', dims: [['H', '高度 H', 160], ['B1', '上底 B₁', 120], ['B2', '下底 B₂', 80]] },
    htrap:  { name: '空心梯形', dims: [['H', '高度 H', 160], ['B1', '上底 B₁', 120], ['B2', '下底 B₂', 80], ['t', '壁厚 t', 10]] },
    ibeam:  { name: '对称工字形', dims: [['H', '总高 H', 200], ['B', '翼缘宽 B', 120], ['tf', '翼缘厚 t_f', 12], ['tw', '腹板厚 t_w', 10]] },
    csh:    { name: 'C 形（开口槽钢）', dims: [['H', '总高 H', 200], ['B', '总宽 B', 70], ['tf', '翼缘厚 t_f', 12], ['tw', '腹板厚 t_w', 8]] }
  };

  function signedAreaOf(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  }
  /* 外轮廓统一 CCW，孔洞统一 CW，这样积分时孔洞自然为负 */
  function orient(pts, wantCCW) {
    const a = signedAreaOf(pts);
    return ((wantCCW && a >= 0) || (!wantCCW && a <= 0)) ? pts : pts.slice().reverse();
  }
  function circlePts(cx, cy, r, n) {
    n = n || 96;
    const p = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return p;
  }
  function rectPts(h, b) {
    return [[-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, h / 2], [-b / 2, h / 2]];
  }
  function lineInt(l1, l2) {
    const x1 = l1.a[0], y1 = l1.a[1], x2 = l1.b[0], y2 = l1.b[1];
    const x3 = l2.a[0], y3 = l2.a[1], x4 = l2.b[0], y4 = l2.b[1];
    const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(d) < 1e-9) return null;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
    return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
  }
  /* 凸多边形（CCW）等距内缩 */
  function offsetPoly(pts, t) {
    const n = pts.length, lines = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      lines.push({ a: [a[0] + t * nx, a[1] + t * ny], b: [b[0] + t * nx, b[1] + t * ny] });
    }
    const out = [];
    for (let i = 0; i < n; i++) {
      const p = lineInt(lines[(i - 1 + n) % n], lines[i]);
      out.push(p || lines[i].a);
    }
    return out;
  }
  /* 三角形内心 */
  function incenter(v) {
    const a = Math.hypot(v[1][0] - v[2][0], v[1][1] - v[2][1]);
    const b = Math.hypot(v[0][0] - v[2][0], v[0][1] - v[2][1]);
    const c = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]);
    const s = a + b + c;
    return [
      (a * v[0][0] + b * v[1][0] + c * v[2][0]) / s,
      (a * v[0][1] + b * v[1][1] + c * v[2][1]) / s
    ];
  }
  function polyArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a) / 2;
  }
  function polyPerim(pts) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      s += Math.hypot(q[0] - p[0], q[1] - p[1]);
    }
    return s;
  }
  /* 以内心为中心按 k 缩放（等距内缩的精确解） */
  function shrinkAbout(pts, center, k) {
    return pts.map(function (p) {
      return [center[0] + (p[0] - center[0]) * k, center[1] + (p[1] - center[1]) * k];
    });
  }

  /* 返回 { polys:[{pts,hole}], xmin..ymax, dims } */
  function secGeo(type, p) {
    const H = p.H || 0, B = p.B || 0, tf = p.tf || 0, tw = p.tw || 0,
          t = p.t || 0, B1 = p.B1 || 0, B2 = p.B2 || 0, D = p.D || 0;
    const polys = [];
    let dims = [];

    if (type === 'circle') {
      polys.push({ pts: circlePts(0, 0, D / 2), hole: false });
      dims = [['D', D]];
    } else if (type === 'tube') {
      polys.push({ pts: circlePts(0, 0, D / 2), hole: false });
      polys.push({ pts: circlePts(0, 0, Math.max(D / 2 - t, 0.5)), hole: true });
      dims = [['D', D], ['t', t]];
    } else if (type === 'rect') {
      polys.push({ pts: rectPts(H, B), hole: false });
      dims = [['H', H], ['B', B]];
    } else if (type === 'box') {
      polys.push({ pts: rectPts(H, B), hole: false });
      polys.push({ pts: rectPts(Math.max(H - 2 * tf, .5), Math.max(B - 2 * tw, .5)), hole: true });
      dims = [['H', H], ['B', B], ['t_f', tf], ['t_w', tw]];
    } else if (type === 'stri') {
      polys.push({ pts: [[-B / 2, -H / 2], [B / 2, -H / 2], [0, H / 2]], hole: false });
      dims = [['H', H], ['B', B]];
    } else if (type === 'htri') {
      const out = [[-B / 2, -H / 2], [B / 2, -H / 2], [0, H / 2]];
      const r = polyArea(out) / (polyPerim(out) / 2);
      const k = Math.max(1 - t / r, 0.02);
      polys.push({ pts: out, hole: false });
      polys.push({ pts: shrinkAbout(out, incenter(out), k), hole: true });
      dims = [['H', H], ['B', B], ['t', t]];
    } else if (type === 'rhomb') {
      polys.push({ pts: [[0, -H / 2], [B / 2, 0], [0, H / 2], [-B / 2, 0]], hole: false });
      dims = [['H', H], ['B', B]];
    } else if (type === 'hrhomb') {
      const out = [[0, -H / 2], [B / 2, 0], [0, H / 2], [-B / 2, 0]];
      const r = polyArea(out) / (polyPerim(out) / 2);
      const k = Math.max(1 - t / r, 0.02);
      polys.push({ pts: out, hole: false });
      polys.push({ pts: shrinkAbout(out, [0, 0], k), hole: true });
      dims = [['H', H], ['B', B], ['t', t]];
    } else if (type === 'tee') {
      const yb = -H / 2, yt = H / 2;
      polys.push({ pts: [
        [B / 2, yt], [B / 2, yt - tf], [tw / 2, yt - tf], [tw / 2, yb],
        [-tw / 2, yb], [-tw / 2, yt - tf], [-B / 2, yt - tf], [-B / 2, yt]
      ], hole: false });
      dims = [['H', H], ['B', B], ['t_f', tf], ['t_w', tw]];
    } else if (type === 'trap') {
      polys.push({ pts: [
        [-B2 / 2, -H / 2], [B2 / 2, -H / 2], [B1 / 2, H / 2], [-B1 / 2, H / 2]
      ], hole: false });
      dims = [['H', H], ['B_1', B1], ['B_2', B2]];
    } else if (type === 'htrap') {
      const out = [[-B2 / 2, -H / 2], [B2 / 2, -H / 2], [B1 / 2, H / 2], [-B1 / 2, H / 2]];
      polys.push({ pts: out, hole: false });
      const inner = offsetPoly(out, t);
      if (signedAreaOf(inner) > 1e-3) polys.push({ pts: inner, hole: true });
      dims = [['H', H], ['B_1', B1], ['B_2', B2], ['t', t]];
    } else if (type === 'ibeam') {
      const yb = -H / 2, yt = H / 2;
      polys.push({ pts: [
        [B / 2, yt], [B / 2, yt - tf], [tw / 2, yt - tf], [tw / 2, yb + tf],
        [B / 2, yb + tf], [B / 2, yb], [-B / 2, yb], [-B / 2, yb + tf],
        [-tw / 2, yb + tf], [-tw / 2, yt - tf], [-B / 2, yt - tf], [-B / 2, yt]
      ], hole: false });
      dims = [['H', H], ['B', B], ['t_f', tf], ['t_w', tw]];
    } else if (type === 'csh') {
      /* 开口朝右的 C 形：左侧腹板 + 上下两片翼缘（右腹板没有） */
      const yb = -H / 2, yt = H / 2;
      polys.push({ pts: [
        [-B / 2, yb], [B / 2, yb], [B / 2, yb + tf], [-B / 2 + tw, yb + tf],
        [-B / 2 + tw, yt - tf], [B / 2, yt - tf], [B / 2, yt], [-B / 2, yt]
      ], hole: false });
      dims = [['H', H], ['B', B], ['t_f', tf], ['t_w', tw]];
    }

    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    polys.forEach(function (o) {
      o.pts = orient(o.pts, !o.hole);
      o.pts.forEach(function (q) {
        if (q[0] < xmin) xmin = q[0];
        if (q[0] > xmax) xmax = q[0];
        if (q[1] < ymin) ymin = q[1];
        if (q[1] > ymax) ymax = q[1];
      });
    });
    return { polys: polys, xmin: xmin, xmax: xmax, ymin: ymin, ymax: ymax, dims: dims };
  }

  /* ---------- 多边形积分 ---------- */
  function signedProps(pts) {
    let A2 = 0, cx = 0, cy = 0, Ixo = 0, Iyo = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const x0 = pts[i][0], y0 = pts[i][1];
      const x1 = pts[(i + 1) % n][0], y1 = pts[(i + 1) % n][1];
      const cr = x0 * y1 - x1 * y0;
      A2 += cr;
      cx += (x0 + x1) * cr;
      cy += (y0 + y1) * cr;
      Ixo += (y0 * y0 + y0 * y1 + y1 * y1) * cr;
      Iyo += (x0 * x0 + x0 * x1 + x1 * x1) * cr;
    }
    const A = A2 / 2;
    if (Math.abs(A) < 1e-9) return { A: 0, cx: 0, cy: 0, Ixo: 0, Iyo: 0 };
    return { A: A, cx: cx / (6 * A), cy: cy / (6 * A), Ixo: Ixo / 12, Iyo: Iyo / 12 };
  }

  function clipHalf(pts, axis, val, keepGreater) {
    const out = [], n = pts.length;
    const f = function (q) { return axis === 'y' ? q[1] - val : q[0] - val; };
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const va = f(a), vb = f(b);
      const ia = keepGreater ? va >= 0 : va <= 0;
      const ib = keepGreater ? vb >= 0 : vb <= 0;
      if (ia) out.push(a);
      if (ia !== ib) {
        const tt = va / (va - vb);
        out.push([a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt]);
      }
    }
    return out;
  }

  /* ---------- 截面特性 ---------- */
  function secProps(type, p) {
    const g = secGeo(type, p);
    let A = 0, Ixo = 0, Iyo = 0, Mx = 0, My = 0;
    g.polys.forEach(function (o) {
      const pp = signedProps(o.pts);
      A += pp.A; Ixo += pp.Ixo; Iyo += pp.Iyo;
      Mx += pp.A * pp.cx; My += pp.A * pp.cy;
    });
    const cx = Mx / A, cy = My / A;
    let Ix = Ixo - A * cy * cy;
    let Iy = Iyo - A * cx * cx;

    /* 圆形 / 圆管用解析式，避免多边形离散误差 */
    if (type === 'circle' || type === 'tube') {
      const R = (p.D || 0) / 2;
      const Ri = type === 'tube' ? Math.max(R - p.t, 0) : 0;
      A = Math.PI * (R * R - Ri * Ri);
      Ix = Math.PI / 4 * (Math.pow(R, 4) - Math.pow(Ri, 4));
      Iy = Ix;
      g.__analy = true;
    }

    const yTop = Math.abs(g.ymax - cy), yBot = Math.abs(cy - g.ymin);
    const xR = Math.abs(g.xmax - cx), xL = Math.abs(cx - g.xmin);
    const yMax = Math.max(yTop, yBot);
    const xMax = Math.max(xR, xL);
    const Wx = Ix / yMax;
    const Wy = Iy / xMax;

    /* 半截面面积矩 */
    let SxT = 0, SxB = 0, SyR = 0, SyL = 0;
    if (type === 'circle' || type === 'tube') {
      const R = (p.D || 0) / 2;
      const Ri = type === 'tube' ? Math.max(R - p.t, 0) : 0;
      SxT = 2 / 3 * (Math.pow(R, 3) - Math.pow(Ri, 3));
      SxB = SxT; SyR = SxT; SyL = SxT;
    } else {
      g.polys.forEach(function (o) {
        let c = clipHalf(o.pts, 'y', cy, true);
        if (c.length >= 3) { const q = signedProps(c); SxT += q.A * (q.cy - cy); }
        c = clipHalf(o.pts, 'y', cy, false);
        if (c.length >= 3) { const q = signedProps(c); SxB += -q.A * (q.cy - cy); }
        c = clipHalf(o.pts, 'x', cx, true);
        if (c.length >= 3) { const q = signedProps(c); SyR += q.A * (q.cx - cx); }
        c = clipHalf(o.pts, 'x', cx, false);
        if (c.length >= 3) { const q = signedProps(c); SyL += -q.A * (q.cx - cx); }
      });
    }
    const Sx = Math.max(Math.abs(SxT), Math.abs(SxB));
    const Sy = Math.max(Math.abs(SyR), Math.abs(SyL));

    /* 碳钢厚度分组用的控制厚度：受弯最外纤维所在板件 */
    let tc, tcNote;
    if (type === 'tube') { tc = p.t; tcNote = '圆管壁厚 t'; }
    else if (type === 'box' || type === 'tee' || type === 'ibeam' || type === 'csh') { tc = p.tf; tcNote = '翼缘厚 t_f'; }
    else if (type === 'htri' || type === 'hrhomb' || type === 'htrap') { tc = p.t; tcNote = '壁厚 t'; }
    else { tc = Math.max(p.H || 0, p.D || 0); tcNote = '实心截面，取截面厚度'; }

    return {
      A: A, Ix: Ix, Iy: Iy, Wx: Wx, Wy: Wy, Sx: Sx, Sy: Sy,
      ix: Math.sqrt(Ix / A), iy: Math.sqrt(Iy / A),
      cx: cx, cy: cy, yMax: yMax, xMax: xMax,
      tc: tc, tcNote: tcNote, geo: g
    };
  }

  function sectionIcon(type) {
    const defaults = {};
    SECTIONS[type].dims.forEach(function (d) { defaults[d[0]] = d[2]; });
    const geo = secGeo(type, defaults);
    const scale = 34 / Math.max(geo.xmax - geo.xmin, geo.ymax - geo.ymin);
    const cx = (geo.xmin + geo.xmax) / 2, cy = (geo.ymin + geo.ymax) / 2;
    const path = geo.polys.map(function (poly) {
      return poly.pts.map(function (p, i) {
        return (i ? 'L' : 'M') + (24 + (p[0] - cx) * scale).toFixed(2) + ' ' +
          (24 - (p[1] - cy) * scale).toFixed(2);
      }).join(' ') + 'Z';
    }).join(' ');
    return '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="' + path +
      '" fill="currentColor" fill-opacity=".16" fill-rule="evenodd" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  }
  function rightEdgeX(pts, y) {
    let best = null;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (a[1] === b[1]) continue;
      if ((a[1] - y) * (b[1] - y) <= 0) {
        const t = (y - a[1]) / (b[1] - a[1]);
        const x = a[0] + (b[0] - a[0]) * t;
        if (best === null || x > best) best = x;
      }
    }
    return best === null ? 0 : best;
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }
  /* SVG 内嵌 HTML 输入框：尺寸直接标在图上改 */
  function foBox(x, y, w, h, inner) {
    return '<foreignObject x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '">' +
           '<div xmlns="http://www.w3.org/1999/xhtml" class="dbox">' + inner + '</div></foreignObject>';
  }
  const TIP_COMMIT = '改完按回车（或点其他地方）生效';
  function foInp(key, raw, cls, title) {
    return '<input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" ' +
           'data-dim="' + key + '" class="' + (cls || 'dim-w') + '" value="' + esc(raw) +
           '" title="' + esc(title || TIP_COMMIT) + '" aria-label="' + key + '"/>';
  }
  function ln(x1, y1, x2, y2, col, w, dash) {
    return '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) +
           '" y2="' + y2.toFixed(1) + '" stroke="' + col + '" stroke-width="' + w + '"' +
           (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>';
  }

  function drawSection(type, p, raw = p) {
    const W = 340, Hh = 242;
    const g = secGeo(type, p);
    const bw = Math.max(g.xmax - g.xmin, 1e-6);
    const bh = Math.max(g.ymax - g.ymin, 1e-6);
    const hasB1 = (type === 'trap' || type === 'htrap');
    const wallKind = ['tube', 'box', 'tee', 'ibeam', 'csh', 'htri', 'hrhomb', 'htrap'].indexOf(type) >= 0;
    const padL = 66, padR = wallKind ? 76 : 22;
    const availW = W - padL - padR;
    const top = hasB1 ? 44 : 30, bot = 186;
    const availH = bot - top;
    const sc = Math.min(availW / bw, availH / bh);
    const cx0 = g.xmin + bw / 2, cy0 = g.ymin + bh / 2;
    const ox = padL + availW / 2, oy = (top + bot) / 2;
    const px = function (x) { return ox + (x - cx0) * sc; };
    const py = function (y) { return oy - (y - cy0) * sc; };

    let d = '';
    g.polys.forEach(function (o) {
      o.pts.forEach(function (q, i) {
        d += (i === 0 ? 'M' : 'L') + px(q[0]).toFixed(2) + ',' + py(q[1]).toFixed(2);
      });
      d += 'Z';
    });

    const xLo = px(g.xmin), xHi = px(g.xmax);
    const yHi = py(g.ymax), yLo = py(g.ymin);
    const dimX = 56, dimY = 198;


    let s = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" role="group" aria-label="截面尺寸，单位毫米">';
    s += '<path d="' + d + '" fill="#dbe7fb" fill-rule="evenodd" stroke="#2f6feb" stroke-width="1.6" stroke-linejoin="round"/>';

    /* ---------- 竖向总高（左侧） ---------- */
    const vKey = (type === 'circle' || type === 'tube') ? 'D' : 'H';
    s += ln(dimX, yHi, dimX, yLo, '#9aa3b2', 1);
    s += ln(dimX - 4, yHi, dimX + 4, yHi, '#9aa3b2', 1);
    s += ln(dimX - 4, yLo, dimX + 4, yLo, '#9aa3b2', 1);
    s += ln(dimX + 5, yHi, xLo, yHi, '#d3d9e5', 0.8, '2 3');
    s += ln(dimX + 5, yLo, xLo, yLo, '#d3d9e5', 0.8, '2 3');
    s += foBox(0, (yHi + yLo) / 2 - 12, 60, 24,
               '<i>' + vKey + '</i>' + foInp(vKey, raw[vKey]));

    /* ---------- 上底 B1（梯形，顶部） ---------- */
    if (hasB1) {
      const b1a = px(-p.B1 / 2), b1b = px(p.B1 / 2);
      s += ln(b1a, 26, b1b, 26, '#9aa3b2', 1);
      s += ln(b1a, 22, b1a, 30, '#9aa3b2', 1);
      s += ln(b1b, 22, b1b, 30, '#9aa3b2', 1);
      s += ln(b1a, 30, b1a, yHi, '#d3d9e5', 0.8, '2 3');
      s += ln(b1b, 30, b1b, yHi, '#d3d9e5', 0.8, '2 3');
      s += foBox((b1a + b1b) / 2 - 33, 0, 66, 24,
                 '<i>B₁</i>' + foInp('B1', raw.B1));
    }

    /* ---------- 横向总宽（底部） ----------
       梯形必须按下底 B₂ 自己的宽度画，不能拿包围盒（最宽的那条边）当界限，
       否则短底边的标注线会画到长底边上去。 */
    const hKey = (type === 'circle' || type === 'tube') ? 'D'
               : (hasB1 ? 'B2' : 'B');
    const hLbl = hKey === 'D' ? 'D' : (hKey === 'B2' ? 'B₂' : 'B');
    const wA = hasB1 ? px(-p.B2 / 2) : xLo;
    const wB = hasB1 ? px(p.B2 / 2) : xHi;
    s += ln(wA, dimY, wB, dimY, '#9aa3b2', 1);
    s += ln(wA, dimY - 4, wA, dimY + 4, '#9aa3b2', 1);
    s += ln(wB, dimY - 4, wB, dimY + 4, '#9aa3b2', 1);
    s += ln(wA, yLo, wA, dimY, '#d3d9e5', 0.8, '2 3');
    s += ln(wB, yLo, wB, dimY, '#d3d9e5', 0.8, '2 3');
    s += foBox((wA + wB) / 2 - 33, 200, 66, 24,
               '<i>' + hLbl + '</i>' + foInp(hKey, raw[hKey]));

    /* ---------- 壁厚（右侧，引线 + 加粗示意线） ---------- */
    if (wallKind) {
      const anns = [];
      if (type === 'tube') {
        anns.push({ k: 't', l: 't', lx: px(p.D / 2 - p.t / 2), ly: py(0),
                    mk: [px(p.D / 2 - p.t), py(0), px(p.D / 2), py(0)] });
      } else if (type === 'box') {
        anns.push({ k: 'tf', l: 't_f', lx: px(p.B / 2 - p.tw / 2), ly: py(p.H / 2 - p.tf / 2),
                    mk: [px(p.B / 2 - p.tw / 2), py(p.H / 2 - p.tf), px(p.B / 2 - p.tw / 2), py(p.H / 2)] });
        anns.push({ k: 'tw', l: 't_w', lx: px(p.B / 2 - p.tw / 2), ly: py(0),
                    mk: [px(p.B / 2 - p.tw), py(0), px(p.B / 2), py(0)] });
      } else if (type === 'tee' || type === 'ibeam') {
        anns.push({ k: 'tf', l: 't_f', lx: px(p.B * 0.3), ly: py(p.H / 2 - p.tf / 2),
                    mk: [px(p.B * 0.3), py(p.H / 2 - p.tf), px(p.B * 0.3), py(p.H / 2)] });
        anns.push({ k: 'tw', l: 't_w', lx: px(p.tw / 2), ly: py(0),
                    mk: [px(-p.tw / 2), py(0), px(p.tw / 2), py(0)] });
      } else if (type === 'csh') {
        /* 开口朝右：翼缘厚标在上翼缘，腹板厚标在左侧那片腹板（引线从开口穿过） */
        anns.push({ k: 'tf', l: 't_f', lx: px(p.B * 0.2), ly: py(p.H / 2 - p.tf / 2),
                    mk: [px(p.B * 0.2), py(p.H / 2 - p.tf), px(p.B * 0.2), py(p.H / 2)] });
        anns.push({ k: 'tw', l: 't_w', lx: px(-p.B / 2 + p.tw / 2), ly: py(0),
                    mk: [px(-p.B / 2), py(0), px(-p.B / 2 + p.tw), py(0)] });
      } else {
        const xo = rightEdgeX(g.polys[0].pts, 0);
        const xi = g.polys[1] ? rightEdgeX(g.polys[1].pts, 0) : 0;
        anns.push({ k: 't', l: 't', lx: px((xo + xi) / 2), ly: py(0),
                    mk: [px(xi), py(0), px(xo), py(0)] });
      }
      const tagX = W - 74;
      anns.forEach(function (a, i) {
        const yy = anns.length > 1 ? (i === 0 ? 38 : 74) : 50;
        if (a.mk) s += ln(a.mk[0], a.mk[1], a.mk[2], a.mk[3], '#2f6feb', 2.6);
        s += ln(tagX, yy + 12, a.lx, a.ly, '#b9c6dd', 0.9, '3 2');
        s += foBox(tagX, yy, 72, 24, '<i>' + a.l + '</i>' + foInp(a.k, raw[a.k]));
      });
    }

    s += '</svg>';
    return s;
  }


  function validate(type, p) {
    if (!SECTIONS[type]) throw new Error('未知截面');
    for (const [key,label] of SECTIONS[type].dims) {
      if (!Number.isFinite(p[key]) || p[key] <= 0 || p[key] > 3000)
        throw new Error(label+'应大于 0 且不超过 3000 mm');
    }
    if (type === 'tube' && 2*p.t >= p.D) throw new Error('圆管壁厚必须小于外径的一半');
    if (['box','ibeam','csh'].includes(type) && (2*p.tf >= p.H || (type==='box'?2*p.tw:p.tw) >= p.B))
      throw new Error('板厚过大，截面不能形成有效的腹板或空腔');
    if (type === 'tee' && (p.tf >= p.H || p.tw >= p.B)) throw new Error('T形要求 tf < H、tw < B');
    if (['htri','hrhomb'].includes(type)) {
      const out=secGeo(type,p).polys[0].pts;
      if(p.t >= 2*polyArea(out)/polyPerim(out)) throw new Error('壁厚达到内切圆半径，空腔已消失');
    }
    if (type === 'htrap') {
      const slope=(p.B1-p.B2)/(2*p.H), shift=p.t*Math.sqrt(1+slope*slope);
      const bottom=p.B2/2+slope*p.t-shift, top=p.B1/2-slope*p.t-shift;
      if(2*p.t>=p.H || Math.min(bottom,top)<=0) throw new Error('梯形壁厚过大，无法形成有效空腔');
    }
  }
  function properties(type,p) {
    validate(type,p);
    const s=secProps(type,p);
    if (![s.A,s.Ix,s.Iy,s.Wx,s.Wy].every(v=>Number.isFinite(v)&&v>0)) throw new Error('截面几何无效');
    return s;
  }
  const api={sections:SECTIONS,geometry:secGeo,properties,validate,icon:sectionIcon,draw:drawSection};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.MullionSections=api;
})(typeof globalThis!=='undefined'?globalThis:this);
