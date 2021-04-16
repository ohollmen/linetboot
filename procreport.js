#!/usr/bin/node
/** Report Processes on all procster-enabled machines.
*/
var async = require("async");
var axios = require("axios");
var hlr = require("./hostloader.js");

var tnow = 1; // 

var urls = ["http://nuc5:8181/proclist","http://nuc5:8181/proclist"];
// axios GET calls in parallel
//var urls = ["/u1", "/u2"];
var reqpara = {
  // 'Content-Type': Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*', withCredentials: true,
  // credentials: 'include', cookie: ...
  headers: {},
};
var pdata = ""; // String Or JSON
async.map(urls, function (url, cb) {
  axios.get(url, reqpara).then( (resp) => {
    var d = resp.data;
    if (!d) { console.log("No data\n"); return cb("No Data", null); }
    // Work with data
    
    var out = d;
    return cb(null, out);
  })
  // 
  .catch((ex) => {
    console.log("async axios error: "+ex);
    return cb(ex, null)});
  },
  function (err, results) {
    if (err) { console.log("async.map completion error: "+ err) ; return; }
    console.log("Got results of type: "+ (typeof results)); // Says Object
    console.log("Got results: "+ JSON.stringify(results, null, 2));
    //return;
    // TODO: Have analysis function as configurable callback
    var now = (Date.now() / 1000);
    var ctx = {now: now, age: 86400*5 };
    results.forEach((procs) => {
      // Pass full cmp context
      var bads = procs_analyze(procs, ctx);
    });
  }
);
/** Analyze processes for stale state and return suspects
*/
function procs_analyze(procs, ctx) {
  if (!Array.isArray(procs)) { console.log("No procs to analyze !"); return; }
  var bads = [];
  procs.forEach((p) => {
    console.log(p.pid);
    var age = ctx.now - starttime;
    if (age > ctx.age) { console.log("Age ("+p.cmd+"): "+age); bads.push(p); }
  });
  return(bads);
}
