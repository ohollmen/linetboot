/** @file
 * List Artifactory image info.
 * Model along API call examples https://jfrog.com/help/r/jfrog-rest-apis/artifactory-rest-apis
 * (Also: https://jfrog.com/help/r/how-to-use-docker-registry-api-with-artifactory-docker-repository-when-not-using-docker-client)
 * See also: https://jfrog.com/help/r/jfrog-artifactory-documentation/browse-docker-repositories
 * - GET /api/repositories https://jfrog.com/help/r/jfrog-rest-apis/get-repositories
 * - https://docs.docker.com/registry/
 *   - https://distribution.github.io/distribution/spec/manifest-v2-2/ ( https://distribution.github.io/distribution/spec/deprecated-schema-v1/ )
 *   - OCI image manifest spec: https://github.com/opencontainers/image-spec/blob/main/manifest.md
 * - Reg. API: https://www.baeldung.com/ops/docker-registry-api-list-images-tags
 *   - has url -X GET my-registry.io/v2/_catalog GET my-registry.io/v2/ubuntu/tags/list GET /v2/ubuntu/nginx/manifests/latest
 * - Note: Artifactory may only have "schemaVersion" : 1, available.
 * - Search: Google: docker registry api
 * - Art repos: GET /api/repositories/?packageType=Docker (In regards to Google terminology G:project == A:repo)
 * - Compare to G.Art.Reg: curl -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    "https://us-docker.pkg.dev/v2/my-project/my-repo/my-image/tags/list" | jq ".tags" (https://cloud.google.com/artifact-registry/docs/reference/docker-api)
      - See also: https://cloud.google.com/artifact-registry/docs/reference/rest
        (https://cloud.google.com/artifact-registry/docs/reference/rest#rest-resource:-v1.projects.locations.repositories.dockerimages)
 * TODO: Expand to cover more apis ?
 * - Note: It seems lot of these calls are memrely universal Docker Registry API calls
 * - Registry API doc: https://docker-docs.uclv.cu/registry/spec/api/
*/
var axios = require("axios");
var Mustache = require("mustache");
var fs = require("fs");
var async = require("async");
// API URL rules: https://docker-docs.uclv.cu/registry/spec/api/
// - Shows API starting w. /v2/, <name> is the *image* name
// - Art seems to namespace their container registry with their own prefix
//   - imgrepo (below) is a single (non-path hier.) token ([\w\-]+, e.g. a-b-c)
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
// List images 
function lsimgs(p) {
  var url = mkurl("_catalog");
  curl(url);
  var re = null;
  if (cfg.excpatt) { re = new RegExp(cfg.excpatt, 'g'); }
  var imgidx = {};
  axios.get(url, ropts).then( (resp) => {
    var d = resp.data;
    if (!d.repositories) { throw "No image paths listed !!!"; }
    if (re) { d.repositories = d.repositories.filter( (p) => { return ! p.match(re); }); }
    console.log(JSON.stringify(d, null, 2));
    console.log(d.repositories.length + " Items");
    if (!p.op == 'imgstags') { return; }
    // op: 'imgstags' - Optionally continue by fetching tags for each
    async.mapSeries(d.repositories, image_tags, function (err, ress) {
      if (err) { var xerr = "Error iterating image paths:"+err; console.log(xerr); return;  }
      var fn = "/tmp/docker_images_tags.json";
      fs.writeFileSync( fn,  JSON.stringify(ress, null, 2) , {encoding: "utf8"} );
      //console.log(imgidx);
      console.log("Wrote to "+fn);
    });
  }).catch( (ex) => { console.log("Error requesting: "+ex); });
  // List tags for image by it's full path (w/o tag)
  // TODO: Place outside, but note: imgidx (imgidx[imgpath])
  function image_tags(imgpath, cb) {
    //if (!imgpath) { return cb("No imagepath", null); }
    console.error("Querying tags for img: "+imgpath);
    imgidx[imgpath] = 1; // TEST ()
    var e = {imgpath: imgpath, tags: []}; // TODO
    var url = mkurl(taglist_urlpath(imgpath));
    axios.get(url, ropts).then( (resp) => {
      var d = resp.data;
      //if (d.tags != imgpath) { console.error("Warning: mismatch in imgpath"); } // assert
      //if (!d.tags) { console.error("Warning: No tags for query"); }
      //console.log(JSON.stringify(d, null, 2));
      //imgidx[imgpath] = d.tags;
      e.tags = d.tags;
      //return cb(null, imgpath); // Simple
      return cb(null, e);
    }).catch( (ex) => { console.log("Error requesting: "+ex); });
    
  }
}
// Create a taglist URL with imgpath '/' escaped to '%2F'
// TODO: ensure 
function taglist_urlpath(imgpath, append) {
  imgpath = imgpath.replace(/\//g, '%2F');
  append = append || "/tags/list";
  var urlappend = imgpath + append; // "/tags/list";
  return urlappend;
}
function lstags(p) {
  // Even tail must be parametrized here. The first path part must have '/' url-escaped to '%2F'.
  var imgpath = p.imgpath || cfg.imgpath; // fall back to example image path from config
  if (!imgpath) { usage("No docker image path present for tags listing.") }
  var url = mkurl(taglist_urlpath(imgpath));
  //curl(url);
  axios.get(url, ropts).then( (resp) => {
    var d = resp.data;
    console.log(JSON.stringify(d, null, 2));
  
  }).catch( (ex) => { console.log("Error requesting: "+ex); });
}
/** List repo image manifest
 * Note: Lots of valuable info comes in HTTP Headers (As hinted on https://distribution.github.io/distribution/spec/api/, Digest Header) !!!
 */
function lsmani(p) {
  var imgpath = p.imgpath || cfg.imgpath;
  var tag = p.tag || "latest";
  console.log(`lsmani: imgpath=${imgpath}&tag=${tag}`);
  var url = mkurl(taglist_urlpath(imgpath, "/manifests/"+tag)); // latest
  curl(url);
  axios.get(url, ropts).then( (resp) => {
    var d = resp.data;
    console.log(resp.headers); // docker-content-digest, x-artifactory-id
    d.cont_digest = resp.headers["docker-content-digest"]; // 64B hex
    d.art_id = resp.headers["x-artifactory-id"]; // Only 40B (hex)
    if (d.fsLayers && (d.fsLayers.length == 1)) { d.note = "Images with single layer are often vendor/open source project base images."; }
    var h = history_list(d);
    if (h) { console.log(JSON.stringify(h, null, 2)); }
    if (p.cb) { p.cb(null, d); }
    else { console.log(JSON.stringify(d, null, 2)); }
  }).catch( (ex) => { console.log("Error requesting: "+ex); });
}
/* Parse History in manifest (schema 1) "history" (AoO) member.
* Each entry (obj) is expected to be in format: {v1Compatibility}
* Possibly support schema 2 by detecting version.
There are multi item commands like below (join these for more info-value ?), but there is likely a more coherent
version of same command in j.config.Cmd[0] (single item with last part of below)
Cmd: [
  '/bin/sh',
  '-c',
  '#(nop) ',
  'CMD ["/opt/bit/scripts/postgresql-repmgr/run.sh"]'
],
*/
function history_list(m) {
  if (m.schemaVersion != 1) { console.log(`Encountered schemaVersion ${m.schemaVersion}`); return null; }
  var h = m.history;
  if (!Array.isArray(h)) { console.log("Manifest history is not in array !!"); return null; }
  // consider: throwaway (true/false), j.container_config.Cmd[0] (Seems always an array of 1 item )
  // TODO: try {} catch (ex) {}
  return h.map( (hi) => {
    var j = JSON.parse(hi.v1Compatibility);
    console.log(j);
    // Consult different member for actual simple command
    var cmd = j.container_config.Cmd;
    //if (cmd.length > 1) { cmd = j.config.Cmd; }
    if (cmd.length > 1) { cmd = [cmd[cmd.length - 1]]; } // arry.slice(-1); / arry.pop();
    return { Cmd: cmd[0], throwaway: j.throwaway };
  });
}
var acts = [
  // List / GET
  {"id": "imgs",    "title": "List Images (w/o tag)","cb": lsimgs, },
  {"id": "imgstags","title": "List Images AND Tags", "cb": lsimgs, },
  {"id": "tags",    "title": "List Tags",       "cb": lstags, },
  {"id": "mani",    "title": "List Manifest",   "cb": lsmani, },
  // {"id": "urls",   "title": "List Test URLs (curl)",   "cb": ????, },
  {"id": "conf",   "title": "Show default imgrepo,imgpath",
     "cb": (p) => {
     if (!cfg) { console.error("No afa config !"); return; }
     console.log(`imgrepo: ${cfg.imgrepo}\nimgpath: ${cfg.imgpath}\nstorpath: ${cfg.storpath}`);
     }, },
];

var clopts = [
  // ARG+ for multiple
  ["r", "imgrepo=ARG", "Image repo label"],
  ["p", "imgpath=ARG", "Image path to list"],
  ["t", "tag=ARG", "Tag for the image (given by --imgpath)"],
];

function usage(msg) {
  if (msg) { console.log(msg); }
  console.log("Subcommands ");
  acts.forEach( (a) => { console.log("- " + a.id + " - " + a.title ); });
  console.log("Options (each may apply to only certain subcommand)");
  clopts.forEach( (o) => { console.log("- "+o[1] + " - " + o[2]); });
  process.exit(1);
}
function afaimgs(req, res) {
  var fn = cfg.storpath;
  if (!fs.existsSync(fn)) { fn = process.env.HOME +"/.linetboot/afa/docker_images_tags.json"; }
  var imgs = require(fn);
  res.json({status: "ok", data: imgs});
}
function imgmani(req, res) {
  var jr = {"status": "err", "msg": "Could not produce Manifest info details ! "};
  var fn = cfg.storpath;
  var q = req.query;
  if (!q.imgpath) { jr.msg += "No imgpath passed"; return res.json(jr); }
  if (!q.tag)     { jr.msg += "No tag passed"; return res.json(jr); }
  var p = { tag: q.tag, imgpath: q.imgpath, cb: respond }; // q.imgpath / cfg.imgpath
  //p.tag = "0.0.13"; // TEST
  lsmani(p);
  function respond(err, d) {
    if (err) { return res.json(jr); }
    return res.json({"status": "ok", "data": d});
  }
  //if (!fs.existsSync(fn)) { fn = process.env.HOME +"/.linetboot/afa/docker_images_tags.json"; }
  //var imgs = require(fn);
  //res.json({status: "ok", data: imgs});
}
module.exports = {init: init, afaimgs: afaimgs, imgmani: imgmani};

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
