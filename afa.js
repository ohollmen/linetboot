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
 * - Note: It seems lot of these calls are merely universal Docker Registry API calls
 * - Registry API doc: https://docker-docs.uclv.cu/registry/spec/api/
 * - Make imgpath: "..." => imgpaths: [], pass ?imgpath=...
 * ## JSON cache file
 * - AFA: AoO - Objects are images found under a "folder" cfg.imgrepo
 *   - Gotten w. "_catalog" and "/tags/list" (See lsimgs)
 *   - Each image has one or more tags (e.g. latest, 1.0.15, 24.04)
 *   - Each tagged version has manifest: `${imgpath}/manifests/${tag}`, where tag is also called "reference" (like git)
*/
var axios = require("axios");
var Mustache = require("mustache");
var fs    = require("fs");
var async = require("async");
var jsyaml  = require('js-yaml');
// API URL rules: https://docker-docs.uclv.cu/registry/spec/api/
// - Shows API starting w. /v2/, <name> is the *image* path/name aka reponame
// - Art seems to namespace their container registry with their own prefix (artifactory/)
//   - imgrepo (below) is a single (non-path hier.) token ([\w\-]+, e.g. a-b-c) specific to artif.
//   - name afarepo
//   - Also it seems URL-escaping path following v2/ is artifactory specific.
var apiprefix = "api/docker/{{ imgrepo }}/v2/";
// For "neutral" registry, the prefix might be:
//var apiprefix = "v2/"; // Followed by (spec:) "reponame" aka (here) imgpath
var ahdr = "X-JFrog-Art-Api"; // Auth header (See Introduction ..., also Bearer token, basic w. user:token)
var cfg;
var creds = {};
var ropts = {headers: {}};
// Init !
function init(_mcfg) {
    if (!_mcfg) { throw "No main config passed"; }
    if (!_mcfg["afa"]) { console.error("No afa config (return)"); return; } // throw "No afa config within main config";
    cfg = _mcfg["afa"];
    if (!cfg.host) { console.log( "No config host" ); return; }
    //if (!cfg.user) { console.log( "No  config user" ); return; }
    //if (!cfg.pass) { console.log( "No  config pass" ); return; }
    if (!cfg.token) { console.log( "No  config token" ); return; }
    //cfg.storepath = cfg.storepath || process.env["HOME"] + "/.linetboot/zzzz/";
    process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
    // Artifactory appects many variants of creds passing
    //creds = cfg.user+":"+cfg.pass;
    creds[ahdr] = cfg.token;
    ropts.headers[ahdr] = cfg.token; // axios
    if (cfg.apiprefix) { apiprefix = cfg.apiprefix; }
    if (cfg.afarepo) {  } // Prep  by templating: apiprefix = Mustache.render(apiprefix, cfg)
    //console.log(cfg);
    // e.g. afa.conf.yaml
    if (cfg.repocfgfn && fs.existsSync(cfg.repocfgfn)) {
      let cont = fs.readFileSync(cfg.repocfgfn, 'utf8');
      cfg.repocfg = jsyaml.load(cont);
    }
}
// Make various API URL paths derived from the fixed / constant prefix part of the path
// Typical appended "path" parts: _catalog
function mkurl(path) {
  // Use "imgrepo" (TODO: afarepo) from cfg.
  // if (cfg.afarepo) {
  var prefixpath = Mustache.render(apiprefix, cfg);
  return `https://${cfg.host}/${prefixpath}${path}`;
}
function curl(url) {
  console.log(`curl -H '${ahdr}:${cfg.token}' '${url}'`);
}
// List images and optionally tags (CLI).
// For now this is only CLI op and web frontend uses cached version produced here.
// Saves docker_images_tags.json (AoO)
function lsimgs(p) {
  var url = mkurl("_catalog");
  curl(url);
  var re = null;
  if (cfg.excpatt) { re = new RegExp(cfg.excpatt, 'g'); }
  var imgidx = {}; // Map: imgpath: 1
  axios.get(url, ropts).then( (resp) => {
    // { "repositories": [ <name>, ... ] } these are paths
    var d = resp.data;
    if (!d.repositories) { throw "No image paths listed (for _catalog query) !"; }
    if (re) { d.repositories = d.repositories.filter( (p) => { return ! p.match(re); }); }
    console.log(d.repositories.length + "  Repositories by _catalog");
    console.log(`REPOS:`+JSON.stringify(d, null, 2));
    
    if (p.op != 'imgstags') { return; } // TODO: !p.op == 'imgstags' Incorrect ? Changed
    // op: 'imgstags' - Optionally continue by fetching tags for each "repo"
    async.mapSeries(d.repositories, image_tags, function (err, ress) {
      if (err) { var xerr = "Error iterating image paths:"+err; console.log(xerr); return;  }
      // Detect web: if (!p.op && p.cb) { return p.cb(ress); }
      var fn = "/tmp/docker_images_tags.json"; // cfg.storpath || 
      // if (fs.existsSync(fn)) { console.error(`output file ${fn} exists.`); return; }
      fs.writeFileSync( fn,  JSON.stringify(ress, null, 2) , {encoding: "utf8"} );
      //console.log(imgidx);
      console.log("Wrote to "+fn);
    });
  }).catch( (ex) => { console.log(`Error requesting: ${ex}`); });
  // List tags for image by it's full path (w/o tag)
  // TODO: Place outside, but note: imgidx (imgidx[imgpath])
  function image_tags(imgpath, cb) {
    //if (!imgpath) { return cb("No imagepath", null); }
    console.error(`Querying tags for img: ${imgpath}`);
    imgidx[imgpath] = 1; // TEST ()
    var e = { imgpath: imgpath, tags: [] }; // Pass to completion cb(null, e)
    var url = mkurl(taglist_urlpath(imgpath)); //  "/tags/list"
    curl(url);
    axios.get(url, ropts).then( (resp) => {
      var d = resp.data;
      //if (d.tags != imgpath) { console.error("Warning: mismatch in imgpath"); } // assert
      //if (!d.tags) { console.error("Warning: No tags for query"); }
      //console.log(JSON.stringify(d, null, 2));
      //imgidx[imgpath] = d.tags;
      e.tags = d.tags;
      //return cb(null, imgpath); // Simple
      return cb(null, e);
    }).catch( (ex) => { console.log(`Error requesting: ${ex}`); });
    
  }
}
// Create a taglist URL-path with imgpath '/' escaped to '%2F' and optional appended part added.
// Default append: "/tags/list", Others: /manifests/${tag}
// TODO: rename imgpath_urlpath
function taglist_urlpath(imgpath, append) {
  imgpath = imgpath.replace(/\//g, '%2F'); // Only on afa
  append = append || "/tags/list";
  var urlappend = imgpath + append;
  return urlappend;
}
function lstags(p) {
  // Even tail must be parametrized here. The first path part must have '/' url-escaped to '%2F'.
  var imgpath = p.imgpath || cfg.imgpath; // fall back to example image path from config
  if (!imgpath) { usage("No docker image path present for tags listing.") }
  var url = mkurl(taglist_urlpath(imgpath)); // "/tags/list"
  curl(url);
  axios.get(url, ropts).then( (resp) => {
    var d = resp.data;
    console.log(JSON.stringify(d, null, 2));
  
  }).catch( (ex) => { console.log("Error requesting: "+ex); });
}
/** List repo image manifest (for CLI or Web)
 * Note: Lots of valuable info comes in HTTP Headers - as hinted on:
 * https://distribution.github.io/distribution/spec/api/, Digest Header !!!
 */
function lsmani(p) {
  var imgpath = p.imgpath || cfg.imgpath;
  var tag = p.tag || "latest";
  console.log(`lsmani(p): imgpath=${imgpath}&tag=${tag} (imgpath un-encoded)`);
  var url = mkurl(taglist_urlpath(imgpath, `/manifests/${tag}`)); // e.g. latest
  curl(url);
  axios.get(url, ropts).then( (resp) => {
    var d = resp.data;
    console.log(resp.headers); // docker-content-digest, x-artifactory-id
    d.cont_digest = resp.headers["docker-content-digest"]; // 64B hex
    d.art_id      = resp.headers["x-artifactory-id"]; // Only 40B (hex)
    if (d.fsLayers && (d.fsLayers.length == 1)) {
      d.note = "Images with single layer are often vendor/open source project base images.";
    }
    var h = history_list(d); // Layer history from retrieved data d
    if (h) { console.log("HISTORY:"+ JSON.stringify(h, null, 2)); }
    if (p.cb) { return p.cb(null, d); }
    else { console.log(JSON.stringify(d, null, 2)); } // CLI
  }).catch( (ex) => {
    console.log(`Error requesting manifest: ${ex}`);
    if (p.cb) { return p.cb(`Error requesting manifest: ${ex}`, null); }
  });
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
  return h.map( (hi) => { // History item
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
  // {"id": "apiinfo",    "title": "Api Info (v2/)","cb": apiinfo, }, // function apiinfo(p) {} 200 OK/ 401 / 404
  // List / GET
  {"id": "imgs",    "title": "List Images (w/o tag)","cb": lsimgs, },
  {"id": "imgstags","title": "List Images AND Tags (writes docker_images_tags.json)", "cb": lsimgs, },
  {"id": "tags",    "title": "List Tags",       "cb": lstags, },
  {"id": "mani",    "title": "List Manifest",   "cb": lsmani, },
  // {"id": "urls",   "title": "List Test URLs (curl)",   "cb": ????, },
  {"id": "conf",   "title": "Show default imgrepo,imgpath,storpath",
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
  //["s", "save=ARG", "Filename for file to save (for op imgtags)"],
];

function usage(msg) {
  if (msg) { console.log(msg); }
  console.log("Subcommands ");
  acts.forEach( (a) => { console.log("- " + a.id + " - " + a.title ); });
  console.log("Options (each may apply to only certain subcommand)");
  clopts.forEach( (o) => { console.log("- "+o[1] + " - " + o[2]); });
  process.exit(1);
}
////////////////// Web handlers /////////////////////////
// List images (from top level item) by using cached data (/afaimgs).
// TODO: Allow passing top-level repo to choose file for *that* toprepo or filter by that repo ?
function afaimgs(req, res) {
  let jr = {status: "err", "msg": "Could not serve images info. "};
  var fn = cfg.storpath;
  if (!fn) { fn = process.env.HOME +"/.linetboot/afa/docker_images_tags.json"; }
  if (!fs.existsSync(fn)) { jr.msg += "No cache file found !"; return res.json(jr); }
  var imgs = require(fn); // Load cached !
  if (!imgs) { jr.msg += "No valid (cached) JSON loaded !"; return res.json(jr); }
  res.json({status: "ok", data: imgs});
}
// Load image manifest by (full) imagepath and tag (from query params to /imgmani).
// imgpath should be urlencoded by client ('/' => '%2F') E.g.: ?imgpath=path1%2Fpath2&tag=0.0.1
function imgmani(req, res) {
  var jr = {"status": "err", "msg": "Could not produce Manifest info details ! "};
  // var fn = cfg.storpath; // NOT used here
  var q = req.query;
  if (!q.imgpath) { jr.msg += "No 'imgpath' passed in query"; return res.json(jr); }
  if (!q.tag)     { jr.msg += "No 'tag' passed in query"; return res.json(jr); }
  // Simulate CLI opts (p) for web mode
  var p = { tag: q.tag, imgpath: q.imgpath, cb: respond }; // q.imgpath / cfg.imgpath
  //p.tag = "0.0.13"; // TEST
  lsmani(p);
  function respond(err, d) {
    if (err) { jr.msg += `Error getting image manifest: ${err}`; return res.json(jr); }
    return res.json({"status": "ok", "data": d});
  }
}
////////////////// Normal AFA (non-docker) repos
function afarepo_ls(req, res) {
  let jr = {status: "err", msg: ""};
  // Grab config from the non-official part of cfg.
  if (!cfg.repocfg) { jr.msg += "No afa repo config (By: repocfgfn) !"; return res.json(jr); }
  let id = (req.params && req.params.id) ? req.params.id : '';
  //if (!id) { jr.msg += `No afa repo config id passed' !`; return res.json(jr); }

  let rcfg = id ? repocfg_node(id) : cfg.repocfg[0];
  //
  if (!rcfg) { jr.msg += `No afa repo config by '${id}' !`; return res.json(jr); }
  // TODO: Actually list repos
  let rpara = {
    headers: { 'X-JFrog-Art-Api': rcfg.token, 'Accept': 'application/json', }
  };
  
  let url = `{rcfg.host}/api/repositories`; // `/{reponame}`;
  axios.get(url, rpara).then( (resp) => {
    let d = resp.data;
    res.json({status: "ok", data: d});
  }).catch( (ex) => { jr.msg += `Failed to list AFA repos (from ${url}): ${ex}`; return res.json(jr); });
  
  //res.json({status: "ok", data: cfg.repocfg});
  function repocfg_node(id) {
    let rcfg = cfg.repocfg.find( (it) => { return it.id == id; } );
    return rcfg ? rcfg : null;
  }
}

///////////////////
module.exports = {init: init, afaimgs: afaimgs, imgmani: imgmani, afarepo_ls: afarepo_ls, };

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
