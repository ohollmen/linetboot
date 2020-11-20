/** Ansible Runner
* Ways to control user identity / creds in Ansible:
- Ansible config file: DEFAULT_REMOTE_USER ()
- Playbook: remote_user
- Command line extra var: ansible_user

# Testing Playbooks Manually
```

```

*/
var crypto = require('crypto');
var hlr   = require("./hostloader.js");
var fs    = require('fs');
var Mustache = require("mustache");
var cproc = require("child_process");
var async = require("async");
var yaml  = require('js-yaml');
var path  = require('path');
// Ansible command template. (Mustache)
// ansible_sudo_pass={{{ pass }}} host={{{ host }}}
// \"{{{ xpara }}}\"
var anscmd = "ansible-playbook -i '{{{ hostsfile }}}' '{{{ pb }}}' --extra-vars '{{{ xpara }}}'";

// var .. = {}; /// Config holder

var pbprofs_def = {}; // {} (legacy) or  (new)

/**
* Set ansible path ...
*/
function init(acfg) {
  if (!acfg.pbprofs) { acfg.pbprofs = pbprofs_def; }
}

/** Run effective "which ansible" to see if we have ansible installed.
* 
*/
function ansible_detect(cb) {
  cproc.exec("which ansible", function (err, stdout, stderr) {
    if (err) { return cb("Failure finding ansible", null); }
    cb(null, stdout);
  });
}
/** Create temporary hostsfile created from hostnames passed and return its name.
 * File exists solely for the purpose
 * @param hnarr {array} - Hostname array
 * @param grpname {string} - Optional Groupname to assign hosts into.
*/
function hostsfile(hnarr, grpname) {
  if (!Array.isArray(hnarr)) { return null; }
  var cont = hnarr.join("\n");
  if (grpname) { cont = "["+grpname+"]\n" + cont; }
  cont += "\n";
  //var fn = "/tmp/"
  // https://stackoverflow.com/questions/7055061/nodejs-temporary-file-name
  var fn = '/tmp/hosts_'+crypto.randomBytes(4).readUInt32LE(0)+'.txt';
  fs.writeFileSync(fn, cont); // {encoding: 'utf8'}
  // fs.mkdtemp(prefix[, options], callback)
  // fs.mkdtempSync(prefix[, options])
  // Check if exists
  if (!fs.existsSync(fn)) { return null; }
  return fn;
}

/** Get a play profile from the config structure.
 * Pass profiles of config structure as the subsection "pbprofs" (array of objects).
 */
function prof_get(profs, k) {
   profs = profs || [];
   console.log("Profs said to be (of type): " + typeof profs);
   // if (typeof prof == 'object') { return prof[k]; }
   if (!Array.isArray(profs)) { console.log("profiles not stored in array !"); return null; }
   return profs.filter(function (it) { return it.lbl == k; })[0];
}

/** Resolve playbooks passed by basename to full playbook paths.
 * Only involves syncronous activity.
 * Must be called for both playbooks and playprofile to make sure paths are absolute.
 * Resolves final playbooks to run (on this ansible run-session) onto p.playbooks
 */
Runner.prototype.playbooks_resolve = function (acfg) {
  var p = this; // NEW !
  //if (!p) { console.log("playbooks_resolve: No params"); return 1; }
  var playbooks   = p.playbooks; // Individual Playbooks (complete name ?)
  var playprofile = p.playprofile;
  console.log("playbooks_resolve instance: ", p);
  // For now do not allow both
  if (playbooks && playprofile) { throw "playbooks vs playprofile is ambiguos. Only send one.";  } // jr.msg +=  return;
  if (!playbooks && !playprofile) { throw "Neither playbooks vs playprofile is given !"; }
  if (playprofile && !Array.isArray(acfg.pbprofs)) { // OLD: (!acfg.pbprofs) || (typeof acfg.pbprofs != 'object')
    console.log("pbprofs Type: "+ typeof acfg.pbprofs);
    console.log( "playbook profiles not found in config (member \"pbprofs\", must be Array). Profile:'"+playprofile+"'"); // throw
    
    return 2;
  } 
  // Lookup list of individual playbooks (from where ?)
  var pbarr = p.playbooks;
  //if (p.playprofile) {  } // Lookup playbooks belonging to a profile
  // Resolve playprofile to playbooks from profile
  if (p.playprofile) {
    var prof = prof_get(acfg.pbprofs, p.playprofile); // acfg.pbprofs[playprofile]; // OLD Simple lookup from *Object*
    if (!prof) { console.error("Could not find play profile by '"+p.playprofile+"' !"); return 3; }
    pbarr = prof.playbooks;
    if (pbarr && Array.isArray(pbarr)) { playbooks = pbarr; }
    else { console.error("Playbooks from profile '"+p.playprofile+"' could not be resolved"); return 3; }
  }
  // Ensure all playbooks are available
  var pbfullarr = [];
  playbooks.forEach(function (pb) {
    var pbfull = hlr.file_path_resolve(pb, acfg.pbpath);
    console.log("PB Resolved from '"+pb+"' to '"+pbfull+"' (by file_path_resolve())");
    // throw "At least one of the playbooks not available (in "+acfg.pbpath+").";
    // Strict or forgiving (all correct or skip incorrect) ?
    if (!pbfull) { console.error("Warning: Could not resolve book: "+pb); return 4; } // 
    pbfullarr.push(pbfull);
  });
  // Converted to full paths
  p.playbooks = pbfullarr;
  return 0;
};
/** Resolve individual hosts from groups passed.
 * If object does not have "hostgroups", we return immediately (w/o any resolving).
 * If this.hostgroups is said to be a "virtual group" `["all"]`, all hosts are gathered from groups.
 * TODO: Should go by Linetboot known hosts, as groups may not be defined. Where to get these ?
 */
Runner.prototype.hostgrps_resolve = function (grps) {
  var grpidx = {};
  if (!this.hostgroups) { return; }
  var gnames = this.hostgroups;
  if (!Array.isArray(gnames)) { throw "Ansible HostGroups not in an array !"; }
  if (!Array.isArray(grps)) { throw "Passed groupnames not in an array !"; }
  var hnames = [];
  function isarrayofstrings(grps) {
    var strcnt = grps.filter(function (gi) { return typeof gi == 'string'; }).length;
    if (grps.length == strcnt) { return 1; }
    return 0;
  }
  // Special case for "all" 
  if (gnames.length == 1 && gnames[0] == 'all' && isarrayofstrings(grps)) {
    // Collect from groups structure ?
    
    grps.forEach(function (g) {
      // var ghosts = g.hosts.map((h) => { return h.hname; });
      hnames = hnames.concat(g.hostnames);
    });
    return hnames;
  }
  
  grps.forEach(function (g) {
    //g.id;
    if (gnames.includes(g.id)) { hnames = hnames.concat(g.hostnames); }
  });
  // For now set exlusively
  if (this.hostnames && this.hostnames.length) { console.log("Warning: Overwriting existing hosts from groups !!!");}
  this.hostnames = hnames;
  return hnames;
};

/** Run set of ansible playbooks on hosts by passed hostnames.
* Note that runs are done based on "raw" parameters:
* - hostnames - Raw Hostnames
* - playbooks - Individual playbooks
* - playprofile - Playbook run profile with 
* These MUST be resolved by **ans.playbooks_resolve()**.
* 
* # OLD
* - NOT: pbprofs (optional) - Playbook profiles
* 
* TODO: *real* Object
*/
Runner.prototype.ansible_run = function (xpara) { // 
  p = this;
  p.debug && console.log("ansible_run: instance params: " + JSON.stringify(p, null, 2));
  // Validate hostnames against which ones we know through facts (hostcache).
  if (!p.hostnames) { throw "No hostnames passed (groups should be resolved to hostnames)"; }
  if (!p.playbooks) { throw "No playbooks passed / resolved (from profiles)"; }
  // TODO:
  // - Possibly retain host inventory params ? See below:
  // - Use original "hosts" file, refine the host selector: --limit ... (-l)
  var prun = { hostsfile: null, }; // CLI Run parameters -i ...
  var fn; // Temp file !
  if (p.invfn && fs.existsSync(p.invfn)) {
    prun.hostsfile = p.invfn;
    p.xpara.host = prun.limit = p.hostnames.join(','); // NEW !
  }
  else {
    var defgrpname = "myhosts"; // Local Temp group name
    fn = hostsfile(p.hostnames, defgrpname); // Temporary !
    p.xpara.host = defgrpname; // Set late but outside / before set_xpara()
    prun.hostsfile = fn;
    console.log("Wrote ("+p.hostnames.length+") hosts for playbook run to temp file: '" + fn + "'");
  }
  // Serialize Object contained params as string for --extra-vars (-e)
  function xpara_ser(xps) {
    // Must be Object, not Array
    var xparr = Object.keys(xps).map(function (k) { return k+"="+xps[k]; });
    return xparr.join(" ");
  }
  // Start running playbooks (TODO: async)
  //OLD: var prun = { XXhostsfile: fn, XXXhost: grpname, XXXpass: p.pass, xpara: ""}; // NOT directly: global.hostsfile
  
  
  console.log("xpara (before overrides)", p.xpara);
  // Extra parameters for the -e / --extra-vars. Also consider @filename.json
  // Add extra params from prun to p.xpara object and Serialize params into string member of prun at end (by mkxpara())
  function xpara_add(xpara) { // Instance method (OLD: prun)
    // By default we have already set defaults (in p.xpara) for ansible_sudo_pass, host, these may still be overriden by xpara (if passed)
  
    //OLD:if (xpara) { prun.xpara = mkxpara(xpara); }
    //OLD:else if (p.xpara) { prun.xpara = mkxpara(p.xpara); }
    if (!xpara) { return; }
      Object.keys(xpara).forEach(function (k) {
        if (xpara[k]) { p.xpara[k] = xpara[k]; }
      });
  }
  xpara_add(xpara); // prun
  // Serialize to prun at the very end
  prun.xpara = xpara_ser(p.xpara);
  console.log("xpara (after overrides)", p.xpara);
  console.log("Command tmpl params: ", prun);
  var fullcmds = [];
  // Formulate full commands
  p.playbooks.forEach(function (pbfull) {
    prun.pb = pbfull; // Set Current playbook (of possibly many)
    cont = Mustache.render(anscmd, prun);
    (p.debug > 1) && console.log("CMD:" + cont);
    fullcmds.push(cont);
  });
  console.log("Generated ("+fullcmds.length+") ansible-playbook commands: \n"+ JSON.stringify(fullcmds, null, 2));
  /*
  function runexec(cmd, cb) {
    console.log("Start runexec by calling cproc.exec");
    cproc.exec(cmd, function (err, stdout, stderr) {
      if (err) { return cb(err, null); }
      console.log("cproc.exec success !");
      cb(null, 69); // stdout, stderr
    });
  }
  */
  // Async Completion
  function oncomplete (err, results) {
    
    p.debug && console.log("Got ansible completion results: err:"+err+", res:"+ results);
    var time_e = new Date(); // Math.floor(new Date() / 1000);
    var runinfo = {"event": "anscomplete", "time_e": time_e/1000, "time_s": time_s/1000, time_d: (time_e-time_s)/1000, runstyle: execstyle, numplays: fullcmds.length };
    console.log(runinfo);
    
    // Remove temp hosts file (fs.statSync(fn))
    if (fs && !p.debug) { fs.unlinkSync(fn); }
    // TODO: Notify ?
    //if (p.ee) { p.ee.emit("ansplaycompl", runinfo); }
  }
  //var fullcmds2 = ["ls playbooks", "ls doc", ];
  var time_s = new Date(); // Math.floor(new Date() / 1000)
  var execstyle = p.runstyle || "parallel";
  console.log("Starting to run ("+p.playbooks.length+") playbooks in mode: " + execstyle);
  // TODO: See if we can capture output
  var processor = cproc.exec;
  //var processor = runexec;
  if (execstyle == 'parallel') {
    console.log("Parallel: ...");
    async.map(fullcmds, processor, oncomplete);
  }
  else {
    console.log("Series: ...");
    async.eachSeries(fullcmds, processor, oncomplete);
  }
  return;
};
/** Consruct Ansible runner
* 
* @param cfg {object} - Context specific config
* @param acfg {object} - Application (global/context independent) ansible config
*/
function Runner(cfg, acfg) {
  var attrs = ["hostnames", "hostgroups", "playbooks",  "playprofile", "runstyle"]; // , "debug"
  if (!acfg) { acfg = {}; }
  this.hostnames = cfg.hostnames;
  this.hostgroups = cfg.hostgroups;
  this.playbooks = cfg.playbooks;
  
  this.playprofile = cfg.playprofile;
  this.runstyle = cfg.runstyle;
  
  this.xpara = cfg.xpara || {};
  ////// OLD: || process.env["ANSIBLE_PASS"]
  this.xpara.ansible_user = acfg.user;
  this.xpara.ansible_become_password = acfg.pass;
  // OLD: || process.env["LINETBOOT_ANSIBLE_DEBUG"]
  this.debug = cfg.debug || acfg.debug || 0;
  this.debug = parseInt(this.debug);
  this.invfn = cfg.invfn || acfg.invfn || "";
  // Keep acfg in instance ?
  // this.acfg = acfg;
}
//Runner.prototype.ansible_run = ansible_run;
//Runner.prototype.playbooks_resolve = playbooks_resolve;
//Runner.prototype.hostgrps_resolve = hostgrps_resolve;
/** List Ansible playbooks in pbpath.
*
*/
function ansible_play_list(acfg, pbpath) { // dirname
  // List dir(s)
  var arr = [];
  if (!pbpath) { console.error("NO pbpath");return;}
  var dirnames = pbpath.split(":"); // global.pbpath
  console.log("Look for playbooks from: ", dirnames);
  var fnodes = [];
  dirnames.forEach(function (dirname) {
    var arr = fs.readdirSync(dirname);
    // https://stackoverflow.com/questions/190852/how-can-i-get-file-extensions-with-javascript
    // Check suffix "yml" or ""yaml"
    
    arr.forEach(function (fname) { // filter ?
      
      var suff = fname.slice((Math.max(0, fname.lastIndexOf(".")) || Infinity) + 1);
      console.log("Encountered: "+fname+ " suff:" + suff);
      if ((suff != "yml") && (suff != "yaml")) { return 0; }
      console.log("Got:" + suff);
      //path.basename(); // Already basenames
      var relname = dirname + "/" + fname;
      var node = { basename: fname, relname: relname };
      // TODO: Catch exception an bypass faulty yaml
      var yf;
      try { yf = yaml.safeLoad(fs.readFileSync(relname, 'utf8')); } catch (ex) {}
      if (!yf) { console.log("Failed to load: "+relname); return; }
      //console.log(JSON.stringify(yf, null, 2));
      // TODO: Checks here !
      // Lookup Playbook name ?
      node.playname = yf[0].name; // title ?
      if (!node.playname) { node.playname = "Unnamed (" + fname + ")"; }
      // Store tasks ?
      fnodes.push(node);
    });
  }); // dirnames.forEach
  return fnodes;
}
/** List profiles in AoO format */
function ansible_prof_list(acfg, foo) {
  if (!acfg.pbprofs) { console.error("Warning: No ansible profiles"); return []; }
  var dtype = Array.isArray(acfg.pbprofs) ? 'arr' : 'obj';
  if (dtype != 'arr') { console.error("Ansible play profiles not in array"); return null; }
  //if (dtype == 'obj') {
  //  var keys = Object.keys(acfg.pbprofs); // Legacy format
  //  return keys.map(function (it) { return {value: it, name: it}; }); // Keys twice
  //}
  //else if (dtype == 'arr') {
    return acfg.pbprofs.map(function (it) { return {value: it.lbl, name: it.name + " ("+it.playbooks.length+")"}; });
  //}
  //return null;
}
module.exports = {
  init: init,
  ansible_detect: ansible_detect,
  hostsfile: hostsfile,
  //playbooks_resolve: playbooks_resolve,
  // ansible_run: ansible_run,
  testpara: { playbooks: ["a.yaml", "b.yaml"], hostnames: ["host1","host2"] },
  Runner: Runner,
  ansible_play_list: ansible_play_list,
  ansible_prof_list: ansible_prof_list
};
