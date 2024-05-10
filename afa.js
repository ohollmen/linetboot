/** @file
 * List Artifactory image info.
 * Model along API call examples https://jfrog.com/help/r/jfrog-rest-apis/artifactory-rest-apis
 * (Also: https://jfrog.com/help/r/how-to-use-docker-registry-api-with-artifactory-docker-repository-when-not-using-docker-client)
 * TODO: Expand to cover more apis ?
*/
var axios = require("axios");
var Mustache = require("mustache");


var apiprefix = "api/docker/{{ imgrepo }}/v2/";
var ahdr = "X-JFrog-Art-Api"; // Auth header (See Introduction ..., also Bearer token, basic w. user:token)
var cfg;
var creds = {};
var ropts = {headers: {}};
function init(_mcfg) {
    if (!_mcfg) { throw "No main config"; }
    if (!_mcfg["afa"]) { throw "No afa config within main config"; }
    cfg = _mcfg["afa"];
    if (!cfg.host) { console.log( "No  config host" ); return; }
    //if (!cfg.user) { console.log( "No  config user" ); return; }
    //if (!cfg.pass) { console.log( "No  config pass" ); return; }
    if (!cfg.token) { console.log( "No  config token" ); return; }
    //cfg.storepath = cfg.storepath || process.env["HOME"] + "/.linetboot/zzzz/";
    process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
    // Artifactory appects many variants of creds passing
    //creds = cfg.user+":"+cfg.pass;
    creds[ahdr] = cfg.token;
    ropts.headers[ahdr] = cfg.token; // axios
    console.log(cfg);
}
function mkurl(path) {
  // Use imgrepo from cfg.
  var prepath = Mustache.render(apiprefix, cfg);
  return "https://"+cfg.host+"/"+prepath+""+path;
}
function curl(url) {
  console.log(`curl -H '${ahdr}:${cfg.token}' '${url}'`);
}
function lsimgs() {
  var url = mkurl("_catalog");
  curl(url);
  //axios.get(url, ropts).then( (resp) => {
  //  var d = resp.data;
  //  console.log(JSON.stringify(d, null, 2));
  //
  //}).catch( (ex) => { console.log("Error requesting: "+ex); });
}
function lstags() {
  // Even tail must be parametrized here. The first path part must have '/' url-escaped to '%2F'.
  var imgpath = cfg.imgpath;
  imgpath = imgpath.replace(/\//g, '%2F');
  var urlappend = imgpath + "/tags/list";
  var url = mkurl(urlappend);
  curl(url);
}
var acts = [
  // List / GET
  {"id": "imgs",   "title": "List Images (w/o tag)",   "cb": lsimgs, },
  {"id": "tags",   "title": "List Tags",   "cb": lstags, },
];

var clopts = [
  // ARG+ for multiple
  ["i", "imgrepo=ARG", "Image repo label"],
  ["i", "imgpath=ARG", "Image path to list"],
];

function usage(msg) {
  if (msg) { console.log(msg); }
  console.log("Subcommands ");
  acts.forEach( (a) => { console.log("- " + a.id + " - " + a.title ); });
  console.log("Options (each may apply to only certain subcommand)");
  clopts.forEach( (o) => { console.log("- "+o[1] + " - " + o[2]); });
  process.exit(1);
}

if (process.argv[1].match("afa.js")) {
  var argv2 = process.argv.slice(2);
  var op = argv2.shift();
  if (!op) { usage("No subcommand"); }
  var opnode = acts.find( (an) => { return an.id == op;  });
  if (!opnode) { usage("Subcommand  "+op+" not supported."); }
  var Getopt   = require("node-getopt");
  var mc    = require("./mainconf.js");
  var getopt = new Getopt(clopts);
  var opt = getopt.parse(argv2);
  let opts = opt.options;
  opts.op = op; // For handlers to detect op
  // TODO: Load all: device, service,
  var cfgfn = process.env["HOME"] + "/.linetboot/global.conf.json"
  var mcfg = mc.mainconf_load(cfgfn);
  mc.env_merge(mcfg);
  mc.mainconf_process(mcfg);
  init(mcfg);
  //console.log("OK");
  //opts_parse2(opts);
  var rc = opnode.cb(opts) || 0;
}
