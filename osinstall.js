/** @file
 * # OS Installations recipe generation
 * 
 * - Derive OS installation context (OS, Distro, etc. mainly by URL and "osid" param passed by OS installer recipe URL call)
 * - Detect OS Install client IP and host identity, lookup host details / facts
 * - By OS install context, lookup correct template for current OS install
 * - Define partitioning layout (call disk recipe generation)
 * - Configure Network settings
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

 * 
 * # TODO
 * - Possibly load initial user here, keep as priv variable ?
 */
 
/*
 * ### Refactor: Funcs moved
 * ```
 * {
 * ipaddr_v4 ( ~ l. 328)
 * host_for_request  UNUSED
 * preseed_gen - DONE
 * patch_params - TODO: Add chained Plugin !
 * recipe_params_dummy - DONE
 * recipe_params_cloned (Unused ?)
 * params_compat DONE
 * recipe_params DONE
 * }
 * disk_params DONE
 * disk_calc_size ( ~ l. 702) DONE
 * ------ Lot of subs ----
 * netplan_yaml LEFT OUT (~ l. 860)
 * script_send DONE
 * needs_template DONE (~l. 1020)
 * ```
 */
var fs = require("fs");
var Mustache = require("mustache");
var yaml   = require('js-yaml'); // subiquity
var dns    = require("dns");
var crypto = require("crypto");

var hlr    = require("./hostloader.js"); // file_path_resolve
var osdisk = require("./osdisk.js");
var sha512crypt = require("sha512crypt-node");

// console.log("OSINTALL-osdisk", osdisk);

function dclone(d) { return JSON.parse(JSON.stringify(d)); }
// https://stackabuse.com/using-global-variables-in-node-js/
var hostcache = {};
var iptrans = {};
var global = {};
var user = {};
var iprofs = {};
var patch_params_custom; // CB (from user custom .js module)
var setupmod = {}; // custom CB Module
var logdb = {};
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
  {"url":"/install.conf",       "ctype":"openbsd",    "tmpl":"install.conf.mustache"}, // OpenBSD
  {"url":"/Autounattend.xml",   "ctype":"win",        "tmpl":"Autounattend.xml.mustache"},
  // Suse / Yast
  {"url":"/autoinst.xml",       "ctype":"suse",       "tmpl":"autoyast.autoinstall.xml.mustache"}, // ctype: "*yast*" ?
  // {"url":"/control-files/autoinst.xml",       "ctype":"suse",       "tmpl":"autoyast.autoinstall.xml.mustache"},
  {"url":"/alis.conf",       "ctype":"arch",       "tmpl":"alis.conf.mustache"},
  // Ubuntu 20 ("focal") "autoinstall" yaml (not template-only) ?
  // https://askubuntu.com/questions/1235723/automated-20-04-server-installation-using-pxe-and-live-server-image
  {"url":"/user-data",       "ctype":"ubu20",       "tmpl":"subiquity.autoinstall.yaml.mustache", "pp": pp_subiquity},
  // FCOS JSON /config.ign. Recommended to create (Butane) YAML, convert (with Butane/podman) to ign JSON
  {"url":"/config.ign",       "ctype":"fcos", "tmpl":"config.bu.mustache", "pp": pp_fcos}, // TODO: ign.mustache
];
function pp_subiquity(out, d) {
  var out2 = out;
  var y;
  var ycfg = {
    'styles': { '!!null': 'canonical' },
  };
  try { y = yaml.safeLoad(out); } catch (ex) { console.log("Failed autoinstall YAML load: "+ex); }
  // Add disk (d.diskinfo), net (d.net)
  console.log("pp_subiquity(dump):"+JSON.stringify(y, null, 2));
  if (y) {
    var dy;
    try { dy = yaml.safeLoad(d.diskinfo); } catch (ex) { console.log("Failed disk YAML load: "+ex); }
    if (!Array.isArray(dy)) { console.log("Disk YAML not parseable"); }
    // Disk
    y.autoinstall.storage.config = dy;
    // Net / Netplan
    // y.autoinstall.network.network = 
    out2 = "#cloud-config\n"+yaml.safeDump(y, ycfg);
  }
  return out2;
}
// FCOS (YAML-to-JSON)
// Do essentially what "butane" utility does to Butane-syntax YAML. Includes Initial cut
// on converting keys with "_([a-z])" to uppercase($1) (e.g. home_dir => homeDir)
// https://coreos.github.io/ignition/examples/
function pp_fcos(out, d) {
  var out2 = out;
  var y;
  var ycfg = {
    'styles': { '!!null': 'canonical' },
  };
  //console.log("Got YAML: "+out);
  try { y = yaml.safeLoad(out); } catch (ex) { console.log("Failed autoinstall yaml load: "+ex); }
  if (y) {
    delete(y.variant);
    // kernelArguments
    // Note: ignition can have config.replace.source and verification.hash (replace or ...)
    y.ignition = { version: "3.0.0" }; // Seems to be wrong for YAML, Use 3.0.0 for JSON (YAML 1.4.0)
    //y.version = 
    delete(y.version);
    var p = y.passwd;
    // ssh_authorized_keys=>sshAuthorizedKeys, password_hash=> passwordHash
    // Fix homedir because: useradd: Cannot create directory /home_install
    if (p && p.users && p.users[0]) {
      camelcase(p.users[0]);
      p.users[0]["homeDir"] = "/home/devops";
      //"$6$"+
      //var salt = "0XwRWIsO"; user.password = "";
      //salt = "0XwRWIsO";
      //let saltraw = new Buffer(salt, 'base64');
      var saltraw = crypto.randomBytes(6); // 8 hex chars = 4 bytes ? org. 16
      var salt = saltraw.toString('base64');
      console.log("Salt Raw len: "+saltraw.length);
      console.log("Salt:"+salt+" ("+salt.length+")");
      // crypto.pbkdf2Sync(“password”, “salt”, “iterations”, “length”, “digest”)
      if (!user.password) { console.log("Warning: No passwd found in pwent !"); }
      //var hash = crypto.pbkdf2Sync(user.password, salt, 5000, 64, "sha512").toString("base64"); // rounds by crypt 3 5000 (org. 1000)
      //hash = hash.replace(/=+$/, ""); // 88 => 86 (==$)
      console.log("Clear "+user.password+" ("+user.password.length+")");
      //console.log("SHA-512: "+hash + " ("+hash.length+")"); // 86
      // https://www.geeksforgeeks.org/node-js-password-hashing-crypto-module/
      // https://www.cyberciti.biz/faq/understanding-etcshadow-file/  $5$ is SHA-256 $6$ is SHA-512
      // https://www.2daygeek.com/understanding-linux-etc-shadow-file-format/
      // https://linuxconfig.org/how-to-hash-passwords-on-linux
      // mkpasswd -m sha-512 s3cRte Fopk1YbL / mkpasswd -m sha-512 -R 5000 SSSS 0XwRWIsO  ... Illegal salt character '$'.
      // https://serverfault.com/questions/330069/how-to-create-an-sha-512-hashed-password-for-shadow
      // https://blog.logrocket.com/building-a-password-hasher-in-node-js/
      // https://stackoverflow.com/questions/57109861/generate-pbkdf-sha512-hash-in-node-verifiable-by-passlib-hash-pbkdf2-sha512
      // https://www.tabnine.com/code/javascript/functions/crypto/pbkdf2
      // https://wiki.archlinux.org/title/SHA_password_hashes - Good linux and //etc/shadow centric into to password enc.
      // https://security.stackexchange.com/questions/204813/what-are-sha-rounds Info about Linux not using PBKDF2
      // https://en.wikipedia.org/wiki/PBKDF2
      // https://security.stackexchange.com/questions/211/how-to-securely-hash-passwords - Good explanations of "salt dependent functions". Also PBKDF2,bcrypt,scrypt,crypt
      
      
      // https://ciphertrick.com/salt-hash-passwords-using-nodejs-crypto/
      // https://unix.stackexchange.com/questions/52108/how-to-create-sha512-password-hashes-on-command-line - Extensive story ...
      // https://access.redhat.com/articles/1519843
      // https://github.com/mvo5/sha512crypt-node - Low level lib ... Depends on http://pajhome.org.uk/crypt/md5/sha512.html by Paul Johnston
      // http://www.akkadia.org/drepper/SHA-crypt.txt
      // https://www.npmjs.com/package/jshashes/v/1.0.6
      var hashedpass = sha512crypt.b64_sha512crypt(user.password, salt);
      p.users[0]["passwordHash"] = hashedpass; // "$6$"+ salt + "$"+ hash; // "$6$0XwRWIsO$.bEcqJy1xTLMJcwLSg7kdTsOEcwIi49Lnm6//b0FwMGSHv0rGEmw4NS189j8tTNLkPnrsGlP4LIUia8Ph.8Yc.";
      console.log("Shadow line: "+p.users[0]["passwordHash"]);
      var pubkey = fs.readFileSync(process.env['HOME']+'/.ssh/id_rsa.pub', 'utf8');
      if (pubkey) { p.users[0]["sshAuthorizedKeys"] = [pubkey]; }
      if (Array.isArray(p.users[0].groups)) { p.users[0].groups.push("docker"); }
    }
    out2 = JSON.stringify(y, null, 2);
  }
  return out2;
  function camelcase(obj) {
    var re = /_([a-z])/g;
    Object.keys(obj).forEach((k) => {
      if (k.match('_')) {
        console.log("Underscore key: "+k);
        var rep = k.replace(re, function (match, p1) { return p1.toUpperCase(); });
        console.log("Replace with: "+rep);
        obj[rep] = obj[k];
        delete(obj[k]);
      }
    });
  }
}
var recipes_idx = {};

//var tmplmap_idx = {}; // By URL !
// tmpls.forEach((it) => { tmplmap_idx[it.url] = it; });

// Pass url as req.route.path
function url_config_type(url) {
  //return tmplmap[url]; // OLD
  return recipes_idx[url].ctype;
}

/** Wrapper for getting template content by URL.
 * @param url {string} - URL through which recipe was called
 * @param forcefn {string} - template filename to force for this URL instead of one looked up from recipe info
 * @return template content
 */
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
  if (!hostcache) { throw "No hostcache"; }
  global = conf.global;
  if (!global)    { throw "No global config"; }
  iptrans = conf.iptrans;
  if (!iptrans)   { throw "No iptrans config"; }
  user = conf.user;
  if (!user)      { throw "No initial user config"; }
  if (conf.iprofs) { iprofs = conf.iprofs; console.log("Got install profiles: " + iprofs); } // Optional iprofs
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
/** Detect IP v4 address from HTTP request.
 * Address can come from
 * - Request TCP/IP Connection socket
 * - HTTP (proxy set) header "x-forwarded-for" (This will override the socket IP as "more actual")
 * @return IP Address
 */
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
  // DEPRECATED: global.targetos ||
  var osid = req.query["osid"] ||  "ubuntu18"; // TODO: 1) Later. recipe.osid
  if (xip) { console.log("Overriding ip: " + ip + " => " + xip); ip = xip; }
  // Lookup directly by IP
  var f = hostcache[ip]; // Get facts. Even no facts is ok for new hosts.
  res.type('text/plain');
  // parser._headers // Array
  console.log("preseed_gen: req.headers: ", req.headers);
  console.log("OS Install recipe gen. by (full w. qparams) URL: " + req.url + " (detected ip="+ip+", osid="+osid+")"); // osid=
  console.log("Host "+ip+" "+(f ? "HAS" : "does NOT have ")+" facts");
  var url = req.route.path; // Base part of URL (No k-v params after "?" e.g. "...?k1=v1&k2=v2" )
  var recipe = recipes_idx[url]; // Lookup recipe
  if (!recipe) { res.end("# No recipe for URL (URLs get (usually) auto assigned, How did you get here !!!)\n"); return; }
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
  // Do not support As-is No templating by sending immmediately - BAD Because we can anyways use hard template
  // (and testing would case a lot of if-elsing and exceptional return point).
  //MAYBE:else  if (p.insttmpl) {} // Load overriden template - BAD Because cannot hard-wire for arbitrary OS
  var d; // Final template params
  // Test implied osid
  if (url.match(/autounattend/i)) { osid = 'win'; } // mainly for win disk
  if (url.match(/autoinst.xml/i)) { osid = 'suse'; }
  if (url.match(/\buser-data\b/i)) { osid = 'ubuntu20'; } // As this *cannot* be fitted into URL
  console.log("osid after possible overrides (by url:"+url+"): "+osid);
  var hps = hlr.hostparams(f) || {}; // Host params
  // No facts (f=null) is okay here
  d = recipe_params_init(f, global, user, ip);
  // Note even custom hosts are seen as having facts (as minimal dummy facts are created)
  if (f) { // Added && f because we depend on facts here // OLD: !skip &&
    // If we have facts (registered host), Lookup inventory hostparameters
    // var p = global.hostparams[f.ansible_fqdn]; // f vs. h
    // hps = hlr.hostparams(f) || {}; // NEW: lookup ! Above
    //d = recipe_params_init(f, global, user);
    // See if install profile should be used
    //var iprofs = null; // Direct module-global
    // TODO (difficult): Make install prof possible for non-fact hosts by maybe deriving profile from IP (/netmask) ?
    /*
    if (hps.iprof && iprofs && iprofs[hps.iprof]) {
      console.log("Apply install profile for "+ip);
      recipe_params_iprof(d, iprofs[hps.iprof]);
    }
    */
    //d =
    //recipe_params_net_f(d, f, ip); // , global, ip,  osid, ctype . Serves no purpose anymore !
    if (!d) { var msg = "# Parameters could not be fully derived / decided on\n"; console.log(msg); res.end(msg); return; }
    // Depends on facts, but still conditional on ... ??? "netbyfacts"
    if (d.net.byfacts) { console.error("Calling factbased net override: netconfig_by_f(net, f) (by: f:" + f + ")"); netconfig_by_f(net, f); } // tolerant of f=null
    netconfig_ifnum(d.net, f); // LEGACY (not-used?): Gen if num.
  }
  // Dummy params without f - At minimum have a valid object (w. global params)
  // Having 
  // OLD (inside else): d = {httpserver: global.httpserver };
  // TODO: Allow ip to also overtake here (do net init)
  else {
    //d = recipe_params_init(null, global, user); // null = No facts
    //hps = hlr.hostparams(f) || {}; // call scores proper null for !f. Above
    console.log("no-facts: Got Dummy HPS: ", hps);
    // IP Could be of some use even if facts were not gotten by it.
    var xd = recipe_params_dummy(d, osid, ip); // Does curr. not need osid (2nd)
    console.log("Not a known host with facts "); // TEST (for async/await): +xd (funcs marked async return promise)
  }
  // Postpone this check to see if facts (f) are needed at all !
  if (!d ) { // && !skip // TODO: Update error message below
    var msg2 = "# No IP Address "+ip+" found in host DB (for url: "+url+",  f="+f+")\n"; // skip="+skip+",
    res.end(msg2); // ${ip}
    console.log(msg2); // ${ip}
    // "Run: nslookup ${ip} for further info on host."
    return; // We already sent res.end()
  }
  // Moved latter univ. applicable stages (from recipe_params_init) here
  // Tweaks to params, e.g. appending additional lines, Centos/RH net.dev =  net.mac
  console.log("Call patch (stage 2 param formulation) ...");
  patch_params(d, osid); // Tolerant of no-facts
  netconfig_late(d.net);
  net_strversions(d.net); // Late !
  recipe_params_disk(d, osid, ctype); // DISK
  console.error("Calling mirror_info(global, osid) (by:" + global + ")");
  d.mirror = mirror_info(global, osid, ctype) || {};
  // d.mirror = mirror; // No intermed var

  if (patch_params_custom) { patch_params_custom(d, osid); }
  // Copy "inst" section params to top level for (transition period ?) compatibility !
  params_compat(d);
  d.hps = hps; // Host params !
  params_verify(d);
  if (req.query.json) { return res.json(d); }
  //////////////////// Config Output (preseed.cfg, ks.cfg) //////////////////////////
  //OLD2: var tmplcont = template_content(ctype); // OLD global.tmpls[ctype]; // OLD2: (ctype) => (url)
  // Lookup hostparams to facilitate preseed / debian-installer debugging with hard wired/literal preseeds (from internet)
  var forcefn = (url.match(/preseed.cfg/) && hps.preseed) ? hps.preseed : null;
  if (osid == 'ubuntu20' && hps.subiud) { forcefn = hps.userdata; } // subiquity troubleshoot
  var tmplcont = template_content(url, forcefn); // forcefn => Overriden fn
  if (!tmplcont) { var msg3 = "# No template content for ctype: " + ctype + "\n"; console.log(msg3); res.end(msg3); return; }
  console.log("Starting template expansion for ctype = '"+ctype+"', forced template: '"+forcefn+"'"); // tmplfname = '"+tmplfname+"'
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

/** Verify and validate presence of must-have sections in final recipe params.
 * Throw exceptions on any errors.
 */
function params_verify(d) {
  if (!d.user) { throw "No initial user"; } // Initial user
  if (!d.mirror) { throw "No package mirror info"; }
  // NOTE: Some disks only have "partials" (No diskinfo)
  // Eliminated diskinfo and partials validation even if currently (See: recipe_params_disk()):
  // - ONLY suse and Win should have d.partials (but do NOT have d.diskinfo).
  // - Others (not suse or Win) have d.diskinfo (but not partials)
  // So either one should be present.
  // NOT: Seems custom items in recipes (see top) with special "ctype" can throw this expectation off
  // One of osid:s have to match !
  if (!d.diskinfo && !d.partials) { throw "No disk recipe content (both diskinfo and partials missing)"; } // Disk recipe content
  if (d.disk) { throw "Legacy ansible 'disk' info is remaining"; }
  if (!d.hps) { throw "No host iventory (k-v) params"; }
}

/** Do situational and custom patching on params.
* TODO: Separate these as osid specific plugins, where each plugin can do
* patching for os. Some plugins could be user written to facilitate particular
* environment (Also possibly contributed as "useful examples", also possibly
* making their way into this app as toggelable plugins.
* Add here member d.appendcont to produce completely new Preseed / KS. directives.
* @param d {object} - Templating params produced originally in recipe_params()
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
    if (!net) { console.log("No d.net for patching centos/rh (" + osid + ")"); return; }
    // RH and Centos 7 still seems to prefer "em" (Check later ...)
    // values: macaddr, "link" (first link connected to switch), bootif (from pxelinux if IPAPPEND 2 in pxelinux.cfg and BOOTIF set)
    // net.dev = "em" + net.ifnum;
    if (net.macaddress) { net.dev = net.macaddress; } // net.macaddress set earlier from facts
    else { console.log("Warning: Centos/RH ('"+osid+"') needs net.macaddress as net.dev, but Not available !"); }
  }
}
/** Create dummy params (minimal subset) that ONLY depend on global config.
 * This approach is needed for hosts that are being installed and make a http call
 * for dynamic kickstart or preseed (or other recipe), but are NOT known to linetboot by their facts.
 * See recipe_params() for creating params from facts (for a comparison).
 * @param global {object} - main config
 * @param osid {string} - OS ID label, coming usually from recipe URL on kernel command line (E.g. ...?osid=ubuntu18)
 * @return Made-up host params
 */
//async
function recipe_params_dummy(d, osid, ip) { // TODO: rm ip (Use d.net.ip)
  var net = d.net;
  // Make up hostname ???
  // We could also lookup the hostname by ip (if passed), by async. Use await here ?
  net.hostname = "MYHOST-001"; // Dummy or by DNS lookup ? Generate unique by ip ?
  var iparr = net.ipaddress.split(/\./);
  net.hostname = "UNKNOWN-"+iparr.join("-");
  // net.ipaddress = ip; // At init
  // https://stackoverflow.com/questions/54887025/get-ip-address-by-domain-with-dns-lookup-node-js (Wrapping)
  // await dnsPromises.reverse(ip); // Added in 10.6 (Ubu: v8.10.0)
  
  dns.reverse(ip, function (err, domains) {
    if (err) { console.log("Error in reverse lookup !"); return; }
    if (!Array.isArray(domains)) { console.log("DNS names not in array !"); return; }
    // Array of DNS names, pick [0]
    console.log("DNS-reverse(hostname): ", domains[0]);
  });
  
  async function lookupPromise(ip) {
    // await here is opt
    return  new Promise((resolve, reject) => {
        dns.reverse(ip, (err, domains) => {
            if ( err ) { return reject(err); }
            // Validate, reject
            console.log("DNS-promise-reverse(hostname): ", domains[0]);
            return resolve(domains[0]);
        });
     });
  }
  // await
  //net.hostname = await lookupPromise(ip);

  // var gw = net.gateway;
  //var iparr = gw.split(/\./);
  // iparr[3] = 111; // !!!
  // net.ipaddress = ip; // iparr.join('.'); // Get/Derive from net.gateway ?
  console.log("Gave value to hostname: ", net.hostname);
  //net.domain 
  //net.nameservers = net.nameservers.join(" ");
  
  // NOTE: user.groups Array somehow turns (correctly) to space separated string. Feature of Mustache ?
  //NOT:d.disk = disk;
  /////////////////////////// Mirror - Copy-paste or simplify
  // BAD. Use shared mirror logic as osid will be in recipe URL.
  //d.mirror = { "hostname": global.mirrorhost, "directory": "/" + osid }; // osid ? "/ubuntu18"
  // TODO: Share w. main logic. NOTE: postscript (singular) is an OLD var.
  // d.postscript = global.inst.postscript; // TODO: Can we batch copy bunch of props collectively (We already do, but see timing order)
  //console.log("Ret 66");
  return 66; // d
}
/** Allow Installation profile to override values in recipe parameters.
 * The rules for override are set here and keys of iprof affect multiple sections in config.
 * Note: The true values in iprof that will override values in "net" section are expected to be of correct
 * type and have a valid meaningful value. No validation is performed here.
 * @param d {object} - installation recipe parameters to possibly modify
 * @param iprof {object} - Installation profile discovered by caller
 * Note: The timing of this op is important. Try to set early so that
 * - string and CSV versions of multi-val keys are created after
 * - Any complex deriving, manipulation, override is done after
 */
function recipe_params_iprof(d, iprof) {
  if (!d) { console.log("No recipe param object for iprof override"); return; }
  if (!d.net) { console.log("No recipe param 'net' section for iprof override"); return; }
  if (!d.inst) { console.log("No recipe param 'inst' section for iprof override"); return; }
  if (!iprof) { console.log("No iprof param object for iprof override"); return; }

  // "net" section keys. Any of these in iprof override net keys.
  var netkeys = ["domain","netmask","gateway","nameservers","namesearch", "nisdomain","nisservers"]; // "ntpserver"
  netkeys.forEach((k) => {
    if (iprof[k]) { d.net[k] = iprof[k]; console.log("iprof["+k+"] overriden in net-section (val:"+iprof[k]+")"); }
  });
  // "inst" section keys
  var instkeys = ["locale","keymap","time_zone", "install_recommends", "postscripts"];
  instkeys.forEach((k) => {
    if (iprof[k]) { d.inst[k] = iprof[k]; console.log("iprof["+k+"] overriden in inst-section (val:"+iprof[k]+")"); }
  });
}

/** Clone global params and do basic universally applicable setup on them.
* Setup done here should be applicable to all/both use cased "old machine - have facts" and "new machine - don't have facts".
* 
* @param global {object} - Main config
* @param user {object} - initial user object
* @return Install templating params that can be further customized.
*/
function recipe_params_cloned(global, user) {
  //var net = dclone(global.net);
  var d = dclone(global);
  //d.net = net;
  d.user = user;
}
/** Create Per-OS-Install recipe params instance by cloning main config.
 * Use detected / URL-overriden ip address as driving key (record it as-is).
 * Add crucial core members early here (from facts): macaddress, hostname.
 * @param f {object} - Host Facts object
 * @param global {object} - Main config
 * @param user {object} - User object
 * @param ip {string} - IP Address of (OS) install client
 */
 function recipe_params_init(f, global, user, ip) {
  var d = dclone(global);
  if (f) {
    d.hps = hlr.hostparams(f) || {}; // Add early to d !!!
    // Record MAC and hostname already early (if possible)
    var anet = f.ansible_default_ipv4;
    d.net.macaddress = anet ? anet.macaddress : "";
    d.net.hostname = f.ansible_hostname ? f.ansible_hostname : "";
    // Has Install profile ? Apply override already here.
    if (d.hps.iprof && iprofs && iprofs[d.hps.iprof]) {
      console.log("Apply install profile '"+d.hps.iprof+"' for ip:"+ip);
      recipe_params_iprof(d, iprofs[d.hps.iprof]);
    }
  }
  d.user = user;
  if (!d.net) { console.log("recipe_params_init: Error: No net section !"); return null; }
  d.net.ipaddress = ip;
  // Remove select unnecessary sections
  return d;
}
// Compatibility-copy install params from "inst" to top level
function params_compat(d) {
  // For now all keys (Explicit: "locale","keymap","time_zone","install_recommends", "postscripts")
  if (!d.inst) { return 0; }
  Object.keys(d.inst).forEach((k) => { d[k] = d.inst[k]; });
  // Just before Recipe or JSON params dump delete cluttering parts that will never be used in OS install context.
  // This is also a good note-list of what should likely not be there (in main config) at all.
  // Note: Theoretically customizations might do someting w. groups
  // function param_sections_rm(d) {
  delete(d.groups);
  delete(d.tftp);
  delete(d.hostnames);
  delete(d.ansible);
  delete(d.hostparams); // global for all hosts
  delete(d.mirrors); // legacy
  // Later added sections
  delete(d.web);
  delete(d.dhcp); // early
  delete(d.docker);
  delete(d.iblox);
  delete(d.eflow);
  delete(d.esxi);
  delete(d.procster);
  delete(d.cov);
  delete(d.core); // Consider/revert (has e.g. appname)
  delete(d.ipmi); // Consider (IPMI ops) !
  // } 
}


/** Generate recipe parameters for OS installation.
* Parameters are based on global linetboot settings and host
* specific (facts) settings.
* The final params returned will be directly used to fill the template.
* @param f - Host Facts parameters (from Ansible)
* @param global - Global config parameters (e.g. network info)
* @param ip - Requesting host's detected (or param ip=... overriden) IP Address
* 
* @param osid - OS id (, e.g. "ubuntu18", affects mirror choice)
* @param ctype - Config type (e.g. "preseed", "ks", ... See recipes structure in this module)
* @return Parameters (structure, somewhat nested, w. sub-sections net, user) for generating the OS Install recipe or
* null to signal immediate termination of recipe generation.
* TODO: Passing osid may imply ctype (and vice versa)
*/
// OLD: @param (after ip) ctype - Configuration type (e.g. ks or preseed, see elswhere for complete list)
function recipe_params_net_f(d, f, ip) { // , global, ip,  osid, ctype
  //if (!ctype) { ctype = ""; }
  var net = d.net; // shortcut
  var anet = f.ansible_default_ipv4; // Ansible net info
  // Many parts of recipe creation might need hostparams (hps)
  //var hps = hlr.hostparams(f) || {}; // Add early to d !!! .. and use d.hps
  //console.log("HPS:",hps);
  // Validate IP early (or only as part of net stuff)
  /*
  if (anet.address != ip) {
    var msg = "# Host-facts IP and detected (or overriden) ip not in agreement\n";
    res.end(msg); // NOTE NO res !!!!!!
    console.log(msg);
    return null;
  }
  * */
  // TODO: Move to net processing (if (ip) {}
  // net.ipaddress = ip; // Let override (ip=..) prevail ? // Neutral / Now at init
  //net.macaddress = anet ? anet.macaddress : ""; // Useful for RH/Centos. Already at init !
  ////////////////////////// NETWORK /////////////////////////////////////
  
  
  
  ///////////////////////// DISK /////////////////////////////////
  // Ansible based legacy calc (imitation of original disk).
  // TODO: Disable, as this is not currently used (make configurable / optional).
  //console.error("Calling (Ansible-based) disk_params(f) (by:" + f + ")");
  //var disk = osdisk.disk_params(f);
  
  // OLD: Disk

  // Comment function
  d.comm = function (v)   { return v ? "" : "# "; };
  d.join = function (arr) { return arr.join(" "); }; // Default (Debian) Join
  //if (osid.indexof()) {  d.join = function (arr) { return arr.join(","); } }
  //////////////// OLD: Choose mirror (Use find() ?) //////////////////
  
  return d;
}

/** Create disk recipe based on osid, ctype.
 * Adds (to templating params d):
 * - diskinfo stucture in members(s): parr, parts.
 * - Possible/optional partials for more complex (XML) based recipes
 * - recipe disk "formula" content to diskinfo whenever recipe can be fully expanded here
 *   (for many/most install types).
 */
function recipe_params_disk(d, osid, ctype) {
  var hps = d.hps || {};
  if (!osid || !ctype) { return; }
  // NOTE: Override for windows. we detect osid that is "artificially" set in caller as
  // dtype is no more passed here.
  
  // Assemble. TODO:
  // - Make "inst" top level
  // - Ensure lindiskdev is present (even if just for debugging). See at bottom !
  if (hps.lindiskdev) { } // or ! ... ?
  ////////////////////// DISK ////////////////////////////////
  // TODO: Make into object, overlay later
  // var di = {parts: null, partials: null, instpartid: 0} // also lindisk: "sda", ptt: '...'
  var parts; var partials; var instpartid;
  var ptt = hps["ptt"] || 'mbr';
  // TODO: Merge these, figure out lin/win (different signature !)
  if (osid.match(/^win/)) {
    parts = osdisk.windisk_layout_create(ptt);
    console.log("Generated parts for osid: "+osid+" pt: "+ptt);
    partials = osdisk.tmpls; // TODO: merge, not override !
    d.instpartid = instpartid = parts.length; // Windows only ... Because of 1-based numbering length will be correct
  }
  if (osid.match(/^suse/)) {
    parts = osdisk.lindisk_layout_create(ptt, 'suse');
    console.log("Generated parts for osid: "+osid+" pt: "+ptt);
    partials = osdisk.tmpls; // TODO: merge, not override !
  }
  // This and the rest produce content, not params for partials
  if (osid.match(/ubu/) || osid.match(/deb/)) { // /(ubu|deb)/
    parts = osdisk.lindisk_layout_create(ptt, 'debian');
    let out = osdisk.disk_out_partman(parts);
    console.log("PARTMAN-DISK-INITIAL:'"+out+"'");
    
    out = osdisk.partman_esc_multiline(out);
    console.log("PARTMAN-DISK-ESCAPED:'"+out+"'");
    d.diskinfo = out; // Disk Info in whatever format directly embeddable in template
  }
  // Note: MUST also test for preseed URL as Ubu 20 can also run in legacy preseed mode !!!
  if (osid.match(/ubuntu2\d/) && !ctype.match(/preseed/)) {
    parts = osdisk.lindisk_layout_create(ptt, 'debian');
    let out = osdisk.disk_out_subiquity(parts);
    console.log("SUBIQUITY-DISK-INITIAL:'\n"+out+"'");
    d.diskinfo = out;
  }
  if (osid.match(/(centos|redhat|rocky)/)) {
    parts = osdisk.lindisk_layout_create(ptt, 'centos');
    let out = osdisk.disk_out_ks(parts);
    console.log("KICKSTART-DISK-INITIAL:'"+out+"'");
    d.diskinfo = out;
  }
  // ALREADY: d.user = user; // global (as-is). TODO: Create password_hashed
  // DEPRECATED: d.disk = disk; // Ansible diskinfo gets put to data structure here, but template decides to use or not.
  d.parr = d.parts = parts; // TODO: Fix to singular naming (also on tmpls)
  d.partials = partials; // Suse or Win (XML)
  // TODO Change: tmpl/alis.conf.mustache, tmpl/ks.cfg.mustache (Uses only "sda" format), tmpl/preseed.cfg.mustache, tmpl/preseed_mini.cfg.mustache
  // osdisk.js: tmpls.yastdrive (<device>/dev/sda</device>), disk_out_ks(parr) var drive = "sda"; disk_out_subiquity() path: "/dev/sda"
  d.lindisk = hps.lindisk || "sda"; // d.inst.lindisk ? OLD (full path): "/dev/sda"
  return 0; // Disk info ?
}

/** Choose final package repo mirror servers for currently installed OS.
 * Use (global config and) osid (passed as query variable from boot menu) to drive the decision.
 * Set "hostname" and "directory" (path on mirror server) into the returned object.
 * @param global - Main config structure
 * @param osid - OS id label (from boot menu recipe URL) passed to server as query parameter
 * @param ctype - Config type
 * @return Mirror config with "hostname" and "directory".
 * 
 * ## Info on mirror settings on OS
 * - Debian/Ubuntu:
 * - Centos: Directive "url --url http://..." (Addl repos: repo --name ... --baseurl ...)
 *   - Directory should have subdir repodata/ (and file .discinfo ?)
 * 
 * Refs:
 * - https://serverfault.com/questions/147321/kickstart-ks-cfg-where-should-url-url-point
 * - https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/7/html/installation_guide/sect-kickstart-syntax
 */
function mirror_info(global, osid, ctype) {
  osid = osid || "";
  
  // Logic for missing osid but calls via URL "/preseed.cfg" (e.g. "Recipes Preview")
  // if (!osid && somerecipe.url.match(/^preseed.cfg/)) { osid = 'ubuntu'; } // Force Default on missing osid ?
  var mirrcfg = {osid: osid, hostname: global.httpserver, directory: ""}; // Default to local linetboot server and loop mounted media as mirror
  // Lookup table from osid to directory name and optional internet mirror.
  // Keep items ordered with most specific first (e.g. ^ubuntu16 before ^ubuntu).
  var mirrmatch = [
    // dir is the default *internet* mirrror dir. TODO: Have separate dir/inetdir
    {patt: "^ubuntu16", dir: "/ubuntu", inetmirrhost: "us.archive.ubuntu.com", useinet: true},
    {patt: "^ubuntu",   dir: "/ubuntu", inetmirrhost: "us.archive.ubuntu.com"}, // ^ubuntu(\d+) ?
    // NOT: Assume "netboot" (netboot.tar.gz) and NO repos/packages in tar.gz
    {patt: "^debian",   dir: "/debian", inetmirrhost: "ftp.us.debian.org"} // useinet: true
    // Centos ...
    
  ];
  // lookup match node
  var mn = mirrmatch.find((mn) => { return osid.match(new RegExp(mn.patt)); });
  if (mn) {
     
     // Check for global preference for internet mirrors or osid-based preference for internet mirrors
     if (global.inst.inetmirror || mn.useinet) {
       mirrcfg.hostname  = mn.inetmirrhost;
       mirrcfg.directory = mn.dir; // grab internet mirror dir from mn
     }
     // Local mirror: Change mirror dir to match osid (assumed to be the local mount dir)
     else { mirrcfg.directory = "/" + osid; }
     // Exception for Ubu 20 preseed / ubuntu-20.04.1-legacy-server-amd64.iso
     // TODO: Consider osid ubuntu20legacy (would work for general rule above)
     if (osid.match(/ubuntu20/) && ctype.match(/preseed/)) { mirrcfg.directory = "/ubuntu20legacy"; }
     console.log("Got-mn:", mn);
     console.log("Generated-mirrcfg:", mirrcfg);
     return mirrcfg;
  }
  // For ubuntu / debian set params to use in recipe vars mirror/http/hostname and mirror/http/directory
  if (global.inst.inetmirror) {
    if (osid.match(/^ubuntu/)) { return {hostname: "us.archive.ubuntu.com", directory: "/ubuntu"}; }
    // See: https://www.debian.org/mirror/list (http://ftp.us.debian.org/debian/)
    if (osid.match(/^debian/)) { return {hostname: "ftp.us.debian.org", directory: "/debian"}; }
  }
  // Local linetboot based mirror (from loopmounted ISO image), only hostname changes
  else {
    if (osid.match(/^ubuntu/)) { return {hostname: global.httpserver, directory: "/ubuntu"}; }
    if (osid.match(/^debian/)) { return {hostname: global.httpserver, directory: "/debian"}; }
  }
  // Legacy (to-be-discontinued) way of choosing mirror
  var choose_mirror = function (mir) { return mir.directory.indexOf(osid) > -1 ? 1 : 0; };
  var mirror = global.mirrors.filter(choose_mirror)[0]; // NOT: Set {} by default
  if (!mirror) { console.log("No Mirror"); return null; } // NOT Found ! Hope we did not match many either.
  console.log("Found Mirror("+osid+"):", mirror);
  mirror = dclone(mirror); // NOTE: This should already be a copy ?
  // Linetboot or other globally used Mirror
  if (global.mirrorhost && mirror) { mirror.hostname = global.mirrorhost; } // Override with global
  return mirror;
}

/** Configure network params for host by ansible facts (letting them override env settings).
 * Create netconfig as a blend of information from global network config and hostinfo facts.
 * TODO:
 * - NOT: Take from host facts (f) f.ansible_dns if available !!! Actually f.ansible_dns.nameservers in Ubuntu18
 *   will have systemd originated value '127.0.0.53'
 * - Pass (or enable access) to host params, e.g. for network if name override.
 * - Need to pass also other info (e.g. osid, os hint to make proper decision on interface naming)
 * See also: linetboot.js - netplan_yaml()
*/
function netconfig_by_f(net, f) {
  if (!f) { console.log("netconfig_by_f: No Facts !"); return net; } // No facts, cannot do overrides
  var anet  = f.ansible_default_ipv4 || {}; // Ansible Net
  var dns_a = f.ansible_dns || {}; // Has search,nameservers
  
  // Override nameservers, gateway and netmask from Ansible facts (if avail)
  if (dns_a.nameservers && Array.isArray(dns_a.nameservers)) {
    // Dreaded systemd 127.0.0.53
    if ( ! dns_a.nameservers.includes('127.0.0.53')) { net.nameservers = dns_a.nameservers; }
    
  }
  // NOTE: Do same for ansible dns_a.search / net.namesearch
  if (dns_a.namesearch && Array.isArray(dns_a.namesearch)) {
    net.namesearch = dns_a.namesearch;
  }
  // On smaller networks there is none.
  // if (!net.namesearch && dns_a.search && Array.isArray(dns_a.search)) { net.namesearch = dns_a.search; }
  
  // Domain !
  if (f.ansible_domain) { net.domain = f.ansible_domain; }
  net.hostname = f.ansible_hostname; // What about (async) DNS lookup ?
  
  // TODO: net.nameservers_ssv // Space separated values (?)
  if (anet.gateway) { net.gateway = anet.gateway; }
  if (anet.netmask) { net.netmask = anet.netmask; }
  return net;
}
  
function netconfig_late(net) {
  
  /////////////// NEUTRAL (Late) //////////
  // With netmask locked in, calc cidr
  net.cidr = netmask2CIDR(net.netmask); // Neutral, Late
  // Derive network (*.0) from gateway (for e.g. routing tables)
  net.network = gateway2network(net.gateway); // Neutral, Late (non-f)
  /////// Current network Baroadcast (Similar to gateway2network) //////
  //var gwarr = net.gateway.split(".");
  //gwarr[3] = "255";
  //net.broadcast = gwarr.join(".");
  net.broadcast = gateway2network(net.gateway, 255); // NEW
  //net.dev = anet.interface; // See Also anet.alias. Too specific !
  // Note: Centos/RH may have set this to MAC already (very useful), thus if ...
  if (!net.dev) { net.dev = "auto"; } // Neutral, Default on Deb/Ubu ?
  
  return net;
}
  
  /** Extract interface number from facts */
function netconfig_ifnum(net, f) {
  if (!f) { return net; }
  var anet  = f.ansible_default_ipv4 || {}; // Ansible Net
  // Extract interface (also alias) number (ifnum) !
  // Rules for extraction:
  // - We try to convert to modern 1 based (post eth0 era, interfaces start at 1) numbering 
  var ifnum; var marr;
  if      ( anet.interface && (marr = anet.interface.match(/^eth(\d+)/)) )      { ifnum = parseInt(marr[1]); ifnum++; } // Old 0-based
  else if ( anet.interface && (marr = anet.interface.match(/^(em|eno)(\d+)/)) ) { ifnum = parseInt(marr[2]); } // New 1-based
  else { console.log("None of the net-if patterns matched: " + anet.interface); ifnum = 1; } // Guess / Default
  net.ifnum = ifnum;
  //console.log("network config: ", net);
  return net; // ???
}

// Net Helpers (TODO: See what's needed)
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

/** Create string versions of multi-valued network variables for templating.
 * Call this as late as possible, so that no changes are made to network info
 * (esp. for members from which string versions are generated here).
 * These are given suffixes base on the delimiter used:
 * - "_str" - for space delimited string
 * - "_csv" - for comma separated values
 * - "_ssv" - space separated values (same as _str, somewhat redundant)
 * @param net {object} - Network config object
 * @return none
 */
function net_strversions(net) {
  if (typeof net != 'object') { return; } // TODO: "Real" Object (not null, bool)
  //var aprops = ["nameservers", "namesearch", "nisservers"];
  //aprops.forEach((prop) => {
  //  if (net[prop] && Array.isArray(net[prop])) {
  //    net[prop+"_str"] = net[prop+"_ssv"] = net[prop].join(" ");
  //    net[prop+"_csv"] = net[prop].join(",");
  //    net[prop+"_first"] = net[prop][0];
  //  }
  //});
  // TODO: net.nameservers_first (Note: s)
  net.nameservers_first = net.nameservers[0]; // E.g. for BSD, that only allows one ?
  net.nameservers_csv  = net.nameservers.join(','); // Account for KS needing nameservers comma-separated
  
  // NOT: net.nameservers = net.nameservers.join(" ");
  net.nameservers_ssv = net.nameservers.join(" ");
  net.nameservers_str = net.nameservers.join(" ");
  //OLD:net.nameservers = net.nameservers.join(" "); // Debian: space separated
  // namesearch
  if (net.namesearch) { net.namesearch_str = net.namesearch.join(" "); net.namesearch_csv = net.namesearch.join(","); }
  // OLD: if (ctype == 'ks') {  } // Eliminate ctype and "ks", make universal
  
  // ABOVE: net.nameservers_first = net.nameservers[0];
  
  net.nisservers_str = Array.isArray(net.nisservers) ? net.nisservers.join(' ') : "";
  
}

// OLD: Disks

// TODO: Design graceful recovery (from bad input)
function gateway2network(gw, forceoctet) {
  if (!gw || typeof gw != 'string') { console.log("GW not in string"); return ""; }
  var octarr = gw.split(".");
  if (octarr.length != 4) { console.log("Warning: Got "+octarr.length+ " octets, expected 4"); }
  var last = octarr.pop();
  if (last != '1') { console.log("Warning: Got "+last+ " as last octet of GW, expected 1"); }
  octarr.push(forceoctet ? forceoctet : "0");
  return octarr.join(".");
}
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
    ////// New: Setup parameter here in a universal fashion (Identical to recipe gen.).
    // This should satisfy almost any "tcp" case See: if (tcp) {...} above (*except* for "sysinfo")
    // Case(s) "user" (and "net") will get affected most (esp. in templates, e.g. {{username}} => {{user.username}}).
    var osid = ""; // Note dummy osid. TODO: ... ?
    var ctype = "";
    var d = recipe_params_init(f, global, user, ip);
    if (!f) { var xd = recipe_params_dummy(d, osid, ip); } // osid no more used in func
    patch_params(d, osid); // Tolerant of no-facts and osid empty (not null)
    netconfig_late(d.net);
    net_strversions(d.net); // Late !
    recipe_params_disk(d, osid, ctype); // Returns on no osid, no ctype
    //console.error("Calling mirror_info(global, osid) (by:" + global + ")");
    // d.mirror = mirror_info(global, osid, ctype) || {}; // Eliminate for now
    //if (patch_params_custom) { patch_params_custom(d, osid); }
    params_compat(d); // Puts stuff to top-level, deletes
    var p = {};
    var np = require("./netprobe.js"); // .init(...) Rely on earlier init(), but has init-guard
    // TODO: Try merge templates to use notation (e.g.) user.username (not plainly "username")
    // in favor of using single / unified parameter context
    console.log("Templating param context: "+tpc);
    if (tpc == 'user') {
      p = d.user; // dclone(user);
      //p.httpserver = global.httpserver; // Already at bottom
      // SSH Keys (also host) ?
      // linet_sshkey and linet_hostkey are not fully used by ssh_keys_setup.sh (Uses ssh-keyscan)
      //p.linet_sshkey = np.pubkey();
      //p.linet_sshkey = p.linet_sshkey.replace(/\s+$/, "");
      //var hk = fs.readFileSync("/etc/ssh/ssh_host_rsa_key.pub", 'utf8');
      //if (hk) { hk = hk.replace(/\s+$/, ""); p.linet_hostkey = hk; }
      // Add host params
      
      p.hps = hps; // Also d.hps if f was avail.
      // See NIS info -  "nisservers", "nisdomain" from global.net
      /*
      p.nisservers = d.net.nisservers || []; // OLD: global.net.nisservers || [];
      console.log("NIS Servers: ", p.nisservers);
      // Simplify these with new param formulation ?
      p.nisdomain  = hps.nis || d.net.nisdomain || "";
      p.nisamm     = hps.nisamm || d.net.nisamm || "auto.master"; // Fall to empty, let script defaut ?
      */
      p.net = d.net;
      // NEW: Nest Duplicate in user for interim compatibility
      p.user = p;
      console.log("TPC-user: ", p);
    }
    if (tpc == 'net') {
      p = d.net; // OLD: dclone(global.net). d is copy already
      p.httpserver = d.httpserver; // Complement w. universally needed var
      if (f) {
        var anet = f.ansible_default_ipv4 || {};
        // p.httpserver = 
        // Should be in already (comment out). Deprecate (abbrev) "macaddr"
        p.ipaddress = anet.address;
        p.hostname = f.ansible_hostname;
        p.macaddress = p.macaddr = anet.macaddress;
        console.log("Net-context: ", p);
      }
      // Already have NIS servers if needed ...
    } // TODO: adjust
    if (tpc == 'global') { p = d; p.postscripts = p.inst.postscripts; } // OLD: p = global
    // Custom ... how to formulate this into more static config ? clone global and add ?
    if (tpc == 'sysinfo') {
      // process.getgid(); // Need to translate
      p = {linetapproot: process.cwd(), linetuser: process.env["USER"], linetgroup: process.getgid(), linetnode: process.execPath};
    }
    // Universal setup
    //if (p.nisservers) { p.nisservers_str = p.nisservers.join(' '); } // Already: params_compat()
    if (f && f.ansible_distribution) { p.distro = f.ansible_distribution; } // Others: ansible_os_family
    p.httpserver = d.httpserver;
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
/** Produce a web listing of Recipes too allow reviewing recipe content.
 * Let recipes (module variable) drive the generation of grid.
 */
function recipe_view(req, res) {
  var hostfld = {name: "hname", title: "Host", type: "text", css: "hostcell", width: 200};
  var grid = [hostfld]; // Grid def (stub to add recipes to - as cols)
  // var keys = Object.keys(tmplmap);
  var urls = []; // Add various URL:s from structure
  // OLD: keys. NEW: recipes.
  recipes.forEach((k) => { // OLD: k == URL NEW: k == Object 
    //var fld = {name: tmplmap[k],  title: tmplmap[k], type: "text", width: 80, itemTemplate: null};
    // NOTE: ctype gets used here (for name,title) and overlapping ctype values will cause problems !!!
    var fld = {name: k.ctype, title: k.ctype, type: "text", width: 80, itemTemplate: null};
    // Add to URL:s and Grid cols side-by-side
    //urls.push(k); // OLD
    urls.push(k.url); // AoString
    grid.push(fld);
  });
  res.json({status: "ok", grid: grid, urls: urls, data: [], rdata: recipes, scriptnames: scriptnames});
}
/** Web handler for viewing installation profiles (HTTP GET).
 * Installation profiles are loaded already at module init.
 */
function instprofiles_view(req, res) {
  var jr = { status: "err", msg: "Problem loading install profiles. " };
  if (!iprofs) { jr.msg += "No install profiles (null)"; return res.json(jr); }
  var keys = Object.keys(iprofs);
  if (!keys.length) { jr.msg += "No install profile keys"; return res.json(jr); }
  var iprofs_arr = [];
  keys.forEach((k) => {
    iprofs[k].id = k;
    iprofs_arr.push(iprofs[k]);
  });
  return res.json({status: "ok", data: iprofs_arr});
}

function recipes_view(req, res) {
   res.json(recipes);
}

/** Log install step for client.
 */
function ilog(ip, type, msg) {
  if (!ip) { console.log("ilog: Must Have IP !"); return; }
  if (!Array.isArray(logdb[ip])) { logdb[ip] = []; } // First logent, init
  if (!type || !msg) { console.log("ilog: Must Have type and msg !"); return; }
  var ent = { type: type, msg: msg };
  ent.time = new Date().toISOString();
  logdb[ip].push(ent); // In-mem
}
/** View install log for one (for now) or many hosts ?
 * TODO: Allow all logs (AoA or AoOoA).
 * Fields: time,type, msg
 */
function ilog_view(req, res) {
  var jr = {status: "err", msg: "Problem showing Install log(s). "};
  var ip = req.query.ip;
  // TODO: w/o IP )or with special command or URL) - list IP:s (+hostnames ?)
  if (!ip) { jr.msg += " No IP address given"; return res.json(jr); }
  var ilog = [];
  ilog = logdb[ip]; // Ents by one IP
  if (!Array.isArray(ilog)) { jr.msg += " No log found for IP: "+ip; return res.json(jr); }
  
  return res.json({status: "ok", data: ilog});
}
/** View list of hosts that presently have (in-memory) install log.
 */
function ilog_view_hosts(req, res) {
  var jr = {status: "err", msg: "Problem showing Install hosts(s). "}; // Needed ?
  var keys = Object.keys(logdb);
  if (!keys) { return res.json({status: "ok", data: []}); } // None, but not error
  var hosts = [];
  keys.forEach((k) => {
    var hent = {hname: "", ipaddr: k};
    // Lookup facts, hostname
    var f = hostcache[k]; // By IP
    if (!f) { console.log("Unknown host by ip: "+k); return; }
    hosts.push(hent);
  });
  return res.json({status: "ok", data: hosts});
}
module.exports = {
  init: init,
  url_hdlr_set: url_hdlr_set,
  ipaddr_v4: ipaddr_v4,
  // 
  preseed_gen: preseed_gen, // Calls a lot of locals
  
  script_send: script_send,
  netconfig_by_f: netconfig_by_f,
  net_strversions: net_strversions,
  // Web Handlers
  recipe_view: recipe_view,
  instprofiles_view: instprofiles_view,
  // Disk
  // OLD: disk_params: disk_params,
  //OLD: diskinfo: diskinfo
  //scriptnames: scriptnames
  recipes: recipes, // Recipes config data
  // New shared data/functionality
  iprofs: iprofs, // TODO: lay over (in init), not replace
  recipe_params_init: recipe_params_init,
  recipe_params_iprof: recipe_params_iprof,
  netconfig_late: netconfig_late,
  // To log from other modules
  ilog: ilog,
  ilog_view: ilog_view,
  ilog_view_hosts: ilog_view_hosts,
  recipes_view: recipes_view
};
