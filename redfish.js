/**
 * 
 * # Typical sequence of Setting up RFOp:
 * 
 * 
 *      var rmgmt = ipmi.rmgmt_load(f, rmgmtpath);
 *      // Instantiate by IPMI Config (shares creds)
 *      var rfop = new redfish.RFOp("setpxe", global.ipmi);
 *      rfop.sethdlr(hdl_redfish_succ, hdl_redfish_err);
 *      // Call host by MC ip address
 *      rfop.request(rmgmt.ipaddr, ipmiconf);
 */
var axios = require("axios");
var ops = [
    {"id":"boot",  "m": "post",  url: "/redfish/v1/Systems/System.Embedded.1/Actions/ComputerSystem.Reset", msg: {"ResetType": "PowerCycle", } },
    {"id":"info",  "m": "get",   url: "/redfish/v1/Systems/System.Embedded.1/"},
    {"id":"setpxe","m": "patch", url: "/redfish/v1/Systems/System.Embedded.1/", msg: {"Boot": {"BootSourceOverrideTarget": "Pxe"}} },
    {"id":"fwinv", "m": "get",   url: "/redfish/v1/UpdateService/FirmwareInventory"}, // Also multipart POST to upload (Note ETag)
    // "m":"post", url: UpdateService/Actions/UpdateService.SimpleUpdate} // SW URL in body
];
var ops_idx = {}; ops.forEach(function (op) { ops_idx[op.id] = op; });

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

var isbodymeth = {"post":1, "put":1, "patch":1, };

function RFOp(opid, conf) {
  var op  = ops_idx[opid];
  this.id = op.id;
  this.m  = op.m;
  this.url = op.url;
  this.msg = op.msg ? JSON.parse(JSON.stringify(op.msg)) : null; // Copy !
  this.conf = op.conf; // TODO: utilize !
}

RFOp.add = function (op) {
  if (!op.id) { throw "No ID for new Op!"; }
  if (ops_idx[op.id]) { throw "Op by id "+op.id+" already in"; }
  ops.push(op);
  ops_idx[op.id] = id;
};

RFOp.prototype.makeurl = function (host, extra) {
  if (host.match(/\/$/)) { host.replace(/\/+$/, ''); }
  if (extra && extra.testurl) { return extra.testurl; }
  return "https://"+host+this.url;
};
RFOp.prototype.sethdlr = function (succcb, errcb) {
  this.succ = succcb;
  this.err = errcb;
  return this;
};
/** Make a request for the operation.
 */
RFOp.prototype.request = function(host, auth) {
  var rfop = this;
  // conf = this.conf || {};
  if (!auth || !auth.user || !auth.pass) { throw "No Credentials"; }
  var bauth = basicauth(auth);
  var hdrs = { Authorization: "Basic "+bauth, "content-type": "application/json", "Accept":"*/*" }; // 
  var msg = this.msg; // Copy ?
  var meth = this.m; //var meth = ops[p.op];
  if (!meth) { throw "request: meth missing in op:" + this.id; }
  // TODO: isbodymeth[meth]
  if (!isbodymeth[meth]) { delete(hdrs["content-type"]); msg = null; }
  var rfurl = this.makeurl(host, auth);
  console.log("Call("+meth+"): "+rfurl + "\nBody: ", msg, " headers: ", hdrs);
  var reqopts = {headers: hdrs, };
  if (!this.succ || !this.err) { throw "One of success/error handlers missing (Call sethdlr(succ,err) for this)"; }
  if (meth == 'post') { axios[meth](rfurl, msg, reqopts).then(this.succ).catch(this.err); }
  if (meth == 'get') { axios[meth](rfurl, reqopts).then(this.succ).catch(this.err); }
};

// https://stackabuse.com/encoding-and-decoding-base64-strings-in-node-js/
  function basicauth(obj) {
    // [DEP0005] DeprecationWarning: Buffer() is deprecated due to security and usability issues.
    // Please use the Buffer.alloc(), Buffer.allocUnsafe(), or Buffer.from() methods instead.
    var buff = new Buffer(obj.user + ":" + obj.pass); // , 'ascii'
    return buff.toString('base64');
  }
  
module.exports = {
  RFOp: RFOp,
  ops_idx: ops_idx,
  basicauth: basicauth
};
