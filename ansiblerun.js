/** @file
 * 
* Ansible Runner
* Ways to control user identity / creds in Ansible:
- Ansible config file: DEFAULT_REMOTE_USER ()
- Playbook: remote_user
- Command line extra var: ansible_user

# Testing Playbooks Manually
```
ansible-playbook -i ... book.yaml -e "..."
```
References:
* - Google: ansible host selector
* - https://docs.ansible.com/ansible/latest/user_guide/intro_patterns.html
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
// Serialize xpara (key-val pairs) in first pass, feed here.
// var anscmds = { // "pb", "setup"
var anspbcmd = "ansible-playbook -i '{{{ hostsfile }}}' '{{{ pb }}}' -l {{{ hostselstr }}} -e '{{{ xparastr }}}'";
// hostselstr hostsfile modname factpath xparastr
var anscmd = "ansible {{{ hostselstr }}} -i {{{ hostsfile }}} -m {{{ modname }}} -b --tree {{{ factpath }}} -e '{{{ xparastr }}}'";
//};
var pbprofs_def = {}; // {} (legacy) or  (new)
//var acfg;
/**
* Set ansible path ...
* @todo: Store config as module global
*/
function init(acfg) {
  if (!acfg.pbprofs) { acfg.pbprofs = pbprofs_def; }
  //acfg = acfg_pass; // Module-Global acfg ?
}

/** Run effective "which ansible" to see if we have ansible installed.
* 
*/
function ansible_detect(cb) {
  cproc.exec("which ansible", function (err, stdout, stderr) {
    if (err) { return cb("Failure finding ansible", null); }
    // Trim ?
    cb(null, stdout);
  });
}
/** Create temporary hostsfile created from hostnames passed and return its name.
 * File exists solely for the purpose of running the a playbook session.
 * @param hnarr {array} - Hostname array
 * @param grpname {string} - Optional Groupname to assign hosts into.
*/
/*
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
*/

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
 * Only involves syncronous activity. Throws exceptions on errors, which caller should catch.
 * Must be called for both playbooks and playprofile to make sure paths are absolute.
 * Resolves final playbooks to run (on this ansible run-session) onto p.playbooks.
 * All playbooks (whether coming from playprofile or playbooks) MUST be resolvable.
 * @return 0 on clean resolution, 1 and up for errors
 * @todo Resolve duality between error return and exception throwing (but works as it is now though)
 */
Runner.prototype.playbooks_resolve = function (acfg) {
  var p = this; // NEW !
  //if (!p) { console.log("playbooks_resolve: No params"); return 1; }
  var playbooks   = p.playbooks; // Individual Playbooks (complete name ?)
  var playprofile = p.playprofile;
  console.log("playbooks_resolve: instance: ", p);
  // For now do not allow both
  if (playbooks && playprofile)   { throw "playbooks vs playprofile is ambiguos. Only send one.";  } // jr.msg +=  return;
  if (!playbooks && !playprofile) { throw "Neither playbooks vs playprofile is given !"; }
  // Play profile
  if (playprofile && !Array.isArray(acfg.pbprofs)) { // OLD: (!acfg.pbprofs) || (typeof acfg.pbprofs != 'object')
    console.log("pbprofs Type: "+ typeof acfg.pbprofs);
    throw "playbook profiles not found in config (member \"pbprofs\", must be Array). Profile:'"+playprofile+"'"; // throw
    
    // return 2;
  } 
  // Lookup list of individual playbooks (from where ?)
  var pbarr = p.playbooks;
  //if (p.playprofile) {  } // Lookup playbooks belonging to a profile
  // Resolve playprofile to (local) playbooks from profile
  if (p.playprofile) {
    var prof = prof_get(acfg.pbprofs, p.playprofile); // acfg.pbprofs[playprofile]; // OLD Simple lookup from *Object*
    if (!prof) { throw "Could not find play profile by '"+p.playprofile+"' !";  } // return 3;
    pbarr = prof.playbooks;
    if (pbarr && Array.isArray(pbarr)) { playbooks = pbarr; }
    else { throw "Playbooks from profile '"+p.playprofile+"' could not be resolved";  } // return 3;
  }
  // Ensure all playbooks are available. We mandate all playbooks to be resolvable.
  var pbfullarr = [];
  playbooks.forEach(function (pb) {
    var pbfull = hlr.file_path_resolve(pb, acfg.pbpath);
    // throw "At least one of the playbooks not available (in "+acfg.pbpath+").";
    // Strict or forgiving (all correct or skip incorrect) ?
    if (!pbfull) { throw "Warning: Could not resolve book: "+pb;  } // return 4;
    console.log("PB Resolved from '"+pb+"' to '"+pbfull+"' (by file_path_resolve())");
    pbfullarr.push(pbfull);
  });
  // Converted to full paths in pbfullarr
  p.playbooks = pbfullarr;
  return 0;
};
/** Resolve individual hosts from groups passed.
 * If object does not have "hostgroups", we return immediately (w/o any resolving).
 * If this.hostgroups is said to be a "virtual group" `["all"]`, all hosts are gathered from groups.
 * TODO: Should go by Linetboot known hosts, as groups may not be defined. Where to get these ?
 * @param grps {array} - Array of group names
 * @return hostnames
 */
/*
Runner.prototype.hostgrps_resolve = function (grps) {
  var grpidx = {};
  if (!this.hostgroups) { return; }
  var gnames = this.hostgroups;
  if (!Array.isArray(gnames)) { throw "Ansible HostGroups not in an array !"; }
  if (!Array.isArray(grps))   { throw "Passed groupnames not in an array !"; }
  var hnames = [];
  var gmap = hlr.groupmemmap();
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
      //hnames = hnames.concat(g.hostnames); // Legacy pattern ...
      //hnames.push(g);  // Group to hostnames
      hnames =  hnames.concat(gmap[g]);
    });
    this.hostnames = hnames; // Need this (like below)
    return hnames;
  }
  console.log("Normal case ...");
  grps.forEach(function (g) {
    // Legacy pattern based groups
    //if (gnames.includes(g.id)) { hnames = hnames.concat(g.hostnames); }
    console.log("Check: "+ g);
    //if (gnames.includes(g)) { console.log(" - Add:"+g); hnames.push(g); } // Group to hostnames
    if (gnames.includes(g)) { console.log(" - Add:"+g); hnames =  hnames.concat(gmap[g]); }
  });
  // For now set exlusively
  if (this.hostnames && this.hostnames.length) { console.log("Warning: Overwriting existing hosts from groups !!!");}
  this.hostnames = hnames;
  return hnames;
};
*/

/** Generate host selector combining the instance contained hosts and groups.
 * Create a string compatible with:
 * - ansible (first positional arg)
 * - ansible-playbook --limit
 * - ansible playbook YAM "hosts"
 * - https://docs.ansible.com/ansible/latest/user_guide/intro_patterns.html
 * Set this.hostselstr in instance and also return it.
 * @return Host selector string
*/
Runner.prototype.hostselector = function () { // opts
  var sel = [];
  this.hostselstr = sel.concat(this.hostnames || []).concat(this.hostgroups || []).join(','); // or :
  return this.hostselstr;
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
Runner.prototype.ansible_run = function (xpara) { // 
  p = this;
  p.debug && console.log("RUN: instance params: " + JSON.stringify(p, null, 2));
  // Validate hostnames against which ones we know through facts (hostcache).
  if (!p.hostnames) { throw "No 'hostnames' passed (groups should be resolved to hostnames)"; }
  if (!p.playbooks) { throw "No 'playbooks' passed / resolved (from profiles)"; }
  if (!p.invfn)     { throw "No inventory file ('invfn') given";}
  if (!fs.existsSync(p.invfn)) { throw "inventory file does not exist !"; }
  // var fn; // Temp file !
  // DEPRECATED tmp-inventory
  /*
  else {
    var defgrpname = "myhosts"; // Local Temp group name
    fn = hostsfile(p.hostnames, defgrpname); // Temporary !
    p.xpara.host = defgrpname; // Set late but outside / before set_xpara()
    prun.hostsfile = fn;
    console.log("Wrote ("+p.hostnames.length+") hosts for playbook run to temp file: '" + fn + "'");
  }
  */
  
  // XPARA
  // Proprietary convention - pass in xpara ?
  // p.xpara.host = p.hostselstr; // prun.limit = p.hostnames.join(','); // NEW ! Deprecate from here ?
  console.log("xpara (before overrides)", this.xpara);
  console.log("xpara overrides", xpara);
  if (xpara) { this.xpara_add(xpara); }
  // Serialize to prun at the very end
  var prun = { hostsfile: null, }; // CLI Run parameters -i ...
  prun.hostsfile = p.invfn;
  prun.xparastr = Runner.xpara_ser(p.xpara);
  prun.hostselstr = p.hostselector();
  console.log("xpara (after overrides)", p.xpara);
  console.log("Command tmpl params: ", prun);
  var fullcmds = [];
  // Formulate full commands
  p.playbooks.forEach(function (pbfull) {
    prun.pb = pbfull; // Set Current playbook (of possibly many)
    var cont = Mustache.render(anspbcmd, prun);
    (p.debug > 1) && console.log("CMD:" + cont);
    fullcmds.push(cont);
  });
  console.log("Generated ("+fullcmds.length+") ansible-playbook commands: \n"+ JSON.stringify(fullcmds, null, 2));
  
  
  // Async Completion CB
  function oncomplete (err, results) {
    
    p.debug && console.log("Got ansible completion results: err:"+err+", res:"+ results);
    var time_e = new Date(); // Math.floor(new Date() / 1000);
    var runinfo = {"event": "anscomplete", "time_e": time_e/1000, "time_s": time_s/1000, "time_d": (time_e-time_s)/1000,
      runstyle: execstyle, numplays: fullcmds.length, runid: p.runid };
    console.log(runinfo);
    Runner.compfname(p.runid, runinfo);
    // Remove temp hosts file (fs.statSync(fn))
    // if (fn && !p.debug) { fs.unlinkSync(fn); } // tmp inventory
    // TODO: Notify Client ? Mark runner.runid done
    //if (p.ee) { p.ee.emit("ansplaycompl", runinfo); }
  }
  //var fullcmds2 = ["ls playbooks", "ls doc", ];
  var time_s = new Date(); // Math.floor(new Date() / 1000)
  var execstyle = p.runstyle || "parallel";
  console.log("Starting to run ("+p.playbooks.length+") playbooks in mode: " + execstyle);
  // TODO: See if we can capture output
  var processor = cproc.exec;
  //var processor = runexec; // TODO (More granular)
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
/** Completion ack filename */
Runner.compfname = function (runid, data) {
  var fname = "/tmp/ack_"+runid+".json";
  if (data) { fs.writeFileSync(fname, JSON.stringify(data, null, 2) , {encoding: "utf8"} ); }
  return fname;
}

// Extra parameters for the -e / --extra-vars. Also consider -e @filename.json
/** Add extra params from current run context to ansiblerunner before executing playbook.
 * Add params to `this.xpara` object.
 */
Runner.prototype.xpara_add =  function (xpara) { // Instance method (OLD: prun)
    // By default we have already set defaults (in p.xpara) for ansible_sudo_pass, host, these may still be overriden by xpara (if passed)
  
    //OLD:if (xpara) { prun.xpara = mkxpara(xpara); }
    //OLD:else if (p.xpara) { prun.xpara = mkxpara(p.xpara); }
    if (!xpara) { return; } // Nothing to add
    this.xpara = this.xpara || {};
    if (typeof this.xpara != 'object') { console.log("xpara not object, is: "+typeof this.xpara); return; }
    console.log("xpara_add: this.xpara: ", this.xpara);
    Object.keys(xpara).forEach(function (k) {
      console.log("Add "+ k + " val: "+ xpara[k]);
      if (xpara[k]) { this.xpara[k] = xpara[k]; } // !== undefined
    }, this);
  }
/** Serialize Object contained params as string for --extra-vars (-e).
* @return Serialized parameters as (JSON) string.
*/
Runner.xpara_ser = function (xps) {
  // Must be Object, not Array
  //var xparr = Object.keys(xps).map(function (k) { return k+"="+xps[k]; });
  //return xparr.join(" ");
  return JSON.stringify(xps); // JSON. Must single-quote or save to file on caller side
}

/** Wrap running cproc.exec() for any ansible command.
 * Write log of stdout to a file (under /tmp)
 * @param cmd {string} - Ansible command
 * @param cb {function} - Callback to call with stats info data
 * @todo pass config, attach handlers 
 * @todo Make into instance method ? Runner.prototype.runexec = 
 * @todo Embed timing stats here (single op/ single playbook)
*/
  function runexec(cmd, cb) {
    console.log("Start runexec by calling cproc.exec");
    cproc.exec(cmd, function (err, stdout, stderr) {
      if (err) { return cb(err, null); }
      var anslogfile_o = "/tmp/ans_log_"+new Date().toISOString()+".stdout.txt";
      // var anslogfile_e = "/tmp/ans_log_"+new Date().toISOString()+".stderr.txt"; // Always 0 (?)
      // TODO: Catch
      try {
        fs.writeFileSync( anslogfile_o, stdout, {encoding: "utf8"} );
        // fs.writeFileSync( anslogfile_e, stderr, {encoding: "utf8"} );
      } catch (ex) { console.log("Error creating Ansible stdout  log !"); return cb(ex, null); } // (stderr?)
      console.log("Ansible cproc.exec success !");
      var data = {cmd: cmd, logfile: anslogfile_o, runstatus: "ok", };
      cb(null, data); // {stdout: stdout, stderr: stderr}
    });
  }
/** Gather facts with host/group scope given in instance.
 * @param cb {function} - callback to call (with err, data) after async running of gathering.
 * @return none (call cb and pass results to it)
 */
Runner.prototype.fact_gather = function (cb) {
  if (!cb) { console.log("fact_gather: cb missing !"); return; }
  // hostselstr hostsfile modname factpath xparastr
  var prun = { hostsfile: this.invfn, modname: "setup", };
  // Create --tree path
  prun.hostselstr = this.hostselector();
  prun.xparastr = Runner.xpara_ser(this.xpara);
  prun.factpath = '/tmp/facts_'+crypto.randomBytes(4).readUInt32LE(0)+"_"+Date.now();
  this.factpath = prun.factpath; // Add to this (instance)
  try {
    fs.mkdirSync(prun.factpath); // ,'0777', true   ,{recursive: true}
  } catch (ex) { console.log("Failed to create tree for facts !"); return cb(ex, null); }
  var cmd = Mustache.render(anscmd, prun);
  runexec(cmd, (err, data) => {
    var puberr;
    if (err) { puberr = "Some Errors in fact_gather !"; console.log("ERROR: "+err); data = null; }
    console.log("Facts gather completed for '"+prun.hostselstr+"'. results in: '"+prun.factpath+"' !");
    if (data) { data.runid = this.runid; }
    return cb(puberr, data);
    // TODO: Similar to playbook running
    //var runinfo = {"event": "anscomplete", "time_e": time_e/1000, "time_s": time_s/1000, time_d: (time_e-time_s)/1000,
    //  runstyle: execstyle, numplays: fullcmds.length, runid: p.runid };
  });
}

/** Construct Ansible runner.
* 
* @param cfg {object} - Run-Context specific config (not global, with: hostnames,hostgroups,playbooks,playprofile, ...)
* @param acfg {object} - Application (global/context independent) ansible config
* @return Object instance
*/
function Runner(cfg, acfg) {
  var attrs = ["hostnames", "hostgroups", "playbooks",  "playprofile", "runstyle"]; // , "debug"
  if (!acfg) { acfg = {}; }
  this.hostnames = cfg.hostnames;
  this.hostgroups = cfg.hostgroups;
  this.playbooks = cfg.playbooks;
  this.playprofile = cfg.playprofile;
  this.runstyle = cfg.runstyle;
  this.ws = cfg.ws; // Web socket for notifications (acts also as flag)
  //attrs.forEach((k) => { this[k] = cfg[k]; });
  ////// XPARA /////////////
  this.xpara = cfg.xpara || {};
  ////// OLD: || process.env["ANSIBLE_PASS"]
  ////////////// Global Conf ////////////////////
  // Store creds to xpara 
  this.xpara.ansible_user = cfg.user || acfg.user || process.env['USER'];
  // New?): ansible_become_password, Legacy(?): ansible_sudo_pass
  this.xpara.ansible_become_password = cfg.pass || acfg.pass;
  this.debug = cfg.debug || acfg.debug || 0;
  this.debug = parseInt(this.debug);
  this.invfn = cfg.invfn || acfg.invfn || ""; // TODO: decide outside ?!
  var hsel = this.hostselector();
  if (!hsel) { throw "Runner: No hosts selected for ansible op(s)"; }
  // Keep acfg in instance ?
  // this.acfg = acfg;
  // NEW: Make unique id for run-session. Communicate this to front-end
  this.runid = new Date().getTime(); // ms
}

/** List Ansible playbooks in pbpath (sync).
* The items will have: basename, relname, playname.
* Playbooks will be parsed as YAML on-the-fly to validate their YAML syntax (a minimun
* requirement to be able to run them as playbooks).
* @param acfg {object} - Ansible Config Object
* @param pbpath {string} - Playbook Path (of ':' - delimited path items)
* @return Playbook objects in an array ( with basename, relname, playname)
*/
function ansible_play_list(acfg, pbpath) { // dirname
  // List dir(s)
  var arr = [];
  if (!pbpath) { console.error("NO pbpath");return;}
  var dirnames;
  if (! Array.isArray(pbpath)) { dirnames = pbpath.split(":"); } // typeof pbpath == 'string'
  else { dirnames = pbpath; } // Array
  console.log("Look for playbooks from pbpath: ", dirnames);
  var fnodes = [];
  dirnames.forEach(function (dirname) {
    // Check presence (and isDir())
    if (!fs.existsSync(dirname)) { return; }
    // 
    var arr = fs.readdirSync(dirname);
    // https://stackoverflow.com/questions/190852/how-can-i-get-file-extensions-with-javascript
    // Check suffix "yml" or ""yaml"
    
    arr.forEach(function (fname) { // filter ?
      
      var suff = fname.slice((Math.max(0, fname.lastIndexOf(".")) || Infinity) + 1);
      console.log("Encountered: "+fname+ " suff:" + suff);
      if ((suff != "yml") && (suff != "yaml")) { return 0; }
      console.log("- Got valid suffix:" + suff);
      //path.basename(); // Already basenames
      var relname = dirname + "/" + fname;
      var node = { basename: fname, relname: relname };
      // TODO: Catch exception an bypass faulty yaml
      var yf;
      try { yf = yaml.safeLoad(fs.readFileSync(relname, 'utf8')); }
      catch (ex) { console.log("Failed to parse: "+relname+" .. "+ex); }
      if (!yf) { console.log("Failed to load(relfn): "+relname); return; }
      //console.log(JSON.stringify(yf, null, 2));
      // TODO: Checks here !
      // Lookup Playbook name ?
      node.playname = yf[0].name; // title ?
      if (!node.playname) { node.playname = "Unnamed playbook (" + fname + ")"; }
      node.taskcnt = yf[0].tasks.length;
      node.vars = yf[0].vars || {};
      // Store tasks ?
      fnodes.push(node);
    });
  }); // dirnames.forEach
  return fnodes;
}
/** List profiles in simple AoO format (for the Web gui select).
 * @param acfg {object} - Ansible config
 * @return Play profiles (as AoO)
 */
function ansible_prof_list(acfg) {
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
  // hostsfile: hostsfile,
  testpara: { playbooks: ["a.yaml", "b.yaml"], hostnames: ["host1","host2"] },
  Runner: Runner,
  ansible_play_list: ansible_play_list,
  ansible_prof_list: ansible_prof_list
};
