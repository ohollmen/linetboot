/** @file

 Netboot server for Installation of OS
 Author Copyright: Olli Hollmen 2018
 
 # Generate content w. mustache CL utility
 
 cat initialuser.json | ./node_modules/mustache/bin/mustache - ./tmpl/preseed.cfg.mustache
 
 # Testing Static content (e.g. OS Image) delivery
 
 cd /tmp
 md5sum /boot/memtest86+.bin
 wget http://localhost:3000/memtest86+.bin
 md5sum memtest86+.bin
 
 # Allow use as component
 Need to set headers (Taken from Docker sent headers):
 Access-Control-Allow-Headers: Origin, X-Requested-With, Content-Type, Accept, X-Registry-Auth
 Access-Control-Allow-Methods: HEAD, GET, POST, DELETE, PUT, OPTIONS
 Access-Control-Allow-Origin: *
*/
"use strict;";
// 'esversion: 6';
// Use Mustache for some level of j2 compatibility
var Mustache = require("mustache");
var fs      = require("fs");
var express = require('express');
var yaml    = require('js-yaml');
var cproc   = require('child_process');
var async   = require('async');
var bodyParser = require('body-parser');
var axios   = require("axios");
// Configurations
// var nb      = require("./netboot.json"); // Not used.
var globalconf = process.env["LINETBOOT_GLOBAL_CONF"] || "./global.conf.json";
var global   = require(globalconf);
var userconf = process.env["LINETBOOT_USER_CONF"] || global.userconfig || "./initialuser.json";
var user     = require(userconf);
var hlr      = require("./hostloader.js");
var netprobe = require("./netprobe.js");
var ans      = require("./ansiblerun.js");
var ospkgs   = require("./ospackages.js");
var ipmi     = require("./ipmi.js");
user.groups  = user.groups.join(" ");
global.tmpls = {};
// IP Translation table for hosts that at pxelinux DHCP stage got IP address different
// from their DNS static IP address (and name). This only gets loaded by request via Env.variable
var iptrans = {};
var app = express(); // Also: var server = ...
// var io = require('socket.io')(app);
var port = 3000; // TODO: Config
var fact_path;
var hostcache = {};
var hostarr = [];

app.use(bodyParser.json({limit: '1mb'}));

/** Initialize Application / Module with settings from global conf.
* @param cfg {object} - Global linetboot configuration
* @todo Perform sanity checks in mirror docroot.
*/
function app_init(global) {
  /** Modules */
  app.set('json spaces', 2);
  /////// Misc init():s ////////////////
  // {tout: (global.probe ? global.probe.tout : 0)}
  netprobe.init(global.probe);
  ipmi.init(global);
  //app.use(express.static('pkgcache'));
  // Express static path mapping
  // Consider: npm install serve-static
  //app.use('/ubuntu', express.static('public'))
  //app.use('/static', express.static(path.join(__dirname, 'public')))
  // Note: Mapping does NOT serve directories.
  // Test with /ubuntu/md5sum.txt (Works ok)
  // NOTE: express.static(usr, path, conf) can take 3rd conf parameter w.
  // "setHeaders": function (res,path,stat) {}
  
  var logger = function (res,path,stat) {
    console.log("Sent file in path: " + path + " w. stat:");
    console.log(stat); // Stat Object
  };
  var staticconf = {"setHeaders": logger };
  // TODO: Evaluate this (https://stackoverflow.com/questions/10849687/express-js-how-to-get-remote-client-address)
  // app.set('trust proxy', true); // relates to req.header('x-forwarded-for') ?
  // Note this URL mapping *can* be done by establishing symlinks from
  // global.maindocroot
  /*
  if (global.useurlmapping) {
  console.log("URL Mappings (url => path):");
  global.mirrors.forEach(function (mirror) {
    //TODO: var urlpath = "/" + mirror.directory; // osid
    app.use(mirror.directory, express.static(mirror.docroot));
    console.log("" + mirror.directory + " => " + mirror.docroot + "   " +
       "ln -s " + mirror.docroot + " " + mirror.directory + " # Strip slash");
  });
  
  } // end if
  // Advice to setup symlinks under docroot
  else {
    global.mirrors.forEach(function (mirror) {
      var url = mirror.directory;
      // url.replace();
    });
  }
  */
  
  // For kernel and initrd (/linux, /initrd.gz) respectively
  // Installer Kernel and Initrd from mirror area (CD/DVD)
  // global.mirror.docroot
  // For local disk boot (recent) kernels and network install as well
  //global.maindocroot = "/isomnt/";
  if (!fs.existsSync(global.maindocroot)) { console.error("Main docroot '"+global.maindocroot+"' does not exist"); process.exit(1); }
  // Main docroot
  app.use(express.static(global.maindocroot)); // e.g. /var/www/html/ or /isomnt/
  // For Opensuse ( isofrom_device=nfs:...) and FreeBSD (memdisk+ISO) Distors that need bare ISO image (non-mounted).
  app.use(express.static("/isoimages"));
  app.use('/web', express.static('web')); // Host Inventory
  ///////////// Dynamic content URL:s (w. handlers) //////////////
  ////////////////////// Installer ///////////////////////////////////
  // preseed_gen - Generated preseed and kickstart shared handler
  app.get('/preseed.cfg', preseed_gen);
  app.get('/ks.cfg', preseed_gen);
  app.get('/preseed.desktop.cfg', preseed_gen);
  app.get('/preseed_mini.cfg', preseed_gen);
  // BSD (by doc '/boot/pc-autoinstall.conf' will be looked up from "install medium")
  app.get('/boot/pc-autoinstall.conf', preseed_gen);
  app.get('/cust-install.cfg', preseed_gen);
  // Network configs (still same handler)
  app.get('/sysconfig_network', preseed_gen);
  app.get('/interfaces', preseed_gen);
  ////////////////////
  // Install event logger (evtype is start/done)
  app.get('/installevent/:evtype', oninstallevent); // /api/installevent
  // Netplan (custom YAML based handler)
  app.get('/netplan.yaml', netplan_yaml);
  // Scipts & misc install data (e.g sources.list)
  //app.get('/preseed_dhcp_hack.sh', script_send);
  //app.get('/sources.list', script_send);
  // New generic any-script handler
  app.get('/scripts/:filename', script_send);
  ////////////////////////////// SSH/Other ///////////////////////////
  // SSH Key delivery
  app.get('/ssh/keylist', ssh_keys_list); // Must be first !
  app.get('/ssh/:item', ssh_key);
  
  ////////////////// Host Info Viewer (/web) /////////////////////////
  app.get('/list', hostinfolist);
  app.get('/list/:viewtype', hostinfolist);
  // Package stats (from ~/hostpkginfo or path in env. PKGLIST_PATH)
  app.get('/hostpkgcounts', pkg_counts);
  app.get('/hostcpucounts', hostp_prop_stat);
  app.get('/hostpkgstats', host_pkg_stats);
  // Group lists
  app.get('/groups', grouplist);
  // Commands to list pkgs
  app.get('/allhostgen/:lbl', gen_allhost_output);
  app.get('/allhostgen', gen_allhost_output);
  // rmgmt_list
  app.get('/hostrmgmt', rmgmt_list);
  app.get('/nettest', nettest);
  app.get('/proctest', proctest);
  // Ansible
  app.post('/ansrun', ansible_run_serv);
  app.get('/anslist/play', ansible_plays_list);
  app.get('/anslist/prof', ansible_plays_list);
  // NFS/Showmounts
  
  app.get('/showmounts/:hname', showmounts);
  // Redfish Info or Reboot /rf/boot/, /rf/info
  app.get('/rf/:op/:hname', host_reboot);
  // RF Test URL/handler
  //app.post('/rf/boot/:hname', reboot_test); // For testing
  
  app.post('/redfish/v1/Systems/1/:hname', reboot_test); // For testing
  app.get('/redfish/v1/Systems/1/:hname', reboot_test); // For testing
  
  app.get("/dockerenv", dockerenv_info);
  app.get("/config", config_send);
  app.get("/install_boot", installrequest);
  //////////////// Load Templates ////////////////
  var tkeys = Object.keys(global.tmplfiles);
  tkeys.forEach(function (k) {
    // TODO: try/catch
    var fn = global.tmplfiles[k];
    if (!fn) { return; }
    if (!fs.existsSync(fn)) { return; }
    global.tmpls[k] = fs.readFileSync(fn, 'utf8');
    
  });
  console.error("loaded " + tkeys.length + " templates.");
  fact_path = process.env["FACT_PATH"] || global.fact_path;
  //console.log(process.env);
  if (!fact_path) { console.error("Set: export FACT_PATH=\"...\" in env !"); process.exit(1);}
  if (!fs.existsSync(fact_path)) { console.error("FACT_PATH "+fact_path+" does not exist"); process.exit(1);}
  global.fact_path = fact_path; // Store final in config
  ///////////// Hosts and Groups (hostloader.js) ////////////////////
  
  hlr.init(global, {hostcache: hostcache, hostarr: hostarr});
  hlr.hosts_load(global);
  hlr.facts_load_all();
  
  /* Load IP Translation map if requested by Env. LINETBOOT_IPTRANS_MAP (JSON file) */
  var mfn = process.env["LINETBOOT_IPTRANS_MAP"];
  if (mfn && fs.existsSync(mfn)) {
    iptrans = require(mfn); // TODO: try/catch ?
    console.error("Loaded " + mfn + " w. " + Object.keys(iptrans).length + " mappings");
  }
  
  if (global.customhosts) {
    hlr.customhost_load(global.customhosts, global, iptrans);
  }
  //////////////// Groups /////////////////
  // If lineboot config has dynamic "groups" rules defined, collect group members into
  // TODO: Move to hostloader
  var groups = global.groups;
  
  if (groups && Array.isArray(groups)) {
    var gok = hlr.group_mems_setup(groups, hostarr);
    if (!gok) { console.error("Problems in resolving dynamic group members"); }
  }
  
  
  // console.log(groups); // DEBUG
  
  var os = require('os');
  var ifs = os.networkInterfaces();
  // ifs.keys().filter(function (k) {});
  //console.log(ifs); // DEBUG
  // Ansible
  global.ansible = global.ansible || {};
  if (process.env["ANSIBLE_PASS"]) { global.ansible.sudopass = process.env["ANSIBLE_PASS"]; }
  // Websockets
  /*
  io.on('connection', function (socket) {
    //socket.emit('news', { hello: 'world' });
    socket.on('ansplaycompl', function (data) { // NOT this dir !
      console.log("linet-main: ", data);
    });
  });
  */
  /* Run customization setup plugin */
  var modfn = global.lboot_setup_module;
  // TODO: Later eliminate and let normal module path resolution take place?
  if (!fs.existsSync(modfn))   { console.error("Warning: setup module does not exists as: "+ modfn); return; }
  var mod = require(modfn);
  
  if (!mod || !mod.run || typeof mod.run != 'function') {
    console.error("Error: module either 1) Not present 2) Does not have run() member 3) run member is not a callable");
    return;
  }
  console.log("Loaded: "+ modfn);
  // Call for local customization
  mod.run(global, app, hostarr);
}
// https://stackoverflow.com/questions/11181546/how-to-enable-cross-origin-resource-sharing-cors-in-the-express-js-framework-o
//app.all('/', function(req, res, next) {
//  console.log("Setting CORS ...");
//  res.header("Access-Control-Allow-Origin", "*");
//  res.header("Access-Control-Allow-Headers", "X-Requested-With");
//  next();
//});

// Simple logging for select (Install package related) HTTP requests.
// See also app.all()
app.use(function (req, res, next) {
  //var filename = path.basename(req.url);
  //var extension = path.extname(filename);
  var s; // Stats
  console.log("app.use: URL:" + req.url);
  // 
  if (req.url.match("^(/ubuntu1|/centos|/gparted|/boot)")) {
    // Stat the file
    var msg;
    try { s = fs.statSync("/isomnt" + req.url); }
    catch (ex) { msg = "404 - FAIL";  } // console.log("URL/File: " + req.url + " ");
    if (!msg && s) { msg = s.size; }
    console.log("URL/StaticFile: " + req.url + " " + msg); 
  }
  // If one of the boot/install actions ... do ARP
  //var bootact = {"/preseed.cfg":1, "/ks.cfg":1, }; // "":1, "":1, "":1,
  // var ip = ipaddr_v4(req);
  // if (bootact[req.url]) {arp.getMAC(ipaddr, function(err, mac) { req.mac = mac; next(); }); } // ARP !
  
  //console.log("Setting CORS ...");
  res.header("Access-Control-Allow-Origin", "*"); // Access-Control-Allow-Origin
  //res.header("Access-Control-Allow-Headers", "X-Requested-With");
  
  next();
});


app_init(global);
app.listen(port, function () {
  console.log("Linux Network Installer app listening on host:port http://localhost:"+port+" OK"); // ${port}
});

/** Deep clone any data structure.
* @param data {object} - Root of the data structure to clone (deep copy)
* @return Full deep copy of data structure.
*/
function dclone(d) { return JSON.parse(JSON.stringify(d)); }
/** Get Boot Client IP Address from HTTP request.
 * For convenience the exception translation is handled here (this is subject to change if it shows to be a bad idea).
 * @param req - Node.js / Express HTTP Request object (holding the client address)
 * @return Real or mapped Client address.
 */
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
function host_for_request(req, cb) {
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

/** Generate Preseed or KS installation file based on global settings and host facts.
* Additionally Information for initial user to create is extracted from local
* config file (given by JSON filename in setting global.userconfig, e.g. "userconfig": "initialuser.json",).
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
  var osid = req.query["osid"] || global.targetos || "ubuntu18";
  if (xip) { console.log("Overriding ip: " + ip + " => " + xip); ip = xip; }
  var f = hostcache[ip]; // Get facts
  
  // parser._headers // Array
  console.log("req.headers: ", req.headers);
  console.log("Preseed or KS Gen by (full) URL: " + req.url + "(ip:"+ip+")"); // osid=
  // Map URL to symbolic template name needed. template names get mapped by global.tmplfiles (Object-map, See main config)
  var tmplmap = {
     "/preseed.cfg": "preseed",
     "/ks.cfg":      "ks",
     "/partition.cfg": "part",
     "interfaces" :  "netif",
     "/sysconfig_network": "netw_rh",
     "/interfaces" : "netif",
     "/preseed.desktop.cfg": "preseed_dt",
     "/preseed_mini.cfg": "preseed_mini",
     // https://wiki.ubuntu.com/FoundationsTeam/AutomatedServerInstalls
     // https://github.com/CanonicalLtd/subiquity/tree/master/examples
     // https://wiki.ubuntu.com/FoundationsTeam/AutomatedServerInstalls/QuickStart
     // "":"", // Ubuntu 20.04 YAML
     // Windows autounattend.xml
     // https://www.packer.io/guides/automatic-operating-system-installs/autounattend_windows
     // https://github.com/StefanScherer/packer-windows
     // "/autounattend.xml": ""
  };
  // TODO: Move to proper entries (and respective prop skip) in future templating AoO. Create index at init.
  var skip_host_params = {"/preseed.desktop.cfg": 1, "/preseed_mini.cfg": 1};
  //console.log(req); // _parsedUrl.pathname OR req.route.path
  // if (req.url.indexOf('?')) { }
  //var ctype = tmplmap[req.url]; // Do not use - contains query parameters
  var ctype = tmplmap[req.route.path]; // config type
  if (!ctype) { res.end("# Config type (ks/preseed) could not be derived\n"); return;}
  console.log("Concluded type: " + ctype + " for url ");
  // Acquire all params and blend them together for templating.
  var d; // Final template params
  var skip = skip_host_params[req.route.path];
  // Generate params, but only if not asked to be skipped
  if (!skip && f) { // Added && f because we depend on facts here
    d = host_params(f, global, ip, ctype, osid);
    if (!d) { var msg = "# Parameters could not be fully derived / decided on\n"; console.log(msg); res.end(msg); return; }
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
  //////////////////// Config Output (preseed.cfg, ks.cfg) //////////////////////////
  var tmplcont = global.tmpls[ctype];
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
  console.error("Patching ..." + osid);
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
    if (!net) { console.error("No d.net for patching centos (" + osid + ")"); return; }
    // RH and Centos 7 still seems to prefer "em" (Check later ...)
    net.dev = "em" + net.ifnum;
  }
}
/** Create dummy params (minimal subset) that ONLY depend on global config.
 * 
 */
function host_params_dummy(global, osid) {
  var net = dclone(global.net);
  var d = dclone(global); // { user: dclone(user), net: net};
  d.net = net;
  // Make up hostname ???
  // We could also lookup the hostname by ip (if passed), by async. Use await here ?
  net.hostname = "MYHOST-001";
  var gw = net.gateway;
  var iparr = gw.split(/\./);
  iparr[3] = 111;
  net.ipaddress = iparr.join('.'); // Get/Derive from net.gateway ?
  //net.domain 
  net.nameservers = net.nameservers.join(" ");
  d.user = user; // global
  // NOTE: user.groups Array somehow turns (correctly) to space separated string. Feature of Mustache ?
  //NOT:d.disk = disk;
  /////////////////////////// Mirror - Copy-paste or simplify 
  d.mirror = { "hostname": global.mirrorhost, "directory": "/" + osid }; // osid ? "/ubuntu18"
  d.postscript = global.postscript; // TODO: Can we batch copy bunch of props collectively
  
  return d;
}
/** Generate host parameters for OS installation.
* Parameters are based on global linetboot settings and host
* specific (facts) settings.
* The final params returned will be directly used to fill the template.
* @param f - Host Facts parameters (from Ansible)
* @param global - Global config parameters (e.g. network info)
* @param ip - Requesting host's IP Address
* @param ctype - Configuration type (e.g. ks or preseed, see elswhere for complete list)
* @param osid - OS id (, e.g. "ubuntu18", affects mirror choice)
* @return Parameters (structure, somewhat nested, w. sub-sections net, user) for generating the preseed or ks output.
* TODO: Passing osid may imply ctype (and vice versa)
*/
function host_params(f, global, ip, ctype, osid) {
  var net = dclone(global.net);
  var anet = f.ansible_default_ipv4; // Ansible net info
  if (anet.address != ip) {
    var msg = "# Hostinfo IP and detected ip not in agreement\n";
    res.end(msg);
    console.log(msg);
    return null;
  }
  net.ipaddress = ip; // Move to net processing (if (ip) {}
  ////////////////////////// NET /////////////////////////////////////
  // TODO: Take from host facts (f) f.ansible_dns if available !!!
  // Create netconfig as a blend of information from global network config
  // and hostinfo facts.
  //function netconfig(net, f) {
  // if (!f) { return; } // No facts, cannot do overrides
  // var anet = f.ansible_default_ipv4;
  var dns_a = f.ansible_dns; // Has search,nameservers
  
  net.nameservers = net.nameservers.join(" "); // Debian: space separated
  // Override nameservers, gateway and netmask from Ansible facts (if avail)
  if (dns_a.nameservers && Array.isArray(dns_a.nameservers)) {
    net.nameservers = dns_a.nameservers.join(" ");
  }
  if (anet.gateway) { net.gateway = anet.gateway; }
  if (anet.netmask) { net.netmask = anet.netmask; }
  // Domain !
  if (f.ansible_domain) { net.domain = f.ansible_domain; }
  net.hostname = f.ansible_hostname; // What about DNS lookup ?
  //net.dev = anet.interface; // See Also .alias
  net.dev = "auto"; // Default ?
  // TODO: Extract interface (also alias) number !
  // Rules for extraction:
  // - We try to convert to modern 1 based (post eth0 era, interfaces start at 1) numbering 
  var ifnum; var marr;
  if      ( (marr = anet.interface.match(/^eth(\d+)/)) )      { ifnum = parseInt(marr[1]); ifnum++; } // Old 0-based
  
  else if ( (marr = anet.interface.match(/^(em|eno)(\d+)/)) ) { ifnum = parseInt(marr[2]); } // New 1-based
  else { console.log("None matched: " + anet.interface); ifnum = 1; } // Guess / Default
  net.ifnum = ifnum;
  //  return ...;
  //}
  // netconfig(net, f);
  ///////////////////////// DISK /////////////////////////////////
  // Disk logic was embedded here
  console.error("Calling disk_params(f) (by:" + f + ")");
  // var hdisk = require("./hostdisk.js");
  var disk = disk_params(f);
  
  // Account for KS needing nameservers comma-separated
  if (ctype == 'ks') { net.nameservers = net.nameservers.replace(' ', ','); }
  // console.log(net);
  var d = dclone(global); // { user: dclone(user), net: net};
  d.net = net;
  d.user = user; // global
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
  if (!mirror) { return null; } // NOT Found ! Hope we did not match many either.
  mirror = dclone(mirror); // NOTE: This should already be a copy ?
  if (global.mirrorhost) { mirror.hostname = global.mirrorhost; } // Override with global
  d.mirror = mirror;
  return d;
}

/** Generate Disk parameters for super simple disk layout: root+swap (and optional boot).
  * Calculate disk params based on the facts.
  * The unit on numbers is MBytes (e.g. 32000 = 32 GB)
  * See facts sections: ansible_device_links ansible_devices ansible_memory_mb
  * @param f {object} - Ansible facts (w. ansible_devices, ansible_memory_mb, ... on top level).
  * @return Disk Object
  * 
  * @todo Allow output generation in various unattended install recipe formats
  * - Debian/Ubuntu
  * - RH kickstart
  * - Windows Autounattend.xml (XML Section DiskConfiguration)
  */
  function disk_params (f) {
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
  function disk_calc_size(sda) {
    var unitfactor = { "GB": 1000, "MB": 1, "KB": 0.1 };
    var parts = sda.partitions;
    var pnames = Object.keys(parts);
    console.error("Got parts: " + pnames);
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

/** Receive an install "milestone" event from client host to be installed.
* Currently events start/done are received.
* Register this via parametric URL with param ":evtype", e.g
*
*      app.get('/installevent/:evtype', oninstallevent);
*
* and call in the install script (e.g. "pre" script here):
*
*      # let lineboot know the start of install
*      http://localhost:3000/installevent/start
*/
function oninstallevent(req,res) {
  var ip = ipaddr_v4(req);
  var p = req.params;  // :evtype
  var now = new Date();
  console.log("IP:" + ip + ", event: " + p.evtype + " time:" + now.toISOString());
  var sq = "INSERT INTO hostinstall () VALUES (?)";
  // sq = "UPDATE hostinstall SET ... WHERE ipadd = ?"
  // conn.exec(sq, params, function (err, result) {
  //  
  //});
  res.json({msg: "Thanks", ip: ip, "event":  p.evtype, time: now.toISOString()});
}


/** Get OS Disto package counts for each of the hosts.
* Respond with a JSON structure (Array of Objects) with package counts.
* Inner objects will have members:
* - hname - Hostname
* - pkgcnt - Package counts
*/
function pkg_counts (req, res) {
  // Package dir root
  var root = process.env["PKGLIST_PATH"] || process.env["HOME"] + "/hostpkginfo";
  var jr = {status: "err", msg: "Package list collection failed."};
  if (!fs.existsSync(root)) { jr.msg += " Package path does not exist."; console.log(jr.msg); return res.json(jr); }
  // Get package count for a single host. Uses global hostcache and 9outer var) root.
  // TODO: Pass facts, map(hostarr, ...)
  function gethostpackages(hn, cb) {
    var path = root + "/" + hn;
    // Lookup host for addl. info (for set to be self-contained)
    var f = hostcache[hn];
    var stat = {hname: hn, pkgcnt: 0, "distname": (f ? f.ansible_distribution: "???")};
    // Consider as error ? return cb(err, null); This would stop the whole stats gathering.
    var err;
    if (!fs.existsSync(path))   { err = "No pkg file for host: " + hn; console.log(err); return cb(null, stat); }
    if (path.indexOf("_") > -1) { err = "Not an internet name: " + hn; console.log(err); return cb(err, null); }
    // Call wc or open, split and count ? fgets() ?
    cproc.exec('wc -l ' + path, function (error, stdout, stderr) {
      if (error) { return cb(error, null); }
      // console.log(stdout);
      stat.pkgcnt = parseInt(stdout);
      return cb(null, stat);
    });
  }
  //global.hostnames.forEach(function (hn) {
  //  gethostpackages(hn, function (err, cnt) { console.log("Got pkgs for " + hn + ": " + cnt);});
  //});
  async.map(global.hostnames, gethostpackages, function(err, results) {
    if (err) {jr.msg += "Error collecting stats: " + err; return res.json(jr); }
    res.json({status: "ok", data: results});
  });
  
}
/** Generate commands output for all hosts (/allhostgen or /allhostgen/:outfmt)
* Output can be (for example):
*
* - Certain well known file format for an application / OS subsystem
* - Commands to carry out certain op on all hosts
*
* TODO: Plan to migrate this to ...for_all() handler that foucuses on doing an op to all hosts
* - setup
* - barename
* - maclink
* TODO: Turn into a module, elim. req (req.query.para)
* TODO: Support templating + params (as opposed to cb generated output)
*/
function gen_allhost_output(req, res) {
  var jr = {"status":"err", "msg":"Failed to generate hostcommand output."};
  var genopts_idx = {};
  var hc = require("./hostcommands.js");
  hc.init();
  var genopts = hc.genopts;
  if (!genopts || !Array.isArray(genopts)) { jr.msg += " No genopts avail or not an array"; console.log(jr.msg); return res.end(jr.msg); }
  var getopts_idx = hc.genopts_idx;
  // console.log(getopts_idx); // OK
  // Account for case: empty params
  // TODO: Eliminate req from pure module context
  if (!req.params || !Object.keys(req.params).length) {
    // OLD: return res.end("# URL routing params missing completely.\n");
    var arr = genopts.map(function (it) { return { lbl: it.lbl, name: it.name }; });
    return res.json(arr);
  }
  
  var lbl = req.params.lbl;
  if (!lbl) { jr.msg += " No op label !"; return res.end(jr.msg); }
  // With no label send the structure w/o cb. See new version w/o delete above
  // if (!lbl) { var genopts2 = dclone(genopts); genopts2.forEach(function (it) { delete(it.cb); }); res.json(genopts2); return; }
  // var cont = "";
  //var op = genopts_idx[lbl];
  var op = hc.genopts_idx[lbl]; // NOTE: hc.genopts_idx[] works, but not genopts_idx[] !!
  //console.log("op:", op);
  //console.log(getopts_idx[lbl]);
  //console.log(getopts_idx[lbl]);
  
  if (!op) { return res.end("# '"+lbl+"' - No such op. in "+genopts_idx+"\n"); }
  var cmds = hc.commands_gen(op, hostarr, req.query.para);
  res.end(cmds.join("\n"));
}
/** Generate Ubuntu 18 Netplan (via HTTP get /netplan.yaml).
* Extract network config essentials from following sources:
* - Existing Hosts: Facts (Uses info from facts branches **ansible_default_ipv4** and **ansible_dns**)
* - New Hosts: Use dummy facts stub (f_dummy)
* 
* Respond with netplan YAML content (with network.ethernets[$IFNAME]).
* 
* #### URL Params
* 
* - ip - Overriden IP for content generation (Instead of current - e.g. DHCP originated - ip)
* - mac - mac address
* 
* #### Downloading Netplan
* 
* Download a new corrected / machine generated netplan and set into use:
* 
*      cd /etc/netplan
*      sudo mv 01-netcfg.yaml 01-netcfg.yaml.org
*      # By ip address
*      sudo wget -O 01-netcfg.yaml http://ash-test-ccx-01.ash.broadcom.net:3000/netplan.yaml?ip=10.75.159.27
*      # By mac address (e.g. when current ip on-hot is wrong)
*      sudo wget -O 01-netcfg.yaml http://ash-test-ccx-01.ash.broadcom.net:3000/netplan.yaml?mac=02:07:07:00:c7:9c
*      sudo netplan apply
* 
* @todo Convert netmask to CIDR notation.
* See also: https://netplan.io/examples
*/
function netplan_yaml(req, res) {
  // np = {"version": 2, "renderer": "networkd", "ethernets": {} }
  res.type("text/plain");
  // Content-Disposition: ... Would pop up save-as
  //var fn = "01-netcfg.yaml";
  // res.set('Content-Disposition', "attachment; filename=\""+fn+"\"");
  var xip = req.query["ip"];
  var ip = ipaddr_v4(req);
  if (xip) { console.log("Overriding ip: " + ip + " => " + xip); ip = xip; }
  var f = hostcache[req.query["mac"] || ip];
  if (!f) { console.log("# No Facts found for IP Address '"+ip+"' (or maybe mac ?).\n");  } // ${ip} return;
  // Validate gotten cache artifact (TODO: Move into respective wrapper)
  if (f && !f.ansible_architecture) { console.log("WARNING: Facts gotten from cache, but no expected props present"); }
  if (f) { console.log("Using cached facts ..."); }
  // Dummy facts with all set to false (for fallback to global)
  var f_dummy = {"ansible_default_ipv4": {}, "ansible_dns": null};
  var d = f || f_dummy;
  // Base netplan stub (to fill out)
  var np = {"version": 2, "renderer": "networkd", "ethernets": {} };
  //# See also "ansible_em1" based on lookup to:
  //# iface.alias
  //# See: "ansible_fqdn" => hostname
  // iface has: alias, address, gateway
  var iface_a = d["ansible_default_ipv4"]; // # iface_a = Ansible interface (definition)
  console.log("iface_a: "+JSON.stringify(iface_a, null, 2));
  //if (!iface_a) { res.end("No ansible_default_ipv4 network info for ip = "+ip+"\n"); }
  var ifname = iface_a["alias"] || global.net["ifdefault"] || "eno1"; // TODO: global["ifdefault"]
  // Interface Info.  TODO: Create /dec CIDR mask for "addresses" out of "netmask"
  var address = (iface_a["address"] ? iface_a["address"] : ip);
  var netmask = iface_a["netmask"] || global.net.netmask;
  var dec = netmask2CIDR(netmask); // netmask2cidr(netmask);
  if (dec) { address += "/"+dec; }
  var iface = { // Netplan
    "addresses": [ address ], // Assume single
    "gateway4": (iface_a["gateway"] ? iface_a["gateway"] : global.net["gateway"]) // # Netplan interface
    
  };
  // Add /dec mask here based on "netmask"
  var dns_a = d["ansible_dns"]; // global["namesearch"] // NEW: Fallback to global
  //console.log("dns_a: "+JSON.stringify(dns_a, null, 2));
  //console.log("global.net: "+JSON.stringify(global.net, null, 2));
  // console.log("Found Ansible DNS Info: "+dns_a);
  // Namesearch Info (servers, search suffixes).
  //var ns = {};
  //var ns_search = ns.search = ;
  //var ns_addresses = ns.addresses = ;
  
  var ns = {
    "search":    (dns_a && dns_a["search"] ? dns_a["search"] : global.net.namesearch),
    "addresses": (dns_a && dns_a["nameservers"] ? dns_a["nameservers"] : global.net.nameservers)
  };
  // Exception for misleading systemd DNS server "127.0.0.53"
  if (ns.addresses[0] == '127.0.0.53') { ns.addresses = global.net.nameservers; }
  //console.log("ns as JSON: "+JSON.stringify(ns));
  iface["nameservers"] = ns;
  np["ethernets"][ifname] = iface; // Assemble (ethernets branch) !
  //# Unofficial, but helpful (at netplan root)
  var custom = 0; // Custom props (for debugging, etc)
  if (custom) {
  //np["hostname_fqdn"] = d["ansible_fqdn"]; // # Leave at: ansible_hostname ?
  //np["domain"]        = d["ansible_domain"];
  //np["macaddress"] = iface_a["macaddress"];
  //# NOTE: We add the old-style "netmask" to the netplan even if it is not a standard member of it
  //iface["netmask"] = iface_a["netmask"];
  }
  var nproot = {"network": np}; // Netplan (root) - Complete
  // var yaml = yaml.safeLoad(fs.readFileSync('test.yml', 'utf8')); // From
  // To YAML
  var ycfg = {
    'styles': { '!!null': 'canonical' }, // dump null as ~
    'sortKeys': true
  };
  // YAMLException: unacceptable kind of an object to dump [object Undefined]
  // Known workaround: JSON.parse(JSON.stringify(obj)) https://github.com/nodeca/js-yaml/issues/76
  // NEW: var nproot2 = dlcone(nproot);
  var ycont = yaml.safeDump(JSON.parse(JSON.stringify(nproot)), ycfg);
  // JSON dumps fine (!!!???)
  //var ycont = JSON.stringify(nproot, null, 2);
  // var ycont = yaml.safeDump(f, ycfg);
  
  res.send(ycont);
  //res.send(f);
  // https://www.ultratools.com/tools/netMask
  // https://gist.github.com/jppommet/5708697
  // https://stackoverflow.com/questions/19532210/javascript-netmask-and-cidr-conversion
  function ip2int(ip) {
    return ip.split('.').reduce(function(ipInt, octet) { return (ipInt<<8) + parseInt(octet, 10); }, 0) >>> 0;
  }
  function cidr_calc(uint) {
    var cnt = 0;
    for (var i = 31;i >= 0; i--, cnt++) {
      var posval = (uint & (1 << i)) ? 1 : 0;
      if (!posval) { break; }
    }
    return cnt;
  }
  // E.g. 255.255.224.0 =>  cidr = 19
  function netmask2cidr(netmask) {
    var uint = ip2int(netmask);
    var cidr = cidr_calc(uint);
    return cidr || 24;
  }
  function countCharOccurences(string , char) { return string.split(char).length - 1; }
  function decimalToBinary(dec) { return (dec >>> 0).toString(2); }
  function getNetMaskParts(nmask) { return nmask.split('.').map(Number); }
  // Main resolver
  function netmask2CIDR(netmask) {
     return countCharOccurences(
       getNetMaskParts(netmask)
        // .map(part => decimalToBinary(part)).join(''),'1');
        .map(function (part) { return decimalToBinary(part);} ).join(''),'1' );
  }
}
/** Send a shell script / commands (or any text content) using HTTP GET.
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
  var fullname = "./scripts/" + fname;
  if (!fs.existsSync(fullname)) { res.send("# Hmmm ... No such file.\n"); return; }
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
/** Deliver SSH key / keys for the old host for placing them onto new installation.
* Triggered via URL: '/ssh/:item'. Allow URL parameter ":item" to be (for private key, public key, respectively):
* - dsa, dsa.pub (DSA is deprecated and no more used by Ubuntu 18.04)
* - ecdsa, ecdsa.pub
* - ed25519, ed25519.pub
* - rsa, rsa.pub
* - all - For delivering all keys in JSON (for python, js or perl processing)
* URL parameter: "item"
* Notes:
* - ONLY the public keys are available in host facts.
* 
* Ansible keys are missing:
* - the Key type label from the beginning (ssh-ed25519)
* - the " user@this-host" (space separated from key) from end
* If LINETBOOT_SSHKEY_PATH is used (e.g. ~/.linetboot/sshkeys) , every host has a subdir
* by its FQDN hostname and ssh keys under it by their official well known names.
*
* @todo Create some kind of key-passing mechanism to be allowed to fetch keys.
*/
function ssh_key(req, res) {
  var ip = ipaddr_v4(req);
  var xip = req.query["ip"];
  if (xip) { console.log("Overriding ip: " + ip + " => " + xip); ip = xip; }
  var f = hostcache[ip];
  var keytypes = {
    "dsa":    "ansible_ssh_host_key_dsa_public",
    "rsa":    "ansible_ssh_host_key_rsa_public",
    "ecdsa":  "ansible_ssh_host_key_ecdsa_public",
    "ed25519":"ansible_ssh_host_key_ed25519_public"
    
  };
  if (!f) { res.end("# No IP Address "+ip+" found in host DB\n"); return; } // ${ip}
  var keypath = process.env["LINETBOOT_SSHKEY_PATH"];
  //if (keypath && !fs.) {}
  res.type("text/plain");
  var item = req.params.item;
  if (!item) { console.error("No key param found (:item)" + ktype); res.send("# Error"); return; }
  var fnprefix; // var ktype;
  var ispublic = 0;
  // var marr;
  // var keycont;
  var marr = item.match(/^(\w+)\.?/);
  if (!marr) { console.error("Not in correct format {:item}:" + ktype); res.send("# Error");return; }
  var ktype = marr[1];
  marr = item.match(/\.pub$/);
  if (marr) { ispublic = 1; }
  console.error("lookup key type: " + ktype + " public: " + ispublic);
  var pubdb = "facts";
  // Lookup from Facts
  if (ispublic && (pubdb = "facts")) {
    var anskey = keytypes[ktype];
    if (!anskey) { console.error("Not a valid key type:" + ktype); res.send("# Error");return; }
    var keycont = f[anskey];
    if (!keycont) { console.error("No key content:" + ktype + "(Sending empty file)"); res.send("");return; }
    var comm = " root@" + f.ansible_hostname;
    var keytypelbl = "ssh-" + ktype + " ";
    // By testing this produces *exactly* correct MD5 despite being "reassebled". Do NOT remove "\n" at end.
    res.send(keytypelbl + keycont + comm + "\n");
  }
  
  // Filesystem cached key directory tree lookup
  if (keypath) {
    // Form an actual filename
    var fname = "ssh_host_"+ktype+"_key" + (ispublic ? ".pub" : "");
    var absfname = keypath + "/" + f.ansible_fqdn + "/" + fname; // Full path
    if (!fs.existsSync(absfname)) { console.error("No key file:"+absfname+" ktype " + ktype + "(Sending empty file)"); res.send("");return; }
    var cont = fs.readFileSync(absfname, 'utf8');
    if (!cont) { console.error("No key content:" + ktype + "(Sending empty file)"); res.send("");return; }
    res.send(cont);
    return;
  }
  res.send("# Error (not public, not private or keydir missing)\n");
}
/** List Archived Host keys for (all) hosts.
*/
function ssh_keys_list(req, res) {
  var hks = require("./hostkeys.js");
  var keylist = hks.hostkeys_list(hostcache);
  var keylist2 = hks.hostkeys_all_hosts(hostarr, keylist);
  res.send({data: keylist2});
}

var cbs = {
  "net": netinfo, "hw": hwinfo, "os": osinfo,
  "": function (f, h) { netinfo(f, h); osinfo(f, h); hwinfo(f, h); }
};

/** Create a listing of host info (GET /list).
* Important facts contained resources here are:
* - ansible_fqdn, ansible_hostname
* - ansible_default_ipv4 - Network Info
* - ansible_distribution, ansible_distribution_version
*
* Others: ansible_form_factor (e.g. "Desktop"), ansible_uptime_seconds
*/
function hostinfolist (req, res) {
  // Note: Do NOT overwrite (now global) hostarr on (future) map() or filter() or sort()
  var arr = [];
  //res.type("application/json"); // Redundant
  //res.header("Access-Control-Allow-Origin", "*");
  var viewtype = req.params["viewtype"] || ""; // Even "" has (default) handler !
  var datafillcb = cbs[viewtype]; // Callback to populate data
  if (!datafillcb) { res.json({ "status": "err", "msg": "No such view" }); return; }
  // Fill-in custom props / params from inventory (TODO: treat as normal datafillcb ?)
  function hostparainfo(hpara, h) {
    //h.use = hpara.use || "";
    //h.loc = hpara.loc || "";
    //h.dock = hpara.dock || "";
    // NEW: Map all custom w/o hard-assuming particular custom fields
    // TODO: Check for reserved keys (reskeys = {'hname' => 1, ...};)
    Object.keys(hpara).forEach(function (k) { h[k] = hpara[k] || ""; });
  }
  var hps = global.hostparams || {};
  // Use array here (f = Host facts).
  hostarr.forEach(function (f) {
    var h = {hname: f.ansible_fqdn}; // Local generic hostlist entry (for any/all viewtype(s))
    datafillcb(f, h);
    // Temp solution, hard-wired add
    var hpara = hps[h.hname] || {};
    //console.log("HPARA:", hpara);
    hostparainfo(hpara, h); // Custom attrs / params
    arr.push(h);
  });
  res.json(arr);
}
/** List Groups if configured (HTTP GET /groups).
*/
function grouplist(req, res) {
  var jr = {status: "err", msg: "Unable to List Host Groups."};
  if (!global.groups) { jr.msg += " No hostgroups declared"; return res.json(jr); }
  res.set('Access-Control-Allow-Origin', "*");
  // Deep clone (and remove irrelevant members ?)
  var groups = JSON.parse(JSON.stringify(global.groups));
  groups.forEach(function (g) {
    g.hosts = [];
    g.hostnames.map(function (hn) {
      var f = hostcache[hn];
      if (!f) { return; } // Todo - improve - should splice hostname out ?
      var h = {hname: f.ansible_fqdn};
      cbs[''](f, h); // Fill info !
      g.hosts.push(h);
    });
  });
  res.json(groups);
}

/* All callbacks below convert anything from host facts to a record to display on list view. */
  function netinfo(f, h) {
    var anet = f.ansible_default_ipv4;
    h.dev = anet.interface; // netdev
    h.ipaddr  = anet.address;
    h.macaddr = anet.macaddress;
    
    
    h.netmask = anet.netmask;
    h.gateway = anet.gateway;
    // type: ether
    var dns = f.ansible_dns;
    h.dns = dns && dns.nameservers ?  dns.nameservers.join(", ") : "";
    h.domain = f.ansible_domain;
  }
  // Also see: ansible_lsb (id, release)
  function osinfo(f, h) {
    h.distname = f.ansible_distribution; // e.g. Ubuntu
    h.distver  = f.ansible_distribution_version;
    h.osfamily = f.ansible_os_family; // e.g. Ubuntu => Debian
    // f.ansible_distribution_release;
    h.kernelver = f.ansible_kernel;
  }
  function hwinfo(f, h) {
    h.cpuarch = f.ansible_machine;
    h.cores = f.ansible_processor_vcpus; // f.ansible_processor_count
    // h.cpuname = f.facter_processor0; // Only avail sometimes (-b ?)
    // TODO: ARM CPU's show "1" - refine logic to cover ARM !!!
    // e.g. search for f.ansible_processor.filter(function (c) {return c.match(/(Intel|ARM); } )[0]; // OR find()
    h.cpuname = f.ansible_processor ? f.ansible_processor[2] : "??";
    // Consider facter_memorysize
    //h.memsize = ( f.ansible_memory_mb && f.ansible_memory_mb.real ) ? f.ansible_memory_mb.real.total : 0;
    h.memsize = f.ansible_memtotal_mb;
    h.sysvendor = f.ansible_system_vendor; // f.ansible_product_version
    h.sysmodel = f.ansible_product_name;
    h.prodver = f.ansible_product_version;
    // /usr/sbin/dmidecode -s system-serial-number
    h.prodser = f.ansible_product_serial;
    // Disk
    var devs = f.ansible_devices; // Disk Devices (OoO)
    if (devs && devs.sda) {
      var sda = devs.sda;
      h.diskmod = sda.model;
      // h.diskctrl = sda.host;
      h.diskrot  = sda.rotational;
      h.disksize = sda.size; // Has unit "MB","GB",...
      h.diskvirt = sda.virtual;
    }
    h.biosver = h.ansible_bios_version;
    h.biosdate = h.ansible_bios_date;
  }
/** List Remote Management interfaces for hosts that have them.
* Display on URL /hostrmgmt
*/
function rmgmt_list(req, res) {
  var rmc = global.ipmi || {};
  var rmgmtpath = process.env['RMGMT_PATH'] || rmc.path ||  process.env['HOME'] + "/.linetboot/rmgmt";
  
  var arr = [];
  var resolve = 1; // Resolve DNS Names
  var jr = {"status": "err", msg: "Error Processing Remote interfaces."};
  // function dummy_add(dum) { arr.push(dum); } // Dummy entry w/o rm info.
  // Sync Load
  hostarr.forEach(function (f) { var ent = ipmi.rmgmt_load(f, rmgmtpath); arr.push(ent); });
  // Resolve names (if resolve=true)
  if (resolve) {
    async.map(arr, ipmi.lan_hostname, function(err, results) {
      if (err) { jr.msg += " "+err; return res.json(jr); }
      res.json(results);
    });
    return;
  }
  res.json(arr);
}
/** Perform set of network probe tests by DNS, Ping, SSH ()
 * Send results as JSON AoO in member "data".
 * @todo Add err param.
*/
function nettest(req, res) {
  var jr = {"status": "err", "msg": "Net Probing failed. "};
  //netprobe.init();
  // var hnames = hostarr.map(function (h) {return h.ansible_fqdn; });
  // TODO: Timing ! var t1 = 
  netprobe.probe_all(hostarr, "net", function (err, results) {
    if (err) { jr.msg += err; return res.json(jr); }
    // Note: There seems to be null (non-Object) entries in the results Array.
    // These seem to be due to resolveAny() failing and cb params missing.
    // Could weed these out by:
    // results = results.filter(function (it) { return it; });
    // ... but adding proper cb() params seems to eliminate need.
    // var dt = new ... - t1;
    res.json({status: "ok", data: results}); // dtms: dt
  });
}
/** Perform process-geared probing on host (numproc, load, uptime) /proctest
 */
function proctest(req, res) {
  var jr = {"status": "err", "msg": "Process Probing failed. "};
  //netprobe.init();
  // Filter out ones labeled with "nossh" (machines erroring in flaky way with SSH - rare, but happens)
  var hostarr2 = hostarr.filter(function (h) {
    var p = global.hostparams[h.ansible_fqdn];
    console.log("Para:", p);
    if (p && p.nossh) { return 0; }
    return 1;
  });
  netprobe.probe_all(hostarr2, "proc", function (err, results) {
    if (err) { jr.msg += err; return res.json(jr); }
    res.json({status: "ok", data: results});
  });
}

/** Run set of ansible playbooks on set of hosts (POST /ansrun).
* Main paremeters are playbooks and hosts:
* 
* - **playbooks** - Set of ansible playbook should be given by a profile
* (Or passing playbook names for maximum flexibility).
* - **hostnames**: Hosts could be given as individual hosts
* - **hostgroups** as defined by lineboot host groups).
* 
* Depends on lineboot config members:
* - ansible.pbpath - Playbook path
* - ansible.pbprofs - playbook profiles in Array-of-Objects (w. "lbl", "name", "playbooks")

* ## profile format in config
* 
* profiles look like (Under "ansible" section):
* 
*     "pbprofs": [
*       {
*         "lbl": "ossetup",
*         "name": "OS Install & Setup",
*         "playbooks": ["pkg_install.yaml", "nis_setup.yaml", "user_setup.yaml"]
*       },
*       {
*         "lbl":"sshlim",
*         "name": "Setup SSH limitations",
*         "playbooks": ["ssh_lims.yaml"]
*       },
*       {
*       ...
*       }
*     ]
*/
function ansible_run_serv(req, res) {
  var jr = {status: "err", msg: "Not running Ansible. "};
  if (!global.ansible) { jr.msg += "No ansible section in config !"; return res.json(jr); }
  var acfg = global.ansible;
  if (typeof acfg != 'object') {  jr.msg += "Ansible config is not an object !"; return res.json(jr); }
  if (req.method != "POST") { jr.msg += "Send request as POST"; return res.json(jr); } // POST !!!
  var pbpath = process.env['PLAYBOOK_PATH'] || acfg.pbpath;
  if (!pbpath) { jr.msg += "Playbook path not given (in env or config) !"; return res.json(jr); }
  acfg.pbpath = pbpath; // Override (at init ?)
  // Define the policy of manding hosts to be listed in hostsfile / known to linetboot
  if (!global.hostsfile) { jr.msg += "Playbook runs need 'hostsfile' in config !"; return res.json(jr); }
  var p = req.body; // POST Params
  // Test ONLY (Comment out for real run)
  // if (!p || !Object.keys(p).length) {
  //  p = ans.testpara; // TEST/DEBUG
  //}
  acfg.pbprofs = acfg.pbprofs || [];
  console.log("ansible_run_serv: Ansible run parameters:", p);
  if (typeof p != 'object') { jr.msg += "Send POST body as Object"; return res.json(jr); }
  var step = "const";
  try {
    p = new ans.Runner(p, acfg);
    // if (!p) { jr.msg += "Runner Construction failed"; return res.json(jr); }
    step = "playbook_resolve";
    //var err = ans.playbooks_resolve(acfg, p);
    var err = p.playbooks_resolve(acfg);
    if (err) { jr.msg += "Error "+err+" resolving playbooks"; return res.json(jr); }
    // Groups
    step = "grp_resolve";
    p.hostgrps_resolve(global.groups);
    step = "run";
    console.log("Instance state before run(): ", p);
    p.ansible_run(); // OLD: ans.ansible_run(p);
  } catch(ex) {
    jr.msg += "Runner Construction failed (EX)"+ex;
    console.log("Exception Step:"+step+", msg:"+ jr.msg);
    return res.json(jr);
  }
  res.json({status: "ok", event: "ansstart", time: Math.floor(new Date() / 1000), msg: "Running Async in background"});
}

/** List ansible profiles or playbooks (GET: /anslist/play /anslist/prof).
*/
function ansible_plays_list(req, res) {
  var jr = {"status": "err", "msg": "Failed to list Ansible artifacts"};
  var urls = {"/anslist/play": "play", "/anslist/prof": "prof"};
  var url = req.url;
  var aotype = urls[url];
  if (!aotype) { jr.msg += "Not a playbook or profile URL !";res.json(jr); return; }
  var acfg = global.ansible;
  var pbpath = process.env['PLAYBOOK_PATH'] || acfg.pbpath;
  console.log("List "+url+" playbook paths: " + pbpath);
  var list = [];
  if (aotype == 'play') {
    console.log("Anslist:Play");
    list = ans.ansible_play_list(acfg, pbpath);
  }
  else if (aotype == 'prof') {
    list = ans.ansible_prof_list(acfg);
  }
  res.json(list);
}
/** Show mounts on particular host (/showmounts/:hname)
* Extend this later to generic info fetcher
* - cb to resolve host param.
* - profile id to give command to run (and it's respective parser)
* - 
* @todo Unify CSV-style parsing (w. opt explicit headers).
*/
function showmounts(req, res) {
  var jr = {status: "err", msg: "Could not run command. "};
  //var hn = req.query["hname"];
  var hn = req.params.hname;
  console.log("Run op on: "+hn);
  // Parse exports.
  function parse_exp(out) {
    var lines = out.split("\n");
    // Should have(e.g.): Export list for localhost:
    lines.shift();
    lines = lines.filter(function (l) {return l.match(/^\s*$/) ? 0 : 1; }); // Just pop() ?
    var exp = [];
    // The rest: /home              192.168.1.0/24
    exp = lines.map(function (line) { var arr = line.split(/\s+/); return { path: arr[0], iface: arr[1] }; });
    return exp;
  }
  var cmd_parse = [
    {id: "showmounts", cmd: "showmount -e {{{ hn }}}", parser: parse_exp}
    // 
  ];
  var p = {hn: hn};
  var nd = cmd_parse[0];
  // var nd = cmd_parse.filter(function (it) { it.id == cmdid; })[0];
  // if (!nd) { jr.msg += "Command or op not registered."; return res.json(jr); }
  var cmd = nd.cmd;
  // var cmd = Mustache.render(nd.cmd, p);
  // 'ssh  ' + hname + " showmount -e localhost"
  cproc.exec("showmount -e "+ hn, function (error, stdout, stderr) {
    if (error) { jr.msg += error; return res.json(jr); }
    console.log("RAW: "+ stdout);
    var data = parse_exp(stdout);
    res.json(data);
  });
}

/** Display host stats on particular property.
 * TODO: Give out stats as trad. AoO or Charting ready structure ?
 * *TODO: provide aggregated / grouped stats (counts of $prop) ?
 * Example props: ansible_memtotal_mb, ansible_processor_cores, ansible_processor_vcpus, ansible_swaptotal_mb
 */
function hostp_prop_stat(req, res) {
  var jr = {"status": "err", "msg":"Could not extract data to display. "};
  var prop = "ansible_processor_vcpus";
  var arr = [];
  hostarr.forEach(function (f) {
    arr.push({hname: f.ansible_fqdn, numcpus: f[prop]});
  });
  res.json({status:"ok", data: arr});
}

/** Present pkg stats (yes/no) for set of pkgs.
 * Send both js-grid grid def and AoO data.
 * See also: ospackages.js: pkgset() and pkg_counts()
 */
function host_pkg_stats(req, res) {
  // Sample-only array
  var pkgs = ["wget","x11-common","python2.7","patch", "xauth", "build-essential"];
  if (req.query && req.query.pkgs) {
    req.query.pkgs.split(/,\s*/);
  }
  console.log("Start /hostpkgstats");
  // Add hname here or on client ?
  var hostfld = {name: "hname", title: "Host", type: "text", css: "hostcell", width: 200};
  // Note: must mangle "." to "_" to avoid dot-notation problems with jsgrid.
  var gdef = pkgs.map(function (pn) {
    var pnn = pn.match(/\./) ? pn.replace(/\./g, "_") : pn;
    return {name: pnn,  title: pn, type: "text", width: 50,};
  });
  gdef.unshift(hostfld);
  var root = process.env["PKGLIST_PATH"] || process.env["HOME"] + "/hostpkginfo";
  var arr = [];
  hostarr.forEach(function (f) { // map ?
    var hn = f.ansible_fqdn;
    var path = root + "/" + hn;
    if (!fs.existsSync(path)) { return; }
    //arr.push({hname: f.ansible_fqdn, numcpus: f[prop]});
    var pidx = ospkgs.pkgset('', hn, path, {idx: 1});
    //console.log(pidx);
    var ent = {hname: hn};
    pkgs.forEach(function (pn) {
      //if (pkg == "python2.7" && pidx[pkg]) { console.log("Got python w. dot on " + hn + " ... :" + pidx[pkg]); }
      var pnn = pn.match(/\./) ? pn.replace(/\./g, "_") : pn;
      ent[pnn] = (pidx[pn] ? pn: 0); // Use pnn as field name
    });
    arr.push(ent);
  });
  res.json({status:"ok", data: arr, grid: gdef});
}
/** TODO: Reboot host using BMI by RedFish or IPMI.
 * Pass hostname to reboot. The IPMI/BMI address is figured out here.
 * Require PIN ?
 * Always validate host and its identity from facts.
 * TODO: Consider interrogating ".../Systems/" and choosing resp.Members[0]["@odata.id"]
 * URL Path params: ":hname", e.g. /reboot/bld-001.mycomp.com
 * Query Params:
 * - op - Operation: info, boot - MOVE TO URL !
 * - test - test/debug only, returns early and returns a planned mock-up message without making chained HTTP request
 * - pxe - Use PXE boot on next boot (Possibly an install, maintenance or memory test)
 * - pin - pin authorization code for reboot
 * Config "ipmi.testurl" - changes the url to a mock-up tese url
 * Could first query "PowerState" by GET
 * Examples for URL call:
 * 
 * Info Only
 * curl  -X GET https://foo.com/redfish/v1/Systems/System.Embedded.1/ -u admin:admin --insecure | python -m json.tool | less
 * Refs:
 * https://www.dell.com/community/Systems-Management-General/Power-Cycle-System-Cold-Boot-via-rest-api/td-p/5081009
 * https://github.com/dell/iDRAC-Redfish-Scripting/blob/master/Redfish%20Python/SetNextOneTimeBootDeviceREDFISH.py
 * https://stackoverflow.com/questions/63402788/how-to-reboot-a-system-using-the-redfish-api
 * https://docs.oracle.com/cd/E19273-01/html/821-0243/gixvt.html
 * https://redfishforum.com/thread/261/host-warm-reboots
 * https://eehpcwg.llnl.gov/assets/121015_intro_to_redfish.pdf - 2015 overview of RedFish with good JSON message examples
 * https://github.com/dell/iDRAC-Redfish-Scripting/issues/39 - racadm / python firmware update (non-RF)
 * https://www.dandh.com/pdfs/Cloud-Axcient-idrac9-lifecycle-controller-v3212121_api-guide_en-us.pdf - Dell Redfish API Guide
 */
function host_reboot(req, res) {
  var jr = {"status": "err", msg: "Failed redfish (info/boot)."};
  var ops = {"boot": "post", "info": "get"};
  var rmc = global.ipmi || {};
  var rmgmtpath = process.env['RMGMT_PATH'] || rmc.path ||  process.env['HOME'] + "/.linetboot/rmgmt"; // Duplicated !
  //var rfmsg = {"ResetType": "GracefulRestart", }; // "BootSourceOverrideTarget": "Pxe"
  var rfmsg = {"ResetType": "ForceRestart", };
  var rq = req.query;
  var p = req.params;
  
  if (!p || !Object.keys(p).length) { jr.msg += " No URL path params."; return res.json(jr); }
  if (!p.hname) { jr.msg += " No Host."; return res.json(jr); }
  if (!p.op || !ops[p.op]) { jr.msg += " Not a supported op (try: info,boot)."; return res.json(jr); }
  if (!rq) {  jr.msg += " No Query params."; return res.json(jr); }
  var ipmiconf = global.ipmi || {};
  if (!ipmiconf || !Object.keys(ipmiconf).length) { jr.msg += " No Config."; return res.json(jr); }
  // if (req.body) { console.log("Express-body: ",req.body); } // Always {}
  if (rq.pxe) { rfmsg.BootSourceOverrideTarget = 'Pxe'; } // PXE !
  if (rq.test) { return res.json(rfmsg); }
  var f = hostcache[p.hname];
  if (!f) { jr.msg += " Not a valid host:"+p.hname; return res.json(jr); }
  var rmgmt = ipmi.rmgmt_load(f, rmgmtpath);
  if (!ipmiconf.testurl && (!rmgmt || !rmgmt.ipaddr)) {  jr.msg += " No rmgmt host."; return res.json(jr); }
  // console.log("RMGMT-info:",rmgmt);
  if (!ipmiconf.testurl && !rmgmt) { jr.msg += " No rmgmt info for host to contact."; return res.json(jr); }
  console.log("rq:",rq);
  // https://stackabuse.com/encoding-and-decoding-base64-strings-in-node-js/
  function basicauth(obj) {
    // [DEP0005] DeprecationWarning: Buffer() is deprecated due to security and usability issues.
    // Please use the Buffer.alloc(), Buffer.allocUnsafe(), or Buffer.from() methods instead.
    let buff = new Buffer(obj.user + ":" + obj.pass); // , 'ascii'
    return buff.toString('base64');
  }
  function opurl(op, rmgmt, rebooturl, ipmiconf) {
    
  }
  var bauth = basicauth(ipmiconf);
  // Dell opts for ResetType: "On","ForceOff","GracefulRestart","PushPowerButton","Nmi"
  // failed: Unsupported Reset Type:ColdBoot"
  // HP wants: “ResetType”: “ColdBoot”
  // Get IPMI / iDRAC URL. All URL:s https.
  // The <id> part may be (e.g.) "1" (HP) or "System.Embedded.1" (Dell) or "437XR1138R2" (example)
  var sysid = "1"; // HP, Others ?
  if (f &&  f.ansible_system_vendor && f.ansible_system_vendor.match(/Dell/)) { sysid = "System.Embedded.1"; }
  var rebooturl = {
    "base": "/redfish/v1/",
    "info": "", // Add NONE
    "boot": "/Actions/ComputerSystem.Reset",
  // "/redfish/v1/Systems/1/Actions/ComputerSystem.Reset/" // HP ? Seems more standard per initial spec (e.g. 121015_intro_to_redfish.pdf)
  // "/redfish/v1/Systems/System.Embedded.1/Actions/ComputerSystem.Reset" // Dell ?
  // /redfish/v1/UpdateService/Actions/Oem/DellUpdateService.Install
  };
  // use IP Address to NOT have to use DNS to resolve.
  var rfurl = "https://"+rmgmt.ipaddr+rebooturl.base + "Systems/" + sysid + rebooturl[p.op];
  if (ipmiconf.testurl) { rfurl = ipmiconf.testurl; }
  // "User-Agent": "curl/7.54.0"
  var hdrs = { Authorization: "Basic "+bauth, "content-type": "application/json", "Accept":"*/*" }; // 
  
  var meth = ops[p.op];
  if (meth == 'get') { delete(hdrs["content-type"]); rfmsg = null; }
  console.log("Call("+meth+"): "+rfurl + " with body: ", rfmsg, " headers: ", hdrs);
  // Expect HTTP: 204 (!)
  // Error: self signed certificate
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  
  //const https = require('https'); // import https from 'https';
  //https.globalAgent.options.rejectUnauthorized = false;
  //const agent = new https.Agent({ rejectUnauthorized: false });
  var reqopts = {headers: hdrs, }; // httpsAgent: agent
  if (meth == 'post') { axios[meth](rfurl, rfmsg, reqopts).then(hdl_redfish_succ).catch(hdl_redfish_err); }
  if (meth == 'get') { axios[meth](rfurl, reqopts).then(hdl_redfish_succ).catch(hdl_redfish_err); }
  // Advanced handling: https://github.com/axios/axios/issues/960
  function hdl_redfish_succ(resp) {
    var status = resp.status;
    var d = resp.data;
    if (resp.headers) { console.log("resp-hdr:",resp.headers); }
    if (resp.headers && resp.headers["content-type"] && resp.headers["content-type"].match(/text\/html/)) {
      jr.msg += " Got HTML response"; return res.json(jr);
    }
    // Bott response does not have body (is empty string), but has 204 status
    console.log(meth+ "-Success-response-data("+status+"): ",resp.data);
    if (!d && (status == 204)) { d = {"msg": "204 ... RedFish Boot should be in progress"};}
    res.json({"status":"ok", data: d});
  }
  // 400 (e.g. 404), 500 ?
  // Error: Parse Error
  // Error: Request failed with status code 400 ("Bad Request" on op: boot) statusText: 'Bad Request', server: 'Apache'
  //     {"ResetType":"GracefulRestart"} <= GracefulRestart N/A on "BiosVersion": "2.2.11", only closest is ForceRestart
  //     - Need to probe and choose closest (from Actions["#ComputerSystem.Reset"]["ResetType@Redfish.AllowableValues"] ?
  //     - Secondary problem: Using valid "ForceRestart" + "Pxe" does normal boot, not PXE
  function hdl_redfish_err(err) {
    jr.msg += err.toString();
    console.log(err.response);
    console.log(err);
    console.log(meth+" Error: "+err);
    res.json(jr);
  }
  // Used to have ipmitool in here. See ipmi.ipmi_cmd()
  //res.json({bauth: bauth, rfmsg: rfmsg, rfurl:rfurl, p: p});
}
// POST
function reboot_test(req, res) {
  console.log(req.method + "-TEST-BODY:", req.body);
  var p = req.params;
  var f = hostcache[p.hname];
  console.log("RF-test-URL: "+req.url);
  // TODO: Lookup facts and mimick redfish info from facts
  // status: "ok", test: "POST success",
  // rf-props: IndicatorLED, HostName, UUID, SerialNumber, SKU (asset tag), PowerState, BiosVersion
  res.json({ hname: req.params.hname, Manufacturer: "HomeGrow", Model: "Just-a-Model", Id: new Date().getTime(),
    "@odata.id" : "/redfish/v1/Systems/System.Embedded.1"});
}
var docker_conf;
function dockerenv_info(req, res) {
  var jr = {"status": "err", msg: "Failed docker view creation."};
  var dc = global.docker;
  if (!dc) { jr.msg += "No docker lineboot config section"; return res.json(jr);}
  if (!docker_conf) {
    if (!dc.config) { jr.msg += "No docker env config (docker.conf.json)"; return res.json(jr); }
    if (!dc.catalog) { jr.msg += "No docker catalog (dockercat.conf.json)"; return res.json(jr); }
    try {
      var d = require(dc.config);
      d.catalog = require(dc.catalog);
      docker_conf = d;
    }
    catch (ex) { jr.msg += "Loading of docker configs failed"; return res.json(jr); }
  }
  return res.json({status: "ok", data: docker_conf});
}

/** Send misc/select key-value pairs of config information to frontend.
 * Config info is taken from global config structure.
 */
function config_send(req, res) {
  var cfg = {docker: {}, core: {}, bootlbls: []};
  // Docker host group
  var dock = global.docker;
  var core = global.core;
  var tftp = global.tftp;
  if (dock && dock.hostgrp) { cfg.docker.hostgrp = dock.hostgrp; }
  if (dock && dock.port)    { cfg.docker.port = dock.port; }
  // Core
  if (core && core.appname) { cfg.appname = core.appname; }
  if (core && core.hdrbg)   { cfg.hdrbg = core.hdrbg; } // BG Image
  if (tftp && tftp.menutmpl) { cfg.bootlbls = bootlabels(tftp.menutmpl); }
  res.json(cfg);
}
/** Collect boot labels from boot menu file.
 * Create a (Array-of-Objects) list of os label ("id"), os description ("name") entries.
 * @param fn {sting} - Pxelinux boot menu file
 * @return list of OS descriptions.
 */
function bootlabels(fn) {
  // Consider what config section to put into (tftp.menutmpl)
  //var fn = global.tftp.menutmpl;
  
  //fn = "./tmpl/default.installer.menu.mustache";
  if (!fs.existsSync(fn)) { return null; }
  var menucont = fs.readFileSync(fn, 'utf8');
  var m = [];
  var i = 1;
  console.log("bootlabels: Starting matching");
  //console.log(menucont);
  // Returns only $0:s in every match ("label word").
  //var m = menucont.match(/^label\s+(\w+)/gm);
  var re = /^label\s+(\w+)\nmenu\s+label\s+([^\n]+)\n/gm;
  var match;
  while (match = re.exec(menucont)) {
    //m.push(match[1]);
    m.push({ id: match[1], name: match[2] });
    //console.log(match);
    //console.log("Match "+i); i++;
  }
  return m;
}
/** Receive an next boot (e.g. OS installation) request and store it to persistent storage.
 * Note that the 
 * Params:
 * - hname - Hostname
 * - bootlbl - Menu boot label to boot later into
 * As a result of request, store following properties on the install-case:
 * - Set state of boot/install to "pending".
 * - Set time of request
 * - Set hname, ipaddr, macaddr to make lookups by these
 * - Trigger actions
 *   - Generate menufile by MAC address name in pxelinux.cfg (name: 01+macaddr)
 *   - Possibly trigger RedFish "Pxe" or IPMI "pxe" boot type request for the "next boot".
 * Mockup of table (boot_install)
 * - bootreqid integer NOT NULL
 * - createdate datetime,
 * - hname   varchar(128) NOT NULL,
 * - ipaddr  varchar(32) NOT NULL,
 * - macaddr varchar(32) NOT NULL,
 * - bootlbl varchar(64) NOT NULL,
 * - status  varchar(16) NOT NULL, // "pending"
 * 
 */
function installrequest(req, res) {
  var jr = {status: "err", "msg": "Could not register next boot/install request. "};
  var msgarr = [];
  console.log("Starting to process boot/install request");
  // Simple log-screen and log-to-message
  function log(msg) {
    console.log(msg);
    msgarr.push(msg);
  }
  // Validate request
  var q = req.query;
  if (!q) { jr.msg += "No query params"; return res.json(jr); }
  if (!q.hname) { jr.msg += "No hostname (hname) indicated"; return res.json(jr); }
  if (!q.bootlbl) { jr.msg += "No Boot label (bootlbl) indicated"; return res.json(jr); }
  // INSERT INTO boot_install () VALUES ()
  // Lookup host from index
  var f = hostcache[q.hname];
  if (!f) { jr.msg += "No host found by hname = '"+q.hname+"'. Check that you are passing the fqdn of the host"; return res.json(jr); }
  log("Found host facts for " + q.hname + ". Use boot label "+ q.bootlbl);
  // Validate boot label ?
  if (!global.tftp || !global.tftp.menutmpl) { jr.msg += "No Boot Menu file found for label validation "; return res.json(jr); }
  var mfn = global.tftp.menutmpl;
  var boots = bootlabels(mfn);
  var bootitem = boots.filter(function (it) { return it.id == q.bootlbl; })[0];
  if (!bootitem) { jr.msg += "No Boot Item found from menu by " + q.bootlbl; return res.json(jr); }
  // Consider multiple ?
  log("Found boot item: id = "+bootitem.id+", name = "+ bootitem.name);
  // Template menu file
  
  // if (!fs.existsSync(mfn)) { jr.msg += "No Boot Menu file found for label validation "; return res.json(jr); }
  var tmpl = fs.readFileSync(mfn, 'utf8');
  var g = dclone(global); // MUST Copy !
  g.tftp.menudef = q.bootlbl;
  var cont = Mustache.render(tmpl, g);
  log("Created "+cont.length+" Bytes of menu content");
  // Create a MCA-Address based file in global.tftp.root + "" + "01"+MACaddr (See: hostcommands.js)
  var mac = f.ansible_default_ipv4 ? f.ansible_default_ipv4.macaddress : "";
  if (!mac) { jr.msg += "No MAC Address (in facts) for "+q.hname; return res.json(jr); }
  mac = mac.replace(/:/g, "-");
  mac = mac.toLowerCase();
  var macfn = "01-" + mac;
  log("Resolved MAC-based menu filename to " + macfn);
  var root = global.tftp.root;
  if (!fs.existsSync(root)) { jr.msg += "TFTP root does not exist"; return res.json(jr); }
  var pxecfg = root + "/pxelinux.cfg/";
  if (!fs.existsSync(pxecfg)) { jr.msg += "pxelinux.cfg under TFTP root does not exist"; return res.json(jr); }
  var fullmacfn = pxecfg + macfn;
  if (fs.existsSync(fullmacfn)) {
    try { fs.unlinkSync(fullmacfn); } catch(ex) { jr.msg += "Could not remove any previous macfile " + ex; return res.json(jr); }
  }
  try {
    fs.writeFileSync( fullmacfn, cont, {encoding: "utf8"} ); // {encoding: "utf8"}, "mode": 0o666, 
  } catch (ex) { jr.msg += "Could not write new macfile menu " + ex; return res.json(jr); }
  log("Wrote Menu to: " + fullmacfn);
  // Make a call to set next boot to PXE (by Redfish ? ipmitool ?)
  // Should detect presence of rmgmt info
  if (ipmi.rmgmt_exists(q.hname)) {
    //var cmd = "";
    log("Found IPMI info files for " + q.hname);
    var ent = ipmi.rmgmt_load(f); // Not needed for ipmi_cmd() !!!
    console.log("HAS-RMGMT:", ent);
    // ipmitool lan print 1   ipmitool user list 1 chassis power status mc info  Reset BMC: mc reset cold [chassis] power soft
    // chassis bootparam set bootflag pxe
    var pxecmd = "chassis bootdev pxe"; // "lan print 1". Also options=persistent
    var ipmicmd = ipmi.ipmi_cmd(f, pxecmd, global, {});
    log("Formulated IPMI command: '"+ipmicmd+"'");
    if (!ipmicmd) { jr.msg += "Could not formulate IPMI Command"; return res.json({status: "ok", data: {"msgarr": msgarr}}); } // NOTE: NOT OK (Change) !!!
    var run = cproc.exec(ipmicmd, function (err, stdout, stderr) {
      if (err) { jr.msg += "Problem with ipmitool run:" + err; return res.json(jr); }
      
      log("Executed IPMI command successfully: " + stdout);
      return res.json({status: "ok", data: {"msgarr": msgarr}});
    });
    // run.on('exit', function (code) {});
    //return;
  }
  else { return res.json({status: "ok", data: {"msgarr": msgarr} }); }
}
