#!/usr/local/bin/node
/**
*
*/
var cproc = require("child_process");
var path  = require("path");
var async = require("async");
var fs    = require("fs");
var path  = require("path");

var certsroot = process.env.HOME + "/.linetboot/certs/";
var certlocs = [
  {"sshpath": "user@host:/etc/nginx/ssl/cert_ca.crt", "name": "Cov Nginx"}
];
var cfg = null;
function init(mcfg) {
  if (mcfg.certs) { cfg = mcfg.certs; }
}

function foo() {
  certlocs.forEach((it) => {
    var bn = path.basename(it.sshpath);
    var tgt = certsroot+"/"+bn;
    var cmd_cp = "scp "+it.sshpath+" "+tgt;
    var cmd_show = "openssl x509 -in "+tgt+" -text -noout";
    console.log(cmd_cp);
    console.log(cmd_show);
  });
}

function certinfo_add(files, cb) {
  if (!files || (typeof files != 'object') ) { console.log("No object !"); return; }
  var cmd = "openssl x509 -in '{{ fname }}' -noout -text"; // -modulus
  //Object.keys(files).forEach((k) => {
  //  var ci = files[k];
  //});
  // Note: This receives objects (to mutate)
  var infoex = function (ci, cb) {
    if (ci.type != 'cert') { return cb(null); }
    var cmd = `openssl x509 -in ${ci.fname} -noout -text`;
    //console.log("Got: "+ ci); // cb(null);
    //console.log("CMD: "+ cmd); // cb(null);
    cproc.exec(cmd, function (err, stdout, stderr) {
      //console.log("Ran shell: "+err);
      // console.log("Ran shell out: "+stdout);
      if (err) { return cb(err); }
      
      // ci.processed = 1;
      var m;
      if (m = stdout.match(/\bIssuer:\s*(.+)$/m))     { ci.issuer = m[1]; }
      if (m = stdout.match(/\bSubject:\s*(.+)$/m))    { ci.subject = m[1]; }
      if (m = stdout.match(/\bNot Before\s*:\s*(.+)$/m)) { ci.notbefore = m[1]; }
      if (m = stdout.match(/\bNot After\s*:\s*(.+)$/m))  { ci.notafter = m[1]; }
      if (m = stdout.match(/\bSignature Algorithm:\s*(.+)$/m))   { ci.signalgo = m[1]; }
      //if (m = stdout.match(/\bSignature Algorithm:\s*(.+)$/m)) { ci.notafter = m[1]; }
      ci.isroot = (ci.issuer == ci.subject) ? 1 : 0;
      if (ci.issuer && (m = ci.issuer.match(/CN=(.+)$/)) )   {  ci.issuer_cn = m[1]; }
      if (ci.subject && (m = ci.subject.match(/CN=(.+)$/)) ) {  ci.subject_cn = m[1]; }
      //console.log("NOW:", ci);
      return cb(null);
    })
  }
  async.each(files, infoex, function (err) {
    if (err) { console.log("Error in proc: "+err); return cb(files); }
    console.log("Done each !\n");
    cb(files);
  });
}

function loadfiles(cc) {
  var files = {}; // File cache
  Object.keys(cc.certs).forEach((k) => {
    var fname = cc.certs[k];
    if (!fs.existsSync(fname)) { return; }
    if (!files[k]) { files[k] = {  fname: fname, bfname: path.basename(fname) }; }
    files[k].cont = fs.readFileSync(fname, 'utf8');
    if (fname.match(/\.key$/)) { files[k].type = 'key'; }
    else { files[k].type = 'cert'; }
  });
  return files;
}
/** List Certificates */
function certslist(req, res) {
  var jr = {status: "err", "msg": "Could not list certs."};
  var cc = {} // TODO: cfg.filealias
  if (!cc) { jr.msg += "certs files section (file aliases) missing !"; return res.json(jr); }
  var files = loadfiles(cc);
  certinfo_add(files, (err, data) => {
    if (err) { return res.json(jr); }
    //console.log(files);
    // Map to array
    var arr = Object.keys(files).map(function (k) { return files[k]; });
    res.json({status: "ok", data: arr});
  });
}

if (process.argv[1].match("certs.js")) {
  var ccfn = process.env.HOME+"/.linetboot/certs.conf.json";
  var cc = require(ccfn);
  
  var files = loadfiles(cc);
  certinfo_add(files, () => {
    console.log(files);
  });
  // console.log(cc);
  
}
module.exports = {
  init: init,
  certslist: certslist,
};
