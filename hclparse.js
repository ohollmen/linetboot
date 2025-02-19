/** @file
* ## Refs
* - https://www.geeksforgeeks.org/how-to-remove-a-key-from-javascript-object/
*/
const hcl = require("hcl2-parser");
let fs   = require("fs");
let path = require("path");
// let hclparse = require('hclparse.js');
// let stats = {};
function dclone(d) { return JSON.parse(JSON.stringify(d)); }

// console.log(process.argv);

/** Parse HCL (TG or TF) file.
* Parsing by hcl.parseToObject() produces an array w. [{}, null],
* but by default this returns only first (object) element of it
* (todo: explicit option to return original array)
*/
function hcl_parse(fn) {
  if (!fn) { throw "hcl_parse: Need filename for parsing HCL/TG."; }
  if (!fs.existsSync(fn)) { throw `TG/TF file '${fn}' not found`;  }
  let cont = fs.readFileSync(fn);
  if (!cont) { throw `No content from ${fn}`; }
  let o = hcl.parseToObject(cont);
  // Detect what kind of array got returned
  let isarr = Array.isArray(o);
  if (isarr) { return o[0]; }
  return o;
}

// Synchronous file tree walk (https://gist.github.com/lovasoa/8691344)
// https://www.npmjs.com/package/node-recursive-directorym, treeverse (0-dep, Hi-dl)
// file-walker (0-dep, low dl)
function ftw (dir, callback, udata)  {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    let filepath = path.join(dir, file);
    let stats = fs.statSync(filepath);
    let bn = path.basename(filepath); // Add to stats ?
    // Block dir
    if (udata && Array.isArray(udata.exclude) && udata.exclude.includes(bn) ) { console.log(`Exclude: ${bn}`); return; }
    if (stats.isDirectory()) { ftw(filepath, callback, udata); }
    else if (stats.isFile()) {  callback(filepath, stats, udata); }
  });
  return;
};


// https://gist.github.com/lovasoa/8691344
// function tg_lsr(dirname) {} // redundant

/** Create linear array of TG files from a dir tree.
* Loads all files by name TG standard name.
*/
function tgset_fromtree(dirname, opts) { // opts: cb, udata, exc,
  let dopts = { mpatt: '/([a-z\-]+)/+\.?$' }; // {5,}
  opts = opts || dopts;
  let modpatt = new RegExp(opts.mpatt) || new RegExp(dopts.mpatt);
  opts.debug && console.log(`Created "mod": ${modpatt}`);
  // Collect tg files
  //NONEED: let arr = tg_lsr(dirname);
  let udata = { root: dirname, tgfiles: [], tgmods: [], exclude: [".git"], errcnt: 0 };
  // ftw callback for handling single file item
  let cb = (fp, stats, udata) => {
    //if (stats.isDirectory()) { console.log(`DIR ...`); } // redundant - cb never gets dirs
    if (path.basename(fp) != 'terragrunt.hcl') { return; }
    console.log(fp);
    // let rfn = path.relative(fp, udata.root); // Scores (e.g.) '../../../../..' (!?)
    //udata.tgfiles.push(fp); // fp (abs), rfn (rel)
    let tg = hcl_parse(fp);
    if (!tg) { console.error(`Failed to parse HCL: '${fp}'`); udata.errcnt++; return; } // process.exit();
    let tfb = Array.isArray(tg.terraform) ? tg.terraform[0] : null;
    if (tfb && tfb.source) { // && conf.addmod / src
      let m = tfb.source.match(modpatt); // /\/(NNNNN-[\w-]+)/);
      if (m) { tg.mod = m[1]; }
    }
    udata.tgmods.push( tg );
  };
  ftw(dirname, cb, udata);
  return udata.tgmods; // udata.tgfiles;
}
/** Add single repo (w. path) to statistics */
function stats_add_repo(stats, dpath, mods) {
  let rn = path.basename(dpath);
  let n = { reponame: rn, modules: mods, };
  stats.push(n);
  return n;
}
/** Load all cloned repositories (likely git repos) into repo stats structure
 * Repo stats has: 
 * @todo opts (e.g. with optional dirs: [])
 */
function iacrepos_all_load(droot, rnpatt) {
  let fnames = fs.readdirSync(droot); // , {withFileTypes: true}) // would have 'name' and e.g. isDirectory()
  if (!fnames) { console.error(`No files from ${fnames}`); return null; }
  // https://stackoverflow.com/questions/2727167/how-do-you-get-a-list-of-the-names-of-all-files-present-in-a-directory-in-node-j
  fnames = fnames.filter( (n) => { return n.match(rnpatt); }); // item.isDirectory()
  // Separate ?
  let stats = []; // reset (global)
  fnames.forEach( (dn) => {
    let dpath = `${droot}/${dn}`;
    let tgfiles = tgset_fromtree(dpath);
    stats_add_repo(stats, dpath, tgfiles);
  });
  //console.log(stats);
  return stats;
}

if (process.argv[1].match(/\bhclparse.js$/)) {
  console.log("For now - load as library using require() !");
}

module.exports = { hcl_parse: hcl_parse, tgset_fromtree: tgset_fromtree  };
