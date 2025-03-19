/**
* Universally applicable boolean operations on Arrays (union, diff, intersect)
* Can be also used on objects with assumption that array operands are extracted
* from objects by Object.keys(obj).
* Module does not (should not ever) contain state, has no init() func.
* All 3 boolean functions take 2 array operands and return an array.
* To work on more operands than 2 arrays, following constructs / idioms
* can be used:
* ```
* main = []
* AoA.forEach( (arr) => {
*   main = boolops.union(main, arr)
* })
* ```
* Result may look better / be more understandable as sorted:
* ```
* let a3 = boolops.union(a1, a2)
* console.log(a3)
* ```
* TODO: Look into using JS Set (unique elems) to use as intermediate entity
* in operations (?)
*/
function dclone(d) { return JSON.parse(JSON.stringify(d)); }

function union(a1, a2) {
  let idx = {}; // Index
  let a3 = dclone(a1);
  a1.forEach( (el) => { idx[el] = true; } ); // preindex
  a2.forEach( (el) => { if (!idx[el]) { a3.push(el); } } );
  return a3;
}

function diff(a1, a2) {
  let idx = {}; // Index
  let diff = [];
  //let excnt = 0;
  a2.forEach( (el) => { idx[el] = true; } );
  a1.forEach( (el) => {
    if (!idx[el]) { diff.push(el); }
    //else { console.log(`${el} in intersect or mutex part`); excnt++; }
  });
  //console.log(`Excluded: ${excnt}`);
  return diff;
}

function intersect(a1, a2) {
  let idx = {}; // for a2
  let isect = [];
  a2.forEach( (el) => { idx[el] = true; } );
  a1.forEach( (el) => { if (idx[el]) { isect.push(el)} } );
  return isect;
}

/////////////// Test /////////////////
// Test bolean ops. TODO: Add tests that leave duplicate/non-unique elems.
function test_bool() {
  let boolops = module.exports;
  let testset = [
    ["union", ["a", "b", "c"], ["z", "b"]],
    ["diff",  ["a", "b", "c"], ["z", "b"]],
    ["diff",  ["a", "b", "c", "d", "e"], ["c"]],
  ];
  testset.forEach( (ts) => {
    console.log( boolops[ts[0]](ts[1], ts[2]) );
  });
  //console.log( boolops.union(["a", "b", "c"], ["z", "b"]) );
  //console.log( boolops.diff(["a", "b", "c"], ["z", "b"]) );
  //console.log( boolops.diff(["a", "b", "c", "d", "e"], ["c"]));
  console.log(`Deep clone of scalar 3:`+dclone(3));
}
function test_merge() {
  let boolops = module.exports;
  let testset = [
    ["merge_missing", {a: 1, b: 2, c:3}, { c: 0, d: 44}],
    ["merge_falsy", {a: 1, b: 2, c:0}, { c: 0, d: 44}],
  ];
  //console.log( boolops.merge_missing(testset[0][0], testset[0][1]) );
  testset.forEach( (ts) => {
    console.log( boolops[ts[0]](ts[1], ts[2]) );
  });
}

// Additional utilities.
// Note: If values are nested data, only shallow copy is assigned.
function subobject(o, attrs) {
  if (!Array.isArray(attrs)) { return null; }
  let subo = {};
  attrs.forEach( (k) => { if (k in o) { subo[k] = o[k]; } });
  return subo;
}
////////// Merge ////////

// Merge object properies missing in o1 from o2 to o1.
// For now the merged values are shallow copies.
// Return o1 (original merge-to array, for convenience)
function merge_missing (o1, o2) {
  // TODO: Add more granular check for *real* object
  if (typeof o1 != 'object') { return null; }
  if (typeof o2 != 'object') { return null; }
  // Use `k in obj` or obj.hasOwnProperty(k) or obj[k] != undefined
  Object.keys(o2).forEach( (k) => {
    if (!o1.hasOwnProperty(k)) { o1[k] = o2[k]; } // dclone(o2[k]) ?
  });
  return o1;
}
// Force merging all properties in/from o2 into o1.
function merge_force(o1, o2) {
  if (typeof o1 != 'object') { return null; }
  if (typeof o2 != 'object') { return null; }
  Object.keys(o2).forEach( (k) => {
    o1[k] = o2[k];
  });
  return o1;
}
// Merge object properies with "falsy" value in o1 from o2 to o1.
// Note: (for now) even falsy values from o2 are merged to o2 (this
// can be okay and meaninful, e.g. replace null with numberic 0 or "") !
function merge_falsy(o1, o2) {
  if (typeof o1 != 'object') { return null; }
  if (typeof o2 != 'object') { return null; }
  Object.keys(o2).forEach( (k) => {
    if (!o1[k]) { o1[k] = o2[k]; }
  });
  return o1;
}
module.exports = {
  union: union,
  diff: diff,
  intersect: intersect,
  test_bool: test_bool,
  merge_missing: merge_missing,
  merge_force: merge_force,
  merge_falsy: merge_falsy,
};

if (process.argv[1].match(/\bboolops.js$/)) {
  test_bool();
  test_merge();
}
