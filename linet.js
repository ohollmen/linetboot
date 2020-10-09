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
*     # List available hosts
*     node ./linet.js listhosts
*     # Inquire Info on host
*     node ./linet.js info -h host-032.company.com
*     # Request next-boot way of booting (e.g. OS Install)
*     node ./linet.js install -h host-032.company.com -l memtest
*     # Set next-boot to happen via PXE
*     node ./linet.js setpxe -h  host-032.company.com
*     # Boot host
*     node ./linet.js boot -h host-032.company.com
*/

var ops = [
  {
    "id": "listos",
    "title": "List OS:s available for install (and other boot items)",
    "url": "/config/",
    "pretext": "OS Boot/Install options (to use with -l, --bootlbl):",
    "posttext": `To initiate next-time (pxe) boot to one of these boot/install choices, run:
  linet.js install -h myhost -l bootlabel`,
    cb: listos,
  },
  {
    "id": "listhosts",
    "title": "List Hosts in Inventory",
    "url": "/list/",
    "pretext": "Hosts Available:",
    "posttext": `Use one (or more) of these with option -h`,
    cb: listos,
  },
  {
    "id": "info",
    "title": "Get info on host passed by -h ",
    cb: boot,
  },
  {
    "id": "setpxe",
    "title": "Set next boot to be PXE on host passed by -h ",
    cb: boot,
  },
  {
    "id": "install",
    "title": "Request Boot or Install of a host with (one of valid) bootlbl. Use params: -h host -b bootlbl.",
    cb: install,
  },
  {
    "id": "boot",
    "title": "Boot host passed by -h.",
    // Use -p to boot PXE (leading to special boot, e.g. OS Install)
    cb: boot,
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
var fs     = require("fs");
var async  = require("async");
var axios  = require("axios");
var Getopt = require("node-getopt"); // getopt ?
// OPTIONAL main config (can guide in setting LINETBOOT_URL)
var mcfg_name = process.env["HOME"]+"/.linetboot/global.conf.json";
var mcfg;
var debug = 0;
//console.log("look for: "+mcfg_name);
if (fs.existsSync(mcfg_name)) { mcfg = require(mcfg_name); }
if (!cfg.httphost) {
  console.error("No (env.) LINETBOOT_URL found (e.g. http://linet.my.corp.com:3000");
  if (mcfg && mcfg.httpserver) {
    console.log("By your detected main config it looks like it might be:\n  http://"+mcfg.httpserver+"\n");
    console.log("If that looks right, try (setting in shell):\n  export LINETBOOT_URL=http://"+mcfg.httpserver+"\n");
  }
  //console.log();
  process.exit(1);
}

if (cfg.httphost.match(/\/+$/)) { cfg.httphost = cfg.httphost.replace(/\/+$/, ''); }
// console.log("ARGV:", process.argv);
var argv2 = process.argv.slice(2);
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
  // TODO: Small example sequence like the one in top comment
  var instseq = `Example Commands in likely usage sequence:
     # List Boot / OS Install Options
     node ./linet.js listos
     # List available hosts
     node ./linet.js listhosts
     # Inquire Info on host
     node ./linet.js info -h host-032.company.com
     # Request next-boot way of booting (e.g. OS Install)
     node ./linet.js install -h host-032.company.com -l memtest
     # Set next-boot to happen via PXE
     node ./linet.js setpxe -h  host-032.company.com
     # Boot host
     node ./linet.js boot -h host-032.company.com`;
  process.exit();
}
function help() {
  usage("");
}
/** Get (RedFish) Info on host (info) Boot it (boot) or set Boot mode to PXE (setpxe).
* Options must have 'host' (one or hosts more hosts to boot), OLD: and may have 'pxe' (Boot by PXE)
*/
function boot(opts) {
  var rmgmtop = opts.op; // "info", "boot" or "setpxe" Use: opts.op;
  // console.log("Op: " + opts.op);
  if (!opts.host || !opts.host.length) { return usage("No hosts given (by -h )!"); }
  
  var baseurl = cfg.httphost + "/rf/"+rmgmtop+"/"; // Append hname !
  //
  console.log("Should run op '"+opts.op+"' on hosts:", opts.host);
  console.log(".. using URL:" + baseurl + " + host");
  async.map(opts.host, bmcop, function (err, ress) {
    if (err) { console.log(rmgmtop +" Error"+err); return 1;} // Boot/Info/SetPXE
    console.log(rmgmtop+" Success ...");
    //if (debug > 1) { console.log(JSON.stringify(ress, null, 2)); }
    return 0;
  });
  function bmcop(hn, cb) {
    // console.log("Operate single host: " + hn);
    var url = baseurl+hn+"?";
    if (opts.pxe) { url += "pxe=1"; }
    axios.get(url).then(function (resp) {
      var d = resp.data;
      // console.log("DATA:", d);
      // Check errors
      console.log("Error("+hn+") Additional info: ", d.messages);
      if (d.status == 'err') { return cb(d.msg, null ); }
      return cb(null, d.data); // OK
    }).catch(function (ex) {
      console.log("Encountered Error (host: "+hn+"): "+ ex);
      cb(ex.toString(), null);
    });
  }
}
/** Send a request to install particular OS the next time host is booted.
* Supports labels in lineboot server side main boot menu.
* Options must have host
* 
*/
// TODO: Can we (only) set to boot pxe the next time (not actually boot).
function install(opts) {
  var rmgmtop = opts.op;
  //var url = cfg.httphost + "/install_boot?";
  var baseurl = cfg.httphost + "/install_boot?";
  if (!opts.host || !opts.host.length) { return usage("No hosts given (by -h / --host)!"); }
  if (!opts.bootlbl) { return usage("No Boot Label parameter (-l / --bootlbl) to indicate boot / install menu item."); }
  // TODO: Support multiple hosts (with async.map())
  async.map(opts.host, inst_host, function (err, ress) {
    if (err) { console.log(rmgmtop +" Error"+err); return 1;}
    console.log(rmgmtop+" Request Success ...");
    //if (debug > 1) { console.log(JSON.stringify(ress, null, 2)); }
    return 0;
  });
  function inst_host(hn, cb) {
  //var hn = opts.host[0]; // Obsolete
  var url = baseurl + "hname="+hn + "&bootlbl=" + opts.bootlbl;
  //var bl = opts.bootlbl;
  //url += "&bootlbl="+bl;
  
  if (debug) { console.log("Calling: "+url); }
  axios.get(url).then(function (resp) {
    var d = resp.data;
    if (d.status == 'err') {
      console.error("Error("+hn+"): "+d.msg);
      
      return cb("Error("+hn+"): "+d.msg, null); }
    //console.log(d); // DEBUG
    console.log("Successfully submitted boot or install request for host: "+hn);
    return cb(null, d);
  }).catch(function (ex) {
    console.log("Error during Linetboot boot / install call: "+ex);
    return cb("Error during Linetboot boot / install call: "+ex, null);
  });
  } // inst_host
}
/** List Boot Options (listos) or list hosts (listhosts).
* 
*/
function listos(opts) {
   var url = cfg.httphost + opnode.url; // "/config/";
   console.log("Calling REST API @: "+url);
   axios.get(url).then(function (resp) {
      var d = resp.data;
      console.log("DATA:", d);
      var oslist;
      if      (op == 'listos') { oslist = d.bootlbls;}
      else if (op == 'listhosts') { oslist = d;}
      // Check errors
      if (d.status == 'err') { return cb(d.msg, null ); }
      if (!Array.isArray(oslist)) { console.log("Not an array of OS choices"); return 1; }
      // OLD: console.log("OS Boot/Install options (to use with -l, --bootlbl):");
      console.log(opnode.pretext);
      oslist.forEach(function (it) {
        // console.log(" - "+it);
	if      (op == 'listos') { console.log(" - " + it.id + " - " + it.name); } // 2 props
	else if (op == 'listhosts') { console.log(" - "+it.hname+" ("+it.sysmodel+", "+it.distname+")"); }
      });
      //console.log("To initiate next-time (pxe) boot to one of these boot/install choices, run:");
      //console.log("  linet.js install -h myhost -l bootlabel");
      console.log(opnode.posttext);
      // return cb(d.data, 1);
    }).catch(function (ex) {
      
      //cb(ex.toString(), null);
      console.error("Error querying OS:s or Hosts: "+ex);
    });
}
