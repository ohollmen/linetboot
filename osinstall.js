/** @file
 * # OS Installations recipe generation and disk recipe calculations
 * 
 * ## Request Headers from OS installers
*
* These could be potentially used by generator.
*
* Debian Installer req.headers shows (initially)
*
*     'user-agent': 'debian-installer',
*
* then (later) also:
*
*     'user-agent': "Debian APT-HTTP/1.3 (1.6.3)"
*
* Redhat/CentOS:
*
*     'user-agent': 'anaconda/13.21.229'
*     'x-anaconda-architecture': 'x86_64',
*     'x-anaconda-system-release': 'CentOS'
* 
 * ## Refactor (DONE)
 * 
 * ### Needs from main server
 * - hostcache
 * - mod - Custom setup module or single params patcher cb
 * - iptrans
 * - global
 * - user
 * - 
 * ### Linting yaml
node -e "var yaml = require('js-yaml'); var fs = require('fs'); var y = yaml.safeLoad(fs.readFileSync('tmpl/subiquity.autoinstall.yaml.mustache')); console.log(JSON.stringify(y, null, 2));"

 * ### Funcs moved
 * ```
 * {
 * ipaddr_v4 ( ~ l. 328)
 * host_for_request  UNUSED
 * preseed_gen - DONE
 * patch_params - TODO: Add chained Plugin !
 * host_params_dummy - DONE
 * global_params_cloned (Unused ?)
 * params_compat DONE
 * host_params DONE
 * }
 * disk_params DONE
 * disk_calc_size ( ~ l. 702) DONE
 * ------ Lot of subs ----
 * netplan_yaml LEFT OUT (~ l. 860)
 * script_send DONE
 * needs_template DONE (~l. 1020)
 * ```
 * 
 * # TODO
 * - Possibly load initial user here, keep as priv variable ?
 */
var fs = require("fs");
var Mustache = require("mustache");
var yaml   = require('js-yaml'); // subiquity

var hlr    = require("./hostloader.js"); // file_path_resolve
var osdisk = require("./osdisk.js");

// console.log("OSINTALL-osdisk", osdisk);

function dclone(d) { return JSON.parse(JSON.stringify(d)); }
// https://stackabuse.com/using-global-variables-in-node-js/
var hostcache = {};
var iptrans = {};
var global = {};
var user = {};
var patch_params_custom; // CB
var setupmod = {}; // custom CB Module

// Map URL to symbolic template name needed. template names get mapped by global.tmplfiles (Object-map, See main config)
// {url: ..., ctype: ..., tmpl: "", nopara: ...}
// The value of the map is "ctype" (for "config type")
/*
var tmplmap = {
// var recipes =[
   "/preseed.cfg": "preseed",
   "/ks.cfg":      "ks",
   //"/partition.cfg": "part",
   // "interfaces" :  "netif", // Near-duplicate
   "/sysconfig_network": "netw_rh",
   "/interfaces" : "netif",
   "/preseed.desktop.cfg": "preseed_dt",
   "/preseed_mini.cfg": "preseed_mini",
   // ???? Not used yet ?
   "/boot/pc-autoinstall.conf": "pcbsd",
   "/cust-install.cfg": "pcbsd2", // freebsd/pcbsd
   // https://wiki.ubuntu.com/FoundationsTeam/AutomatedServerInstalls
   // https://github.com/CanonicalLtd/subiquity/tree/master/examples
   // https://wiki.ubuntu.com/FoundationsTeam/AutomatedServerInstalls/QuickStart
   // "/user-data": "ubu20", // Ubuntu 20.04 YAML
   // "/autoinst.xml": "suse",
   // https://www.packer.io/guides/automatic-operating-system-installs/autounattend_windows
   // https://github.com/StefanScherer/packer-windows
   "/Autounattend.xml": "win", // Windows "autounattend.xml" 
   //"boot.ipxe": "" // E.g. https://coreos.com/matchbox/docs/latest/network-booting.html
//];
};
*/
// TODO: Create tmplmap (k-v) here for compat.
// ctype => tmplfile
/*
var tmplfiles = {
    "preseed": "preseed.cfg.mustache",
    "ks":      "ks.cfg.mustache",
    "netif":   "interfaces.mustache",
    "netw_rh": "sysconfig_network.mustache",
    "preseed_dt": "preseed.desktop.cfg.mustache",
    "preseed_mini": "preseed_mini.cfg.mustache",
    "pcbsd":   "pc-autoinstall.conf.mustache",
    "pcbsd2":   "pcinstall.cfg.mustache",
    "win": "", // mime: "text/xml"
};
*/
//var tmpls = {};
var recipes = [
  {"url":"/preseed.cfg",        "ctype":"preseed",    "tmpl":"preseed.cfg.mustache"},
  {"url":"/ks.cfg",             "ctype":"ks",         "tmpl":"ks.cfg.mustache"},
  {"url":"/sysconfig_network",  "ctype":"netw_rh",    "tmpl":"sysconfig_network.mustache"},
  {"url":"/interfaces",         "ctype":"netif",      "tmpl":"interfaces.mustache"},
  {"url":"/preseed.desktop.cfg","ctype":"preseed_dt", "tmpl":"preseed.desktop.cfg.mustache"},
  {"url":"/preseed_mini.cfg",   "ctype":"preseed_mini","tmpl":"preseed_mini.cfg.mustache"},
  // /boot/pc-autoinstall.conf on TFTP ?
  {"url":"/pc-autoinstall.conf","ctype":"bsd1",      "tmpl":"pc-autoinstall.conf.mustache"},
  {"url":"/cust-install.cfg",   "ctype":"bsd2",      "tmpl":"pcinstall.cfg.mustache"},
  {"url":"/Autounattend.xml",   "ctype":"win",        "tmpl":"Autounattend.xml.mustache"},
  // Suse / Yast
  {"url":"/autoinst.xml",       "ctype":"suse",       "tmpl":"autoyast.autoinstall.xml.mustache"}, // ctype: "*yast*" ?
  // {"url":"/control-files/autoinst.xml",       "ctype":"suse",       "tmpl":"autoyast.autoinstall.xml.mustache"},
  {"url":"/alis.conf",       "ctype":"arch",       "tmpl":"alis.conf.mustache"},
  // Ubuntu 20 ("focal") "autoinstall" yaml (not template-only) ?
  // https://askubuntu.com/questions/1235723/automated-20-04-server-installation-using-pxe-and-live-server-image
  {"url":"/user-data",       "ctype":"ubu20",       "tmpl":"subiquity.autoinstall.yaml.mustache", pp: pp_subiquity},
];
function pp_subiquity(out, d) {
  var out2 = out;
  var y;
  var ycfg = {
    'styles': { '!!null': 'canonical' },
  };
  try { y = yaml.safeLoad(out); } catch (ex) { console.log("Failed autoinstall yaml load: "+ex); }
  // Add disk (d.diskinfo), net (d.net)
  console.log("pp_subiquity(dump):"+JSON.stringify(y, null, 2));
  if (y) {
    var dy;
    try { dy = yaml.safeLoad(d.diskinfo); } catch (ex) { console.log("Failed disk yaml load: "+ex); }
    if (!Array.isArray(dy)) { console.log("Disk Yam not parseable");}
    // Disk
    //y.autoinstall.storage.config = dy;
    // Net / Netplan
    // y.autoinstall.network.network = 
    out2 = "#cloud-config\n"+yaml.safeDump(y, ycfg);
  }
  return out2;
}
var recipes_idx = {};
// TODO: Move to proper entries (and respective prop skip) in future templating AoO. Create index at init.
// var _skip_host_params = {"/preseed.desktop.cfg": 1, "/preseed_mini.cfg": 1};
  

//var tmplmap_idx = {}; // By URL !
// tmpls.forEach((it) => { tmplmap_idx[it.url] = it; });

// Pass url as req.route.path
function url_config_type(url) {
  //return tmplmap[url]; // OLD
  return recipes_idx[url].ctype;
}
// DEPRECATED
// url ~ req.route.path
//function skip_host_params(url) {
//  return _skip_host_params[url];
//}
// Wrapper for getting template content
function template_content(url, forcefn) {
  var recipe = recipes_idx[url]; // url
  if (!recipe) { console.log("No recipe for URL: "+ url); return ""; }
  var fn = recipe.tmpl;
  // Force template name override, but put his still through filename resolution.
  if (forcefn) { fn = forcefn; console.log("Override template name (from hostparams?) to: "+forcefn); }
  var fnr = hlr.file_path_resolve(fn, global.inst.tmpl_path);
  if (!fs.existsSync(fnr)) { console.log("Resolved Template "+fnr+" does not exist !"); return ""; }
  return fs.readFileSync(fnr, 'utf8');
}
//return tmpls[ctype]; // OLD/Cached: global.tmpls
  //// Phase 2 (url)
  //var ctype = tmplmap[url];
  //if (!ctype) { return ""; }
  //return tmpls[ctype];
  //////////////////////////////////
  // NEW: On demand
  //var url = "";

//////// cache templates into memory. TODO: Deprecate or make optional //////
/*
function templates_load() {
  // 
  var tkeys = Object.keys(tmplfiles); // OLD: global.tmplfiles
  tkeys.forEach(function (k) {
    // TODO: try/catch
    var fn = tmplfiles[k]; // OLD: global.tmplfiles
    if (!fn) { console.log("templates_load: No template filename for "+k); return; }
    var fnr = fn;
    fnr = hlr.file_path_resolve(fn, global.inst.tmpl_path);
    if (!fs.existsSync(fnr)) { console.log("templates_load: No template resolved for caching: "+ fnr); return; }
    tmpls[k] = fs.readFileSync(fnr, 'utf8'); // OLD: global.tmpls
    
  });
  console.error("loaded " + tkeys.length + " templates.");
}
*/

/** Initialize osinstall module.
 * @param conf {object} - Handle members: hostcache, global, iptrans, user
 * @param _patch_params {function} - User defined custom function for customizing params
 */
function init(conf, _patch_params) { // TODO: 2nd: _mod
  // ["hostcache", "global", "iptrans", "user"];
  hostcache = conf.hostcache ;
  if (!hostcache) {throw "No hostcache"}
  global = conf.global;
  if (!global) {throw "No global config";}
  iptrans = conf.iptrans;
  if (!iptrans) {throw "No iptrans config";}
  user = conf.user;
  if (!user) { throw "No initial user config"; }
  // TODO: patch_params
  if (_patch_params) { console.log("Got patch_params customization CB"); patch_params_custom = _patch_params; }
  // NEW: if (_mod) { mod = _mod; }
  // Additional in-depth validation (e.g. MUST HAVE "inst" and "inst.tmpl_path
  if (!global.inst) { throw "No 'inst' in main conf"; }
  if (!global.inst.tmpl_path) { throw "No 'inst.tmpl_path' in main conf"; }
  // In-memory cached templates
  // templates_load(); // Keep after assigning "global"
  // Transform to new structure
  //NOT:recipes = [];
  // TODO: Disable generation, change url_hdlr_set
  //Object.keys(tmplmap).forEach((k) => {
  //  var ctype = tmplmap[k];
  //  if (!tmplfiles[ctype]) { console.log("Warning: missing template for ctype "+ctype); return; }
  //  var e = {url: k, ctype: tmplmap[k], tmpl: tmplfiles[ctype]};
  //  recipes.push(e);
  //});
  //console.log("NEW recipes array: ", JSON.stringify(recipes)); // , null, 2
  recipes.forEach((it) => { recipes_idx[it.url] = it; }); // Index by URL
}

/** Set URL handlers for all recipe URL:s.
 * @param app {object} - Express App. (or router ?) on which the URL recipe generating handlers should be set.
 * @return None
 */
function url_hdlr_set(app) {
  var urls = [];
  //urls = Object.keys(tmplmap);
  // TODO: Must exist as static !!
  recipes.forEach(function (r) {
    console.log("Recipe-URL: "+r.url);
    app.get(r.url, preseed_gen);
  });
  
  //urls.forEach(function (it) {
  //  console.log("Recipe-URL: "+it);
  //  app.get(it, preseed_gen);
  //});
}
//////////////////// OS INSTALL Main ///////////////////////

function ipaddr_v4(req) {
  var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  console.log("x-forwarded-for: "+req.headers['x-forwarded-for']);
  console.log("connection.remoteAddress: "+req.connection.remoteAddress);
  // localhost shows value "::1"
  if (ip == "::1") { ip = "127.0.0.1"; }
  if (ip.substr(0, 7) == "::ffff:") { ip = ip.substr(7); }
  console.log("ip (before trans): "+ip);
  // We now have the actual client address. See if mapping / translation is needed
  var newip = iptrans[ip];
  if (newip) {
    // Inform at every use of translation
    // console.log();
    console.log("Overriding ip: " + ip + " => " + newip); ip = newip;
    return newip;
  }
  return ip;
}
/** Get Host facts for requesting host (for activities during boot and install, etc).
 * Use following logic:
 * - ...
 * @param req {object} - Node.js http server request
 */
/*
function host_for_request(req, cb) { // UNUSED
  var ip = ipaddr_v4(req);
  return hostcache[ip]; // cb(null, hostcache[ip]);
  // Check also ARP result ? Use await to turn this to syncronous op ?
  //var arp = require('node-arp');
  //arp.getMAC(ipaddr, function(err, mac) {
  //  if (err) { return cb(null, hostcache[ip]); }
  //  re.something = mac; // In case handler wants to DIY (!?)
  //  // Hosts should be 
  //  cb(null, hostcache[mac]);
  //});
}
*/
/** Generate Recipe (e.g. Preseed or KS installation) file based on global settings and host facts.
* Additionally Information for initial user to create is extracted from local
* config file (given by JSON filename in setting global.inst.userconfig, e.g. "userconfig": "initialuser.json",).
* 
* Multiple URL:s are supported by this handler (e.g.) based on URL mappings for this module:
* 
* - /preseed.cfg
* - /ks.cfg
* - ... See module for complete list of examples
* 
* Each of the URL:s will be associated with a template, type label (multiple URL variants can share a template this way).
* 
* Derives the format needed from URL path and outputs the Install configuration in
* valid Preseed or Kickstart format.
* The URL called for each OS install is driven by network bootloader (e.g. pxelinux) menu originated
* kernel command line parameters (e.g. for debian/ubuntu:  url=http://mylineboot:3000/preseed.cfg).
* However it is the OS installer (not bootloader) that calls this URL.
* 
* ## GET Query Parameters supported
* 
* - osid - Hint on operating system type (e.g. `osid=ubuntu18`, used by parameter creation logic)
* - ip - Overriden IP address (wanted for content generation)
* - trim - Clean ouput, no comment lines (mostly for debugging)
* 
* ## URL-to-conftype-to-template Mapping
* 
* Request URL (e.g. /preseed.cfg) determines:
*  - ctype - Config type (e.g. "preseed", "ks", "win", "suse", etc...)
*  - tmpl - Template (e.g. preseed.cfg.mustache)
* 
* # TODO
* 
* Create separate mechanisms for global params templating and hostinfo templating.
*/
function preseed_gen(req, res) {
  var xip = req.query["ip"]; // eXplicit IP
  var ip = ipaddr_v4(req); // Detect IP
  // TODO: Review osid / oshint concept (and for what all it is used (1. Mirrors, 2. ...)
  var osid = req.query["osid"] || global.targetos || "ubuntu18"; // TODO: 1) Later. recipe.osid
  if (xip) { console.log("Overriding ip: " + ip + " => " + xip); ip = xip; }
  // Lookup directly by IP
  var f = hostcache[ip]; // Get facts. Even no facts is ok for new hosts.
  res.type('text/plain');
  // parser._headers // Array
  console.log("preseed_gen: req.headers: ", req.headers);
  console.log("OS Install recipe gen. by (full w. qparams) URL: " + req.url + " (detected ip:"+ip+")"); // osid=
  // OLD location for tmplmap = {}, skip_host_params = {}
  var url = req.route.path; // Base part of URL (No k-v params after "?" e.g. "...?k1=v1&k2=v2" )
  var recipe = recipes_idx[url]; // Lookup recipe
  if (!recipe) { res.end("# No recipe for URL (URLs get (usually) auto assigned, How did you get here !!!)\n"); return }
  var ctype = url_config_type(url); // tmplmap[req.route.path]; // config type
  // TODO: Allow manually authored kickstart, preseed, etc. to come in here
  // Look fname up from host inventory parameters (tmpl=) ? Allow it to be either fixed/literal or template ?
  // Problem: Different for every OS. would need to have as many keys as OS:s
  // var override;
  if (!ctype) { res.end("# Config type ('ctype', ks, preseed, etc.) could not be derived\n"); return; }
  console.log("Concluded config type: '" + ctype + "' for url: "+url);
  ///////////////////// Params Creation /////////////////////////////////
  // Acquire all params and blend them together (into single params structure) for templating.
  // Skipping certain params creation (based on complex conditions) is unnecessary as we can wastefully
  // just create full params even if template does not use them.
  // Consider hostparams based solutions
  // OLD: Generate params, but only if not asked to be skipped
  //BAD:if (p.instrecipe) {} // As-is No templating. Send immmediately - BAD Because we can anyways use hard template
  //MAYBE:else  if (p.insttmpl) {} // Load overriden template - BAD Because cannot hard-wire for arbitrary OS
  //var skip = skip_host_params(url); // skip_host_params[req.route.path];
  var d; // Final template params
  if (url.match(/autounattend/i)) { osid = 'win'; } // mainly for win disk
  if (url.match(/autoinst.xml/i)) { osid = 'suse'; }
  if (url.match(/\buser-data\b/i)) { osid = 'ubuntu20'; } // As this *cannot* be fitted into URL
  var hps = {}; // Host params
  // Note even custom hosts are seen as having facts (as minimal dummy facts are created)
  if (f) { // Added && f because we depend on facts here // OLD: !skip &&
    // If we have facts (registered host), Lookup inventory hostparameters
    // var p = global.hostparams[f.ansible_fqdn]; // f vs. h
    hps = hlr.hostparams(f) || {}; // NEW: lookup !
    d = host_params(f, global, ip,  osid); // ctype,
    if (!d) { var msg = "# Parameters could not be fully derived / decided on\n"; console.log(msg); res.end(msg); return; }
    console.log("Call patch (stage 2 param formulation) ...");
    // Tweaks to params, appending additional lines
    patch_params(d, osid);
  }
  // Dummy params without f - At minimum have a valid object (w. global params)
  // Having 
  // OLD (inside else): d = {httpserver: global.httpserver };
  else {
    // NOT ip ? Why ???!!! Could be of some use even if facts were not gotten by it.
    d = host_params_dummy(global, osid); // NEW
  }
  // Postpone this check to see if facts (f) are needed at all !
  if (!d ) { // && !skip
    var msg2 = "# No IP Address "+ip+" found in host DB (for url: "+url+",  f="+f+")\n"; // skip="+skip+",
    res.end(msg2); // ${ip}
    console.log(msg2); // ${ip}
    // "Run: nslookup ${ip} for further info on host."
    return; // We already sent res.end()
  }
  if (patch_params_custom) { patch_params_custom(d, osid); }
  // Copy "inst" section params to top level for (transition period ?) compatibility !
  params_compat(d);
  d.hps = hps; // Host params !
  if (req.query.json) { return res.json(d); }
  //////////////////// Config Output (preseed.cfg, ks.cfg) //////////////////////////
  //OLD2: var tmplcont = template_content(ctype); // OLD global.tmpls[ctype]; // OLD2: (ctype) => (url)
  // Lookup hostparams to facilitate preseed / debian-installer debugging with hard wired/literal preseeds (from internet)
  var forcefn = (url.match(/preseed.cfg/) && hps.preseed) ? hps.preseed : null;
  if (osid == 'ubuntu20' && hps.subiud) { forcefn = hps.userdata; } // subiquity troubleshoot
  var tmplcont = template_content(url, forcefn); // forcefn => Overriden fn
  if (!tmplcont) { var msg3 = "# No template content for ctype: " + ctype + "\n"; console.log(msg3); res.end(msg3); return; }
  console.log("Starting template expansion for ctype = '"+ctype+"', forced template: "+forcefn); // tmplfname = '"+tmplfname+"'
  var output = Mustache.render(tmplcont, d, d.partials);
  // pp = Post Process (cb)
  if (recipe.pp) { output = recipe.pp(output, d); }
  // Post-process (weed comments and empty lines out )
  var line_ok = function (line) { return !line.match(/^#/) && !line.match(/^\s*$/); };
  var oklines = output.split(/\n/).filter(line_ok);
  oklines.push("# " + oklines.length + " config lines in filterd output");
  console.log("Produced: " + oklines.length + " config directive lines ("+req.route.path+")");
  if (req.query["trim"]) { return res.end(oklines.join("\n")); }
  // text/xml or application/xml
  //if (url.match(/\.xml$/)) { res.type('application/xml'); } // response.set('Content-Type', 'text/xml');
  //console.log(oklines.join("\n"));
  //res.end(oklines.join("\n"));
  res.end(output);
}
//console.log(req); // _parsedUrl.pathname OR req.route.path
// if (req.url.indexOf('?')) { }
//NOT: var ctype = tmplmap[req.url]; // Do not use req.url - contains query parameters
  
/** Do situational and custom patching on params.
* TODO: Separate these as osid specific plugins, where each plugin can do
* patching for os. Some plugins could be user written to facilitate particular
* environment (Also possibly contributed as "useful examples", also possibly
* making their way into this app as toggelable plugins.
* Add here member d.appendcont to produce completely new Preseed / KS. directives.
* @param d {object} - Templating params produced originally in host_params()
* @param osid {string} - linetboot OS id (e.g. ubuntu18, centos6 ...)
* @return None (Only tweak parms object d passed here)
*/
function patch_params(d, osid) {
  console.log("Patching by osid:" + osid);
  if (osid.indexOf("ubuntu14") > -1) {
    // Checked vmlinuz-3.16.0-77-generic to be valid 14.04 kernel, whereas
    // All vmlinuz-4.4.0-*-generic kernels are xenian/16.04 kernels and fail the install
    // Installer talks about 4.4.0-31-generic
    //d.appendcont = "d-i base-installer/kernel/image select vmlinuz-3.16.0-77-generic\n";
    //d.appendcont = "d-i base-installer/kernel/image select vmlinuz-4.4.0-31-generic\n";
  }
  // Centos* TODO: Change groups to be RH Compatible
  //if (osid.indexOf("centos") > -1) {
  if (osid.match(/(centos|redhat)/)) {
    // d.user.groups = ""; // String or array at this point ?
    var net = d.net;
    if (!net) { console.log("No d.net for patching centos (" + osid + ")"); return; }
    // RH and Centos 7 still seems to prefer "em" (Check later ...)
    // values: macaddr, "link" (first link connected to switch), bootif (from pxelinux if IPAPPEND 2 in pxelinux.cfg and BOOTIF set)
    // net.dev = "em" + net.ifnum;
    net.dev = net.macaddress; // net.macaddress set earlier from facts
  }
}
/** Create dummy params (minimal subset) that ONLY depend on global config.
 * This approach is needed for hosts that are being installed and make a http call
 * for dynamic kickstart or preseed (or other recipe), but are NOT known to linetboot by their facts.
 * See host_params() for creating params from facts (for a comparison).
 * @param global {object} - main config
 * @param osid {string} - OS ID label, coming usually from recipe URL on kernel command line (E.g. ...?osid=ubuntu18)
 * @return Made-up host params
 */
function host_params_dummy(global, osid) {
  var net = dclone(global.net);
  var d = dclone(global); // { user: dclone(user), net: net};
  d.net = net;
  d.user = user; // global
  // Make up hostname ???
  // We could also lookup the hostname by ip (if passed), by async. Use await here ?
  net.hostname = "MYHOST-001";
  var gw = net.gateway;
  var iparr = gw.split(/\./);
  iparr[3] = 111;
  net.ipaddress = iparr.join('.'); // Get/Derive from net.gateway ?
  //net.domain 
  net.nameservers = net.nameservers.join(" ");
  
  // NOTE: user.groups Array somehow turns (correctly) to space separated string. Feature of Mustache ?
  //NOT:d.disk = disk;
  /////////////////////////// Mirror - Copy-paste or simplify 
  d.mirror = { "hostname": global.mirrorhost, "directory": "/" + osid }; // osid ? "/ubuntu18"
  d.postscript = global.inst.postscript; // TODO: Can we batch copy bunch of props collectively (We already do, but see timing order)
  
  return d;
}
/** Clone global params and do basic universally applicable setup on them.
* Setup done here should be applicable to all/both use cased "old machine - have facts" and "new machine - don't have facts".
* 
* @param global {object} - Main config
* @param user {object} - initial user object
* @return Install templating params that can be further customized.
*/
function global_params_cloned(global, user) {
  var net = dclone(global.net);
  var d = dclone(global);
  d.net = net;
  d.user = user;
}
// Compatibility-copy install params from "inst" to top level
function params_compat(d) {
  // For now all keys (Explicit: "locale","keymap","time_zone","install_recommends", "postscript")
  if (!d.inst) { return 0; }
  Object.keys(d.inst).forEach((k) => { d[k] = d.inst[k]; });
  // Just before Recipe or JSON params dump delete cluttering parts that will never be used in OS install context.
  // This is also a good note-list of what should likely not be there (in main config) at all.
  // Note: Theoretically customizations might do someting w. groups
  delete(d.groups);
  delete(d.tftp);
  delete(d.hostnames);
  delete(d.ansible);
  delete(d.hostparams);
  delete(d.mirrors);
}
/** Generate host parameters for OS installation.
* Parameters are based on global linetboot settings and host
* specific (facts) settings.
* The final params returned will be directly used to fill the template.
* @param f - Host Facts parameters (from Ansible)
* @param global - Global config parameters (e.g. network info)
* @param ip - Requesting host's IP Address
* 
* @param osid - OS id (, e.g. "ubuntu18", affects mirror choice)
* @return Parameters (structure, somewhat nested, w. sub-sections net, user) for generating the OS Install recipe or
* null to signal immediate termination of recipe generation.
* TODO: Passing osid may imply ctype (and vice versa)
*/
// OLD: @param (after ip) ctype - Configuration type (e.g. ks or preseed, see elswhere for complete list)
function host_params(f, global, ip,  osid) { // ctype,
  var net = dclone(global.net);
  var anet = f.ansible_default_ipv4; // Ansible net info
  // Many parts of recipe creation might need hostparams (hps)
  var hps = hlr.hostparams(f) || {};
  console.log("HPS:",hps);
  if (anet.address != ip) {
    var msg = "# Hostinfo IP and detected ip not in agreement\n";
    res.end(msg); // NOTE NO res !!!!!!
    console.log(msg);
    return null;
  }
  // TODO: Move to net processing (if (ip) {}
  net.ipaddress = ip; 
  net.macaddress = anet ? anet.macaddress : "";
  ////////////////////////// NETWORK /////////////////////////////////////
  console.error("Calling netconfig(net, f) (by: f:" + f + ")");
  netconfig(net, f);
  ///////////////////////// DISK /////////////////////////////////
  // Ansible based legacy calc (imitation of original disk).
  console.error("Calling disk_params(f) (by:" + f + ")");
  var disk = osdisk.disk_params(f);
  
  // NOTE: Override for windows. we detect osid that is "artificially" set in caller as
  // dtype is no more passed here.
  
  // Assemble. TODO: Make "inst" top level
  var d = dclone(global); // { user: dclone(user), net: net};
  // TODO: Make into object, overlay later
  // var di = {parts: null, partials: null, instpartid: 0}
  var parts; var partials; var instpartid;
  var ptt = hps["ptt"] || 'mbr';
  // TODO: Merge these, figure out lin/win (different signature !)
  if (osid.match(/^win/)) {
    
    parts = osdisk.windisk_layout_create(ptt);
    console.log("Generated parts for osid: "+osid+" pt: "+ptt);
    //d.parts = parts;
    partials = osdisk.tmpls; // TODO: merge, not override !
    instpartid = parts.length; // Because of 1-based numbering length will be correct
  }
  if (osid.match(/^suse/)) {
    //MOVED: var ptt = hps["ptt"] || 'mbr';
    parts = osdisk.lindisk_layout_create(ptt, 'suse');
    console.log("Generated parts for osid: "+osid+" pt: "+ptt);
    //d.parts = parts;
    partials = osdisk.tmpls; // TODO: merge, not override !
  }
  // This produces content, not params for partials
  if (osid.match(/ubu/) || osid.match(/deb/)) { // /(ubu|deb)/
    parts = osdisk.lindisk_layout_create(ptt, 'debian');
    var out = osdisk.disk_out_partman(parts);
    console.log("PARTMAN-DISK-INITIAL:'"+out+"'");
    
    out = osdisk.partman_esc_multiline(out);
    console.log("PARTMAN-DISK:'"+out+"'");
    d.diskinfo = out; // Disk Info in whatever format directly embeddable in template
  }
  if (osid.match(/ubuntu20/)) {
    parts = osdisk.lindisk_layout_create(ptt, 'debian');
    var out = osdisk.disk_out_subiquity(parts);
    console.log("SUBIQUITY-DISK-INITIAL:'"+out+"'");
    d.diskinfo = out;
  }
  if (osid.match(/(centos|redhat)/)) {
    parts = osdisk.lindisk_layout_create(ptt, 'centos');
    var out = osdisk.disk_out_ks(parts);
    console.log("KICKSTART-DISK-INITIAL:'"+out+"'");
    d.diskinfo = out;
  }
  d.net = net;
  d.user = user; // global (as-is). TODO: Create password_hashed
  d.disk = disk; // Ansible diskinfo gets put to data structure here, but template decides to use or not.
  // Win
  d.parr = d.parts = parts; // TODO: Fix to singular naming (also on tmpls)
  d.partials = partials; // Suse or Win
  d.instpartid = instpartid; // Win
  // Comment function
  d.comm = function (v)   { return v ? "" : "# "; };
  d.join = function (arr) { return arr.join(" "); }; // Default (Debian) Join
  //if (osid.indexof()) {  d.join = function (arr) { return arr.join(","); } }
  //////////////// Choose mirror (Use find() ?) //////////////////
  console.error("Calling mirror_info(global, osid) (by:" + global + ")");
  var mirror = mirror_info(global, osid) || {};
  d.mirror = mirror;
  return d;
}

function mirror_info(global, osid) {
  var choose_mirror = function (mir) {
    return mir.directory.indexOf(osid) > -1 ? 1 : 0; // OLD: global.targetos
  };
  // For ubuntu / debian set params to use in mirror/http/hostname and mirror/http/directory
  if (global.inst.inetmirror) {
    if (osid.match(/^ubuntu/)) { return {hostname: "us.archive.ubuntu.com", directory: "/ubuntu"}; }
    // See: https://www.debian.org/mirror/list
    // http://ftp.us.debian.org/debian/
    if (osid.match(/^debian/)) { return {hostname: "ftp.us.debian.org", directory: "/debian"}; }
  }
  var mirror = global.mirrors.filter(choose_mirror)[0]; // NOT: Set {} by default
  if (!mirror) {
    console.log("No Mirror"); return null;
  } // NOT Found ! Hope we did not match many either.
  console.log("Found Mirror("+osid+"):", mirror);
  mirror = dclone(mirror); // NOTE: This should already be a copy ?
  // Linetboot or other globally used Mirror
  if (global.mirrorhost && mirror) { mirror.hostname = global.mirrorhost; } // Override with global
  return mirror;
}

/** Configure network params for host.
 * Create netconfig as a blend of information from global network config and hostinfo facts.
 * TODO:
 * - NOT: Take from host facts (f) f.ansible_dns if available !!! Actually f.ansible_dns.nameservers in Ubuntu18
 *   will have systemd originated value '127.0.0.53'
 * - Pass (or enable access) to host params, e.g. for network if name override.
 * - Need to pass also other info (e.g. osid, os hint to make proper decision on interface naming)
 * See also: linetboot.js - netplan_yaml()
*/
function netconfig(net, f) {
  if (!f) { console.log("netconfig: No Facts !"); return net; } // No facts, cannot do overrides
  var anet = f.ansible_default_ipv4; // Ansible Net
  var dns_a = f.ansible_dns; // Has search,nameservers
  
  // Override nameservers, gateway and netmask from Ansible facts (if avail)
  if (dns_a.nameservers && Array.isArray(dns_a.nameservers)) {
    // Dreaded systemd 127.0.0.53
    if ( ! dns_a.nameservers.includes('127.0.0.53')) { net.nameservers = dns_a.nameservers; }
    
  }
  // TODO: net.nameservers_first (Note: s)
  net.nameserver_first = net.nameservers[0]; // E.g. for BSD, that only allows one ?
  net.nameservers_csv  = net.nameservers.join(','); // Account for KS needing nameservers comma-separated
  
  // NOT: net.nameservers = net.nameservers.join(" ");
  net.nameservers_ssv = net.nameservers.join(" ");
  net.nameservers_str = net.nameservers.join(" ");
  //OLD:net.nameservers = net.nameservers.join(" "); // Debian: space separated
  // namesearch
  net.namesearch_str = net.namesearch.join(" ");
  // OLD: if (ctype == 'ks') {  } // Eliminate ctype and "ks", make universal
  
  net.nameserver_first = net.nameservers[0];
  // TODO: net.nameservers_ssv // Space separated values (?)
  if (anet.gateway) { net.gateway = anet.gateway; }
  if (anet.netmask) { net.netmask = anet.netmask; }
  // Domain !
  if (f.ansible_domain) { net.domain = f.ansible_domain; }
  net.hostname = f.ansible_hostname; // What about DNS lookup ?
  //net.dev = anet.interface; // See Also anet.alias
  net.dev = "auto"; // Default ?
  
  // Extract interface (also alias) number !
  // Rules for extraction:
  // - We try to convert to modern 1 based (post eth0 era, interfaces start at 1) numbering 
  var ifnum; var marr;
  if      ( (marr = anet.interface.match(/^eth(\d+)/)) )      { ifnum = parseInt(marr[1]); ifnum++; } // Old 0-based
  
  else if ( (marr = anet.interface.match(/^(em|eno)(\d+)/)) ) { ifnum = parseInt(marr[2]); } // New 1-based
  else { console.log("None of the net-if patterns matched: " + anet.interface); ifnum = 1; } // Guess / Default
  net.ifnum = ifnum;
  console.log("netconfig: ", net);
  return net; // ???
}
// OLD: Disks

////// Scripts and templating //////////////
// Little nodepad type list of scripts
// 
var scriptnames = [
 "http_w_mac.sh", "linetboot.service", "mv_homedir_for_autofs.sh",  "preseed_net_restart.sh",  "sources.list",  "start.cmd"
];
/** Send a shell script / commands (or any text content) using HTTP GET.
 * The express URL pattern must be of form: "/scripts/:filename" making filename parameter
 * be available in req.params.filename.
* TODO: Make this pull content from some add-on / misc directory (probably other than tmpl, rename to )
*
* This was initially created for a well known hacky workaround to allow preseeding
* to reconfigure network after initial chicken and egg problem with network -
* network must be configured to fetch preseed, which contains network config.
* This script kills dhcp networking and reconfigures network.
* 
* Now network restart has been moved to external file and script_send() also delivers lot of other
* installation related scripts.
*/
function script_send(req, res) {
  // #!/bin/sh\n
  var xip = req.query["ip"];
  var ip = ipaddr_v4(req);
  if (xip) { console.log("Overriding ip: " + ip + " => " + xip); ip = xip; }
  var url = req.url;
  var fname = req.params.filename;
  
  console.log("Send Script with fname '"+fname+"' to " + ip);
  var f = hostcache[ip];
  res.type("text/plain");
  // TODO: Create later a smarter data driven solution
  // if (fname == 'preseed_dhcp_hack.sh') { res.send("kill-all-dhcp; netcfg\n"); return; }
  // Configurable script directory. TODO: Multiple paths, resolve
  // process.env["LINETBOOT_SCRIPT_PATH"] ||
  var spath =  global.inst.script_path || "./scripts/";
  // OLD: var fullname = spath + fname;
  // NEW: Resolve by:
  var fullname = hlr.file_path_resolve(fname, global.inst.script_path);
  if (!fs.existsSync(fullname)) { res.send("# Hmmm ... No such script file.\n"); return; }
  var cont = fs.readFileSync(fullname, 'utf8');
  var tpc = needs_template(cont);
  // Lookup host params as "potentially useful" (each tpc-case still decides on them)
  var hps = hlr.hostparams(f) || {};
  
  if (tpc) {
    console.error("need templating w." + tpc);
    var p = {};
    var np = require("./netprobe.js"); // .init(...) Rely on earlier init(), but has init-guard
    if (tpc == 'user') { p = dclone(user); p.httpserver = global.httpserver;
      // SSH Keys (also host) ?
      p.linet_sshkey = np.pubkey();
      p.linet_sshkey = p.linet_sshkey.replace(/\s+$/, "");
      var hk = fs.readFileSync("/etc/ssh/ssh_host_rsa_key.pub", 'utf8');
      if (hk) { hk = hk.replace(/\s+$/, ""); p.linet_hostkey = hk; }
      // Add host params
      
      p.hps = hps;
      // See NIS info -  "nisservers", "nisdomain" from global.net
      p.nisservers = global.net.nisservers || [];
      p.nisdomain  = hps.nis || global.net.nisdomain || "";
      p.nisamm     = hps.nisamm || global.net.nisamm || "auto.master"; // Fall to empty, let script defaut ?
    }
    if (tpc == 'net') {
      p = dclone(global.net);
      //p.httpserver = global.httpserver; // Complement w. universally needed var
      if (f) {
        var anet = f.ansible_default_ipv4 || {};
        // p.httpserver = 
        p.ipaddress = anet.address; p.hostname = f.ansible_hostname; p.macaddr = anet.macaddress;
        console.log("Net-context: "+p);
      }
      // Already have NIS servers if needed ...
    } // TODO: adjust
    if (tpc == 'global') { p = global; }
    // Custom ... how to formulate this into more static config ? clone global and add ?
    if (tpc == 'sysinfo') {
      // process.getgid(); // Need to translate
      p = {linetapproot: process.cwd(), linetuser: process.env["USER"], linetgroup: process.getgid(), linetnode: process.execPath};
    }
    // Universal setup
    if (p.nisservers) { p.nisservers = p.nisservers.join(' '); }
    if (f && f.ansible_distribution) { p.distro = f.ansible_distribution; } // Others: ansible_os_family
    p.httpserver = global.httpserver;
    // console.error("Params: ", p);
    cont = Mustache.render(cont, p); // partials for complex scripts ? In that case should cache partials
  }
  //else { console.error(fname + " - No need for templating"); }
  if (cont) { res.send(cont); return; }
  res.send("# Hmmm ... Unknown file.\n");
}
/** Detect if file needs template processing by special tagging placed in file.
* The tagging also indicates what kind of template parameter context is needed.
* Example tagging:
* 
*      TEMPLATE_WITH: hosts
* 
* @param {string} content - Template (file) content as string.
* @return Templating context, which will also be true value for "needs template processing" and false
* (no templating context) for no templating needed. In the example above "hosts" would be returned.
*/
function needs_template(cont) {
  if (!cont) { return null; }
  var arr = cont.split(/\n/);
  var marr;
  // TODO: run on str, no need to split.
  // var marr = cont.match(/\bTEMPLATE_WITH:\s+(\w+)/);
  // if (marr ) { return marr[1]; }
  var tcs = arr.map(function (l) { return (marr = l.match(/.+TEMPLATE_WITH:\s+(\w+)/)) ? marr[1] : false; })
    .filter(function ( it ) { return it; });
  if (!tcs.length) { return null; }
  if (tcs.length > 1) { console.error("Ambiguous TEMPLATE_WITH tagging ...."); return null; }
  return tcs[0];
}
/** Produce a listing of Recipes.
 * Let recipes (module variable) drive the generation of grid.
 */
function recipe_view(req, res) {
  var hostfld = {name: "hname", title: "Host", type: "text", css: "hostcell", width: 200};
  var grid = [hostfld]; // Grid def
  // var keys = Object.keys(tmplmap);
  var urls = []; // Add various URL:s from structure
  // OLD: keys. NEW: recipes.
  recipes.forEach((k) => { // OLD: k == URL NEW: k == Object 
    //var fld = {name: tmplmap[k],  title: tmplmap[k], type: "text", width: 80, itemTemplate: null};
    var fld = {name: k.ctype, title: k.ctype, type: "text", width: 80, itemTemplate: null}
    // Add to URL:s and Grid cols side-by-side
    //urls.push(k); // OLD
    urls.push(k.url);
    grid.push(fld);
  });
  res.json({status: "ok", grid: grid, urls: urls, data: [], rdata: recipes, scriptnames: scriptnames});
}

module.exports = {
  init: init,
  url_hdlr_set: url_hdlr_set,
  ipaddr_v4: ipaddr_v4,
  // 
  preseed_gen: preseed_gen, // Calls a lot of locals
  
  script_send: script_send,
  netconfig: netconfig,
  
  recipe_view: recipe_view,
  // Disk
  // OLD: disk_params: disk_params,
  //OLD: diskinfo: diskinfo
  //scriptnames: scriptnames
};
