/** @file
* ## Refs
* - https://www.geeksforgeeks.org/how-to-remove-a-key-from-javascript-object/
*/
let hcl  = require("hcl2-parser");
let fs   = require("fs");
let path = require("path");

// let hclparse = require('hclparse.js');
// let stats = {};
let cfg = { modroot: "",  moddirpatt: "", iacreposroot: "", iacrepopatt: "", varstorepath: "", };
let inited = 0;
let usagecnt = 0;
let ustats = null;
function dclone(d) { return JSON.parse(JSON.stringify(d)); }

// console.log(process.argv);
function init(_mcfg) {
  // Do not mandate config
  if (_mcfg && _mcfg.hclparse) { cfg = _mcfg.hclparse; }
  else if (_mcfg) { cfg = _mcfg; }
  module.exports.cfg = cfg;
  if (typeof cfg.moddirpatt == 'string')  { cfg.moddirpatt  = new RegExp(cfg.moddirpatt); }
  if (typeof cfg.iacrepopatt == 'string') { cfg.iacrepopatt = new RegExp(cfg.iacrepopatt); }
  cfg.webstats = 1;
  let fns = `${cfg.varstorepath}/allmods.vars.stats.json`;
  if (fs.existsSync(fns) && cfg.webstats) {
    ustats = require(fns);
  }
  inited++;
}
/** Parse HCL (TG or TF) file.
* Parsing by hcl.parseToObject() produces an array w. [{}, null],
* but by default this returns only first (object) element of it
* (todo: explicit option to return original array)
*/
function hcl_parse(fn, opts) {
  if (!fn) { throw "hcl_parse: Need filename for parsing HCL/TG."; }
  if (!fs.existsSync(fn)) { throw `TG/TF file '${fn}' not found`;  }
  opts = opts || { stats: 0 };
  let cont = fs.readFileSync(fn, 'utf8');
  if (!cont) { throw `No content from ${fn}`; }
  
  if (opts.stats) {
    console.log(`Type of cont from ${fn} (cont.length B) is: ${typeof cont}`);
    let len = cont.split("\n").length; console.log(`${fn}: ${len} lines.`); }
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
    if (udata && Array.isArray(udata.exclude) && udata.exclude.includes(bn) ) {  return; } // console.log(`Exclude: ${bn}`);
    if (stats.isDirectory()) { ftw(filepath, callback, udata); }
    else if (stats.isFile()) {  callback(filepath, stats, udata); }
  });
  return;
};


// https://gist.github.com/lovasoa/8691344
// function tg_lsr(dirname) {} // redundant

/** Create linear array of TG files from a dir tree.
* Loads all files by TG standard name.
* Parameter opts can contain:
* - mpatt - module pattern to capture (default: ([a-z\-]+)/+\.?$). Pattern MUST have single RE capture parens to capture module.
 - udata - User data (with exclude: [...filenames...]
  @return tg module objects (udata.tgmods). Note if opts.udata (obj) was passed, it will contain member "failedfns" for filenames of "failed-to-parse" files.
*/
function tgset_fromtree(dirname, opts) { // opts: cb, udata, exc,
  let dopts = { mpatt: '/([a-z\-]+)/+\.?$', debug: 0}; // {5,}
  opts = opts || dopts;
  let modpatt = new RegExp(opts.mpatt) || new RegExp(dopts.mpatt);
  opts.debug && console.log(`Created "mod": ${modpatt}`);
  // Collect tg files
  //NONEED: let arr = tg_lsr(dirname);
  // root: dirname, - (would be) only needed for  path.relative() - which does not work as expected.
  // Also deprecated as these will be procedurally / forcefully inited here: tgfiles: [], tgmods: [], failedfns: []
  let udata = opts.udata || {   exclude: [".git"],   }; // errcnt: 0, <= use failedfns.length
  udata.tgfiles = []; udata.tgmods = []; udata.failedfns = []; udata.failedmod = []; // Init/Set fresh
  // default ftw callback for handling single file item
  let cb = (fp, stats, udata) => {
    //if (stats.isDirectory()) { console.log(`DIR ...`); } // redundant - cb never gets dirs
    if (path.basename(fp) != 'terragrunt.hcl') { return; }
    opts.debug && console.log(fp);
    // let rfn = path.relative(fp, udata.root); // Scores (e.g.) '../../../../..' (!?)
    //OLD:udata.tgfiles.push(fp); // fp (abs), rfn (rel)
    let tg = hcl_parse(fp);
    // TODO: Leave a stub of failed-to-parse HCL ?
    if (!tg) { console.error(`Failed to parse HCL: '${fp}'`); udata.failedfns.push(fp); return; } // process.exit(); // udata.errcnt++;
    let tfb = Array.isArray(tg.terraform) ? tg.terraform[0] : null;
    // Consider module: 
    if (tfb && tfb.source) { // && conf.addmod / src
      let m = tfb.source.match(modpatt); // /\/(NNNNN-[\w-]+)/);
      if (m) { tg.mod = m[1]; } // modname
      else { udata.failedmod.push(fp); } // Has "source" but no value matched (Note: var-only file would not have "source")!
    }
    tg.afn = `${fp}`;
    udata.tgmods.push( tg );
  };
  ftw(dirname, cb, udata);
  if (udata.errcnt) { console.log(`Failed to parse ${udata.failedfns.length} HCL files (${udata.failedfns.join(", ")}).`); }
  return udata.tgmods; // udata.tgfiles;
}
/** Add single repo (w. path) to statistics */
function iacrepos_add_repo(iacrepos, dpath, mods) {
  let rn = path.basename(dpath);
  let repo = { reponame: rn, repopath: dpath, modules: mods, };
  // Add more props, stats here !!!
  
  iacrepos.push(repo);
  return repo;
}

// List sub-directory names by name pattern form a "directory root" passed as param.
function subdirs_list_bypatt(droot, rnpatt) {
  let fnames = fs.readdirSync(droot); // , {withFileTypes: true}) // would have 'name' and e.g. isDirectory()
  if (!fnames) { console.error(`No files from ${droot}`); return null; }
  // https://stackoverflow.com/questions/2727167/how-do-you-get-a-list-of-the-names-of-all-files-present-in-a-directory-in-node-j
  fnames = fnames.filter( (n) => { return n.match(rnpatt); }); // item.isDirectory()
  return fnames;
}
/** Parse / Load all cloned repositories (likely git repos) into repo stats structure
 * Repo stats has: 
 * @todo opts (e.g. with optional dirs: [])
 */
function iacrepos_all_load(droot, rnpatt, opts) {
  
  let dnames = subdirs_list_bypatt(droot, rnpatt);
  if (opts && opts.dnames) { dnames = opts.dnames; }
  // Separate ?
  let iacrepos = [];
  
  dnames.forEach( (dn) => {
    let dpath = `${droot}/${dn}`;
    let tgfiles = tgset_fromtree(dpath, opts);
    iacrepos_add_repo(iacrepos, dpath, tgfiles);
  });
  //console.log(iacrepos);
  return iacrepos;
}

////////////////// vars /////////////////
function hclvars_all_extract(droot, rnpatt) {
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
// Create module-keyed var index.
function vidx_create(varm) {
  let vidx = { vararr: varm, modidx: {}, unknown: {}, debug: 0,
    cnts: {  inputs: 0, iacrepos: 0, hcls: 0, unimodtot: 0, },  }; // unimods:0,
  // Populate (fast-lookup) modidx
  varm.forEach( (mod) => { vidx.modidx[mod.modname] = mod; });
  return vidx;
}
/* Add to statistics bookkeeping */
function vidx_mod_var_inc(vidx, mod, varn) {
  let midx = vidx.modidx;
  if (!midx) { return; }
  if (!midx[mod]) { console.log(`No module ${mod} in modidx for inc.`); return; }
  // vars => inputs
  let varnode = null;
  //console.log("mod-node: ", midx[mod]); // DEBUG
  // Catch deref problems.
  // NOTE: The parser (weirdly) wraps var spec in Array, thus ..[0]
  try { varnode = midx[mod].vars[varn][0]; } catch (ex) { console.error(`Error looking up var node ${mod}.${varn}`); }
  // No varnode (!) - Place to unknown vars
  if (!varnode) {
    console.log(`No varnode (spec) for ${mod}.${varn}`); // TODO: Output filename for fixing.
    //NOT: varnode = midx[mod].vars[varn] = {}; // Create ?
    vidx.unknown[`${mod}.${varn}`] = vidx.unknown[`${mod}.${varn}`] ? vidx.unknown[`${mod}.${varn}`] + 1 : 1;
    return; // Must ...
  }
  if (Array.isArray(varnode)) { console.log(`Error: varnode is an ARRAY !!!`); }
  if (!varnode.cnt) { varnode.cnt = 0; } // ... Does not exist
  varnode.cnt += 1; // usagecnt++;
  //console.log(`Found varnode for var ${mod}.${varn}`, varnode);
  // Detect default value, make a special note on it: varnode.defcnt++.
  return;
}
/** Statistify a set of inputs.
// module name (mod) is kept as separate param to allow flexiblity on structure (topology, member names).
// vars.forEach( (m) => {});
// TODO: Also consider if value is set to default value (make a special note on it) ?
*/
function vidx_inputs_stat(vidx, mod, inputs) {
  if (!(typeof inputs == 'object')) { console.log(`Input vars not in an object (module ${mod}) !!`); return; }
  if (!mod) { // console.log(`Module name not present for inputs statistification !!`);
     return; } // Var-only TG
  // Add mod to cnt stats
  //vidx.cnts.mods++;
  vidx.cnts.hcls++;
  // Add statistics of module usage (1st phase: inline)
  if (vidx.modidx[mod]) {
    if (!vidx.modidx[mod].cnt) { vidx.modidx[mod].cnt = 0; }
    vidx.modidx[mod].cnt++;
  }
  //cfg.debug && console.log(`Module ${mod} w. ${Object.keys(inputs).length} inputs`);
  Object.keys(inputs).forEach( (k) => {
    //usagecnt++;
    vidx.cnts.inputs++;
    vidx_mod_var_inc(vidx, mod, k);
  });
}

///////// (default) cli-handlers ///////

// CLI: Collect / Extract variables
function varstat_gen(opts) {
  opts = opts || {};
  let mcfg = cfg;
  let hclparse = module.exports;
  // console.log(Object.keys(hclparse)); // DEBUG
  let vars = hclparse.hclvars_all_extract(mcfg.modroot, mcfg.moddirpatt);

  let vfcnt = hclparse.hclvars_save(vars, mcfg.varstorepath, { force: 1, single: 1 });
  console.log(`Saved var defs for ${vfcnt} TF modules.`);

  let vidx = hclparse.vidx_create(vars);
  if (opts.ret) { return vidx; }
}
// CLI: Load IAC repos from root directory pointer by "iacreposroot" (by pattern)
// Store all repos in a file named in "iacstorefn".
function iacrepos_extract_store(opts) {
  opts = opts || { udata: { exclude: ['.git']} };
  let mcfg = cfg;
  let hclparse = module.exports;
  // Load IAC (to sample)
  let iacs = hclparse.iacrepos_all_load(mcfg.iacreposroot, mcfg.iacrepopatt);
  let fn = mcfg.iacstorefn;
  fs.writeFileSync(fn, JSON.stringify(iacs, null, 2), {encoding: "utf8"} );
  console.log(`Stored IAC repos extraction into single file '${fn}'`);
}
function iacrepos_vars_stat(opts) {
  opts = opts || {};
  let mcfg = cfg;
  let hclparse = module.exports;
  let iacs = require(mcfg.iacstorefn);
  if (!iacs) { console.error(`IAC Repos not parsed/loaded ('${mcfg.iacstorefn}')`); return; }
  if (!Array.isArray(iacs)) { console.log(`IAC Repos not in an array (from '${mcfg.iacstorefn}') !!!`); return; }
  console.log(`Parse/loaded ${iacs.length} IAC Repos (from '${mcfg.iacstorefn}')`);
  opts.ret = 1;
  let vidx = hclparse.varstat_gen(opts); // CLI handler returning vidx (typ. 1-5s.)
  if (!vidx) { console.error(`Could not parse/load vars and produce variable index (by cli-handler) !`); return; }
  console.log(`Starting to collect var stats`);
  // https://stackoverflow.com/questions/1960473/get-all-unique-values-in-a-javascript-array-remove-duplicates
  function onlyUnique(value, index, array) { return array.indexOf(value) === index; }
  iacs.forEach( (repo) => {
    if (!Array.isArray(repo.modules)) { console.error(`Modules not in array for repo ${repo.reponame}`); return; }
    console.log(`Repo ${repo.reponame} (${repo.modules.length} TG files)`);
    //console.log(repo.modules); // array, DEBUG
    //process.exit(0); // DEBUG
    vidx.cnts.iacrepos++;
    // Unique modules - 
    repo.unimods = repo.modules.map( (tg) => { return tg.mod; }).filter(onlyUnique);
    repo.unimodcnt = repo.unimods.length;
    
    vidx.cnts.unimodtot += repo.unimodcnt; // For avg. (hcls/this)
    repo.modules.forEach( (tg) => {
      //console.log(tg); process.exit(0); // DEBUG
      // Variable-only TG w/o module association.
      if (typeof tg.inputs != 'object') { console.error(`module ${tg.mod} inputs are not in object (${typeof tg.inputs})`); return; }

      hclparse.vidx_inputs_stat(vidx, tg.mod, tg.inputs);
    });
  });
  // Stats collected to var defs in vidx.vararr In format of mcfg.varstorepath (def. single allmods.vars.json)
  if (!vidx.vararr) { console.error(`Nothing to store as var usage statistics!!!`); return; }
  let fn = `${mcfg.varstorepath}/allmods.vars.stats.json`;
  fs.writeFileSync(fn, JSON.stringify(vidx.vararr, null, 2), {encoding: "utf8"} );
  console.error(`Statistified ${iacs.length} IAC repos, saved '${fn}'.`);
  console.log(`Usage cnt stats: `, vidx.cnts); // DEBUG
}
// Web handler for var usage
function hdl_tfmod_usage(req, res) {
  let jr = { status: "err", "msg": "Error fetching module usage statistics. " };
  if (!ustats || !Array.isArray(ustats)) { jr.msg += `No module stats avail as an array (Set docs for 'varstorepath')`; return res.json(jr); }
  // Lookup module specific info from ustats. transform module vars to AoO
  let modname = req.query.modname;
  if (!modname && cfg.defmodname) { modname = cfg.defmodname; }
  if (!modname) { jr.msg += `No module name passed (or no 'defmodname' configured)`; return res.json(jr); }
  let modnode = ustats.find( (modnode) => { return modnode.modname == modname; });
  if (!modnode) { jr.msg += `Could not find module '${modname}'`; return res.json(jr); }
  let inputvars = modnode.vars; // OoAoO
  // Transform
  let varusages = Object.keys(inputvars).map( (vk) => { inputvars[vk][0].varname = vk; return inputvars[vk][0]; });
  res.json(varusages);
}

function hdl_tfmods(req, res) {
   
}
// Parse single hcl file (passed as first real arg)
function simpleparse(opts) {
  let fn = process.argv[3];
  let o = hclparse.hcl_parse(fn);
  if (!o) { console.log(`TG/TF file '${fn}' not parsed`); process.exit(1); }
  console.log(JSON.stringify(o, null, 2));
}
if (process.argv[1].match(/\bhclparse.js$/)) {
  console.log("For now - load as library using require() !");

}

module.exports = {
  cfg: cfg,
  init: init,
  hcl_parse: hcl_parse,
  ftw: ftw,
  tgset_fromtree: tgset_fromtree, iacrepos_all_load: iacrepos_all_load,
  hclvars_all_extract: hclvars_all_extract, hclvars_save: hclvars_save,
  // cli
  varstat_gen: varstat_gen,
  iacrepos_extract_store: iacrepos_extract_store,
  iacrepos_vars_stat: iacrepos_vars_stat,
  // 
  vidx_create: vidx_create,
  vidx_inputs_stat: vidx_inputs_stat,
  // Web
  hdl_tfmod_usage: hdl_tfmod_usage,
  // CLI
  simpleparse: simpleparse,
};
