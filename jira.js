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

var axios  = require("axios");
var cfl    = require("./confluence.js"); // add_basic_creds()
var Getopt = require("node-getopt");
var cfg;
var inited = 0;
var issre = null;

var apiprefix = "/rest/api/2/"; // + e.g. query

function init(_cfg) {
  cfg = (_cfg && _cfg.jira) ? _cfg.jira: _cfg;
  
  try {
    if (!cfg) { throw "No config"; }
    if (!cfg.host || !cfg.user || !cfg.pass) { throw "Config props (host,user,pass) for JIRA config missing ..."; }
  } catch (ex) { console.log("Jira Init Error(early): "+ex); cfg=null; inited++; return; }
  // Compile issue pattern
  if (cfg.isspatt) { issre = new RegExp(cfg.isspatt); }
  // TODO: ...
  apiprefix = (typeof cfg.apiprefix != "undefined") ? cfg.apiprefix : apiprefix; // 
  inited++;
  return module.exports;
}
// Helper to set outgoing request (content-type) and preferred incoming (accept) response request headers.
function body_opts(opts, m) {
  var hasbody = {"post": 1, "put": 1};
  //opts.headers  ||= {}; // OK in Newer node
  opts.headers = opts.headers || {};
  if (hasbody[m]) {
    opts.headers["content-type"] = "application/json";
  }
  opts.headers.accept = "application/json";
}
// Note initial behavior: Errors 405, 400 gotten when param "jql" passed in GET (q-param) or POST (json) 
function jira_query(req, res) {
  var jr = {status: "err", msg: "Failed to query JIRA. "};
  

  var q = (req && req.query) ? req.query : {};
  if (!q) { jr.msg += "No query URL"; res.json(jr); }
  // Jira Issue from Query
  //if (q.iid.match(issre)) { url += ""; }
  //function jira_query_opts(q, function (err, data) { if (err) { return; }  });

//function jira_query_opts(q, cb) {
  // Single-query: GET /rest/api/2/issue/$issuekey . Also has option expand=names  
  var url = "https://" + cfg.host + apiprefix + "search";
  // Jira Query from Exp. query (GET query)
  //if (q.jql) { url+= "?jql=" + q.jql; } // disabled for now (GET only)

  url += "?startAt=2&maxResults=2"; // For GET and POST
  //else {  url += "?jql=assignee%20%3D%20currentUser%28%29"; }
  //else {  url += "?jql=assignee%3D"+process.env["USER"];  }
  var rbody = {}; // JIRA POST Request Body params for query
  rbody.jql = `project = ${cfg.project} AND assignee = ${process.env["USER"]} AND resolution = Unresolved`; // POST (Default)
  //var qstr = "?jql="+encodeURIComponent(rbody.jql); console.log("QSTR: "+ qstr); // NOT Used (GET only)
  // Query from query profiles (passed in q.jqp)
  console.log("Q-op-params: ", q);
  console.log("J-config: ", cfg);
  if (q.jqp && cfg.jqps ) { // Have query profile (jqp) ? && cfg.jqps[q.jqp]
    if (!cfg.jqps[q.jqp]) { console.error(`No such query profile (in config): '${q.jqp}'`); return; }
    console.log("Override default query by valid profile (label): "+ q.jqp);
    rbody.jql = cfg.jqps[q.jqp];
  }
  var ropts = {}; // Should follow HTTP responses (Location: ... how on axios level ?)
  // Use cfl as helper ...
  try { cfl.add_basic_creds(cfg, ropts); } catch (ex) { jr.msg += "Error using creds: "+ex; console.log("JIRA Creds-add error: "+jr.msg); return res.json(jr); }
  body_opts(ropts, "post"); // "get"
  console.log(`Call JIRA (POST) URL '${url}' with data,ropts: `, rbody, ropts );
  //axios.get(url, ropts).then((resp) => {
  axios.post(url, rbody, ropts).then((resp) => {
    var d = resp.data;
    //if (q.debug) { console.log("Got JIRA Data: "+ JSON.stringify(d,null, 2) ); }
    if (q.html) { console.log("HTML:\n"+d.body.storage.value); res.end(d.body.storage.value); }
    // TODO: rethink d.issues
    else { res.json({status: "ok", data: d.issues, url: url}); }
  }).catch((ex) => { jr.msg += "Failed JIRA Api Server HTTP Call: "+ex; console.log("JIRA Query error: "+jr.msg); res.json(jr); })
}

var clopts = [
  ["j", "jql=ARG", "JQL query to run for results"],
  ["c", "jqp=ARG", "JIRA query profile ('canned query' name)"],
  ["d", "debug",   "Turn on debugging"],
  ["p", "project=ARG", "Project to add to query (to override 'project' in config)"],
];

module.exports = {
  init: init,
  jira_query: jira_query,
  cfg: cfg,
};

if (process.argv[1].match("jira.js")) {
  var mc = require("./mainconf.js");
  var mcfg = mc.mainconf_load(process.env["HOME"]+"/.linetboot/global.conf.json");
  mc.mainconf_process(mcfg);
  console.log(mcfg);
  var mod = init(mcfg);
  // CLI
  var getopt = new Getopt(clopts);
  var opt = getopt.parse(process.argv); // argv2 = process.argv.slice(2);var op = argv2.shift();
  let opts = opt.options;
  if (!mod) { console.log("Init problem"); process.exit(1); }
  jira_query(null, null);
  //jira_query_opts(opts, function (err, data) {
  //  if (err) { console.error(`Error '${err}' on jira query`); return; }
  //  console.log(JSON.stringify(data, null, 2));
  //});
  console.log("Query JIRA ...");
}
