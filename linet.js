#!/usr/bin/env node
/** Allow operating linetboot boots and installs from command line.
* 
* TODO: Plan to have access to facts (or inventory), so that we can do
* pattern-based group selections (and expand to individual hosts).
* 
* # Demo Example
*
*     # List Boot / OS Install Options
*     node ./linet.js listos
*     # Inquire Info on host
*     node ./linet.js info -h host-032.company.com
*     # Request next-boot way of booting (e.g. OS Install)
*     node ./linet.js install -h host-032.company.com -l memtest
*     # Boot host
*     node ./linet.js boot -h host-032.company.com
*/

var ops = [
  {
    "id": "boot",
    "title": "Boot host passed by -h ",
    cb: boot,
  },
  {
    "id": "info",
    "title": "Get info on host passed by -h ",
    cb: boot,
  },
  {
    "id": "listos",
    "title": "Get info on OS:s available for install",
    cb: listos,
  },
  {
    "id": "install",
    "title": "Boot or Install host with (one of valid) bootlbl. Use -h host -b bootlbl.",
    cb: install,
  },
  {
    "id": "help",
    "title": "Produce a small help guide",
    cb: help,
  },
];

var cfg = {
  httphost: process.env["LINETBOOT_URL"],
};
// CL Options
var clopts = [
  ["h", "host=ARG+", "Hostname or multiple full hostnames (given w. multiple -h args)"],
  ["l", "bootlbl=ARG", "Boot label for OS to boot or install"],
  ["p", "pxe", "Boot pxe (Ths is an option flag w/o value)"],
];

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

var async  = require("async");
var axios  = require("axios");
var Getopt = require("node-getopt"); // getopt ?

if (!cfg.httphost) { console.error("No (env.) LINETBOOT_URL found (e.g. http://linet.my.corp.com:3000"); process.exit(1); }
// console.log("ARGV:", process.argv);
var argv2 = process.argv.slice(2)
// console.log("ARGV2:", argv2);

var op = argv2.shift();
if (!op) { usage("No subcommand"); }
//if (!ops) {}
var opnode = ops.filter((on) => { return op == on.id; })[0];
if (!opnode) { usage("No op: "+op+". Need subcommand !"); }
getopt = new Getopt(clopts);
var opt = getopt.parse(argv2);
// console.log("Opt key-vals: "+JSON.stringify(opt.options, null, 2));
if (!opnode.cb) { usage("Opnode missing CB !"); }
opt.options.op = op;
var rc = opnode.cb(opt.options);
// console.log("Op:"+op+" produced rc:"+rc);
// process.exit(rc); // NOT here: async could be running

function usage(msg) {
  if (msg) { console.error(msg); }
  console.error("Use one of subcommands:\n"+ ops.map((on) => {return " - "+on.id+ " - " + on.title;}).join("\n"));
  console.log("Command Line Options");
  var help = clopts.map((on) => {return " - -"+on[0]+ " (--"+on[1]+") - " + on[2];}).join("\n");
  console.log(help);
  process.exit();
}
function help() {
  usage("");
}
// boot OR info
function boot(opts) {
  var rmgmtop = opts.op; // "info" / "boot" Use: opts.op;
  // console.log("Op: " + opts.op);
  if (!opts.host || !opts.host.length) { return usage("No hosts given (by -h )!"); }
  
  var baseurl = cfg.httphost + "/rf/"+rmgmtop+"/"; // Append hname !
  //
  console.log("Should boot hosts:", opts.host);
  console.log(".. using URL:" + baseurl + " + host");
  async.map(opts.host, doboot, function (err, ress) {
    if (err) { console.log("Boot/Info Error"+err); return 1;}
    // console.log("Complete !");
    console.log(JSON.stringify(ress, null, 2));
    return 0;
  });
  function doboot(hn, cb) {
    // console.log("Operate single host: " + hn);
    var url = baseurl+hn+"?";
    if (opts.pxe) { url += "pxe=1";}
    axios.get(url).then(function (resp) {
      var d = resp.data;
      // console.log("DATA:", d);
      // Check errors
      console.log("Error("+hn+") Additional info: ", d.messages);
      if (d.status == 'err') { return cb(d.msg, null ); }
      return cb(null, d.data); // OK
    }).catch(function (ex) {
      console.log("Encountered Error: "+ ex);
      cb(ex.toString(), null)
    });
  }
}
/** Send a request to install particular OS the next time host is booted.
* Support labels in lineboot server side main boot menu.
* TODO: Can we (only) set to boot pxe the next time (not actually boot).
*/
function install(opts) {
  var url = cfg.httphost + "/install_boot?";
  if (!opts.host || !opts.host.length) { return usage("No hosts given (by -h )!"); }
  if (!opts.bootlbl) { return usage("No bootlbl parameter to indicate boot item."); }
  var hn = opts.host[0]; url += "hname="+hn;
  var bl = opts.bootlbl; url += "&bootlbl="+bl;
  console.log("Calling: "+url);
  axios.get(url).then(function (resp) {
    var d = resp.data;
    if (d.status == 'err') {
      console.error("Error: "+d.msg);
      
      return; }
    console.log(d); // DEBUG
    console.log("Successfully submitted boot or install request for host: "+hn);
  }).catch(function (ex) {
    console.log("Error during Linetboot boot / install call: "+ex);
  });
}

function listos(opts) {
   var url = cfg.httphost + "/config/";
   axios.get(url).then(function (resp) {
      var d = resp.data;
      console.log("DATA:", d);
      var oslist = d.bootlbls;
      // Check errors
      if (d.status == 'err') { return cb(d.msg, null ); }
      if (!Array.isArray(oslist)) { console.log("Not an array of OS choices"); return 1; }
      console.log("OS Install options:");
      oslist.forEach(function (it) {
        // console.log(" - "+it);
	console.log(" - " + it.id + " - " + it.name); // 2 props
      });
      console.log("To initiate next-time (pxe) boot to one of these boot/install choices, run:");
      console.log("  linet.js install -h myhost -l bootlabel");
      // return cb(d.data, 1);
    }).catch(function (ex) {
      
      //cb(ex.toString(), null);
      console.error("Error querying OS:s: "+ex);
    });
}
