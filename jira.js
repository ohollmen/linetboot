/**
@file

## Notes
- /rest/api/2/ Seems to be the universal API prefix common to all API entrypoints
- /rest/api/latest/ Also exists (it seems)
- /rest/api/2/search - is this (search) the default ? Works both GET, POST
- query can be "?jql=..." (will have root.issues (AoO). Can use: &startAt=2&maxResults=2, &fields=id,key
- Encode space to '+'
- Queries can be also made w. POST on "/search/": {"jql": "project = QA ..." ...} can use/inc. startAt, maxResults, fields
  No need to escape WS.
- See also (GET): /rest/api/2/issue/createmeta?projectKeys=QA&...
- Seems body (POST,PUT) request types must have the "schema indicator" in URL (e.g. issue => /rest/api/2/issue/)

## Refs:
- https://developer.atlassian.com/server/jira/platform/jira-rest-api-examples/

TODO
- Use same config props as confluence (section / module)
- Re-use confluence.js add_basic_creds(cfg)
- Be prepared to rename if there is an authoritative (NPM) module "jira.js" ever.
- Need Accept: application/json (like alt impl.)
*/

var axios = require("axios");
var cfl = require("./confluence.js"); // add_basic_creds()
var cfg;
var inited = 0;
var issre = null;

var apiprefix = "/rest/api/2/"; // + e.g. query

function init(_cfg) {
  cfg = (_cfg && _cfg.jira) ? _cfg.jira: _cfg;
  
  try {
    if (!cfg) { throw "No config"; }
    if (!cfg.host || !cfg.user || !cfg.pass) { throw "Config props (host,user,pass) missing ..."; }
  } catch (ex) { console.log("Jira Init Error(early): "+ex); cfg=null; inited++; return; }
  // Compile issue pattern
  issre = new RegExp(cfg.isspatt);
  // TODO: ...
  apiprefix = (typeof cfg.apiprefix != "undefined") ? cfg.apiprefix : apiprefix; // 
  inited++;
  return module.exports;
}

function body_opts(opts, m) {
  var hasbody = {"post": 1, "put": 1};
  opts.headers |= {};
  if (hasbody[m]) {
    opts.headers["content-type"] = "application/json";
  }
  opts.headers.accept = "application/json";
}

function jira_query(req, res) {
  var url = "https://" + cfg.host + apiprefix ; // + "search"
  // Single-query: GET /rest/api/2/issue/$issuekey . Also has option expand=names
  var q = (req && req.query) ? req.query : {};
  // Jira Issue from Query
  //if (q.iid.match(issre)) { url += ""; }
  // Jira Query from Exp. query
  //if (q.jql) { url+= "?jql=" + q.jql; }
  // Query from profile
  var opts = {}; // Should follow HTTP responses (Location: ... how on axios level ?)
  // Use cfl as helper ...
  try { cfl.add_basic_creds(cfg, opts); } catch (ex) { jr.msg += "Error using creds: "+ex; return res.json(jr); }
  body_opts(opts, "get");
  axios.get(url, opts).then((resp) => {
    var d = resp.data;
    console.log("Got JIRA Data: "+ JSON.stringify(d, null, 2) );
    //if (q.html) { console.log("HTML:\n"+d.body.storage.value); res.end(d.body.storage.value); }
    //else { res.json({status: "ok", data: d}); }
  }).catch((ex) => { jr.msg += "Failed JIRA Api Server HTTP Call "+ex; res.json(jr); })
}

module.exports = {
  init: init,
  jira_query: jira_query
};

if (process.argv[1].match("jira.js")) {
  var mc = require("./mainconf.js");
  var mcfg = mc.mainconf_load(process.env["HOME"]+"/.linetboot/global.conf.json");
  mc.mainconf_process(mcfg);
  console.log(mcfg);
  var mod = init(mcfg);
  if (!mod) { console.log("Init problem"); process.exit(1); }
  jira_query(null, null);
  console.log("Query JIRA ...");
}
