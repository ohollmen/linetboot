/*
 * Vendored combination of sha512crypt-node (sha512crypt.js + lib/sha512.js).
 * Only the functions required by b64_sha512crypt() are retained; unused
 * exports from sha512.js (hex_sha512, b64_sha512, rstr2hex, rstr2b64,
 * hmac variants, vm_test, utf-16 helpers, rstr2any) are omitted.
 *
 * ---- sha512.js original header ----
 * A JavaScript implementation of the Secure Hash Algorithm, SHA-512, as
 * defined in FIPS 180-2.
 * Version 2.2 Copyright Anonymous Contributor, Paul Johnston 2000 - 2009.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License.
 * See http://pajhome.org.uk/crypt/md5 for details.
 *
 * ---- sha512crypt.js original header ----
 * A JavaScript implementation of the sha512crypt algorithm as implemented
 * by eglibc (http://www.akkadia.org/drepper/SHA-crypt.txt)
 * Version 0.1 (c) 2013 Michael Vogt <mvo@debian.org>
 * Distributed under the 2-clause BSD License.
 */

"use strict";

// ── SHA-512 primitives (from lib/sha512.js) ──────────────────────────────────

// 64-bit integer represented as two 32-bit halves (h = high, l = low).
function int64(h, l)       { this.h = h; this.l = l; }
function int64copy(dst, src)  { dst.h = src.h; dst.l = src.l; }

// Right-rotate by shift bits (shift < 32).
function int64rrot(dst, x, shift) {
  dst.l = (x.l >>> shift) | (x.h << (32 - shift));
  dst.h = (x.h >>> shift) | (x.l << (32 - shift));
}

// Swap the two 32-bit halves, then right-rotate by shift — equivalent to
// rotating the full 64-bit value by (32 + shift).
function int64revrrot(dst, x, shift) {
  dst.l = (x.h >>> shift) | (x.l << (32 - shift));
  dst.h = (x.l >>> shift) | (x.h << (32 - shift));
}

// Logical right-shift by shift bits (shift < 32).
function int64shr(dst, x, shift) {
  dst.l = (x.l >>> shift) | (x.h << (32 - shift));
  dst.h = (x.h >>> shift);
}

function int64add(dst, x, y) {
  var w0 = (x.l & 0xffff) + (y.l & 0xffff);
  var w1 = (x.l >>> 16)   + (y.l >>> 16)   + (w0 >>> 16);
  var w2 = (x.h & 0xffff) + (y.h & 0xffff) + (w1 >>> 16);
  var w3 = (x.h >>> 16)   + (y.h >>> 16)   + (w2 >>> 16);
  dst.l = (w0 & 0xffff) | (w1 << 16);
  dst.h = (w2 & 0xffff) | (w3 << 16);
}

function int64add4(dst, a, b, c, d) {
  var w0 = (a.l & 0xffff) + (b.l & 0xffff) + (c.l & 0xffff) + (d.l & 0xffff);
  var w1 = (a.l >>> 16) + (b.l >>> 16) + (c.l >>> 16) + (d.l >>> 16) + (w0 >>> 16);
  var w2 = (a.h & 0xffff) + (b.h & 0xffff) + (c.h & 0xffff) + (d.h & 0xffff) + (w1 >>> 16);
  var w3 = (a.h >>> 16) + (b.h >>> 16) + (c.h >>> 16) + (d.h >>> 16) + (w2 >>> 16);
  dst.l = (w0 & 0xffff) | (w1 << 16);
  dst.h = (w2 & 0xffff) | (w3 << 16);
}

function int64add5(dst, a, b, c, d, e) {
  var w0 = (a.l & 0xffff) + (b.l & 0xffff) + (c.l & 0xffff) + (d.l & 0xffff) + (e.l & 0xffff);
  var w1 = (a.l >>> 16) + (b.l >>> 16) + (c.l >>> 16) + (d.l >>> 16) + (e.l >>> 16) + (w0 >>> 16);
  var w2 = (a.h & 0xffff) + (b.h & 0xffff) + (c.h & 0xffff) + (d.h & 0xffff) + (e.h & 0xffff) + (w1 >>> 16);
  var w3 = (a.h >>> 16) + (b.h >>> 16) + (c.h >>> 16) + (d.h >>> 16) + (e.h >>> 16) + (w2 >>> 16);
  dst.l = (w0 & 0xffff) | (w1 << 16);
  dst.h = (w2 & 0xffff) | (w3 << 16);
}

// Raw string → array of big-endian 32-bit words (characters >255 lose high byte).
function rstr2binb(input) {
  var output = Array(input.length >> 2);
  for (var i = 0; i < output.length; i++) output[i] = 0;
  for (var i = 0; i < input.length * 8; i += 8)
    output[i >> 5] |= (input.charCodeAt(i / 8) & 0xFF) << (24 - i % 32);
  return output;
}

// Array of big-endian 32-bit words → raw string.
function binb2rstr(input) {
  var output = "";
  for (var i = 0; i < input.length * 32; i += 8)
    output += String.fromCharCode((input[i >> 5] >>> (24 - i % 32)) & 0xFF);
  return output;
}

// SHA-512 over an array of big-endian 32-bit words of bit-length len.
// The 80 round constants K[0..79] are the first 64 bits of the fractional
// parts of the cube roots of the first 80 primes, per FIPS 180-2 §4.2.3.
var sha512_k;
function binb_sha512(x, len) {
  if (sha512_k == undefined) {
    sha512_k = [
      new int64(0x428a2f98, -685199838),  new int64(0x71374491, 0x23ef65cd),
      new int64(-1245643825, -330482897), new int64(-373957723, -2121671748),
      new int64(0x3956c25b, -213338824),  new int64(0x59f111f1, -1241133031),
      new int64(-1841331548,-1357295717), new int64(-1424204075, -630357736),
      new int64(-670586216, -1560083902), new int64(0x12835b01, 0x45706fbe),
      new int64(0x243185be, 0x4ee4b28c),  new int64(0x550c7dc3, -704662302),
      new int64(0x72be5d74, -226784913),  new int64(-2132889090, 0x3b1696b1),
      new int64(-1680079193, 0x25c71235), new int64(-1046744716, -815192428),
      new int64(-459576895, -1628353838), new int64(-272742522, 0x384f25e3),
      new int64(0xfc19dc6, -1953704523),  new int64(0x240ca1cc, 0x77ac9c65),
      new int64(0x2de92c6f, 0x592b0275),  new int64(0x4a7484aa, 0x6ea6e483),
      new int64(0x5cb0a9dc, -1119749164), new int64(0x76f988da, -2096016459),
      new int64(-1740746414, -295247957), new int64(-1473132947, 0x2db43210),
      new int64(-1341970488,-1728372417), new int64(-1084653625,-1091629340),
      new int64(-958395405, 0x3da88fc2),  new int64(-710438585, -1828018395),
      new int64(0x6ca6351, -536640913),   new int64(0x14292967, 0xa0e6e70),
      new int64(0x27b70a85, 0x46d22ffc),  new int64(0x2e1b2138, 0x5c26c926),
      new int64(0x4d2c6dfc, 0x5ac42aed),  new int64(0x53380d13, -1651133473),
      new int64(0x650a7354, -1951439906), new int64(0x766a0abb, 0x3c77b2a8),
      new int64(-2117940946, 0x47edaee6), new int64(-1838011259, 0x1482353b),
      new int64(-1564481375, 0x4cf10364), new int64(-1474664885,-1136513023),
      new int64(-1035236496, -789014639), new int64(-949202525, 0x654be30),
      new int64(-778901479, -688958952),  new int64(-694614492, 0x5565a910),
      new int64(-200395387, 0x5771202a),  new int64(0x106aa070, 0x32bbd1b8),
      new int64(0x19a4c116, -1194143544), new int64(0x1e376c08, 0x5141ab53),
      new int64(0x2748774c, -544281703),  new int64(0x34b0bcb5, -509917016),
      new int64(0x391c0cb3, -976659869),  new int64(0x4ed8aa4a, -482243893),
      new int64(0x5b9cca4f, 0x7763e373),  new int64(0x682e6ff3, -692930397),
      new int64(0x748f82ee, 0x5defb2fc),  new int64(0x78a5636f, 0x43172f60),
      new int64(-2067236844,-1578062990), new int64(-1933114872, 0x1a6439ec),
      new int64(-1866530822, 0x23631e28), new int64(-1538233109, -561857047),
      new int64(-1090935817,-1295615723), new int64(-965641998, -479046869),
      new int64(-903397682, -366583396),  new int64(-779700025, 0x21c0c207),
      new int64(-354779690, -840897762),  new int64(-176337025, -294727304),
      new int64(0x6f067aa, 0x72176fba),   new int64(0xa637dc5, -1563912026),
      new int64(0x113f9804, -1090974290), new int64(0x1b710b35, 0x131c471b),
      new int64(0x28db77f5, 0x23047d84),  new int64(0x32caab7b, 0x40c72493),
      new int64(0x3c9ebe0a, 0x15c9bebc),  new int64(0x431d67c4, -1676669620),
      new int64(0x4cc5d4be, -885112138),  new int64(0x597f299c, -60457430),
      new int64(0x5fcb6fab, 0x3ad6faec),  new int64(0x6c44198c, 0x4a475817),
    ];
  }

  // Initial hash values H[0..7]: first 64 bits of fractional parts of
  // square roots of the first 8 primes (2, 3, 5, 7, 11, 13, 17, 19).
  var H = [
    new int64(0x6a09e667, -205731576),
    new int64(-1150833019, -2067093701),
    new int64(0x3c6ef372, -23791573),
    new int64(-1521486534, 0x5f1d36f1),
    new int64(0x510e527f, -1377402159),
    new int64(-1694144372, 0x2b3e6c1f),
    new int64(0x1f83d9ab, -79577749),
    new int64(0x5be0cd19, 0x137e2179),
  ];

  var T1 = new int64(0, 0), T2 = new int64(0, 0),
      a  = new int64(0, 0), b  = new int64(0, 0),
      c  = new int64(0, 0), d  = new int64(0, 0),
      e  = new int64(0, 0), f  = new int64(0, 0),
      g  = new int64(0, 0), h  = new int64(0, 0),
      s0 = new int64(0, 0), s1 = new int64(0, 0),
      Ch = new int64(0, 0), Maj= new int64(0, 0),
      r1 = new int64(0, 0), r2 = new int64(0, 0), r3 = new int64(0, 0);

  var W = [];
  for (var i = 0; i < 80; i++) W[i] = new int64(0, 0);

  // Append length padding (FIPS 180-2 §5.1.2).
  x[len >> 5] |= 0x80 << (24 - (len & 0x1f));
  x[((len + 128 >> 10) << 5) + 31] = len;

  for (var i = 0; i < x.length; i += 32) {
    int64copy(a, H[0]); int64copy(b, H[1]);
    int64copy(c, H[2]); int64copy(d, H[3]);
    int64copy(e, H[4]); int64copy(f, H[5]);
    int64copy(g, H[6]); int64copy(h, H[7]);

    // Message schedule W[0..15] loaded from block; W[16..79] expanded.
    for (var j = 0;  j < 16; j++) { W[j].h = x[i + 2*j]; W[j].l = x[i + 2*j + 1]; }
    for (var j = 16; j < 80; j++) {
      int64rrot(r1, W[j-2], 19); int64revrrot(r2, W[j-2], 29); int64shr(r3, W[j-2], 6);
      s1.l = r1.l ^ r2.l ^ r3.l; s1.h = r1.h ^ r2.h ^ r3.h;
      int64rrot(r1, W[j-15], 1); int64rrot(r2, W[j-15], 8); int64shr(r3, W[j-15], 7);
      s0.l = r1.l ^ r2.l ^ r3.l; s0.h = r1.h ^ r2.h ^ r3.h;
      int64add4(W[j], s1, W[j-7], s0, W[j-16]);
    }

    for (var j = 0; j < 80; j++) {
      Ch.l  = (e.l & f.l) ^ (~e.l & g.l);
      Ch.h  = (e.h & f.h) ^ (~e.h & g.h);
      int64rrot(r1, e, 14); int64rrot(r2, e, 18); int64revrrot(r3, e, 9);
      s1.l  = r1.l ^ r2.l ^ r3.l; s1.h = r1.h ^ r2.h ^ r3.h;
      int64rrot(r1, a, 28); int64revrrot(r2, a, 2); int64revrrot(r3, a, 7);
      s0.l  = r1.l ^ r2.l ^ r3.l; s0.h = r1.h ^ r2.h ^ r3.h;
      Maj.l = (a.l & b.l) ^ (a.l & c.l) ^ (b.l & c.l);
      Maj.h = (a.h & b.h) ^ (a.h & c.h) ^ (b.h & c.h);
      int64add5(T1, h, s1, Ch, sha512_k[j], W[j]);
      int64add(T2, s0, Maj);
      int64copy(h, g); int64copy(g, f); int64copy(f, e); int64add(e, d, T1);
      int64copy(d, c); int64copy(c, b); int64copy(b, a); int64add(a, T1, T2);
    }
    int64add(H[0], H[0], a); int64add(H[1], H[1], b);
    int64add(H[2], H[2], c); int64add(H[3], H[3], d);
    int64add(H[4], H[4], e); int64add(H[5], H[5], f);
    int64add(H[6], H[6], g); int64add(H[7], H[7], h);
  }

  var hash = new Array(16);
  for (var i = 0; i < 8; i++) { hash[2*i] = H[i].h; hash[2*i + 1] = H[i].l; }
  return hash;
}

// Hash a raw binary string, returning a raw binary string.
function rstr_sha512(s) {
  return binb2rstr(binb_sha512(rstr2binb(s), s.length * 8));
}

// ── sha512crypt (from sha512crypt.js) ────────────────────────────────────────

// Repeat source until its total length equals size_ref, truncating the last
// copy if needed.  Used to stretch digest_b and the salt digest to match the
// password / salt lengths respectively (spec steps 12, 16, 20).
function _extend(source, size_ref) {
  var extended = "";
  for (var i = 0; i < Math.floor(size_ref / 64); i++) extended += source;
  extended += source.substr(0, size_ref % 64);
  return extended;
}

// Steps 1–12 of the SHA-512 crypt spec: produce the "intermediate" digest A.
function _sha512crypt_intermediate(password, salt) {
  var digest_b = rstr_sha512(password + salt + password);
  var digest_b_extended = _extend(digest_b, password.length);
  var intermediate_input = password + salt + digest_b_extended;
  for (var cnt = password.length; cnt > 0; cnt >>= 1)
    intermediate_input += (cnt & 1) ? digest_b : password;
  return rstr_sha512(intermediate_input);
}

// Steps 13–21: stretch and mix for `rounds` iterations.
function _rstr_sha512crypt(password, salt, rounds) {
  var digest_a = _sha512crypt_intermediate(password, salt);

  // Steps 13–16: P-string (password-length repeated SHA-512 of password).
  var dp_input = "";
  for (var i = 0; i < password.length; i++) dp_input += password;
  var p = _extend(rstr_sha512(dp_input), password.length);

  // Steps 17–20: S-string (salt-length repeated SHA-512 of salt, seeded by
  // the first byte of digest A to make pre-computation harder).
  var ds_input = "";
  for (var i = 0; i < (16 + digest_a.charCodeAt(0)); i++) ds_input += salt;
  var s = _extend(rstr_sha512(ds_input), salt.length);

  // Step 21: main mixing loop.
  var digest = digest_a;
  for (var i = 0; i < rounds; i++) {
    var c = (i & 1) ? p : digest;
    if (i % 3) c += s;
    if (i % 7) c += p;
    c += (i & 1) ? digest : p;
    digest = rstr_sha512(c);
  }
  return digest;
}

// Produce a $6$[rounds=N$]salt$hash string from password + salt.
// salt may be a bare salt string or a full $6$[rounds=N$]salt$ prefix.
// This is the single public entry point; exported as both sha512crypt and
// b64_sha512crypt to match the original package's exports.
function sha512crypt(password, salt) {
  var magic = "$6$";
  var rounds;

  var parts = salt.split("$");
  if (parts.length > 1) {
    if (parts[1] !== "6")
      throw new Error("Got '" + salt + "' but only SHA-512 ($6$) is supported");
    rounds = parseInt(parts[2].split("=")[1]);
    if (rounds) {
      if (rounds < 1000)       rounds = 1000;
      if (rounds > 999999999)  rounds = 999999999;
      salt = parts[3] || salt;
    } else {
      salt = parts[2] || salt;
    }
  }

  salt = salt.substr(0, 16); // spec: salt is at most 16 characters

  var hash  = _rstr_sha512crypt(password, salt, rounds || 5000);

  // Re-order the 64 bytes of the raw digest into the crypt(3) interleave
  // pattern and encode with the ./0-9A-Za-z alphabet (NOT standard base64).
  var tab   = "./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  var order = [
    42, 21,  0,
     1, 43, 22,
    23,  2, 44,
    45, 24,  3,
     4, 46, 25,
    26,  5, 47,
    48, 27,  6,
     7, 49, 28,
    29,  8, 50,
    51, 30,  9,
    10, 52, 31,
    32, 11, 53,
    54, 33, 12,
    13, 55, 34,
    35, 14, 56,
    57, 36, 15,
    16, 58, 37,
    38, 17, 59,
    60, 39, 18,
    19, 61, 40,
    41, 20, 62,
    63,
  ];
  var output = "";
  for (var i = 0; i < hash.length; i += 3) {
    if (order[i + 1] === undefined) {
      // Last group: only 1 remaining byte → 2 output characters.
      var b0 = hash.charCodeAt(order[i]);
      output += tab.charAt( b0        & 0x3f) +
                tab.charAt((b0 & 0xc0) >>> 6);
    } else {
      var b0 = hash.charCodeAt(order[i]),
          b1 = hash.charCodeAt(order[i + 1]),
          b2 = hash.charCodeAt(order[i + 2]);
      output += tab.charAt( b0        & 0x3f) +
                tab.charAt(((b0 & 0xc0) >>> 6) | ((b1 & 0x0f) << 2)) +
                tab.charAt(((b1 & 0xf0) >> 4)  | ((b2 & 0x03) << 4)) +
                tab.charAt( (b2 & 0xfc) >>> 2);
    }
  }

  if (parts.length > 2)
    magic = rounds ? "$6$rounds=" + rounds + "$" : "$6$";

  return magic + salt + "$" + output;
}

module.exports = { b64_sha512crypt: sha512crypt, sha512crypt: sha512crypt };
