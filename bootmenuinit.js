#!/usr/bin/node
// Boot media helper.
// Implements (command generation for ...):
// - ISO Media Download
// - ISO Media mounting
// - Menu initializer

var Mustache = require("mustache");
var path = require('path');
var fs = require('fs');
var cfg = require("./bootables.json");
if (!cfg) { error_exit("No bootables.json loaded\n"); }
if (!cfg.items) { error_exit("No bootable items (cfg.items)\n"); }
var op = process.argv[2];

var ops = {
  "menu": genmenu, // {desc: "Generate Simple menu stub (w/o advanced append options)", cb: genmenu},
  "mount": mount, // {desc: "Generate loop-mount commands for ISO media)", cb: mount},
  "fstab" : mount, // 
  "download": download, // {desc: "Generate ISO media download commands)", cb: download},
  "validate_ki": validate_ki, // {"desc":"Validate Mounted media kernel and initrd file presence", cb: validate}
};
cfg.items.forEach(function (it) {
  if (it.img_bn) { return; } // Already given explicitly as likely not extractable from URL
  it.img_bn = path.basename(it.url); // "foo-1.2";
});
if (!ops[op]) { error_exit("No op:" + op); }

ops[op]();
process.exit(0);
// Validate kernel / boot items
function validate_ki () {
  var attrs = ["kernel","initrd"];
  for (var i in cfg.items) {
    var it = cfg.items[i];
    var absname_k = cfg.mountpath + "/" + it.lbl + "/" + it.kernel;
    var absname_i = cfg.mountpath + "/" + it.lbl + "/" + it.initrd;
    var stat = {"kernel": "OK", "initrd":"OK"};
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

function error_exit(msg) {
  var rc = 1;
  console.error("menuinit Error: " + msg);
  // Brief usage
  console.log("Available ops: "+ Object.keys(ops).join(', ') + ".");
  process.exit(rc);
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
    //if () {}
    // -O path.basen
    cont += Mustache.render(tmpl, it);
  }
  console.log(cont);
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
    else { cont += an + " "+cfg.mountpath+"/"+it.lbl+" iso9660 loop 0 0\n"; }
  }
  console.log(cont);
}
