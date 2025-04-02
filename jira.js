#!/usr/bin/env node
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
- API URL: /issue/createmeta/{projectIdOrKey}/issuetypes for discovering sub-task issue types (Proj. id: /^\d+$/, key (typ.): /^[A-Z]$/)
- https://thejiraguy.com/2021/06/16/everything-you-never-wanted-to-know-about-custom-fields-in-jira/
- https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-custom-field/
- https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-fields/#api-rest-api-3-field-search-get
- https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/#api-rest-agile-1-0-board-boardid-sprint-get
  - https://community.developer.atlassian.com/t/getting-a-list-of-all-sprints/62599/7

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

var apiprefix = "/rest/api/2/"; // + e.g. query. Trail this by "issue", "customFieldOption", "field"
var apiprefix_ag = "/rest/agile/1.0/"; // boards, sprints, e.g. board/{bid}/sprint
// (or much longer path, e.g. "/issue/createmeta/{projectIdOrKey}/issuetypes")...
let apiprofs = [ // GET Only ?
  {lbl: "isstypes", "urlpath": `${apiprefix}issue/createmeta/{{ projid }}/issuetypes`},
];
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
// Assign web handler by (e.g.) `app.get("/isslist", jira.jira_query);`.
function jira_query(req, res) {
  var jr = {status: "err", msg: "Failed to query JIRA. "};
  

  var q = (req && req.query) ? req.query : {};
  if (!q) { jr.msg += "No query URL"; return res.json(jr); }
  // Jira Issue from Query
  //if (q.iid.match(issre)) { url += ""; }
  jira_query_opts(q, function (err, data) {
    if (err) { jr.msg += `${err}}`; console.error(`Error: ${jr.msg}`); res.json(jr); return; }
    data.status = "ok"; // Inject add'l
    res.json(data); // {status: "ok", data: data, url: url}
  });
}
function jira_query_opts(q, cb) {
  // Single-query: GET /rest/api/2/issue/$issuekey . Also has option expand=names  
  var url = `https://${cfg.host}${apiprefix}search`;
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
  let err = `Error running the JIRA query. `;
  if (q.jqp && cfg.jqps ) { // Have query profile (jqp) ? && cfg.jqps[q.jqp]
    if (!cfg.jqps[q.jqp]) { err += `No such query profile (in config): '${q.jqp}'`; return cb(err, null); }
    console.log("Override default query by valid profile (label): "+ q.jqp);
    rbody.jql = cfg.jqps[q.jqp];
  }
  var ropts = {}; // Should follow HTTP responses (Location: ... how on axios level ?)
  // Use cfl as helper ...
  try { cfl.add_basic_creds(cfg, ropts); }
  catch (ex) { err += "Error using creds: "+ex; console.log(`JIRA Creds-add error: ${err}`); return cb(err, null); } // jr.msg res.json(jr);
  body_opts(ropts, "post"); // "get"
  console.log(`Call JIRA (POST) URL '${url}' with data,ropts: `, rbody, ropts );
  //axios.get(url, ropts).then((resp) => {
  axios.post(url, rbody, ropts).then((resp) => {
    var d = resp.data;
    //if (q.debug) { console.log("Got JIRA Data: "+ JSON.stringify(d,null, 2) ); }
    if (q.html) { console.log("HTML:\n"+d.body.storage.value); return cb(null, d.body.storage.value); } // res.end();
    // TODO: rethink d.issues
    // NONEED: else if (res) {  return cb(null, d.issues); } // res.json({status: "ok", data: ... url: url})
    else { // console.log(JSON.stringify(d.issues, null, 2)); console.log(`${d.issues.length} Issues listed`);
      return cb(null, {data: d.issues, url: url} );
    }
  }).catch((ex) => { err += `Failed JIRA Api Server HTTP Call: ${ex}`; return cb(err, null); }) // console.log("JIRA Query error: "+jr.msg); res.json(jr);
}

var clopts = [
  ["j", "jql=ARG", "JQL query to run for results"],
  ["c", "jqp=ARG", "JIRA query profile ('canned query' name)"],
  ["d", "debug",   "Turn on debugging"],
  ["p", "project=ARG", "Project to add to query (to override 'project' in config)"],
];
var ops = {
  "query":   {cb: jira_query_cli, desc: "Query entries by query profile () or JQL ()", },
  "update":  {cb: jira_query_mod_cli, desc: "Query set of entries (See: query) and modify them by ... (TBS)", },
  "sprints": {cb: sprints_get, desc: "Query Sprints (by cfg.boardid)", },
  "boards":  {cb: sprints_get, desc: "Query (All) Boards", },
  //"": {cb: null, desc: "", },
  //"": {cb: null, desc: "", },
};
module.exports = {
  init: init,
  jira_query: jira_query,
  cfg: cfg,
};

function jira_query_cli(opts) {
  //OLD/WEB:jira_query(null, null);
  jira_query_opts(opts, function (err, data) {
    if (err) { console.error(`Error '${err}' on jira query`); return; }
    console.log(JSON.stringify(data, null, 2));
    console.log(`${data.data.length} Issues by JIRA query: '${opts.jql}' or (...)`);
  });
}
// Modify entries in result set by ... cb ? update-object ?
// I md-req Id goes in URL: /rest/api/2/issue/QA-31 (`${apiprefix}${entid}`) w. entid coming from ent.key.
function jira_query_mod_cli(opts) {
  //OLD/WEB:jira_query(null, null);
  jira_query_opts(opts, function (err, data) {
    if (err) { console.error(`Error '${err}' on jira query`); return; }
    if (!data.data || !Array.isArray(data.data)) { console.error(`Results data-set not in an array !!`); return; }
    console.log(JSON.stringify(data, null, 2));
    console.log(`${data.data.length} Issues by JIRA query: '${opts.jql}' or (...)`);
    // Setup modification from CLI to object (upmsg.fields)
    var ropts = {};
    cfl.add_basic_creds(cfg, ropts); // try {  } catch (ex) {}
    body_opts(ropts, "post");
    // Iterate / Formulate modification (set)
    data.data.forEach( (ent) => {
      let e = ent.fields;
      //let url_up = `${apriprefix}${ent.key}`; // PUT (for mod/up)
      // Basic fields: summary,description,labels(AoS)
      // Complex: issuetype(id(int,10001),name(Story), subtaks:true/false),priority(name),status(name),assignee(name=> username,displlayName),reporter(See:assignee)
      // Date fields: created, duedate, resolutiondate, lastViewed, updated
      if (e.duedate != '2025-04-28') { return; } // Example
      console.log(`Ent.duedate: ${e.duedate}, Ent.cf = ${e.customfield_10000}`);
      let upmsg = {"fields": {}}; let up = upmsg.fields;
      up.customfield_10000 = "246904"; //   Denali_CY25Q2_Sprint2. int and str not treated as equals: 'Number value expected as the nnnnn id.'
      let url = `https://${cfg.host}${apiprefix}issue/${ent.key}`;
      console.log(`Operate on ${url} (PUT)`);
      console.log(` - Send msg: ${JSON.stringify(upmsg, null, 0)}`);
      //return;
      axios.put(url, upmsg, ropts).then( (resp) => { // Should get "204 No content"
        if (resp.status == 204) { console.log(`Success with JIRA mod (${url})`); }
        else { console.log(`Semi-success: No exception, but no 204 status either (???)`); }
      })
      // Example ex.response: data: { errorMessages: [ 'Number value expected as the Sprint id.' ], errors: {} }
      .catch( (ex) => { console.error(`Error updating JIRA ent ${url} (status: ${ex.response.status}): ${ex}`); console.error(ex.response.data); }); // ${ex} vs. ${ex.response} console.error(ex.response);
    });
  });
}
// List Sprints (by board)
// How to get boards: /rest/agile/1.0/board
function sprints_get(opts) {
  let boardid = "000"; // opts.boardid || cfg.boardid || "000";
  // Also: /rest/agile/1.0/board?projectKeyOrId=UN => 
  let url = `https://${cfg.host}${apiprefix_ag}board/${boardid}/sprint`; // Note special api prefix
  let url_b = `https://${cfg.host}${apiprefix_ag}board?projectKeyOrId=${cfg.project}`; // 
  if (opts.op == 'boards') { url = url_b; }
  var ropts = {};
  cfl.add_basic_creds(cfg, ropts); // try {  } catch (ex) {}
  body_opts(ropts, "post");
  console.log(`Query (GET): ${url}`);
  axios.get(url, ropts).then( (resp) => { // Should get "204 No content"
    //if (resp.status == 204) { console.log(`Success with JIRA mod (${url})`); }
    //else { console.log(`Semi-success: No exception, but no 204 status either (???)`); }
    console.log(JSON.stringify(resp.data, null, 2));
  })
  // Example ex.response: data: { errorMessages: [ 'Number value expected as the Sprint id.' ], errors: {} }
  .catch( (ex) => { console.error(`Error getting JIRA sprints ${url} (status: ${ex.response.status}): ${ex}`); console.error(ex.response.data); });
}
function usage(msg) {
  if (msg) { console.error(`${msg}`); }
  console.error(`Try one of the subcommands:\n` + Object.keys(ops).map((k) => {return `${k} - ${ops[k].desc}`;}).join("\n") );
  process.exit(1);
}
if (process.argv[1].match("jira.js")) {
  var mc = require("./mainconf.js");
  var mcfg = mc.mainconf_load(process.env["HOME"]+"/.linetboot/global.conf.json");
  mc.mainconf_process(mcfg);
  //console.log(mcfg);
  var mod = init(mcfg);
  // CLI
  var op = process.argv.splice(2, 1)[0]; // var op = process.argv[2];
  if (!op) { usage("No op passed (as first arg)."); }
  if (!ops[op]) { usage(`${op} - Not one of the supported subcommands !`); }

  var getopt = new Getopt(clopts);
  var opt = getopt.parse(process.argv); // argv2 = process.argv.slice(2);var op = argv2.shift();
  let opts = opt.options;
  if (!mod) { console.log("Init problem"); process.exit(1); }
  console.log(`${op}: '${ops[op].desc}' w. opts: `+JSON.stringify(opts)); // Query JIRA (CLI)
  console.log();
  //jira_query_cli(opts);
  //jira_query_mod_cli(opts);
  //sprints_get(opts);
  ops[op].cb(opts);
}
