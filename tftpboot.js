/** @file
* TFTP, Boot and Bootmenu related functionality.
* Should collaborate with ipmi/rmgmt (Redfish)

* TODO: Move to here:
* bootlabels() -OK
* installrequest()
*   menu_macfilename(); OK
* tftp_listing()
* has_macfile_pattern()
*/
var fs = require("fs");
var Mustache = require("mustache");

function dclone(d) { return JSON.parse(JSON.stringify(d)); }

function init() {}
/**
 * @param f {string} - Mac address string or Facts object indicating unique host
 */
function has_macfile_pattern(bn, retmac) {
    var patt = /^01-([0-9a-fA-F]{2}-[0-9a-fA-F]{2}-[0-9a-fA-F]{2}-[0-9a-fA-F]{2}-[0-9a-fA-F]{2}-[0-9a-fA-F]{2})$/;
    var ok = bn.match(patt);
    if (ok && retmac) { return ok[1].replace(/-/g, ':').toLowerCase(); }
    return ok;
  }

/** Create a MCA-Address based file in global.tftp.root + "" + "01"+MACaddr (See: hostcommands.js)
 * @param f {string} - Mac address string or Facts object indicating unique host
 * @return MAC Address based filename ("01" prefixed, colons trurned into hyphens)
 */
function menu_macfilename(f) {
  if (!f) { console.log("menu_macfilename: No facts or macaddr !"); return ""; }
  var mac;
  if (typeof f == 'string') { mac = f; }
  else { mac = f.ansible_default_ipv4 ? f.ansible_default_ipv4.macaddress : ""; }
  if (!mac) { return ""; }
  mac = mac.replace(/:/g, "-");
  mac = mac.toLowerCase();
  if (!mac) { return ""; }
  var macfn = "01-" + mac;
  return macfn;
}
function macfilename_to_mac(macfn) {
  macfn = macfn.substr(3);
  macfn = macfn.replace(/-/g, ":");
  macfn = macfn.toLowerCase();
  return macfn;
}

/** List PXELinux Config directory MAC-named files.
 */
function pxelinuxcfg_list(path, extra) {
  var list = fs.readdirSync(path);
  var list2 = [];
  list.forEach(function (it) {
    //console.log("ITEM:"+it);
    if (!has_macfile_pattern(it)) { return; } // Skip !
    // Extra info (as Object)
    if (extra) {
      var info = {fname: it};
      var fullpath = path + "/" + it;
      // NOTE: Must do lstatSync(), NOT plainly statSync()
      var stats = fs.lstatSync(fullpath); // [, options]
      // Stat for size, date, symlinkness
      info.size  = stats.size;
      info.mtime = stats.mtime;
      //info.ctime = stats.ctime;
      info.issym = stats.isSymbolicLink(); // Resolve to which file ?
      list2.push(info);
      return;
    }
    list2.push(it);
  });
  return list2;
}

/** Collect (parse) boot labels from boot menu file.
 * Create a (Array-of-Objects) list of os label ("id"), os description ("name") entries.
 * @param fn {string} - Pxelinux boot menu filename with resolvable (e.g. relative) path.
 * @return list of OS descriptions.
 */
function bootlabels(fn) {
  // Consider what config section to put into (tftp.menutmpl)
  //var fn = global.tftp.menutmpl;
  
  //fn = "./tmpl/default.installer.menu.mustache";
  if (!fs.existsSync(fn)) { return null; }
  var menucont = fs.readFileSync(fn, 'utf8');
  var m = []; // Menu array
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
/** Detect Boot Menu Default Boot Item Label.
 * @param fn {string} - Menu Filename
 * @return Boot label string
 */
function menu_deflbl(fn) {
  if (!fs.existsSync(fn)) { return null; }
  var menucont = fs.readFileSync(fn, 'utf8');
  // "-" seems to be valid char in boot label
  var re = /^default\s+([\w\-]+)/gm;
  var match = re.exec(menucont);
  if (match) { return match[1]; }
  return "";
}

/** Convert boot label to bootitem (w. id and name)
* Can be used to would validate boot label against a real manu or provide info for bootitem.
* @param bootlbl {string} - Boot label
* @param tcfg {object} - TFTP Config (for the tcfg.menutmpl)
* @return Boot Item.
*/
function bootlbl2bootitem(bootlbl, tcfg) {
  tcfg = tcfg || {}; // module init stored ?
  var mfn = tcfg.menutmpl; // The main menu template
  if (!mfn) { throw "No Boot Menu file found in config for label validation "; }
  if (!fs.existsSync(mfn)) { throw "Boot Menu file "+mfn+" does not exist!"; }
  // Validate boot label against 
  var boots = bootlabels(mfn);
  if (!boots) { throw "No bootlabel structure";  } // return null;
  var bootitem = boots.filter(function (it) { return it.id == bootlbl; })[0];
  if (!bootitem) { throw "No Boot Item found from menu by " + bootlbl; }
  return bootitem;
}


/** Parse (PXELinux) menu file in stateful manner.
 * Aim to produce Grub menu based on this info.
 * @param fn {string} - filename for menu file.
 * @return Array of boot items
 */

function menufile_parse(fn) {
  if (!fs.existsSync(fn)) { return null; }
  var cont = fs.readFileSync(fn, 'utf8');
  return menufile_parse_cont(cont);
}

function menufile_parse_cont(cont) {
  if (!cont) { console.error(`No menu content parse !`); return null; }
  var lines = cont.split("\n");
  var arr = [];
  var known = {label: 1, 'menu label':1, kernel: 1, linux: 1, initrd: 1, append:1, sysappend: 1};
  var re = /(menu|menu label|kernel|linux|initrd|append|sysappend)/; // menu title
  var curr = null;
  lines.forEach((l) => {
    if (l.match(/^\s*#/)) { return; }
    if (l.match(/^\s*$/)) { return; }
    //console.log("LINE: "+l);
    var le = parseline(l);
    if (le) {
      if (le.tag == 'label') {
        if (curr) { arr.push(curr); curr = null; }
        curr = curr || {};
      }
      curr[le.tag] = le.val;
    }
  });
  if (curr) { arr.push(curr); }
  // Parse, analyze and process single line.
  function parseline(l) {
    var debug = 0;
    var r = l.split(/\s+/); // Not ,2
    debug && console.log("   COMPS: '", r, "'");
    var tag = r.shift();
    if (tag == 'menu' && r[0] == 'label') { tag = "menu label"; r.shift(); }
    debug && console.log("   COMPS2: '", r, "'");
    r = r.join(" ");
    debug && console.log("   TAG: '"+ tag+ "'");
    debug && console.log("   TRAIL: '"+ r+ "'");
    if ( ! known[tag]) { console.log("UNKNOWN: "+ tag ); return null; }
    return {tag: tag, val: r};
  }
  return arr;
}

////////////////////////////////////////////////////////////////////////////////

/** Generate and store boot menu file
* - Generate menu by templating based on global info (cloned) and override default boot label
* - Store into file by pxelinux preferred MAC address based filename
* @param tcfg {object} - TFTP Config (section of main config) w. "menutmpl" and "root"
* @param global {object} - Global config used as params for templating (used members tftp.menutout tftp.menudef httpserver nfsserver)
* @param bootlbl {string} - Boot menu label to use as default booot item
* @param f {object} - Optional ansible facts for single host item OR leave out to generate "default" menu (defines underlying filename).
* @return Full filename for the stored menu.
*/
function bootmenu_save(tcfg, global, bootlbl, f) {
  ////  Generate
  var mfn = tcfg.menutmpl;
  var tmpl = fs.readFileSync(mfn, 'utf8');
  var g = dclone(global); // MUST Copy (to change below) !
  g.tftp.menudef = bootlbl;
  var cont = Mustache.render(tmpl, g);
  tcfg.debug && console.log("Created "+cont.length+" Bytes of menu content");
  // TODO: Allow dry-run and ONLY return content
  if (tcfg.dryrun) { return cont; }
  ////////// Save
  var macfn = f ? menu_macfilename(f) : "default"; // No facts => "default"
  if (!macfn) { throw "No MAC Address (in facts) for "+q.hname;  }
  tcfg.debug && console.log("Resolved MAC-based menu filename to " + macfn);
  var root = tcfg.root;
  if (!fs.existsSync(root)) { throw "TFTP root does not exist";  }
  var pxecfg = root + "/pxelinux.cfg/";
  if (!fs.existsSync(pxecfg)) { throw "pxelinux.cfg under TFTP root does not exist";  }
  var fullmacfn = pxecfg + macfn;
  // If found, delete old, existing
  if (fs.existsSync(fullmacfn)) {
    try { fs.unlinkSync(fullmacfn); } catch(ex) { throw "Could not remove any previous macfile " + ex.toString(); }
  }
  try {
    fs.writeFileSync( fullmacfn, cont, {encoding: "utf8"} ); // {encoding: "utf8"}, "mode": 0o666
  } catch (ex) { throw "Could not write new macfile named menu " + ex; }
  return fullmacfn;
} // bootmenu_save

/** Remove old file and recreate symlink to "default".
* Validate filename as correcly formatted MAC based filename and
* check presence on filesystem.
* Throws exceptions on any problems.
* @param tcfg {object} - TFTP Config Object (from main config)
* @param macfname {string} - MAC-named pxelinux filename
* @return None
*/
function bootmenu_link_default(tcfg, macfname) {
  if (!tcfg) { throw "No TFTP Config"; }
  if (!macfname) { throw "No MAC based menu filename"; }
  if (!has_macfile_pattern(macfname)) { throw "MAC Base Menu filename not in correct format "; }
  var fullfn = tcfg.root+ "/pxelinux.cfg/" + macfname;
  if (!fs.existsSync(fullfn)) { throw "Boot menu file not there"; }
  // Unlink and symlink
  try { fs.unlinkSync(fullfn); }
  catch(ex) { throw "Could not remove menu file symlink " + ex.toString(); }
  // Need try/catch
  try { fs.symlinkSync("default", fullfn); }
  catch(ex) { throw "Could not create new default menu file symlink " + ex.toString(); }
  
}

//////////////////////////////// BOOT MEDIA ///////////////////////////////

var cproc   = require('child_process');

/** Resolve the original image for a loop mount.
 * Call linuc "losetup" command in clunky, but legacy compatible way here.
 * 
 * ## Problematic Legacy
 * - newer losetup (part of util-linux) has completely different opts (e.g. Ubu18: 2.31.1)
 * - RH 6 version does not even support --version (!)
 * - Resides in /sbin/losetup in old RH and new Ubuntu (in all Linux)
 losetup --list
 losetup --list --noheadings -O BACK-FILE /dev/loop3
 Common: sudo losetup /dev/loop3 (But requires sudo on RH ! ... or ugo+s)
 * @param loopdev {string} - Loop device name (e.g. /dev/loop6)
 * @param cb {function} - Function to call after resolving image
 * TODO: Return object: {dev: "loopN", img: ""}
*/
function getlosetup(loopdev, cb) {
  //console.log("Continue by loopdev: " + loopdev);
  //var cmd = "losetup --list --noheadings -O BACK-FILE "+ loopdev;
  var cmd = "losetup "+ loopdev;
  var legpatt = /\(([^)]+)\)/; // Legacy (compatible) output pattern
  //0 &&
  cproc.exec(cmd, function (err, stdout, stderr) {
    if (err) {
      // Seems losetup errors on loopN devs with nothing mounted.
      // Suppress errors from losetup, filter failed at caller.
      //return cb("Failed losetup: " + err, null);
      return cb(null, ""); // {dev: loopdev, img: ""}
    }
    var m = stdout.match(legpatt);
    if (!m) { return cb("No Image matched in "+stdout, null); }
    console.log(`${loopdev} => ${m[1]}`);
    //imgfull = m[1]; // Suppress
    return cb(null, m[1]); // {dev: loopdev, img: m[1]}
  });
}

module.exports = {
  // init: init,
  has_macfile_pattern: has_macfile_pattern,
  menu_macfilename: menu_macfilename,
  macfilename_to_mac: macfilename_to_mac,
  pxelinuxcfg_list: pxelinuxcfg_list,
  bootlabels, bootlabels,
  menu_deflbl: menu_deflbl,
  bootlbl2bootitem: bootlbl2bootitem,
  menufile_parse: menufile_parse,
  //
  bootmenu_save: bootmenu_save,
  bootmenu_link_default: bootmenu_link_default,
  // Boot Media
  getlosetup: getlosetup
};

// Parse menu and output in (near) "bootables" format.
function cli_pm(opts) {
  let app = opts.self;
  let mfn = process.argv[3];
  if (!fs.existsSync(mfn)) { console.error(`No menu file passed`); return; }
  
  var tmpl = fs.readFileSync(mfn, 'utf8');
  // var g = dclone(global); // MUST Copy (to change below) !
  // g.tftp.menudef = bootlbl;
  let cont = Mustache.render(tmpl, opts.mcfg);
  
  let d = menufile_parse_cont(cont);
  d.forEach( (bi) => {
    let kernel = bi.kernel || bi.linux; //  || "http://foo/";
    bi._kernel = parsepath(kernel);
    // let uk = kernel && kernel.match(/^http/) ? new URL(kernel) : null;
    // bi._kernel = uk ? uk.pathname : "NONE";
    // if (bi.initrd && bi.initrd.includes(" ")) {} // Multiple initrd
    // else if (bi.initrd && bi.initrd.match(/^http/)) { let ui = new URL(bi.initrd); bi._initrd = ui.pathname; }
    bi._initrd = parsepath(bi.initrd);
  });
  console.log(JSON.stringify(d, null, 2));
  console.log(`${d.length} Boot items listed.`);
  function parsepath(u) {
    if (!u) { return ""; }
    if (!u.match(/https?/)) { return ""; } // See arch for exceptions (missing http:// on one of images ?)
    if (u.match(',')) { return parsepath_multi(u); } // Hope to catch multi-initrd
    let url = new URL(u);
    if (!url) { return ""; }
    let up = url.pathname;
    if (!up) { return ""; }
    up = up.replace(/^\//, "");
    return up;
    function parsepath_multi(mus) {
      let musarr = mus.split(/,/);
      console.error(`MULTI-SPLIT (): `, musarr);
      if (!musarr) { return "MULTI???"; }
      // Call parsepath(us) recursively to parse single 
      musarr = musarr.map( (us) => { return parsepath(us); });
      return musarr.join(',');
    }
  }
}

function cli_loopmnt(opts) {
  // Read names of all /dev/loop\d+
  var files = fs.readdirSync("/dev/", {});
  files = files.filter( (dfn) => { return dfn.match(/loop\d+/) ? true : false; });
  files = files.map( (dfn) => { return `/dev/${dfn}`; });
  console.log(files);
  let async = require("async");
  async.map(files, getlosetup, function (err, ress) {
    // Failed losetup: Error: Command failed: losetup /dev/loop6
    // For loop devices that have nothing mounted ?
    if (err) { console.error(`Error resolving loop device info: ${err}`); return; }
    console.log(ress);
  });
  
}

let ops = [
  {id: "parsemenu", "label": "Parse menu file (pass fn as first arg) and dump as JSON.", cb: cli_pm},
  {id: "loopdev_list", "label": "List loop mounts on current machine.", cb: cli_loopmnt},
  
];
let cliopts = [
  //["","=ARG",""],
];
if (process.argv[1].match("tftpboot.js")) {
  let cliapp = require("./cliapp");
  let app = new cliapp.cliapp(ops, cliopts, {});
  var cfgfn = process.env.HOME + "/.linetboot/global.conf.json";
  var mcfg = require(cfgfn);
  // console.log(mcfg);
  if (!mcfg) { app.usage("No config !"); }
  let opn = app.parse({ addself: true });
  // console.log(app);
  app.opts.mcfg = mcfg;
  let rc  = opn.cb(app.opts);
  
}
