/* HTTP views
* Allow any open / authenticated REST/JSON source to be be viewed as
* Grid table (JSGrid ?)
* ## Config
* Config item should have following
* - 
* - url - External URL to fetch AoO from
* - localurl - local URL to attach handler to
* - arrsel - Array selection dot-notation expression in case array is not
*   on top of the structure
* - user - Username (for basic auth)
* - pass - Password for basic auth
* - token - Singular Token for Bearer authentication
* ## TODO
* - Use Jira/Other module for adding creds
* - Allow file sources (also ones cached from an URL, implement caching here ?)
* - Allow formats other than JSON (CSV ? YAML ?)
*/

var axios = require("axios");
var cfg = {};
function init(_cfg, app) {
  if (_cfg["htview"]) { _cfg = _cfg["htview"]; }
  if (!_cfg) { console.error("htview: No config found");  return; }
  var views = _cfg.views;
  if (!views) { console.error("htview: No views configured");  return; }
  if (!Array.isArray(views)) { console.error("htview: views not configured in a Array !");  return; }
  cfg = _cfg;
  if (!app) { return; } // Not a webapp context
  //views.forEach( (v) => {
  //  app.get(v.localurl, htview)
  //});
}


function htview_send(req, res) {
  var jr = {status: "error", msg: "Could not create grid view result. "};
  //var d = htdata(showdata);
  // if (!d) { jr.msg += ""; return res.json(jr); }
  //res.json({status: "ok", data: d});
}

function htdata(vp, cb) {
  //axios.get().then();
}

function usage(msg) {
  if (msg) { console.error(msg); }
  process.exit(1);
}

if (!path.basename(process.argv[1]).match(/htviews.js$/)) {
  var mcfgfn = process.env["HOME"]+"/.linetboot/global.conf.json";
  var htview = module.exports;
  var viewid = process.argv[2];
  if (!viewid) { usage("No viewid passed from CL"); }
  //init();
  var vcfg = cfg.views.find( (v) => { return v.id == viewid; });
  if (!vcfg) { usage("No view by id "+viewid+" found in config"); }
  
}

module.exports = {
  
};
