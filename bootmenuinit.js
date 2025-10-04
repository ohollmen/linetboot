#!/usr/bin/node
// Boot media helper.
// Implements or should implement (command generation for ...):
// - ISO Media Download from distro source
// - ISO Media mounting (generate mount commands or generate /etc/fstab)
// - Menu generation or initialization
// - Validate loop mounted ISO:s, presence of initrd, kernel on local system
// - Validate downloadability of initrd, kernel (HTTP HEAD request)
// - Validate Checksums of images
// ## Dev Hints (Mainly RE)
// - RE Non-capturing parens: (?:Value)
// - RE Non-capturing and optional block: (?:Value)? (E.g. Ubuntu .N patch release after initial distro release)
var Mustache = require("mustache");
var path = require('path');
var fs   = require('fs');
var cfg  = require("./bootables.json");
var mcfg;

function dclone(d) { return JSON.parse(JSON.stringify(d)); }

// Validate kernel / boot items
function validate_ki () {
  var attrs = ["kernel","initrd"];
  for (var i in cfg.items) {
    var it = cfg.items[i];
    var absname_k = cfg.mountpath + "/" + it.lbl + "/" + it.kernel;
    var absname_i = cfg.mountpath + "/" + it.lbl + "/" + it.initrd;
    var stat = {"kernel": "OK", "initrd": "OK"};
    var fns  = {"kernel": absname_k, "initrd": absname_i};
    //var status = "OK";
    console.log("Media: " + it.lbl + " (" + it.img_bn + ")"); // 
    attrs.forEach(function (k) {
      if (!fs.existsSync(fns[k])) { stat[k] =  "NOT present !"; }
    });
    //if (!fs.existsSync(absfname_k)) { stat.kernel = "NOT present !";}
    //if (!fs.existsSync(absfname_i)) { stat.initrd = "NOT present !";}
    //else {}
    attrs.forEach(function (k) { console.log("  - " + fns[k] + " : " + stat[k]); });
  }
}


function genmenu() {
  // Patch with config "httpserver"
  cfg.items.forEach(function (it) {
    it.httpserver = cfg.httpserver; // "foo-1.2";
  });
  var tmpl = fs.readFileSync("./tmpl/boot_menu_item.mustache", 'utf8');
  var cont = "";
  for (var i in cfg.items) {
    var it = cfg.items[i];
    // Last-minute fix-ups here ... (e.g. append version ?)
    //if () {}
    // -O path.basen
    cont += Mustache.render(tmpl, it);
  }
  console.log(cont);
  //return cont;
}

function download() {
  var cont = "";
  for (var i in cfg.items) {
    var it = cfg.items[i];
    //if () {}
    
    // -O path.basename(it.url
    cont += "wget "+it.url+" -O "+cfg.imgpath+"/"+it.img_bn+"\n";
  }
  console.log(cont);
}
function mount() {
  var cont = "";
  for (var i in cfg.items) {
    var it = cfg.items[i];
    // Basename of image
    // Abs path of image file
    var an = cfg.imgpath + "/" + it.img_bn;
    prefix = "";
    if (!fs.existsSync(an)) { prefix = "# NA: ";}
    // console.log(it);
    if (op == 'mount') { cont += prefix + "sudo mount -o loop " + an + " " + cfg.mountpath + "/" + it.lbl + "\n"; }
    else { cont += an + " "+cfg.mountpath+"/"+`${it.lbl} iso9660 loop 0 0\n`; }
  }
  console.log(cont);
}
/**
List images from /isoimages/ directory and extract version number(s).
Match filename to a distro naming pattern (RE) to conclude how it should be mounted.
Version numbers are extracted with nested RegExp, where outer parens match **whole** version
number and the inner parts of it (major, minor, patch). These should be coming from config.
*/
function images_list() {
  let isopath = `${mcfg.isopath}` || "/isomnt"; // Also: ${cfg.core.maindocroot}
  if (!fs.existsSync(isopath)) { usage(`Image dir ${isopath} does not seem to exist !`)}
  let files = fs.readdirSync(`${isopath}`);
  files = files.filter((fn) => { return fn.match(/.*\.iso$/i); });
  console.log(`{files.length} ISO Images found.`, files);
  if (!files.length) { usage(`No ISO files listed from ${isopath}. FS area not mounted ?`); }
  let stats = {"isocnt": files.length, "misscnt": 0, "matchcnt": 0, "mountcnt": 0};
  let missnames = [];
  files.forEach( (fn) => {
    // Does image name match any of the patterns ? di = Distro item
    let di = find_item_by_imgname(fn);
    if (!di) {
      //console.error(`Image name ${fn} did not match any distro items (by image name)!`);
      //console.error(`No MATCH: ${fn}`);
      stats.misscnt++; missnames.push(fn);
      return;
    }
    console.log(`File '${fn}' matched (belongs to) distro '${di.name}' => matches: ${di.mvals}`); // image ${di.img_bn}
    let obj = mvals_to_obj(di.mvals);
    stats.mountcnt += mntpath(di, obj);
    console.log(obj);
    stats.matchcnt++;
  });
  console.error(`${stats.isocnt} ISO:s, ${stats.matchcnt} Matches, ${stats.misscnt} Misses, ${stats.mountcnt} Mounts discovered`);
  console.error(`Missing match:\n`, missnames);
  // Try to match image basename to a distro item by its imgpatt (RE).
  // @return Cloned distro item if matching was successufl, null if there ws no match for file basename.
  function find_item_by_imgname(fn) {
    // Match Distro item
    let dim = null; // (Distro item) Match
    let di = cfg.items.find( (di) => {
      let m;
      if (!di.imgpatt) { return 0; }
      if ( m = fn.match(new RegExp(di.imgpatt, "i")) ) { m.shift(); dim = m; return 1; } // new RegExp(di.imgpatt, "i")
    });
    if (!di) { return null; } // console.error(`Image name ${fn} did not match any distro items (by image name)!`); return; }
    di = dclone(di);
    di.mvals = dim;
    return di;
  }
  // TODO: Test the length of m0 cmp. w. m1+m2+... - if longer than sum, it's surrounding match
  function mvals_to_obj(mvals) {
    let mkeys = ["major","minor","patch"];
    if (!mvals || !Array.isArray(mvals) || (mvals.length < 1)) { console.log(`Warning: No mvals (for above d.i.`); return {}; }
    mvals = dclone(mvals);
    let obj = { ver: mvals[0] };
    mvals.shift();
    if (!mvals.length) { return obj; }
    // Remaining major, minor, patch
    //if (mvals.length == 3) {}
    for (let i = 0;mvals[i];i++) { obj[mkeys[i]] = mvals[i]; }
    return obj;
  }
  // Try to discover mount path (under /isomnt/)
  function mntpath(di, obj) {
    if (di.mntpatt) { obj.mntpath = Mustache.render(di.mntpatt, obj); return 1; }
    return 0;
  }
}
// Init bootables item so that predictable props are present
function bootables_init(cfg) {
  cfg.items.forEach( (di) => {
    if (!di.img_bn) { di.img_bn = path.basename(di.url); } // Populate bn
    // Attrs from regexp: if (!di.rekeys) { di.rekeys = cfg.rekeys; }
    // Embed regular expression by its type (sv2, ...) sv=Semantic version, 2=2 components
    if (di.url && di.url.match(/\{/) && di.url.match(/\}/)) {
      di.url = Mustache.render(di.url, cfg.matchers);
      console.log(`Embedded RE: ${di.url}`);
    }
    // Consider sv3 the standard method of versioning, for others 
  });
}
var ops = {
  "menu": {desc: "Generate Simple menu stub (w/o advanced append options)", cb: genmenu},
  "mount": {desc: "Generate loop-mount commands for ISO media)", cb: mount},
  "fstab" : {desc: "Generate fstab", cb: mount},
  
  "download": {desc: "Generate ISO media download commands)", cb: download},
  "validate_ki": {"desc":"Validate Mounted media kernel and initrd file presence", cb: validate_ki},
  "imglist" : {desc: "List Images from default image dir (e.g. /isoimages/)", cb: images_list},
};
function usage(msg) {
  var rc = 1;
  console.error("Error: " + msg);
  // Brief usage
  console.log("Available ops/subcommands:\n"+ Object.keys(ops).map( (k) => { return `- ${k} - ${ops[k].desc}`; }).join('\n'));
  process.exit(rc);
}


if (process.argv[1].match("bootmenuinit.js")) {
  // TODO: take httpserver, mountpath, imgpath from main config (unless overriden)!
  let mcfgfn = `${process.env.HOME}/.linetboot/global.conf.json`;
  mcfg = require(mcfgfn);
  if (!cfg) { usage("No bootables.json loaded\n"); }
  if (!cfg.items) { usage("No bootable items (cfg.items)\n"); }
  if (!mcfg) { usage(`No main fonfig (${mcfg}) loaded\n`); }
  cfg.items.forEach(function (it) {
    if (it.img_bn) { return; } // Already given explicitly as likely not extractable from URL
    it.img_bn = path.basename(it.url); // "foo-1.2";
  });
  var op = process.argv[2];
  if (!ops[op]) { usage("No op:" + op); }

  ops[op].cb();
  process.exit(0);
}
