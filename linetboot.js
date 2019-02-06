/** @file

 Netboot server for Installation of OS
 Author Copyright: Olli Hollmen 2018
 
 # Generate content w. mustache CL utility
 cat initialuser.json | ./node_modules/mustache/bin/mustache - ./tmpl/preseed.cfg.mustache
 
 # Testing
 cd /tmp
 md5sum /boot/memtest86+.bin
 wget http://localhost:3000/memtest86+.bin
 md5sum memtest86+.bin
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
// Configurations
// var nb      = require("./netboot.json"); // Not used.
var globalconf = process.env["LINETBOOT_GLOBAL_CONF"] || "./global.conf.json";
var global   = require(globalconf);
var userconf = process.env["LINETBOOT_USER_CONF"] || global.userconfig || "./initialuser.json";
var user     = require(userconf);
user.groups  = user.groups.join(" ");
global.tmpls = {};
// IP Translation table for hosts that at pxelinux DHCP stage got IP address different
// from their DNS static IP address (and name). This only gets loaded by request via Env.variable
var iptrans = {};
var app = express();
var port = 3000; // TODO: Config
var fact_path;
var hostcache = {};
var hostarr = [];

/** Initialize Application / Module with settings from global conf.
* @param cfg {object} - Global linetboot configuration
* @todo Perform sanity checks in mirror docroot.
*/
function app_init(global) {
  app.set('json spaces', 2);
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
  // Note this URL mapping *can* be done by establishing symlinks from
  // global.maindocroot
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
  
  // For kernel and initrd (/linux, /initrd.gz) respectively
  // Installer Kernel and Initrd from mirror area (CD/DVD)
  // global.mirror.docroot
  // For local disk boot (recent) kernels and network install as well
  if (!fs.existsSync(global.maindocroot)) { console.error("Main docroot does not exist"); process.exit(1); }
  app.use(express.static(global.maindocroot));
  // Generated preseed and kickstart shared handler
  app.get('/preseed.cfg', preseed_gen);
  app.get('/ks.cfg', preseed_gen);
  // Network configs (still same handler)
  app.get('/sysconfig_network', preseed_gen);
  app.get('/interfaces', preseed_gen);
  // Install event logger (evtype is start/done)
  app.get('/installevent/:evtype', oninstallevent); // /api/installevent
  // Netplan (custom YAML based handler)
  app.get('/netplan.yaml', netplan_yaml);
  // Scipts & misc install data (e.g sources.list)
  //app.get('/preseed_dhcp_hack.sh', script_send);
  //app.get('/sources.list', script_send);
  // New generic any-script handler
  app.get('/scripts/:filename', script_send);
  
  // SSH Key delivery
  app.get('/ssh/:item', ssh_key);
  // Host Info Viewer
  app.get('/list', hostinfolist);
  app.get('/list/:viewtype', hostinfolist);
  // Package stats (from ~/hostpkginfo or path in env. PKGLIST_PATH)
  app.get('/hostpkgcounts', pkg_counts);
  // Group lists
  app.get('/groups', grouplist);
  // Commands to list pkgs
  app.get('/pkglistgen', pkg_list_gen);
  //////////////// Load Templates ////////////////
  var tkeys = Object.keys(global.tmplfiles);
  //global.tmpls.preseed = fs.readFileSync(global.tmplfiles.preseed, 'utf8');
  //global.tmpls.ks      = fs.readFileSync(global.tmplfiles.ks, 'utf8');
  //if (!global.tmpls.preseed || !global.tmpls.ks) { console.error("Templates missing (see global config)"); process.exit(1); }
  tkeys.forEach(function (k) {
    // TODO: try/catch
    global.tmpls[k] = fs.readFileSync(global.tmplfiles[k], 'utf8');
    
  });
  console.error("loaded " + tkeys.length + " templates.");
  fact_path = process.env["FACT_PATH"] || global.fact_path;
  //console.log(process.env);
  if (!fact_path) { console.error("Set: export FACT_PATH=\"...\" in env !"); process.exit(1);}
  if (!fs.existsSync(fact_path)) { console.error("FACT_PATH "+fact_path+" does not exist"); process.exit(1);}
  ///////////// Hosts and Groups ////////////////////
  var hnames = global.hostnames;
  if (global.hostsfile) {}
  if (!hnames || !Array.isArray(hnames)) { console.error("No Hostnames"); process.exit(1);}
  // Allow easy commenting-out as JSON itself does not have comments.
  hnames = hnames.filter(function (hn) { return ! hn.match(/^(#|\[)/); });
  if (!hnames) { console.error("No hosts remain after filtering"); process.exit(1); }
  hnames.forEach(function (hn) { facts_load(hn); });
  console.log("Cached: " + Object.keys(hostcache).join(','));
  //////////////// Groups /////////////////
  var groups = global.groups;
  var isgrouped = {}; // Flags (counts ?) for hosts joined to any group.
  if (global.groups && Array.isArray(global.groups)) {
    var grp_other = [];
    // TODO: Make more generic and allow matching on any attribute (not just hostname)
    groups.forEach(function (it) {
      
      if (it.patt) {
        var re = new RegExp(it.patt);
	// it.hosts = hostarr.filter(function (h) { return h.ansible_fqdn.match(re); });
	it.hostnames = hostarr.reduce(function (oarr, h) {
	  if (h.ansible_fqdn.match(re)) { oarr.push(h.ansible_fqdn); }
	  return oarr;
	}, []);
      }
      if (it.hostnames) { it.hostnames.forEach(function (hn) { isgrouped[hn] = 1; }); } // Increment ?
      if (!it.patt && it.policy == 'nongrouped') { grp_other.push(it); }
    });
    // Second pass for non-grouped
    // var others = hostarr.filter(function (h) { return ! isgrouped[h.ansible_fqdn]; });
    var othernames = hostarr.reduce(function (oarr, h) { if ( ! isgrouped[h.ansible_fqdn]) {oarr.push(h.ansible_fqdn); } return oarr; }, []);
    grp_other.forEach(function (g) { g.hostnames = othernames; });
    
  }
  console.log(groups); // DEBUG
  /* Load IP Translation map if requested by Env. LINETBOOT_IPTRANS_MAP (JSON file) */
  var mfn = process.env["LINETBOOT_IPTRANS_MAP"];
  if (mfn && fs.existsSync(mfn)) {
    iptrans = require(mfn); // TODO: try/catch ?
    console.error("Loaded " + mfn + " w. " + Object.keys(iptrans).length + " mappings");
  }
  
}
// Simple logging for ALL HTTP requests.
app.use(function (req, res, next) {
  //var filename = path.basename(req.url);
  //var extension = path.extname(filename);
  var s; // Stats
  if (req.url.match("^(/ubuntu1|/centos|/gparted|/boot)")) {
    // Stat the file
    var msg;
    try { s = fs.statSync("/isomnt" + req.url); }
    catch (ex) { msg = "404 - FAIL";  } // console.log("URL/File: " + req.url + " ");
    if (!msg && s) { msg = s.size; }
    console.log("URL/File: " + req.url + " " + msg); 
  }
  
  next();
});


app_init(global);
app.listen(port, function () {
  console.log(`Linux Network Installer app listening on host:port http://localhost:${port} OK`);
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
  if (newip) { return newip; }
  return ip;
}

/** Generate Preseed or KS file based on global settings and host facts.
* Additionally Information for initial user to create is extracted from local
* config file (given by setting global.userconfig).
* Two URL:s are supported by this handler:
* - /preseed.cfg
* - /ks.cfg
* Derives the format needed from URL and outputs the Install configuration in
* valid Preseed or Kickstart format.
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
*/
function preseed_gen(req, res) {
  // OLD: Translate ip to name to use for facts file name
  // Lookup directly by IP
  var xip = req.query["ip"];
  var ip = ipaddr_v4(req);
  var osid = req.query["osid"] || global.targetos || "ubuntu18";
  if (xip) { console.log("Overriding ip: " + ip + " => " + xip); ip = xip; }
  var f = hostcache[ip];
  if (!f) {
    res.end(`# No IP Address ${ip} found in host DB\n`);
    console.log(`# No IP Address ${ip} found in host DB\nRun: nslookup ${ip} for further info on host.`);
    return; }
  // parser._headers // Array
  console.log("req.headers: ", req.headers);
  console.log("Preseed or KS Gen by (full) URL: " + req.url + "(ip:"+ip+")");
  
  var tmplmap = {"/preseed.cfg":"preseed", "/ks.cfg":"ks", "/partition.cfg":"part",
     "interfaces" : "netif", "/sysconfig_network": "netw_rh", "/interfaces" : "netif"};
  //console.log(req); // _parsedUrl.pathname OR req.route.path
  // if (req.url.indexOf('?')) { }
  //var ctype = tmplmap[req.url]; // Do not use - contains parameters
  var ctype = tmplmap[req.route.path];
  if (!ctype) { res.end("# Config type (ks/preseed) could not be derived\n"); return;}
  console.log("Concluded type: " + ctype);
  // Acquire all params and blend them together for templating.
  
  var d = host_params(f, global, ip, ctype, osid);
  if (!d) { res.end("# Parameters could not be fully derived / decided on\n"); return; }
  patch_params(d, osid); // Tweaks to params, appending additional lines
  //////////////////// Config Output (preseed.cfg, ks.cfg) //////////////////////////
  var output = Mustache.render(global.tmpls[ctype], d);
  // Post-process (weed comments and empty lines out )
  var line_ok = function (line) { return !line.match(/^#/) && !line.match(/^\s*$/); };
  var oklines = output.split(/\n/).filter(line_ok);
  oklines.push("# " + oklines.length + " config lines in filterd output");
  console.log("Produced: " + oklines.length + " config directives ("+req.route.path+")");
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
/** Generate host parameters based on global settings and host specific settings.
* The final params returned will be directly used to fill the template.
* @param f - Host Facts parameters (from Ansible)
* @param global - Global parameters (e.g. network info)
* @param ip - Requesting host's IP Address
* @param ctype - Configuration type (ks or preseed)
* @return Parameters (structure, somewhat nested, w. sub-sections net, user) for generating the preseed or ks output.
* TODO: Passing osid may imply ctype (and vice versa)
*/
function host_params(f, global, ip, ctype, osid) {
  var net = dclone(global.net);
  var anet = f.ansible_default_ipv4; // Ansible net info
  if (anet.address != ip) { res.end(`# Hostinfo IP and detected ip not in agreement\n`); return null; }
  net.ipaddress = ip;
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
  if      (marr = anet.interface.match(/^eth(\d+)/))      { ifnum = parseInt(marr[1]); ifnum++; } // Old 0-based
  else if (marr = anet.interface.match(/^(em|eno)(\d+)/)) { ifnum = parseInt(marr[2]); } // New 1-based
  else { console.log("None matched: " + anet.interface); ifnum = 1; } // Guess / Default
  net.ifnum = ifnum;
  //  return ...;
  //}
  // netconfig(net, f);
  ///////////////////////// DISK /////////////////////////////////
  /** Generate Disk parameters for super simple disk layout: root+swap (and optional boot).
  * Calculate disk params based on the facts
  * The unit on numbers is MBytes (e.g. 32000 = 32 GB)
  * See facts sections: ansible_device_links ansible_devices ansible_memory_mb
  * @param facts 
  */
  function disk_params (f) {
    var disk = {rootsize: 40000, swapsize: 8000, bootsize: 500}; // Safe undersized defaults in case we return early (should not happen)
    
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
  * @param sda {object} - Disk Object (containing partitions ...)
  * @return size of the disk.
  */
  function disk_calc_size(sda) {
    var unitfactor = { "GB": 1000, "MB": 1, "KB": 0.1 };
    var parts = sda.partitions;
    var pnames = Object.keys(parts);
    console.log("Got parts: " + pnames);
    var disktot = 0;
    for (var i in pnames) {
      var pn = pnames[i]; // e.g. sda1
      var part = parts[pn];
      //console.log(pn); continue; // DEBUG
      marr = part.size.match(/^([0-9\.]+)\s+([KMGB]+)/);
      console.log(marr + " len:" + marr.length);
      if (marr && (marr.length == 3)) {
        var sf = parseFloat(marr[1]);
	var uf = unitfactor[marr[2]];
	if (!uf) { console.error("Weird unit: " + marr[2]); continue; }
	disktot += (sf * uf);
      }
    }
    return disktot;
  }
  var disk = disk_params(f);
  
  // Account for KS needing nameservers comma-separated
  if (ctype == 'ks') { net.nameservers = net.nameservers.replace(' ', ','); }
  // console.log(net);
  var d = dclone(global); // { user: dclone(user), net: net};
  d.net = net;
  d.user = user;
  d.disk = disk;
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
  var p = req.params;
  var now = new Date();
  console.log("IP:" + ip + ", event: " + p.evtype + " time:" + now.toISOString());
  res.json({msg: "Thanks", ip: ip, "event":  p.evtype, time: now.toISOString()});
}

/** Load Ansible facts for a single host from facts directory.
* This is to be done during init phase.
* Cache facts into global facts cache by both (fqdn) hostname and ip address.
* @param hn - Hostname
* @return None
*/
function facts_load(hn) { // ipaddr
  var absname = fact_path + "/" + hn;
  var facts;
  try {
    //facts = require(absname);
    // For some reason this works for ansible host files as above does not.
    var cont = fs.readFileSync(absname, 'utf8');
    facts = JSON.parse(cont);
    facts = facts.ansible_facts; // Simplify !
    // test keys
    //var keys = Object.keys(facts); // ansible_facts,changed
    //console.log("Found keys:" + keys.join(","));
  }
  catch (e) { console.error("Error loading Host JSON ("+absname+"): " +e.message); }
  // Detect discrepancies in hostname in local linetboot config and what's found in facts
  var hnerr = ""; // hn/fqdn/both
  if (hn != facts.ansible_fqdn) { hnerr = "fqdn"; }
  // NEW: Do not care about the plain hostname
  //if (hn != facts.ansible_hostname) { hnerr += hnerr ? " and hostname" : "hostname"; }
  if (hnerr) { console.error("WARNING: Host '" + hn + "' not matching fqdn and/or hostname: " + hnerr); }
  //var ip = facts.ansible_facts.ansible_all_ipv4_addresses;
  //if (ip.length > 1) { throw "Ambiguity for simple logic - "+hn+" has multiple interfaces:" + ip.join(","); }
  //ip = ip[0];
  var ifinfo = facts.ansible_default_ipv4;
  var ip = ifinfo.address;
  var maca = ifinfo.macaddress;
  // Brute force cache by name and ip addr to same cache / hash table
  hostcache[hn] = facts;
  hostcache[ip] = facts;
  // NEW: Also index by ethernet address. In facts it is lower case !!!
  if (maca) { hostcache[maca] = facts; }
  hostarr.push(facts);
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
  // Get package count for a single host.
  function gethostpackages(hn, cb) {
    var path = root + "/" + hn;
    var stat = {hname: hn, pkgcnt: 0};
    // Consider as error ? return cb(err, null); This would stop the whole stats gathering.
    if (!fs.existsSync(path))   { var err = "No pkg file for host: " + hn;      console.log(err); return cb(null, stat); }
    if (path.indexOf("_") > -1) { var err = "Not an internet name: " + hn; console.log(err); return cb(err, null); }
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
/** Generate package list extraction.
* TODO: Plan to migrate this to ...for_all() handler that foucuses on doing an op to all hosts
* 
*/
function pkg_list_gen(req, res) {
  var cont = "";
  // See also (e.g.): ansible_pkg_mgr: "yum"
  var os_pkg_cmd = {
    "RedHat": "yum list installed", // rpm -qa, repoquery -a --installed, dnf list installed
    "Debian" : "dpkg --get-selections", // apt list --installed (cluttered output), dpkg -l (long, does not start w. pkg)
    // Suse, Slackware,
    // "Arch???": "pacman -Q",
    //"SUSE???": "zypper se --installed-only",
  };
  var username = process.env['USER'] || user.username || "root";
  var paths = {
    pkglist: "~/hostpkginfo",
    hostinfo: "~/hostinfo",
  };
  hostarr.forEach(function (f) {
    var plcmd = os_pkg_cmd[f.ansible_os_family];
    if (!plcmd) { cont += "# No package list command for os\n"; return; }
    var info = {hname: f.ansible_fqdn, username: username, pkglistcmd: plcmd, pkglistpath: paths: paths};
    //if (f.ansible_os_family) {}
    var cmd = "ssh " + info.username+"@"+ info.hname + " " + info.pkglistcmd + " > " + info.paths.pkglist +"/"+ info.hname;
    if (req.query.setup) {
      cmd = "ansible -i ~/linetboot/hosts "+info.hname+" -b -m setup --tree "+info.paths.hostinfo+" --extra-vars \"ansible_sudo_pass=$ANSIBLE_SUDO_PASS\"";
    }
    cont += cmd + "\n";
  });
  res.end(cont);
}
/** Generate Ubuntu 18 Netplan (via HTTP get).
* Extract network config essentials from Facts.
* Respond with YAML netplan content.
* @todo Convert netmask to CIDR notation.
*/
function netplan_yaml(req, res) {
  // np = {"version": 2, "renderer": "networkd", "ethernets": {} }
  var xip = req.query["ip"];
  var ip = ipaddr_v4(req);
  if (xip) { console.log("Overriding ip: " + ip + " => " + xip); ip = xip; }
  var f = hostcache[ip];
  if (!f) { res.end(`# No IP Address ${ip} found in host DB\n`); return; }
  var d = f;
  
  var np = {"version": 2, "renderer": "networkd", "ethernets": {} };
  //# See also "ansible_em1" based on lookup to:
  //# iface.alias
  //# See: "ansible_fqdn" => hostname
  var iface_a = d["ansible_default_ipv4"]; // # iface_a = Ansible interface (definition)
  var ifname = iface_a["alias"];
  //# TODO: Create /dec mask out of "netmask"
  var iface = { "addresses": [iface_a["address"]], "gateway4": iface_a["gateway"] // # Netplan ingerface
    
  };
  var dns_a = d["ansible_dns"];
  var ns = {"search": dns_a["search"], "addresses": dns_a["nameservers"]};
  iface["nameservers"] = ns;
  np["ethernets"][ifname] = iface;
  //# Unofficial, but helpful (at netplan root)
  np["hostname_fqdn"] = d["ansible_fqdn"]; // # Leave at: ansible_hostname ?
  np["domain"]        = d["ansible_domain"];
  np["macaddress"] = iface_a["macaddress"];
  //# NOTE: We add the old-style "netmask" to the netplan even if it is not a standard member of it
  iface["netmask"] = iface_a["netmask"];
  var nproot = {"network": np}; //# Netplan - Complete
  // var yaml = yaml.safeLoad(fs.readFileSync('test.yml', 'utf8')); // From
  // To YAML
  var ycfg = {
    'styles': { '!!null': 'canonical' }, // dump null as ~
    'sortKeys': true
  };
  // YAMLException: unacceptable kind of an object to dump [object Undefined]
  // Known workaround: JSON.parse(JSON.stringify(obj)) https://github.com/nodeca/js-yaml/issues/76
  var ycont = yaml.safeDump(JSON.parse(JSON.stringify(nproot)), ycfg);
  // JSON dumps fine (!!!???)
  //var ycont = JSON.stringify(nproot, null, 2);
  // var ycont = yaml.safeDump(f, ycfg);
  res.type("text/plain");
  res.send(ycont);
  //res.send(f);
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
/** Detect if file needs template processing by special tagging left in file.
* The tagging also indicates what kind of template parameter context is needed.
* @param {string} content - Template (file) content as string.
* @return Templating context, which will also be true value for "needs template processing" and false
* (no templating context) for no templating needed.
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
  if (tcs.length > 1) { console.error("Ambiguous ...."); return null; }
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
  if (!f) { res.end(`# No IP Address ${ip} found in host DB\n`); return; }
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


var cbs = {"net": netinfo, "hw": hwinfo, "os": osinfo, "": function (f, h) { netinfo(f, h); osinfo(f, h); hwinfo(f, h); }};

/** Create a listing of host info.
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
  var viewtype = req.params["viewtype"] || "";
  var datafillcb = cbs[viewtype]; // Callback to populate data
  if (!datafillcb) { res.json({ "status": "err", "msg": "No such view" }); return; }
  // Use array here (f = Host facts).
  hostarr.forEach(function (f) {
    var h = {hname: f.ansible_fqdn}; // Local generic hostlist entry (for any/all viewtype(s))
    datafillcb(f, h);
    arr.push(h);
  });
  res.json(arr);
}
/** List Groups if configured.
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

/* All callbacks below convert anything from host facts to a recod to display on list view. */
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
    h.distname = f.ansible_distribution;
    h.distver  = f.ansible_distribution_version;
    // h.osfam = f.ansible_os_family; // e.g. Ubuntu => Debian
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
    
  }
  
