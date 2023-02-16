#!/usr/local/bin/node
/**
*
*/
var cproc = require("child_process");
var path  = require("path");
var async = require("async");
var fs    = require("fs");
var path  = require("path");
var yaml  = require('js-yaml');

const { builtinModules } = require("module");

var certsroot = process.env.HOME + "/.linetboot/certs/";
var certlocs = [
  {"sshpath": "user@host:/etc/nginx/ssl/cert_ca.crt", "name": "Cov Nginx"}
];
var cfg = null;
var files = null;
var servcfg = null; // [{}, {}, ...]
var pbstub = {name: "Copy Cert files", become: true, hosts: '{{ host }}', 'tasks': []};
var ycfg = {
  'styles': { '!!null': 'canonical' }, // dump null as ~
  //'sortKeys': true
};
/** */
function init(mcfg) {
  if (mcfg.certs) { cfg = mcfg.certs; }
  // Load files for all use cases / purposes
  var cc = cfg.filealias;
  if (!cc) { console.log("certs files section (file aliases) missing !"); return ; }
  files = loadfiles(cc);
  if (!files) { console.log("No cert/key files loaded !"); return; }
  var xcfg;
  if (cfg.servcfg && fs.existsSync(cfg.servcfg)) {
    xcfg = require(cfg.servcfg);
    if (xcfg && xcfg.servcfg) { servcfg = xcfg.servcfg; }
    if (!Array.isArray(servcfg)) { console.log("Serice config not in array"); return; }
    module.exports.servcfg = servcfg;
  }
}
function dclone(d) {
  return JSON.parse(JSON.stringify(d));
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
  // TODO: Keep cb-compat between async each() and map() ?
  var infoex = function (ci, cb) {
    if (ci.type != 'cert') { return cb(null); }
    var cmd = `openssl x509 -in ${ci.fname} -noout -text`;
    //console.log("Got: "+ ci); // cb(null);
    //console.log("CMD: "+ cmd); // cb(null);
    cproc.exec(cmd, function (err, stdout, stderr) {
      //console.log("Ran shell: "+err);
      // console.log("Ran shell out: "+stdout);
      if (err) { return cb(err, null); }
      
      // ci.processed = 1;
      var m;
      if (m = stdout.match(/\bIssuer:\s*(.+)$/m))     { ci.issuer = m[1]; }
      if (m = stdout.match(/\bSubject:\s*(.+)$/m))    { ci.subject = m[1]; }
      if (m = stdout.match(/\bNot Before\s*:\s*(.+)$/m)) { ci.notbefore = m[1]; }
      if (m = stdout.match(/\bNot After\s*:\s*(.+)$/m))  { ci.notafter = m[1]; }
      if (m = stdout.match(/\bSignature Algorithm:\s*(.+)$/m))   { ci.signalgo = m[1]; }
      //if (m = stdout.match(/\bSignature Algorithm:\s*(.+)$/m)) { ci.notafter = m[1]; }
      // Refine parsed
      ci.isroot = (ci.issuer == ci.subject) ? 1 : 0;
      if (ci.issuer && (m = ci.issuer.match(/CN=(.+)$/)) )   {  ci.issuer_cn = m[1]; }
      if (ci.subject && (m = ci.subject.match(/CN=(.+)$/)) ) {  ci.subject_cn = m[1]; }
      // Could strip: T12:00:00.000Z or as min .000Z .split("T")[0] OR 
      if (ci.notbefore) { ci.notbefore_i = new Date(ci.notbefore).toISOString().replace(".000Z", "").replace("T", " "); }
      if (ci.notafter)  { ci.notafter_i  = new Date(ci.notafter).toISOString().replace(".000Z", "").replace("T", " "); }
      //console.log("NOW:", ci);
      return cb(null); // FIXME: NOT (2nd): files
    })
  }
  async.each(files, infoex, function (err) {
    if (err) { console.log("Error in proc: "+err); return cb(null, files); }
    console.log("Done each !\n");
    cb(null, files);
  });
}

function loadfiles(fmap) {
  var files = {}; // File cache
  Object.keys(fmap).forEach((k) => {
    var fname = fmap[k];
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
  var cc = cfg.filealias;
  if (!cc) { jr.msg += "certs files section (file aliases) missing !"; return res.json(jr); }
  var files = loadfiles(cc);
  certinfo_add(files, (err, data) => {
    if (err) { jr.msg += "Error: "+err; return res.json(jr); }
    //console.log(files);
    // Map to array
    var arr = Object.keys(files).map(function (k) { delete(files[k].cont); return files[k]; });
    res.json({status: "ok", data: arr});
  });
}

function certs_genfiles(sc) {
  var farr = sc.certfiles || []; // 
  sc.cpath = "/tmp/"+process.pid+"."+Math.floor(Date.now() / 1000) ;
  // TODO: Add properties to working copy (fconf), don't create allcerts !!!
  farr.forEach(function (fconf) {
    // Generate good local name
    fconf.localfn =  sc.cpath+"/"+path.basename(fconf.dest);
    // Gather content (1...many)
    fconf.cont =  fconf.files.map((ckey) => {
      // TODO: allow ckey to be a file ?
      if (fs.existsSync(ckey)) { return fs.readFileSync(ckey, 'utf8'); }
      var fnode = files[ckey];
      if (!fnode) { return ''; }
      return fnode.cont;
    }).join('');
  });
}
// Lookup service config
function servconf(idlbl) {
  if (!Array.isArray(servcfg)) { throw "No serv configs in array !"; }
  var sc = servcfg.find(function (it) { return it.idlbl == idlbl; });
  if (!sc) { throw "No service config (of type '"+idlbl+"') found !"; }
  return sc;
}

/** Create certs locally */
function certs_save(sc, pb) {
  fs.mkdirSync(sc.cpath); // Directory
  console.log("Created c-path: "+ sc.cpath);
  sc.certfiles.forEach( (fitem) => {
    fs.writeFileSync(fitem.localfn, fitem.cont, {encoding: "utf8"} );
    console.log("Created cert-file: "+ fitem.localfn);
  });
  // YAML (and JSON for debug)
  if (pb) {
    var pbcont0 = JSON.stringify(pb, null, 2);
    var pbcont  = yaml.safeDump([pb], ycfg);
    fs.writeFileSync(sc.cpath + "/cert_trans.json", pbcont0, {encoding: "utf8"} );
    fs.writeFileSync(sc.cpath + "/cert_trans.yaml", pbcont, {encoding: "utf8"} );
  }
}
/** Fill out the (cloned) PB stub with ops to copy cert files into place */
function certs_transfer_pb(sc, pb) {
  sc.certfiles.forEach( (fitem) => {
    // owner: "root", group: "root", "checksum": (sha1)
    pb.tasks.push({name: "Copy "+fitem.pk, "copy": {src: fitem.localfn, dest: fitem.dest, mode: "0600", backup: true}});
  });
  // TODO: if (sc.check)  { // or sc.inst
}
/** /certrenew */
function renew(req, res) {
  var t = req.query.systype || 'gitlab';
  var sc = servconf(t);
  sc = dclone(sc); // Working copy
  var pb = dclone(pbstub);
  certs_genfiles(sc);
  //if (req.query.fmt == 'pb') {}
    certs_transfer_pb(sc, pb); // OLD: acs
    certs_save(sc, pb);
  //}
  res.json({status: "ok", data: { files: sc, pb: pb} });
}

if (process.argv[1].match("certs.js")) {
  var ccfn = process.env.HOME+"/.linetboot/certs.conf.json";
  var cc = require(ccfn);
  
  var files = loadfiles(cc.certs);
  certinfo_add(files, () => {
    console.log(files);
  });
  // console.log(cc);
  
}
module.exports = {
  init: init,
  certslist: certslist,
  renew: renew
};
