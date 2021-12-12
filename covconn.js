#!/usr/bin/node
/**
* @file
* Linetboot add-on script/module to query coverity projects.
* Example of use (as script):
* ```
* node cov_proj_query.js list > ./rep/cov_proj_data.json
* node cov_proj_query.js report build
* node cov_proj_query.js report rel
* # Poll coverity-server-up
* node cov_proj_query.js poll
* ```
* # Refs
* - https://stackoverflow.com/questions/46182257/handling-js-intervals-and-cron-jobs-using-pm2
* - https://dev.to/michielmulders/why-we-stopped-using-npm-start-for-running-our-blockchain-core-s-child-processes-1ef4
*/
var axios = require("axios");
var async = require("async");
var cproc = require("child_process");
var fs    = require("fs");
var cfg; // = mcfg.cov;
var creds_b64 = ""; // Buffer.from(cfg.user+":"+cfg.pass).toString('base64');
var axopt = {headers: {Authorization: "basic "}}; // +creds_b64
// Based on: https://community.synopsys.com/s/question/0D53400003sZTfsCAG/how-to-use-rest-api-to-get-the-defect-list-from-view-of-coverity-platform
// var url = burl+"api/viewContents/issues/v1/Outstanding%20Defects?projectId="+cfg.projid;
// API: delete: /api/projects/{projectId}/versions/{projectVersionId}
// Doc on coverity server (Help => Coverity Help Center): "Coverity Platform Web Services API Reference" (doc/en/api/cov_platform_web_service_api_ref.html)
// - GET /api/view/v1/views - different people's views
// - GET - /api/views/v1/ - views accessible to current user (Small result set)
// - ...
// Internal API used by GUI (works but paging required cookie-sess based POST, responds w. 403)
// var url = cfg.url+"reports/table.json?projectId="+cfg.projid+"&viewId="+cfg.viewid;
// url += "&rowCount=-1"; // N/A in intern api
// Official API
var apiurl = ""; // cfg.url+"api/viewContents/snapshots/v1/"+cfg.viewid+"?projectId="+cfg.projid+"&rowCount=3000";
//  api/viewContents/{type}/v1/{view_id}
var inited = 0;

if (process.argv[1].match("covconn.js")) {
  // load config for CLI
  var cfgfname = process.argv[3] || process.env['COVPOLL_CFG'] || process.env["HOME"]+"/.linetboot/global.conf.json";
  if (!fs.existsSync(cfgfname)) { apperror("No config ("+cfgfname+") found !"); }
  var mcfg = require(cfgfname);
  if (!mcfg) { apperror("main config ("+cfgfname+")could not be loaded"); }
  console.log("Loaded cfg: "+cfgfname);
  console.log("ENV:"+JSON.stringify(process.env, null, 2)+"\n");
  init(mcfg);
  if (!cfg) { apperror("No coverity config resolved from config"); }
  var ops = {list: list, report: report, poll: poll};
  // Allow special case for 'poll' to workaround pm2 limitations (e.g.):
  // COVPOLL_CFG=./covpoll.conf.json node_modules/pm2/bin/pm2 start covconn.js
  // Must also set LINETBOOT_COV_PASS or COV_PASS
  var op = process.env['COVPOLL_CFG'] ? 'poll' : process.argv.splice(2, 1);
  if (!op || !ops[op]) { usage("need valid op (try: "+Object.keys(ops).join(', ')+")!"); }
  ops[op]();

}

function init(_cfg) {
  if (inited) { return; }
  if (!_cfg) { throw "Must pass (cov) config !"; }
  cfg = _cfg.cov ? _cfg.cov : _cfg;
  if (!cfg) { throw "No config after trying to look it up"; }
  // Should do only for CL modes
  if (process.env["LINETBOOT_COV_PASS"]) { cfg.pass = process.env["LINETBOOT_COV_PASS"]; }
  if (process.env["COV_PASS"]) { cfg.pass = process.env["COV_PASS"]; }
  // || !cfg.viewid || !cfg.projid
  // || 
  if (!cfg.url  || !cfg.user || !cfg.pass) { throw "Check Cov. Config: url, viewid, projid, user, pass !"; }
  apiurl = cfg.url+"api/viewContents/snapshots/v1/"+cfg.viewid+"?projectId="+cfg.projid+"&rowCount=3000";
  creds_b64 = Buffer.from(cfg.user+":"+cfg.pass).toString('base64');
  axopt.headers.Authorization += creds_b64;
  inited++;
  return;
}

/************** CLI Handlers *******************/

/** Extract coverity project stats (using projid, viewid).
 * cov_proj_stats() called (async.) has a side effect of dumping data to stdout.
 * 
 */
function list() {
  //cov_proj_stats(() => { cov_proj_stats(); });
  var fname = "./rep/cov_proj_data.json";
  cov_proj_stats(apiurl, (err, d) => {
    if (err) { apperror("Coverity API error: "+err); }
    console.error("# Complete API Streams report for project: "+cfg.projid);
    console.log(JSON.stringify(d, null, 2));
    console.error("Store to a file (e.g.): ... > "+fname);
  });
}
/* Generate report in chart.js format (to stdout).
 * Use redirection to save.
 */
function report() {
  var okreps = {rel: 1, build: 1};
  var rep = process.argv.splice(2, 1);
  if (!rep) { usage("Pass report type after subcmd: rel,build"); }
  if (!okreps[rep]) { usage("No report '"+rep+"'. Try (either): rel,build"); } // throw "Report must be rel or build."; }
  // 
  var fname = process.argv.splice(2, 1) || "./rep/cov_proj_data.json";
  if (!fs.existsSync(fname)) { usage("File "+fname+" does not exist !"); }
  var data = require(fname);
  if (!data) { usage("No data from "); }
  var cdata = report_chart(data, rep);
  console.log(JSON.stringify(cdata, null, 2));
  
  console.error("To store: ... > ./rep/rep_"+rep+".json");

}

/** Poll Coverity service every N number of seconds to detect it is up.
* Make a dummy request to API and check valid response.
* Needs config params: url, user, pass, polltestact, pollinterval
* Example launch:
* ```
* # Start, follow log
* COVPOLL_CFG=./covpoll.conf.json COV_PASS=Ma53cRt node ./covconn.js > /tmp/cov_poll_log.txt
* tail -f /tmp/cov_poll_log.txt
* # Stop
* ps -ef | grep covconn
* kill ...
* ```
*/
function poll() {
  var interval =  cfg.pollinterval || 10000; // ms
  var stime = Date.now();
  console.log("Starting ... Now: "+ stime + ", Interval: "+interval+" ms. Action: "+cfg.polltestact);
  var status = "done"; // pend, done
  var prevstatus = "ok";
  var cmd = cfg.polltestact;
  // if (axopt.httptout ) { axopt.timeout = cfg.httptout; } // || 10000;
  // setInterval(function () { console.log("Hi !"); }, interval);
  setInterval(function () {
    if (status == "pend") { console.log("Status 'pend', pass ..."); return; }

    probeservice( (err, d) => {
      //if (err) {}
      console.log("Checked service: err: "+err+" (s: "+status+"), dt: "+ deltat());
    });
  }, interval);
  /** Ping coverity service */
  function probeservice(cb) {
    // NOTE: Keep pend logic exlusively either on polling (setInterval) side OR here.
    // (Otherwise we never get out of "pend").
    // if (status == "pend") { cb("Status pend. Cannot make another HTTP probe.", null); } // Guard against pending
    status = "pend";
    var info = { istrans: null, msg: null, ss: null}; // cb(null, rep); // to caller of probeservice (evinfo, pollinfo,probeinfo)
    var url = cfg.url + "api/views/v1/";
    axios.get(url, axopt).then((resp) => {
      var d = resp.data;
      // console.log(d); // DEBUG DUMP
      status = "done"; // done vs succ ?
      // istrans enabled will get to "Status pending, pass" (even if above status = "done";)
      var istrans = info.istrans = prevstatus != "ok";
      info.ss = "ok";
      console.log("  - Service OK.\n  - Is transition: "+istrans);
      prevstatus = "ok";
      if (d.views && Array.isArray(d.views)) { cb(null, d); } // Fully ok
      else { cb("Response not in expected format", null); } // Faulty format
      //else { cb(null, d); }
    }) // Service failure (by HTTP status). Set status = "done" only (but always) after fully resolving.
    // Keep status 'pend' as we are going to pursue async action
    // NOTE: Sometimes triggers: Status 'pend', pass ... NO Action executed, making it look like bug.
    // This seems to be if http request started running, but did not complete. Request times out in
    // approx 75 secs (3s. intvl, 25 polls) and error handler triggers
    .catch((ex) => {
      // status = "done";
      // console.log("Error polling: "+ex);
      var msg = "  - Service FAIL on Coverity server"; // (Sample API URL: '"+cfg.url+"')
      console.log(msg);
      var istrans = info.istrans = prevstatus != "err";
      info.ss = "fail";
      prevstatus = "err";
      console.log("  - Is transition: "+ istrans);
      // NOTE: we should trigger only on transition
      if (!istrans) { status = "done"; return cb("Not a transition !", null); }
      // TODO: Plan to focus on error detection and delegate action running to probeservice callback
      // if (prevstatus == "err") { status = "done"; return cb("Prev status err, not re-triggering action"); }
      ////////////// Action /////////////
      if (!cmd) { status = "done"; return cb("Failed test, but no action conf'd !", null); }
      var env = {COVSRV_URL: url + "", COVSRV_EV_TRANSTO: 'DOWN', }; // COVSRV_EV_DESC: ...
      // status = "pend"; // Set pending to avoid overlapping polls
      Object.keys(env).forEach((k) => { process.env[k] = env[k]; });

      console.log("  - Trigger: "+cmd);
      cproc.exec(cmd,  (err, stdout, stderr) => { // {env: env},
        //prevstatus = "err"; // Redundant when set above
        if (err) { status = "done"; return cb("Error launching action ("+cfg.polltestact+"): "+ err); }
	console.log("stdout: "+stdout+"\n stderr: "+stderr+"\n");
	status = "done";
	// prevstatus = "err"; // Earlier
	return cb(null, ex); // 
      });
      // cb(ex, null); // Async exec would leak here
    });
  }
  function deltat() { return (Date.now() - stime) / 1000; }
}

/************************ Module Utility funcs ***************************/

/** Transform API report into chart format (synchronously).
 * Uses coverity published (not internal) API data (complete response).
 * report (Use op "list" to generate into file).
 * @param data {object} - API data from coverity
 * @param rep {string} - Report type (rel or build)
 * @return Chart data
 */
function report_chart(data, rep) {
  // console.log(JSON.stringify(data, null, 2));
  // var rs = data.resultSet;
  // data = rs.results;
  // var tot = rs.totalCount;
  // var lim = rs.limit;
  if (!data.viewContentsV1) { apperror("No viewContentsV1 member !"); }
  if (!data.viewContentsV1.rows) { apperror("No rows member !"); }
  // Filter and Sort project snapshot data
  var pdata = pd_trans(data.viewContentsV1.rows);
  var cdata = null;
  if      (rep == 'rel') cdata = report_rel(pdata); // Aggregated to snapshotVersion
  else if (rep == 'build') cdata = report_build(pdata); //
  else { }
  return cdata; // For API usage
}
//
//async.waterfall([ ]);
/** Fetch project stats (asynchronously) from Coverity API.
* OLD: Must follow with a POST {} to choose page.
* @param url2 {string} - URL (complete with params) for API call
* @param cb {function} - callback to call with API response data.
*/
function cov_proj_stats(url2, cb) {
  if (!cb) { throw "No callback gotten to pass API results to!"; }
  console.error("Calling API URL: "+url2);
  axios.get(url2, axopt).then((resp) => {
    var d = resp.data;
    // Trials to work with Cov server internal API (not public or documented)
    /*
    var rs = d.resultSet;
    if (!rs) { rs = d.viewContentsV1 ? d.viewContentsV1 : null; }
    if (!rs) { console.log("No rs in: "+ JSON.stringify(d, null, 2)); }
    rs.reslen = rs.results.length;
    var pnum = rs.pageNum; // 1 for first
    delete(rs.results);
    console.log(JSON.stringify(d, null, 2));
    
    */
    /*
    403
    var pgnextmsg = { pageNum: (pnum+1), projectId: cfg.projid, viewId: cfg.viewid };
    axios.post(burl + "views/table.json", pgnextmsg, axopt).then((resp) => {
      var d2 = resp.data;
      console.log("Changed page: ", d2);
      cb && cb(null, d);
    }).catch((ex) => {
      console.log("Paging error: "+ex);
      
    });
    */
    // NOTHERE: console.log(JSON.stringify(d, null, 2));
    return cb(null, d);
  }).catch((ex) => {
    console.log("Error getting Cov API response ("+url2+"): "+ex);
    return cb(ex, null);
  });
}
/** Filter by matching configured pattern in snapshotVersion.
 * If pattern  has capturing parents, the $1 will be stored in mem m1.
 * See cfg.refilter
*/
function pd_trans(data) {
  var debug = 0;
  // User re filter with single parens (or first) to:
  // 1) capture as m1 in rec, and 2) to place into filtered set (on match).
  var re = cfg.refilter ? new RegExp(cfg.refilter) : null; // e.g. "^rel_myprod_(.+)$"
  // console.log(JSON.stringify(data, null, 2));
  debug && console.log("LEN(orig): "+data.length); // 1000 - paged
  // Note: Fields match betw. intern. / documented
  // Note (2 latter stream comps): snapshotVersion, snapshotTarget
  data = data.filter((ss) => { // Stream stat / snapshot
    //var comps = ss.streamName.split(/\s+/); // Avoid
    ss.totalDetected = parseInt(ss.totalDetected);
    
    //console.log(ss);
    
    //process.exit(1);
    var m = ss.snapshotVersion.match(re);
    if (m && m[1]) { ss.m1 = m[1]; } // Store first match ($1)
    return m;
  });
  // Sort ?
  if (cfg.sby) {  data.sort((a,b) => { return a[cfg.sby].localeCompare(b[cfg.sby]); }); }
  debug && console.log("LEN(sorted+filtered): "+data.length); //
  // console.log(JSON.stringify(data, null, 2));
  return data;
}
/************ Report type generators *********************/
// Group by release (extracted)
function report_rel(data) {
  // Alt: Group by release + build (no summing)
  var reldef = {};
  data.forEach((ss) => {
    if (!reldef[ss.m1]) { reldef[ss.m1] = 0; }
    reldef[ss.m1] += ss.totalDetected;
  });
  // console.log(reldef);
  var cdata = {labels: [], datasets: [{ "label": "Release Defects",
borderWidth: 1, backgroundColor: "#1456DD",
  data: []}]};
  Object.keys(reldef).sort().forEach((rel) => {
    cdata.labels.push(rel);
    cdata.datasets[0].data.push(reldef[rel]);
  });
  //console.log(JSON.stringify(cdata, null, 2));
  return cdata;
}

// Build-level report - Combine snapshotVersion, snapshotTarget
function report_build(data) {
  // Release ...
  var cdata = {labels: [], datasets: [{ "label": "Build Defects",
borderWidth: 1, backgroundColor: "#002999", // "#1456DD", "#2F34A3"
data: [] }]};
  data.forEach((ss) => {
    if (ss.m1) { cdata.labels.push(ss.m1+" - "+ss.snapshotTarget); }
    else { cdata.labels.push(ss.snapshotTarget); }
    cdata.datasets[0].data.push(ss.totalDetected);
  });
  return cdata;
}

/**************** Web *********************/

function express_report(req, res) {
  var jr = {status: "err", msg: "Cannot create Coverity streams report. "};
  // NOTHERE: covconn.init();
  var q = req.query;
  var rep = q.rep || 'build';
  if (!["build","rel"].includes(rep)) { jr.msg += "No report: "+rep; return res.json(jr); }
  cov_proj_stats(apiurl, function (err, d) {
    if (err) { jr.msg += err; return res.json(jr); }
    //For now: Detect use-case by url (!chart => grid)
    if (req.url && !req.url.match(/chart/)) {
      // Should start: {\n"viewContentsV1": { ...
      //console.log(d);
      return res.json(d);
    }
    // var rep = 'build';
    var cdata = report_chart(d, rep);
    if (!cdata) { jr.msg += "Could not create Streams (snapshotTarget) chart"; return res.json(jr); }
    res.json(cdata);
  });
}
///////////// CLI Utils /////////////////
function usage(msg) {
  if (msg) { console.log(msg); }
  process.exit(1);
}
function apperror(msg) {
  if (msg) { console.error(msg); }
  process.exit(1);

}

module.exports = {
  init: init,
  cov_proj_stats: cov_proj_stats,
  // pd_trans: pd_trans,
  // report_rel: report_rel,
  // report_build: report_build,
  report_chart: report_chart,
  express_report: express_report,
};
