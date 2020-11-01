#!/usr/bin/env node
/** @file
* # Installer for LinetBoot.
* 
* Starts with hosts file prefilled.
* Assumes Homedir to be correctly set in env var $HOME (for many operations)
* 
* ## Rough outline of installation steps
* 
* ```
* # Gather facts
* node hostsetup.js hostsetup
* # Setup TFTP data files (bootmenu ...)
* node hostsetup.js tftpsetup
* # Copy Bootloaders (and related) binaries into TFTP dirs
* # For now assumes 
* node hostsetup.js bootbins
* ```
* 
* TODO: Utilize prompting module (prompt)
*/
var hlr      = require("./hostloader.js");
var ans      = require("./ansiblerun.js");
var netprobe = require("./netprobe.js");
var tboot    = require("./tftpboot");
var osinst   = require("./osinstall");
var mc       = require("./mainconf");
// CORE
var fs       = require("fs");
var path     = require("path");
var cproc    = require('child_process');
// NPM
var async    = require("async");
var Getopt   = require("node-getopt"); // NPM
var Mustache = require("mustache");
var home     = process.env["HOME"];
// 
var cfg = {
  //fact_path: home + "/hostinfo", // global
  //hostsfile: home + "/.linetboot/hosts",
  //mainconf: home + "/.linetboot/global.conf.json",
  debug: 0,
  hostcache: {}, hostarr: [], // hostloader needed structures.
  //tftp: { "menutmpl": "./tmpl/default.installer.menu.mustache",} // NOT Needed
};
var mainconf_fn_default = home + "/.linetboot/global.conf.json";
var acts = [
  //{
  //  "id": "configedit",
  //  "title": "Edit Most important parts of config (Do not use, Work in progress)",
  //  "cb": null,
  //  "opts": [],
  //},
  {
    "id": "hostsetup",
    "title": "Check host reachability and gather facts. This is a primary prerequisite for all other operations (Use --dest to sort facts in location other than given in main config 'fact_path').",
    "cb": hostsetup,
    "opts": [],
  },
  {
    "id": "tftpsetup",
    "title": "Create Bootmenu (based on Linetboot main Config) and MAc-file symlinks into TFTP Directories (w/o executables)",
    "cb": tftpsetup,
    "needfacts": 1,
    "opts": [],
  },
  //{
  //  "id": "ipmiinfo",
  //  "title": "IPMI Information Extraction",
  //  "cb": ipmiinfo,
  //  "opts": [],
  //},
  //{
  //  "id": "bootmenu",
  //  "title": "Generate Bootmenu based on Lineboot main Config into TFTP dirs (Use --dryrun to preview)",
  //  "cb": null,
  //  "opts": [],
  //},
  {
    "id": "bootbins",
    "title": "Install (available) Boot Loader binaries for TFTP stage (Ubuntu)",
    "cb": bootbins,
    "opts": [],
  },
  {
    "id": "dhcpconf",
    "title": "Generate ISC DHCP Server config",
    "cb": dhcpconf,
    "needfacts": 1,
    "opts": [],
  },
  {
    "id": "newhostgen",
    "title": "Generate fake / stub information for new hosts without any earlier facts or ipmi info (Pass --newhosts)",
    "cb": newhostgen,
    "opts": [],
  },
  {
    "id": "loopmounts",
    "title": "Discover all current loop mounts and output in /etc/fstab format (default, to mount at boot, or as commands by --cmds)",
    "cb": loopmounts,
    "opts": [],
  },
  /*
  {
    "id": "",
    "title": "",
    "cb": null,
    "opts": [],
  },
  */
];
var clopts = [
  ["h", "host=ARG+", "Hostname or multiple full hostnames (given w. multiple -h args)"],
  ["l", "bootlbl=ARG", "Boot label for OS to boot or install"],
  ["p", "pxe", "Boot pxe (Ths is an option flag w/o value)"],
  ["", "pass=ARG", "Ansible Sudo password"],
  ["u", "user=ARG", "Ansible user (to override the env. $USER)"],
  ["", "dryrun", "Dryrun, Preview (for ops that produce content)"],
  ["s", "save", "Save file (for ops that produce content)"],
  ["", "dest=ARG", "Destination for files for particular op. (facts gather, bootbins, ...)"],
  // ["c", "clean", "Cleanup files Installed by operation (e.g. Boot Binaries)"],
  ["", "newhosts=ARG", "Newhosts CSV file"],
  ["", "cmds", "Output loop mount commands"],
];
//var em = { // Error Messages
//  "crhosts":"Create Hosts file (one hostname per line) first in and run installer again."
//};
// Required by any action
var mainconf_fn = process.env["LINETBOOT_GLOBAL_CONF"] || mainconf_fn_default;
var mcfg = mc.mainconf_load(mainconf_fn);
if (!mcfg) { apperror("No main Config loaded ! (from: "+mainconf_fn+")"); }
mc.env_merge(mcfg);
mc.mainconf_process(mcfg);
if (!fs.existsSync(mcfg.hostsfile)) { console.error("No Hosts file found in:"+mcfg.hostsfile+". "+"Create Hosts file (one hostname per line) first in and run installer again."); process.exit(1); }

var argv2 = process.argv.slice(2);
var op = argv2.shift();
if (!op) { usage("No subcommand"); }
var opnode = acts.filter(function (on) { return op == on.id; })[0];
if (!opnode) { usage("No such op/subcommand available: "+op+". Need valid subcommand !"); }
if (!opnode.cb) { usage("Opnode missing CB !"); }
getopt = new Getopt(clopts);
var opt = getopt.parse(argv2);
// console.log("Opt key-vals: "+JSON.stringify(opt.options, null, 2));

opt.options.op = op;

// Is this UNIVERSAL ? {fact_path: home + "/hostinfo"}
hlr.init(mcfg, cfg); // global, gcolls
var hostnames;
hostnames = hlr.hosts_load(mcfg); // Needs global / mcfg
if (!hostnames) { console.log("No hosts in inventory !"); process.exit(1);}
console.log("Installer Hosts:", hostnames);
var hostarr;
if (opnode.needfacts) { hostarr = hlr.facts_load_all(); } // Returns hostarr

var rc = opnode.cb(opt.options);
///////////////////////////////////////////////////////////////
// No exit for async
function usage(msg) {
  if (msg) { console.error(msg);  }
  var bn = path.basename(process.argv[1]);
  //console.log("Usage "+bn + " op (Available ops: ...)");
  console.error("Use one of subcommands:\n"+ acts.map(function (on) {return " - "+on.id+ " - " + on.title;}).join("\n"));
  process.exit(1);
}
function apperror(msg) {
  console.error(msg);
  process.exit(1);
}
/** Gather and store Facts.
 */
function hostsetup (opts) {
  
  // var mcfg = require(process.env["LINETBOOT_GLOBAL_CONF"] || cfg.mainconf); // Abs Path
  var pass = opts.pass || process.env["ANSIBLE_PASS"] || mcfg.ansible.sudopass;
  if (!pass) { console.log("Need password for Ansible sudo user (--pass or env. ANSIBLE_PASS)"); process.exit(1); }
  opts.pass = pass;
  if (opts.dest) { mcfg.fact_path = opts.dest; }
  // Override with a temp facts path // DEBUG !!! TEMP Location ?
  // else { mcfg.fact_path = "/tmp/facts2"; }
  if (!fs.existsSync(mcfg.fact_path)) {
    mkDirByPathSync(mcfg.fact_path);
    console.log("Created: " + mcfg.fact_path);
  }
  // Access loaded things
  console.log("Host names:" + JSON.stringify(cfg.hostnames, null, 2));
  console.log("Num Host items:" + hostnames.length);
  //console.log("Host params:\n"+ JSON.stringify(cfg.hostparams, null, 2));
  // Jump directly to gather
  gather_facts_setup(mcfg);
  return;
  
  // NOTE: CANNOT load facts w/o facts (TODO: Create mini facts just enough to ping) ?
  // TODO: Create an inventory-only (hostname based) ping/nslookup.
  // Ping hosts ? extract facts ?
  var hostarr = hlr.facts_load_all();
  console.log(cfg.hostarr.length + " facts gathered.");
  netprobe.probe_all(cfg.hostarr, "net", function (err, results) {
      if (err) { apperror("Error checking hosts: "+err); } // usage("Failed net probing: "+ err);
      //console.log("Net probe results: "+JSON.stringify(results, null, 2));
      // Report on Network connectivity (Sync., could be a func)
      // function netprobe_to_md(results) {
      var rep = "";
      results.forEach(function (it) {
        console.log("# "+ it.hname);
        console.log("  - Reachable by ping: "+ (it.ping ? "Yes" : "No"));
        if (!it.ping) { it.ssherr = "Even Ping does not work"; }
        console.log("  - Found in DNS: "+ (it.nameok ? "Yes" : "No"));
        console.log("  - Reachable by SSH: "+ (it.ssherr ? "No ("+it.ssherr+")" : "Yes"));
      });
      // Detect ansible ?
      
      console.log("Probe run on all hosts. Run subcommand facts ...");
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
  /** Use traditional "ansible ... -m setup" way of gathering facts
   * TODO: Consider using --extra-vars serialization from ans module
   */
  function gather_facts_setup(mcfg) {
    
    var xpara = "ansible_sudo_pass=" + opts.pass;
    xpara += " ansible_user=" + (opts.user || process.env["USER"]);
    var cmd = "ansible all -i "+mcfg.hostsfile+"  -b -m setup --tree "+mcfg.fact_path+" --extra-vars \""+xpara+"\"";
    // Increase stdout buffer (to get rid of nasty warnings, even if non-fatal)
    cproc.exec(cmd, {maxBuffer: 1024 * 500}, function (err, stdout, stderr) {
      if (err) {
        console.error("Failed partially or completely to gather facts: " + err);
        //console.log("STDOUT:" + stdout);
        //console.log("STDERR:" + stderr);
        //console.log("Tried to gather facts into path: " + mcfg.fact_path);
        //process.exit(1);
      } // cb(err, null);
      // console.log(stdout);
      if (opts.dest) { console.log("Destination was overriden from command line to: " + opts.dest);}
      console.log("Gathered (or tried to gather) facts into path: " + mcfg.fact_path);
      // Clean up bad facts
      var badcnt = badfact_cleanup(mcfg);
      console.log("Removed " + badcnt + " bad facts files.");
      console.log("If path above is not your configured fact location copy them by (e.g.)\ncp -r "+mcfg.fact_path+" ~/hostinfo/");
      console.log("... and restart lineboot server to pick up the new facts.");
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
    var fpath = mcfg.fact_path;
    //console.log(mcfg.hostarr);
    var badcnt = 0;
    hostnames.forEach(function (hn) {
      var fullpath = fpath+"/"+hn;
      if (!fs.existsSync(fullpath)) { console.log("missing facts: " + fullpath); return; }
      var data = fs.readFileSync(fullpath, 'utf8');
      var len = data.length;
      var j = JSON.parse(data); // TODO: Consider bad JSON
      // j.changed && j.msg
      if (!j.ansible_facts && (len < 500)) {
        console.log("Remove bad facts: " + fullpath + " ("+len+" B)");
        try { fs.unlinkSync(fullpath); } catch(ex) { throw "Could not remove bad host facts " + ex.toString(); }
        badcnt++;
      }
    });
    return badcnt;
  }
       
       
}
// Load package listings (APT/YUM ... into hostpkginfo dir)
// TODO: Use command generator and async

// Load remote management info (assume ipmitool on remote hosts - Ansible)
function rmgmt_collect() {}


/** Setup TFTP server directories.
* Depends on global config and facts.
* - Use Main Config mcfg.tftp.root to determine TFTP root
* - Ensure "pxelinux.cfg" exists. Create if not.
* Create needes subdirectories and mac symlink files.
* If tftp.sync is set, replicate files (by SSH scp) to remote TFTP server in use (given by tftp.ipaddr).
*/
function tftpsetup(opts) {
  // TODO: Lookup 
  // var mcfg = require(process.env["LINETBOOT_GLOBAL_CONF"] || cfg.mainconf); // Abs Path 
  var tcfg = mcfg.tftp;
  if (!tcfg) { console.error("No TFTP Config"); process.exit(1); }
  //console.log(tcfg);
  console.error("TFTP Root configured as: "+tcfg.root);
  if (!fs.existsSync(tcfg.root)) { usage("TFPT Root does not exist"); }
  var dirs = [tcfg.root+"/pxelinux.cfg/", tcfg.root+"/efi32/pxelinux.cfg/", tcfg.root+"/efi64/pxelinux.cfg/"];
  var efidirs = [tcfg.root+"/efi32/", tcfg.root+"/efi64/"]; // TODO: topdirs, add tcfg.root+"/boot/" (BSD)
  var pxelindir = tcfg.root+"/pxelinux.cfg/";
  //////////////// Create /pxelinux.cfg/ basedir(s) ///////////////////
  var ok = mkdir(dirs[0]);
  if (!ok) { apperror("Could not create pxelinux.cfg"); }
  efidirs.forEach(function (dir) {
    var ok = mkdir(dir);
    if (!ok) { apperror("Could noty create: "+dir); }
  });
  // Note recursive: ... only works with node > 10.12.0
  function mkdir(dir) {
    if (!fs.existsSync(dir)) {
      console.log("dir "+dir+" does not exist, try creating ...");
      try {
        //fs.mkdirSync(dir, {recursive: true});
        mkDirByPathSync(dir); // Compat (for older node)
      } catch (ex) {
        console.log("Could not make dir "+dir+": " + ex); return ""; // process.exit();
      }
    }
    else { console.log("Dir "+dir+" seems to already exist."); }
    return dir;
  } // mkdir
  if (!fs.existsSync(tcfg.root)) { usage("TFTP Root does not exist even after trying to create it"); }
  //////////////////////// Create default menu (named "default")
  // TODO: Dry-run
  if (opts.dryrun) { tcfg.dryrun = 1; }
  // Same menu to pxelinx.cfg
  var cont = tboot.bootmenu_save(tcfg, mcfg, "vesamenu.c32", null);
  if (opts.dryrun) { console.log("# Dryrun mode - preview boot menu content:\n"+cont); process.exit(1); }
  /////////////////// Individual host links ////////////////
  // Need to change directory to be able to create relateive symlink
  //var orgdir = process.cwd();
  //console.log("Original dir: " + orgdir);
  //process.chdir( tcfg.root ); // Throws
  
  //console.log(cfg.hostarr);
  // Make "default" symlinks to efi32/ and efi64/ (refer to dirs[0]/default)
  efidirs.forEach((efidir) => {
     var ep = efidir+"pxelinux.cfg";
     if (fs.existsSync(ep)) { return; }
     try { fs.symlinkSync("../pxelinux.cfg/", ep, 'dir'); } catch (ex) { apperror(ex.toString()); }
  }) // forEach
  /*
  var ep0 = fs.existsSync(efidirs[0]+"pxelinux.cfg");
  if (!ep0) {
  try {
    fs.symlinkSync("../pxelinux.cfg/", efidirs[0]+"pxelinux.cfg", 'dir');
  } catch (ex) { apperror(ex.toString()); }
  }
  var ep1 = fs.existsSync(efidirs[1]+"pxelinux.cfg");
  if (!ep1) {
  try {
    fs.symlinkSync("../pxelinux.cfg/", efidirs[1]+"pxelinux.cfg", 'dir');
    
  } catch (ex) { apperror(ex.toString()); }
  }
  */
  
  // Back to original dir !
  //process.chdir( orgdir );
  
  // TODO: Only in /pxelinux.cfg, make **dir** symlinks for others above
  //dirs.forEach(function (pxelindir) {
    //mkmacsymlinks(pxelindir, cfg.hostarr); // dirs[0]
    mkmacsymlinks(dirs[0], cfg.hostarr);
  //});
  //////// BSD boot/pc-autoinstall.conf (Using: tmpl/pc-autoinstall.conf.mustache) ////
  var tmplcfgs = [
    {path: "/boot/", tmpl: "pc-autoinstall.conf.mustache", "fn": "pc-autoinstall.conf"},
    {path: "/grub/", tmpl: "grub.cfg.mustache", "fn": "grub.cfg"}
  ];
  //tmplcfgs.forEach(() => {
  mkDirByPathSync(tcfg.root+"/boot/");
  var tmpl = fs.readFileSync("./tmpl/pc-autoinstall.conf.mustache", 'utf8');
  console.log("Got "+tmpl.length+" B of template");
  // Note: Host specific params remain (in examples), see nic_config: (changed to univeral "dhcp-all")
  // Formulate here:
  mcfg.net.nameserver_first = mcfg.net.nameservers[0];
  var pcauto = Mustache.render(tmpl, mcfg);
  fs.writeFileSync( tcfg.root+"/boot/pc-autoinstall.conf", pcauto, {encoding: "utf8"} );
  
  mkDirByPathSync(tcfg.root+"/grub/");
  tmpl = fs.readFileSync("./tmpl/grub.cfg.mustache", 'utf8');
  console.log("Got "+tmpl.length+" B of template");
  // Note: Host specific params remain (in examples), see nic_config: (changed to univeral "dhcp-all")
  // Formulate here:
  // mcfg.net.nameserver_first = mcfg.net.nameservers[0];
  var cont = Mustache.render(tmpl, mcfg);
  fs.writeFileSync( tcfg.root+"/grub/grub.cfg", cont, {encoding: "utf8"} );
  
  /** Create MAC adress files for "pxelinux.cfg"
   * 
   **/
  function mkmacsymlinks(pxelindir, hostarr) {
  // Check writeability for the runner of the script
  try {
    //await fs.access(pxelindir, fs.constants.W_OK);
    fs.accessSync(pxelindir, fs.constants.W_OK);
  } catch (ex) { usage("PXE linux config dir not writeable: " + ex.toString()); }
  
  hostarr.forEach(function (facts) {
    var ifinfo = facts.ansible_default_ipv4;
    var maca   = ifinfo.macaddress;
    var macfn = tboot.menu_macfilename(facts);
    //return;
    var linkfile = pxelindir + macfn;
    if (fs.existsSync(linkfile)) { console.log("Link or file already exists ("+linkfile+")"); return; }
    console.log("Create symlink: " + linkfile); // macfn
    // NOTE: Should create a very relative link (within same dir) for things to work (mounted) over NFS and TFTP-locally
    try {
      // Yes, keep this out: pxelindir+
      fs.symlinkSync("default", linkfile); // 3rd: type
    } catch (ex) { console.log(ex.toString()); }
  });
    return 1; // ??
  } // mkmacsymlinks
  console.log("Setup pxelinux TFTP Dirs under local TFTP root: " + tcfg.root);
  var tftp = tcfg;
  if (tcfg.sync) {
    var user = tcfg.sync.toString().match(/^[a-z]\w*$/) ? tcfg.sync : "";
    var remloc = tftp.ipaddr + ":" + tftp.root; // "/tmp/tftp"
    scp_sync(tftp.root, remloc, {recursive: 1, user: user}, function (err, path) {
      if (err) { apperror("Failed sync." + err); }
    });
  }
}
/** Add bootloader binaries to the TFTP Area.
 * Meant to be used on Ubuntu (Debian) Host, which has best pxelinux packaging
 * (RH/Centos is missing the lpxelinux.0 binary that Linetboot uses).
 */
function bootbins(opts) {
  // TMP root to use if configured dir is not found.
  var tmproot = "/tmp/"+new Date().getTime()+"_"+process.pid; // pid, time
  // Final place should be: mcfg.tftp.root
  // var mcfg = require(process.env["LINETBOOT_GLOBAL_CONF"] || cfg.mainconf); // Abs Path
  if (!mcfg.tftp) { apperror("No TFTP Config (within main config)"); }
  var tftp = mcfg.tftp;
  if (!tftp.root) { apperror("No TFTP Root dir (within TFTP config)"); }
  var root = tftp.root;
  var root_found = 1;
  if (!fs.existsSync(root)) { console.log("Warning TFTP root "+root+" not found locally (mirror or final)"); root_found = 0; }
  else { var apath = fs.mkdirSync( tmproot, {recursive: true} ); } // mode: ...
  var destroot = root_found ? root : tmproot;
  // destroot = 
  // fs.existsSync()
  
  // Does not seem to returning anything (contrary to doc)
  // if (!apath) { console.log("Dest " + destroot + " not created !"); process.exit(1);}
  if (!fs.existsSync(destroot)) { console.log("Destroot "+destroot+" does not exist and could possibly not be created"); return; }
  // Binaries in Ubuntu 18 (plus FreeBSD-12.1-RELEASE-i386-bootonly.iso for "pxeboot")
  var bins = [
    // src, dest, pkg
    // ["/usr/lib/PXELINUX/gpxelinux.0","gpxelinux.0"], // Any use ?
    // ["/usr/lib/PXELINUX/pxelinux.0","pxelinux.0"], // Any use ?
    ["/usr/lib/PXELINUX/lpxelinux.0",               "lpxelinux.0"],
    ["/usr/lib/syslinux/modules/bios/ldlinux.c32",  "ldlinux.c32"],
    ["/usr/lib/syslinux/modules/bios/libcom32.c32", "libcom32.c32"],
    ["/usr/lib/syslinux/modules/bios/libutil.c32",  "libutil.c32"],
    ["/usr/lib/syslinux/modules/bios/menu.c32",     "menu.c32"],
    ["/usr/lib/syslinux/modules/bios/vesamenu.c32", "vesamenu.c32"],
    // HW detection tool - triggers many deps
    ["/usr/lib/syslinux/modules/bios/hdt.c32", "hdt.c32"],
    ["/usr/lib/syslinux/modules/bios/libmenu.c32", "libmenu.c32"],
    ["/usr/lib/syslinux/modules/bios/libgpl.c32", "libgpl.c32"],
    // pxechn (for chainloading "pxeboot", see menu)
    // https://wiki.syslinux.org/wiki/index.php?title=Pxechn.c32
    // As of version 6.03, pxechn.c32 has no use when booting with syslinux.efi. Do not expect it to work in UEFI mode.
    ["/usr/lib/syslinux/modules/bios/pxechn.c32", "pxechn.c32"],
    // Note: memdisk needs to be refereed with abs path /memdisk (for efi32/efi64)
    // or a compat link(s) needs to be setup in efi32/efi64 (memdisk => ../memdisk)
    ["/usr/lib/syslinux/memdisk","memdisk"],
    // 
    ["/usr/lib/SYSLINUX.EFI/efi32/syslinux.efi", "efi32/syslinux.efi"],
    ["/usr/lib/SYSLINUX.EFI/efi64/syslinux.efi", "efi64/syslinux.efi"],
    // EFI variants. No ldlinux.c32, need ldlinux.e32/ldlinux.e64 (or linux.c32 ?)
    // NOTE: pxechn.c32 is included for EFI (32,64), but documentation (outdated ?) says
    // it will not work with EFI (!)
    // EFI32
    ["/usr/lib/syslinux/modules/efi32/ldlinux.e32",  "efi32/ldlinux.e32"],
    ["/usr/lib/syslinux/modules/efi32/libcom32.c32", "efi32/libcom32.c32"],
    ["/usr/lib/syslinux/modules/efi32/libutil.c32",  "efi32/libutil.c32"],
    ["/usr/lib/syslinux/modules/efi32/vesamenu.c32", "efi32/vesamenu.c32"],
    ["/usr/lib/syslinux/modules/efi32/menu.c32",     "efi32/menu.c32"],
    ["/usr/lib/syslinux/modules/efi32/pxechn.c32",   "efi32/pxechn.c32"], // N/A
    // EFI 64
    ["/usr/lib/syslinux/modules/efi64/ldlinux.e64",  "efi64/ldlinux.e64"],
    ["/usr/lib/syslinux/modules/efi64/libcom32.c32", "efi64/libcom32.c32"],
    ["/usr/lib/syslinux/modules/efi64/libutil.c32",  "efi64/libutil.c32"],
    ["/usr/lib/syslinux/modules/efi64/vesamenu.c32", "efi64/vesamenu.c32"],
    ["/usr/lib/syslinux/modules/efi64/menu.c32",     "efi64/menu.c32"],
    ["/usr/lib/syslinux/modules/efi64/pxechn.c32",   "efi64/pxechn.c32"], // N/A
    //["/usr/lib/syslinux/modules/bios/", ""],
    
    // iPXE (package ipxe)
    ["/usr/lib/ipxe/undionly.kpxe", "undionly.kpxe"],
    ["/usr/lib/ipxe/ipxe.efi", "ipxe.efi"],
    // http://lukeluo.blogspot.com/2013/06/grub-how-to6-pxe-boot.html
    // Grub (orig plan for tftp dir "boot/grub/"
    // Bootloaders: i386-pc/core.0, x86_32-efi/core.efi, x86_64-efi/core.efi
    // Each dir has a bunch of grub *.mod module files.
    // Grub has: grub-mknetdir
    // ["/usr/lib/grub/x86_64-efi-signed/grubnetx64.efi.signed", "grub/grubnetx64.efi.signed"], // Also grubx64.efi.signed
    // ["/usr/lib/shim/shimx64.efi.signed", "grub/shimx64.efi.signed"], // Also shimx64.efi
    // ["", "grub/"] // grub.cfg (menu file)
    // BSD PXE Bootloader from FreeBSD 12 ISO
    // NOTE: Shoud chmod u+w 
    ["/isomnt/freebsd12/boot/pxeboot", "pxeboot"],
  ];
  var i = 0;
  var dbins = [];
  bins.forEach(function (it) {
    var src  = it[0];
    var dest = destroot + "/"+it[1]; // Abs destfile
    if (!fs.existsSync(src)) { console.log(src + " does not exist (skipping)"); return; }
    var destdir = path.dirname(dest);
    if (!fs.existsSync(destdir)) { fs.mkdirSync( destdir, {recursive: true} ); }
    if (!fs.existsSync(destdir)) { console.log(destdir + " (dest subdir) does not exist and could not be created."); return; }
    //if (!src) { return; }
    // flags - 3rd param
    var flags = fs.constants.COPYFILE_EXCL; // fs.constants.COPYFILE_FICLONE fs.constants.COPYFILE_FICLONE_FORCE
    try { fs.copyFileSync(src, dest ); } catch (ex) { console.log("Error Copying "+src+"... skip"); return; }
    var mode = 0o644; // fs.constants.S_IWUSR; // Must "OR" lot of constants
    fs.chmodSync(dest, mode); // Must change to user writable to prevent nasty chain-reaction.
    // console.log(dest + " Current File Mode:",  fs.statSync(dest).mode);
    i++; dbins.push(it[1]);
  });
  console.log("Copied ("+dbins.length+") files to " + destroot); console.log("\nls -alR "+destroot + "");
  console.log("Bins:", dbins);
  // TODO: Sync / replicate to remote TFTP ?
  // https://unix.stackexchange.com/questions/193368/can-scp-create-a-directory-if-it-doesnt-exist
  if (tftp.sync) {
    var user = tftp.sync.toString().match(/^[a-z]\w*$/) ? tftp.sync : "";
    var remloc = tftp.ipaddr + ":" + tftp.root; // "/tmp/tftp"
    scp_sync(tftp.root, remloc, {recursive: 1, user: user}, function (err, path) {
      if (err) { apperror("Failed sync." + err); }
    });
  }
}
/** Sync tftp dirs content by SSH scp or rsync (Local path to remote path).
 * 
 * scp has limitations in copying symbolic links. Use rsync for these cases (opts.scp = false).
 * @param local {string} - Local path (scp or rsync compatible source path)
 * @param remloc {string} - Remote server and path in scp and rsync compatible format server:/path/to/dest/
 * @param opts {object} - Options for sync op ("scp": true to prefer scp., "recursive" to do recursive copy)
 * @param cb {function} - Callback to call after asyncronous file sync.
 * See also (for spawn/exec data buffering / handlers): https://stackoverflow.com/questions/23429499/stdout-buffer-issue-using-node-child-process
 */
function scp_sync(local, remloc, opts, cb) {
  opts = opts || {};
  var rec = opts.recursive ? "-r" : "";
  // OLD ? Not in case or direcrory source, caller should append a trailing slash to path.
  // For "scp" Strip one path component out of the name
  if (opts.scp && opts.recursive) { remloc = path.dirname(remloc); }
  if (!opts.scp && !local.match(/\/$/)) { local += "/"; }
  if (opts.user) { remloc = opts.user + '@' + remloc; }
  // Assume recursive also as a signal of dir
  // NOT: var slash = opts.recursive ? "/" : "";
  // Do not use -p - could lead to problems w. scp
  // DOES_NOT_WORK Not must detect type of source: file/dir
  // rsync: a = rlptgoD, keep rlp (may strip p=perms,  t=times, g=group, o=owner, D=devices)
  var cmd = "rsync -rlpv "+local+" "+remloc+"";
  if (opts.scp) { cmd = "scp "+rec+" "+local+" "+remloc+""; }
  console.log("Try sync by: " + cmd);
  var execopts = {};
  cproc.exec(cmd, {}, function(err, stdout, stderr) {
    if (err) { console.log("Error running sync cmd: "+cmd + " ("+err+")"); return cb(stderr, null); }
    console.log("Copied (successfully) to: " + remloc);
    cb(null, remloc);
  });
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
 * Would be nice to execute on single host centrally using newtwork interface (e.g. lanplus),
 * but contact need to be made to BMC (not host), which is (initially) unknown.
 * It will be hard to sudo on host.
 */
function ipmiinfo(opts) {
  
}
// https://stackoverflow.com/questions/31645738/how-to-create-full-path-with-nodes-fs-mkdirsync
function mkDirByPathSync(targetDir, { isRelativeToScript = false } = {}) {
  const sep = path.sep;
  const initDir = path.isAbsolute(targetDir) ? sep : '';
  const baseDir = isRelativeToScript ? __dirname : '.';

  return targetDir.split(sep).reduce((parentDir, childDir) => {
    const curDir = path.resolve(baseDir, parentDir, childDir);
    try {
      fs.mkdirSync(curDir);
    } catch (err) {
      if (err.code === 'EEXIST') { // curDir already exists!
        return curDir;
      }

      // To avoid `EISDIR` error on Mac and `EACCES`-->`ENOENT` and `EPERM` on Windows.
      if (err.code === 'ENOENT') { // Throw the original parentDir error on curDir `ENOENT` failure.
        throw new Error(`EACCES: permission denied, mkdir '${parentDir}'`);
      }

      const caughtErr = ['EACCES', 'EPERM', 'EISDIR'].indexOf(err.code) > -1;
      if (!caughtErr || caughtErr && curDir === path.resolve(targetDir)) {
        throw err; // Throw if it's just the last created dir.
      }
    }

    return curDir;
  }, initDir);
}
/** Generate ISC DHCP Configuration with single range of addresses (thus small scale).
 * 
 */
function dhcpconf(opts) {
  //var mcfg = mc.mainconf_load(process.env["LINETBOOT_GLOBAL_CONF"] || cfg.mainconf);
  //mc.mainconf_process(mcfg);
  mcfg.fact_path = mcfg.fact_path || process.env["FACT_PATH"];
  // TODO: load from resolved config location, not ./tmpl !!
  var tmplfn = "./tmpl/isc.dhcpd.conf.mustache";
  if (!fs.existsSync(tmplfn)) { console.error("DHCP Config Template "+tmplfn + " does not exist"); return; }
  var tmpl = fs.readFileSync(tmplfn, 'utf8');
  // Setup params. Possibly embed to a library (osinstall ?)
  //NOT: osinst.netconfig(mcfg.net, f); // Needs facts - not suitable
  var net = mcfg.net;
  var dhcp = mcfg.dhcp;
  if (!net) { usage("No network config"); }
  if (!dhcp) { console.error("Error: No 'dhcp' section in main config (need it for 'range')"); process.exit(1); }
  net.nameservers = net.nameservers.join(",");
  // Validate, turn into space separated
  if (!Array.isArray(dhcp.range) || dhcp.range.length != 2) { console.error("Error:dhcp.range not an array or does not have len==2."); process.exit(1); }
  dhcp.range = dhcp.range.join(" ");
  var fnet = net_fallback(net);
  // Allow broadcast and subnet to originate from mcfg.net.*, fall back on computed.
  net.broadcast = net.broadcast || fnet.broadcast;
  // Same ... for subnet
  net.subnet = net.subnet || fnet.subnet;
  console.log(net);
  ////////////////////////////////////////////////
  // Add hosts to mcfg
  //hlr.init(mcfg); // global, gcolls (opt)
  var hnames = hostnames; // hlr.hosts_load(mcfg); // main conf
  // Note: Not all of these may have facts (?/). Do NOT use this.
  console.error("DHCP Hostnames: ", hnames);
  //var hostarr = hlr.facts_load_all();
  if (!hostarr) { apperror("dhcpconf: No host (facts) array loaded"); }
  ///////////////////////////////////////////////
  // NOW: Use hostarr
  hnames = hostarr.map(function (it) { return it.ansible_fqdn; });
  // console.error(hostarr); // Huge
  ////////////// Create Params /////////////////
  // TODO: Add (temporarily, not de-facto) the NBP if configured
  hostarr.forEach(function (f) {
    var p = hlr.hostparams(f) || {};
    console.log("Params: ", p);
    if (p.nbp) { f.nbp = p.nbp; } // Add NBP
    if (p.nfsroot) { f.nfsroot = p.nfsroot; }
  });
  mcfg.hosts = hostarr;
  var cont = Mustache.render(tmpl, mcfg);
  var fn = dhcp.conf_path + "/dhcpd.conf";
  // Save ?
  if (dhcp.conf_path && fs.existsSync(dhcp.conf_path) && opts.save) {
    console.error("Check "+dhcp.conf_path+" writeability ...");
    // var accok = 0;
    try { fs.accessSync(dhcp.conf_path, fs.constants.W_OK);  } // accok = 1;
    //  sudo chmod g+w /etc/dhcp/ ; sudo chgrp $USER /etc/dhcp/
    catch (ex) {console.error("Cannot write "+dhcp.conf_path + " - consider sharing it to a group"); process.exit(0); }
    
    fs.writeFileSync(fn, cont); // {encoding: 'utf8'}
    console.error("Wrote to ISC DHCP COnfig file: "+fn);
  }
  else {
    console.log(cont);
    console.error("# Redirect output (stdout) to a 'dhcpd.conf' or use --save option to save to "+fn+"");
  }
  // Sync output to remote server and restart ? Any method used / tried here bases on passwordless SSH (scp,rsync,git)
  // For dnsmasq command could refer to /var/run/dnsmasq.pid
  if (dhcp.sync) {
    var user = dhcp.sync.toString().match(/^[a-z]\w*$/) ? tftp.sync : "";
    // Copy to server
    var remloc = dhcp.host + ":" +  dhcp.conf_path; // "/tmp/tftp"; // // 
    // SIngle file, non-recursive.
    scp_sync(dhcp.conf_path+"/dhcpd.conf", remloc, {user: user}, function (err, path) {
      if (err) { apperror("Failed sync."); }
      // Restart
      if (dhcp.reloadcmd) {
        cproc.exec(dhcp.reloadcmd, function (err, stdout, stderr) {
          if (err) { console.log("Failed to reload: " + err); return; }
          console.log("Reloaded successfully by: " + dhcp.reloadcmd);
        });
      }
    });
    
  }
  
  // Mock-up fallback (DHCP geared) net settings (if broadcast and subnet are NOT give in "net")
  function net_fallback(net) {
    var fnet = {}; // Fallback net settings
    // Broadcast
    var gwarr = net.gateway.split(".");
    gwarr[3] = "255";
    fnet.broadcast = gwarr.join(".");
    // Subnet
    var snarr = net.gateway.split(".");
    gwarr[3] = "0";
    fnet.subnet = gwarr.join(".");
    return fnet;
  }
  
}

/** Generate new host "fake-facts" and 
 * Note this implies:
 * - adding hosts to Linetboot "hosts" file.
 * - Not using the "newhosts" mechanism (as facts don't need to be generated anymore).
 * Run with A CSV file:
 * ```
 * node ./hostsetup.js newhostgen --newhosts /my/newhosts.txt
 * ```
 */
function newhostgen(opts) {
  //mcfg.fact_path = "/tmp/facts"; // DEBUG
  //mcfg.ipmi.path = "/tmp/facts"; // DEBUG
  var csvfn = opts.newhosts;
  if (!csvfn) { apperror("No newhosts CSV file named, pass with --newhosts"); }
  if (!fs.existsSync(csvfn)) { apperror("newhosts CSV file by name"+csvfn+" does not exist"); }
  if (!mcfg.fact_path) { apperror("No fact_path"); }
  if (!mcfg.ipmi.path) { apperror("No ipmi.path"); }
  var ipath = mcfg.ipmi.path;
  if (!ipath) { apperror("No ipmi_path to store generated BMC info."); }
  var newhosts = hlr.customhost_load(csvfn, mcfg);
  if (!Array.isArray(newhosts)) { apperror("Could not properly load host info from: '" + csvfn + "'"); }
  var save = opts.save;
  // Note: If username is to be parametrized (by e.g. template), the username MUST be padded to maintain tricky fixed offsets !
  var userblock = `
ID  Name             Callin  Link Auth  IPMI Msg   Channel Priv Limit
1                    true    false      false      NO ACCESS
2   root             true    true       true       ADMINISTRATOR
`;
  // Process all new hosts
  newhosts.forEach(function (h) {
    if (!h.hname) { console.log("No hname !", h); return; }
    var f = hlr.host2facts(h, mcfg);
    // Write fake facts
    
    if (save) { fs.writeFileSync( mcfg.fact_path + "/" + h.hname, JSON.stringify(f, null, 2), {encoding: "utf8"} ); }
    else { console.log(JSON.stringify(f, null, 2)+"\n"); }
    if (!h.bmcipaddr) { apperror("No bmcipaddr property in newhost record (add this to your CSV) ! Exiting ..."); }
    // Write fake IPMI info
    var ipmi_bn = ipath + "/" + h.hname; // Basename for both files
    if (save) {
      var ipblock = "IP Address              : "+h.bmcipaddr+"\n";
      fs.writeFileSync( ipmi_bn+".lan.txt",  ipblock , {encoding: "utf8"} );
      fs.writeFileSync( ipmi_bn+".users.txt", userblock, {encoding: "utf8"} );
    }
    else { console.log(ipblock + "\n" + userblock); }
  });
  if (!save) { console.error("Use --save to store to files."); }
  else { console.error("Wrote generated information to paths: '"+mcfg.fact_path+"' (facts) '"+mcfg.ipmi.path+"' (IPMI info)"); }
}

/** Generate loopmounts in /etc/fstab format (Linux ONLY, i.e. not BSD variants).
 */
function loopmounts(opts) {
  var procmnt = "/proc/mounts";
  var tmpls = {
    "cmds": "{{#loops}}mount -o loop '{{{ img }}}' {{{ mntpt }}}\n{{/loops}}",
    "fstab": "{{#loops}}{{{ img }}} {{{ mntpt }}} iso9660 loop 0 0\n{{/loops}}"};
  var fmt = opts.cmds ? "cmds" : "fstab"; // Format: mount commands or /etc/fstab
  // See all /dev/loopN entries. Note: *all* these exist on FS.
  if (!fs.existsSync(procmnt)) { apperror("Cannot find: "+procmnt+". Not on Linux ?"); }
  var data = fs.readFileSync(procmnt, 'utf8');
  var flds = ["dev", "mntpt", "fstype", "opts", "c1", "c2"];
  var arr = hlr.csv_parse_data(data, {hdr: flds, sep: /\s+/, });
  arr = arr.filter((r) => { return r.dev.match(/\/loop\d+$/) });
  async.map(arr, function (dfitem, cb) {
    tboot.getlosetup(dfitem.dev, function (err, imgfull) {
      if (err) { return cb(err, null); }
      dfitem.img = imgfull; // Store Image
      cb(null, imgfull);
    });
  }, function (err, res) { // oncomplete
    if (err) { return apperror("Failed interrogating losetup"); }
    console.log(Mustache.render(tmpls[fmt], {loops: arr}));
  });
}
