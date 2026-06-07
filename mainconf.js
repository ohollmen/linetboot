#!/usr/bin/env node
/** @file
* # Lineboot main config loading, processing, validation, access
* 
* When failing validations for mandatory sections or features of config,
* this module may cause process.exit(1).
* 
* # Recommended order of config loading / processing
* 
* Demonstrated as mainconf module API code:
* ```
* var mc = require("./mainconf.js");
* var mcfn = process.env["LINETBOOT_GLOBAL_CONF"] || process.env["HOME"] + "/.linetboot/global.conf.json" || "./global.conf.json";
* var mcfg = mc.mainconf_load(mcfn);
* // Do env-merging always first (Unless you know a strong reasong to not do it at all)
* mc.env_merge(mcfg);
* mc.mainconf_process(mcfg);
* var user = mc.user_load(mcfg);
* ```
*/
var fs = require("fs");

var osinst = require("./osinstall.js"); // for recipes. TODO: Pass recipes (arr) separately ?

/** Exit the app process on fatal config errors.
* @param msg {string} - Error message String to output to STDERR before existing.
*/
function error(msg) {
  console.error(`mainconf error: App-Init/Prep encountered problem: ${msg}`);
  process.exit(1);
}
/** Load main configuration.
 * @param linetconf {string} - Filename for main configuration.
 * @return handle to main config (object)
 */
function mainconf_load(linetconf) {
  if (!fs.existsSync(linetconf)) { error(`mc: Main conf (${linetconf}) does not exist !`);}
  var mcfg   = require(linetconf);
  if (!mcfg) { error(`mc: Main conf JSON (${linetconf}) exists, but could not be loaded !`); }
  // Add overlay detection. For now ONLY available via env variable.
  // TODO: Allow secondary overlay point/refer to inherited / super maincfg that should be loaded FIRST.
  // Because we do this EARLY, the whole config is subject to tilde expansion.
  var ofn = process.env['LINETBOOT_OVERLAY_CONFIG'];
  if (ofn && fs.existsSync(ofn)) {
    var olay = require(ofn);
    console.log("Merging overlay config: ofn: "+ofn+", data: "+ typeof olay);
    olay_merge(mcfg, olay);
  }
  return mcfg;
  // Merge overlay config with overrides to main config. Assume same layout (spec) as main config.
  // Any violations in overlay will corrupt main config.
  // Note: (for now) The target section must exist in the main config to be accepted from overlay
  function olay_merge(mcfg, olay) {
    var oks = Object.keys(olay);
    if (!oks || !Array.isArray(oks)) { return; }
    oks.forEach((ok) => {
      if (!mcfg[ok]) { console.log("No target section '"+ok+"' in mcfg");return; }
      // TODO: Create as empty mcfg[ok] = {};
      if (typeof olay[ok] != 'object') { console.log("Overlay file top-section '"+ok+"' is not an object");return; }
      var subkeys = Object.keys(olay[ok]);
      subkeys.forEach((k) => {
        mcfg[ok][k] = olay[ok][k]; // Merge / override
      });
    });
  }
}
/** Load Initial User (for OS Installation).
 * Note: this should take place after tilde expansion (in mainconf_process()) has taken place.
 * @param mcfg {object} - Main Config
*/
function user_load(mcfg) {
  // process.env["LINETBOOT_USER_CONF"] ||
  var userconf = mcfg.inst.userconfig || "./initialuser.json";
  if (!fs.existsSync(userconf)) { error(`User conf (${userconf}) does not exist !`);}
  //var
  user     = require(userconf);
  if (!user) { error(`User conf JSON (${userconf}) could not be loaded !`); }
  // TODO: user.groups_str = ...
  //OLD: user.groups  = user.groups.join(" ");
  user.groups_str  = user.groups.join(" ");
  user.groups_csv  = user.groups.join(",");
  return user;
}
/** Load OS installation profiles.
 */
function iprofs_load(mcfg) {
  var iconf = mcfg.inst.iprofsconfig || "";
  if (!fs.existsSync(iconf)) { console.error("Install profile conf ("+iconf+") does not exist !"); return null; }
  var ips = require(iconf) || null;
  // Validate (Object, string keys valued to objects)
  if (typeof ips !== 'object') { console.log("install-profs - not an object"); return null; }
  var okcnt = 0;
  Object.keys(ips).forEach((k) => { okcnt += is_iprof(ips[k]); });
  if (!okcnt) { console.log("install-profs - none of the nodes are valid configs"); return 0; } // For now even "some okay" is "okay"
  return ips;
  function is_iprof(e) {
    if (e.domain && e.netmask && e.gateway) { return 1; }
    return 0;
  }
}

/** Validate config and expand shell-familiar "~" -notation on path / file vars.
 * @param mcfg {object} - Main configuration.
*/
function mainconf_process(mcfg) {
  // Validate config section presence (for mandatory sections)
  var sectnames = ["core", "tftp", "ipmi", "probe", "net", "inst"]; // "ansible", "docker"
  sectnames.forEach(function (sn) {
    // TODO: Check for real object !
    if (!mcfg[sn]) { error(`Main Config (mandatory) Section '${sn}' missing. Exiting ...`); }
    
  });
  //////// "~" ($HOME) expansion //////////////////
  // ... for config convenience (top-level & some sects ?)
  // function tilde_expand_all(mcfg) {
  var top_paths = ["fact_path", "hostsfile", "rmgmt_path", "customhosts", "pkglist_path", "lboot_setup_module",
    "passfn", "sshkeyfn"];
  tilde_expand(mcfg, top_paths);
  var home = process.env['HOME'];
  //console.log("Starting individual sections expand");
  //top_paths.forEach(function (pk) {
  //  if (mcfg[pk]) { mcfg[pk] = mcfg[pk].replace('~', home); }
  //});
  // Sections: tftp.menutmpl, ipmi.path, docker.config, docker.catalog, ansible.pbpath
  tilde_expand(mcfg.tftp, ["menutmpl"]);
  tilde_expand(mcfg.ipmi, ["path"]);
  tilde_expand(mcfg.esxi, ["cachepath"]);
  tilde_expand(mcfg.inst, ["script_path", "tmpl_path", "userconfig", "sshkey_path", "iprofsconfig"]);
  //tilde_expand(mcfg.probe, ["???"]);
  // var dkr = mcfg.docker;
  if (mcfg.docker) {
    tilde_expand(mcfg.docker, ["config","catalog", "comppath", "compfiles"]); // comppath/compfiles mutually exclusive
  }
  tilde_expand(mcfg.ansible, ["pbpath"]);
  tilde_expand(mcfg.core, ["maindocroot"]); // Could have tilde e.g. on Mac
  //console.log("Done core.");
  //var deploy = mcfg.deployer;
  //if (deploy) {
  tilde_expand(mcfg.deployer, ["deployfn", "gitreposfn"]); // }
  //var gerrit = mcfg.gerrit;
  //if (gerrit) {
  tilde_expand(mcfg.gerrit, ["pkey"]); // }
  tilde_expand(mcfg.gcp, ["dyninvfn", "sakeyfn"]);
  tilde_expand(mcfg.services, ["conffn"]);
  tilde_expand(mcfg.afa, ["storpath"]);
  tilde_expand(mcfg.grepo, ["mfpath"]);
  // For compat use id_rsa.pub, later id_ed25519 (-t ed25519)
  if (!mcfg.sshkeyfn) { mcfg.sshkeyfn = `${process.env['HOME']}/.ssh/id_rsa`; } // Default (in trans. to ec25519)
  // Allow LINETBOOT_SSHKEY to override, sync to mcfg.sshkeyfn = 
  if (process.env.LINETBOOT_SSHKEY) { mcfg.sshkeyfn = process.env.LINETBOOT_SSHKEY; }
  process.env['LINETBOOT_SSHKEY'] = mcfg.sshkeyfn;
  // return 1; } // tilde_expand_all
  //console.log("Done services.");
  /////////// Post Install Scripts ///////
  // TODO: Discontinue use of singular version
  //if (mcfg.inst.postscript) { error("Legacy config mcfg.inst.postscript (scalar/string) is discontinued. Use inst.postscripts (plural work, array value)"); }
  // New stye: Plural - multiple scripts in an Array. Ignore singular key completely.
  if (mcfg.inst.postscripts) {
    if (!Array.isArray(mcfg.inst.postscripts)) { error("inst.postscripts not in Array !"); }
    // Compatibility w. old singular inst.postscript, set first as inst.postscript (Note NO 's')
    mcfg.inst.postscript = mcfg.inst.postscripts[0];
  }
  // Legacy compatibility for singular version. Set the single script in plural array.
  else if (mcfg.inst.postscript) {
    mcfg.inst.postscripts = [mcfg.inst.postscript];
  }
  // Set at least empty array (for recipe templating)
  else { mcfg.inst.postscripts = []; }
  // Detect disabled features 
  var dis = disabled_detect(mcfg);
  // NEW: Allow pushing (appending, add to end) or unshifting (add to head) recipe items
  if (mcfg.recipes) {
    let debug = 0;
    // TODO: function recipes_add(mcfg, recipes) {
    // ra = recipe array, ri = recipe item
    var nra = mcfg.recipes;
    var ora = osinst.recipes;
    debug && console.log("Add to recipes ...", nra); // ora, nra
    if ( ! Array.isArray(nra)) { console.error("'recipes' ('add') config not in array"); return; }
    nra.forEach((nri) => {
      // Find matching item in old
      var oridx = ora.findIndex((ori) => { return ori.url == nri.url; });
      // Need idx. TODO: Allow remove, then push/unshift (new location)
      if (oridx > -1) {
        debug && console.log("Found old - replace (at index)"+oridx);
        ora[oridx] = nri;
      } 
      else {
        // Default to adding in front !
        var op = nri.push ? "push" : "unshift";
        debug && console.log("New item - add by "+op);
        // Call push/unshift
        ora[op](nri);
      }
    });
    debug && console.log(osinst.recipes);
    //  
    //} // recipes_add
  }
  return 1;
}

function hasnofiles(dir) {
    if (!dir) { return 1; }
    var files;
    try { files = fs.readdirSync(dir); }
    catch (ex) { return 1; }
    if (files.length > 1) { return 0; }
    return 1;
}

/** Detect completeness of various configs and mark things that are not in use as disabled.
  * Use these to customize Web UI. Use UI terms here for ease at UI end (and aim to sync terminology in time).
  * All this means the push() - keywords *must* be in sync with web frontend.
  * IPMI: See if dir exists and if any info collected
  */
function disabled_detect(mcfg) {
  var dis = mcfg.disabled = [];
  if (!fs.existsSync(mcfg.ipmi.path) || hasnofiles(mcfg.ipmi.path)) { dis.push('ipmi'); }
  // Docker see if both files exist
  if (!fs.existsSync(mcfg.docker.config) || !fs.existsSync(mcfg.docker.catalog)) { dis.push("dockerenv"); }
  if (mcfg.docker.compfiles && Array.isArray(mcfg.docker.compfiles)) {
    var bad = 0;
    mcfg.docker.compfiles.forEach((fn) => {
      if (!fs.existsSync(fn)) { bad++; }
    });
    if (bad) { dis.push("dockercomp"); }
  }
  // Groups
  if (!mcfg.groups || !mcfg.groups.length) { dis.push("groups"); } // dyngroups
  // Output formats ??
  // if () {}
  // Hostkeys
  if (!fs.existsSync(mcfg.inst.sshkey_path) || hasnofiles(mcfg.inst.sshkey_path)) { dis.push("hostkeys"); }
  // PkgStat (pkgstats). Which directory ?
  if (!mcfg.pkglist_path || !fs.existsSync(mcfg.pkglist_path) || hasnofiles(mcfg.pkglist_path) ) { dis.push("pkgstats"); }
  var ibc = mcfg.iblox;
  if (!ibc || !ibc.user || !ibc.pass) { dis.push("ibloxlist"); }
  var efc = mcfg.eflow;
  if (!efc || !efc.user || !efc.pass) { dis.push("eflowlist"); }
  // Flags for docs disa ? Do not enable
  // Reporting (in flux for transition to tabs) "reports"
  if (mcfg.web && !mcfg.web.reports) { dis.push("reports"); }
  // Groups. The test for validity for groups (other than patt == null, policy == nongrouped) would be to detect members
  // in g.hostnames.length > 0.
  // NOTE: We don't know if groups have been loaded (properly) and it will be hard to test here.
  // NOTE: The mcfg.groups are already dealt with oabove !!!
  if (mcfg.groups && 1) {
    //dis.push("groups");
  }
  var esxi = mcfg.esxi; // console.log(`ESXI Config:`, esxi);
  if (!esxi || (esxi && !esxi.password) || (esxi && !esxi.vmhosts)) {dis.push("esxiguests"); } // Note UI term
  var proc = mcfg.procster;
  // !proc.urlpath ... does not seemed to be filled in any examples
  if (proc && proc.disable) { dis.push("tabs-bprocs"); } // tabs-bprocs - How to do this tab ?
  var cov = mcfg.cov;
  if (!cov || (cov && !cov.pass) || (cov && !cov.user)) { dis.push("coverity"); }
  var jenk = mcfg.jenkins;
  if (!jenk || (jenk && !jenk.pass) || (jenk && !jenk.user)) { dis.push("jenkins"); }
  var dr = mcfg.deployer;
  if (!dr || (dr && !dr.deployfn) || !fs.existsSync(dr.deployfn) || (dr && !dr.gitreposfn) || !fs.existsSync(dr.gitreposfn) ) { dis.push("gitproj"); } // OLD: "deploy"
  let gh = mcfg.github;
  if (!gh || (gh && !gh.org) || (gh && Array.isArray(gh.org) && !gh.org.length)) { dis.push("ghprojs"); }
  gh = mcfg.gitlab; // Reuse gh for gitlab
  if (!gh || (gh && !gh.org) || (gh && Array.isArray(gh.org) && !gh.org.length)) { dis.push("glprojs"); }
  var cfl = mcfg.confluence;
  if (!cfl || (cfl && !cfl.user) || (cfl && !cfl.pass) ) { dis.push("cflpages"); }
  var ks = mcfg.k8s;
  if (!ks || (ks && !ks.host) || (ks && !ks.token) ) { dis.push("kubinfo"); }
  var ser = mcfg.services;
  if (!ser || (ser && !ser.conffn) || !fs.existsSync(ser.conffn) ) { dis.push("services"); }
  let grepo = mcfg.grepo;
  if (!grepo || (grepo && !grepo.fn)) { dis.push("grepo"); }
  return dis;
} // disabled_detect

////// TRANSFER KEY ENV VARS /////////////////
  // No Transfer: LINETBOOT_GLOBAL_CONF, LINETBOOT_URL (linet.js)
  // LINETBOOT_USER_CONF  LINETBOOT_ANSIBLE_DEBUG
  // LINETBOOT_SSHKEY_PATH LINETBOOT_DEBUG LINETBOOT_IPTRANS_MAP LINETBOOT_SCRIPT_PATH
/** Transfer and merge environment variables directly into runtime main config.
 * This avoids later if-elsing for environment versus main config.
 * This mering shoudl eb doen for example **before**:
 * - Tilde expansion - only finale merged values should be expanded (only once)
 * - Feature disablement detection.
 * For most of the sections affected, a non-existing section will be "stubbed" in place by creating
 * an empty config object for it.
 * 
 * @param mcfg {object} - main config
 * @return nothing
 * @todo Do (most?) env merges in a data driven way (env var => ds-node name, e.g. "core.maindocroot")
 */
function env_merge(mcfg) {
  if (!mcfg || typeof mcfg != 'object' && !mcfg.core) { console.error("No mcfg passed (correctly?)"); return; }
  if (!mcfg_looks_ok(mcfg)) { error("env_merge: mcfg does not look ok !"); }
  //let mcfg = mcfg; // TODO: Pass
  //console.log("mcfg:", mcfg);
  if (!mcfg) { error("env_merge: No handle to main config !"); }
  // TOP
  if (process.env["FACT_PATH"])           { mcfg.fact_path = process.env["FACT_PATH"]; }
  if (process.env["LINETBOOT_DEBUG"])	    { mcfg.debug = parseInt(process.env["LINETBOOT_DEBUG"]); }
  // NOTE: This has been moved from top to "core"
  if (process.env["LINETBOOT_MAINDOCROOT"])	{ mcfg.core.maindocroot = process.env["LINETBOOT_MAINDOCROOT"]; }
  // INST
  if (process.env["LINETBOOT_USER_CONF"])   { mcfg.inst.userconfig = process.env["LINETBOOT_USER_CONF"]; }
  if (process.env["LINETBOOT_SSHKEY_PATH"]) { mcfg.inst.sshkey_path = process.env["LINETBOOT_SSHKEY_PATH"]; }
  // NOT: split(/:/); ? Keep as is as our path resolver can use a string.
  if (process.env["LINETBOOT_SCRIPT_PATH"]) { mcfg.inst.script_path = process.env["LINETBOOT_SCRIPT_PATH"]; }
  if (process.env["LINETBOOT_TMPL_PATH"])   { mcfg.inst.tmpl_path   = process.env["LINETBOOT_TMPL_PATH"]; }
  // RMGMT_PATH
  if (process.env["RMGMT_PATH"])            { stub("ipmi"); mcfg.ipmi.path = process.env["RMGMT_PATH"]; }
  // LINETBOOT_PKGLIST_PATH (Orig. in here) or PKGLIST_PATH (Was found in orig. code)
  if (process.env["LINETBOOT_PKGLIST_PATH"]) { mcfg.pkglist_path = process.env["LINETBOOT_PKGLIST_PATH"]; }
  if (process.env["PKGLIST_PATH"])           { mcfg.pkglist_path = process.env["PKGLIST_PATH"]; }
  
  if (process.env["LINETBOOT_LDAP_SIMU"]) { mcfg.ldap.simu = process.env["LINETBOOT_LDAP_SIMU"]; }
  // NOT: if (process.env["LINETBOOT_IPTRANS_MAP"]) { mcfg. = parseInt(process.env["LINETBOOT_IPTRANS_MAP"]); }
  // Proprietary systems test modes. To disable it's enough leave out user/pass.
  if (process.env["IBLOX_TEST"]) { stub("iblox"); mcfg.iblox.test = process.env["IBLOX_TEST"]; }
  if (process.env["EFLOW_TEST"]) { stub("eflow"); mcfg.eflow.test = process.env["EFLOW_TEST"]; }
  if (process.env["ANSIBLE_PASS"]) { stub("ansible"); mcfg.ansible.pass = process.env["ANSIBLE_PASS"]; }
  if (process.env['PLAYBOOK_PATH']) { stub("ansible"); mcfg.ansible.pbpath = process.env["PLAYBOOK_PATH"]; }
  if (process.env["LINETBOOT_ANSIBLE_DEBUG"]) { stub("ansible"); mcfg.ansible.debug = parseInt(process.env["LINETBOOT_ANSIBLE_DEBUG"]); }
  if (process.env["LINETBOOT_ESXI_PASS"]) { stub("esxi"); mcfg.esxi.password = process.env["LINETBOOT_ESXI_PASS"]; }
  // Override TFTP ROOT (tftp.root), esp. useful for Mac
  if (process.env["LINETBOOT_TFTP_ROOT"]) {  mcfg.tftp.root = process.env["LINETBOOT_TFTP_ROOT"]; }
  if (process.env["LINETBOOT_ISOPATH"])   {  mcfg.isopath = process.env["LINETBOOT_ISOPATH"]; }

  if (process.env["LINETBOOT_IPMI_EXECBIN"])   {
    if (!mcfg.ipmi) {}
    else { mcfg.ipmi.execbin = process.env["LINETBOOT_IPMI_EXECBIN"]; }
  }
  if (process.env["LINETBOOT_OPB"])   {
    if (!mcfg.ldap) {}
    else { mcfg.ldap.contpb = process.env["LINETBOOT_OPB"]; console.log("OPB: "+mcfg.ldap.contpb); }
  }
  if (process.env["LINETBOOT_JENKINS_PASS"])   {
    if (!mcfg.jenkins) {}
    else { mcfg.jenkins.pass = process.env["LINETBOOT_JENKINS_PASS"]; }
  }
  if (process.env["LINETBOOT_GERRIT_USER"])   { stub("gerrit"); mcfg.gerrit.user = process.env["LINETBOOT_GERRIT_USER"]; }
  if (process.env["LINETBOOT_GERRIT_PASS"])   { stub("gerrit"); mcfg.gerrit.pass = process.env["LINETBOOT_GERRIT_PASS"]; }
  if (process.env["LINETBOOT_GERRIT_PKEY"])   { stub("gerrit"); mcfg.gerrit.pkey = process.env["LINETBOOT_GERRIT_PKEY"]; }
  
  if (process.env["LINETBOOT_GITHUB_TOKEN"])  { stub("github"); mcfg.github.token = process.env["LINETBOOT_GITHUB_TOKEN"]; }
  if (process.env["LINETBOOT_GITHUB_ENT"])    { stub("github"); mcfg.github.ent = process.env["LINETBOOT_GITHUB_ENT"]; }
  if (process.env["LINETBOOT_GITHUB_ORG"])    {
    stub("github");
    //var orgstr = process.env["LINETBOOT_GITHUB_ORG"];
    //mcfg.github.org = orgstr ? orgstr.split(/,/) : [];
    strarray_set(mcfg.github, "org", process.env["LINETBOOT_GITHUB_ORG"]);
  }

  if (process.env["LINETBOOT_GITLAB_TOKEN"])  { stub("github"); mcfg.gitlab.token = process.env["LINETBOOT_GITLAB_TOKEN"]; }
  if (process.env["LINETBOOT_GITLAB_ENT"])    { stub("github"); mcfg.gitlab.ent = process.env["LINETBOOT_GITLAB_ENT"]; }
  if (process.env["LINETBOOT_GITLAB_ORG"])    {
    stub("github");
    //var orgstr = process.env["LINETBOOT_GITLAB_ORG"];
    //mcfg.github.org = orgstr ? orgstr.split(/,/) : [];
    strarray_set(mcfg.gitlab, "org", process.env["LINETBOOT_GITLAB_ORG"]);
  }

  if (process.env["LINETBOOT_GIT_BAREROOT"])  { stub("deployer"); mcfg.deployer.bareroot = process.env["LINETBOOT_GIT_BAREROOT"]; }
  // Fake fact hosts CVS filename
  if (process.env["LINETBOOT_NEWHOSTS"])  {  mcfg.customhosts = process.env["LINETBOOT_NEWHOSTS"]; } // stub("deployer");
  // unipass support by "$UNIPASS"
  
  if (process.env.LINETBOOT_UNIPASS) {
    let unipass = process.env.LINETBOOT_UNIPASS;
    Object.keys(mcfg).forEach( (k) => {
      let pass = mcfg[k].pass;
      if (pass && pass.match(/^\$UNIPASS$/)) { mcfg[k].pass = unipass; }
    });
  }
  // Create sub-config object stub under main config
  function stub(sect) { if (!mcfg[sect]) { mcfg[sect] = {}; } }
}
/** Replace tilde character (~) with process owners full home directory path ($HOME).
 * Replaces one or more values in object noted by keys passed.
 * Can replace tildes on values that are either strings or array of string.
 * @param obj {object} - Object to replace values on.
 * @param keyarr {array} - keys (of object) on which to do the replacement.
 * @return None
 */
function tilde_expand(obj, keyarr) {
  // if (typeof obj != 'object') { throw "Not an object"; }
  // Be forgiving about particular config section (e.g. "cov") not existing ...
  if (typeof obj != 'object') {
    let got = typeof obj;
    console.error(`mc: Warning: Passed config section is not an 'object' (got: '${got}'). Looked for ${keyarr.join(',')}`); return; }
  if (!Array.isArray(keyarr)) { throw "Not an array (of property keys)"; }
  var home = process.env['HOME'];
  keyarr.forEach(function (pk) {
    if (obj[pk] && (typeof obj[pk] == 'string')) {
      // Replace ONCE ONLY
      // obj[pk] = obj[pk].replace('~', home);
      // In case we have many (e.g. PATH-string)
      obj[pk] = obj[pk].replace(/~/g, home);
    }
    // Make happen also on array (of strings)
    else if (obj[pk] && Array.isArray(obj[pk])) {
      //obj.[pk].forEach();
      var arr = obj[pk]; // TODO: Validate elems: 
      for (var i = 0;i<arr.length;i++) {
        if (typeof arr[i] != 'string') { break; }
        arr[i] = arr[i].replace(/~/g, home);
      }
    }
  });
}
// Split an overriding CSV-string to array components to override property (prop) in object (obj).
function strarray_set(obj, prop, str) {
  if (!obj || !prop || !str) { return; } // console.log(``);
  let arr = str.split(',');
  // Allow setting to empty array ?
  if (!arr.length) { return; } // obj[prop] = [] ???
  obj[prop] = arr;
}
function mcfg_looks_ok(mcfg) {
  if (!mcfg) { console.error(`mcfg_looks_ok: No mcfg not passed !!!`); return 0; }
  let mtype = typeof mcfg;
  if (mtype != 'object') { console.error(`mcfg_looks_ok: Not object (but: '${mtype}')`); return 0; }
  if (!mcfg.core || !mcfg.inst || !mcfg.dhcp) { console.error(`mcfg_looks_ok: Some of keys (core,inst,dhcp) missing !`); return 0; } // Any missing
  return 1;
}
module.exports = {
  mainconf_load: mainconf_load,
  user_load: user_load,
  iprofs_load: iprofs_load,
  mainconf_process: mainconf_process,
  env_merge: env_merge,
  tilde_expand: tilde_expand,
  disabled_detect: disabled_detect,
  mcfg_looks_ok: mcfg_looks_ok,
  error: error,
};
// Perform full main config processing just like app does it - also in the same order
if (process.argv[1].match(/\bmainconf.js$/)) {
  var yaml   = require('js-yaml');
  let mcfgfn = `${process.env['HOME']}/.linetboot/global.conf.json`;
  let mcfg = mainconf_load(mcfgfn);
  env_merge(mcfg);
  mainconf_process(mcfg);
  //let dis = disabled_detect(mcfg); // Run implicitly by mainconf_process
  let ycfg = null;
  let fmt = process.argv[2];
  if (!['json','yaml'].includes(fmt)) {fmt = 'yaml'; }
  if (fmt == 'yaml') { console.log(yaml.dump(mcfg, ycfg)); }
  else { console.log(JSON.stringify(mcfg, null, 2)); }
  process.exit(0);
}
