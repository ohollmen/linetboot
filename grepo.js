#!/usr/bin/env node
/** Load Google repo tool XML manifest (for analysis, diplay).
* TODO: Specify config to allow multiple manifests to be retrievable (by name/filename)
* Note: project element may have inner elems: copyfile, linkfile, annotation (k-v pairs), but they are
* not supported as "rare" (easy to add).
<default revision="refs/heads/main" remote="origin" sync-j="8" sync-c="true" sync-tags="false" clone-depth="1" />
repo sync -c --optimized-fetch () tells Repo to skip projects that are fixed to a specific SHA-1 if that SHA-1 already exists locally
*/
var xjs  = require('xml2js'); // Also: fast-xml-parser
var fs   = require("fs");
var path = require("path");
var async = require("async");
var cfg = {};
var osstrans = {}; // From cfg.ossreffn
var cache = {};
// XML attr mapping for the purposes of repo format and this app.
// Also: ignoreAttrs: true, explicitCharkey: false, (for '_' text content), trim: true
// attrkey: "@"
let xopts = { explicitArray: false, mergeAttrs: true, }; // trim: true


function init(mcfg) {
  if (mcfg.grepo) { cfg = mcfg.grepo; } // .reposet
  else { cfg = mcfg; }
  if (!cfg) { return; }
  let cpath = `${process.env.HOME}/.linetboot`;
  // throw `XML Manifest ('${fn}') not found !`;
  let otfn = `${cpath}/${cfg.ossreffn}`;
  console.log(`Check presence of OSS ref. file: '${otfn}'`);
  if (fs.existsSync(otfn)) {
    console.log(`Found  ${otfn} !! Loading ...`);
    osstrans = require(otfn);
    if (!osstrans) { osstrans = {}; } // revert to {}
  }
  if (cfg.cache) {
    // Later: For all manifests ...
    /*
    manifest_load(fn, (err, data) => {
      if (err) { console.error(`Error loading: `); }
      res.json({status: "ok", data: data});
    });
    */
  }
}
// Lookup manifest by its basename from linetboot config dir and a set of paths.
// Note: we could push() or shift_in() lineboot path
function mf_abspath(bn) {
  if (!bn) { console.error(`Manifest basename not given.`); return null; }
  //let cpath = `${process.env.HOME}/.linetboot`;
  //let fna = `${cpath}/${bn}`;
  //if (fs.existsSync(fna)) { return fna; }
  ///////////////////// Path-Array search ///////////////////
  if (!cfg.mfpath || !Array.isArray(cfg.mfpath)) { return null; }
  let pathok = cfg.mfpath.find( (it) => {
    let fna = `${it}/${bn}`;
    if (fs.existsSync(fna)) { return 1; }
    return 0;
  });
  return `${pathok}/${bn}`;
}

function asArray(v) {
  return Array.isArray(v) ? v : v ? [v] : [];
}
/** Load Google repo tool manifest.
 * @param fn - Repo tool XML manifest file to load
 * @param cb - Callback to call (err, data) after async parsing and loading of XML.
*/
function manifest_load(fn, cb) {
  // Tolerate/Allow object from include section
  let isroot = 1; // Is root MF ?
  if (typeof fn == 'object' && fn.name) {
    fn = fn.name;
    let fna = mf_abspath(fn);
    if (!fna) { return cb(`MF include file '${fn}' was not resolved to absolute name.`); }
    fn = fna; isroot = 0;
  }
  if (!fs.existsSync(fn)) { return cb(`XML Manifest ('${fn}') not found !`, null);  } // throw `XML Manifest ('${fn}') not found !`;
  var cont = fs.readFileSync(fn, 'utf8');
  if (!cont) { return cb(`No content gotten/read from XML manifest '${fn}' !`, null);  } // throw `No content gotten/read from XML manifest '${fn}' !`;
  // Data under "manifest: in remote (AoO, multi), default (obj), project (AoO - multi), include (obj)
  xjs.parseString(cont, xopts, function (err, data) {
    if (err) { console.log("Failed to parse XML"); return cb("XML Parse Error", null); } // cb(null, resp.data);
	  data = data.manifest; // Discard top level (completely redundant dummy level) "<manifest>"
    let def = data.default;
    // Coerce/enforce "one or more" properties to array due to XML vagueness.
	  data.include = asArray(data.include);
    data.remote  = asArray(data.remote);
    data.project = asArray(data.project);
    data.manifestfn = path.basename(fn); // Add enhance to have available for e.g. UI tier.
    // console.log(`data.project is: `, data.project);
    // "project" section data refinements
    // - refine "sync-c" to boolean
    // - Compensate for client side complexity by adding info from "default" into project nodes
    data.project.forEach( (it) => {
      if (it["sync-c"]) { it["sync-c"] = String(it["sync-c"]).toLowerCase() === 'true'; }
      // Alt: flag these by true/false
      if (!it.remote && def)   { it.remote_def = def.remote; }
      if (!it.revision && def) { it.revision_def = def.revision; }
      if (!it.revision && def) { it.syncj_def = def["sync-j"]; }
      // Try to lookup OSS project in case user has configured cross-ref and proj. is found there by "name"
      let oi = osstrans[it.name];
      if (oi) { it.ossproj = oi; } // Set URL for corresponding OSS project
    });
    
    
    // console.log("Launch and forget data:", data);
    if (cfg.debug && (cfg.debug > 1)) { console.log("MF-JSON:", JSON.stringify(data, null, 2)); }
    return cb(null, data);
  });
}
/** Implement moderate 1 level merge for 1 or more includes of manifest. */
function manifest_merge(data, cb) {
  let incs = data.include; // Include-request of original MF
  if (!Array.isArray(incs)) { return cb("MF includes not in an Array !", null); }
  // relative to absolute done in manifest_load()
  // wrap 
  let proccb = manifest_load; // dummy_load / manifest_load
  async.mapSeries(incs, proccb, (err, ress) => {
    if (err) { console.error(`manifest_merge (load-completion): Error: ${err}`); return cb('Err', null); }
    (cfg.debug && cfg.debug > 2) && console.log(`Completed incnodes: `, ress);
    // Concat projects of each include to original data.
    let i = 1;
    ress.forEach( (subdata) => {
      // Mark manifest identity here, e.g.: 1) filename (too long?), 2) A,B,... 3) M1, M2, M3, 4) INC1, INC2
      subdata.project.forEach( (p) => { p.mflbl = `Inc${i}`;});
      data.project = data.project.concat(subdata.project);
      i++;
    });
    return cb(null, data);
  });
  //function dummy_load(incnode, cb) {
  //  console.log(`Should load by:`, incnode);
  //  return cb(null, incnode);
  //}
}

/** HTTP (GET) handler for repo view */
function hdl_grepo(req, res) {
  let jr = {status: "err", msg: "Error loading repo(set) data ! "};
  let bn = cfg.fn;
  if (!bn) { jr.msg += "No repo file given in config !"; return res.json(jr); }
  let fn = mf_abspath(bn); // `${process.env.HOME}/.linetboot/${bn}`; // ${bn}
  cfg.mergeinc = 1; // TEST
  manifest_load(fn, (err, data) => {
    if (err) { jr.msg += err; return res.json(jr);}
    if (cfg.mergeinc) { manifest_merge(data, (err, data) => {
      if (err) { jr.msg += `Includes could not be properly merged: ${err}`; return res.json(jr); }
      console.log(`Done inc.`);
      res.json({status: "ok", data: data});
    });
    }
    else { res.json({status: "ok", data: data}); } // No includes
  });
}
/** Produce Chart.js stats for */
function hdl_grepo_stats(req, res) {
  let jr = {status: "err", msg: "Error producing stats out of the data. "};
  let bn = cfg.fn;
  if (!bn) { jr.msg += "No repo file given in config !"; return res.json(jr); }
  let fn = mf_abspath(bn); // `${process.env.HOME}/.linetboot/${bn}`; // ${bn}
  manifest_load(fn, (err, data) => {
    if (err) { jr.msg += err; return res.json(jr);}
    // TODO: Stats, see 
    res.json({status: "ok", data: data});
  });

}

module.exports = {
  init: init,
  manifest_load: manifest_load,
  manifest_merge: manifest_merge,
  // Web handlers
  hdl_grepo: hdl_grepo,
  hdl_grepo_stats: hdl_grepo_stats,
};

if (process.argv[1].match("grepo.js")) {
  let cfgfn = `${process.env.HOME}/.linetboot/global.conf.json`;
  let mcfg = require(cfgfn);
  //mcfg.grepo = {"debug": 2, "fn": "repo_manifest.xml"}; // mcfg.reposet
  let mc = require("./mainconf.js");
  mc.tilde_expand(mcfg.grepo, ["mfpath"]); // MUST expand !!!
  init(mcfg);
  let cb = (err, data) => {
    if (err) { console.error(`Error processing: ${err}`); return; }
    //console.error(`cb - Success`);
    console.error(`INC:`, data.include);
    // manifest_merge(data, () => { console.log(`Done inc.`); });
  };
  let bn = cfg.fn || "manifest.xml";
  let fna = mf_abspath(bn); // let fn = `${process.env.HOME}/.linetboot/${bn}`; // ${bn}
  console.log(`mf_abspath resolved ${bn} => fna: ${fna}`);
  manifest_load(fna, cb);
  
 
}
