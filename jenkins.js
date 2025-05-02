/** @file
 * # Links, References
 * https://www.jenkins.io/doc/book/using/remote-access-api/
 * https://www.jenkins.io/doc/book/system-administration/authenticating-scripted-clients/
 * https://stackoverflow.com/questions/45472604/get-jenkins-job-build-id-from-queue-id
 * 
 * # Config job profiles
 * - jobs (obj) - name (key) mapped to partial Jenkins build URL that should be part of full URL: http://jenk-serv/job/${PARTIAL_URL}/build
 *    (Note: no starting or trailing '/' in partial url)
 */
let fs      = require('fs');
let path    = require('path');
let axios   = require("axios");
let jsyaml  = require("js-yaml");
var Getopt  = require("node-getopt");
var cfl     = require("./confluence.js"); // For http helper
let cfg = {};
function init(_mcfg) {
  if (_mcfg.jenkins) { cfg = _mcfg.jenkins; }
  else { cfg = _mcfg; }
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
// Build jenkins job (POST)
function jenkins_build(job, xpara) {
  if (!job) { console.error("No job identifier (URL segment) give !"); return null; }
  var usch = (cfg.ssl || (cfg.ssl === undefined)) ? "https" : "http"; // Could use !("ssl" in cfg) or !cfg.hasOwnProperty("ssl")
  // let path = ``;
  var url = usch +`://${cfg.host}/job/${job}/`; // &depth=N (0,1,2,3) // "/api/json?pretty=true"
  // Job name gotten from jobs[N].name (--data => application/x-www-form-urlencoded)
  // Note: Name may be *long* (with multiple paths steps), not just simple \w+ token.
  // /job/JOB_NAME/build?token=TOKEN_NAME (Go to build, Auth... Token: ...)
  // POST, but, params passed in GET-style query URL
  // /job/JOB_NAME/buildWithParameters --data id=123 --data verbosity=high (or --form key=@file)
  // --form => multipart/form-data
  
  var rpara = {"headers": {"Authorization": ""}};
  cfl.add_basic_creds(cfg, rpara);
  rpara.headers.accept = "application/json";
  // let hdrs = { Authorization: "Basic " + btoa(`${cfg.user}:${cfg.pass}`),  'Accept': 'application/json' }; // "Content-type": "application/json",
  // let rpara = { headers: hdrs };
  let params = {};
  if (xpara && Object.keys(xpara).length) {
    Object.keys(xpara).forEach( (k) => {  params[k] = xpara[k]; } );
    // url.replace("build", "");
    url += 'buildWithParameters';
    rpara.params = params;
  }
  else { url += 'build'; } // ?delay=0sec - No parameters !
  url += `?delay=0sec`;
  console.log(`RPARA`, rpara);
  console.log(`Concluded POST URL: ${url}`);
  //return;
  // resp has: servel, message, url, status (HTTP status)
  // message: 'No valid crumb was included in the request',
  axios.post(url, null, rpara).then( (resp) => {
    let d = resp.data;
    // resp.headers.Link is ';' separated list ... (pick -1)
    console.log(d);
    console.log("Submitted request ok.");
    console.log("R-headers:", resp.headers);
    // location: https://my.server.com/queue/item/136857/
    if (resp.headers && resp.headers.location) {
      let bid = path.basename(resp.headers.location);
      console.log(`Extracted BID: ${bid}`);
    }
  }).catch( (ex) => {
      console.log(`Error calling Jenkins: ${ex}`);
      console.log(ex.response);
  });
}

// let pstr_g = "KEY1=VAL1";

// Parse line oriented k=v object
function getparams(pstr, sep) {
  sep = sep || "\n";
  pstr = pstr.trim();
  let p = {}; // "\n" VVV
  pstr.split(sep).forEach( (l) => { let kv = l.split('='); p[kv[0]] = kv[1]; });
  if (!Object.keys(p).length) { return null; }
  return p;
}

module.exports = { init: init, jenkins_build: jenkins_build };
//var ops = {
//  "run": 
//};
var clopts = [
  // ARG+ for multiple
  ["f", "paramfn=ARG", "Parameter filename (json, yaml or txt)"], // 
  ["p", "path=ARG", "Path fragment of Jenkins build URL (/job/{PATH}/build or /job/{PATH}/buildWithParameters)"], // 
  ["", "prof=ARG", "Job profile label"],
  //["a", "acctype=ARG", "Access Type (SSH, RDP, WEB)"],  // For ...
  ["d", "debug", "Turn on debugging (for more verbose output)"],
  ["", "params=ARG", "Build parameters as string of form 'k1=v1&k2=v2'"],
];
var acts = [
  { id: "run", "title": "Run Jenkins job (by profile (first arg), with or w/o params by --params or --paramfn)", cb: jjob_run},
];
function usage(msg) {
  if (msg) { console.log(msg); }
  console.log("Subcommands:");
  acts.forEach( (a) => { console.log("- " + a.id + " - " + a.title ); });
  console.log("Options (each may apply to only certain subcommand)");
  clopts.forEach( (o) => { console.log("- "+o[1] + " - " + o[2]); });
  process.exit(1);
}
function build_param_parse(fn) {
  let p = null;
  if (!fs.existsSync(fn)) { console.log(`Parameter file ${fn} does not exist`); return null; }
  if (fn.match(/\.json$/)) { p = require(fn); }
  //if (fn.match(/\.yaml$/)) { p = jsyaml.load(fn, {json: true}); }
  if (fn.match(/\.txt$/)) { let pstr = fs.readFileSync(fn, 'utf8'); p = getparams(pstr); }
  return p;
}

function jjob_run(opts) {
  let p = opts.params;
  if (p && (typeof p != 'object')) { usage(`Params not in object (got ${typeof p}) !`); }
  if (!opts.prof) { usage(`No job profile passed (as 1st arg) from CLI.`); }  
  if (!cfg.jobs || (typeof cfg.jobs != 'object')) { usage(`Job profiles not available`); }
  if (!cfg.jobs[opts.prof]) { usage(`Job profile '${opts.prof}' not available`); }  
  console.log('PARAMS:', JSON.stringify(p, null, 2));
  jenkins_build(cfg.jobs[opts.prof], p);
}
if (process.argv[1].match("jenkins.js")) {
  
  let mcfg_fn = `${process.env['HOME']}/.linetboot/global.conf.json`;
  let mcfg = require(mcfg_fn);
  init(mcfg);
  let opts = {};
  var argv2 = process.argv.slice(2);
  var op = argv2.shift();
  if (!op) { usage(`No subcommand given`); }
  let opn = acts.find( (a) => { return a.id == op; });
  if (!opn) { usage(`No subcommand found by '${op}'`); }
  var getopt = new Getopt(clopts);
  var opt = getopt.parse(argv2);
  opts = opt.options;
  let p = null; // getparams(pstr_g); // early/experimental
  let fnbpara = opts.paramfn; // process.argv[3] || `${process.env['HOME']}/.linetboot/build_params.txt`;
  if (!fnbpara) { console.log(`No build params (filename) passed from CLI`); }
  if (fnbpara && fs.existsSync(fnbpara)) { p = build_param_parse(fnbpara); }// || {}
  else if (opts.params) { p = getparams(opts.params, '&'); }
  //let bprof = process.argv[2];  // any profile from cfg.jobs = {...}
  // Override original CLI or file originated string params
  if (p) { opts.params = p; }
  opn.cb(opts);
  //jenkins_build(jobpath, {}); // Job may not have params (?)
}
