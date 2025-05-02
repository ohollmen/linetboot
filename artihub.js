/** Access Artifact Hub (e.g. Helm charts)
* Example API search paths:
* repositories/search
* packages/search
* API result set Parameters: offset, limit, facets, deprecated, sort
*/


let axios = require("axios");
var cfl = require("./confluence.js");
//var cliapp = require("./cliapp");
let apiprefix = "api/v1";
let cfg = {};
function init(_mcfg) {
  if (!_mcfg) { throw "No config passed"; }
  if (_mcfg.artihub) { cfg = _mcfg.artihub; }
  else if (_mcfg) { cfg = _mcfg; }
  
}

function artihub_list(opts) {
  let url = `https://${cfg.host}/${apiprefix}/packages/search`;
  url += "offset=0&limit=20&facets=true&ts_query_web=database&deprecated=false&sort=relevance";
  let ropts = {};
  // cfl.add_basic_creds(cfg, ropts);
  axios.get(url, ropts).then( (resp) => {
    let d = resp.data;
    console.log(JSON.stringify(d, null, 2));
    //console.log(`Got ${.len} items (From: ${url})`);
  }).catch( (ex) => { console.error(`${ex}`); });
}
let ops = [
  {}
];
let cliopts = [
  ["","",""]
];
if (process.argv[1].match("artihub.js")) {
  let mcfgfn = `${process.env.HOME}/.linetboot/global.conf.json`;
  let mcfg = require(mcfgfn);
  init(mcfg);
  artihub_list({});
  //let app = new cliapp.cliapp(ops, cliopts, {});
  //let opn = app.parse({ addself: true });
  //let rc  = opn.cb(app.opts);
}