/** @file
 * Load Confluence document listings and doc pages from Confluence server.
 * ## References
 * 
 * - REST API Examples: https://developer.atlassian.com/server/confluence/confluence-rest-api-examples/
 * - Storage Format: https://confluence.atlassian.com/doc/confluence-storage-format-790796544.html
 * - Pagination: https://developer.atlassian.com/server/confluence/pagination-in-the-rest-api/
 */
var axios = require("axios");
var cfg;
var inited = 0;
var apiprefix;


function init(_cfg) {
  if (inited) { return; }
  cfg = (_cfg && _cfg.confluence) ? _cfg.confluence: _cfg;
  try {
    if (!cfg) { throw "No config"; }
    if (!cfg.host || !cfg.user || !cfg.pass) { throw "Config props (host,user,pass) missing ..."; }
  } catch (ex) { console.log("Confluence Init Error(early): "+ex); cfg=null; inited++; return; }
  apiprefix = (typeof cfg.apiprefix != "undefined") ? cfg.apiprefix : "/confluence"; // /rest/api/content
  console.log("Have clf config: ", cfg);
  inited++;
  
}

/** Show list of Confluence pages.
 * Config: "confluence": { host: "", user: "", pass: "", "apiprefix": "", } // docids: [] ?
 * - Add docs (of type): https://confluence.mycomp.com/rest/api/content?type=blogpost&start=0 # Example of no "/confluence" api prefix
 * - Content (included): /rest/api/content/3965072?expand=body.storage
 
 */
function confluence_index(req, res) {
  var jr = {status: "err", "msg": "Could not list Confluence Index."};
  //var cfg = global.confluence;
  // All this at module init() (validate config, add creds) ?
  try {
    if (!cfg) { throw "No config"; }
    //if (!cfg.host || !cfg.user || !cfg.pass) { throw "Config props missing ..."; }
  } catch (ex) { jr.msg += "Error(early): "+ex; return res.json(jr); }
  
  var opts = {};
  try { add_basic_creds(cfg, opts); } catch (ex) { jr.msg += "Error using creds: "+ex; return res.json(jr); }
  // On many servers the path from top-level is just (w/o '/confluence' part): /rest/api/content
  // example params: ?type=page ?type=blog  &start=0
  //var apiprefix = (typeof cfg.apiprefix != "undefined") ? cfg.apiprefix : "/confluence"; // /rest/api/content
  var url = "https://" + cfg.host + apiprefix + "/rest/api/content"; // Common part, must be configurable
  
  //if (req.url.match('/cflpage') ) { url += "/"+req.query.id+"?expand=body.storage"; }
  // else {
    url += "?start=0"; // type=page limit=100&
    if (cfg.pgsize) { url += "&limit=" + cfg.pgsize; }
  // }
  console.log("using Confluence URL: "+url);
  axios.get(url, opts).then((resp) => {
    var d = resp.data;
    d = d.results; // Confluence specific. Still start,limit,size, _links on top. leave (all) in response ?
    //if (!Array.isArray(d)) { jr.msg = "Conflunce native result not in array"; return res.json(jr); }
    res.json({status: "ok", data: d});
  }).catch((ex) => { jr.msg += "Failed Confluence Api Server HTTP Call "+ex; res.json(jr); });
  // TODO: STD wrapper to inject B64 creds to opts ?
 
}

 function add_basic_creds(cfg, opts) {
    if ( !cfg.user || !cfg.pass) { throw "Username or password in credentials missing."; }
    var creds_b64 = Buffer.from(cfg.user+":"+cfg.pass).toString('base64');
    if (!creds_b64) { throw "Basic 64 creds empty !"; }
    opts.headers ||= {};
    opts.headers.Authorization = "Basic "+creds_b64;
  } // add_basic_creds

function confluence_page(req, res) {
  var jr = {status: "err", "msg": "Could deliver Confluence Doc."};
  //var cfg = global.confluence;
  
  res.type('text/html');
  
  // All this at module init() (validate config, add creds) ?
  try {
    if (!cfg) { throw "No config"; }
    //if (!cfg.host || !cfg.user || !cfg.pass) { throw "Config props missing ..."; }
  } catch (ex) { jr.msg += "Error(early): "+ex; return res.json(jr); }
  
  var opts = {};
  try { add_basic_creds(cfg, opts); } catch (ex) { jr.msg += "Error using creds: "+ex; return res.json(jr); }
  
  //var apiprefix = (typeof cfg.apiprefix != "undefined") ? cfg.apiprefix : "/confluence"; // /rest/api/content
  var url = "https://" + cfg.host + apiprefix + "/rest/api/content"; // Common part, must be configurable
  var q = req.query;
  if (!q.id) { return res.end("No Document/Page ID available"); }
  
  url += "/"+req.query.id+"?expand=body.storage";
  
  axios.get(url, opts).then((resp) => {
    var d = resp.data;
    console.log("Got Doc Data: "+ JSON.stringify(d, null, 2) );
    if (q.html) { console.log("HTML:\n"+d.body.storage.value); res.end(d.body.storage.value); }
    else { res.json({status: "ok", data: d}); }
  }).catch((ex) => { jr.msg += "Failed Confluence Api Server HTTP Call "+ex; res.json(jr); });
}

module.exports = {
  init: init,
  confluence_index: confluence_index,
  confluence_page: confluence_page,
  add_basic_creds: add_basic_creds
};
