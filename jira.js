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

## JIRA Result sets

Every Jira result set starts with following result set meta data. Note startAt index/offset is entry cound, not page count (!).
```
{
  "maxResults": 50,
  "startAt": 0,
  "total": 7,
  "isLast": true,
  "values": [
    ...
```

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

let fs     = require("fs");
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
// https://stackoverflow.com/questions/11893083/convert-normal-date-to-unix-timestamp
//https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date
function time_within(ts, ts1, ts2) {
  // Date.prototype.toISOString() let d = new Date(0); d.toISOString(); // always in Z
  // date.toLocaleDateString("fa-IR")
  // try {
  let t = Date.parse(ts);
  let t1 = Date.parse(ts);
  let t2 = Date.parse(ts);
  //} catch (ex) { console.error(`Error parsing times`); return null; }
  // TODO: Re-order t1, t2 if diven in non asc. order
  // .getTime() Creates ms time (not s) from EPOC, but does not matter for CMP. Can be neg on e.g. 1969
  // Also: valueOf() - functional equivalent
  if ( (t.getTime() > t1.getTime()) && (t.getTime() < t2.getTime()) ) {
    // console.error(`Seems time t ${t.getTime()} is between ${t1.getTime()}..${t2.getTime()}  `);
    return 1; }
  return 0;
}
////////////////////////////////// JIRA related //////////////////////
// Web handler for JIRA query (GET)
// Accepts params jql (JQL query) or jqp (query profile)
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
// Show sprints (by pattern).
// For now show sprints from (simple AoO) JSON file, filtering them by pattern, as most JIRA servers return
// only small set (50) of entries in single "paged" result set.
function jira_sprints(req, res) {
  var jr = {status: "err", msg: "Failed to load (or filter) sprints. "};
  let fn = cfg.sprintfn || `${process.env.HOME}/.linetboot/my_sprints.json`;
  //if (!fn) { jr.msg += `No sprints file found by config (or default fn).`; return res.json(jr); }
  if (!fs.existsSync(fn)) { jr.msg += `sprints file ${fn} does not exist.`; return res.json(jr); }
  var cont = fs.readFileSync(fn, 'utf8');
  if (!cont) { jr.msg += `No data in sprints file.`; return res.json(jr); }
  let d = JSON.parse(cont);
  if (!Array.isArray(d)) { jr.msg += `sprints file data not in array !`; return res.json(jr); }
  // Filter ?
  let pflen = d.length; let olap = {};
  if (cfg.sfre) {
    let re = new RegExp(cfg.sfre); // throws ?
    if (!re) { jr.msg += `sprints file filter RE is faulty!`; return res.json(jr); }
    d = d.filter( (s) => { return s.name.match(re); });
    //d = d.sort( (a, b) => { return a.startDate.localeCompare(b.startDate); }); // name, startDate
  }
  // Overlap count
  d.forEach( (s) => {
    if (olap[s.name]) { s.isdup = olap[s.name]+1; olap[s.name]++; }
    else {olap[s.name] = 1; }
  });
  res.json({status: "ok", pfcnt: pflen, cnt: d.length, data: d});
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
  ["p", "boardid=ARG", "Board id for getting sprints (Use subcmd boards to get available boardids)"],
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
  jira_sprints: jira_sprints,
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
      up.customfield_10000 = "246904"; //  int and str not treated as equals: 'Number value expected as the nnnnn id.'
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
  let boardid = opts.boardid || cfg.boardid || 0;
  // Also: /rest/agile/1.0/board?projectKeyOrId=UN => 
  // (!opts.boardid) && (!cfg.boardid)
  let maxres = 50;
  if ((opts.op == 'sprints') && !boardid) { usage(`Must have 'boardid' from cli or cfg.boardid to list sprints`); }
  let url = `https://${cfg.host}${apiprefix_ag}board/${boardid}/sprint?maxResults=${maxres}&startAt=`; // sprints Note special api prefix
  let url_b = `https://${cfg.host}${apiprefix_ag}board?projectKeyOrId=${cfg.project}`; // boards
  if (opts.op == 'boards') { url = url_b; }
  var ropts = {};
  cfl.add_basic_creds(cfg, ropts); // try {  } catch (ex) {}
  body_opts(ropts, "post");
  console.error(`Query (GET): ${url}`);
  let darr = []; let didx = -1;
  new Promise( (r,j) => { value_set_fetch(r,j); }).then( (d) => { console.log(JSON.stringify(darr, null, 2)); console.error(`then: ${darr.length} Items`); } )
  .catch( (ex) => { console.error(`Error handling promise: ${ex}`);}); // url, opts
  function dynurl() { didx += 1; return url + (didx*maxres); }
  // await here: await is only valid in async functions and the top level bodies of modules
  function value_set_fetch(resolve, reject) { // url, opts
    let url_u = (opts.op == 'boards') ? url_b : dynurl();
  axios.get(url_u, ropts).then( (resp) => { // Should get "204 No content"
    //if (resp.status == 204) { console.log(`Success with JIRA mod (${url})`); }
    //else { console.log(`Semi-success: No exception, but no 204 status either (???)`); }
    if (!resp.data || !resp.data.values) { usage(`No data or data.values in result`); }
    //console.log(JSON.stringify(resp.data, null, 2));
    if (opts.op == 'boards') { resp.data.values.forEach( (b) => { console.log(`- ${b.id} - ${b.name}`); }); }
    if (opts.op == 'sprints' && !resp.data.isLast) { darr = darr.concat(resp.data.values); value_set_fetch(resolve,reject); }
    else {
      // Both board and sprint results seem to have .values (array)
      console.error(`${resp.data.values.length} items listed.`);
      return resolve(resp.data.values);
    }
  })
  // Example ex.response: data: { errorMessages: [ 'Number value expected as the Sprint id.' ], errors: {} }
  .catch( (ex) => {
    console.error(`Error getting JIRA sprints ${url} (status: ${ex.response}): ${ex}`); // .status
    console.error(ex.response.data);
    return reject(ex);
  });
  }
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
  if (!mod) { console.error("Init problem"); process.exit(1); }
  // CLI
  var op = process.argv.splice(2, 1)[0]; // var op = process.argv[2];
  if (!op) { usage("No op passed (as first arg)."); }
  if (!ops[op]) { usage(`${op} - Not one of the supported subcommands !`); }

  var getopt = new Getopt(clopts);
  var opt = getopt.parse(process.argv); // argv2 = process.argv.slice(2);var op = argv2.shift();
  let opts = opt.options;
  opts.op = op;
  console.error(`${op}: '${ops[op].desc}' w. opts: `+JSON.stringify(opts)); // Query JIRA (CLI)
  //console.log();
  //jira_query_cli(opts);
  //jira_query_mod_cli(opts);
  //sprints_get(opts);
  ops[op].cb(opts);
}
