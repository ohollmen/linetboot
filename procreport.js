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
var Getopt = require("node-getopt");
var tnow = 1; // 
var seen = {};
// Hostloader config
var cfg = { hostsfile: process.env["HOME"]+"/.linetboot/hosts", };
hlr.init({ fact_path: process.env["HOME"]+"/hostinfo" });
var hostarr = hlr.hosts_load(cfg);
console.log("Host names:", hostarr); // DEBUG

// var urls = ["http://nuc5:8181/proclist?id=1","http://nuc5:8181/proclist?id=2"];
// E.g. export PROC_NAMERE=^nuc or ^(bld-|[a-d][a-d]xlc)
var proccfg = {nre: null, user: (process.env["PROC_USER"] || "root"), agedays: 5, allok: 0};
var proc_nre = process.env["PROC_NAMERE"];
proccfg.nrestr = proc_nre;
var namere = proc_nre ? new RegExp(proc_nre) : null;
proccfg.nre = namere;
if (process.env["PROC_AGEDAYS"]) { proccfg.agedays = parseInt(process.env["PROC_AGEDAYS"]); }
if (process.env["PROC_ALLOK"] && parseInt(process.env["PROC_ALLOK"])) { proccfg.allok = 1; }
var filtercb = (hname) => {
  var p = hlr.hostparams(hname);
  if (p.pana) { return 1; }
  if (namere && hname.match(namere)) { return 1; }
  return 0;
};
// var filtercb = (hpara) => { if (hpara.pana) { return 1; } return 0; };
var hnames = hostarr.filter(filtercb);
console.log(hnames.length + " hosts remain after filtering:", hnames);
staleprocs_report(hnames, proccfg); // ["nuc5","nuc5"]

function hosturl_formulate(host) {
  var url = "http://"+host+":8181/proclist"; // 
  seen[host] = seen[host] ? seen[host] + 1 : 1;
  if (seen[host]) { url += "?id="+seen[host]; } // Append custom ?
  
  return url;
}

function staleprocs_report(hostnames, proccfg) {
// axios GET calls in parallel
//var urls = ["/u1", "/u2"];
// var urls = hostnames.map((hname) => { return hosturl_formulate(hname); });
var reqpara = {
  // 'Content-Type': Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*', withCredentials: true,
  // credentials: 'include', cookie: ...
  headers: {}, // API Key ?
};
// var pdata = ""; // String Or JSON
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
    if (err) { console.log("async.map completion error: "+ err) ; return; }
    if (!results) { console.log("No completion results"); process.exit(1);}
    console.log("Got ("+results.length+") process resultsets"); // of type: "+ (typeof results) ... Says "object" ... sigh
    // console.log("Got results: "+ JSON.stringify(results, null, 2));
    //return;
    // TODO: Have analysis function as configurable callback
    var now = (Date.now() / 1000); // Seconds after 1970 
    var ctx = {now: now, age: 86400*proccfg.agedays, user: proccfg.user, debug: 0}; // 5, root
    results.forEach((hp) => {
      if (!Array.isArray(hp.procs)) { console.log("One async result procs not an array!"); return; }
      console.log(hp.procs.length + " Processes");
      if (!hp.procs.length) { console.log("No processes from host (possibly not reachable)"); return; }
      // Pass full cmp context
      var bads = procs_analyze(hp, ctx);
      console.log(bads.length + " procs gotten from analysis:\n", bads);
    });
    // Kill bad ...
    
  }
); // async.map()

}

/** Analyze processes from one host for stale state and return suspects
*/
function procs_analyze(hp, ctx) {
  var procs = hp.procs;
  if (!procs) { console.error("No procs for "+hp.hname); process.exit(1); }
  if (!Array.isArray(procs)) { console.log("No procs to analyze !"); return; }
  var bads = []; // Bad processes (something to kill)
  hp.bads = procs.filter((p) => {
    ctx.debug && console.log(p.pid);
    var age   = ctx.now - p.starttime;
    var isold = (age > ctx.age);
    var usermatch = (ctx.user == p.owner);
    if (isold && usermatch) { // && 
      ctx.debug && console.log("host: "+hp.hname+" proc:"+p.pid+" owned by "+p.owner+" is old ("+p.cmd+"): "+age);
      //p.host = ""; // ???
      //bads.push(p);
      return p;
    }
    return null;
  });
  console.log("Bad ones: "+hp.bads.length);
  return(hp.bads);
}
