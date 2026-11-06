// 写真の輪郭から立体を作る（シルエットの積み重ね＝ビジュアルハル）。
// いくつかの向きから見た輪郭（mm の2次元の点の列）を、それぞれの向きにのばして、全部に入る所だけを残す。
// できた形は、どの写真に重ねても輪郭がぴったり合う。

function polyDist(px, py, V) {
  let d = (px - V[0][0]) ** 2 + (py - V[0][1]) ** 2, s = 1;
  for (let i = 0, j = V.length - 1; i < V.length; j = i, i++) {
    const ex = V[j][0] - V[i][0], ey = V[j][1] - V[i][1], wx = px - V[i][0], wy = py - V[i][1];
    const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey || 1)));
    const bx = wx - ex * t, by = wy - ey * t;
    d = Math.min(d, bx * bx + by * by);
    const c1 = py >= V[i][1], c2 = py < V[j][1], c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}

// view = { u:[..], v:[..], o:[..], poly:[[a,b],...] }
//   u, v：写真の横・縦に当たる3次元の向き（単位ベクトル）、o：写真の (0,0) に当たる3次元の点、poly：輪郭（mm）
export function hull(views, pad = 2) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  // 外枠：各向きの輪郭の範囲の重なり
  const range = (view) => {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [a, b] of view.poly) { a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
    return { a0, a1, b0, b1 };
  };
  const corners = [];
  for (const vw of views) { const r = range(vw); for (const a of [r.a0, r.a1]) for (const b of [r.b0, r.b1]) corners.push(vw.o.map((q, k) => q + vw.u[k] * a + vw.v[k] * b)); }
  for (const p of corners) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k] - pad); hi[k] = Math.max(hi[k], p[k] + pad); }
  return {
    f: (x, y, z) => {
      let d = -1e9;
      for (const vw of views) {
        const rx = x - vw.o[0], ry = y - vw.o[1], rz = z - vw.o[2];
        const a = rx * vw.u[0] + ry * vw.u[1] + rz * vw.u[2], b = rx * vw.v[0] + ry * vw.v[1] + rz * vw.v[2];
        d = Math.max(d, polyDist(a, b, vw.poly));
      }
      return d;
    },
    lo, hi,
  };
}
