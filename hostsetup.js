/** Installer for LinetBoot.
* Starts with hosts file prefilled.
* TODO: Utilize prompting module (prompt)
*/
var hlr = require("./hostloader.js");
var ans = require("./ansiblerun.js");
var netprobe = require("./netprobe.js");
var async = require("async");
var fs = require("fs");
var path = require("path");
var home = process.env["HOME"];
var cfg = {
  fact_path: home + "/hostinfo", // global
  hostsfile: home + "/.linetboot/hosts",
  debug: 0,
  hostcache: {}, hostarr: [] // 
};
var em = {
  "crhosts":"Create Hosts file (one hostname per line) first in and run installer again."
};
if (!fs.existsSync(cfg.hostsfile)) { console.error("No Hosts file found in:"+cfg.hostsfile+". "+em.crhosts); process.exit(1); }
hlr.init(cfg); // {fact_path: home + "/hostinfo"}
var hostnames = hlr.hosts_load(cfg, cfg); // {hostsfile: home + "/.linetboot/hosts"}
// Access loaded things
console.log("Host names:" + JSON.stringify(cfg.hostnames, null, 2));
console.log("Num Host items:" + hostnames.length);
console.log("Host params:\n"+ JSON.stringify(cfg.hostparams, null, 2));
// Ping hosts ? extract facts ?
netprobe.probe_all(cfg.hostarr, "net", function (err, results) {
    if (err) { console.log(err); process.exit(); } // usage("Failed net probing: "+ err);
    //res.json({status: "ok", data: results});
    // Detect ansible
    
    console.log("Probe ok. Run subcommand facts ...");
  });
// Require all to ping and be accessible by SSH. Request to comment all the non working hosts out.
// For help generate ssh-copy-id commands
process.exit(0);

function factgather() {
  // Detect ansible
  
  // Load facts ?
  hlr.facts_load_all();

}

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

// Load facts (Ansible)
     
// Load package listings (APT/YUM ... into hostpkginfo dir)
// TODO: Use command generator and async

// Load remote management info (assume ipmitool on remote hosts - Ansible)

function usage(msg) {
  if (msg) { console.error(msg);  }
  var bn = path.basename(process.argv[1]);
  console.log("Usage "+bn + " op (Available ops: ...)");
  
  process.exit(1);
}
