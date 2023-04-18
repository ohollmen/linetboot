#!/usr/local/bin/node
// Ansible Dynamic inventory and Gcloud dump related functionality.
// Example of dumping ansible inventory JSON (in an env. where dyn inv. is configured):
// ```
// ansible-inventory --list > ~/.linetboot/ansible_di.dev.json
// ```
// Change main config gcp.dyninvfn to reflect the inventory json location (path may contain ~)
// Gathering facts (also given in install guide)
// 

var path = require("path");
var fs   = require("fs");
var maincfg   = require("./mainconf.js");
function init() {

}

// @return Dynamic inventory JSON or null for no 
function ansdi_load(fn) {
  if (!fs.existsSync(fn)) { console.log(`dynamic inv. (${fn}) does not exist`);  return null; }
  var di = require(fn);
  if (!di) { console.error("Dynamic inventory cound not be loaded (check JSON)");  return null; }
  // Access hosts ??? No just return whole inventory
  return di;
}

function ansdi_hosts(di, asarr) {
  var h;
  try { h = di._meta.hostvars; }
  catch (ex) { console.error("Could not resolve hosts branch in dynamic inventory !"); return null; }
  // Transform hosts into AoO ?
  if (asarr) {
    var arr = Object.keys(h).map((k) => {
      h[k].machineName = k;
      return h[k];
    });
    return arr;
  }
  return h;
}

if (path.basename(process.argv[1]).match(/ansdi.js$/)) {
  var cfgbase = process.env.HOME+"/.linetboot/";
  var ansdifn = "";
  // var fns = process.env.HOME+"/.linetboot/";
  if (process.argv[2]) { ansdifn = process.argv[2]; }
  else {
    var mcfg = maincfg.mainconf_load(cfgbase+"/global.conf.json");  //require(cfgbase+"/global.conf.json");
    if (!mcfg) { console.log("No main config loaded"); process.exit(1); }
    //console.log(mcfg);
    maincfg.mainconf_process(mcfg); // e.g. tilde expand
    ansdifn = mcfg.gcp.dyninvfn;
    console.error(ansdifn);
  }
  // Load Inventory
  var di = ansdi_load(ansdifn);
  if (!di) { console.error(`Inventory JSON (${ansdifn}) not loaded`); process.exit(1); }
  //console.log(di);  
  var hosts = ansdi_hosts(di, true);
  //console.log(hosts);
  hosts.forEach((h) => { console.log(h.machineName); })
  //console.error("Done");
}

module.exports = {

};
