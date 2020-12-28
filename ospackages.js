/** OS Packages
* Load an analyze lists of packages from hsost.
* Format to load from is a simple ascii text based listing from
* commands like (e.g. for Ubuntu / Debian):
* 
*       dpkg --get-selections > ~/hostpkginfo/myhost
*/

var fs = require("fs");
var byhost = {}; // Pool by host

/** Package set "constructor"
* @param oslbl - OS type label (e.g. "rh" / "deb")
* 
*/
function pkgset(oslbl, hostname, fname, opts) {
  opts = opts || {};
  if (!fs.existsSync(fname)) { throw "Package File "+fname+" not found"; }
  var arrout = [];
  var objout = {};
  // In JS you can do fileops w/o "file handle"
  var data = fs.readFileSync(fname, 'utf8');
  if ( ! data) { console.log("No data from package file for "+fname+" (null, undef or'')"); return null; }
  // if ( ! data.length) {}
  var arr = data.split(/\n/); // Assume single newline
  var mkobj = opts.idx ? 1 : 0;
  for (var i in arr) { // i is index(!)
    var item = arr[i];
    var pkgarr = item.split(/\s+/); // ["yelp", "install"]
    if (! pkgarr[0]) { continue; }
    // arr[i] = pkgarr[0];
    if (mkobj) { objout[pkgarr[0]] = 1; continue; } // Object / Index
    arrout.push(pkgarr[0]);
  }
  // TODO: Make into an object
  //return {"oslbl": oslbl, "hname": hostname, "pkgs": (mkobj ? objout : arrout) };
  return (mkobj ? objout : arrout);
}
// borrowed from docker-imager
function pkgs_from_txt(fname) {
  if (!fs.existsSync(fname)) { throw "Package list file "+fname+" not found!"; }
  let cont = fs.readFileSync(fname, 'utf8');
  if (!cont) { throw "Package list file "+fname+" does not have content!"; }
  var arr = cont.split(/\n/);
  if (!arr || !arr.length) { throw "No lines found";}
  arr = arr.filter((line) => { return (line.match(/^#/) || line.match(/^\s*$/) || !line) ? 0 : 1 ; });
  var pkgs = arr.map((l) => { var arec = l ? l.split(/\s+/) : []; return arec[0] ? arec[0] : null; }).filter((pi) => { return pi; });
  // pkgs.sort((a,b) => {  });
  return pkgs;
}

/////////////////////////////// Set ops ////////////////////////////////

/** Find Common (intersecting) elements of 2 arrays.
 * 
 */
function intersect(a, b) {
  // TODO: Later support Object
  if ( ! Array.isArray(a)) { throw "a is not array"; }
  if ( ! Array.isArray(b)) { throw "b is not array"; }
  // If a is array, ignore b and focus on all of a
  console.log("intersect: Got " + a.length + " and " + b.length + " items to analyze");
  // if (Array.isArray(a)) {}
  var idx = {}; // Items of b valued to dummy 1 (true value)
  var arr_intersect = [];
  b.forEach(function (item) {
    idx[item] = true; // Later if (idx[item]) {}
  });
  a.forEach(function (item) {
    if (idx[item]) { arr_intersect.push(item); }
  });
  return arr_intersect;
}


/** Calculate array difference A - B (Items not in B).
 * 
 */
function diff(a, b) {
  if ( ! Array.isArray(a)) { throw "a is not array"; }
  if ( ! Array.isArray(b)) { throw "b is not array"; }
  var idx = {}; // index(b)
  var arr_diff = [];
  b.forEach(function (item) {
    idx[item] = true; // Later if (idx[item]) {}
  });
  a.forEach(function (item) {
    if ( ! idx[item]) { arr_diff.push(item); }
  });
  return arr_diff;
}
/** Create unique union of 2 (package) sets.
 * 
*/
function union (a, b) {
  var idx = {}; // Union
  if ( ! Array.isArray(a)) { throw "a is not array"; }
  if ( ! Array.isArray(b)) { throw "b is not array"; }
  a.forEach(function (item) { idx[item] = true; });
  b.forEach(function (item) { idx[item] = true; });
  return Object.keys(idx); // sort((a,b) => { a.localeCompare(b); });
}

/**
* TODO: make into an object method: pkgset.index();
*/
function index(a) { // pkgset
  if ( ! Array.isArray(a)) { throw "a is not array"; }
  // Array ?
  var idx = {};
  a.forEach(function (item) { idx[item] = true; });
  return idx;
}



module.exports = {
  pkgset: pkgset,
  intersect: intersect,
  diff: diff,
  union: union,
  pkgs_from_txt: pkgs_from_txt
};
