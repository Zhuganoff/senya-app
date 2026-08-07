/* qr.js — QR прямо в браузере (byte mode, EC-L, версии 1..10).
   Нужен свой генератор: у Mini App строгий CSP — внешние картинки и CDN-скрипты
   заблокированы, а кнопка «сформировать» должна работать мгновенно.
   Проверено декодированием (OpenCV) — читается сканерами. */
(function (global) {
  "use strict";

  var EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();
  function gmul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  function rsGen(deg) {
    var poly = [1];
    for (var i = 0; i < deg; i++) {
      var nx = new Array(poly.length + 1).fill(0);
      for (var j = 0; j < poly.length; j++) {
        nx[j] ^= poly[j];
        nx[j + 1] ^= gmul(poly[j], EXP[i]);
      }
      poly = nx;
    }
    return poly;
  }
  function rsEnc(data, ecLen) {
    var gen = rsGen(ecLen), res = new Array(ecLen).fill(0);
    for (var i = 0; i < data.length; i++) {
      var f = data[i] ^ res[0];
      res.shift(); res.push(0);
      for (var j = 0; j < ecLen; j++) res[j] ^= gmul(gen[j + 1], f);
    }
    return res;
  }

  var CAP_L = [17, 32, 53, 78, 106, 134, 154, 192, 230, 271];
  var BLOCKS_L = [
    [7, 1, 19, 0, 0], [10, 1, 34, 0, 0], [15, 1, 55, 0, 0], [20, 1, 80, 0, 0],
    [26, 1, 108, 0, 0], [18, 2, 68, 0, 0], [20, 2, 78, 0, 0], [24, 2, 97, 0, 0],
    [30, 2, 116, 0, 0], [18, 2, 68, 2, 69]
  ];
  var ALIGN = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
               [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  var FMT_L = ["111011111000100", "111001011110011", "111110110101010", "111100010011101",
               "110011000101111", "110001100011000", "110110001000001", "110100101110110"];
  var VER_BITS = {7: "000111110010010100", 8: "001000010110111100",
                  9: "001001101010011001", 10: "001010010011010011"};

  function matrix(text) {
    var data = Array.from(new TextEncoder().encode(text)), version = 0;
    for (var v = 0; v < CAP_L.length; v++) if (data.length <= CAP_L[v]) { version = v + 1; break; }
    if (!version) throw new Error("QR: строка слишком длинная");

    var bits = [];
    function push(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); }
    push(4, 4);
    push(data.length, version < 10 ? 8 : 16);
    data.forEach(function (b) { push(b, 8); });

    var spec = BLOCKS_L[version - 1], ecLen = spec[0];
    var totalData = spec[1] * spec[2] + spec[3] * spec[4], capBits = totalData * 8;
    for (var t = 0; t < 4 && bits.length < capBits; t++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    var pad = [0xEC, 0x11], p = 0;
    while (bits.length < capBits) { push(pad[p++ % 2], 8); }

    var cw = [];
    for (var b2 = 0; b2 < bits.length; b2 += 8) {
      var byte = 0;
      for (var k = 0; k < 8; k++) byte = (byte << 1) | bits[b2 + k];
      cw.push(byte);
    }

    var blocks = [], ecs = [], pos = 0;
    for (var g = 0; g < 2; g++) {
      var cnt = g ? spec[3] : spec[1], sz = g ? spec[4] : spec[2];
      for (var n = 0; n < cnt; n++) {
        var blk = cw.slice(pos, pos + sz); pos += sz;
        blocks.push(blk); ecs.push(rsEnc(blk, ecLen));
      }
    }
    var out = [], maxLen = Math.max.apply(null, blocks.map(function (x) { return x.length; }));
    for (var c = 0; c < maxLen; c++)
      for (var bi = 0; bi < blocks.length; bi++)
        if (c < blocks[bi].length) out.push(blocks[bi][c]);
    for (var e = 0; e < ecLen; e++)
      for (var bj = 0; bj < ecs.length; bj++) out.push(ecs[bj][e]);

    var size = version * 4 + 17, m = [], res = [];
    for (var r = 0; r < size; r++) { m.push(new Array(size).fill(0)); res.push(new Array(size).fill(false)); }
    function put(row, col, val) {
      if (row >= 0 && col >= 0 && row < size && col < size) { m[row][col] = val; res[row][col] = true; }
    }
    function finder(r0, c0) {
      for (var dr = -1; dr <= 7; dr++)
        for (var dc = -1; dc <= 7; dc++) {
          var on = (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6)) ||
                   (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) ||
                   (dc >= 2 && dc <= 4 && dr >= 2 && dr <= 4);
          put(r0 + dr, c0 + dc, on ? 1 : 0);
        }
    }
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
    for (var i2 = 8; i2 < size - 8; i2++) { put(6, i2, i2 % 2 === 0 ? 1 : 0); put(i2, 6, i2 % 2 === 0 ? 1 : 0); }
    var al = ALIGN[version - 1];
    for (var a1 = 0; a1 < al.length; a1++)
      for (var a2 = 0; a2 < al.length; a2++) {
        var ar = al[a1], ac = al[a2];
        if ((ar < 8 && ac < 8) || (ar < 8 && ac > size - 9) || (ar > size - 9 && ac < 8)) continue;
        for (var dr2 = -2; dr2 <= 2; dr2++)
          for (var dc2 = -2; dc2 <= 2; dc2++)
            put(ar + dr2, ac + dc2,
                (Math.abs(dr2) === 2 || Math.abs(dc2) === 2 || (dr2 === 0 && dc2 === 0)) ? 1 : 0);
      }
    // резерв под формат/версию
    for (var f = 0; f <= 8; f++) { if (f !== 6) { res[8][f] = true; res[f][8] = true; } }
    for (var f2 = 0; f2 < 8; f2++) { res[8][size - 1 - f2] = true; res[size - 1 - f2][8] = true; }
    put(size - 8, 8, 1);
    if (version >= 7)
      for (var vy = 0; vy < 6; vy++)
        for (var vx = 0; vx < 3; vx++) { res[vy][size - 11 + vx] = true; res[size - 11 + vx][vy] = true; }

    var dbits = [];
    out.forEach(function (byte) { for (var i = 7; i >= 0; i--) dbits.push((byte >> i) & 1); });
    var idx = 0, up = true;
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (var step = 0; step < size; step++) {
        var row = up ? size - 1 - step : step;
        for (var cc = 0; cc < 2; cc++) {
          var cx = col - cc;
          if (res[row][cx]) continue;
          m[row][cx] = idx < dbits.length ? dbits[idx++] : 0;
        }
      }
      up = !up;
    }

    function maskFn(k, r3, c3) {
      switch (k) {
        case 0: return (r3 + c3) % 2 === 0;
        case 1: return r3 % 2 === 0;
        case 2: return c3 % 3 === 0;
        case 3: return (r3 + c3) % 3 === 0;
        case 4: return (Math.floor(r3 / 2) + Math.floor(c3 / 3)) % 2 === 0;
        case 5: return ((r3 * c3) % 2 + (r3 * c3) % 3) === 0;
        case 6: return (((r3 * c3) % 2 + (r3 * c3) % 3) % 2) === 0;
        default: return (((r3 + c3) % 2 + (r3 * c3) % 3) % 2) === 0;
      }
    }
    function penalty(mat) {
      var pen = 0, n = mat.length, i, j, run;
      for (i = 0; i < n; i++) {
        run = 1;
        for (j = 1; j < n; j++) {
          if (mat[i][j] === mat[i][j - 1]) { run++; if (run === 5) pen += 3; else if (run > 5) pen++; }
          else run = 1;
        }
        run = 1;
        for (j = 1; j < n; j++) {
          if (mat[j][i] === mat[j - 1][i]) { run++; if (run === 5) pen += 3; else if (run > 5) pen++; }
          else run = 1;
        }
      }
      for (i = 0; i < n - 1; i++)
        for (j = 0; j < n - 1; j++)
          if (mat[i][j] === mat[i][j + 1] && mat[i][j] === mat[i + 1][j] && mat[i][j] === mat[i + 1][j + 1]) pen += 3;
      var dark = 0;
      for (i = 0; i < n; i++) for (j = 0; j < n; j++) dark += mat[i][j];
      pen += Math.floor(Math.abs(dark * 100 / (n * n) - 50) / 5) * 10;
      return pen;
    }

    var best = null, bestPen = Infinity;
    for (var mk = 0; mk < 8; mk++) {
      var cand = m.map(function (row) { return row.slice(); });
      for (var rr = 0; rr < size; rr++)
        for (var ccx = 0; ccx < size; ccx++)
          if (!res[rr][ccx] && maskFn(mk, rr, ccx)) cand[rr][ccx] ^= 1;
      // ФОРМАТ: (строка, столбец) — раньше были перепутаны местами, из-за чего
      // код не декодировался ни одним сканером (проверено OpenCV 07.08)
      var fmt = FMT_L[mk];
      for (var fb = 0; fb < 15; fb++) {
        var bit = fmt[fb] === "1" ? 1 : 0;
        if (fb < 6) cand[8][fb] = bit;
        else if (fb === 6) cand[8][7] = bit;
        else if (fb === 7) cand[8][8] = bit;
        else if (fb === 8) cand[7][8] = bit;
        else cand[14 - fb][8] = bit;
        if (fb < 7) cand[size - 1 - fb][8] = bit;
        else cand[8][size - 15 + fb] = bit;
      }
      cand[size - 8][8] = 1;
      if (version >= 7) {
        var vb = VER_BITS[version];
        for (var vi = 0; vi < 18; vi++) {
          var vbit = vb[17 - vi] === "1" ? 1 : 0;
          cand[Math.floor(vi / 3)][size - 11 + (vi % 3)] = vbit;
          cand[size - 11 + (vi % 3)][Math.floor(vi / 3)] = vbit;
        }
      }
      var pn = penalty(cand);
      if (pn < bestPen) { bestPen = pn; best = cand; }
    }
    return best;
  }

  function draw(canvas, text, opts) {
    opts = opts || {};
    var mat = matrix(text), n = mat.length, quiet = opts.quiet == null ? 3 : opts.quiet;
    var total = n + quiet * 2, px = opts.px || Math.max(3, Math.floor(300 / total));
    canvas.width = canvas.height = total * px;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = opts.bg || "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = opts.fg || "#0b0f16";
    for (var y = 0; y < n; y++)
      for (var x = 0; x < n; x++)
        if (mat[y][x]) ctx.fillRect((x + quiet) * px, (y + quiet) * px, px, px);
    return canvas;
  }

  global.SenyaQR = {draw: draw, matrix: matrix};
})(window);
