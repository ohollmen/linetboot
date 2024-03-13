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

var path  = require("path");
var axios = require("axios");
var cfl   = require("./confluence.js"); // For add_basic_creds() ONLY
// var datapop = require("./datapop.js");
var cfg = {};
var cbmod = null; // Transformational callbacks, etc.
/** Init htview mainly based on .js config file (JS for the code/callbacks)  */
function init(_cfg, app) {
  if (_cfg["htview"]) { _cfg = _cfg["htview"]; }
  if (!_cfg) { console.error("htview: No config found");  return; }
  // TODO: Secondary (separate file) for configs !!! (e.g. htviews.conf.json)
  var views;
  if (_cfg.conffn) { views = require(_cfg.conffn); } // Rely on ext. conf file
  else { views = _cfg.views; } // Use "views" array directly from config
  if (!views) { console.error("htview: No views configured (in main conf or ext. conf)");  return; }
  if (!Array.isArray(views)) { console.error("htview: views not configured in a Array !");  return; }
  cfg = _cfg;
  // Try js.
  if (cfg.datacbmodule) { cbmod = require(cfg.datacbmodule); console.log("htview CB:s loaded from "+cfg.datacbmodule); }
  // TODO: merge callbacks to RT version of original config
  // if (cbmod) { ... }
  if (!app) { return; } // Not a (express) webapp context
  views.forEach( (v) => {
    app.get(v.localurl, htview);
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

function htview_send(req, res) {
  var jr = {status: "error", msg: "Could not create grid view result. "};
  //var d = htdata(showdata);
  // if (!d) { jr.msg += ""; return res.json(jr); }
  //res.json({status: "ok", data: d});
}

function data_select(d, vp) {
  if (!vp.arrsel) { return d; }
  var as = vp.arrsel.split(/\./);
  var i = 0;
  // && is_object( d[ as[i] ] )
  for (i=0;as[i] && d[ as[i] ];i++) { d = d[ as[i] ]; }
  if (!d) { console.error("No data remains after selecting by dot-notation !"); }
  return d;
}

/** GET data by http (GET) and
 * Optionally use dot-notation selctor to access correct data within returned JSON data.
 */
function htdata(vp, cb) {
  var rpara = {};
  if (vp.user || vp.pass || vp.token) {
    cfl.add_basic_creds(vp, rpara);
    rpara.headers.Accept = "application/json";
  }
  if (vp.debug) { console.log("rpara: ", rpara); }
  axios.get(vp.url, rpara).then( function (resp) {
    if (vp.debug) { console.error("Then ..."); } // return;
    var d = resp.data;
    //console.log("Got initial data: "+ d);
    // TODO: Implement a meta-notation like _ONLYKEYVAL, _FIRSTITEM to select / transform
    // in a special way
    if (vp.arrsel) { d = data_select(d, vp); }
    //console.log(d);
    console.error( JSON.stringify(d, null, 2) );
  }).catch( function (ex) {
    console.log("Error fetching data for view: "+ex);
  });
  //console.log("end-of-htdata");
}

function usage(msg) {
  if (msg) { console.error(msg); }
  //"Try one of subcommands: "+Object.keys(ops).join(",");
  process.exit(1);
}
module.exports = {
  init: init,
  htdata: htdata,
  
};
// CL "main".
if (!path.basename(process.argv[1]).match(/htviews.js$/)) {
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
    console.log("Listing of profiles");
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

