/**
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
var anscmd = "ansible-playbook -i '{{{ hostsfile }}}'  '{{{ pb }}}' --extra-vars \"ansible_sudo_pass={{{ sudopass }}} host={{{ host }}}\"";

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
/** Create temporary hostsfile and return its name.
 * @param hnarr {array} - Hostname array
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
/** Resolve playbooks passed by basename to full playbook paths.
* Must be called for both playbooks and playprofile to make sure paths are absolute.
*/
function playbooks_resolve(acfg, p) {
  if (!p) { console.log("playbooks_resolve: No params"); return 1; }
  var playbooks   = p.playbooks; // Individual Playbooks (complete name ?)
  var playprofile = p.playprofile;
  console.log("playbooks_resolve p: ", p);
  // For now do not allow both
  if (playbooks && playprofile) { throw "playbooks vs playprofile is ambiguos. Only send one.";  } // jr.msg +=  return;
  if (!playbooks && !playprofile) { throw "Neither playbooks vs playprofile is given !"; }
  if (playprofile && !Array.isArray(acfg.pbprofs)) { // OLD: (!acfg.pbprofs) || (typeof acfg.pbprofs != 'object')
    console.log( "playbook profiles not found in config (member \"pbprofs\", must be Array). Profile:'"+playprofile+"'"); // throw
    console.log("pbprofs Type: "+ typeof acfg.pbprofs);
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
    // throw "At least one of the playbooks not available (in "+acfg.pbpath+").";
    // Strict or forgiving (all correct or skip incorrect) ?
    if (!pbfull) { console.error("Warning: Could not resolve book: "+pb); return 4; } // 
    pbfullarr.push(pbfull);
  });
  // Converted to full paths
  p.playbooks = pbfullarr;
  return 0;
}
/** Get a play profile */
function prof_get(prof, k) {
   prof = prof || [];
   console.log("Prof said to be: " + typeof prof);
   // if (typeof prof == 'object') { return prof[k]; }
   if (!Array.isArray(prof)) { console.log("profiles not stored in array !"); return null; }
   return prof.filter(function (it) { return it.lbl == k; })[0];
}
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
function ansible_run() {
  p = this;
  p.debug && console.log("ansible_run: params: " + JSON.stringify(p, null, 2));
  // Validate hostnames against which ones we know through facts (hostcache).
  // var hostnames = p.hostnames; // hnames ?
  if (!p.hostnames) { throw "No hostnames passed"; }
  if (!p.playbooks) { throw "No playbooks passed / resolved (from profiles)"; }
  // 
  var grpname = "myhosts"; // Local Temp group name
  var fn = hostsfile(p.hostnames, grpname); // Temporary !
  console.log("Wrote ("+p.hostnames.length+") hosts for playbook run to temp file: '" + fn + "'");
  
  // Start running playbooks (TODO: async)
  var prun = { hostsfile: fn, host: grpname, sudopass: p.sudopass }; // NOT directly: global.hostsfile
  var fullcmds = [];
  // Formulate full commands
  p.playbooks.forEach(function (pbfull) {
    prun.pb = pbfull; // Current playbook
    cont = Mustache.render(anscmd, prun);
    (p.debug > 1) && console.log("CMD:" + cont);
    fullcmds.push(cont);
  });
  console.log("Generated ("+fullcmds.length+") ansible-playbook commands: \n", fullcmds);
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
    if (!p.debug) { fs.unlinkSync(fn); }
    // TODO: Notify ?
    //if (p.ee) { p.ee.emit("ansplaycompl", runinfo); }
  }
  //var fullcmds2 = ["ls playbooks", "ls doc", ];
  var time_s = new Date(); // Math.floor(new Date() / 1000)
  var execstyle = p.runstyle || "parallel";
  console.log("Starting to run playbooks in mode: " + execstyle);
  var processor = cproc.exec;
  //var processor = runexec;
  if (execstyle == 'parallel') {
    console.log("Parallel: ...");
    async.map(fullcmds, processor, oncomplete);
  }
  else {
    console.log("SERIES: ...");
    async.eachSeries(fullcmds, processor, oncomplete);
  }
  return;
}

function Runner(cfg, acfg) {
  this.hostnames = cfg.hostnames;
  this.playbooks = cfg.playbooks;
  this.playprofile = cfg.playprofile;
  this.runstyle = cfg.runstyle;
  this.sudopass = acfg.sudopass || process.env["ANSIBLE_PASS"];
  this.debug = acfg.debug || process.env["LINETBOOT_ANSIBLE_DEBUG"] || 0;
  this.debug = parseInt(this.debug);
}
Runner.prototype.ansible_run = ansible_run;
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
      
      var yf = yaml.safeLoad(fs.readFileSync(relname, 'utf8'));
      if (!yf) { return; }
      //console.log(JSON.stringify(yf, null, 2));
      // TODO: Checks here !
      // Lookup Playbook name ?
      node.playname = yf[0].name; // title ?
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
  return null;
}
module.exports = {
  init: init,
  ansible_detect: ansible_detect,
  hostsfile: hostsfile,
  playbooks_resolve: playbooks_resolve,
  ansible_run: ansible_run,
  testpara: { playbooks: ["a.yaml", "b.yaml"], hostnames: ["host1","host2"] },
  Runner: Runner,
  ansible_play_list: ansible_play_list,
  ansible_prof_list: ansible_prof_list
};