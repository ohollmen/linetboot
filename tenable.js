// Tenable Install/Updates availability

var axios = require("axios");
var Getopt = require("node-getopt");
var cfg = {};
var fnpatt = /el\d\.x86_64/;
var pvpatt = /SC-202[456789]/;

function init(_mcfg) {
  if (_mcfg.tenable) { cfg = _mcfg.tenable; }
  else { cfg = _mcfg; }
  //console.log(cfg);
  if (cfg.fnpatt) { fnpatt = new RegExp(cfg.fnpatt); }
  if (cfg.pvpatt) { pvpatt = new RegExp(cfg.pvpatt); }
}

function sc_patch(r) {
  var relkeys = Object.keys(r);
  relkeys = relkeys.filter( (rk) => { return rk.match(/Patch/) && rk.match(pvpatt); });
  //console.log(relkeys);
  var arr = [];
  relkeys.forEach( (k) => {
    arr = arr.concat(r[k]);
    // console.log("Concat "+r[k].length);
  });
  console.log(`Got ${arr.length} Patch items (check date for fit).`);
  console.log(JSON.stringify(arr, null, 2));
  return arr;
}

function sc_proc(d, opts) {
  var l = d.releases.latest;
  var k = Object.keys(l)[0];
  // Capture version from key ?
  var ver = ""; var m; // OR "version" property
  if (m = k.match(/(\d\.\d\.\d)/)) { ver = m[1]; }
  var l = l[k];
  l = l.filter(filtcb);
  console.log(JSON.stringify(l, null, 2));
  var arr = sc_patch(d.releases);
  if (opts.cmds) {
    tocurl(l[0], opts.rpara);
    tocurl(arr[0], opts.rpara);
  }
}
function nes_proc(d, opts) {
  var l = d.releases.latest;
  var k = Object.keys(l)[0];
  var l = l[k];
  l = l.filter(filtcb);
  console.log(JSON.stringify(l, null, 2));
  if (opts.cmds) {
    // Note: name may be (e.g.) Nessus-latest-el8.x86_64.rpm
    // Should have curl rename (-o) to version number name given in member "file".
    l[0].nessus = true;
    tocurl(l[0], opts.rpara);
  }
}

function tocurl(dn, rpara) {
  var bcmd = `curl -X GET '${dn.file_url}'`;
  if (rpara.headers && dn.requires_auth) {
    var ks = Object.keys(rpara.headers);
    ks.forEach( (k) => { bcmd += ` --header '${k}: ${rpara.headers[k]}'`; });
  }
  if (dn.nessus) { bcmd += " -o "+dn.file; }
  else { bcmd += " -O"; }
  console.log(bcmd);
  return bcmd;
}
function filtcb(e) {
  if (e.os && (e.os != 'Linux')) { return 0; }
  // e.os == 'Linux' &&
  return  e.file.match(fnpatt);
}
function lsitems(opts) {
  var url = cfg.apiurl;
  var cb = (d) => { console.log(JSON.stringify(d, null, 2)); }
  if (opts.op == 'top')  { url += ""; }
  if (opts.op == 'sc')   { url += "/security-center"; cb = sc_proc; }
  if (opts.op == 'nessus') { url += "/nessus"; cb = nes_proc; } 
  if (opts.op == 'audit') { url += "/download-all-compliance-audit-files"; } // cb = nes_proc; }
  var rpara = { headers: {"Authorization": "Bearer "+cfg.token}}
  //console.log(rpara, url);
  axios.get(url, rpara).then( (resp) => {
    var d = resp.data;
    // Re-org
    //console.log(d);
    opts.rpara = rpara;
    cb(d, opts);
    opts.rpara = null;
    
  });
}

function usage(msg) {
  if (msg) { console.log(msg); }
  console.log("Use one of the subcommands:");
  acts.forEach( (sc) => { console.log(`- ${sc.id} - ${sc.title}`) });
  process.exit(1);
}

var acts = [
  {"id": "top",    "title": "Show API top-level entrypoints", "cb": lsitems, },
  {"id": "sc",     "title": "Show SC download options", "cb": lsitems, },
  {"id": "nessus", "title": "Show Nessus Download options", "cb": lsitems, },
  {"id": "audit", "title": "Show Audit Download options", "cb": lsitems, },
];

var clopts = [
  ["p", "path=ARG", "Path to download items to."],
  ["c", "cmds", "Generate download Commands."],
];

if (process.argv[1].match(/\btenable.js$/)) {
  var argv2 = process.argv.slice(2);
  var op = argv2.shift();
  if (!op) { usage("No subcommand passed !"); }
  var opn = acts.find( (a) => { return a.id == op; });
  var cfgfn = process.env.HOME + "/.linetboot/global.conf.json";
  var mcfg = require(cfgfn);
  // console.log(mcfg);
  if (!mcfg) { usage("No config !"); }
  init(mcfg);
  ////// 
  // var op = process.argv[2];
  console.log("OP: "+op);
  // OLD: var opts = {};
  var getopt = new Getopt(clopts);
  var opt = getopt.parse(argv2);
  let opts = opt.options;
  opts.op = op;
  opn.cb(opts);
  //lsitems(opts);
}

module.exports = {};
