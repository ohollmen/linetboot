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
  // In JS you can do fileops w/o "file handle"
  var data = fs.readFileSync(fname, 'utf8');
  if ( ! data) { console.log("No data from package file for "+fname+" (null, undef or'')"); return null; }
  // if ( ! data.length) {}
  var arr = data.split(/\n/); // Assume single newline
  var arrout = [];
  var objout = {};
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
/**
*/
function union (a, b) {

}

/**
* TODO: make into an object method: pkgset.index();
*/
function index(a) { // pkgset
  // Array ?
  var idx = {};
  a.forEach(function (item) {
    idx[item] = true; // Later if (idx[item]) {}
  });
  return idx;
}



module.exports = {
  pkgset: pkgset,
  intersect: intersect,
  diff: diff
};
