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
var session = require('express-session');
var yaml    = require('js-yaml');
var cproc   = require('child_process');
var async   = require('async');
var bodyParser = require('body-parser');
var axios   = require("axios");
var ldap    = require('ldapjs'); // Opt ?
// Configurations
// var nb      = require("./netboot.json"); // Not used.
//var globalconf = process.env["LINETBOOT_GLOBAL_CONF"] || "./global.conf.json";
//var global   = require(globalconf);
//var userconf = process.env["LINETBOOT_USER_CONF"] || global.inst.userconfig || "./initialuser.json";
//var user     = require(userconf);
// Local Linetboot modules
var hlr      = require("./hostloader.js");
var netprobe = require("./netprobe.js");
var ans      = require("./ansiblerun.js");
var ospkgs   = require("./ospackages.js");
var ipmi     = require("./ipmi.js");
var tboot    = require("./tftpboot.js");
var redfish  = require("./redfish.js");
var osinst   = require("./osinstall.js");
var mc       = require("./mainconf.js");
var osdisk   = require("./osdisk.js");
var iblox    = require("./iblox.js");
var postinst = require("./postinst.js");
var procrpt  = require("./procreport.js");
var covconn  = require("./covconn.js");
//console.log("linetboot-osinst", osinst);
//console.log("linetboot-osdisk", osdisk);
var global = {};
global.tmpls = {}; // cached
// IP Translation table for hosts that at pxelinux DHCP stage got IP address different
// from their DNS static IP address (and name). This only gets loaded by request via Env.variable
var iptrans = {};
var app = express(); // Also: var server = ...
// var io = require('socket.io')(app);
var port = 3000; // TODO: Config
var fact_path;
var hostcache = {};
var hostarr = [];
var ldconn; var ldbound;
var setupmod;

app.use(bodyParser.json({limit: '1mb'}));
var rawoptions = { inflate: true, limit: '10kb', type: 'application/octet-stream' };
app.use(bodyParser.raw(rawoptions));

/** Initialize Application / Module with settings from global conf.
* @param cfg {object} - Global linetboot configuration
* @todo Perform sanity checks in mirror docroot.
*/
function app_init() { // global
  /** Modules */
  app.set('json spaces', 2);
  //var user;
  
  
  ///////////////////////////
  // 
  var globalconf = process.env["LINETBOOT_GLOBAL_CONF"] || process.env["HOME"] + "/.linetboot/global.conf.json" || "./global.conf.json";
  console.log("Choosing mainconf: " + globalconf);
  global = mc.mainconf_load(globalconf);
  mc.env_merge(global);
  mc.mainconf_process(global);
  var user   = mc.user_load(global); // TODO: After env_merge, mainconf_process ?
  var iprofs = mc.iprofs_load(global);
  if (!iprofs) { console.log("No iprofsconfig"); }
  /////// Misc init():s ////////////////
  // {tout: (global.probe ? global.probe.tout : 0)}
  netprobe.init(global.probe);
  ipmi.init(global);
  if (global.iblox) { iblox.init(global, {hostarr: hostarr, hostcache: hostcache}); }
  //app.use(express.static('pkgcache'));
  // Express static path mapping
  // Consider: npm install serve-static
  //app.use('/ubuntu', express.static('public'))
  //app.use('/static', express.static(path.join(__dirname, 'public')))
  // Note: Mapping does NOT serve directories.
  // Test with /ubuntu/md5sum.txt (Works ok)
  // NOTE: express.static(usr, path, conf) can take 3rd conf parameter w.
  // "setHeaders": function (res,path,stat) {}
  osdisk.init(global, {hostarr: hostarr, hostcache: hostcache});
  procrpt.init(global);
  var logger = function (res,path,stat) {
    // TODO: Extract URL from res ? (res has ref to req ?)
    console.log("Send STATIC file in path: " + path + " ("+stat.size+" B)");
    // console.log(stat); // Stat Object
  };
  var staticconf_0 = {"setHeaders": logger };
  // TODO: Evaluate this (https://stackoverflow.com/questions/10849687/express-js-how-to-get-remote-client-address)
  // app.set('trust proxy', true); // relates to req.header('x-forwarded-for') ?
  // Note this URL mapping *can* be done by establishing symlinks from maindocroot
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
  var maindocroot = global.core.maindocroot;
  if (!fs.existsSync(maindocroot)) { console.error("Main docroot '"+maindocroot+"' does not exist"); process.exit(1); }
  // https://expressjs.com/en/4x/api.html#express.static
  var staticconf = {dotfiles: "allow"}; // setHeaders, index, fallthrough=false (to short circuit)
  // Allow enabling 
  if (global.inst.staticdebug) { staticconf.setHeaders = logger; }
  // Main docroot
  app.use(express.static(maindocroot, staticconf)); // e.g. /var/www/html/ or /isomnt/ (from global config)
  // For Opensuse ( isofrom_device=nfs:...) and FreeBSD (memdisk+ISO) Distros that need bare ISO image (non-mounted).
  // Additional document roots in (Array) global.core.addroot
  if (global.core.addroot && Array.isArray(global.core.addroot)) {
    global.core.addroot.forEach((root) => { app.use(express.static(root, staticconf)); });
  }
  // No need for custom staticconf (mainly dotfiles)
  app.use('/web', express.static('web', staticconf)); // Host Inventory
  // See need for this (https://expressjs.com/en/4x/api.html#express.text). This is actually reveive-middleware
  // express.text([options]); // inflate
  ///////////// Dynamic content URL:s (w. handlers) //////////////
  ////////////////////// Installer ///////////////////////////////////
  
  
  function sethandlers() {
  // preseed_gen - Generated preseed and kickstart shared handler
  // TODO: Do these by a driving config (in a loop, See preseed_gen() var tmplmap)
  osinst.url_hdlr_set(app); // NEW (driven by recipe selections)
  /*
  app.get('/preseed.cfg', osinst.preseed_gen); // OK
  app.get('/ks.cfg', osinst.preseed_gen); // OK
  app.get('/preseed.desktop.cfg', osinst.preseed_gen); // OK
  app.get('/preseed_mini.cfg', osinst.preseed_gen); // OK
  // BSD (by doc '/boot/pc-autoinstall.conf' will be looked up from "install medium")
  app.get('/boot/pc-autoinstall.conf', osinst.preseed_gen); // ??
  app.get('/cust-install.cfg', osinst.preseed_gen); // ??
  // Network configs (still same handler)
  app.get('/sysconfig_network', osinst.preseed_gen); // OK
  app.get('/interfaces', osinst.preseed_gen); // OK
  */
  // Autounattend.xml
  ////////////////////
  // Install event logger (evtype is start/done)
  // More commonly: hostevent ? Also evtype=bootup
  app.get('/installevent/:evtype', oninstallevent); // /api/installevent
  // Netplan (custom YAML based handler)
  app.get('/netplan.yaml', netplan_yaml);
  app.get('/netplan2.yaml', netplan_yaml2);
  // Scipts & misc install data (e.g sources.list)
  //app.get('/preseed_dhcp_hack.sh', script_send);
  //app.get('/sources.list', script_send);
  // New generic any-script handler (See:  ./test/test_http.sh .. sources.list preseed_dhcp_hack.sh mv_homedir_for_autofs.sh)
  app.get('/scripts/:filename', osinst.script_send); // osinst
  ////////////////////////////// SSH/Other ///////////////////////////
  // SSH Key delivery
  app.get('/ssh/keylist', ssh_keys_list); // Must be first !
  app.get('/ssh/:item', ssh_key);
  
  ////////////////// Host Info Viewer (/web) /////////////////////////
  app.get('/list', hostinfolist);
  app.get('/list/:viewtype', hostinfolist);
  // Package stats (from ~/hostpkginfo or path in env. PKGLIST_PATH)
  // Charts
  app.get('/hostpkgcounts', pkg_counts);
  app.get('/hostcpucounts', hostp_prop_stat);
  app.get('/hostmemstats',  hostp_prop_stat);
  app.get('/distrostats',   hostp_prop_aggr);
  app.get('/cpuarchstats',  hostp_prop_aggr);
  // Comparison
  app.get('/hostpkgstats', host_pkg_stats);
  // Group lists
  app.get('/groups', grouplist);
  app.get('/groups_inv', grouplist_inv);
  // Commands to list pkgs
  app.get('/allhostgen/:lbl', gen_allhost_output);
  app.get('/allhostgen', gen_allhost_output);
  // rmgmt_list
  app.get('/hostrmgmt', rmgmt_list);
  app.get('/nettest', nettest);
  app.get('/proctest', proctest);
  // Ansible
  app.post('/ansrun', ansible_run_serv);
  app.post("/ansfacts", ansible_facts_gather);
  app.get('/anslist/play', ansible_plays_list);
  app.get('/anslist/prof', ansible_plays_list);
  // 
  app.get('/ansackpoll', ansible_op_poll);
  // NFS/Showmounts
  
  app.get('/showmounts/:hname', showmounts);
  // Redfish Info or Reboot /rf/boot/, /rf/info /rf/setpxe
  app.get('/rf/:op/:hname', host_reboot);
  // RF Test URL/handler
  //app.post('/rf/boot/:hname', reboot_test); // For testing
  
  app.post('/redfish/v1/Systems/1/:hname', reboot_test); // For testing
  app.get('/redfish/v1/Systems/1/:hname', reboot_test); // For testing
  app.patch('/redfish/v1/Systems/1/:hname', reboot_test); // For testing
  
  app.get("/dockerenv", dockerenv_info);
  app.get("/config", config_send);
  app.get("/install_boot", installrequest);
  app.get("/bootreset", bootreset); // Created after tftplist
  
  app.get("/tftplist", tftp_listing);
  
  
  // 
  app.get("/medialist", media_listing);
  
  app.get("/mediainfo", media_info);
  app.get("/apidoc", apidoc);
  app.get("/recipes",  osinst.recipe_view);
  app.get("/ldaptest",  ldaptest);
  app.get("/diskinfo",  osdisk.diskinfo);
  //BAN: app.get("/login",  login);
  app.post("/login",  login);
  
  app.get("/userent",  userent);
  
  app.get("/logout",  logout);
  
  app.get("/setaddr",  iblox.ib_set_addr);
  app.get("/ibshowhost",  iblox.ib_show_hosts);
  
  app.get("/ipamsync",  iblox.ipam_sync);
  app.get("/ipamnets",  iblox.networks);
  // cloud-init/subiquity/curtin
  app.get("/meta-data",  ubu20_meta_data);
  
  app.post("/keyxchange",  keys_exchange);
  
  app.get("/eflowrscs",  eflowrscs);
  app.get("/eflowrsctoggle",  eflowrsctoggle);
  // ESXI cacheguestinfo
  app.get("/esxi/cache", cacheguestinfo); // Must be before listguests
  app.get("/esxi/:host", listguests);
  
  // listdc
  app.get("/listdc", listdc);
  // Bad Process report
  app.get("/staleproc", procrpt.procreport_web);
  app.get("/instprofiles",  osinst.instprofiles_view);
  app.get("/ilogview",  osinst.ilog_view);
  app.get("/iloglisthosts",  osinst.ilog_view_hosts);
  
  app.get("/rpaddmems",  rp_add_mems);
  if (global.cov) {
    covconn.init(global);
    app.get("/covtgtchart",  covconn.express_report);
  }
  app.get("/bs_list", bootables_list);
  app.get("/bs_statuses", bootables_status);
  app.get("/recipes_dump", osinst.recipes_view);
 } // sethandlers
  //////////////// Load Templates ////////////////
  
  fact_path = process.env["FACT_PATH"] || global.fact_path;
  //console.log(process.env);
  if (!fact_path) { console.error("Set: export FACT_PATH=\"...\" in env !"); process.exit(1); }
  if (!fs.existsSync(fact_path)) { console.error("FACT_PATH "+fact_path+" does not exist"); process.exit(1);}
  global.fact_path = fact_path; // Store final in config
  ///////////// Hosts and Groups (hostloader.js) ////////////////////
  
  hlr.init(global, {hostcache: hostcache, hostarr: hostarr});
  hlr.hosts_load(global);
  hlr.facts_load_all(); // var hostarr = 
  
  /* Load IP Translation map if requested by Env. LINETBOOT_IPTRANS_MAP (JSON file)
   * Note: This is only needed with bad DHCP service that returns wrong or undeterministic
   * IP addresses for particular host (MAC address). Even then this is a really tedious mechanism.
   */
  var mfn = process.env["LINETBOOT_IPTRANS_MAP"];
  if (mfn && fs.existsSync(mfn)) {
    iptrans = require(mfn); // TODO: try/catch ?
    console.error("Loaded " + mfn + " w. " + Object.keys(iptrans).length + " mappings");
  }
  // TODO: Clear up both in doc and code how customhosts work in 2 cases:
  // - Load into runtime directly from CSV file
  // - generate facts and remote config from customhosts
  // - TODO: Possibly converge to only one out of these two
  if (global.customhosts) {
    console.log("Detected New/custom hosts file: "+ global.customhosts);
    var carr = hlr.customhost_load(global.customhosts, global, iptrans);
    if (carr) { console.log("Loaded "+carr.length+" New/custom hosts"); }
    
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
  
  //var os = require('os');
  //var ifs = os.networkInterfaces();
  // ifs.keys().filter(function (k) {});
  //console.log(ifs); // DEBUG
  // Ansible
  //global.ansible = global.ansible || {};
  
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
  var mod = setupmod = {};
  if (!fs.existsSync(modfn))   { console.error("Warning: setup module does not exists as: "+ modfn);  } // return;
  else {
    setupmod = mod = require(modfn);
    if (!mod || !mod.run || typeof mod.run != 'function') {
      console.error("Error: module either 1) Could not be loaded 2) Does not have run() member 3) run member is not a callable");
      return; // exit() ?
    }
    console.log("Loaded app custom module: "+ modfn + " ... running setup: run() ...");
    // Call for local customization: try {} catch () {}
    mod.run(global, app, hostarr);
  }
  // Init osinst AFTER loading hosts, iptrans, custom module
  var osinst_initpara = {hostcache: hostcache, global: global, iptrans: iptrans, user: user, iprofs: iprofs};
  osinst.init(osinst_initpara, (mod.patch_params ? mod.patch_params : null)); // TODO: Pass mod
  // Session
  // resave: true, saveUninitialized: true, store: MemoryStore (default) cookie.maxAge, genid: (req) => {}
  // http://expressjs.com/en/resources/middleware/session.html
  //var MemoryStore = require('memorystore')(session)
  var sesscfg = {
    "secret": "keyboard cat xx",
    resave: true,
    "saveUninitialized": true,
    
    //unset: 'destroy',
    "cookie": {
      path: '/',
      maxAge: 600000,
      //"secure": false, // "auto"
      //domain:'127.0.0.1:3000',
      httpOnly: true,
      sameSite: true,
    },
    //store: "MemoryStore" // session.MemoryStore
  }; // httpOnly: false
  console.log("Set up sessions ...", JSON.stringify(sesscfg, null, 2));
  
  app.set('trust proxy', 1);
  app.use(session(sesscfg));
  // *Must* reside after session
  app.use(linet_mw);
  sethandlers();
  // LDAP (when not explicitly disabled)
  // client.starttls({ca: [pemdata]}, function(err, res) { // fs.readFileSync('mycacert.pem')
  var ldc = global.ldap;
  
  if (ldc && (ldc.host && !ldc.disa)) {
    //var ldcopts = { url: 'ldap://' + ldc.host, strictDN: false};
    //ldcopts.reconnect = true;
    //if (ldc.idletout) { ldcopts.idleTimeout = ldc.idletout; } // Documented
    
    var ldccc =    {bindmsg: "Initial binding.", cb: function () { http_start(); }};
    var ldccc_re = {bindmsg: "Re-bind after connection error.",};
    // function ld_conn(ldc, ldccc) {
    var ldcopts = ldcopts_by_conf(ldc);
    ldconn = ldap.createClient(ldcopts);
    ldconn_bind_cb(ldc, ldconn, function (err, ldconn) {if (err) {throw "Initial Bind err: "+err; }ldbound = 1; http_start(); });
    //console.log("Bind. conf:", ldc);
    /*
    ldconn.bind(ldc.binddn, ldc.bindpass, function(err, bres) {
      if (err) { throw "Error binding connection: " + err; }
      var d2 = new Date(); // toISOString()
      console.log(d2.toISOString()+" Initially Bound/Connected to: " + ldc.host + " as "+ldc.binddn); // , bres
      ldbound = 1;
      // Note: pay attention to this in a reusable version
      return http_start(); // Hard
      //if (ldccc.cb) { ldccc.cb(); }   // generic
    }); // bind
    */
    // ldapjs Error: read ECONNRESET
    // https://github.com/ldapjs/node-ldapjs/issues/318
    // npm:pool2
    console.log(new Date().toISOString()+" Register initial ldconn error handler");
    ldconn.on('error', function(err) {
      var d2 = new Date(); // toISOString()
      // error: 000004DC: LdapErr: DSID-0C090A69, comment: In order to perform this operation a successful bind must be completed on the connection., data 0, v4563
      // error: 000004DC: LdapErr: DSID-0C090A69, comment: In order to perform this operation a successful bind must be completed on the connection., data 0, v4563\u0000
      // console.warn('LDAP connection error. reconnect = '+ldcopts.reconnect + ": " + err);
      console.log(d2.toISOString() + ' LDAP connection error. reconnect = '+ldcopts.reconnect + ": " + err);
      if (!ldc.rebindonerror) { console.log("Try not to renew connection (return as-is)"); return; }
      //console.log("Conn (at error):", ldconn);
      // Pattern:
      //2020-10-09T00:07:59.639Z LDAP connection error. reconnect = true: Error: read ECONNRESET
      //Destroying existing client:[object Object]
      //2020-10-09T00:07:59.640Z LDAP connection error. reconnect = true: Error [ERR_STREAM_DESTROYED]: Cannot call write after a stream was destroyed
      //console.log("Destroying existing client:"+ldconn);
      //ldconn.destroy(); // calls unbind
      //ldconn = null;
      // ld_conn(ldc, ldccc_re);
      // Even this fails in time w. error (connection seems to lose it's binding, that shows in authentication search phase: Start Login, local ldconn2: [object Object]):
      // error: 000004DC: LdapErr: DSID-0C090A69, comment: In order to perform this operation a successful bind must be completed on the connection., data 0, v4563
      //ldconn = ldap.createClient(ldcopts);
      //if (!ldconn) { console.log("Could not create new post-error LDAP client."); return; }
      // TODO: Try to re-bind with delay
      var rbw = ldc.rebindwait || 5000;
      console.log(new Date().toISOString()+ " Rebind, but wait: "+rbw);
      setTimeout(function () {
        console.log(new Date().toISOString()+ " Rebinding after wait.");
        ldconn.bind(ldc.binddn, ldc.bindpass, function(err, bres) {
          // 
          var msg = new Date().toISOString()+" Re-bind after connection error: ";
          if (err) { console.log(msg + "Failed to re-bind: " + err); return; }
          console.log(msg + "Seems re-binding succeeded OK");
          return;
        });
      }, rbw);
      
    });
    // return;
  } // if ldc ...
  else { http_start(); }
}
function ldcopts_by_conf(ldc) {
  var proto = ldc.ssl ? "ldaps" : "ldap";
  var port  = ldc.ssl ? "636" : "389";
  var ldcopts = { url: proto+'://' + ldc.host + ":"+port, strictDN: false};
  ldcopts.reconnect = true;
  if (ldc.idletout) { ldcopts.idleTimeout = ldc.idletout; } // Documented
  // Certificate ?
  if (ldc.nonsec) {
    ldcopts.tlsOptions = {'rejectUnauthorized': false};
  }
  // https://github.com/ldapjs/node-ldapjs/issues/307
  // NOT Complete yet
  if (ldc.cert) {
    var certpath = "";
    var tls = {
      host: 'plat.com',
      key:  fs.readFileSync(certpath+'/clientkey.pem'),
      cert: fs.readFileSync(certpath+'/clientcrt.pem'),
      ca:   fs.readFileSync(certpath+'/cacert.pem') // !!
    };
    //ldcopts.tlsOptions = tls;
  }
  return ldcopts;
}
// Bind LDAP Connection and call an (optional) cb
// @param ldc {object} - LDAP Connection config (with "binddn" and "bindpass", e.g. from main config, see docs)
// @param ldconn {object} - LDAP client / connection to bind
// @param cb {function} - Optional callback function to call with err,ldconn
// Passing cb is highly recommended, otherwise errors are handled by throwing an exception.
function ldconn_bind_cb(ldc, ldconn, cb) {
  cb = cb || function (err, data) {
    if (err) { throw "Error Bindng (no explicit cb): "+ err; }
    console.log("No further/explicit cb to call, but bound successfully as "+ldc.binddn);
  };
  if (!ldconn) { return cb("No LD Connection to bind", null); }
  ldconn.bind(ldc.binddn, ldc.bindpass, function(err, bres) {
      if (err) { return cb(err, null); } // throw "Error binding connection: " + err;
      var d2 = new Date(); // toISOString()
      console.log(d2.toISOString()+" Bound to: " + ldc.host + " as "+ldc.binddn); // , bres
      //ldbound = 1;
      // Note: pay attention to this in a reusable version
      //return http_start(); // Hard
      //if (ldccc.cb) { ldccc.cb(); }   // generic
      return cb(null, ldconn); // No need: if (cb) {}
    }); // bind
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

function linet_mw(req, res, next) {
  //var filename = path.basename(req.url);
  //var extension = path.extname(filename);
  if (0) { console.log("ldconn:" + (ldconn ? "connected" : "N/A")); }
  //req.session.num++;
  
  if (req.session && !req.session.qs) {
      // console.log("NO qs, resetting.");
    req.session.qs = [];
  }
  if (0) {
  console.log("sess: ", req.session);
  //console.log("hdrs: ", req.headers); // rawHeaders:
  console.log("cookie: ", req.headers.cookie);
  console.log("req.sessionID: ", req.sessionID);
  console.log("SS: ", (req.sessionStore ? "present" : "absent"));
  }
  var s; // Stats
  var ts = new Date().toISOString();
  console.log("app.use(dyn.URL): "+req.method+" ("+ts+"):" + req.url);
  // NOTE: There's a separate way to debug static delivery
  /*
  if (req.url.match("^(/ubuntu1|/centos|/gparted|/boot)")) {
    // Stat the file
    var msg;
    try { s = fs.statSync("/isomnt" + req.url); }
    catch (ex) { msg = "404 - FAIL";  } // console.log("URL/File: " + req.url + " ");
    if (!msg && s) { msg = s.size; }
    //console.log("URL/StaticFile: " + req.url + " " + msg);
  }
  */
  // If one of the boot/install actions ... do ARP
  //var bootact = {"/preseed.cfg":1, "/ks.cfg":1, }; // "":1, "":1, "":1,
  // var ip = osinst.ipaddr_v4(req);
  // if (bootact[req.url]) {arp.getMAC(ipaddr, function(err, mac) { req.mac = mac; next(); }); } // ARP !
  
  //console.log("Setting CORS ...");
  if (global.core.corshdr) { res.header("Access-Control-Allow-Origin", "*"); } // Access-Control-Allow-Origin
  //res.header("Access-Control-Allow-Headers", "X-Requested-With");
  
  next();
}


app_init();

function http_start() {
  app.listen(port, function () {
    console.log("Linux Network Installer app listening on host:port http://localhost:"+port+" OK"); // ${port}
  });
}

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
* 
* ## Event Types
* Modeled along typical Linux installers, the allowed even types are:
* - start - Start of installation
* - end - End of installation (Also has legacy alias "done")
* - post - 
* ## Testing Events submission
* 
* Especially the "end" event with its triggered actions may be worth getting familiar with and
* also worth testing the triggered actions manually. You can accomplish this by calling a simple
* GET http URL (curl call included) and by monitoring linetboot console log:
* ```
* curl 'http://...:3000/installevent/end?ip=192.168.1.99'
* ```
* In a case of real OS Install case the IP address will be auto-detected by lineboot, but in your
* simulation run you are unlikely to run it on that host (if you are, leave out the ip).
*/
function oninstallevent(req,res) {
  var jr = {status: "err", msg: "Failed to respond to install event."};
  var evok = {"start": "Start", "done":"Legacy for End", "end": "End", "post": "Post"};
  var xip = req.query["ip"];
  var ip = osinst.ipaddr_v4(req);
  if (xip) { console.log("Overriding ip: " + ip + " => " + xip); ip = xip; }
  var p = req.params;  // :evtype
  var q = req.query;
  if (!p || !p.evtype)   { jr.msg += "No params or no event type"; return res.json(jr); }
  if (!evok[ p.evtype ]) { jr.msg += "Not a valid event type: " + p.evtype; return res.json(jr); }
  // lookup facts
  var f = hostcache[ip];
  if (!f) { jr.msg += "Could not lookup facts for " + ip; osinst.ilog(ip, "installevent", p.evtype); return res.json(jr); }
  var now = new Date();
  console.log("IP:" + ip + ", install-event: " + p.evtype + ", path: "+q.path+", time:" + now.toISOString());
  //var sq = "INSERT INTO hostinstall () VALUES (?)";
  // sq = "UPDATE hostinstall SET ... WHERE ipadd = ?"
  // conn.exec(sq, params, function (err, result) {});
  var endtypes = {"done": "deprecated", "end":"preferred"};
  // If end-of-install-event: signal trigger approximate timer and start checking when host is up ?
  // series,eachSeries,waterfall
  // Use async.eachSeries() to poll by hdl = setTimeout(cb, toutms) / hdl=setInterval(cb, toutms) (combo of 2)
  // Note args can be passed after toutms
  // Use clearTimeout(hdl) / clearInterval(hdl)
  if (endtypes[p.evtype]) {
    
    var fancy = 1;
    postinst.init(setupmod);
    var picfg = postinst.hostup_init(global, ip); // Common initialization
    if (!picfg) { jr.msg += "Missing main conf 'postinst' section for IP: " + ip; return res.json(jr); }
    var actcb = function (err, picfg) { picfg && postinst.hostup_act(picfg); };
    ///////////////
    // Cannot use hostup_init_wait here ?
    if (!fancy) {
      postinst.hostup_poll(picfg, actcb); // E.g. no initial wait-delay, but ad-hoc actcb above is passed
    }
    else {
      var pass = (cb) => { cb(null, picfg); }; // Essentially: Forward (to allow similar picfg-signatures)
      // Maybe completion function here should be directly hostup_act() (<= NOT because of sign)
      // asyc.series would get results of individual funcs. waterfall is perfect match
      async.waterfall([ pass, postinst.hostup_init_wait, postinst.hostup_poll, ], function (err, picfg) {
        if (err) { console.log("Error in host-up waiting:"+err); return; }
        if (!picfg) { console.log("No picfg was passed to completion cb ! (?)"); return; }
        console.log("Success waiting for host-up. Look for action ...");
        //actcb(null, picfg);
        postinst.hostup_act(picfg);
      });
    }

  }
  
  // msg: "Thanks",
  res.json({ status: "ok", data: { ip: ip, "event":  p.evtype, time: now.toISOString()} });
  
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
    if (hn.indexOf("_") > -1) { err = "Not an internet name: " + hn; console.log(err); return cb(err, null); }
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
  //var cmds = hc.commands_gen(op, hostarr, req.query.para);
  var cmds = hc.commands_gen(op, hostarr, req.query || {});
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
*      sudo wget -O 01-netcfg.yaml http://linetboot.myorg.org:3000/netplan.yaml?ip=10.75.159.27
*      # By mac address (e.g. when current ip on-hot is wrong)
*      sudo wget -O 01-netcfg.yaml http://linetboot.myorg.org:3000/netplan.yaml?mac=02:07:07:00:c7:9c
*      sudo netplan apply
* 
* @todo Convert netmask to CIDR notation.
* @todo Make Reusable and http/express request agnostic to use part of ubuntu 20
* @todo Generate all values first (osinstall.js / netconfig() ?) then produce yaml, not as-you-go.
* See also: https://netplan.io/examples
*/
function netplan_yaml(req, res) {
  // np = {"version": 2, "renderer": "networkd", "ethernets": {} }
  res.type("text/plain");
  // Content-Disposition: ... Would pop up save-as
  //var fn = "01-netcfg.yaml";
  // res.set('Content-Disposition', "attachment; filename=\""+fn+"\"");
  var q = req.query || {};
  var xip = req.query["ip"];
  var ip = osinst.ipaddr_v4(req);
  if (xip) { console.log("Overriding ip: " + ip + " => " + xip); ip = xip; }
  var f = hostcache[req.query["mac"] || ip];
  if (!f) { console.log("# No Facts found for IP Address '"+ip+"' (or maybe mac ?).\n");  } // ${ip} return;
  // Validate gotten cache artifact (TODO: Move into respective wrapper)
  if (f && !f.ansible_architecture) { console.log("WARNING: Facts gotten from cache, but no expected props present"); }
  //////////////////////////////////////////////////////////////////////////////
  if (f) { console.log("netplan_yaml: Using cached facts ..."); }
  // Dummy facts with all set to false (for fallback to global settings)
  var f_dummy = {"ansible_default_ipv4": {}, "ansible_dns": null};
  var d = f || f_dummy;
  var gnet = global.net; // Main Config net settings
  // function netplan_gen(d, gnet, q, ip) { // opts for ip and q.netif
  /////////////////////////// Base netplan stub (to fill out) /////////////////////
  // Fixate interface name at this point (e.g. "netname"), rename at end ?
  var np = {"version": 2, "renderer": "networkd", "ethernets": {
    //"netname": {
    //  addresses: [], gateway4: "", nameservers: {search:[], addresses: []}
    //}
  } };
  //# See also "ansible_em1" based on lookup to:
  //# iface.alias
  //# See: "ansible_fqdn" => hostname
  // iface has: alias, address, gateway
  var iface_a = d.ansible_default_ipv4; // iface_a = Ansible interface (definition)
  console.log("iface_a: "+JSON.stringify(iface_a, null, 2));
  //if (!iface_a) { res.end("No ansible_default_ipv4 network info for ip = "+ip+"\n"); }
  // Prioritize interface name from query params (q.netif)
  var ifname = q.netif || iface_a.alias || gnet.ifdefault || "eno1"; // IF-name
  // Interface Info.  TODO: Create /dec CIDR mask for "addresses" out of "netmask"
  var address = (iface_a.address ? iface_a.address : ip);
  var netmask = iface_a.netmask || gnet.netmask;
  var dec = netmask2CIDR(netmask); // netmask2cidr(netmask);
  if (dec) { address += "/"+dec; }
  var iface = { // Netplan interface (this gets assigned to if-name)
    "addresses": [ address ], // Assume single
    "gateway4": (iface_a.gateway ? iface_a.gateway : gnet.gateway),
    "nameservers": null // {search: null, addresses: null}
  };
  // Add /dec mask here based on "netmask"
  var dns_a = d["ansible_dns"]; // gnet.namesearch // NEW: Fallback to gnet below
  //console.log("dns_a: "+JSON.stringify(dns_a, null, 2));
  //console.log("gnet: "+JSON.stringify(gnet, null, 2));
  // console.log("Found Ansible DNS Info: "+dns_a);
  var ns = { // Name search Info (DNS, search suffixes)
    "search":    (dns_a && dns_a["search"]      ? dns_a["search"] : gnet.namesearch),
    "addresses": (dns_a && dns_a["nameservers"] ? dns_a["nameservers"] : gnet.nameservers)
  };
  // Exception for misleading systemd DNS server "127.0.0.53"
  if (ns.addresses[0] == '127.0.0.53') { ns.addresses = gnet.nameservers; }
  //console.log("ns as JSON: "+JSON.stringify(ns));
  iface.nameservers = ns;
  np["ethernets"][ifname] = iface; // Assemble (ethernets branch) !
  //  return np;
  //}
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
  ////////////////////////////////// YAML ///////////////////////////////////////////////
  // var yaml = yaml.safeLoad(fs.readFileSync('test.yml', 'utf8')); // From
  // To YAML
  var ycfg = {
    'styles': { '!!null': 'canonical' }, // dump null as ~
    //'sortKeys': true
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
/** TODO: Populate Netplan structure and output it in Yaml.
 * TODO: Rely on osinstall to populate the structure
 */
function netplan_yaml2(req, res) {
  //var jr = {status: "err", msg: "No Netplan created"};
  var ip = osinst.ipaddr_v4(req);
  var xip = req.query["ip"]; // eXplicit IP
  if (xip) { console.log("Overriding ip: " + ip + " => " + xip); ip = xip; }
  var f = hostcache[req.query["mac"] || ip];
  if (!f) { console.log("# No Facts found for IP Address '"+ip+"' (or maybe mac ?).\n");  } // ${ip} return;
  res.type('text/plain');
  
  var np = {"version": 2, "renderer": "networkd", "ethernets": {}};
  var hps = hlr.hostparams(f) || {}; // Host params
  var d = osinst.recipe_params_init(f, global, user, ip);
  var iprofs = null; // TODO: osinst module var !
  if (hps.iprof && iprofs && iprofs[hps.iprof]) {
      console.log("Apply install profile for "+ip);
      osinst.recipe_params_iprof(d, iprofs[hps.iprof]);
    }
    // osinst.netconfig_ifnum(d.net, f);
    osinst.netconfig_late(d.net);
  var net = d.net; // TODO: Generate params, Assign (net)
  var iface = { // Netplan interface (this gets assigned to if-name) // Assume single IP
    "addresses": [ net.ipaddress + "/" + net.cidr ], // NOTE: CIDR !!!
    "gateway4": net.gateway,
    "nameservers": {search: net.namesearch, addresses: net.nameservers,  }// {search: null, addresses: null}
  };
  // Netplan requires *exact* interface name. In facts: f.ansible_default_ipv4.alias
  var ifname = net.ifdefault || (f.ansible_default_ipv4 ? f.ansible_default_ipv4.alias : "") || "eno0";
  np.ethernets[ifname] = iface; // ifnum, ifdefault
  var ycfg = {};
  var ycont = yaml.safeDump(JSON.parse(JSON.stringify({network: np})), ycfg);
  res.send(ycont);
}
/** Generate Ubuntu 20 subiquity single line meta-data file with hostname (!).
 * Lookup facts for IP and extract (non-FQDN) hostname.
 */
function ubu20_meta_data(req, res) {
  var ip = osinst.ipaddr_v4(req);
  var f = hostcache[ip];
  var hn = 'host-01';
  if (!f || !f.ansible_hostname) { }
  else { hn = f.ansible_hostname; }
  res.end("instance-id: "+hn+"\n"); // focal-autoinstall
}

/** generate API doc out of swagger API doc YAM file.
 * Swagger apidoc structure has several weaknesses for logic-less templating (e.g Mustache, google ctemplate)
 * and has to be transformed to less quirky formats in many parts of the (original YAML) structure.
 * Respond with 
 */
function apidoc(req, res) {
  //var jr = {"status":"err", "msg":"Failed to generate hostcommand output."};
  // var ycont = yaml.safeDump(JSON.parse(JSON.stringify(nproot)), ycfg);
  var apidocfn = "./swagger.yaml";
  var doc;
  var q = req.query;
  try { doc = yaml.safeLoad(fs.readFileSync(apidocfn, 'utf8')); }
  catch (ex) { return res.end("No YAML parsed "+ ex.toString());}
  paths_fix(doc);
  if (q.doc) {
    // paths_fix(doc);
    var tmplfn = "./tmpl/apidoc.mustache";
    var tmpl = fs.readFileSync(tmplfn, 'utf8');
    var cont = Mustache.render(tmpl, doc);
    return res.end(cont);
  }
  // JSON
  else { return res.json(doc); }
  // Convert to templateable structure, e.g. make paths into an Array.
  function paths_fix(doc) {
    if (Array.isArray(doc.paths)) { return; }
    var ks = Object.keys(doc.paths);
    var arr = [];
    ks.forEach(function (k) { // k: url path
      var n = doc.paths[k];
      n.path = k; // Move key into node
      n.mime = n.get.produces[0]; // move mime type
      // Make responses["200"].description accessible
      //try {
      n.respdesc = n.get.responses["200"].description;
      //} catch (ex) {}
      arr.push(n);
    });
    doc.paths = arr;
    // Same for doc.definitions ?
  }
}

/** Deliver single plain/text SSH key (or all keys as JSON) for the old host for placing them onto new installation.
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
  var ip = osinst.ipaddr_v4(req);
  var xip = req.query["ip"];
  if (xip) { console.log("Overriding ip: " + ip + " => " + xip); ip = xip; }
  var f = hostcache[ip];
  // short key-type to Facts key
  var keytypes = {
    "dsa":    "ansible_ssh_host_key_dsa_public",
    // ssh-rsa
    "rsa":    "ansible_ssh_host_key_rsa_public",
    // e.g.  ecdsa-sha2-nistp256
    "ecdsa":  "ansible_ssh_host_key_ecdsa_public",
    // ssh-ed25519
    "ed25519":"ansible_ssh_host_key_ed25519_public"
    
  };
  if (!f) { res.end("# No IP Address "+ip+" found in host DB\n"); return; } // ${ip}
  var keypath = global.inst.sshkey_path; // process.env["LINETBOOT_SSHKEY_PATH"] ||
  //if (keypath && !fs.) {}
  res.type("text/plain");
  var item = req.params.item; // :item in /ssh/:item
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
  /*
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
  */
  // Filesystem cached key directory tree lookup
  var hname = f.ansible_fqdn;
  // not public, not private or 
  if ( ! keypath) { res.send("# Error (keypath/root missing)\n"); return; }
  var hostkeypath = keypath + "/" + hname;
  if (!fs.existsSync(hostkeypath)) { res.send("# Error (hostkeypath does not exist for "+hname+")\n"); return; }
  //////////// Individual key vs. key-pack //////////////////////
  // Single key Form an actual key-filename
  var fname = "ssh_host_"+ktype+"_key" + (ispublic ? ".pub" : "");
  var absfname = hostkeypath + "/" + fname; // Full path
  if (!fs.existsSync(absfname)) { console.error("No key file:"+absfname+" ktype " + ktype + "(Sending empty file)"); res.send("");return; }
  var cont = fs.readFileSync(absfname, 'utf8');
  if (!cont) { console.error("# Error - No key content:" + ktype + "(Sending empty file)"); res.send("");return; }
  res.send(cont);
  return;
  
  
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
/** List Groups if configured in main config (HTTP GET /groups).
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
/** List inventory groups.
 * 
 */
function grouplist_inv(req, res) {
  var jr = {status: "err", msg: "Unable to List Host Groups."};
  var gnames = hlr.groupnames();
  if (!gnames || !Array.isArray(gnames)) { jr.msg += "No Groups !"; res.json(jr); }
  var groups = gnames.map((gn) => { return {id: gn, name: gn}; });
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
 * 
* Main Request parameters (in POST body JSON) are:
* 
* - **playbooks** (array-of-str) - Set of ansible playbooks (file names) to run.
* - **hostnames** (array-of-str) - Individual hosts to run ansible playbooks on
* - **hostgroups** (array-of-str) - Host groups to run playbooks on (as defined by lineboot inventory host groups, mutually exclusive with hostnames).
* - **playprofile** - (str) - Playbook profile label for one of the playbook profiles in "pbprofs" (mutually exclusive with playbooks)
* 
* Depends on lineboot config members:
* - ansible.pbpath - Playbook path
* - ansible.pbprofs - playbook profiles in Array-of-Objects (w. "lbl", "name", "playbooks")
*
* ## Playbook profile section strucure
* 
* Profiles look like (Under "ansible" section):
* ```
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
* ```
*/
function ansible_run_serv(req, res) {
  var jr = {status: "err", msg: "Not running Ansible. "};
  if (!global.ansible) { jr.msg += "No ansible section in main config !"; return res.json(jr); }
  var acfg = global.ansible;
  if (typeof acfg != 'object') {  jr.msg += "Ansible config is not an object !"; return res.json(jr); }
  if (req.method != "POST") { jr.msg += "Not sent via POST. Send request as POST"; return res.json(jr); } // POST !!!
  var pbpath = acfg.pbpath; // process.env['PLAYBOOK_PATH'] ||
  if (!pbpath) { jr.msg += "Playbook path not given (in env or main config) !"; return res.json(jr); }
  acfg.pbpath = pbpath; // Override (at init ?)
  acfg.invfn  = acfg.invfn || global.hostsfile; // Or put to p (run-specific cfg) ?
  // Define the policy of mandating hosts to be listed in hostsfile / known to linetboot
  if (!global.hostsfile) { jr.msg += "Playbook runs need 'hostsfile' in main config !"; return res.json(jr); }
  var p = req.body; // POST Params
  
  // Test ONLY (Comment out for real run)
  // if (!p || !Object.keys(p).length) {
  //  p = ans.testpara; // TEST/DEBUG
  //}
  acfg.pbprofs = acfg.pbprofs || [];
  console.log("ansible_run_serv: Ansible run parameters:", p);
  if (typeof p != 'object') { jr.msg += "Please send POST body as Object"; return res.json(jr); }
  var step = "const"; // run-step
  var runid = 0;
  try {
    p = new ans.Runner(p, acfg);
    // if (!p) { jr.msg += "Runner Construction failed"; return res.json(jr); }
    //p.xpara.host = p.hostselstr; // TODO here OR below ?
    step = "playbook_resolve";
    var err = p.playbooks_resolve(acfg);
    // if (err) { jr.msg += "Error "+err+" resolving playbooks"; return res.json(jr); }
    /*
    // Groups
    step = "grp_resolve";
    
    var gnames = hlr.groupnames(); // Get all
    console.log("Inventory group names(all): ", gnames);
    p.hostgrps_resolve(gnames); // OLD: global.groups
    if (!p.hostnames || !p.hostnames.length) { throw "No hostnames (after group resolution)"; }
    // var hsel = p.hostselector(); // Called internally
    
    // console.log("generated hostsel-str: "+hsel);
    */
    step = "run";
    console.log("Instance state before run(): ", p);
    p.ansible_run({host: p.hostselstr}); // Pass host HERE
  } catch(ex) {
    // FIXME: Write ack-file here, not HTTP response (OR 2 try-catch blocks)
    jr.msg += "Runner construction, resolutions or execution failed (step="+step+"): "+ex;
    console.log("Error: msg:"+ jr.msg); // "Exception Step:"+step+
    return res.json(jr);
    //ans.Runner.compfname(p.runid, runinfo);
  }
  var runinfo = {status: "ok", event: "ansstart", time: Math.floor(new Date() / 1000),
    msg: "Running Async in background", "data": {runid: p.runid}};
  res.json(runinfo);
}
/** Gather Facts web handler.
 * POST JOSN params are similar to ansible_run_serv, except any playbooks or play profiles are ignored.
 * Gather facts to a temp directory for comparison.
 */
function ansible_facts_gather(req, res) {
  var jr = {status: "err", msg: "Could not run Ansible Fact gather. "};
  var acfg = global.ansible;
  var p = req.body;
  acfg.invfn  = acfg.invfn || global.hostsfile;
  ["playbooks","playprofile"].forEach((k) => { delete p[k]; });
  console.log("Start Facts gather ! p=", p);
  var factpath_tmp;
  try {
    p = new ans.Runner(p, acfg);
    console.log("Instantiated runner");
    // var hsel = p.hostselector(); // Called internally
    console.log("runner host scope: " + p.hostselstr);
    console.log("state before this.fact_gather(): "+JSON.stringify(p, null, 2));
    p.fact_gather((err, data) => {
      if (err) { jr.msg += "POST Handler Received Errors during fact gather: "+err;  } // return res.json(jr);
      factpath_tmp = p.factpath;
      //////// Facts comparison: new vs. old - strive to accept only complete and non-corrupt facts /////
      var files = fs.readdirSync(p.factpath, {}); // opts
      console.log("Got files(raw): ", files);
      var stats = files.map(function (fn) {var fna = p.factpath+"/"+fn;var s = fs.statSync(fna, {} ); return {size: s.size, fn: fn};}); // 
      console.log("Got stats(freshly mapped): ", stats);
      // Add size (size_o, o=old) from the in-use facts directory
      // Have to try-catch for missing files ?
      stats.forEach((s) => { var fna = global.fact_path+"/"+s.fn; var s2 = fs.statSync(fna, {} ); s.size_o = s2.size; });
      console.log("Got stats: ", stats);
      var cnt_total = stats.length;
      stats = stats.filter(newfacts_accept);
      console.log("Got acceptable: ", stats);
      // Copy by loading and rewriting
      stats.forEach((fst) => {
        var err = copy_json(fst);
        if (err) { console.log("Error "+err+" copying file: "+fst.fn); }
      });
      // TODO: Inform how many were flawed ! cnt_total vs stats.length (by now)
      var cntstr = stats.length+" out of "+cnt_total+ " were okay";
      // TODO: data: data
      var runinfo = {status: "ok", data: { runid: p.runid }, msg: "Hosts/Groups: "+p.hostselstr+" ("+cntstr+")"};
      console.log("ansible_facts_gather send JSON: ", runinfo);
      return res.json(runinfo);
      // ans.Runner.compfname(p.runid, runinfo); // Store to ack-file
    });
  }
  // TODO: Remove res.json(...) from here -Don't send HTTP resp at the end of long running
  catch (ex) { jr.msg += "Exception during fact gather: "+ex; return res.json(jr); }
  // Immediate resp ?
  // var rdata = {status: "ok", data: { runid: p.runid }, msg: "Hosts/Groups: "+p.hostselstr}; // Cannot: +" ("+cntstr+")"
  //return res.json(rdata);
  // @return 0 on success, 1 and up on errors (1=load err. 2=parse err., 3=write err.)
  // TODO: cproc.exec("cp "+factpath_tmp + "/" +fst.fn+" "+global.fact_path + "/" + fst.fn, (err, stdout, stderr) => {});
  function copy_json(fst) { // fna1, fna2
    var fna1 = factpath_tmp + "/" +fst.fn; // NEW
    var fna2 = global.fact_path + "/" + fst.fn; // EXISTING (to be overwritten)
    var debug = 1;
    var cont = fs.readFileSync(fna1, 'utf8');
    if (!cont) { return 1;}
    var jtmp = cont ? JSON.parse(cont) : null;
    if (!jtmp) { console.log("Loaded non-json or empty !?"); return 2; }
    cont = JSON.stringify(jtmp); // , null, 2
    var werr = 1;
    try {
      debug && console.log("Copying "+cont.length+" B. to "+fna2);
      fs.writeFileSync(fna2, cont , {encoding: "utf8"} );
      werr = 0;
    } catch(ex) { console.log("Error writing: "+ex); return 3; }
    // stat ?
    return 0;
  }
  /** @param fst {object} File size stats (size, size_o) for comparable 2 files in 2 fact dirs and name (fn).
   * Sample of bad facts:
   * ```
   * {"changed": false, "msg": "Failed to connect to the host via ssh: ssh: connect to host odroid-32 port 22: No route to host\r\n", "unreachable": true}
   * ```
  */
  function newfacts_accept(fst) { // fst has 3 mems: fn, size, size_o
    if (fst.size < 5000) { return 0; } // Suspect size !
    var fna = factpath_tmp+"/"+fst.fn; // Existing
    if (fs.existsSync(fna)) {
      console.log("loading "+fna+ " as JSON to test it");
      //var jtmp = require(fna); // Read New/Temp JSON
      var cont = fs.readFileSync(fna, 'utf8');
      var jtmp = cont ? JSON.parse(cont) : null;
      // Look for Corrupt / Error results
      // DO NOT (this is in all facts): if (jtmp && (jtmp.changed != undefined)) { console.log("Elim:"+fna);return 0; }
      if (jtmp && (jtmp.unreachable != undefined)) { console.log("Elim:"+fna); return 0; }
    }
    // DO not use: if (fs.size < fst.size_o) { return 0; }
    var ratio = fst.size / fst.size_o;  // new : old
    console.log("Ratio(new:old): "+ratio);
    if (ratio >= 1)  { return 1; }
    if (ratio > 0.9) { return 1; } // Note difference between pretty and non-pretty !!!
    return 0; // Be sceptic by default
  }
}
/** Server handler for polling Ansible operation completion.
 * Expected behavior on client based on status:
 * - err - Error, not worth trying to retry
 * - ok - Success with info, no need to retry
 * - wait - not completed, continue poll / retry.
 * On HTTP server error, client should take status=err measures.
 */
function ansible_op_poll(req, res) {
  var jr = {"status": "err", "msg": "Could not Ack Completion."};
  var id = req.query ? req.query.runid : 0;
  if (!id) { jr.msg += "No runid passed"; return res.json(jr); }
  // Check indication for runid completed
  // See  Runner method ansible_run() (inner func oncomplete) to see how completion
  // is stored and match that methodology (files ..) here.
  var fname = ans.Runner.compfname(id);
  if (!fname) { jr.msg += "No filename figured out for runid "+id; return res.json(jr); }
  console.log("Look for ack-file: "+fname);
  if (!fs.existsSync(fname)) { return res.json({status: "wait", msg: id + " Not complete yet ..."}); }
  var cont = fs.readFileSync(fname, 'utf8');
  var j = cont ? JSON.parse(cont) : null;
  if (!j) { jr.msg += "File present, but failed to load ... for "+id; return res.json(jr); }
  // Delete ? Prevent from being found again (by e.g. competing polling thread)
  try { fs.unlinkSync(fname); } catch (ex) { console.log("Ack-results deletion failed: "+ex); }
  return res.json({status: "ok", data: j});
}
/** List ansible profiles or playbooks (GET: /anslist/play /anslist/prof).
 * Examples of testing out listings via API:
 * ```
 * curl http://localhost:3000/anslist/play
 * curl http://localhost:3000/anslist/prof
 * ```
*/
function ansible_plays_list(req, res) {
  var jr = {"status": "err", "msg": "Failed to list Ansible artifacts"};
  var urls = {"/anslist/play": "play", "/anslist/prof": "prof"};
  var url = req.url;
  var aotype = urls[url];
  if (!aotype) { jr.msg += "Not a playbook or profile URL !";res.json(jr); return; }
  var acfg = global.ansible;
  var pbpath = process.env['PLAYBOOK_PATH'] || acfg.pbpath; // TODO: Only look into acfg.pbpath !!!
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
  var sprop = "ansible_processor_vcpus"; var dprop;
  var umap = [
    {url: "/hostcpucounts", sprop: "ansible_processor_vcpus", dprop: "numcpus"},
    {url: "/hostmemstats",  sprop: "ansible_memtotal_mb", dprop: "memcapa"},
  ];
  if (req.url == '/hostcpucounts') { sprop = "ansible_processor_vcpus"; dprop = 'numcpus'; } // Num CPU:s
  else if (req.url == '/hostmemstats') { sprop = 'ansible_memtotal_mb'; dprop = 'memcapa'; } // MB
  //var un = umap.find((un) => { return un.url == req.url; });
  //if (!un) { jr.msg += "URL config not found for "+req.url; return res.json(jr); }
  //var sprop = un.sprop;
  //var dprop = un.dprop;
  var arr = [];
  // Extract sorce property sprop to destination prop dprop
  hostarr.forEach(function (f) {
    //arr.push({hname: f.ansible_fqdn, numcpus: f[sprop]});
    var e = {hname: f.ansible_fqdn};
    e[dprop] = f[sprop];
    arr.push(e);
  });
  res.json({status:"ok", data: arr});
}
/** Aggregate count of particular value in a property.
 * This is suitable for "type stats" (e.g. ansible_architecture, ansible_machine, ansible_domain, ansible_kernel, ansible_os_family, ansible_pkg_mgr ansible_processor_cores...).
 */
function hostp_prop_aggr(req, res) {
  var jr = {"status": "err", "msg":"Could not extract data to display. "};
  var umap = [
    // OS distro (ansible_os_family, ansible_distribution_file_variety)
    {url: "/distrostats", sprop: "ansible_distribution", dprop: "distname"},
    {url: "/cpuarchstats", sprop: "ansible_architecture", dprop: "arch"}
  ];
  // Lookup URL
  var un = umap.find((un) => { return un.url == req.url; });
  if (!un) { jr.msg += "URL config not found for "+req.url; return res.json(jr); }
  var arr = [];
  var idx = {};
  var sprop = un.sprop;
  var dprop = un.dprop;
  // First pass, gather stats (to idx)
  hostarr.forEach(function (f) {
    //var e = {}; // hname: f.ansible_fqdn
    //e[dprop] = f[sprop];
    //arr.push(e);
    if (!f || !f[sprop]) { return; }
    if (!idx[f[sprop]]) { idx[f[sprop]] = 0; }
    idx[f[sprop]]++; // idx[f[sprop]] ? idx[f[sprop]] + 1 : 1;
  });
  console.log(idx);
  // How to sort ? alphabetically ?
  Object.keys(idx).forEach((k) => {
    var e = {};
    e[dprop] = k;
    e.val = idx[k]; // TODO: cnt
    arr.push(e);
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
  var q = req.query;
  if (q && q.pkgs) { pkgs = q.pkgs.split(/,\s*/); }
  console.log("Start /hostpkgstats");
  // Add hname here or on client ?
  var hostfld = {name: "hname", title: "Host", type: "text", css: "hostcell", width: 200};
  // Note: must mangle "." to "_" to avoid dot-notation problems with jsgrid.
  var gdef = pkgs.map(function (pn) {
    var pnn = pn.match(/\./) ? pn.replace(/\./g, "_") : pn;
    return {name: pnn,  title: pn, type: "text", width: 50,};
  });
  gdef.unshift(hostfld);
  var root = global.pkglist_path; // process.env["PKGLIST_PATH"] || process.env["HOME"] + "/hostpkginfo";
  var arr = [];
  hostarr.forEach(function (f) { // map ?
    var hn = f.ansible_fqdn;
    var path = root + "/" + hn;
    if (!fs.existsSync(path)) { return; }
    //arr.push({hname: f.ansible_fqdn, numcpus: f[prop]});
    var pidx = ospkgs.pkgset('', hn, path, {idx: 1}) || {};
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
/** Reboot host using BMI by RedFish (Always GET for simplicity).
 * Pass URL path embedded parameters:
 * - :hname - hostname to reboot. The IPMI/BMI address is figured out here. (e.g. bld-001.mycomp.com in /boot/bld-001.mycomp.com)
 * - :op - Operation (Options: info,boot,setpxe)
 * Require PIN ?
 * Always validate host and its identity from facts.
 * TODO: Consider interrogating ".../Systems/" and choosing resp.Members[0]["@odata.id"]
 * URL Path params: ":hname", e.g. /boot/bld-001.mycomp.com
 * Operation is extracted from URL path param 
 * Query Params:
 * - test - test/debug only, returns early and returns a planned mock-up message without making chained HTTP request
 * - pxe - Use PXE boot on next boot (Possibly an install, maintenance or memory test)
 * - pin - pin authorization code for reboot (NOT USED)
 * Config "ipmi.testurl" - changes the url to a mock-up tese url
 * Could first query "PowerState", "Id" (e.g. "Id": "System.Embedded.1",) "@odata.id" ... by GET
 * Examples for URL call:
 * ```
 * Info Only
 * curl  -X GET https://foo.com/redfish/v1/Systems/System.Embedded.1/ -u admin:admin --insecure | python -m json.tool | less
 * Boot (Pxe)
 * # try: On,ForceOff,ForceRestart,GracefulShutdown,PushPowerButton,Nmi. Ideally: GracefulRestart
 * boot.json: {"ResetType": "GracefulRestart", "BootSourceOverrideTarget": "Pxe"}   ... OR
 *            {"ResetType": "PowerCycle", "BootSourceOverrideTarget": "Pxe"}
 * # May need: -H "Content-Type: application/json" -d "... data ..."
 * curl -X POST https://10.75.159.81/redfish/v1/Systems/System.Embedded.1/Actions/ComputerSystem.Reset -u a:b --insecure -d @boot.json
 * curl -X PATCH https://10.75.159.81/redfish/v1/Systems/System.Embedded.1/ -u a:b --insecure -d '{"Boot": {"BootSourceOverrideTarget": "Pxe"}}'
 * ```
 * 
 * Need to reset earlier ... ResetType or BootSourceOverrideTarget ???
 * 
 * TODO:
 * - /redfish/v1/UpdateService/FirmwareInventory
 * - /redfish/v1/UpdateService/FirmwareInventory/Available
 * - /redfish/v1/UpdateService/Actions/UpdateService.SimpleUpdate
 * - /redfish/v1/Systems/<System-Id>/Actions/ComputerSystem.Reset
 * Also see: Updating firmware using HTTP share
 * Refs:
 * https://www.dell.com/community/Systems-Management-General/Power-Cycle-System-Cold-Boot-via-rest-api/td-p/5081009
 * https://github.com/dell/iDRAC-Redfish-Scripting/blob/master/Redfish%20Python/SetNextOneTimeBootDeviceREDFISH.py
 * https://stackoverflow.com/questions/63402788/how-to-reboot-a-system-using-the-redfish-api
 * https://docs.oracle.com/cd/E19273-01/html/821-0243/gixvt.html
 * https://redfishforum.com/thread/261/host-warm-reboots
 * https://eehpcwg.llnl.gov/assets/121015_intro_to_redfish.pdf - 2015 overview of RedFish with good JSON message examples
 * https://github.com/dell/iDRAC-Redfish-Scripting/issues/39 - racadm / python firmware update (non-RF)
 * https://www.dandh.com/pdfs/Cloud-Axcient-idrac9-lifecycle-controller-v3212121_api-guide_en-us.pdf - Dell Redfish API Guide (3.21.21.21)
 * https://www.dell.com/idracmanuals
 * https://www.dell.com/support/home/en-sg/product-support/product/idrac9-lifecycle-controller-v4.x-series/docs - Has Redfish guide
 * https://topics-cdn.dell.com/pdf/idrac9-lifecycle-controller-v4x-series_api-guide_en-us.pdf - iDRAC9 Redfish API Guide
https://www.dmtf.org/standards/redfish
 */
function host_reboot(req, res) {
  var jr = {"status": "err", msg: "Failed redfish (info/boot)."};
  // TODO: Parametrize ID
  
  var rmc = global.ipmi || {};
  var rmgmtpath = process.env['RMGMT_PATH'] || rmc.path ||  process.env['HOME'] + "/.linetboot/rmgmt"; // Duplicated !
  //var rfmsg = {"ResetType": "GracefulRestart", }; // "BootSourceOverrideTarget": "Pxe"
  //var rfmsg = {"ResetType": "PowerCycle", }; // ForceRestart
  var rq = req.query;
  var p = req.params;
  
  if (!p || !Object.keys(p).length) { jr.msg += " No URL path params."; return res.json(jr); }
  if (!p.hname) { jr.msg += " No Host."; return res.json(jr); }
  if (!p.op || ! redfish.ops_idx[p.op]) { jr.msg += " Not a supported op (try: info,boot,setpxe)."; return res.json(jr); }
  if (!rq) {  jr.msg += " No Query params."; return res.json(jr); }
  var ipmiconf = global.ipmi || {};
  if (!ipmiconf || !Object.keys(ipmiconf).length) { jr.msg += " No Config."; return res.json(jr); }
  // cli: --pxe
  if (p.op == 'boot' && rq.pxe) { console.log("pxe=true, Use op=setpxe"); p.op = "setpxe"; } // Need both ops !? - NOT if kept strictly separate
  if (rq.test) { return res.json({status: "ok", test: 1}); } // rfmsg
  
  
  var f = hostcache[p.hname];
  if (!f) { jr.msg += " No facts, Not a valid host:"+p.hname; return res.json(jr); }
  var hps = hlr.hostparams(f);
  var rmgmt = ipmi.rmgmt_load(f, rmgmtpath);
  // Try to fall back to hostparams => bmcipaddr
  if (!rmgmt || !rmgmt.ipaddr) {
    // Could not fall back ...
    if (!hps || !hps.bmcipaddr) { jr.msg += " No rmgmt info (bmcipaddr) for host to contact."; return res.json(jr); }
    // Mock up rmgmt info
    rmgmt = { ipaddr: hps.bmcipaddr };
  }
  //if (!ipmiconf.testurl && (!rmgmt || !rmgmt.ipaddr)) {  jr.msg += " No BMC/rmgmt host."; return res.json(jr); }
  // console.log("RMGMT-info:",rmgmt);
  //if (!ipmiconf.testurl && !rmgmt) { jr.msg += " No rmgmt info for host to contact."; return res.json(jr); }
  console.log("rq:",rq);
  
  var ipmiconf2 = redfish.gencfg(ipmiconf, hps);
  var rfop = new redfish.RFOp(p.op, ipmiconf2).sethdlr(hdl_redfish_succ, hdl_redfish_err);
  if (!rfop) { jr.msg += "Failed to create RFOp"; return res.json(jr); }
  rfop.debug = 1;
  console.log("Constructed RFOp", rfop);
  var isbootop = {"boot": 1, "setpxe": 1}; // Boot related ops (NOT: info)
  if ((p.op == 'boot') && hps['rfresettype']) { rfop.msg.ResetType = hps['rfresettype']; console.log("Changed ResetType to: "+rfop.msg.ResetType); }
  // use IP Address to NOT have to use DNS to resolve.
  //var rfurl = rfop.makeurl(rmgmt.ipaddr, ipmiconf); // "https://"+rmgmt.ipaddr+rebooturl.base + "Systems/" + sysid + rebooturl[p.op];
  // "User-Agent": "curl/7.54.0"
  //var hdrs = { Authorization: "Basic "+bauth, "content-type": "application/json", "Accept":"*/*" }; // 
  // See if host (hps = Host params) needs to use IPMI because of buggy or non-existing RedFish interface
  // OLD: (p.op == "boot")
  if ((isbootop[p.op]) && hps["bmcuseipmi"]) { console.log("Use IPMI (on "+p.op+" based on host param) !"); rfop.request_ipmi(rmgmt.ipaddr, ipmiconf2); } // IPMI (fallback)
  else { rfop.request(rmgmt.ipaddr, ipmiconf2); } // RedFish / HTTP
  return;
  //var meth = rfop.m; //var meth = ops[p.op];
  //if (meth == 'get') { delete(hdrs["content-type"]); rfmsg = null; }
  //console.log("Call("+meth+"): "+rfurl + "\nBody: ", rfmsg, " headers: ", hdrs);
  // Expect HTTP: 204 (!)
  // Error: self signed certificate
  //process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  
  //const https = require('https'); // import https from 'https';
  //https.globalAgent.options.rejectUnauthorized = false;
  //const agent = new https.Agent({ rejectUnauthorized: false });
  
  //var reqopts = {headers: hdrs, }; // httpsAgent: agent
  //if (meth == 'post') { axios[meth](rfurl, rfmsg, reqopts).then(hdl_redfish_succ).catch(hdl_redfish_err); }
  //if (meth == 'get') { axios[meth](rfurl, reqopts).then(hdl_redfish_succ).catch(hdl_redfish_err); }
  // Advanced handling: https://github.com/axios/axios/issues/960
  function hdl_redfish_succ(resp) {
    var status = resp.status;
    console.log("RF Success:"+status);
    var d = resp.data;
    if (resp.headers) { console.log("resp-hdr:",resp.headers); }
    // Possible errors
    if (resp.headers && resp.headers["content-type"] && resp.headers["content-type"].match(/text\/html/)) {
      jr.msg += " Got HTML response"; return res.json(jr);
    }
    if (status >= 400) { jr.msg += "Got HTTP (Error) Status "+status; return res.json(jr); }
    // Boot response does not have body (is empty string), but has 204 status
    console.log(rfop.m + "-Success-response-data("+status+"): ",resp.data); // meth+ 
    if (!d && (status == 204)) { d = {"msg": "204 ... RedFish Boot should be in progress"};}
    if (d) { d.msgsent = rfop.msg; } // OLD: rfmsg
    var mcinfo = { ipaddr: rmgmt.ipaddr };
    res.json({"status":"ok", data: d, mcinfo: mcinfo});
  }
  // 400 (e.g. 404), 500 ?
  // Error: Parse Error
  // Error: Request failed with status code 400 ("Bad Request" on op: boot) statusText: 'Bad Request', server: 'Apache'
  //     {"ResetType":"GracefulRestart"} <= GracefulRestart N/A on "BiosVersion": "2.2.11", only closest is ForceRestart
  //     - Need to probe and choose closest (from Actions["#ComputerSystem.Reset"]["ResetType@Redfish.AllowableValues"] ?
  //     - Secondary problem: Using valid "ForceRestart" + "Pxe" does normal boot, not PXE
  function hdl_redfish_err(err) {
    // TODO: See how to get resp from here.
    console.log("RF Error: ...");
    var resp = err.response;
    if (!resp) { console.log("No (axios) response object in error !"); }
    jr.msg += err.toString();
    resp && console.log(resp.statusText); // Has: status, statusText
    resp && console.log(JSON.stringify(resp.data, null, 2));
    console.log(rfop.m + " Error: ", err); // meth+ error will be object
    var messages = [];
    if (resp && resp.data.error && resp.data.error["@Message.ExtendedInfo"]) {
      var arr = resp.data.error["@Message.ExtendedInfo"];
      // arr.map is not a function 
      if (Array.isArray(arr)) { messages = arr.map(function (it) { return it.Message; }); }
      else { console.log("Warning: arr is not Array !"); }
      
    }
    jr.messages = messages;
    res.json(jr);
  }
  // Used to have ipmitool in here. See ipmi.ipmi_cmd()
  //DONOTUSE: res.json({bauth: bauth, rfmsg: null, rfurl:rfurl, p: p}); // rfmsg
}

  // if (req.body) { console.log("Express-body: ",req.body); } // Always {}
  //if (rq.pxe) { rfmsg.BootSourceOverrideTarget = 'Pxe'; } // DOES NOT WORK w. POST
  //function opurl(op, rmgmt, rebooturl, ipmiconf) {
  //  
  //}
  //var bauth = redfish.basicauth(ipmiconf);
  // TODO: Call Base URL to detect/discover several things
  
  // Dell opts for ResetType: "On","ForceOff","GracefulRestart","PushPowerButton","Nmi" ("PowerCycle")
  // failed: Unsupported Reset Type:ColdBoot"
  // HP wants: “ResetType”: “ColdBoot”
  // Get IPMI / iDRAC URL. All URL:s https.
  // The <id> part may be (e.g.) "1" (HP) or "System.Embedded.1" (Dell) or "437XR1138R2" (example)
  //var sysid = "1"; // HP, Others ?
  //if (f &&  f.ansible_system_vendor && f.ansible_system_vendor.match(/Dell/)) { sysid = "System.Embedded.1"; }
  /*
  var rebooturl = {
    "base": "/redfish/v1/",
    "info": "", // Add NONE
    "boot": "/Actions/ComputerSystem.Reset", // POST
    "noot_p": "", // PATCH
     // "/redfish/v1/Systems/1/Actions/ComputerSystem.Reset/" // HP ? Seems more standard per initial spec (e.g. 121015_intro_to_redfish.pdf)
     // "/redfish/v1/Systems/System.Embedded.1/Actions/ComputerSystem.Reset" // Dell ?
     // /redfish/v1/UpdateService/Actions/Oem/DellUpdateService.Install
  };
  */

/* POST to simulate RF response (Used internally when ipmiconf.testurl is set). 
 * Only contains partial subset of RF response.
 */
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
/** Send Info from local environment docker.conf.json and dockercat.conf.json.
 * If these exist for env, they should be configured in main config: docker.conf and docker.catalog.
 * Client should gracefully detect error from this and let user know feature is not in use.
 */
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
 * Config info is taken or derived from global config structure.
 */
function config_send(req, res) {
  var cfg = {docker: {}, core: {}, bootlbls: [], procster: {}};
  // Docker host group
  var dock = global.docker;
  var core = global.core;
  var tftp = global.tftp;
  var web  = global.web;
  var proc  = global.procster;
  var esxi  = global.esxi;
  // Docker
  if (dock && dock.hostgrp) { cfg.docker.hostgrp = dock.hostgrp; }
  if (dock && dock.port)    { cfg.docker.port = dock.port; }
  if (dock && dock.syncgrps){ cfg.docker.syncgrps = dock.syncgrps; }
  if (dock && dock.compfiles && Array.isArray(dock.compfiles)) {
    var path = require("path");
    cfg.docker.files = dock.compfiles.map((full) => { return path.basename(full); });
  }
  // Procster
  if (proc && proc.port)    { cfg.procster.port = proc.port; }
  // Core
  if (core && core.appname) { cfg.appname = core.appname; }
  if (core && core.hdrbg)   { cfg.hdrbg = core.hdrbg; } // BG Image
  if (tftp && tftp.menutmpl) { cfg.bootlbls = tboot.bootlabels(tftp.menutmpl); }
  // Disable
  cfg.disabled = global.disabled; // could be undef, except mainconf module sets this to []
  // GUI
  if (web && (typeof web.tabui !== "undefined")) { cfg.tabui = web.tabui; }
  else { cfg.tabui = 1; } // Legacy default
  // Current sess
  cfg.username = req.session.user ? req.session.user.username : "";
  cfg.unattr = global.ldap ? global.ldap.unattr : "";
  // OS/Version view columns/fields
  if (web && web.xflds) { cfg.xflds = web.xflds; }
  // 
  if (esxi && esxi.vmhosts) { cfg.vmhosts = esxi.vmhosts; }
  res.json(cfg);
}

/** Receive a next boot (e.g. OS installation) request and store it to persistent storage.
 * Note that the actual booting ins **not yet** done by calling this. Send a follow-up call to
 * actually boot.
 * URL k-v Parameters:
 * - hname - Hostname
 * - bootlbl - Menu boot label to boot later into
 * 
 * Actions taken to enable next boot:
 * - Resolve pxelinux supported mac address based filename.
 * 
 * ## Plan for DB based processing
 * 
 * As a result of request, store following properties on the install-case:
 * - Set state of boot/install to "pending".
 * - Set time of request
 * - Set hname, ipaddr, macaddr to make lookups by these
 * - Trigger actions
 *   - Generate menufile by MAC address name in pxelinux.cfg (name: 01+macaddr)
 *   - Possibly trigger RedFish "Pxe" or IPMI "pxe" boot type request for the "next boot".
 * 
 * Mockup of table (boot_install)
 * 
 * - bootreqid integer NOT NULL
 * - createdate datetime,
 * - hname   varchar(128) NOT NULL,
 * - ipaddr  varchar(32) NOT NULL,
 * - macaddr varchar(32) NOT NULL,
 * - bootlbl varchar(64) NOT NULL,
 * - status  varchar(16) NOT NULL, // "pending"
 * Refs:
 * https://github.com/dell/redfish-ansible-module/issues/56
 * ./SetNextOneTimeBootDeviceREDFISH.py
 * https://github.com/dell/iDRAC-Redfish-Scripting/blob/master/Redfish%20Python/SetNextOneTimeBootDeviceREDFISH.py
 */
function installrequest(req, res) {
  var jr = {status: "err", "msg": "Could not register next boot/install request. "};
  var msgarr = [];
  console.log("Starting to process boot/install request");
  // Simple log-screen and log-to-message
  function log(msg) { console.log(msg); msgarr.push(msg); }
  // Validate request
  var q = req.query;
  if (!q) { jr.msg += "No query params"; return res.json(jr); }
  if (!q.hname)   { jr.msg += "No hostname (hname) indicated"; return res.json(jr); }
  if (!q.bootlbl) { jr.msg += "No Boot label (bootlbl) indicated"; return res.json(jr); }
  var tcfg = global.tftp;
  if (!tcfg) { jr.msg += "No TFTP Config inside main config"; return res.json(jr); }
  if (!tcfg.menutmpl) { jr.msg += "No Boot Menu file found (for label validation)"; return res.json(jr); }
  // INSERT INTO boot_install () VALUES ()
  // Lookup host from index
  var f = hostcache[q.hname];
  if (!f) { jr.msg += "No host found by hname = '"+q.hname+"'. Check that you are passing the fqdn of the host"; return res.json(jr); }
  log("Found host facts for " + q.hname + ". Use boot label "+ q.bootlbl);
  var macaddr = f.ansible_default_ipv4 ? f.ansible_default_ipv4.macaddress : "";
  if (!macaddr) { jr.msg += "No MAC Address found for hname " + q.hname; return res.json(jr); }
  var bootitem;
  try { bootitem = tboot.bootlbl2bootitem(q.bootlbl, tcfg); }
  catch (ex) { jr.msg += "bootlbl2bootitem: "+ex.toString(); return res.json(jr); }
  // Consider multiple ?
  log("Found boot item: id = "+bootitem.id+", name = "+ bootitem.name);
  // Template menu file
  
  // if (!fs.existsSync(mfn)) { jr.msg += "No Boot Menu file found for label validation "; return res.json(jr); }
  
  var fullmacfn;
  try { fullmacfn = tboot.bootmenu_save(tcfg, global, q.bootlbl, f); }
  catch (ex) { jr.msg += "bootmenu_save: "+ex.toString(); return res.json(jr); }
  log("Wrote Menu (for MAC '"+macaddr+"') to: " + fullmacfn);
  // Make a call to set next boot to PXE (by Redfish ? ipmitool ?)
  // see if IPMI is in use (by config) and detect presence of rmgmt info for q.hname
  var useipmi = 0; // global.ipmi.useipmi;
  var userf = global.ipmi.userf;
  ////////////////// Sync to remote TFTP ? ////////////////
  //if (tcfg.sync && ) {
  //  var remloc = tcfg.ipaddr + ":" + tcfg.root;
  //  var user = process.env["USER"];
  //  scp_sync(tcfg.root, remloc, {recursive: 1, user: user}, function (err, path) {
  //    if (err) { jr.msg += "Failed to sync to remote TFTP ("+remloc+")"; console.error(jr.msg); return res.json(jr); }
  //  });
  //}
  ////////////////// Additionally set PXE boot /////////////////
  var rmgmtpath = process.env["RMGMT_PATH"] || global.ipmi.path;
  if (!rmgmtpath) { jr.msg += "No rmgmt path in env or config"; return res.json(jr); }
  var icok = ipmi.rmgmt_exists(q.hname, rmgmtpath); // IPMI config OK
  if (!icok) { jr.msg += "Some or all IPMI configs missing to lookup BMC IP."; return res.json(jr); }
  log("Found IPMI info files for " + q.hname + ", load them ...");
  let rmgmt = ipmi.rmgmt_load(f, rmgmtpath);
  if (!rmgmt) { jr.msg += "No rmgmt info for host (by facts)"; return res.json(jr); }
  console.log("HAS-RMGMT:", rmgmt);
  var hps = hlr.hostparams(f);
  // Instantiate by IPMI Config (shares creds)
  var ipmiconf2 = redfish.gencfg(global.ipmi, hps);
  var rfop = new redfish.RFOp("setpxe", ipmiconf2).sethdlr(hdl_redfish_succ, hdl_redfish_err);
  // Call host by MC ip address ...

  // Need to use IPMI ?
  if (hps["bmcuseipmi"]) { rfop.request_ipmi(rmgmt.ipaddr, ipmiconf2); return; }
  // RedFish (patch)
  else if (1) { rfop.request(rmgmt.ipaddr, ipmiconf2); return; }
  // IPMI
  else if (useipmi ) { // && ipmi.rmgmt_exists(q.hname) - Already checked
    //var cmd = "";
    
    // let rmgmt = ipmi.rmgmt_load(f); // Not needed for ipmi_cmd() !!!
    //if (!rmgmt) { jr.msg += "No rmgmt info for host (by facts)"; return res.json(jr); }
    //console.log("HAS-RMGMT:", rmgmt);
    /* NEW: ... */
    // ALREADY ABOVE: var ipmiconf2 = redfish.gencfg(global.ipmi, hps);
    // ALREADY ABOVE: var rfop = new redfish.RFOp("setpxe", ipmiconf2).sethdlr(hdl_redfish_succ, hdl_redfish_err);
    //rfop.request_ipmi(rmgmt.ipaddr, ipmiconf2);
    //return;

    // ipmitool lan print 1   ipmitool user list 1 chassis power status mc info  Reset BMC: mc reset cold [chassis] power soft
    // chassis bootparam set bootflag pxe
    var pxecmd = "chassis bootdev pxe"; // "lan print 1". Also options=persistent
    var ipmicmd = ipmi.ipmi_cmd(f, pxecmd, global, {});
    log("Formulated IPMI command: '"+ipmicmd+"'");
    if (!ipmicmd) { jr.msg += "Could not formulate IPMI Command"; return res.json({status: "ok", data: {"msgarr": msgarr}}); } // NOTE: NOT OK (Change) !!!
    var run = cproc.exec(ipmicmd, function (err, stdout, stderr) {
      if (err) {
        jr.msg += "Problem with ipmitool run:" + err;
        console.log(jr.msg);
        //console.log(stderr);
        return res.json(jr);
      }
      
      log("Executed IPMI command successfully: " + stdout);
      return res.json({status: "ok", data: {"msgarr": msgarr}});
    });
    // run.on('exit', function (code) {});
    //return;
  }
  else { return res.json({status: "ok", data: {"msgarr": msgarr} }); }
  //////////// Success / Error Functions
  // TODO: Decorate these with better message extraction
  function hdl_redfish_succ(resp) {
    return res.json({status: "ok", data: {"msgarr": msgarr}});
  }
  function hdl_redfish_err(ex) {
    console.log(ex.toString());
    jr.msg += ex.toString();
    return res.json(jr);
  }
}
/** List MAC address named boot config (or symlink) files in pxelinux.cfg directory.
 */
function tftp_listing(req, res) { // global
  var jr = {status: "err", "msg": "Could List PXE Linux dir. "};
  // PXE Linux Config dir
  var path = global.tftp.root + "/pxelinux.cfg/";
  if (!fs.existsSync(path)) { jr.msg += "TFTP subdir for PXE linux Config does not exist"; return res.json(jr); }
  console.log("Found Path: "+path);
  var list = tboot.pxelinuxcfg_list(path, 1);
  // Blend in hostnames (loose-coupled way) + dig up target ?
  list.forEach(function (it) {
    it.macaddr = tboot.has_macfile_pattern(it.fname, 1);
    if (it.macaddr) {
      var f = hostcache[it.macaddr];
      it.hname = f ? f["ansible_fqdn"] : ""; }
    // Private boot menu file
    var fullfn = path + it.fname;
    if (!it.issym) { it.bootlbl = tboot.menu_deflbl(fullfn); }
  });
  // Sort by e.g. name. Names joined ONLY on client side ?
  var byname = function (a, b) { return a.hname.localeCompare(b.hname); };
  list.sort(byname);
  res.json({"status": "ok", data: list});
}
/** Reset the earlier set custom PXE boot (target) back to default boot menu.
 * Pass "macaddr" or allow lineboot to auto-detect mac based on IP address.
 * Implicitly also resets the (RedFish) boot setting "BootSourceOverrideTarget" to "None".
 * TODO: Allow reset by hostname "" to allow access from linet.js
 * Testing by client ip auto-detection: curl http://linethost:3000/bootreset
 */
function bootreset(req, res) {
  var jr = {status: "err", "msg": "Could not reset custom boot target. "};
  var q = req.query || {};
  var tcfg = global.tftp;
  var ipmicfg = global.ipmi;
  if (!tcfg) { jr.msg += "No TFTP Config inside main config"; return res.json(jr); }
  if (!ipmicfg) { jr.msg += "No IPMI Config inside main config"; return res.json(jr); }
  //if (!q || !Object.keys(q).length) { jr.msg += "No Params"; return res.json(jr);}
  var f;
  // Likely an OS install (Detect IP)
  if (!q.macaddr) { // q.macfname
    // Fall back to detecting IP address of client
    var ip = osinst.ipaddr_v4(req);
    console.log("bootreset: Choose rest-host by auto detecting IP: "+ip);
    if (!ip) { jr.msg += "No Boot menu file name or IP address detected"; return res.json(jr); }
    f = hostcache[ip];
    if (!f) { jr.msg += "No Facts found by IP address " + ip; return res.json(jr); }
    //var mac;
    //try { mac = f.ansible_default_ipv4.macaddress; }
    //catch (ex) { jr.msg += ex.toString(); return res.json(jr); }
    
  }
  // As minimum ensure this is valid host
  else {
    //var mac = tboot.macfilename_to_mac(q.macfname);
    var mac = q.macaddr;
    if (!mac) { jr.msg += "No mac derived from mac filename (for facts lookup)"; return res.json(jr);}
    f = hostcache[mac];
    if (!f) { jr.msg += "No Facts found by mac " + mac; return res.json(jr); }
  }
  
  var macfname = tboot.menu_macfilename(f);
  if (! macfname || (macfname.length != 20)) {
    jr.msg += "No macfname derived by facts"; return res.json(jr);
  }
  //q.macfname = macfname;
  console.log("Translated client IP or passed mac to macfname: "+macfname+"");
  
  // TODO: if (q.hname) {
  //   var f = hostcache[q.hname];
  //   var macaddr = f.ansible_default_ipv4.macaddress;
  //   // MAC to MAC filename
  //   
  //}
  // Validate format of mac filename
  if (!tboot.has_macfile_pattern(macfname)) { jr.msg += "Not a valid Boot menu file name"; return res.json(jr); }
  console.log("derived macfname validated. Formulating fullname and executing bootmenu_link_default()");
  // Must exist
  var fullfn = tcfg.root+ "/pxelinux.cfg/" + macfname;
  if (!fs.existsSync(fullfn)) { jr.msg += "Boot menu file not there"; return res.json(jr); }
  try { tboot.bootmenu_link_default(tcfg, macfname); }
  catch (ex) { console.log(ex.toString()); jr.msg + "Error Re-Establishing default menu linking: " + ex.toString(); return res.json(jr); }
  // NOTE: If rmgmt NOT in use.. respond syncronously by: return 
  // Lookup rmgmt
  // var rmgmtpath = global.ipmi.path;
  // TODO: Why double response(s) (by hdl_redfish_succ / AND res.json(jr) ) !!!!
  if (!ipmicfg.path) { hdl_redfish_succ({});   jr.msg += "No rmgmt path in config"; return res.json(jr); }
  var rmgmt = ipmi.rmgmt_load(f, ipmicfg.path);
  if (!rmgmt) { hdl_redfish_succ({}); jr.msg += "No rmgmt info by facts"; return res.json(jr); }
  
  
  // TODO: Call Redfish to make patch to {BootSourceOverrideTarget: "None"}
  var ipmiconf2 = redfish.gencfg(ipmicfg, hlr.hostparams(f));
  var rfop = new redfish.RFOp("setpxe", ipmiconf2).sethdlr(hdl_redfish_succ, hdl_redfish_err);
  // We can do this because message is cloned for this instance. Basically becomes "unset-PXE"
  rfop.msg.Boot.BootSourceOverrideTarget = "None"; // None => Cancel
  rfop.request(rmgmt.ipaddr, ipmiconf2);
  // Reload new data like in tftp_listing() ?
  function hdl_redfish_succ(resp) {
    var list = tboot.pxelinuxcfg_list(tcfg.root+ "/pxelinux.cfg/", 1); // 1=??
    res.json({status: "ok", data: list});
  }
  function hdl_redfish_err(err) {
    jr.msg += err.toString();
    return res.json(jr);
  }
  
}
/** List Media directories (Under image mount dir) GET: /medialist
 * Additionally probes into stub directories to see if they are mounted (and have one or more files).
 * TODO: Resolve loop mount image: 1) df 2) losetup --list.  /proc/mounts
 */
function media_listing (req, res) {
  var jr = {status: "err", "msg": "Could properly list media dirs. "};
  // TODO: This should be imgmntpath or isomntpath
  var path = global.core.maindocroot; // Already validated by main server globally
  if (!fs.existsSync(path)) { jr.msg += "maindocroot not there (does not exist)"; return res.json(jr); }
  var list = fs.readdirSync(path);
  if (!list || !list.length) { jr.msg += "No (accessible) dirs under maindocroot"; return res.json(jr); }
  var slash = global.core.maindocroot.match(/\/$/) ? "" : "/";
  var list2 = [];
  list.forEach(function (subdir) {
    
    var subpath = path + slash + subdir;
    // Should succeeed as we just got item (ownership/access problems ?)
    var stats = fs.statSync(subpath);
    if (!stats.isDirectory()) { return; } // File - Skip !
    var e = { path: subpath, filecnt: 0 };
    var sublist = fs.readdirSync(subpath);
    e.filecnt = sublist.length;
    //e.sublist = sublist;
    // return e; // map
    list2.push(e);
  });
  // Fails on MAc/BSD because of field layout, but does not crash.
  losetup_assocs((err, csv) => {
    if (err) { console.log("losetup_assocs faile: "+err); }
    console.log("LO_ASSOCS:", csv);
    // Index (by mountpt) and join !
    var idx_mpt = {};
    csv.forEach((img) => { idx_mpt[img.Mounted] = img; });
    list2.forEach((mp) => {
      // Add imagefn, size
      var img = idx_mpt[mp.path];
      if (!img) { return; }
      mp.loopdev = img.Filesystem; // loopN
      mp.imagefn = img.imagefn;
      mp.size    = img.size;
    });
    console.log(list2);
    res.json({status: "ok", data: list2});
  });
  // res.json({status: "ok", data: list2});
}

function losetup_assocs(cb) {
  // Near-Copy of media_info
  var idx = {}; // Index by "Filesystem"
  cproc.exec("df", function (err, stdout, stderr) {
    if (err) { return cb("Failed df:" + err, null); }
    // Mac/BSD output max: 9
    var csv = hlr.csv_parse_data(stdout, {sep: /\s+/, max: 6});
    //console.log(csv);
    if (!Array.isArray(csv)) { return cb("No Parsed CSV.", null); }
    csv = csv.filter((it) => { return it.Filesystem.match(/\bloop\d+$/); });
    csv.forEach((mnt) => { idx[mnt.Filesystem] = mnt; });
    //return cb(null, csv); // return Already here ?
    // Call tboot.getlosetup for each loopN
    async.map(csv, resolveimage, (err, ress) => {
      if (err) {} // Impossible ?
      cb(null, csv);
    });


  });
  function resolveimage(img, cb) {
    img.imagefn = "";
    tboot.getlosetup(img.Filesystem, function (err, imgfull) {
      if (err) { console.log("Ignored error for getlosetup: "+err);  return cb(null, img); } // cb(err, null);  Accept error OK ?
      console.log("Resolved imagefn: "+imgfull);
      img.imagefn = imgfull;
      // Add size too
      var stats;
      try { stats = fs.statSync(imgfull); } catch (ex) { return cb(null, img); } // ex.toString()
      img.size = stats.size;
      cb(null, img);
    });
  }
}
/** Provide info on loop mount (based on mount point path).
 * Gets query (k-v) param "mid" valued to mount path (mount point) and
 * resolves it to undelying image.
 */
function media_info(req, res) {
  var jr = {status: "err", "msg": "Failed to provide info on loop mount. "};
  var path = global.core.maindocroot;
  var q = req.query;
  if (!q || !q.mid) { jr.msg += "No Query or mount id in query ('mid')"; return res.json(jr); }
  
  // Parse tablular "df" output
  function getdf(cb) {
    cproc.exec("df", function (err, stdout, stderr) {
      if (err) { return cb("Failed df:" + err, null); }
      // Mac/BSD output max: 9
      var csv = hlr.csv_parse_data(stdout, {sep: /\s+/, max: 6});
      console.log(csv);
      if (!Array.isArray(csv)) { return cb("No Parsed CSV.", null); }
      var rec = csv.filter((it) => { return it.Mounted == q.mid; })[0]; // MOT: "/isomnt/"+
      if (!rec) { return cb("No Entry found by:"+q.mid, null); }
      // console.log(rec);
      loopdev = rec.Filesystem;
      cb(null, rec.Filesystem); // Pass rec ? w. all info !
    });
    //cb(null, 1); // TEST ONLY
  }
  
  // OLD: Adapter callback to adapt the cb-only signature to more sophisticated loopdev,cb signature.
  function getlosetup_wrap(cb) {
    // Adapt also the callback ?
    // grab outer-function-local loopdev
    tboot.getlosetup(loopdev, function (err, __imgfull) {
      if (err) { return cb(err, null); }
      imgfull = __imgfull; // outer-function-local imgfull
      cb(null, __imgfull);
    });
  }
  // Stat image (sync)
  function imagestat(cb) { // imgfull, 
    console.log("Continue by imgfull: " + imgfull);
    var stats;
    try { stats = fs.statSync(imgfull); } catch (ex) { return cb(ex.toString(), null); }
    //var size = stats.size;
    console.log("imagestat: Size: "+stats.size);
    cb(null, stats.size);
  }
  // Data Driven: async.eachSeries(arr, func, complcb); Note: complcb does not get results !
  // Funcs:       async.waterfall([f1, f2], complcb): 1st: cb only, further: data, cb
  // Funcs:       async.series([f1, f2], complcb); All only cb
  /////////////////////////////////////////////////////
  var loopdev = "";
  var imgfull = "";
  console.log("Will lookup (df) mounts by: " + q.mid);
  // series: signature is always cb (only!)
  
  async.series([ getdf, getlosetup_wrap, imagestat ], oncomplete);
  // NOT good ! oncomplete Only gets the data of last of the waterfall functions !
  //async.waterfall([ getdf, getlosetup, imagestat ], oncomplete);
  function oncomplete (err, result) {
    if (err) { jr.msg += "Failed async.series: " + err; console.log("Error: "+jr.msg); return res.json(jr); }
    //imgfull = result[1];
    var loopinfo = { "dev": result[0], "img": result[1], "size": result[2]};
    console.log(loopinfo);
    res.json({status: "ok", data: loopinfo});
  }
}

/** LDAP Connection test.
 * global ldconn; ldbound;
 * Init: check (ldc.host !ldc.disa), do client inst and async bind.
 * Request: in app.use MW check if (ldbound and !sess) { block...}
 * On client. In onpageload check session. Take router into use. Check router middleware

 */
function ldaptest(req,res) {
  //var ldap = require('ldapjs');
  var jr = {status: "err", msg: "LDAP Search failed."};
  var ldc = global.ldap;
  var q = req.query;
  req.session.cnt =  req.session.cnt ?  req.session.cnt + 1 : 1;
  if (req.session && req.session.qs) { console.log("Adding: "+q.uname); req.session.qs.push(q.uname); }
  if (!ldconn || !ldbound) { jr.msg += "No Connection"; jr.qs = req.session; return res.json(jr); }
    var ents = [];
    var d1 = new Date();
    //  TODO: Only select 
    var lds = {base: ldc.userbase, scope: ldc.scope, filter: filter_gen(ldc, q)}; // "("+ldc.unattr+"="+q.uname+")"
    if (!q.uname) { jr.msg += "No Query criteria."; return res.json(jr); }
    lds.filter = "(|("+ldc.unattr+"="+q.uname+")(givenName="+q.uname+")(sn="+q.uname+")(displayName="+q.uname+"))";
    console.log(d1.toISOString()+" Search: ", lds);
    ldconn.search(lds.base, lds, function (err, ldres) {
      var d2 = new Date();
      if (err) { throw d2.toISOString()+" Error searching: " + err; }
      ldres.on('searchReference', function(referral) {
        console.log('referral: ' + referral.uris.join());
      });
      ldres.on('end', function (result) {
        console.log("Final result:"+ldres);
        //console.log(JSON.stringify(ents, null, 2));
        console.log(ents.length + " Results for " + lds.filter);
        return res.json({status: "ok", data: ents});
      });
      ldres.on('error', function(err) {
        console.error('error: ' + err.message);
        res.json({status: "err", msg: "Search error: "+err.message});
      });
      ldres.on('searchEntry', function(entry) {
        // console.log('entry: ' + JSON.stringify(entry.object, null, 2));
        ents.push(entry.object);
      });
      //console.log("Got res:"+res);
      //console.log(JSON.stringify(res));
    });
    function filter_gen(ldc, q) {
      var fcomps = [];
      fcomps.push(ldc.unattr+"="+q.uname);
      ["displayName","mobile","mail", "manager", "employeeID"].forEach((k) => { return k + "="+q.uname; });
      // fcomps.push(ldc.unattr+"="+q.uname);
      var fstr = fcomps.map((c) => { return "("+c+")"; }).join(''); // ')('
      return "(|"+fstr+")";
    }
}
/** Login to application by performing LDAP authentication and app level authorization.
 * Uses main config core.authusers (Array) to authorize users to use linetboot app.
 */
function login(req, res) {
  var jr = {status: "err", msg: "Auth Failed."};
  var q = req.query; // 
  // TODO: Prefer POST, support GET in transition phase (and with optional forced config?)
  if (req.method == 'POST') { q = req.body; }
  var ldc = global.ldap;
  var cc = global.core; // core config
  if (req.body.username) { q = req.body; } // Object.keys(req.body).length
  console.log("login: Authenticate user '"+q.username+"' (w. passwd of "+q.password.length+" B)." );
  
  if (!q.username) { jr.msg += "No username"; return res.json(jr); }
  if (!q.password) { jr.msg += "No password"; return res.json(jr); }
  if (!ldc)        { jr.msg += "No LD Config"; return res.json(jr); }
  if (ldc.simu) { req.session.user = {username: "nobody"}; return res.json({status: "ok", data: {username: "nobody"}});}
  // Authorization
  if (!cc || !cc.authusers) { jr.msg += "No 'core' Config for authorization"; return res.json(jr); }
  if (!Array.isArray(cc.authusers)) { jr.msg += "Authorized users (core.authusers) not in array"; return res.json(jr);  }
  if (!cc.authusers.includes(q.username)) {
    console.log("user '"+q.username +"' not in list", cc.authusers);
    jr.msg += "user "+q.username+" not Authorized !"; return res.json(jr);
  }
  // OLD: Gets now created here.
  // if (!ldconn)     { jr.msg += "No LD connection"; return res.json(jr); }
  var lds = {base: ldc.userbase, scope: ldc.scope, filter: "("+ldc.unattr+"="+q.username+")"};
  console.log("Query by: ", lds);
  var ents = [];
  // For every auth, grab a fresh connection
  var ldcopts = ldcopts_by_conf(ldc);
  var ldconn = ldap.createClient(ldcopts); // Bind conn.
  console.log("Start Login, local ldconn: "+ ldconn ); // + " ldconn"+ ldconn
  // Bind ldconn with main creds here (to not rely on main conn)
  ldconn_bind_cb(ldc, ldconn, function (err, ldconn) {if (err) { jr.msg += err; return res.json(jr); } console.log("Search "+q.username);return search(ldconn); });
  //search(ldconn); // old
  // 
  function search(ldconn) {
  
  ldconn.search(lds.base, lds, function (err, ldres) {
    if (err) { jr.msg +=  "Error searching user"+q.username+": " + err; return res.json(jr);  }
    
    ldres.on('searchReference', function(referral) {
      console.log('referral: ' + referral.uris.join());
    });
    // result, result.status
    ldres.on('end', function (result) {
      console.log("Final (user search) result:"+ldres);
      //console.log(JSON.stringify(ents, null, 2));
      console.log(ents.length + " Results for " + lds.filter);
      if (ents.length < 1) { jr.msg += "No users by "+q.username; return res.json(jr);}
      if (ents.length > 1) { jr.msg += "Multiple users by "+q.username + " (ambiguous)"; return res.json(jr);}
      if (!req.session) { jr.msg += "Session Object not available"; return res.json(jr); }
      var uent = ents[0];
      console.log("Found unique auth user entry successfully: "+q.username+" ("+uent.dn+") ... Try auth...");
      var ldc_user = {binddn: uent.dn, bindpass: q.password};
      // TODO:
      ldconn_bind_cb(ldc_user, ldconn, function (err, ldconn) {if (err) { jr.msg += "Auth user bind error"; return res.json(jr); } user_bind_ok(ldconn, uent); });
      /*
      ldconn.bind(uent.dn, q.password, function(err, bres) {
        if (err) { jr.msg += "Could not bind as "+q.username+" ... "+ err; console.log(jr.msg); return res.json(jr); }
        console.log("bind-extra-res:"+bres);
        //user_bind_ok(ldconn);
      });
      */
    });
    res.on('searchReference', function(referral) {
      console.log('referral: ' + referral.uris.join());
    });
    ldres.on('error', function(err) {
      console.error('error: ' + err.message);
      jr.msg += "Search error: "+err.message;
      ldconn.destroy();
      res.json(jr);
    });
    ldres.on('searchEntry', function(entry) {
      // console.log('entry: ' + JSON.stringify(entry.object, null, 2));
      ents.push(entry.object);
    });
    //console.log("Got res:"+res);
    //console.log(JSON.stringify(res));
  });
  
  } // search
  // Send final success response
  function user_bind_ok(ldconn, uent) {
    // TODO: Refine
        console.log("Bind-Success: user-dn: ", uent.dn);
        req.session.user = uent;
        uent.username = uent[ldc.unattr];
        console.log("Closing auth-bind-only connection");
        ldconn.destroy(); // Should call ldconn.unbind()
        return res.json({status: "ok", data: uent});
        // client.unbind(function(err) {})
  }
}
/*
events.js:167
      throw er; // Unhandled 'error' event
      ^

Error: read ECONNRESET
    at TCP.onStreamRead (internal/stream_base_commons.js:111:27)
Emitted 'error' event at:
    at Socket.onSocketError (/projects/linetuser/linetboot/node_modules/ldapjs/lib/client/client.js:964:12)
    at Socket.emit (events.js:182:13)
    at emitErrorNT (internal/streams/destroy.js:82:8)
    at emitErrorAndCloseNT (internal/streams/destroy.js:50:3)
    at process._tickCallback (internal/process/next_tick.js:63:19)

process.on('uncaughtException') // 17 mins ?
*/
/** /userent
 * */
function userent(req, res) {
  var jr = {status : "err", msg : "No Autheticated User Found."};
  if (!req.session || !req.session.user) { return res.json(jr); }
  res.json({status: "ok", data: req.session.user});
}

function logout(req, res) {
  var jr = {status : "err", msg : "Logout Failed."};
  if (!req.session || !req.session.user) { jr.msg += "User session not found (Did session expire ?)!"; return res.json(jr); }
  req.session.user = null;
  res.json({status: "ok", data: null});
}

/** Exchange keys with a newly installed host (as part of OS install, POST /keyxchange).
 * Allow new host/user send keys and send it keys in return.
 * Use rudimentary formats to be shell-scripting fit.
 * Testing with a CL call: ()
 * ```
 * # wget only sends as application/x-www-form-urlencoded
 * # wget --post-file=${HOME}/.ssh/id_rsa.pub http://192.168.1.10:3000/keyxchange
 * # Note: curl -d @... seems to strip "\n" out of the content Use --data-binary
 * curl -v -X POST -H 'content-type: application/octet-stream' http://192.168.1.10:3000/keyxchange --data-binary @${HOME}/.ssh/id_rsa.pub -o /tmp/key
 * ```
 * ## SSH Hints
 * ssh -o UserKnownHostsFile=/dev/null ...
 * ssh -o StrictHostKeyChecking=no
 * ## Notes on key formats (/etc/, host itself vs. ~/.ssh)
 * - /etc/ssh/ non - ".pub" - in PEM format
 * - /etc/*.pub - 3 fields: 1) keytype (e.g. "ssh-rsa") 2) key in base64 3) user@host (non-FQDN, e.g. root@my-host)
 * - ~/.ssh/known_hosts (-H for hashed format)
 *   - 3 fields (string tokens): 1) varies between hashed and non-hashed format, see below, 2) key type (e.g. "ssh-rsa"), 3) key
 *   - Hashed format (1st field): "|1|s1IhFJ2YZtFWKMcH4rTnHrLKDKo=|bx6d2h/4Pq+IBfpQ16obrrnn6wo=" + type + key
 *   - Hostname format (1st field): "my-host.comp.com" + type + key
 *   - IP Format: "192.168.1.22" + type + key
 *   - Hostname+IP format: "my-host.comp.com,192.168.1.22" + type + key
 *   - best DIY format: Hostname + IP
 *   - keyscan: Uses whatever you used on CL (or w. -H)
 * - authorized_keys can use directly the format of ~/.ssh/id_rsa.pub
 */
function keys_exchange(req, res) {
  var servpubkey = "/etc/ssh/ssh_host_rsa_key.pub";
  var authkeysfn = process.env["HOME"]+"/.ssh/authorized_keys";
  console.log("Req hdrs: ", req.headers);
  
  var key = req.body.toString();
  // TODO: DO not strip here. but add "\n" later if missing (reason: matching
  // in authorized_keys happens by sub-part anyways)
  if (key.substr(key.length-1, 1) == "\n") {
    console.log("Strip linefeed");
    key = key.substr(0, key.length-1);
  }
  console.log("Got OS client user key:'" +key+"'");
  var haskey = authkeys_check_key(authkeysfn, key);
  console.log("authorized_keys Has key: ", haskey);
  if ( ! haskey) {
    if (key.substr(key.length-1, 1) != "\n") { console.log("Added \\n back"); key += "\n"; }
    //authkeys_add(authkeysfn, key);
  }
  /////// Response ////////////////
  // Send w/o \n for easy grep ?
  var outkey = netprobe.pubkey();
  console.log("Resp-Key:"+ outkey);
  res.end(outkey);
  // TODO: Consider working on fd-level so that fd is also a exclusivity flag
  // Ops would be fd = fs.openSync('message.txt', 'a'); fs.appendFileSync(fd, ...) fs.closeSync(fd);
  // Check key presence in file
  // Return true value (array of matching lines) if key is present, no action needed (or no action possible) and
  // false value (0) to signal key needs to be added. Return -1 for file not found.
  function authkeys_check_key(fn, key) {
    if (!fs.existsSync(fn)) { return -1; }
    var kt = key.split(" ", 2); // Key and trailing part
    key = kt[0] + " " + kt[1]; // "ssh-rsa" + " " + keypart
    console.log("Re-composed key: " + key);
    var klen = key.length; // kt[0].length;
    var i = 0;
    var iarr = [];
    var cont = fs.readFileSync(fn, 'utf8');
    var m = cont.split("\n").filter((line) => {
      // OLD: line == key .. kt[0]
      if (line.substr(0, klen) == key) { iarr.push(i); i++; return 1;}
      i++; return 0;
    });
    console.log("Checked "+i+" keys in "+fn);
    if (m.length) { return iarr; }
    return 0;
  }
  // Add key to authorized keys. Locking needed ?
  function authkeys_add(fn, key) {
    if (!fs.existsSync(fn)) { return -1; }
    try {
      // fd = fs.openSync('message.txt', 'a');
      var opts = {mode: 0o600}; // encoding: 'utf8'
      fs.appendFileSync(fn, key, opts); //  Default mode: 0o666
    }
    catch (ex) { console.log("Failed to append key to "+fn+""); return 1; }
    return 0;
  }
}
// /eflowrscs
function eflowrscs(req, res) {
  var jr = {status : "err", msg : "Error Createing Eflow Resources list."};
  var efc = global.eflow;
  if (!efc) { jr.msg += "No EFlow Config"; return res.json(jr); }
  //var erscs = [];
  var axpara = { auth: {username: efc.user, password: efc.pass } };
  //hostarr.forEach(rsc_get);
  async.map(hostarr, rsc_get, function (err, ress) {
    if (err) { res.msg += err; return res.json(jr); }
    ress = ress.filter( (r) => { return r; } );
    res.json({ status: "ok", data: ress });
  });
  //res.json({ status: "ok", data: erscs });
  function rsc_get(f, cb) {
    var hps = hlr.hostparams(f);
    if (!hps || !hps.ecrsc) { return cb(null, null); }
    var rn = hps.ecrsc;
    var ent = { hname: f.ansible_fqdn, rscname: rn };
    //erscs.push(ent);
    var efurl = efc.url + "/resources/"+rn;
    console.log("EFURL: curl -u $EFCREDS "+efurl+"");
    //return;
    
    /////////// ASYNC /////////////////////
    axios.get(efurl, axpara).then((resp) => {
      var d = resp.data;
      //NOT: if (!d) { jr.msg += "No data from EFlow for resource " + rn; return res.json(jr); }
      if (!d) { console.log("No data from EFlow for Rsc: "+ rn); return cb(null, null); }
      console.log(d);
      // stepLimit resourceName resourceId hostType resourceDisabled
      if (!d.resource) { return cb(null, null); } // throw "Missing resource branch !";
      var r = d.resource;
      // TODO: r.hname = f.ansible_fqdn;
      ent.ena = parseInt(r.resourceDisabled) ? 0 : 1;
      ent.rscid = r.resourceId;
      ent.pools = r.pools; // pools is deprecated, but works. Should use resourcePools
      ent.steplimit = r.stepLimit;
      ent.desc = r.description;
      return  cb(null, ent);
    }).catch((ex) => { console.log("EFlow Rsc EX: "+ex); cb(null, null); }); // jr.msg += "EFlow EX: "+ex; console.log(jr.msg); return res.json(jr);
  }
}
/** Enable / Disable resource (by "rscname=...").
 * Initially: Change the enablement state to requested one.
 * TODO: Allow pool changes.
 * https://storage.googleapis.com/cloudbees-docsite-downloads-production/docs/electric-cloud/eflow_doc/9_0/API/PDF/FlowAPI_Guide_9_0.pdf?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=docsite-server-app%40ops-production-294812.iam.gserviceaccount.com%2F20210317%2Fauto%2Fstorage%2Fgoog4_request&X-Goog-Date=20210317T035943Z&X-Goog-Expires=3601&X-Goog-SignedHeaders=host&X-Goog-Signature=bbf47485dd637f453dda7b12346717fd51e3e63558663af2f53ab5a34f75fe627df0be5b516b40ec6b7fe30a713fc587b0caa32138b0b78d229e23abc3cbfd727628d8981f78cb21dd2bda9087051dc8d82e4c82e108214656f68da24caa16ced99144d6b88e43357f5c2bf080dad9cd0b8be25edf5d6b87b8485e47c14e5db6cb9688c20db8861d395f7c09e9db6e55ea690d956c9252c1df8b92c6f3e20cf82ef80bdc78d07c991b7f0d8002e87d443d78a5176a60c9168ac317e2a19e4f9227a2548fde5002b436abb97d5695642ec13e3c570d98b4bd61865624f79603272e4ef1c83bbee89e0f2337be99d42f5631b0da0f96b1692bbed57bbb932bcc44
 */
function eflowrsctoggle(req, res) {
  var jr = {status : "err", msg : "Error Toggling EFlow resource on/off."};
  var efc = global.eflow;
  if (!efc) { jr.msg += "No EFlow Config"; return res.json(jr); }
  var q = req.query;
  if (!q.rscname) { jr.msg += "No EFlow Resource name given"; return res.json(jr); }
  if (!q.ena) { jr.msg += "No EFlow Enablement info passed"; return res.json(jr); }
  var p = {resourceDisabled: !parseInt(q.ena) }; // PUT. TODO: resourcePools: "a,b,c"
  var axpara = { auth: {username: efc.user, password: efc.pass } };
  var efurl = efc.url + "/resources/"+q.rscname; // "?resourceDisabled="
  // Being enabled. Lookup hname by rscname ?
  //var para = {hname: };
  if (efc.resetdesc && ! p.resourceDisabled) {
    
    // p.description = Mustache.render(efc.resetdesc, para); // p. 1200 / 1260 API guide
  }
  console.log("PUT:", p);
  // Seems these *can* be sent PUT with params in URL ?
  axios.put(efurl, p, axpara).then((resp) => {
    var d = resp.data;
    console.log("Resp.status: "+resp.status);
    if (!d) { jr.msg += "No Eflow Rsc update response"; return res.json(jr); }
    let r = d.resource;
    if (!r) { throw "No resource branch in response data !"; }
    console.log("Rsc disabled: "+r.resourceDisabled);
    // Check resourceDisabled, pools
    let ena = !parseInt(r.resourceDisabled) ? 1 : 0;
    var okmsg = { status: "ok", data: {ena: ena} };
    res.json(okmsg); console.log(okmsg);
  }).catch((ex) => { jr.msg += "EFlow EX: "+ex; console.log(jr.msg); return res.json(jr); });
}
/** get Pool
 * var url = efc.url + "/resourcePools/"+q.poolname;
 * - On top (intermed): resourcePool
 */
// function () {}

/** List Guests for a VM Host Server (GET /esxi/:host).
 * 
 */
function listguests(req, res) {
  var jr = {"status":"err", "msg":"Error getting info for esxi guests. "};
  var esxi = require("./esxi.js");
  var ecfg = global.esxi || null;
  if (!ecfg) { return res.json(jr); }
  esxi.init(global);
  var host = req.params.host; // Grab wanted host, but validate below
  console.log("Got VM host name: '"+host+"'");
  console.log("Known VM Host names: ", ecfg.vmhosts);
  if (!ecfg.vmhosts.includes(host)) { jr.msg += host + " is not one of registered hosts"; return res.json(jr);  }
  ////////// 
  var cont;
  var hresinfo = {hname: host, cont: null};
  if ((ecfg.usecache == undefined) || ecfg.usecache) {
    var fname = ecfg.cachepath+"/"+host+".xml";
    console.log("Try esxi (cached) file: "+fname);
    if (!fs.existsSync(fname)) { jr.msg += "No file for "+host; return res.json(jr);  }
    cont = fs.readFileSync(fname, 'utf8');
    // hresinfo.cont = cont;
  }
  // Note: Async !
  else {
    //jr.msg += "Direct fetch not implemented"; return res.json(jr);
    console.log("Try esxi direct-fetch from: "+host);
    esxi.hostworker(host, function (err, data) {
      if (err) { jr.msg += "hostworker error:"+err; return res.json(jr); }
      console.log("hostworker Got: ", data);
      esxi.getGuests(data.cont, {debug: 1}, webresp);
    });
    console.log("listguests - returning");
    return;
    
  }
  // XML ? JSON ? TODO: pass {hname: host, cont: cont}
  esxi.getGuests(cont, {debug: 0}, webresp );
  // Deliver web response JSON received from ESXi XML parsing.
  function webresp (err, harr) {
    if (err) { jr.msg += host + " problems extracting guests info"; return res.json(jr); }
    // Sort and number
    if (ecfg.sortbyhname) {
    harr.sort((a,b) => {
      if (!a.hostName ) { return 0; }
      // if (!a.hostName || !a.hostName) { return 0; }
      return a.hostName.localeCompare(b.hostName);
    });
    } // sortby ...
    var i = 1;
    harr.forEach((h) => { h.num = i; i++; });
    res.json(harr); // {status: "ok", data: harr}
  }
}
/** Fetch and store guest info for all configured (mcfg.esxi.vmhosts) VM hosts.
 */
function cacheguestinfo(req, res) {
  var jr = {"status":"err", "msg":"Error getting info for esxi guests. "};
  var esxi = require("./esxi.js");
  var ecfg = global.esxi || null;
  if (!ecfg) { return res.json(jr); }
  var hostnames = Array.isArray(ecfg.vmhosts) ? ecfg.vmhosts : null;
  if (!hostnames) { jr.msg += "No vmhosts in config"; return res.json(jr); }
  esxi.init(global); // TODO: Enable for saving
  // function hostworker () {} // TODO: Use: esxi.hostworker
  async.eachSeries(hostnames, esxi.hostworker, function (err) {
    if (err) { jr.msg += "cacheall error: "+err; return res.json(jr); }
    //console.log("cacheall series completion success (ls -al /tmp/*.xml) ");
    res.json({status: "ok", msg: "Saved Guestinfo for "+hostnames.length+" hosts."});
  });
}
/** List Docker compose config.
 * Official supported d.c. config file names: docker-compose.yml, docker-compose.yaml, compose.yml, compose.yaml.
 * This handler honors explicit (full path) file list given in mcfg.docker.compfiles.
 */
function listdc(req, res) {
  var jr = {"status": "err", "msg": "Docker Compose listing failure. "};
  // var fn = "./reportportal-docker-compose.yml";
  // var cfnames = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];
  var paths = (global.docker && global.docker.comppath) ? global.docker.comppath : [];
  var files = (global.docker && global.docker.compfiles) ? global.docker.compfiles : [];
  var fbn = req.query.fn;
  var fpath;
  //if (!fbn) { jr.msg += "No valid docker-compose file !"; return res.json(jr); }
  if (!fbn) { fpath = files[0]; console.log("No basename, default to: "+fpath); } // Set first
  // Filter from files array
  else {
    var re = new RegExp("/"+fbn+"$");
    fpath = files.find((full) => { return full.match(re); });
    console.log("Absfile Matched by basename: "+fpath);
  }
  // TODO: look from ...
  /*
  if (!paths || !paths.length || !paths[0]) { jr.msg += "No valid docker-compose paths"; return res.json(jr); }
  // TODO: Use higher level file resolve
  fpath = paths.map((path) => {
    var abs = path+"/"+fbn;
    if (fs.existsSync(abs)) { return abs; }
    return 0;
  }).filter((abs) => { return abs; })[0];
  */
  // fpath = global.docker.compfiles[0];
  if (!fpath) { jr.msg += "No file/filename resolved"; return res.json(jr); }
  if (!fs.existsSync(fpath)) { jr.msg += "Requested file does not exist"; return res.json(jr); }
  console.log("Send structure of: "+fpath);
  var servs = load_dc_services(fpath);
  if (typeof servs == 'string') { jr.msg += servs; return res.json(jr); }
  res.json({status:"ok", data: servs});
  /////////////////// 
  /** Load docker-compose services re-organized into an array. */
function load_dc_services(fpath) {
  var y;
  var ssidx; // Services index
  if (!fs.existsSync(fpath)) { return "No file: "+fpath; }
  var cont = fs.readFileSync(fpath, 'utf8');
  if (!cont) { return "No Content for: "+fpath; }
  // res.json(jr);
  try { y = yaml.safeLoad(cont); } catch (ex) { return "Parse error:"+ex; } // console.log("Failed autoinstall yaml load: "+ex);
  if (typeof y != 'object') { return "Top level of docker-compose is not an object"; }
  // Detect single-service docker compose file
  var topkeys = Object.keys(y);
  if (topkeys.length == 1 && !topkeys.includes(["services"])) { ssidx = y; } // Single
  else { ssidx = y.services; } // Multi-service file
  var servs = [];
  if (typeof ssidx != 'object') { return "services not available as object"; }
  
  Object.keys(ssidx).forEach((k) => {
    var sn = ssidx[k];
    sn.servid = k;
    servs.push(sn);
  });
  return servs;
} // load_dc_services
  
}
/** Report portal member addition as web service.
 * Add all logged in users to all groups for the ease of access for trusted people (in a
 * simple environment where earlier situation holds true.
 * Respond with data containing the array of projects where some member additons
 * were done or empty array if no member additions were needed (all users already
 * in all groups).
 * Example of usage (e.g. via shell/shell script, errstatus enables setting HTTP
 * response code to error status for http client to return shell error code):
 * ```
 * curl http://$LINETURL/rpaddmems?errstatus=1
 * ```
 */
function rp_add_mems(req, res) {
  var jr = { status: "err", "msg": "Could not perform member additions. " };
  var rp = require("./reportportal.js");
  //rp.init();
  var q = req.query;
  //console.log("Got query: ", q);
  rp.createusers((err, data) => {
    if (err) { jr.msg += err; return res.json(jr); }
    var projs     = data.projs;
    var usernames = data.usernames;
    var opts = { dataonly: true };
    var padd = rp.curl_cmds_gen(projs, usernames, opts);
    rp.memadd_http(padd, (err, ress) => {
      if (err) { jr.msg += err; if (q.errstatus) { res.status(400); } return res.json(jr); }
      
      res.json({status: "ok", data: ress, data2: padd});
    });
  });
}
/** Wrapper for static file bootables.json.
 * Wrapped because of:
 * - Possibly to share a copy between requests (require() - caching)
 * - Need to dynamically fill-in "have-it" status
 * - Wrap data with standard response.
 */
function bootables_list(req, res) {
  var jr = {status: "err", msg: "Failed to get bootables data. "};
  var bs = require("./bootables.json");
  var isopath = global.isopath; // TODO: global.xxx.isopath; - Multiple paths, user resolve ... ?
  var mntpath = "/isomnt/";
  if (!isopath) { jr.msg += "No Bootables ISO path configured."; return res.json(jr); }
  if (!bs) { jr.msg += "Bootables file not loaded."; return res.json(jr); }
  var arr = bs.items;
  if (!arr) { jr.msg += "Bootable items not in array."; return res.json(jr); }
  var path = require("path");
  arr.forEach((img) => {
    var fn = path.basename(img.url);
    if (img.img_bn) { fn = img.img_bn; }
    var fna = isopath+"/"+fn;
    //console.log("Testing: "+fna);
    img.present = fs.existsSync(fna) ? 1 : 0;
    // Mounted ?
    var kfna = mntpath + "/" + img.lbl + "/" + img.kernel;
    img.mounted = fs.existsSync(kfna) ? 1 : 0;
  });
  res.json({status: "ok", data: bs});
}
/** Check bootables availability with a HTTP HEAD request (collectively).
 * TODO: Templating for URL ?
 */
function bootables_status(req, res) {
  var jr = {status: "err", msg: "Failed to get status for bootables. "};
  var bs = require("./bootables.json"); // dclone() ?
  var arr = bs.items; // Image items
  var t1 = Date.now();
  async.map(arr, imagerepostatus, (err, ress) => {
    if (err) { jr.msg += "Completion error: "+err; return res.json(jr); }
    var t2 = Date.now();
    return res.json({status: "ok", data: ress, time: (t2-t1)/1000});
  });
  /** Test availability for single Image on an URL.
   * TODO: Have websocket inform frontend (by runtime config ?)
   */
  function imagerepostatus(img, cb) {
    console.log("Look status of: "+img.name);
    var img2 = {lbl: img.lbl, status: "", code: 0};
    axios.head(img.url).then((resp) => {
      console.log("====== RESP ("+img.url+", "+resp.status+") ==========\n"); // DEBUG
      //console.log(resp);
      
      img2.status = resp.statusText + " ("+resp.status+")"; // = "OK"
      img2.code = resp.status;
      var hdrs = resp.headers;
      if (hdrs && hdrs["content-length"]) { img2.size = parseInt(hdrs["content-length"]); img2.status += " "+img2.size + " B.";}
      return cb(null, img2);
    }).catch((ex) => {
      img2.status = "FAIL ("+ex.response.status+")";
      img2.code = ex.response.status;
      return cb(null, img2);
    }); // Accept
  }
}
