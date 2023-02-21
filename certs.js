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
var Mustache = require("mustache");

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
  if (!cfg) { console.log("No certs config available."); return; } // No certs (features not enabled)!
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
/** Extract certificate info from all files.
 * TODO: Separate infoex(ci, cb)
*/
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
      return cb(null, files);
    })
  }
  async.each(files, infoex, function (err) {
    if (err) { console.log("Error in proc: "+err); return cb(null, files); }
    console.log("Done each !\n");
    cb(null, files);
  });
}
/** Load Cert related files (certs, privkeys) (based on "filealias" or "certs")  */
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


/** List Certificates and Priv Keys in "inventory" (AoO) */
function certslist(req, res) {
  var jr = { status: "err", "msg": "Could not list certs." };
  if (!cfg) { jr.msg += "No cert related config."; return res.json(jr); }
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


//////////////////////////// Cert file sets ///////////////////

// Lookup service config (from AoO )
function servconf(idlbl) {
  if (!Array.isArray(servcfg)) { throw "No serv configs in array !"; }
  var sc = servcfg.find(function (it) { return it.idlbl == idlbl; });
  if (!sc) { throw "No service config (of type '"+idlbl+"') found !"; }
  return sc;
}
/** Generate files on (cloned working copy of) sc.
 * 
 * @param {*} sc 
 */
function certs_genfiles(sc, topcb) {
  var farr = sc.certfiles || []; // 
  sc.cpath = "/tmp/"+process.pid+"."+Math.floor(Date.now() / 1000) ;
  // Generate file by concat or call external command to generate
  function cfgen(fconf, cb) {
    // Generate by command ?
    if (fconf.cmd) {
      fconf.cpath = sc.cpath;  fconf.passphrase = sc.passphrase; // Add (few ?)
      var cmd = Mustache.render(fconf.cmd, fconf);
      cproc.exec(cmd, {cwd: sc.cpath}, function (err, stdout, stderr) {
        //if (err) { return cb(err, null); }
        if (err) { console.log("cfgen Err:", err); return cb(err); } // TODO: Handle
        console.log("Ran w. out: "+stdout);
        return cb(null);
      });
      return; // MUST normal-return
    }
    if (!fconf.files) { console.log("No files, not generating ..."); return cb(null); } // Skip item
    

    // Generate good local name
    if (fconf.dest) { fconf.localfn =  sc.cpath+"/"+path.basename(fconf.dest); }
    else { fconf.localfn = sc.cpath +"/"+fconf.pk+".pem"; }
    // Gather content (1...many)
    fconf.cont =  fconf.files.map((ckey) => {
      // TODO: allow ckey to be a file ? Can use sc.cpath
      // Template string ? TODO: Allow more vars than sc ?
      if (ckey.match(/\{\{/)) {
        ckey = Mustache.render(ckey, sc);
        // Let check below handle the rest
        console.log("Generated ckey fname: '"+ckey+"'");
      }
      if (fs.existsSync(ckey)) { return fs.readFileSync(ckey, 'utf8'); }
      var fnode = files[ckey];
      if (!fnode) { return ''; }
      return fnode.cont;
    }).join('');
    // Early sync (e.g. for coming cmd step)
    if (fconf.sync) {
      if (!fs.existsSync(sc.cpath)) { fs.mkdirSync(sc.cpath); }
      fs.writeFileSync(fconf.localfn, fconf.cont, {encoding: "utf8"} );
    }
    return cb(null);
  }
  //OLD: farr.forEach(cfgen);
  // eachSeries vs mapSeries
  async.eachSeries(farr, cfgen, (err) => {
    if (err) { return topcb("Error generating files: "+ err); }
    return topcb(null);
  });
}
/** Run cert/key processing hook (command) for phase ("pre", "post")
 * Commands are always run in the path (cwd) where files were created in.
*/
function certs_procrun(sc, phase) {
  // Post generation steps. Handle in separate sub ? User parametrized file-names
  var cmdtmpl = sc[phase];
  if (cmdtmpl) {
    // TODO: Possibly merge params from sc (.passphrase) and fitem
    var cmd = Mustache.render(cmdtmpl, sc);
    console.log("Run post-step: "+cmd+ " in "+sc.cpath);
    //return;
    cproc.exec(cmd, {cwd: sc.cpath}, function (err, stdout, stderr) {
      //if (err) { return cb(err, null); }
      if (err) { console.log("Err:", err); return; } // TODO: Handle
      console.log("Ran w. out: "+stdout);
    });
  }
}


/** Create certs (to FS) locally
 * TODO: Treat single file save potentially as async op even if it could be done synchronously
 * as we may want to run cproc.exec() ops.
*/
function certs_save(sc, pb) {
  if (!fs.existsSync(sc.cpath)) { fs.mkdirSync(sc.cpath); } // Directory
  console.log("Created c-path: "+ sc.cpath);
  sc.certfiles.forEach( (fitem) => {
    if (!fitem.files || !fitem.cont) { return; }
    if (fitem.sync) { return; } // Once synced, not again/ twice
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
/** Fill out the (cloned) PB stub with ops to copy cert files into place
 * Notes about fitem:
 * - If dest missing, fileitem is not meant to be copied by PB
 * - If files missing, create debug task
*/
function certs_transfer_pb(sc, pb) {
  var debug = {debug: {msg: "No files or file content?"}};
  
  sc.certfiles.forEach( (fitem) => {
    if (!fitem.dest) { console.log("Skipping not-to-be-copied item ("+fitem.pk+")"); return; }
    if (!fitem.files) { pb.tasks.push(debug); return; } // Test size / fitem.cont ? create debug if empty ?
    // owner: "root", group: "root", "checksum": (sha1)
    pb.tasks.push({name: "Copy "+fitem.pk, "copy": {src: fitem.localfn, dest: fitem.dest, mode: "0600", backup: true}});
  });
  // TODO: openssl to verify 1) chain and crt vs. key (-modulus)
  if (sc.sysd) {
    pb.tasks.push({name: "Restart Service", "systemd": { name: sc.sysd, state: "restarted"}});
  }
  // TODO: if (sc.check)  { // or sc.inst
}
/** Web handler to generate certs set /certrenew */
function install(req, res) {
  var jr = {status: "err", "msg": "Could not generate Cert file set. "};
  var t = req.query.systype ; // || 'gitlab'
  if (!t) { jr.msg += "No '?systype=...' passed. Use one of: "+servcfg.map((it) => { return it.idlbl; }).join(',');
    return res.json(jr);
  }
  var sc = servconf(t);
  sc = dclone(sc); // Working copy
  var pb = dclone(pbstub);
  certs_genfiles(sc, certs_finish); // Generate final Cert/Key content
  //if (req.query.fmt == 'pb') {}
  function certs_finish(err) {
    if (err) { jr.msg += "Err in new async cert file gen.: "+err; return res.json(jr); }
    certs_transfer_pb(sc, pb); // Generate Playbook
    certs_save(sc, pb); // Store on FS (/tmp)
    // certs_procrun(sc, "post");
    // https://github.com/janl/mustache.js/issues/687 . For templating only
    sc.certfiles.forEach((it) => { it.bundle = (it.files.length > 1); });
    res.json({status: "ok", data: { files: sc, pb: pb} });
  }
  
}
/** List systems for certfiles */
function certfileslist(req, res) {
  var jr = {status: "err", "msg": "Could not list Cert file systems. "};
  if (!servcfg) { jr.msg += "No cert associated serfvices configured !"; return res.json(jr); }
  res.json({status: "ok", data: servcfg });
}
if (process.argv[1].match("certs.js")) {
  var ccfn = process.env.HOME+"/.linetboot/certs.conf.json";
  var cc = require(ccfn);
  
  var files = loadfiles(cc.certs);
  certinfo_add(files, (err, data) => {
    console.log(files);
  });
  // console.log(cc);
  
}
module.exports = {
  init: init,
  certslist: certslist,
  install: install,
  certfileslist: certfileslist
};
