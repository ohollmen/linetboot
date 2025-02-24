/** @file
* ## Refs
* - https://www.geeksforgeeks.org/how-to-remove-a-key-from-javascript-object/
*/
let hcl  = require("hcl2-parser");
let fs   = require("fs");
let path = require("path");
// let hclparse = require('hclparse.js');
// let stats = {};
let cfg = {modroot: "",  moddirpatt: "", iacreposroot: "", iacrepopatt: ""};
function dclone(d) { return JSON.parse(JSON.stringify(d)); }

// console.log(process.argv);
function init(_mcfg) {
  // Do not mandate config
  if (_mcfg && _mcfg.hclparse) { cfg = _mcfg.hclparse; }
  else if (_mcfg) { cfg = _mcfg; }
}
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

// Synchronous file tree walk (Inspired by https://gist.github.com/lovasoa/8691344, seems to be universal de-facto boilerplate available from *many* sources).
// Allows:
// - callback to be called with arbitrary userdata (that will be passed to callback).
// - to exclude file or directory names from being recursed to (dirs) or handled (files)
// Also (see alternatives):
// - https://www.npmjs.com/package/node-recursive-directorym, treeverse (0-dep, Hi-dl)
// - file-walker (0-dep, low dl)
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

// List sub-directory names by name pattern form a "directory root" passed as param.
function subdirs_list_bypatt(droot, rnpatt) {
  let fnames = fs.readdirSync(droot); // , {withFileTypes: true}) // would have 'name' and e.g. isDirectory()
  if (!fnames) { console.error(`No files from ${droot}`); return null; }
  // https://stackoverflow.com/questions/2727167/how-do-you-get-a-list-of-the-names-of-all-files-present-in-a-directory-in-node-j
  fnames = fnames.filter( (n) => { return n.match(rnpatt); }); // item.isDirectory()
  return fnames;
}
/** Load all cloned repositories (likely git repos) into repo stats structure
 * Repo stats has: 
 * @todo opts (e.g. with optional dirs: [])
 */
function iacrepos_all_load(droot, rnpatt) {
  let fnames = subdirs_list_bypatt(droot, rnpatt);
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

////////////////// vars /////////////////
function hclvars_all_load(droot, rnpatt) {
  let fnames = subdirs_list_bypatt(droot, rnpatt);
  let varm = [];
  fnames.forEach( (dn) => {
    let dpath = `${droot}/${dn}/variables.tf`;
    if (!fs.existsSync(dpath)) { console.log(`No var-file to load (from: '${dpath}')`); return; }
    // Each file has tg.vars.variable = {myvarname: { default, description, type} }
    let tg = hcl_parse(dpath);
    if (!tg) { console.error(`HCL parsing failed for var-file ${dpath}`); return; }
    // Transform to simpler form  || !tg.vars.variable
    if (!tg.variable ) { console.error(`No var data hier present (in ${dpath})`); return; }
    varm.push({modname: `${dn}`, 'vars': tg.variable} ); // .vars.variable
  });
  console.error(`Parsed ${varm.length} files.`);
  return varm;
}

function hclvars_save(varm, vfpath, opts) {
  opts = opts || {};
  if (!Array.isArray(varm)) { console.error(`vars not in array`); return; }
  if (!fs.existsSync(vfpath)) { console.error(``); return 0; }
  let cnt = 0;
  if (opts.single) {
    let fnv = `${vfpath}/allmods.vars.json`;
    fs.writeFileSync(fnv, JSON.stringify(varm, null, 2), {encoding: "utf8"} );
    console.error(`Wrote single var file: '${fnv}'`);
    return varm.length;
  }
  varm.forEach( (v) => {
    let fnv = `${vfpath}/${v.modname}.vars.json`;
    if (!opts.force && fs.existsSync(fnv)) { console.log(`Var file ${fnv} already exist - not overwriting`); return 0; }
    try {
      fs.writeFileSync(fnv, JSON.stringify(v, null, 2), {encoding: "utf8"} ); // console.log(`Wrote '${req.url}' (URL) to filesys: '${fn}' (Method: ${fnmethod})`);
    }
    catch (ex) { let msg = `Failed to write var-file to ${fnv}: ${ex}`; console.error(msg); };
    cnt += 1;
  });
  return cnt;
}
//// idx & stats ////
function vidx_create(varm) {
  let vidx = { vararr: varm, modidx: {}, unknown: {}, debug: 0 };
  // Populate (fast-lookup) modidx
  varm.forEach( (mod) => { vidx.modidx[mod.modname] = mod; });
  return vidx;
}
function vidx_mod_var_inc(vidx, mod, varn) {
  let midx = vidx.modidx;
  if (!midx) { return; }
  if (!midx[mod]) { console.log(`No module ${mod} in modidx for inc.`); return; }
  // vars => inputs
  let varnode = null;
  // Catch deref problems
  try { varnode = midx[mod].vars[varn]; } catch (ex) { console.error(`Error looking up var node ${mod}.${varn}`); }
  // No varnode (!) - Place to unknown vars
  if (!varnode) {
    console.log(`No varnode for ${mod}.${varn}`);
    //NOT: varnode = midx[mod].vars[varn] = {}; // Create ?
    vidx.unknown[`${mod}.${varn}`] = vidx.unknown[`${mod}.${varn}`] ? vidx.unknown[`${mod}.${varn}`] + 1 : 1;
  } 
  if (!varnode.cnt) { varnode.cnt = 0; } // ... Does not exist
  varnode.cnt += 1;
  // Detect default value, make a special note on it: varnode.defcnt++.
  return;
}
// Statistify a set of inputs.
// module name (mod) is kept as separate param to allow flexiblity on structure (topology, member names).
// TODO: Also consider if value is set to default value (make a special note on it) ?
function vidx_inputs_stat(vidx, mod, inputs) {
  if (!(typeof inputs == 'object')) { console.log(`Input vars not in an object (module ${mod}) !!`); return; }
  if (!mod) { console.log(`Module name not present for inputs statistification !!`); return; }
  Object.keys(inputs).forEach( (k) => { vidx_mod_var_inc(vidx, mod, ); });
}

///////// (default) cli-handlers ///////

function varstat_gen(opts) {
  
}

if (process.argv[1].match(/\bhclparse.js$/)) {
  console.log("For now - load as library using require() !");
}

module.exports = {
  cfg: cfg,
  hcl_parse: hcl_parse, tgset_fromtree: tgset_fromtree, iacrepos_all_load: iacrepos_all_load,
  hclvars_all_load: hclvars_all_load, hclvars_save: hclvars_save,
  // cli
  varstat_gen: varstat_gen, 
};
