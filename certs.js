#!/usr/local/bin/node
/**
* ## Properties of system config nodes
* - idlabel - symbol label by which config can be referred (no spaces, preferably no camel-casing)
* - name - Displayable name for system config
* - certfiles (array-of-objects) - Files or generation steps (in appropriate sequence) to compose or generate files needed for SSL to work on host. Objects have

* 
* ## Certfiles objects (in array-of-object)
* The Nodes can be of 2 types:
* - file ("files") concat definition - a recipe to concatenate Standard PEM certificate or private key files in very particular order into a file that service will then use
* - command ("cmd") execution - a (templated) command to run to generate new files
*
* ### File definition nodes (Concatenation)
* - files (array-of-string) - File labels for PEM files that must be concateneted to make up a bundle file or (array of) one label to use file as-is (without bundling).
*   These may also be resolvable filenames on filesystems (e.g. after command was run and created the file)
* - sync - sync the in-memory copy of created file to filesystem early to have it available for following command steps
* ### Command definition (File generation via commands)
* - cmd - Command (with possible templating fragments) to generate or otherwise manipulate SSL file artifacts
* - pk special behaviour ???
* ### Common properties
* - pk - ID Key by which the node is referrable (TODO: key)
* Note: Must have "cpath" (path where files are stored) available for templating
* TODO:
* - standardize cert symbol names to "servercert","privkey","cainter", "caroot" ("caprivkey" ?) and weed out suffixes (e.g _net, _com) from syms.
* - allow app AND env specific overrides in initial cert mappings. Allow these to exist in maps with some kind of dot-notation.
*   - Ath the time of choosing cert try more specific first then fall back naturally.

*/
var cproc = require("child_process");
var path  = require("path");
var async = require("async");
var fs    = require("fs");
var path  = require("path");
var yaml  = require('js-yaml');
var Mustache = require("mustache");

const { builtinModules } = require("module");

var certsroot = process.env.HOME + "/.linetboot/certs/"; // only used by foo()
var certlocs = [
  {"sshpath": "user@host:/etc/nginx/ssl/cert_ca.crt", "name": "Cov Nginx"}
];
var cfg = null;
var files = null;
var servcfg = null; // [{}, {}, ...]
var pbstub = {name: "Copy Cert files", become: true, hosts: '{{ host }}', "vars": {"finalcopy": 0}, 'tasks': []};
var ycfg = {
  'styles': { '!!null': 'canonical' }, // dump null as ~
  //'sortKeys': true
  lineWidth: 200
};
/** */
function init(mcfg) {
  console.log("certs.init() Running");
  if (mcfg.certs) { cfg = mcfg.certs; }
  else { cfg = mcfg; }
  if (!cfg) { console.log("No certs config available."); return; } // No certs (features not enabled)!
  // Load files for all use cases / purposes
  var cc = cfg.filealias;
  if (!cc) { console.log("certs files section (file aliases) missing !"); return ; }
  if (!cfg.certbase) { console.log("No certificate base directory given."); return; }
  if (!fs.existsSync(cfg.certbase)) { console.log("certificate base directory ("+cfg.certbase+") does not exist."); return; }
  files = loadfiles(cc);
  if (!files) { console.log("No cert/key files loaded !"); return; }
  var xcfg; // serv. cfg
  if (cfg.servcfg && fs.existsSync(cfg.servcfg)) {
    xcfg = require(cfg.servcfg);
    if (xcfg && xcfg.servcfg) { servcfg = xcfg.servcfg; }
    if (!Array.isArray(servcfg)) { console.log("Service config not in array"); return; }
    module.exports.servcfg = servcfg;
  }
  // return module.exports;
}
function dclone(d) {
  return JSON.parse(JSON.stringify(d));
}
// Merge params from sc, fconf (if present) and sc.params (if present). Add other contextual params: ...
function para_merge(sc, fconf) {
  var p = dclone(sc);
  if (fconf) { Object.keys(fconf).forEach( (k) => { p[k] = fconf[k]; } ); }
  // Merge sc.params (if present)
  if (sc.params && (typeof sc.params == 'object') ) {
    Object.keys(sc.params).forEach( (k) => { p[k] = sc.params[k]; } );
  }
  p.timems = Date.now();
  return p;
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
      if (m = stdout.match(/\bSerial Number:\s*([\w:]+)/s)) { ci.serial = m[1]; }
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
/** Load Cert related files (certs, ca-certs, privkeys) (based on "filealias" or OLD:"certs")  */
function loadfiles(fmap) {
  var files = {}; // File cache (by key-names found in fmap)
  var certbase = ""; // Root/Base dir From config (see init())
  Object.keys(fmap).forEach((k) => {
    var fname = fmap[k];
    // Non-abs. / Relative paths are always relative to certbase
    if (!fname.match(/^\//)) { fname = cfg.certbase + "/"+ fname; }
    if (!fs.existsSync(fname)) { console.log("Cert File "+fname+" not found on FS."); return; }
    if (!files[k]) { files[k] = {  fname: fname, bfname: path.basename(fname) }; }
    files[k].cont = fs.readFileSync(fname, 'utf8');
    // "...key..." anywhere in name (be more explicit about this ? e.g. try to find in key k)
    if (fname.match(/\.key$/)) { files[k].type = 'key'; }
    else { files[k].type = 'cert'; }
  });
  return files;
}


/** List Certificates and Priv Keys in "inventory" (AoO) (e.g. /certslist) */
function certslist(req, res) {
  var jr = { status: "err", "msg": "Could not list certs. " };
  if (!cfg) { jr.msg += "No cert related config."; return res.json(jr); }
  var cc = cfg.filealias;
  if (!cc) { jr.msg += "certs files section (file aliases) missing !"; return res.json(jr); }
  var files = loadfiles(cc); // done / do at init() + dclone() ? Keep cloned to remove "cont"
  certinfo_add(files, (err, data) => {
    if (err) { jr.msg += "Error: "+err; return res.json(jr); }
    //NOT: if (!Array.isArray(data)) { jr.msg += "Cert info not returned in Array"; return res.json(jr); }
    //NOT: if (!data.length) { jr.msg += "No (0) Cert info items Array"; return res.json(jr); }
    //console.log(files);
    // Map to array
    var arr = Object.keys(files).map(function (k) { delete(files[k].cont); return files[k]; });
    res.json({status: "ok", data: arr});
  });
}


//////////////////////////// Cert file sets ///////////////////

// Lookup service config (from AoO ) by it's type / idlbl.
function servconf(idlbl) {
  if (!Array.isArray(servcfg)) { throw "No serv configs in array !"; }
  var sc = servcfg.find(function (it) { return it.idlbl == idlbl; });
  if (!sc) { throw "No service config (of type '"+idlbl+"') found !"; }
  return sc;
}
/** Generate files on (cloned working copy of) sc.
 * 
 * @param {*} sc (cpath = local (and asible remote ?) cert temp path)
 * @param topcb - cb to call w. error (null == Success, no error)
 */
function certs_genfiles(sc, topcb) {
  var farr = sc.certfiles || []; // 
  sc.cpath = "/tmp/"+process.pid+"."+Math.floor(Date.now() / 1000) ;
  if (!sc.params) { sc.params = {}; }
  // Generate single file by concat or call external command to generate (Async).
  // Uses (e.g.) contextual var sc
  function cfgen(fconf, cb) {
    console.log(`Create content for file (by key=${fconf.pk}) dest-to: `+fconf.dest+"");
    // Generate by command ?
    if (fconf.cmd) {
      //var sc2 = dclone(sc); // sc as Base params
      //Object.keys(fconf).forEach( (k) => { sc2[k] = fconf[k]; } );
      // fconf.cpath = sc.cpath;  fconf.passphrase = sc.passphrase; // Add (few ?)
      var sc2 = para_merge(sc, fconf);
      var cmd = Mustache.render(fconf.cmd, sc2); // Initial: params from fconf. Now: merged
      console.log("Generated cmd, Planning to run: "+cmd);
      cproc.exec(cmd, {cwd: sc.cpath}, function (err, stdout, stderr) {
        //if (err) { return cb(err, null); }
        if (err) { console.log(`cfgen Err (${err.code}):`, err); return cb(err); } // TODO: Handle
        console.log("Ran(success) w. out: "+stdout);
        return cb(null);
      });
      return; // MUST normal-return
    }
    if (!fconf.files) { console.log("No files, not generating ..."); return cb(null); } // Skip item
    

    // Generate good local name
    if (fconf.dest) { fconf.localfn =  sc.cpath+"/"+path.basename(fconf.dest); } // Explicit name
    else { fconf.localfn = sc.cpath +"/"+fconf.pk+".pem"; } // Implicit, made-up name
    console.log(`Local fname: ${fconf.localfn} with ${fconf.files.length} file frags`);
    // Add pk_sym => filename to params (to use e.g. in pb creation)
    sc.params[fconf.pk] = fconf.localfn;
    // Gather / join content (1...many). ckey is key like cainter
    fconf.cont =  fconf.files.map( (ckey) => {
      
      // TODO: allow ckey to be a file ? Can use sc.cpath
      // Template string ? TODO: Allow more vars than sc ?
      if (ckey.match(/\{\{/)) {
        // TODO: dclone() and Add to sc ? var sc2 = para_merge(sc, fconf);
        ckey = Mustache.render(ckey, sc); // Use sc as param context (sc.params)
        // Let check below handle the rest
        console.log("Generated ckey fname: '"+ckey+"'");
      }
      // Try to look from filesys (if previous cmd-item created this)
      if (fs.existsSync(ckey)) { return fs.readFileSync(ckey, 'utf8'); }
      var fnode = files[ckey]; /// or from file cache
      if (!fnode) { return ''; }
      return fnode.cont;
    }).join('');
    // Early sync (e.g. for coming cmd step)
    if (fconf.sync) {
      if (!fs.existsSync(sc.cpath)) { fs.mkdirSync(sc.cpath); }
      fs.writeFileSync(fconf.localfn, fconf.cont, {encoding: "utf8"} );
    }
    return cb(null);
  } // END cfgen()
  //OLD: farr.forEach(cfgen); - will not work for async (cproc/shell) commands.
  // eachSeries (ordered) vs. mapSeries
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
    // var sc2 = para_merge(sc, fconf);
    var cmd = Mustache.render(cmdtmpl, sc); // sc or sc.params ?
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
    if (!fitem.files || !fitem.cont) { console.log(`pk=${fitem.pk}: No files or no content (!?) - nothing to save`); return; }
    if (fitem.sync) { console.log(`pk=${fitem.pk} Already saved, not saving.`); return; } // Once synced, not again/ twice
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
  // Checksum files

}
/** Fill out the (cloned) PB stub with ops to copy cert files into place
 * Notes about fitem:
 * - If dest missing, fileitem is not meant to be copied by PB
 * - If files missing, create debug task
*/
function certs_transfer_pb(sc, pb) {
  var debug = {debug: {msg: "No files or file content?"}};
  pb.name += " for " + sc.name; // Customize
  var copytasks = [];
  sc.certfiles.forEach( (fitem) => {
    if (!fitem.dest) { console.log("Skipping not-to-be-copied item ("+fitem.pk+")"); return; }
    if (!fitem.files) { pb.tasks.push(debug); return; } // Test size / fitem.cont ? create debug if empty ?
    // owner: "root", group: "root", "checksum": (sha1)
    var fmode = sc.chmod || "0600";
    pb.tasks.push({name: "Copy "+fitem.pk, "copy": {src: path.basename(fitem.localfn), // fitem.localfn
      dest: fitem.dest,
      mode: fmode, backup: true}});
    copytasks.push({name: "Copy to final loc", shell: "cp -p "+ fitem.localfn + " "+fitem.dest, when: "finalcopy"});
  });
  // Cert install command
  if (sc.instcmd) {
    let cmd = sc.instcmd;
    // var sc2 = para_merge(sc, fconf);
    if (cmd.match(/\{\{/)) { cmd = Mustache.render(cmd, sc.params); }
    pb.tasks.push({name: "Install Certs by a Command", "shell": cmd});
  }
  //else {
    copytasks.forEach( (ct) => { pb.tasks.push(ct); });
  //}
  // TODO: openssl to verify 1) chain and crt vs. key (-modulus)
  if (sc.sysd) {
    pb.tasks.push({name: "Restart Service", "systemd": { name: sc.sysd, state: "restarted"}, when: "finalcopy"});
  }
  // TODO: if (sc.check)  { // or sc.inst
}
/** Web handler to generate certs set /certrenew
 * - Generates files on FS (+ data structure, meta), which calls back certs_finish(), which ...
 * - Creates In-mem Play
 * - Saves play
*/
function install(req, res) {
  var jr = {status: "err", "msg": "Could not generate Cert file set. "};
  var t = req.query.systype ; // || 'gitlab'
  if (!t) { jr.msg += "No '?systype=...' passed. Use one of: "+servcfg.map((it) => { return it.idlbl; }).join(',');
    return res.json(jr);
  }
  var sc = servconf(t); // systype
  sc = dclone(sc); // Working copy of system cert spec (cloned from original)
  var pb = dclone(pbstub); // Play copy
  certs_genfiles(sc, certs_finish); // Generate final Cert/Key content
  //if (req.query.fmt == 'pb') {}
  function certs_finish(err) {
    if (err) { jr.msg += "Err in new async cert file gen.: "+err; return res.json(jr); }
    certs_transfer_pb(sc, pb); // Generate Playbook
    certs_save(sc, pb); // Store on FS (/tmp)
    // certs_procrun(sc, "post");
    // https://github.com/janl/mustache.js/issues/687 . For templating only
    sc.certfiles.forEach((it) => { it.bundle = it.files && (it.files.length > 1); });
    //res.json({status: "ok", data: { files: sc, pb: pb} }); // Orig
    sc.pb = pb;
    res.json({status: "ok", data: sc });
  }
  
}
/** List systems for certfiles (e.g. "certsystems") */
function certfileslist(req, res) {
  var jr = {status: "err", "msg": "Could not list Cert file systems. "};
  if (!servcfg) { jr.msg += "No cert associated services configured !"; return res.json(jr); }
  res.json({status: "ok", data: servcfg });
}

// CLI Main
if (process.argv[1].match("certs.js")) {
  var linconfpath = process.env.HOME+"/.linetboot/";
  var mcfg = require(linconfpath+"global.conf.json"); // Should use maincfg wrapper
  var ccfg = mcfg.certs;
  if (!ccfg) { throw "No certs section in main config"; }
  // Check object if (typeof ccfg != 'object') { throw ""; }
  var ccfn = process.env.HOME+"/.linetboot/certs.conf.json";
  var cc = require(ccfn);
  // TODO: init() here ?
  var files = loadfiles(cc.certs); // DO NOT Use cc.cets !!!
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
