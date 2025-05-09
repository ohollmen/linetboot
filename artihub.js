/** Access Artifact Hub (e.g. Helm charts)
* Example API search paths:
* - repositories/search
* - packages/search
* API result set Parameters: offset, limit, facets, deprecated, sort
* Further API Info (In artifacthub ap instance): Docs => API Docs (Page also has openapi.yaml - /docs/api/openapi.yaml)
*/


let axios  = require("axios");
var cfl    = require("./confluence.js");
var cliapp = require("./cliapp");
let apiprefix = "api/v1";
let cfg = {};
function init(_mcfg) {
  if (!_mcfg) { throw "No config passed"; }
  if (_mcfg.artihub) { cfg = _mcfg.artihub; }
  else if (_mcfg) { cfg = _mcfg; }
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
// Categroy translation from 
function cat_trans(facet_cat, ent) {
  if (!Array.isArray(facet_cat)) { return "No facet cats !";}
  let m = facet_cat.options.find( (fo) => { return fo.id == ent.category; });
  if (m && m.name) { return m.name; }
  return "Unknown category";
}
function artihub_list(opts, cb) {
  cb = cb || function (err, d) {}; // (err,d) => {}; SyntaxError: Malformed arrow function parameter list
  let schema = "packages"; // "packages", "repositories"
  let url = `https://${cfg.host}/${apiprefix}/packages/search`;
  url += "?offset=0&limit=50&facets=true&deprecated=false&sort=relevance"; // &ts_query_web=database
  let ropts = {headers: { Accept: "application/json" }};
  // cfl.add_basic_creds(cfg, ropts);
  console.log(`URL (GET): ${url}`);
  axios.get(url, ropts).then( (resp) => {
    let d = resp.data;
    
    // TODO: translate and populate category from 
    let facet_cat = d.facets.find( (fnode) => { return fnode.filter_key == "category"; } );
    //d.packages.forEach( (ent) => { ent.category_name = cat_trans(facet_cat, ent); } );
    console.log(JSON.stringify(d, null, 2));
    console.log(`Got ${d["packages"].length} items (From: ${url})`);
    return cb(d, null);
  }).catch( (ex) => { console.error(`${ex}`); return cb(ex, null);  });
}
function hdl_ah_list(req, res) {
  let jr = { status: "error", "msg": "Could not list AH Items. " };
  artihub_list({}, function (err, d) {
    if (err) { jr.msg += `Failed to fetch results: ${err}`; return; }
    res.json( { status: "ok", data: d["packages"] } );
  });
}
let ops = [
  {id: "list", "label": "List packages", cb: artihub_list },
  // {id: "list", "label": "List packages", cb: artihub_list },
];
let cliopts = [
  ["d","debug","Turn on debugging"],
  //["d","debug","Turn on debugging"],
  //["d","debug","Turn on debugging"],
  //["d","debug","Turn on debugging"],
];
if (process.argv[1].match("artihub.js")) {
  let mcfgfn = `${process.env.HOME}/.linetboot/global.conf.json`;
  let mcfg = require(mcfgfn);
  init(mcfg);
  //artihub_list({});
  let app = new cliapp.cliapp(ops, cliopts, {});
  let opn = app.parse({ addself: true });
  console.log("Opts: ", app.opts);
  let rc  = opn.cb(app.opts);
}
