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
* mc.env_merge(mcfg);
* mc.mainconf_process(mcfg);
* ```
*/
var fs = require("fs");

/** Exit the app process on fatal config errors.
* @param msg {string} - Error message String to output to STDERR before existing.
*/
function error(msg) {
  console.error(msg); process.exit(1);
}

function mainconf_load(globalconf) {
  
  
  if (!fs.existsSync(globalconf)) { error("Main conf ("+globalconf+") does not exist !");}
  var global   = require(globalconf);
  if (!global) { error("Main conf JSON ("+globalconf+") could not be loaded !"); }
  
  return global;
}
/** Load Initial User (for OS Installation)
*/
function user_load(global) {
  var userconf = process.env["LINETBOOT_USER_CONF"] || global.inst.userconfig || "./initialuser.json";
  if (!fs.existsSync(userconf)) { error("User conf ("+userconf+") does not exist !");}
  //var
  user     = require(userconf);
  if (!user) { error("User conf JSON ("+user+") could not be loaded !"); }
  user.groups  = user.groups.join(" ");
  return user;
}

/** Validate config and expand shell-familiar "~" -notation on path / file vars.
*/
function mainconf_process(global) {
  // Validate config section presence (for mandatory sections)
  var sectnames = ["core", "tftp", "ipmi", "probe", "net"]; // "ansible", "docker"
  sectnames.forEach(function (sn) {
    // TODO: Check for real object !
    if (!global[sn]) { console.error("Main Config Section "+sn+" missing. Exiting ..."); process.exit(1); }
    
  });
  //////// "~" (HOME) expansion //////////////////
  // ... for config convenience (top-level & some sects ?)
  var top_paths = ["fact_path", "hostsfile", "rmgmt_path", "customhosts"];
  tilde_expand(global, top_paths);
  var home = process.env['HOME'];
  //top_paths.forEach(function (pk) {
  //  if (global[pk]) { global[pk] = global[pk].replace('~', home); }
  //});
  // Sections: tftp.menutmpl, ipmi.path, docker.config, docker.catalog, ansible.pbpath
  //if (global.tftp.menutmpl) { global.tftp.menutmpl = global.tftp.menutmpl.replace('~', home); }
  //if (global.ipmi.path)     { global.ipmi.path     = global.ipmi.path.replace('~', home); }
  tilde_expand(global.tftp, ["menutmpl"]);
  tilde_expand(global.ipmi, ["path"]);
  
  tilde_expand(global.inst, ["script_path", "tmpl_path", "userconfig"]);
  if (global.docker) {
    var dkr = global.docker;
    tilde_expand(dkr, ["config","catalog"]);
    //if (dkr.config)  { dkr.config  = dkr.config.replace('~', home); }
    //if (dkr.catalog) { dkr.catalog = dkr.catalog.replace('~', home); }
  }
}

////// TRANSFER KEY ENV VARS /////////////////
  // No Transfer: LINETBOOT_GLOBAL_CONF, LINETBOOT_URL (linet.js)
  // LINETBOOT_USER_CONF  LINETBOOT_ANSIBLE_DEBUG
  // LINETBOOT_SSHKEY_PATH LINETBOOT_DEBUG LINETBOOT_IPTRANS_MAP LINETBOOT_SCRIPT_PATH
function env_merge(global) {
  // TOP
  if (process.env["FACT_PATH"])           { global.fact_path = process.env["FACT_PATH"]; }
  if (process.env["LINETBOOT_DEBUG"])	    { global.debug = parseInt(process.env["LINETBOOT_DEBUG"]); }
  // INST
  if (process.env["LINETBOOT_USER_CONF"])   { global.inst.userconfig = process.env["LINETBOOT_USER_CONF"]; }
  if (process.env["LINETBOOT_SSHKEY_PATH"]) { global.inst.sshkey_path = process.env["LINETBOOT_SSHKEY_PATH"]; }
  if (process.env["LINETBOOT_SCRIPT_PATH"]) { global.inst.script_path = parseInt(process.env["LINETBOOT_SCRIPT_PATH"]); }
  // NOT: split(/:/); ? Keep as is as our path resolver can use a string.
  if (process.env["LINETBOOT_TMPL_PATH"])   { global.inst.tmpl_path = process.env["LINETBOOT_TMPL_PATH"]; }
  // RMGMT_PATH
  if (process.env["RMGMT_PATH"])            { global.ipmi.path = process.env["RMGMT_PATH"]; }
  
  // NOT: if (process.env["LINETBOOT_IPTRANS_MAP"]) { global. = parseInt(process.env["LINETBOOT_IPTRANS_MAP"]); }
}
function tilde_expand(obj, keyarr) {
  if (typeof obj != 'object') { throw "Not an object"; }
  if (!Array.isArray(keyarr)) { throw "Not an array (of keys)"; }
  var home = process.env['HOME'];
  keyarr.forEach(function (pk) {
    if (obj[pk] && (typeof obj[pk] == 'string')) {
      // Replace ONCE ONLY
      // obj[pk] = obj[pk].replace('~', home);
      // In case we have many (e.g. PATH-string)
      obj[pk] = obj[pk].replace(/~/g, home);
    }
  });
}

module.exports = {
  mainconf_load: mainconf_load,
  user_load: user_load,
  mainconf_process: mainconf_process,
  env_merge: env_merge,
  tilde_expand: tilde_expand,
};
