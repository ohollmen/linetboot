/** @file
 * OS Installations recipe generation and disk recipe calculations
 * 
 * ## Needs from main server
 * - hostcache
 * - mod - Custom setup module or single params patcher cb
 * - iptrans
 * - global
 * - user
 * - 
 * ## Potential funcs to move
 * {
 * ipaddr_v4 ( ~ l. 328)
 * host_for_request  UNUSED
 * preseed_gen
 * patch_params - TODO: Plugin !
 * host_params_dummy
 * global_params_cloned (Unused ?)
 * params_compat
 * host_params
 * }
 * disk_params DONE
 * disk_calc_size ( ~ l. 702) DONE
 * ------ Lot of subs ----
 * netplan_yaml (~ l. 860)
 * script_send
 * needs_template (~l. 1020)
 * # TODO
 * - Possibly load initial user here, keep as priv variable ?
 */
var fs = require("fs");
var Mustache = require("mustache");

function dclone(d) { return JSON.parse(JSON.stringify(d)); }
// https://stackabuse.com/using-global-variables-in-node-js/
var hostcache = {};
var iptrans = {};
var global = {};
var user = {};
var patch_params; // CB

// Map URL to symbolic template name needed. template names get mapped by global.tmplfiles (Object-map, See main config)
// {url: ..., ctype: ..., tmpl: "", nopara: ...}
// The value of the map is "ctype" (for "config type")
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
   "/cust-install.cfg": "xxx",
   // https://wiki.ubuntu.com/FoundationsTeam/AutomatedServerInstalls
   // https://github.com/CanonicalLtd/subiquity/tree/master/examples
   // https://wiki.ubuntu.com/FoundationsTeam/AutomatedServerInstalls/QuickStart
   // "":"", // Ubuntu 20.04 YAML
   // "autounattend.xml" // Windows
   // https://www.packer.io/guides/automatic-operating-system-installs/autounattend_windows
   // https://github.com/StefanScherer/packer-windows
   "/Autounattend.xml": "win"
//];
};
// TODO: Create tmplmap (k-v) here for compat.
// ctype => tmplfile
var tmplfiles = {
    "preseed": "./tmpl/preseed.cfg.mustache",
    "ks":      "./tmpl/ks.cfg.mustache",
    "netif":   "./tmpl/interfaces.mustache",
    "netw_rh": "./tmpl/sysconfig_network.mustache",
    "preseed_dt": "./tmpl/preseed.desktop.cfg.mustache",
    "preseed_mini": "./tmpl/preseed_mini.cfg.mustache",
    "pcbsd":   "tmpl/pcinstall.cfg.mustache",
    // "win": "", // mime: "text/xml"
  };
var tmpls = {};
// TODO: Move to proper entries (and respective prop skip) in future templating AoO. Create index at init.
var _skip_host_params = {"/preseed.desktop.cfg": 1, "/preseed_mini.cfg": 1};
  

var tmplmap_idx = {}; // By URL !
// tmpls.forEach((it) => { tmplmap_idx[it.url] = it; });

// Pass url as req.route.path
function url_config_type(url) {
  return tmplmap[url];
}
// req.route.path
function skip_host_params(url) {
  return _skip_host_params[url];
}
function template_content(ctype) {
  return tmpls[ctype]; // OLD: global.tmpls
  // NEW: On demand
  var fn = ""; // recipe.tmpl;
  if (!fs.existsSync(fn)) { return ""; }
  return fs.readFileSync(fn, 'utf8');
}
//////// cache templates into memory //////
function templates_load() {
  // 
  var tkeys = Object.keys(tmplfiles); // OLD: global.tmplfiles
  tkeys.forEach(function (k) {
    // TODO: try/catch
    var fn = tmplfiles[k]; // OLD: global.tmplfiles
    if (!fn) { return; }
    if (!fs.existsSync(fn)) { return; }
    tmpls[k] = fs.readFileSync(fn, 'utf8'); // OLD: global.tmpls
    
  });
  console.error("loaded " + tkeys.length + " templates.");
}
/** 
 */
function init(conf, _patch_params) {
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
  if (_patch_params) { console.log("Got patch_params customization CB"); patch_params = _patch_params; }
  
  templates_load(); // Keep after assigning "global"
}

/** Set URL handlers for all recipe URL:s.
 * @param app {object} - Express App.
 */
function url_hdlr_set(app) {
  var urls = [];
  urls = Object.keys(tmplmap);
  urls.forEach(function (it) {
    console.log("Recipe-URL: "+it);
    app.get(it, preseed_gen); // TODO: it.url
  });
}
//////////////////// OS INSTALL Main ///////////////////////

function ipaddr_v4(req) {
  var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  if (ip.substr(0, 7) == "::ffff:") { ip = ip.substr(7); }
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
/** Generate Preseed or KS installation file based on global settings and host facts.
* Additionally Information for initial user to create is extracted from local
* config file (given by JSON filename in setting global.inst.userconfig, e.g. "userconfig": "initialuser.json",).
* Multiple URL:s are supported by this handler (e.g.) based on URL mappings for this module:
* 
* - /preseed.cfg
* - /ks.cfg
* - ... See module for complete list of examples
* 
* Each of the URL:s can be associated with a template (multiple URL variants may also share a template).
* 
* Derives the format needed from URL path and outputs the Install configuration in
* valid Preseed or Kickstart format.
* The URL called for each install is driven by network bootloader (e.g. pxelinux) menu originated
* kernel command line parameters (e.g. for debian/ubuntu:  url=http://mylineboot:3000/preseed.cfg)
* 
* ## GET Query Parameters supported
* 
* - osid - Hint on (e.g. `osid=ubuntu18`)
* - ip - Overriden IP address (wanted for content generation)
* - trim - Clean ouput, no comment lines (for debugging)
* 
* ## URL-to-conftype-to-template Mapping
* 
*      Request URL (e.g. /preseed.cfg)
*             | (in code)
*             V
*      Conftype (e.g. "preseed")
*             | (global-conf)
*             V
*      Template (e.g. ./tmpl/preseed.cfg.mustache)
* 
* #### Request Headers from installers
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
* # TODO
* 
* Create separate mechanisms for global params templating and hostinfo templating.
*/
function preseed_gen(req, res) {
  // OLD: Translate ip to name to use for facts file name
  // Lookup directly by IP
  var xip = req.query["ip"];
  var ip = ipaddr_v4(req);
  // TODO: Review osid / oshint concept (and for what all it is used (1. Mirrors, 2. ...)
  var osid = req.query["osid"] || global.targetos || "ubuntu18";
  if (xip) { console.log("Overriding ip: " + ip + " => " + xip); ip = xip; }
  var f = hostcache[ip]; // Get facts. Even no facts is ok for new hosts.
  
  // parser._headers // Array
  console.log("preseed_gen: req.headers: ", req.headers);
  console.log("Preseed or KS Gen by (full w. qparams) URL: " + req.url + "(ip:"+ip+")"); // osid=
  // OLD location for tmplmap = {}, skip_host_params = {}
  
  //console.log(req); // _parsedUrl.pathname OR req.route.path
  // if (req.url.indexOf('?')) { }
  //NOT: var ctype = tmplmap[req.url]; // Do not use req.url - contains query parameters
  var url = req.route.path; // Base part of URL (No k-v params after "?" e.g. "...?k1=v1&k2=v2" )
  var ctype = url_config_type(url); // tmplmap[req.route.path]; // config type
  // TODO: Allow manually authored kickstart, preseed, etc. to come in here
  // Look fname up from host inventory parameters. Allow it to be either fixed/literal or template ?
  var override;
  if (!ctype) {
    // Lookup inventory hostparameters
    // var p = global.hostparams[h.ansible_fqdn]; // f vs. h
    //if (p.instrecipe) {} // As-is No templating. Send immmediately
    //else  if (p.insttmpl) {} // Load overriden template 
    res.end("# Config type (ks, preseed, etc.) could not be derived\n");
    return;}
  console.log("Concluded config type: " + ctype + " for url "+req.route.path);
  // Acquire all params and blend them together for templating.
  
  var skip = skip_host_params(url); // skip_host_params[req.route.path];
  var d; // Final template params
  // Generate params, but only if not asked to be skipped
  if (!skip && f) { // Added && f because we depend on facts here
    d = host_params(f, global, ip,  osid); // ctype,
    if (!d) { var msg = "# Parameters could not be fully derived / decided on\n"; console.log(msg); res.end(msg); return; }
    console.log("Call patch ...");
    patch_params(d, osid); // Tweaks to params, appending additional lines
  }
  // Dummy params - At minimum have a valid object (w. global params)
  else {
    //d = {httpserver: global.httpserver };
    // NOT ip ?
    d = host_params_dummy(global, osid); // NEW
  }
  // Postpone this check to see if facts (f) are needed at all !
  if (!d && !skip) {
    var msg2 = "# No IP Address "+ip+" found in host DB (for url: "+req.route.path+", skip="+skip+", f="+f+")\n";
    res.end(msg2); // ${ip}
    console.log(msg2); // ${ip}
    // "Run: nslookup ${ip} for further info on host."
    //return;
  }
  // Copy "inst" section params for (transition period) compatibility !
  params_compat(d);
  //////////////////// Config Output (preseed.cfg, ks.cfg) //////////////////////////
  var tmplcont = template_content(ctype); // global.tmpls[ctype];
  if (!tmplcont) { var msg3 = "# No template content for ctype: " + ctype + "\n"; console.log(msg3); res.end(msg3); return; }
  console.log("Starting template expansion for ctype = '"+ctype+"', ..."); // tmplfname = '"+tmplfname+"'
  var output = Mustache.render(tmplcont, d);
  // Post-process (weed comments and empty lines out )
  var line_ok = function (line) { return !line.match(/^#/) && !line.match(/^\s*$/); };
  var oklines = output.split(/\n/).filter(line_ok);
  oklines.push("# " + oklines.length + " config lines in filterd output");
  console.log("Produced: " + oklines.length + " config directive lines ("+req.route.path+")");
  if (req.query["trim"]) { return res.end(oklines.join("\n")); }
  //console.log(oklines.join("\n"));
  //res.end(oklines.join("\n"));
  res.end(output);
}

/** Do situational and custom patching on params.
* TODO: Separate these as osid specific plugins, where each plugin can do
* patching for os. Some plugins could be user written to facilitate particular
* environment (Also possibly contributed as "useful examples", also possibly
* making their way into this app as toggelable plugins.
* Add here member d.appendcont to produce completely new Preseed / KS. directives.
* @param d {object} - Templating params produced originally in host_params()
* @param osid {string} - linetboot OS id (e.g. ubuntu18, centos6 ...)
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
  if (osid.indexOf("centos") > -1) {
    // d.user.groups = ""; // String or array at this point ?
    var net = d.net;
    if (!net) { console.log("No d.net for patching centos (" + osid + ")"); return; }
    // RH and Centos 7 still seems to prefer "em" (Check later ...)
    net.dev = "em" + net.ifnum;
  }
}
/** Create dummy params (minimal subset) that ONLY depend on global config.
 * This approach is needed for hosts that are being installed and make a http call
 * for dynamic kickstart or preseed (or other recipe), but are NOT known to linetboot by their facts.
 * See host_params() for creating params from facts (for a comparison).
 * @param global {object} - main config
 * @param osid {string} - OS ID label (...)
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
  d.postscript = global.inst.postscript; // TODO: Can we batch copy bunch of props collectively
  
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
* @return Parameters (structure, somewhat nested, w. sub-sections net, user) for generating the preseed or ks output.
* TODO: Passing osid may imply ctype (and vice versa)
*/
// OLD: @param (after ip) ctype - Configuration type (e.g. ks or preseed, see elswhere for complete list)
function host_params(f, global, ip,  osid) { // ctype,
  var net = dclone(global.net);
  var anet = f.ansible_default_ipv4; // Ansible net info
  if (anet.address != ip) {
    var msg = "# Hostinfo IP and detected ip not in agreement\n";
    res.end(msg); // NOTE NO res !!!!!!
    console.log(msg);
    return null;
  }
  net.ipaddress = ip; // Move to net processing (if (ip) {}
  ////////////////////////// NETWORK /////////////////////////////////////
  console.error("Calling netconfig(f) (by:" + f + ")");
  netconfig(net, f);
  ///////////////////////// DISK /////////////////////////////////
  // Disk logic was embedded here
  console.error("Calling disk_params(f) (by:" + f + ")");
  // var hdisk = require("./hostdisk.js");
  var disk = disk_params(f);
  // Assemble. TODO: Make "inst" top level
  var d = dclone(global); // { user: dclone(user), net: net};
  d.net = net;
  d.user = user; // global (as-is). TODO: Create password_hashed
  d.disk = disk; // Gets put to data structure here, but template decides to use or not.
  // Comment function
  d.comm = function (v)   { return v ? "" : "# "; };
  d.join = function (arr) { return arr.join(" "); }; // Default (Debian) Join
  //if (osid.indexof()) {  d.join = function (arr) { return arr.join(","); } }
  //////////////// Choose mirror (Use find() ?) //////////////////
  var choose_mirror = function (m) {
    return m.directory.indexOf(osid) > -1 ? 1 : 0; // OLD: global.targetos
  };
  var mirror = global.mirrors.filter(choose_mirror)[0];
  if (!mirror) { console.log("No Mirror"); return null; } // NOT Found ! Hope we did not match many either.
  console.log("Found Mirror("+osid+"):", mirror);
  mirror = dclone(mirror); // NOTE: This should already be a copy ?
  if (global.mirrorhost) { mirror.hostname = global.mirrorhost; } // Override with global
  d.mirror = mirror;
  return d;
}

// Configure network
  // TODO: Take from host facts (f) f.ansible_dns if available !!!
  // Create netconfig as a blend of information from global network config
  // and hostinfo facts.
function netconfig(net, f) {
  if (!f) { return; } // No facts, cannot do overrides
  var anet = f.ansible_default_ipv4;
  var dns_a = f.ansible_dns; // Has search,nameservers
  
  net.nameservers = net.nameservers.join(" "); // Debian: space separated
  // Override nameservers, gateway and netmask from Ansible facts (if avail)
  if (dns_a.nameservers && Array.isArray(dns_a.nameservers)) {
    net.nameservers = dns_a.nameservers.join(" ");
  }
  // Account for KS needing nameservers comma-separated
  // OLD: if (ctype == 'ks') {  } // Eliminate ctype and "ks", make universal
  net.nameservers_csv = net.nameservers.replace(' ', ',');
  if (anet.gateway) { net.gateway = anet.gateway; }
  if (anet.netmask) { net.netmask = anet.netmask; }
  // Domain !
  if (f.ansible_domain) { net.domain = f.ansible_domain; }
  net.hostname = f.ansible_hostname; // What about DNS lookup ?
  //net.dev = anet.interface; // See Also .alias
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

//////////////////////////// Disk //////////////////////////

/** Generate Disk parameters for super simple disk layout: root+swap (and optional boot).
  * Calculate disk params based on the facts.
  * The unit on numbers is MBytes (e.g. 32000 = 32 GB)
  * See facts sections: ansible_device_links ansible_devices ansible_memory_mb
  * @param f {object} - Ansible facts (w. ansible_devices, ansible_memory_mb, ... on top level).
  * @return Disk Object (To convert to disk recipe format by caller)
  * 
  * @todo Allow output generation in various unattended install recipe formats
  * - Debian/Ubuntu
  * - RH kickstart
  * - Windows Autounattend.xml (XML Section "DiskConfiguration")
  * - Pass default disk template here, that may be returned if heuristics fail (?)
  * - Pass default disk device (e.g 'sda' when hard default 'sda' is not avail.)
  */
  function disk_params (f) { // Export
    var disk = {rootsize: 40000, swapsize: 8000, bootsize: 500}; // Safe undersized defaults in case we return early (should not happen)
    if (!f) { return disk; }
    var ddevs = f.ansible_devices;
    var mem = f.ansible_memory_mb;
    if (!ddevs) { return disk; }
    if (!mem || !mem.real || !mem.real.total) { return disk; }
    var memtot = mem.real.total; // In MB
    console.log("Got devices: " + Object.keys(ddevs));
    var sda = ddevs.sda;
    if (!sda) { console.error("Weird ... Machine does not have disk 'sda' !"); return disk; }
    var disktot = disk_calc_size(sda);
    ///////////////////// Calc root, swap as function of disktot, memtot /////////////////////
    if (memtot > disktot) { console.error("Warning: memory exceeds size of disk !"); return disk; }
    var rootsize = (disktot - memtot);
    // Memory is over 20% of disk, reduce 
    if ((memtot/disktot) > 0.20) { rootsize = 0.80 * disktot; }
    // Set final figures
    disk.rootsize = rootsize;
    disk.swapsize = (disktot - rootsize - disk.bootsize - 1000); // Need to schrink a bit furter.
    console.error("Calculated Disk Plan:", disk);
    return disk;
  }
  /** Compute size of a disk from its partitions (within facts)
  * Lower level task called by disk_params()
  * @param sda {object} - Disk Object (containing partitions ...)
  * @return size of the disk.
  */
  function disk_calc_size(sda) { // Internal
    var unitfactor = { "GB": 1000, "MB": 1, "KB": 0.1 };
    if (!sda) { return 0; }
    var parts = sda.partitions;
    var pnames = Object.keys(parts);
    console.error("Got disk parts: " + pnames);
    var disktot = 0;
    for (var i in pnames) {
      var pn = pnames[i]; // e.g. sda1
      var part = parts[pn];
      //console.log(pn); continue; // DEBUG
      marr = part.size.match(/^([0-9\.]+)\s+([KMGB]+)/);
      console.log(marr + " len:" + (marr ? marr.length: "None"));
      if (marr && (marr.length == 3)) {
        var sf = parseFloat(marr[1]);
        var uf = unitfactor[marr[2]];
        if (!uf) { console.error("Weird unit: " + marr[2]); continue; }
        disktot += (sf * uf);
      }
    }
    return disktot;
  }

////// Scripts and templating //////////////

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
  var ip = ipaddr_v4(req);
  var url = req.url;
  var fname = req.params.filename;
  
  console.log("Send Script with fname "+fname+" to " + ip);
  res.type("text/plain");
  // TODO: Create later a smarter data driven solution
  // if (fname == 'preseed_dhcp_hack.sh') { res.send("kill-all-dhcp; netcfg\n"); return; }
  // TODO: Configurable script directory
  var spath = process.env["LINETBOOT_SCRIPT_PATH"] || global.inst.script_path || "./scripts/";
  var fullname = spath + fname;
  if (!fs.existsSync(fullname)) { res.send("# Hmmm ... No such script file.\n"); return; }
  var cont = fs.readFileSync(fullname, 'utf8');
  var tpc = needs_template(cont);
  if (tpc) {
    console.error("need templating w." + tpc);
    var p = {};
    if (tpc == 'user') { p = user; }
    if (tpc == 'net') { p = global.net; } // TODO: adjust
    // console.error("Params: ", p);
    cont = Mustache.render(cont, p);
  }
  //else { console.error("No need for templating"); }
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

module.exports = {
  init: init,
  url_hdlr_set: url_hdlr_set,
  ipaddr_v4: ipaddr_v4,
  // 
  preseed_gen: preseed_gen, // Calls a lot of locals
  disk_params: disk_params,
  script_send: script_send
};
