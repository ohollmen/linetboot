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
* var globalconf = process.env["LINETBOOT_GLOBAL_CONF"] || process.env["HOME"] + "/.linetboot/global.conf.json" || "./global.conf.json";
* var mcfg = mc.mainconf_load(globalconf);
* // Do env-merging always first (Unless you know a strong reasong to not do it at all)
* mc.env_merge(mcfg);
* mc.mainconf_process(mcfg);
* var user = mc.user_load(global);
* ```
*/
var fs = require("fs");

var osinst = require("./osinstall.js"); // for recipes. TODO: Pass recipes (arr) separately ?

/** Exit the app process on fatal config errors.
* @param msg {string} - Error message String to output to STDERR before existing.
*/
function error(msg) {
  console.error(msg); process.exit(1);
}
/** Load main configuration.
 * @param globalconf {string} - Filename for main configuration.
 * @return handle to main config (object)
 */
function mainconf_load(globalconf) {
  if (!fs.existsSync(globalconf)) { error("Main conf ('"+globalconf+"') does not exist !");}
  var global   = require(globalconf);
  if (!global) { error("Main conf JSON ("+globalconf+") could not be loaded !"); }
  // Add overlay detection. For now ONLY available via env variable.
  // TODO: Allow secondary overlay point/refer to inherited / super maincfg that should be loaded FIRST.
  // Because we do this EARLY, the whole config is subject to tilde expansion.
  var ofn = process.env['LINETBOOT_OVERLAY_CONFIG'];
  if (ofn && fs.existsSync(ofn)) {
    var olay = require(ofn);
    console.log("Merging overlay config: ofn: "+ofn+", data: "+ typeof olay);
    olay_merge(global, olay);
  }
  return global;
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
 * @param global {object} - Main Config
*/
function user_load(global) {
  // process.env["LINETBOOT_USER_CONF"] ||
  var userconf = global.inst.userconfig || "./initialuser.json";
  if (!fs.existsSync(userconf)) { error("User conf ("+userconf+") does not exist !");}
  //var
  user     = require(userconf);
  if (!user) { error("User conf JSON ("+user+") could not be loaded !"); }
  // TODO: user.groups_str = ...
  //OLD: user.groups  = user.groups.join(" ");
  user.groups_str  = user.groups.join(" ");
  user.groups_csv  = user.groups.join(",");
  return user;
}
/** Load OS installation profiles.
 */
function iprofs_load(global) {
  var iconf = global.inst.iprofsconfig || "";
  if (!fs.existsSync(iconf)) { console.error("Install profile conf ("+iconf+") does not exist !"); return null; }
  var ips = require(iconf) || null;
  // Validate (Object, string keys valued to objects)
  if (typeof ips !== 'object') { console.log("iprofs - not an object"); return null; }
  var okcnt = 0;
  Object.keys(ips).forEach((k) => { okcnt += is_iprof(ips[k]); });
  if (!okcnt) { console.log("iprofs - none of the nodes are vallid configs"); return 0; } // For now even "some okay" is "okay"
  return ips;
  function is_iprof(e) {
    if (e.domain && e.netmask && e.gateway) { return 1; }
    return 0;
  }
}

/** Validate config and expand shell-familiar "~" -notation on path / file vars.
 * @param global {object} - Main configuration.
*/
function mainconf_process(global) {
  // Validate config section presence (for mandatory sections)
  var sectnames = ["core", "tftp", "ipmi", "probe", "net", "inst"]; // "ansible", "docker"
  sectnames.forEach(function (sn) {
    // TODO: Check for real object !
    if (!global[sn]) { console.error("Main Config (mandatory) Section '"+sn+"' missing. Exiting ..."); process.exit(1); }
    
  });
  //////// "~" ($HOME) expansion //////////////////
  // ... for config convenience (top-level & some sects ?)
  var top_paths = ["fact_path", "hostsfile", "rmgmt_path", "customhosts", "pkglist_path", "lboot_setup_module"];
  tilde_expand(global, top_paths);
  var home = process.env['HOME'];
  //top_paths.forEach(function (pk) {
  //  if (global[pk]) { global[pk] = global[pk].replace('~', home); }
  //});
  // Sections: tftp.menutmpl, ipmi.path, docker.config, docker.catalog, ansible.pbpath
  tilde_expand(global.tftp, ["menutmpl"]);
  tilde_expand(global.ipmi, ["path"]);
  tilde_expand(global.esxi, ["cachepath"]);
  tilde_expand(global.inst, ["script_path", "tmpl_path", "userconfig", "sshkey_path", "iprofsconfig"]);
  // var dkr = global.docker;
  if (global.docker) {
    tilde_expand(global.docker, ["config","catalog", "comppath", "compfiles"]); // comppath/compfiles mutually exclusive
  }
  tilde_expand(global.ansible, ["pbpath"]);
  tilde_expand(global.core, ["maindocroot"]); // Could have tilde e.g. on Mac
  //var deploy = global.deployer;
  //if (deploy) {
  tilde_expand(global.deployer, ["deployfn", "gitreposfn"]); // }
  //var gerrit = global.gerrit;
  //if (gerrit) {
  tilde_expand(global.gerrit, ["pkey"]); // }
  /////////// Post Install Scripts ///////
  // TODO: Discontinue use of singular version
  //if (global.inst.postscript) { error("Legacy config global.inst.postscript (scalar/string) is discontinued. Use inst.postscripts (plural work, array value)"); }
  // New stye: Plural - multiple scripts in an Array. Ignore singular key completely.
  if (global.inst.postscripts) {
    if (!Array.isArray(global.inst.postscripts)) { error("inst.postscripts not in Array !"); }
    // Compatibility w. old singular inst.postscript, set first as inst.postscript (Note NO 's')
    global.inst.postscript = global.inst.postscripts[0];
  }
  // Legacy compatibility for singular version. Set the single script in plural array.
  else if (global.inst.postscript) {
    global.inst.postscripts = [global.inst.postscript];
  }
  // Set at least empty array (for recipe templating)
  else { global.inst.postscripts = []; }
  // Detect disabled features 
  var dis = disabled_detect(global);
  // NEW: Allow pushing (appending, add to end) or unshifting (add to head) recipe items
  if (global.recipes) {
    let debug = 0;
    // TODO: function recipes_add(global, recipes) {
    // ra = recipe array, ri = recipe item
    var nra = global.recipes;
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
function disabled_detect(global) {
  var dis = global.disabled = [];
  if (!fs.existsSync(global.ipmi.path) || hasnofiles(global.ipmi.path)) { dis.push('ipmi'); }
  // Docker see if both files exist
  if (!fs.existsSync(global.docker.config) || !fs.existsSync(global.docker.catalog)) { dis.push("dockerenv"); }
  if (global.docker.compfiles && Array.isArray(global.docker.compfiles)) {
    var bad = 0;
    global.docker.compfiles.forEach((fn) => {
      if (!fs.existsSync(fn)) { bad++; }
    });
    if (bad) { dis.push("dockercomp"); }
  }
  // Groups
  if (!global.groups || !global.groups.length) { dis.push("groups"); } // dyngroups
  // Output formats ??
  // if () {}
  // Hostkeys
  if (!fs.existsSync(global.inst.sshkey_path) || hasnofiles(global.inst.sshkey_path)) { dis.push("hostkeys"); }
  // PkgStat (pkgstats). Which directory ?
  if (!global.pkglist_path || !fs.existsSync(global.pkglist_path) || hasnofiles(global.pkglist_path) ) { dis.push("pkgstats"); }
  var ibc = global.iblox;
  if (!ibc || !ibc.user || !ibc.pass) { dis.push("ibloxlist"); }
  var efc = global.eflow;
  if (!efc || !efc.user || !efc.pass) { dis.push("eflowlist"); }
  // Flags for docs disa ? Do not enable
  // Reporting (in flux for transition to tabs) "reports"
  if (global.web && !global.web.reports) { dis.push("reports"); }
  // Groups. The test for validity for groups (other than patt == null, policy == nongrouped) would be to detect members
  // in g.hostnames.length > 0.
  // NOTE: We don't know if groups have been loaded (properly) and it will be hard to test here.
  // NOTE: The global.groups are already dealt with oabove !!!
  if (global.groups && 1) {
    //dis.push("groups");
  }
  var esxi = global.esxi;
  if (!esxi || (esxi && !esxi.password) || (esxi && !esxi.vmhosts)) { dis.push("esxiguests"); } // Note UI term
  var proc = global.procster;
  // !proc.urlpath ... does not seemed to be filled in any examples
  if (proc && proc.disable) { dis.push("tabs-bprocs"); } // tabs-bprocs - How to do this tab ?
  var cov = global.cov;
  if (!cov || (cov && !cov.pass) || (cov && !cov.user)) { dis.push("coverity"); }
  var jenk = global.jenkins;
  if (!jenk || (jenk && !jenk.pass) || (jenk && !jenk.user)) { dis.push("jenkins"); }
  var dr = global.deployer;
  if (!dr || (dr && !dr.deployfn) || !fs.existsSync(dr.deployfn) || (dr && !dr.gitreposfn) || !fs.existsSync(dr.gitreposfn) ) { dis.push("gitproj"); } // OLD: "deploy"
  return dis;
} // diabled_detect

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
 * @param global {object} - main config
 * @return nothing
 * @todo Do (most?) env merges in a data driven way (env var => ds-node name, e.g. "core.maindocroot")
 */
function env_merge(global) {
  if (!global) { error("env_merge: No handle to main config !"); }
  // TOP
  if (process.env["FACT_PATH"])           { global.fact_path = process.env["FACT_PATH"]; }
  if (process.env["LINETBOOT_DEBUG"])	    { global.debug = parseInt(process.env["LINETBOOT_DEBUG"]); }
  // NOTE: This has been moved from top to "core"
  if (process.env["LINETBOOT_MAINDOCROOT"])	{ global.core.maindocroot = process.env["LINETBOOT_MAINDOCROOT"]; }
  // INST
  if (process.env["LINETBOOT_USER_CONF"])   { global.inst.userconfig = process.env["LINETBOOT_USER_CONF"]; }
  if (process.env["LINETBOOT_SSHKEY_PATH"]) { global.inst.sshkey_path = process.env["LINETBOOT_SSHKEY_PATH"]; }
  // NOT: split(/:/); ? Keep as is as our path resolver can use a string.
  if (process.env["LINETBOOT_SCRIPT_PATH"]) { global.inst.script_path = process.env["LINETBOOT_SCRIPT_PATH"]; }
  if (process.env["LINETBOOT_TMPL_PATH"])   { global.inst.tmpl_path   = process.env["LINETBOOT_TMPL_PATH"]; }
  // RMGMT_PATH
  if (process.env["RMGMT_PATH"])            { stub("ipmi"); global.ipmi.path = process.env["RMGMT_PATH"]; }
  // 
  if (process.env["LINETBOOT_PKGLIST_PATH"]) { global.pkglist_path = process.env["LINETBOOT_PKGLIST_PATH"]; }
  
  if (process.env["LINETBOOT_LDAP_SIMU"]) { global.ldap.simu = process.env["LINETBOOT_LDAP_SIMU"]; }
  // NOT: if (process.env["LINETBOOT_IPTRANS_MAP"]) { global. = parseInt(process.env["LINETBOOT_IPTRANS_MAP"]); }
  // Proprietary systems test modes. To disable it's enough leave out user/pass.
  if (process.env["IBLOX_TEST"]) { stub("iblox"); global.iblox.test = process.env["IBLOX_TEST"]; }
  if (process.env["EFLOW_TEST"]) { stub("eflow"); global.eflow.test = process.env["EFLOW_TEST"]; }
  if (process.env["ANSIBLE_PASS"]) { stub("ansible"); global.ansible.pass = process.env["ANSIBLE_PASS"]; }
  if (process.env['PLAYBOOK_PATH']) { stub("ansible"); global.ansible.pbpath = process.env["PLAYBOOK_PATH"]; }
  if (process.env["LINETBOOT_ANSIBLE_DEBUG"]) { stub("ansible"); global.ansible.debug = parseInt(process.env["LINETBOOT_ANSIBLE_DEBUG"]); }
  if (process.env["LINETBOOT_ESXI_PASS"]) { stub("esxi"); global.esxi.password = process.env["LINETBOOT_ESXI_PASS"]; }
  // Override TFTP ROOT (tftp.root), esp. useful for Mac
  if (process.env["LINETBOOT_TFTP_ROOT"]) {  global.tftp.root = process.env["LINETBOOT_TFTP_ROOT"]; }
  if (process.env["LINETBOOT_ISOPATH"])   {  global.isopath = process.env["LINETBOOT_ISOPATH"]; }

  if (process.env["LINETBOOT_IPMI_EXECBIN"])   {
    if (!global.ipmi) {}
    else { global.ipmi.execbin = process.env["LINETBOOT_IPMI_EXECBIN"]; }
  }
  if (process.env["LINETBOOT_OPB"])   {
    if (!global.ldap) {}
    else { global.ldap.contpb = process.env["LINETBOOT_OPB"]; console.log("OPB: "+global.ldap.contpb); }
  }
  if (process.env["LINETBOOT_JENKINS_PASS"])   {
    if (!global.jenkins) {}
    else { global.jenkins.pass = process.env["LINETBOOT_JENKINS_PASS"]; }
  }
  if (process.env["LINETBOOT_GERRIT_USER"])   { stub("gerrit"); global.gerrit.user = process.env["LINETBOOT_GERRIT_USER"]; }
  if (process.env["LINETBOOT_GERRIT_PASS"])   { stub("gerrit"); global.gerrit.pass = process.env["LINETBOOT_GERRIT_PASS"]; }
  if (process.env["LINETBOOT_GERRIT_PKEY"])   { stub("gerrit"); global.gerrit.pkey = process.env["LINETBOOT_GERRIT_PKEY"]; }
  // Create sub-config object stub under main config
  function stub(sect) { if (!global[sect]) { global[sect] = {}; } }
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
  if (typeof obj != 'object') { console.log("Warning: Passed config section is not an 'object' (got: '"+typeof obj+"')"); return; }
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

module.exports = {
  mainconf_load: mainconf_load,
  user_load: user_load,
  iprofs_load: iprofs_load,
  mainconf_process: mainconf_process,
  env_merge: env_merge,
  tilde_expand: tilde_expand,
  disabled_detect: disabled_detect
};
