/** Installer for LinetBoot.
* Starts with hosts file prefilled.
* Assumes Homedir to be correctly set in env var $HOST
* 
* TODO: Utilize prompting module (prompt)
*/
var hlr      = require("./hostloader.js");
var ans      = require("./ansiblerun.js");
var netprobe = require("./netprobe.js");
var tboot    = require("./tftpboot");
// CORE
var fs       = require("fs");
var path     = require("path");
var cproc   = require('child_process');
// NPM
var async    = require("async");
var Getopt   = require("node-getopt"); // NPM
var Mustache = require("mustache");
var home = process.env["HOME"];
// 
var cfg = {
  fact_path: home + "/hostinfo", // global
  hostsfile: home + "/.linetboot/hosts",
  mainconf: home + "/.linetboot/global.conf.json",
  debug: 0,
  hostcache: {}, hostarr: [], // hostloader needed.
  tftp: {
    "menutmpl": "./tmpl/default.installer.menu.mustache",
  }
};
var acts = [
  {
    "id": "configedit",
    "title": "Edit Most important parts of config",
    "cb": null,
    "opts": [],
  },
  {
    "id": "hostsetup",
    "title": "Check host reachability and gather facts",
    "cb": hostsetup,
    "opts": [],
  },
  {
    "id": "tftpsetup",
    "title": "Setup TFTP Directory hierarchy (w/o executables)",
    "cb": tftpsetup,
    "needfacts": 1,
    "opts": [],
  },
  {
    "id": "ipmiinfo",
    "title": "IPMI Information Extraction",
    "cb": ipmiinfo,
    "opts": [],
  },
  {
    "id": "bootmenu",
    "title": "Generate Bootmenu based on Lineboot main Config into TFTP dirs (Use --dryrun to preview)",
    "cb": null,
    "opts": [],
  },
  {
    "id": "",
    "title": "",
    "cb": null,
    "opts": [],
  },
  {
    "id": "",
    "title": "",
    "cb": null,
    "opts": [],
  },
];
var clopts = [
  ["h", "host=ARG+", "Hostname or multiple full hostnames (given w. multiple -h args)"],
  ["l", "bootlbl=ARG", "Boot label for OS to boot or install"],
  ["p", "pxe", "Boot pxe (Ths is an option flag w/o value)"],
  ["", "pass=ARG", "Ansible Sudo password"],
  ["u", "user=ARG", "Ansible Sudo password"],
  ["", "dryrun", "Dryrun, Preview (for ops that produce content)"],
];
var em = { // Error Messages
  "crhosts":"Create Hosts file (one hostname per line) first in and run installer again."
};
// Required by any action
if (!fs.existsSync(cfg.hostsfile)) { console.error("No Hosts file found in:"+cfg.hostsfile+". "+em.crhosts); process.exit(1); }

var argv2 = process.argv.slice(2);
var op = argv2.shift();
if (!op) { usage("No subcommand"); }
var opnode = acts.filter(function (on) { return op == on.id; })[0];
if (!opnode) { usage("No op: "+op+". Need subcommand !"); }
if (!opnode.cb) { usage("Opnode missing CB !"); }
getopt = new Getopt(clopts);
var opt = getopt.parse(argv2);
// console.log("Opt key-vals: "+JSON.stringify(opt.options, null, 2));

opt.options.op = op;

// Is this UNIVERSAL ?
hlr.init(cfg, cfg); // {fact_path: home + "/hostinfo"}
var hostnames;
hostnames = hlr.hosts_load(cfg);
if (!hostnames) { console.log("No hosts in inventory !"); process.exit(1);}
console.log("Installer Hosts:", hostnames);
if (opnode.needfacts) { hlr.facts_load_all(); } // {hostsfile: home + "/.linetboot/hosts"}

var rc = opnode.cb(opt.options);
// No exit for async
function usage(msg) {
  if (msg) { console.error(msg);  }
  var bn = path.basename(process.argv[1]);
  //console.log("Usage "+bn + " op (Available ops: ...)");
  console.error("Use one of subcommands:\n"+ acts.map(function (on) {return " - "+on.id+ " - " + on.title;}).join("\n"));
  process.exit(1);
}

function hostsetup (opts) {
  
  var mcfg = require(process.env["LINETBOOT_GLOBAL_CONF"] || cfg.mainconf); // Abs Path
  var pass = opts.pass || process.env["ANSIBLE_PASS"];
  if (!pass) { console.log("Need password for Ansible sudo user (--pass or env. ANSIBLE_PASS)"); process.exit(1); }
  opts.pass = pass;
  // Access loaded things
  console.log("Host names:" + JSON.stringify(cfg.hostnames, null, 2));
  console.log("Num Host items:" + hostnames.length);
  //console.log("Host params:\n"+ JSON.stringify(cfg.hostparams, null, 2));
  // Ping hosts ? extract facts ?
  netprobe.probe_all(cfg.hostarr, "net", function (err, results) {
      if (err) { console.log(err); process.exit(); } // usage("Failed net probing: "+ err);
      console.log(results);
      // Detect ansible ?
      
      console.log("Probe of all hosts ran ok. Run subcommand facts ...");
      // gather_facts(mcfg);
      gather_facts_setup(mcfg);
    });
  // Require all to ping and be accessible by SSH. Request to comment all the non working hosts out.
  // For help generate ssh-copy-id commands
  return; // process.exit(0);
  
  //function factgather() {
  //  // Detect ansible
  //  
  //  // Load facts ?
  //  hlr.facts_load_all();
  //}
  // Use traditional "ansible ... -m setup" way of gathering facts
  // // TODO: Consider using --extra-vars serialization from ans module
  function gather_facts_setup(mcfg) {
    // 
    mcfg.fact_path = "/tmp/facts2"; // DEBUG !!! TEMP Location ?
    var xpara = "ansible_sudo_pass=" + opts.pass;
    xpara += " ansible_user=" + (opts.user || process.env["USER"]);
    var cmd = "ansible all -i "+mcfg.hostsfile+"  -b -m setup --tree "+mcfg.fact_path+" --extra-vars \""+xpara+"\"";
    cproc.exec(cmd, function (err, stdout, stderr) {
      if (err) {
        console.error("Failed partially / completely to gather facts: " + err);
        //console.log("STDOUT:" + stdout);
        //console.log("STDERR:" + stderr);
        //console.log("Tried to gather facts into path: " + mcfg.fact_path);
        //process.exit(1);
      } // cb(err, null);
      // console.log(stdout);
      console.log("Gathered (or tried to gather) facts into path: " + mcfg.fact_path);
      // Clean up bad facts
      badfact_cleanup(mcfg);
      process.exit(0);
      //return cb(null, stat);
    });
  }
  /* Playbook way ... Gathering facts by playbook does not seem to be possible.
   * Facts do not appear in dir factpath (template var in playbook)
   */
  function gather_facts(mcfg) {
    var arunner;
    var acfg = mcfg.ansible;
    if (!acfg) { console.log("No Ansible config in main config !"); process.exit(1); }
    // Gather facts, all hosts
    var p = { playbooks: ["./playbooks/factgather.yaml"], hostnames: hostnames, };
    var xpara = {ansible_user: process.env["USER"], ansible_sudo_pass: opts.pass, factpath: "/tmp/facts"};
    //p.xpara = xpara;
    try {
      arunner = new ans.Runner(p, acfg);
      var err = arunner.playbooks_resolve(acfg); // needed ?
      // arunner.hostgrps_resolve(global.groups); // needed ?
      arunner.ansible_run(xpara);
    }
    catch (ex) { console.log("Error in Ansible gather_facts: "+ex.toString()); }
  } // gather_facts
  
  
  //process.exit(0);
  // Detect / check ansible (async bootstrapper func()
  ans.ansible_detect(function (err, anspath) {
    if (err) { console.log("No Ansible found on system, exiting ..."); process.exit(1); }
    console.log("Found Ansible: '"+ anspath + "'");
    var fn = ans.hostsfile(cfg.hostnames);
    console.log("Wrote hosts file to (tmp filename): '" + fn + "'");
    var acfg = {};
    acfg.pbpath = process.env['PLAYBOOK_PATH'] || "./playbooks";
    //acfg.sudopass = 
    // execstyle
    var arun = new ans.Runner(p, acfg);
    ans.playbooks_resolve(acfg, arun);
    arun.ansible_run();
  });
  
  // Cleanup bad facts
  function badfact_cleanup(mcfg) {
    var path = mcfg.fact_path;
    //console.log(mcfg.hostarr);
    hostnames.forEach(function (hn) {
      var fullpath = path+"/"+hn;
      if (!fs.existsSync(fullpath)) { console.log("missing facts: " + fullpath); return; }
      var data = fs.readFileSync(fullpath, 'utf8');
      var len = data.length;
      var j = JSON.parse(data);
      // j.changed && j.msg
      if (!j.ansible_facts && (len < 500)) {
        console.log("Remove bad facts: " + fullpath + " ("+len+" B)");
        try { fs.unlinkSync(fullpath); } catch(ex) { throw "Could not remove bad host facts " + ex.toString(); }
      }
    });
  }
       
       
}
// Load package listings (APT/YUM ... into hostpkginfo dir)
// TODO: Use command generator and async

// Load remote management info (assume ipmitool on remote hosts - Ansible)
function rmgmt_collect() {}


/** Setup TFTP server directories.
* Depends on global config and facts
* - Use Config cfg.tftp.root to determine TFTP root
* - Ensure "pxelinux.cfg" exists. Create if not.
* Create mac symlink files.
*/
function tftpsetup(opts) {
  // TODO: Lookup 
  var mcfg = require(process.env["LINETBOOT_GLOBAL_CONF"] || cfg.mainconf); // Abs Path 
  var tcfg = mcfg.tftp;
  if (!tcfg) { console.error("No TFTP Config"); process.exit(1); }
  //console.log(tcfg);
  console.error("TFTP Root configured as:"+tcfg.root);
  if (!fs.existsSync(tcfg.root)) { usage("TFPT Root does not exist"); }
  var pxelindir = tcfg.root+"/pxelinux.cfg/";
  if (!fs.existsSync(pxelindir)) {
    console.log("pxelinux.cfg dir does not exist, creating ...");
    try { fs.mkdirSync(pxelindir); } catch (ex) {
      console.log("Could not make pxelinux.cfg: " + ex); process.exit();
    }
  }
  if (!fs.existsSync(tcfg.root)) { usage("TFTP Root does not exist even after trying to create it"); }
  //////////////////////// Create default menu (named "default")
  // TODO: Dry-run
  if (opts.dryrun) { tcfg.dryrun = 1; }
  var cont = tboot.bootmenu_save(tcfg, mcfg, "vesamenu.c32", null);
  if (opts.dryrun) { console.log("# Dryrun mode - preview boot menu content\n"+cont); process.exit(1); }
  /////////////////// Individual host links ////////////////
  // Check writeability for the runner of the script
  try {
    //await fs.access(pxelindir, fs.constants.W_OK);
    fs.accessSync(pxelindir, fs.constants.W_OK);
  } catch (ex) { usage("PXE linux config dir not writeable: " + ex.toString()); }
  //console.log(cfg.hostarr);
  cfg.hostarr.forEach(function (facts) {
    var ifinfo = facts.ansible_default_ipv4;
    var maca   = ifinfo.macaddress;
    var macfn = tboot.menu_macfilename(facts);
    //return;
    var linkfile = pxelindir + macfn;
    if (fs.existsSync(linkfile)) { console.log("Link already exists ("+linkfile+")"); return; }
    console.log("Create symlink: " + macfn);
    // NOTE: Should create a very relative link (within same dir) for things to work (mounted) over NFS and TFTP-locally
    try {
      // Yes, keep this out: pxelindir+
      fs.symlinkSync("default", linkfile); // 3rd: type
    } catch (ex) { console.log(ex.toString()); }
  });
  console.log("Setup pxelinux TFTP Dir: " + pxelindir);
  //global.
}
/*
// Load template
  if (0) {
  console.log("Use template " + tcfg.menutmpl);
  var tmpl = fs.readFileSync(tcfg.menutmpl, 'utf8');
  if (!tmpl) { usage("No template content loaded from "+ tcfg.menutmpl); }
  var menucont = Mustache.render(tmpl, mcfg);
  if (!menucont) { usage("No menu content created"); }
  // Save menu
  try {
    fs.writeFileSync( pxelindir + "/default", menucont, {encoding: "utf8"} );
  } catch (ex) { usage("Could not write menu: "+ex); }
  console.log("created pxelinux.cfg in TFTP root and menu 'default' in: " + pxelindir);
  if (!cfg.hostarr.length) { usage("No hosts found in inventory !"); }
  } // if
*/
/** Have a chicken-n-egg problem:
 * Would be nice to execyte on single host centrally using newtwork interface (e.g. lanplus),
 * but contact need to be made to BMC (not host), which is (initially) unknown.
 * It will be hard to sudo on host.
 */
function ipmiinfo(opts) {
  
}
