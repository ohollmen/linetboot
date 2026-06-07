/* HTTP views
* Allow any open / authenticated REST/JSON source to be be viewed as
* Grid table (JSGrid ?)
* ## Config
* Config item should have following
* - id - view id to be used from CLI
* - url - External URL to fetch AoO from
* - localurl - local URL to attach handler to
* - arrsel - Array selection dot-notation expression in case array is not
*   on top of the structure
* - user - Username (for basic auth)
* - pass - Password for basic auth
* - token - Singular Token for Bearer authentication
* - TODO: - fmt -format other than (default) JSON (i.e. "yaml")
* 
* ## TODO
* - Use Jira/Other module for adding creds
* - Allow file sources (also ones cached from an URL, implement caching here ?)
* - Allow formats other than JSON (CSV ? YAML ?)
* Example API resources
* - https://developer.tenable.com/reference/downloads
* - https://www.tenable.com/downloads/api-docs
*/
var fs    = require("fs");
var path  = require("path");
var axios = require("axios");
var cfl   = require("./confluence.js"); // For add_basic_creds() ONLY
// var datapop = require("./datapop.js");
var cfg = {};
var cbmod = null; // Transformational callbacks, etc.
/** Init htview mainly based on .js config file (JS for the code/callbacks)  */
function init(mcfg, app) {
  if (mcfg["htview"]) { cfg = mcfg["htview"]; }
  else { cfg = mcfg; }
  if (!cfg) { console.error("htview: No config found");  return; }
  console.log(`htview: init !!!`);
  // TODO: Secondary (separate file) for configs !!! (e.g. htviews.conf.json)
  var views;
  if (cfg.conffn) { views = require(cfg.conffn); } // Rely on ext. conf file
  else { views = cfg.views; } // Use "views" array directly from config
  if (!views) { console.error("htview: No views configured (in main conf or ext. conf)");  return; }
  if (!Array.isArray(views)) { console.error("htview: views not configured in a Array !");  return; }
  // NOT: cfg = _cfg;
  // Try js. Transformation cb:s ?
  if (cfg.datacbmodule) { cbmod = require(cfg.datacbmodule); console.log(`htview CB:s loaded from ${cfg.datacbmodule}`); }
  // TODO: merge callbacks to RT version of original config
  // if (cbmod) { ... }
  if (!app) { console.error(`htview: No App ! Need app to set data URLs.`); return; } // Not a (express) webapp context
  let home = process.env['HOME'];
  // Mark unusable items disabled !
  views.forEach( (v) => {
    if (!v.localpath) { console.error(`No URL path for view profile '${v.id}' - skip.`); v.disa = 1; return; }
    // Expand tilde here (exceptionally - usually in mainfconf)
    if (v.fn && v.fn.match("~")) {
      v.fn = v.fn.replace(/~/g, home);
      if (!fs.existsSync(v.fn)) { console.error(`htview: Local data file '${v.fn}' does resolve.`); v.disa = 1; return; }
      // Cache (smaller files) ?
    }
    console.log(`htview: Adding ${v.localpath}`);
    app.get(v.localpath, htview_send);
  });
}
/** Merge data transformation callbacks to original structure (at init()).
 * If structure of datacb changes, do changes ONLY here.
*/
function datacb_merge(views, cbmod) {
  views.forEach( (htvc) => {
    // Lookup any callbacks from cbmod
    // if ( cbmod[] ) {}
  });
  // function alookup(item) { // from *Array*
  //  var cbnode = cbmod.find( () => {  } );
  //}
}

// Select data from dot-path
// TODO: Support "ONLYKEY" as a special case for unique/only key, but not a constant string.
function data_select(d, vp) {
  if (!vp.arrsel) { return d; }
  if (vp.arrsel == 'ONLYKEY') {
    let keys = Object.keys(d);
    // Additionally ... && Array.isArray(d[keys[0]]) ???
    if (keys.length == 1 && d[keys[0]]) { return d[keys[0]]; }
    return null;
  }
  var as = vp.arrsel.split(/\./);
  var i = 0;
  // && is_object( d[ as[i] ] )
  for (i=0;as[i] && d[ as[i] ];i++) { d = d[ as[i] ]; }
  if (!d) { console.error("No (truthy) data remains after selecting by dot-notation !"); }
  return d;
}
// Load JSON - even if suffix is not .json.
// Assume file presence to be validated outside
function json_load(fn) {
  var cont = fs.readFileSync(fn, 'utf8');
  try { return JSON.parse(cont); }
  catch (ex) { console.error(`Failed to parse ${fn} as JSON !`); return null; }
}

function htview_send(req, res) {
  var jr = { status: "err", msg: "Could not create htdata result. " };
  // Resolve url to profile. Note: url should not have query params (?k1=v1&k2=v2&...) to work
  if (!cfg.views || !Array.isArray(cfg.views)) { jr.msg += `No views to lookup from.`; return res.json(jr); }
  // TODO: Possibly do (parse):
  let id = path.basename(req.url); // Match by id: { return id = vp.id; }
  let vp = cfg.views.find( (vp) => { return req.url == vp.localpath; } );
  if (!vp) { jr.msg += `No view profile (for path '${req.url}') found.`; console.error(jr.msg); return res.json(jr); }
  var d = htdata(vp, (err, d) => {
    if (err) { jr.msg += `Problem: ${err}`; return res.json(jr); }
    // Inject additional info ?
    return res.json({status: "ok", data: d});
  });
  // if (!d) { jr.msg += ""; return res.json(jr); }
  //res.json({status: "ok", data: d});
}

/** GET data by http (GET) and
 * Optionally use dot-notation selctor to access correct data within returned JSON data.
 * @param vp - view profile (params)
 */
function htdata(vp, cb) {
  var rpara = {}; // axios GET
  if (vp.user || vp.pass || vp.token) {
    cfl.add_basic_creds(vp, rpara);
    rpara.headers.Accept = "application/json";
  }
  if (vp.debug) { console.log("rpara: ", rpara); }
  if (vp.disa) { return cb(`view profile disabled (due to inactivation or error).`, null); }
  // Allow local fn
  if (vp.fn) {
    if (!fs.existsSync(vp.fn)) { return cb(`file for htdata does not exist.`, null); }
    //var cont = fs.readFileSync(vp.fn, 'utf8');
    //if (!cont) { return cb(`file for htdata does not have content.`, null); }
    // TODO: Multi-format support
    let d = json_load(vp.fn);
    if (!d) { return cb(`Could not parse JSON data !`, null); }
    if (vp.arrsel) { d = data_select(d, vp); }
    if (!d) { console.log(`No data left after dot-path lookup !`);return cb(``, null); }
    return cb(null, d);
  }
  axios.get(vp.url, rpara).then( function (resp) {
    if (vp.debug) { console.error("Then ..."); } // return;
    let d = resp.data;
    //console.log("Got initial data: "+ d);
    // TODO: Implement a meta-notation like _ONLYKEYVAL, _FIRSTITEM to select / transform
    // in a special way
    if (vp.arrsel) { d = data_select(d, vp); }
    //console.log(d);
    cfg.debug && console.error( JSON.stringify(d, null, 2) );
    return cb(null, d);
  }).catch( function (ex) {
    let err = `Error fetching data for view: ${ex}`;
    console.log(err);
    return cb(err, null);
  });
  //console.log("end-of-htdata");
  // TODO: Common post-validate after dot-not select and return cb(...) ?
  function retdata(vp, d) {
    if (vp.arrsel) { d = data_select(d, vp); }
    if (!d) { console.log(`No data left after dot-path lookup !`);return cb(``, null); }
    return cb(null, d);
  }
}

function usage(msg) {
  if (msg) { console.error(msg); }
  //"Try one of subcommands: "+Object.keys(ops).join(",");
  process.exit(1);
}
module.exports = {
  init: init,
  htdata: htdata,
  htview_send: htview_send,
};
// CL "main". path.basename()
if (process.argv[1].match(/htview.js$/)) {
  var mcfgfn = process.env["HOME"]+"/.linetboot/global.conf.json";
  var mcfg = require(mcfgfn);
  if (!mcfg) { usage("No main config loaded"); }
  var htview = module.exports;
  htview.init(mcfg);
  var ops = {view: view, list: list};
  var op = process.argv[2];
  var ophelp = "Try one of subcommands: "+Object.keys(ops).join(",");
  if (!op)      { usage("No subcommand passed. "+ophelp); }
  if (!ops[op]) { usage(`No subcommand ${op} found.`+ ophelp); }
  function list() {
    console.log("Listing of data-profiles");
    cfg.views.forEach( (v) => {
      console.log(`Profile: ${v.id}, from: ${v.url}`);
    });
  }
  function view() {
    var viewid = process.argv[3];
    if (!viewid) { usage("No viewid passed from CL"); }
    var vcfg = cfg.views.find( (v) => { return v.id == viewid; });
    if (!vcfg)   { usage("No view by id "+viewid+" found in config"); }
    if (process.env["HTVIEW_DEBUG"]) { vcfg.debug = 1; }
    console.log("Got view cfg: ", vcfg);
    htview.htdata(vcfg, null);
  }
  ops[op]();
  // Do NOT .exit(), this will terminate async (HTTP) ops. 
  //process.exit(1);
}

