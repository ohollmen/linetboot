/** Netboot server for Installation of OS
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
var app = express();
var port = 3000; // TODO: Config
var fact_path;
var hostcache = {};
/**
* TODO:
* Perform sanity checks in mirror docroot.
*/
function app_init() {
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
  // What was this for - these files are at the TFTP server !!!
  // app.use(express.static("/mnt/install/netboot/ubuntu-installer/amd64/"));
  // For local disk boot (recent) kernels and network install as well
  if (!fs.existsSync(global.maindocroot)) { console.error("Main docroot does not exist"); process.exit(1); }
  app.use(express.static(global.maindocroot));
  // Generated preseed and kickstart shared handler
  app.get('/preseed.cfg', preseed_gen);
  app.get('/ks.cfg', preseed_gen);
  // Install event logger (evtype is start/done)
  app.get('/installevent/:evtype', oninstallevent); // /api/installevent
  
  app.get('/netplan.yaml', netplan_yaml);
  //////////////// Load Templates ////////////////
  global.tmpls.preseed = fs.readFileSync(global.tmplfiles.preseed, 'utf8');
  global.tmpls.ks      = fs.readFileSync(global.tmplfiles.ks, 'utf8');
  if (!global.tmpls.preseed || !global.tmpls.ks) { console.error("Templates missing (see global config)"); process.exit(1); }
  fact_path = process.env["FACT_PATH"] || global.fact_path;
  //console.log(process.env);
  if (!fact_path) { console.error("Set: export FACT_PATH=\"...\" in env !"); process.exit(1);}
  if (!fs.existsSync(fact_path)) { console.error("FACT_PATH "+fact_path+" does not exist"); process.exit(1);}
  
  var hnames = global.hostnames;
  if (!hnames || !Array.isArray(hnames)) { console.error("No Hostnames"); process.exit(1);}
  hnames.forEach(function (hn) { facts_load(hn); });
  console.log("Cached: " + Object.keys(hostcache).join(','));
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


app_init();
app.listen(port, function () {
  console.log(`Linux Network Installer app listening on host:port http://localhost:${port} OK`);
});
/** Deep clone any data structure */
function dclone(d) { return JSON.parse(JSON.stringify(d)); }
/** */
function ipaddr_v4(req) {
  var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  if (ip.substr(0, 7) == "::ffff:") { ip = ip.substr(7); }
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
* # Request Headers from installers
*
* These could be potentially used by generator.
*
* req.headers shows (initially)
*     'user-agent': 'debian-installer',
* then also:
*     'user-agent': "Debian APT-HTTP/1.3 (1.6.3)"
* Redhat/CentOS:
*     'user-agent': 'anaconda/13.21.229'
*     'x-anaconda-architecture': 'x86_64',
*     'x-anaconda-system-release': 'CentOS'
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
  
  var tmplmap = {"/preseed.cfg":"preseed", "/ks.cfg":"ks", "/partition.cfg":"part"};
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

/** Do situational patching on params.
* TODO: Separate these as osid specific plugins, where each plugin can do
* patching for os. Some plugins could be user written to facilitate particular
* environment (Also possibly contributed as "useful examples", also possibly
* making their way into this app as toggelable plugins.
* Add here member d.appendcont to produce completely new Preseed / KS. directives.
*/
function patch_params(d, osid) {
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
  // TODO: Take from host facts (f) f.ansible_dns if available !!!
  // Create netconfig as a blend of information from global network config
  // and hostinfo facts.
  //function netconfig(net, f) {
  // var anet = f.ansible_default_ipv4;
  var dns_a = f.ansible_dns; // Has search,nameservers
  
  net.nameservers = net.nameservers.join(" "); // Debian: space separated
  // Override nameservers, gateway and netmask from Ansible facts (if avail)
  if (dns_a.nameservers && Array.isArray(dns_a.nameservers)) {
    net.nameservers = dns_a.nameservers.join(" ");
  }
  if (anet.gateway) { net.gateway = anet.gateway; }
  if (anet.netmask) { net.netmask = anet.netmask; }
  net.hostname = f.ansible_hostname; // What about DNS lookup ?
  net.dev = anet.interface; // See Also .alias
  //  return ...;
  //}
  // netconfig(net, f);
  // Account for KS needing nameservers comma-separated
  if (ctype == 'ks') { net.nameservers = net.nameservers.replace(' ', ','); }
  // console.log(net);
  var d = dclone(global); // { user: dclone(user), net: net};
  d.net = net;
  d.user = user;
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
  if (global.mirrorhost) { mirror.hostname = mirrorhost; } // Override with global
  d.mirror = mirror;
  return d;
}
  
/** 
* Register this via parametric URL with param ":evtype", e.g
*     app.get('/installevent/:evtype', oninstallevent);
* and call e.g.:
*     http://localhost:3000/installevent/start
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
  catch (e) { console.error("Error loading Host JSON ("+absname+"): " +e.message);}
  //var ip = facts.ansible_facts.ansible_all_ipv4_addresses;
  //if (ip.length > 1) { throw "Ambiguity for simple logic - "+hn+" has multiple interfaces:" + ip.join(","); }
  //ip = ip[0];
  var ip = facts.ansible_default_ipv4.address;
  // Brute force cache by name and ip addr to same cache / hash table
  hostcache[hn] = facts;
  hostcache[ip] = facts;
}
/** Package counts
* 
*/
function pkg_counts (req, res) {
  // Package dir root
  var root = "./pkgcache";
  // map(function (hn) { return {name: hn, pkgcnt: 0}; });
  global.hostnames.forEach(function (hn) {
    var path = root+"/"+hn;
    // Call wc or open, split and count ? fgets() ?
    cproc.exec('wc ' + path, function (error, stdout, stderr) {
       console.log(stdout);
    });
  });
  //res.json();
}
/** TODO: Generate Ubuntu 18 Netplan.
* Extract network config essentials from Facts.
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
  np["domain"] = d["ansible_domain"];
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
