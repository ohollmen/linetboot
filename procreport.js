#!/usr/bin/node
/** Report Processes on all procster-enabled machines.
 * For now allow env variables to control filtering (TODO: CLI params).
 * 
 * # Env Variables
 * 
 * - PROC_NAMERE - Hostname regexp (to include host in process reporting)
 * - PROC_USER - User, who's processes are included in reporting.
 * - PROC_AGEDAYS - The process age limit in number of days (processes older than this are included)
 * - PROC_ALLOK - When set to any true integer value, do not fail reporting with one (or more) hosts failing 
*/
var async = require("async");
var axios = require("axios");
var hlr   = require("./hostloader.js");
//var Getopt = require("node-getopt");
var seen = {}; // Helper for testing
var inited = 0;
// Template candidate
var reptmpl = `
{{#hosts}}
<h3>Old Procs on {{{ hname }}}</h3>
<div id="jsGrid_badprocs" data-fsetid="proclist" data-prochname="{{ hname }}"></div>
{{/hosts}}
`;
// Process reporter (default / base) config
var proccfg = {nre: null, user: (process.env["PROC_USER"] || "root"), agedays: 5, allok: 0, debug: 0};

function climain() {
  proccfg_init(); // proccfg
  // Hostloader config
  var cfg = { hostsfile: process.env["HOME"]+"/.linetboot/hosts", };
  hlr.init({ fact_path: process.env["HOME"]+"/hostinfo" });
  var hostarr = hlr.hosts_load(cfg);
  console.log("Host names:", hostarr); // DEBUG

  var hnames = hostarr.filter(filtercb);
  console.log(hnames.length + " hosts remain after filtering:", hnames); // proccfg.debug
  staleprocs_report(hnames, proccfg, function (err, badrep) {
    if (err) { console.log("Error in extracting process reports: "+err); process.exit(1); }
    if (!badrep || !badrep.length) { console.log("Nothing to report (report="+badrep+")"); process.exit(1); }
    // Decorate result set with ISO time here for CLI
    badrep.forEach((hp) => {
      if (!hp.procs) { return; }
      hp.procs.forEach((p) => { p.starttime_iso = new Date(p.starttime*1000).toISOString(); });
    });
    console.log("Bad Processes on Hosts\n", JSON.stringify(badrep, null, 2));
  });
} // climain

if (process.argv[1].match(/procreport.js$/)) { climain(); }

// Basic / default host filtering callback.
function filtercb (hname) {
  var p = hlr.hostparams(hname);
  if (p.pana) { return 1; }
  if (proccfg.nre && hname.match(proccfg.nre)) { return 1; }
  return 0;
}
function filtercb2 (hpara) { if (hpara.pana) { return 1; } return 0; };
// Initially passed: proccfg, but since we are tweaking module-global, leave out.
function proccfg_init(mcfg) {
  if (inited) { return; } // module.exports
  console.log("procreport.init running ...");
  if (mcfg && mcfg.procster && (typeof mcfg.procster == 'object')) {
    console.log("procreport.init - Got mcfg");
    // ["user","nrestr","agedays","allok"];
    var pcfg = mcfg.procster;
    if (pcfg.user) { proccfg.user = pcfg.user; }
    // nrestr
    if (pcfg.nrestr)  { proccfg.nrestr = pcfg.nrestr; }
    if (pcfg.agedays) { proccfg.agedays = pcfg.agedays; }
    if (pcfg.allok)   { proccfg.allok = pcfg.allok; }
  }
  // TODO: When not passed, use proccfg_default
  //else { proccfg = proccfg_default; }
  // E.g. export PROC_NAMERE=^nuc or ^(bld-|[a-d][a-d]xlc)
  if (process.env["PROC_NAMERE"]) { proccfg.nrestr = process.env["PROC_NAMERE"]; }
  proccfg.nre = proccfg.nrestr ? new RegExp(proccfg.nrestr) : null;
  if (process.env["PROC_AGEDAYS"]) { proccfg.agedays = parseInt(process.env["PROC_AGEDAYS"]); }
  if (process.env["PROC_ALLOK"] && parseInt(process.env["PROC_ALLOK"])) { proccfg.allok = 1; }
  if (process.env["PROC_DEBUG"] && parseInt(process.env["PROC_DEBUG"])) { proccfg.debug = parseInt(process.env["PROC_DEBUG"]); }
  proccfg.agesec = 86400*proccfg.agedays; // Derived, precomputed
  inited = 1;
  // return module.exports;
}
// Generate procster remote URL per procster conventions.
// TODO: allow parametrizing port !
function hosturl_formulate(host) {
  var url = "http://"+host+":8181/proclist"; // 
  seen[host] = seen[host] ? seen[host] + 1 : 1;
  if (seen[host]) { url += "?id="+seen[host]; } // Append custom ?
  
  return url;
}
/** Retrieve Process info asynchronously in parallel.
 * 
 */
function staleprocs_report(hostnames, proccfg, cb) {
  if (!cb) { cb = (err, badrep) => { console.log("Got bad-report: ", badrep); }; }
  // OLD: var urls = hostnames.map((hname) => { return hosturl_formulate(hname); });
  var reqpara = {
    // 'Content-Type': Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*', withCredentials: true,
    // credentials: 'include', cookie: ...
    headers: {}, // API Key ?
  };
  // var pdata = ""; // String Or JSON
  console.time("fetch");
  // axios GET calls in parallel
  async.map(hostnames, function (hname, cb) {
    //console.log("Call "+url);
    var url = hosturl_formulate(hname);
    var out = {hname: hname, procs: null};
    axios.get(url, reqpara).then( (resp) => {
      //console.log("Called "+url);
      var d = resp.data;
      if (!d) {
        console.log("No data\n");
        if (proccfg.allok) { return cb(null, out); }
        return cb("No Data", null);
      }
      
      out.procs = d; // Add procs to out
      return cb(null, out);
    })
    // Note somehow async claims callback is already called when entering this
    // and also catches errors from something called by completion callback (!)
    // - way too late to be relevant for this context.
    .catch((ex) => {
      console.log("async axios error (on "+url+"): "+ex);
      //console.trace(); // https://developer.mozilla.org/en-US/docs/Web/API/Console/trace
      console.log(ex.stack); // Works well
      // Sometimes UnhandledPromiseRejectionWarning: Error: Callback was already called.
      // .. when there is a problem (implicit ex. thrown) in completion callback
      // e.g. async axios error: ReferenceError: usermatchX is not defined
      // where usermatchX is from func called by procs_analyze() (called only later by completion cb !?)
      if (proccfg.allok) { return cb(null, out); } // 
      return cb(ex, null);
    });
  },
  // Completion callback.
  // Note: For compatibility w. eachSeries, the results should come from outer ctx
  // param rather than completion callback param.
  function (err, results) {
      if (err) { let errmsg = "async.map completion error: "+ err; console.log(errmsg) ; return cb(errmsg, null); }
      if (!results) { console.log("No completion results"); return cb("No compl. results", null);}
      console.timeEnd("fetch");
      console.log("Got ("+results.length+") process resultsets"); // of type: "+ (typeof results) ... Says "object" ... sigh
      // console.log("Got results: "+ JSON.stringify(results, null, 2));
      //return;
      // TODO: Have analysis function as configurable callback
      var now = (Date.now() / 1000); // Seconds after 1970 
      var ctx = {now: now, age: 86400*proccfg.agedays, user: proccfg.user, debug: proccfg.debug}; // 5, root
      var badreport = [];
      // TODO: Decide on error handling
      results.forEach((hp) => {
        if (!Array.isArray(hp.procs)) { let errmsg = "async result procs for "+hp.hname+" not an array!"; console.log(errmsg); return; } // return cb(errmsg, null);
        console.log(hp.procs.length + " Processes from "+hp.hname);
        if (!hp.procs.length) { let errmsg = "No processes from host (possibly not reachable)";console.log(errmsg); return; } // return cb(errmsg, null);
        // Pass full cmp context
        var bads = procs_analyze(hp, ctx);
        // TODO: Reporter callback
        ctx.debug && console.log(bads.length + " filtered procs gotten from analysis.\n");
        (ctx.debug > 1) && console.log("Processes:\n", bads);
        var hpb = {hname: hp.hname, procs: bads};
        badreport.push(hpb);
      });
      //console.log(badreport); // DEBUG
      // Report (or even Kill?) bad ...
      cb(null, badreport);
    }
  ); // async.map()

}

/** Analyze processes from one host for stale state and return suspects
*/
function procs_analyze(hp, ctx) {
  var procs = hp.procs;
  if (!procs) { console.error("No procs for "+hp.hname); process.exit(1); }
  if (!Array.isArray(procs)) { console.log("No procs to analyze !"); return; }
  // var bads = []; // Bad processes (something to kill)
  hp.bads = procs.filter((p) => {
    // https://stackoverflow.com/questions/7759237/how-do-i-pass-an-extra-parameter-to-the-callback-function-in-javascript-filter
    // var ctx = this; // TODO: Use ctx by either bind of filter 2nd param
    (ctx.debug > 1) && console.log(p.pid);
    var age   = ctx.now - p.starttime;
    var isold = (age > ctx.age);
    var usermatch = (ctx.user == p.owner);
    if (p.cmd == 'procserver') { return null; } // procserver serving reporter, leave out
    if (isold && usermatch) { // && 
      ctx.debug && console.log("host: "+hp.hname+" proc:"+p.pid+" owned by "+p.owner+" is old ("+p.cmd+"): "+age);
      //p.host = ""; // ???
      //bads.push(p);
      return p;
    }
    return null;
  });
  //console.log("Bad ones: "+hp.bads.length);
  return(hp.bads);
}
/** Web based bad processreporting.
 */
function procreport_web(req, res) {
  var jr = {status: "err", "msg": "Could not produce bad processes report. "};
  proccfg.debug = 1;
  proccfg_init(); // proccfg
  // Assume hostloader is full init()ed, hosts loaded
  //console.log("hlr colls: ", hlr.colls);
  var hostarr = hlr.colls.hostnames; // Host*names*
  console.log("Initial hosts: ", hostarr);
  console.log("Proccfg: ", proccfg);
  var hnames = hostarr.filter(filtercb); // Use default filter CB
  if (!hnames || !hnames.length) { jr.msg += "No Reporting to do !"; return res.json(jr); }
  console.log(hnames.length + " hosts remain after filtering:", hnames); // proccfg.debug
  staleprocs_report(hnames, proccfg, function (err, badrep) {
    if (err) { jr.msg += "Error extracting report:"+err; return res.json(jr); }
    if (!badrep || !badrep.length) { jr.msg += "Nothing to report (report="+badrep+")"; return res.json(jr); }
    // Decorate result set with ISO time Only on frontend !
    //badrep.forEach((hp) => {
    //  if (!hp.procs) { return; }
    //  hp.procs.forEach((p) => { p.starttime_iso = new Date(p.starttime*1000).toISOString(); });
    //});
    //console.log("Bad Processes on Hosts\n", JSON.stringify(badrep, null, 2));
    res.json({status: "ok", data: badrep});
  });
}

module.exports = {
  init: proccfg_init,
  procreport_web: procreport_web,
  proccfg: proccfg
};
