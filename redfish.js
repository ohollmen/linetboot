/** @file
 * 
 * # RedFish Operations on BMC (Baseboard Management Controller)
 * 
 * This module allows executing simple high level Remote management operations via RedFish BMC API.
 * Although the module name is Redfish, most of the ops can be also executed using IPMI (older binary protocol).
 * 
 * Typical sequence of Setting up RFOp:
 * 
 *      var rmgmt = ipmi.rmgmt_load(f, rmgmtpath);
 *      // Instantiate by IPMI Config (shares creds)
 *      var rfop = new redfish.RFOp("setpxe", global.ipmi);
 *      rfop.sethdlr(hdl_redfish_succ, hdl_redfish_err);
 *      // Call host by MC ip address
 *      rfop.request(rmgmt.ipaddr, ipmiconf);
 * 
 * ## TODO
 * 
 * Consider a mandatory "discovery call" to "/redfish/v1/Systems/System.Embedded.1/" (or equivalent).
 * One of the rmaing (chicken-and-egg type) problems is that to formulate the info URL the "Id" in info response is needed.
 * The discovery call would help:
 * - Choosing appropriate "ResetType" (preference order could be set by module)
 * - Get to know "PowerState"
 * 
 * ## Ops (Operations) structure
 * 
 * Ops contains an array of objects (AoO) for command information. Each entry in it has members:
 * - id (string) - Abstract symbol label for command (e.g. "boot")
 * - m (string) - HTTP method for RedFish based call (post/get/patch/...)
 * - url (string) - Relative URL path from server top URL for RedFish URL call
 * - msg (obj_or_arr) - Message data for RedFish call (object or array)
 * - ipmi (string) - IPMI command line command to be executed with ipmitool (do not include ipmitool command name, e.g. "chassis power cycle" to reboot)
 * 
 * ## References
 * - https://www.tzulo.com/crm/knowledgebase/47/IPMI-and-IPMITOOL-Cheat-sheet.html
 * - https://docs.oracle.com/cd/E24707_01/html/E24528/z400000c1016683.html
 */
var axios = require("axios");
var cproc = require("child_process");
// TODO: Embed templating fragment for {{ sysid }} ?
var ops = [
    {"id":"boot",  "m": "post",  url: "/redfish/v1/Systems/System.Embedded.1/Actions/ComputerSystem.Reset", msg: {"ResetType": "PowerCycle", }, "ipmi": "chassis power cycle"}, // chassis power reset
    {"id":"info",  "m": "get",   url: "/redfish/v1/Systems/System.Embedded.1/", "ipmi": "lan print 1"}, // IPMI: not very informative host itself
    {"id":"setpxe","m": "patch", url: "/redfish/v1/Systems/System.Embedded.1/", msg: {"Boot": {"BootSourceOverrideTarget": "Pxe"}}, "ipmi": "chassis bootdev pxe" },
    {"id":"unsetpxe","m": "patch", url: "/redfish/v1/Systems/System.Embedded.1/", msg: {"Boot": {"BootSourceOverrideTarget": "None"}} , "ipmi": "chassis bootdev disk"}, // safe or disk ?
    // Also multipart POST to upload (Note ETag)
    {"id":"fwinv", "m": "get",   url: "/redfish/v1/UpdateService/FirmwareInventory", "ipmi": ""}, // Do not use with IPMI
    // "m":"post", url: UpdateService/Actions/UpdateService.SimpleUpdate} // SW URL in body
];
var ops_idx = {}; ops.forEach(function (op) { ops_idx[op.id] = op; });

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

/** Make a good guess on "Id" (system id) based on facts.
 */
function sysid(f) {
  if (!f) { console.error("sysid: No facts"); return "1"; }
  if (f.ansible_system_vendor && f.ansible_system_vendor.match(/Dell/)) { return "System.Embedded.1"; }
  return "1";
}
/** Generate redfish IPMI config based on global **and** host settings.
 * Let hostparams.bmccreds (In format user:pass) override global credentials.
 * Usage (e.g.): `redfish.gencfg(ipmicfg, hostparams[f.ansible_fqdn])`
 * @param ipmicfg {object) - IPMI config
 * @param hostparams {object} - Host key-value parameters from 'hosts' (inventory) file.
 */
function gencfg(ipmicfg, hostparams) {
  var cfg = {user: ipmicfg.user, pass: ipmicfg.pass, testurl: ipmicfg.testurl, execbin: ipmicfg.execbin};
  if (hostparams.bmccreds) {
    var up = hostparams.bmccreds.split(/:/);
    cfg.user = up[0];
    cfg.pass = up[1];
  }
  return cfg;
}
var isbodymeth = {"post":1, "put":1, "patch":1, };
/** Construct an RedFish operation.
 * @param opid {string} - an operation registered in ops structure of redfish module.
 * @param conf {object} - Config object (with user, pass for basic authentication and optional testurl params)
 */
function RFOp(opid, conf) {
  var op  = ops_idx[opid];
  this.id = op.id;
  this.m  = op.m;
  // Test BMC / host vendor here to set / tweak URL (Or in makeurl)
  // var sysid = "1";
  // if (f &&  f.ansible_system_vendor && f.ansible_system_vendor.match(/Dell/)) { sysid = "System.Embedded.1"; }
  this.url = op.url;
  this.msg = op.msg ? JSON.parse(JSON.stringify(op.msg)) : null; // Copy !
  this.conf = conf || {}; // TODO: utilize !
  this.ipmi = op.ipmi;
}
/** Add (or register") operation.
 * Add operations (object) to ops command table (and index of the module).
 */
RFOp.add = function (op) {
  if (!op.id) { throw "No ID for new Op!"; }
  if (ops_idx[op.id]) { throw "Op by id "+op.id+" already in"; }
  // Validate members ?
  ops.push(op);
  ops_idx[op.id] = id;
};
/** Create final full user from host and current op (RedFish API) URL path.
 * @param host {string} - BMC Hostname (name or ip address)
 * @param extra {object} - Object where member testurl would be returned as override for generated URL
 * @return URL to use for RedFish op (http call).
 */
RFOp.prototype.makeurl = function (host, extra) {
  if (host.match(/\/$/)) { host = host.replace(/\/+$/, ''); }
  if (extra && extra.testurl) { return extra.testurl; }
  // Check BMC and host type / vendor, decide on final URL, see also constructor
  
  return "https://"+host+this.url;
};
/** Set success and error operations for (asynchronous) RedFish operation.
 * The success and error calls recieve axios http call promise resolve and reject objects
 * (See axios api for that).
 * For pure IPMI simulated objects are created by request_ipmi() (by mk_ax_resp()).
 */
RFOp.prototype.sethdlr = function (succcb, errcb) {
  this.succ = succcb;
  this.err = errcb;
  // Validate as functions ?
  if (typeof this.succ != 'function') { throw "sethdlr: Success CB not a function"; }
  if (typeof this.err != 'function') { throw "sethdlr: Error CB not a function"; }
  return this;
};
/** Make a HTTP request for the RedFish operation.
 * Lauches asynchronous HTTP call and calls the RF request object contained .succ/.err callbacks
 * for cases success and error respectively.
 * @param host {string} - Hostname (with optional ':' delimited port)
 * @param auth {object} - Auth creds. object w. members user, pass
 */
RFOp.prototype.request = function(host, auth) {
  var rfop = this;
  // conf = this.conf || {};
  if (!auth || !auth.user || !auth.pass) { throw "No Credentials"; }
  var bauth = basicauth(auth);
  var hdrs = { Authorization: "Basic "+bauth, "content-type": "application/json", "Accept":"*/*" };
  // Note: This Initially gets cloned from message prototype, however it can be changed by caller between
  // new RFOp() and call to request()
  var msg = this.msg; // Copy ? Only for POST,PUT,PATCH
  var meth = this.m; //var meth = ops[p.op];
  if (!meth) { throw "request: meth missing in op:" + this.id; }
  // TODO: isbodymeth[meth]
  if (!isbodymeth[meth]) { delete(hdrs["content-type"]); this.msg = msg = null; }
  var rfurl = this.makeurl(host, auth);
  console.log("Call("+meth+"): "+rfurl + "\nBody: ", msg, " headers: ", hdrs);
  var reqopts = {headers: hdrs, };
  //if (msg) { }
  if (!this.succ || !this.err) { throw "One of success/error handlers missing (Call sethdlr(succ,err) for setting these)"; }
  if (isbodymeth[meth]) { axios[meth](rfurl, msg, reqopts).then(this.succ).catch(this.err); }
  else { axios[meth](rfurl, reqopts).then(this.succ).catch(this.err); }
};

/** Make a BMC Request but with IPMI (Instead of RedFish).
 * TODO:
 * - Simulate axios response and error objects (members: ...)
 * - Test
 * See (old): ipmi.js / ipmi_cmd()
 */
RFOp.prototype.request_ipmi = function(host, auth) {
  var msg = "";
  // See -A PASSWORD, -N 1 -R 10
  // Node.js runtime says: No hostname specified!
  //var basecmd = "ipmitool —I lanplus -A PASSWORD -H '" +host+ "' -U '"+auth.user+"' -P '"+auth.pass+"' ";
  // Weirdly command works with -I ... at end, -H first (from CL).
  // -A PASSWORD causes Authentication type PASSWORD not supported - even if manual / --help says it is.
  // At least on CL: -I lanplus must be between -U and -P !! Got: Chassis Power Control: Cycle (Works consistently)
  // In Node.js (exec) toggles interactive auth
  // var basecmd = "/usr/local/bin/ipmitool  -H '" +host+ "'  -U '"+auth.user+"' —I lanplus -P '"+auth.pass+"' ";
 
  // -I in here (after -H) triggers interactive passwd prompt, ignoring -P !!
  ///////var basecmd = "ipmitool  -H '" +host+ "' —I 'lanplus' -U '"+auth.user+"' -P '"+auth.pass+"' ";
  //var basecmd = "ipmitool  -H " +host+ "  -U "+auth.user+" —I lanplus -P "+auth.pass+" "; // NO quotes
  var execargs = ["-H", host, "-U", auth.user, "-I", "lanplus", "-P ", auth.pass];
  if (!this.err || !this.succ) { throw "Some of the err/succ callbacks missing !"; }
  if (!this.ipmi) { msg = "IPMI command not found for op: "+ this.op; console.log(msg); return this.err({}); }
  var ipmifullcmd = basecmd + this.ipmi; // Add ipmi sub command
  execargs =  execargs.concat(this.ipmi.split(/\s+/));
  //if (rmgmt.enckey ) { ipmifullcmd += " -x " +rmgmt.enckey+" "; }
  function mk_ax_resp(iserr) {
    // Try to have all frequently accessed members here
    var r = {status: iserr, statusText: "", message: msg, headers: {}, data: {}}; // Use local msg ? "Error in IPMI CLI call."
    // In error response is in member response
    // NOTE: error should have .toString() method
    if (iserr) {
      //r.status = 400;
      r = {response: r};
      // r.toString = function () { return this.r.message; } // TypeError: Cannot read property 'message' of undefined
      r.toString = function () { return r.response; };
      // 
    } // 
    return r;
  }
  var inst = this;
  var opts = {shell: "/bin/bash"}; // cwd, env, timeout, encoding
  // TODO: global.ipmi.execbin process.env["LINETBOOT_IPMI_EXECBIN"]
  var execbin = this.conf.execbin || "/usr/bin/ipmitool"; // Mac brew: "/usr/local/bin/ipmitool";
  // console.log(process.env);
  console.log("Full IPMI command: "+ipmifullcmd);
  console.log("Full IPMI command (execv): ", execargs);

  //var run = cproc.exec(ipmifullcmd, opts, function (err, stdout, stderr) {
  var run = cproc.execFile(execbin, execargs, opts, function (err, stdout, stderr) {
    if (err) {
      msg += "Problem with ipmitool run:" + err;
      console.log(msg);
      //console.log(stderr);
      //return res.json(jr);
      // Simulate axios promise response ?
      let r = mk_ax_resp(1);
      return inst.err(r);
    }
    
    console.log("Executed IPMI command successfully: " + stdout);
    //return res.json({status: "ok", data: {"msgarr": msgarr}});
    let r = mk_ax_resp(0);
    return inst.succ(r);
  });
};
// https://stackabuse.com/encoding-and-decoding-base64-strings-in-node-js/
  function basicauth(obj) {
    // [DEP0005] DeprecationWarning: Buffer() is deprecated due to security and usability issues.
    // Please use the Buffer.alloc(), Buffer.allocUnsafe(), or Buffer.from() methods instead.
    var buff = new Buffer(obj.user + ":" + obj.pass); // , 'ascii'
    return buff.toString('base64');
  }
///// Possibly add HTTP handlers for RF Interaction here /////////////////
// host_reboot

module.exports = {
  sysid: sysid,
  RFOp: RFOp,
  ops_idx: ops_idx,
  basicauth: basicauth,
  gencfg: gencfg
};
