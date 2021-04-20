#!/usr/bin/node
/** Report Processes on all procster-enabled machines.
*/
var async = require("async");
var axios = require("axios");
var hlr = require("./hostloader.js");

var tnow = 1; // 

var urls = ["http://nuc5:8181/proclist?id=1","http://nuc5:8181/proclist?id=2"];
// axios GET calls in parallel
//var urls = ["/u1", "/u2"];
var reqpara = {
  // 'Content-Type': Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*', withCredentials: true,
  // credentials: 'include', cookie: ...
  headers: {}, // API Key ?
};
var pdata = ""; // String Or JSON
async.map(urls, function (url, cb) {
  //console.log("Call "+url);
  axios.get(url, reqpara).then( (resp) => {
    //console.log("Called "+url);
    var d = resp.data;
    if (!d) { console.log("No data\n"); return cb("No Data", null); }
    // Work with data (wrap it ?)
    
    var out = d;
    return cb(null, out);
  })
  // 
  .catch((ex) => {
    console.log("async axios error: "+ex);
    // Sometimes UnhandledPromiseRejectionWarning: Error: Callback was already called.
    // .. when there is a problem (implicit ex. thrown) in completion callback
    // e.g. async axios error: ReferenceError: usermatchX is not defined
    // where usermatchX is from func called by 
    return cb(ex, null);
    });
},
// Completion callback
function (err, results) {
    if (err) { console.log("async.map completion error: "+ err) ; return; }
    console.log("Got ("+results.length+") results of type: "+ (typeof results)); // Says Object
    // console.log("Got results: "+ JSON.stringify(results, null, 2));
    //return;
    // TODO: Have analysis function as configurable callback
    var now = (Date.now() / 1000); // Seconds after 1970 
    var ctx = {now: now, age: 86400*5, user: 'root', debug: 0};
    results.forEach((procs) => {
      if (!Array.isArray(procs)) { console.log("One async result not an array!"); return; }
      console.log(procs.length + " Processes");
      // Pass full cmp context
      var bads = procs_analyze(procs, ctx);
      console.log(bads.length + " procs gotten from analysis:\n", bads);
    });
    // Kill bad ...
    
  }
); // async.map()
/** Analyze processes from one host for stale state and return suspects
*/
function procs_analyze(procs, ctx) {
  if (!Array.isArray(procs)) { console.log("No procs to analyze !"); return; }
  var bads = []; // Bad processes (something to kill)
  procs.forEach((p) => {
    ctx.debug && console.log(p.pid);
    var age = ctx.now - p.starttime;
    var isold = (age > ctx.age);
    var usermatch = (ctx.user == p.owner);
    if (isold && usermatch) { // && 
      ctx.debug && console.log(p.pid+" owned by "+p.owner+" is old ("+p.cmd+"): "+age);
      //p.host = ""; // ???
      bads.push(p);
    }
  });
  return(bads);
}
