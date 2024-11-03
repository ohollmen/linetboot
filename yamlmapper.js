/** @file
* Map YAML files by sending them to and receiving them from x from web frontend as JSON and reading and writing them from FS YAML files (respectively).
* ```
* | Web Frontend | --> JSON --> | Server | -> YAML --> | FS |
* | Web Frontend | {-- JSON <-- | Server | <- YAML --> | FS |
* ```
* ## Filesystem path strategies (Read/Write)
* 
* Strategies to manage the path mappings of URL vs. filesystem YAML files:
* - Read (fs to client)
*   - Find yaml file by URL/basename from the set of paths (cfg.yaml_path)
* - Write (in order of preference / trying)
*   - member "ofn" in JSON coming from frontend, append this to cfg.yaml_root
*   - uel2fs_cb callback function (called with (url, cfg)) and returning fs path to save to
*   - url2fs (string-to-string object) mapping from cfg.url2fs[url] with value indicating fs path to save to. Note: URLs must be exact
*   - Use URL path appending it to cfg.yaml_root
*   - TODO: explicit query-string parameter in URL (req.query) or URL path param (req.params), append to cfg.yaml_root
* 
* Client can (to some degree) mix/alternate these strategies by e.g. providing explicit ofn in some cases and leave it out in others.
* 
* Note that the uel2fs_cb callback strategy function will be executed
* in caller / cb definition context, which makes it easy to have access
* to variables affecting path mapping decision.
* 
* ## TODO
* 
*/
var fs = require("fs");
var path = require("path");

let cfg = {
  //// Read config ////
  yaml_path: [], // Must set
  //// Write config ////
  yaml_root: ""; // Must set
  url2fs: {}, // Name Mapping from URL-to-FS
  uel2fs_cb: null, // CB called with URL
  
};
module.exports.cfg = cfg; // Keep in sync in cfg

// TODO: We could detect if module default is set to "meaningless"
// default and override one by one. 
function init(cfg_p) {
  if (cfg_p) { module.exports.cfg = cfg = cfg_p; } // Keep in sync !
  // Validate that:
  // - paths in yaml_path are actually dirs ? 
  // yaml_root
}

// Helper to find a file in set of paths.
// Not tightly coupled with module internals (config, etc) and as such
// reusable as 
function findinpath(fn, paths) {
  var p = paths.find( (p) => { return fs.existsSync(`${p}/${fn}`); } );
  console.log(`Got path: '${p}'  for file '${fn}'`);
  return p ? `${p}/${fn}` : null;
}

// Fetch YAML file as JSON (GET)
function getfsyaml(req, res) {
  var jr = {status: "err", msg: "Could convert/send YAML as JSON. "}
  var fname = findinpath(req.url, cfg.yaml_path); // module: yaml_path
  if (!fname) { jr.msg += `Failed find YAML file from configured paths (${cfg.modelpath.length}) !`; console.log(`${jr.msg}`); return res.json(jr); }
  let cont = fs.readFileSync(fname, 'utf8');
  let j = yaml.load(cont); // safeLoad() deprecated !!
  if (!j) { jr.msg += "Failed to parse YAML !"; console.log(`${jr.msg}`); return res.json(jr); }
  // CB per URL ?
  //res.json({status: "ok"});
  //res.json(cont); // YAML
  res.json(j);
  console.log("## YAML to send as JSON:\n"+cont+"\n#"+fname);
}

// Set incoming JSON as yaml (POST)
// The "write-to" path will be selected as documented in "Strategies".
// Currently:
// - All files are written under common root
// - if ofn present write to that relative path under root
// - if NO ofn, write to path of URL
function setfsyaml(req, res) {
  var jr = {status: "err", msg: "Could not save JSON to YAML file. "}
  var j = req.body;
  if (!j) { jr.msg += "No JSON body received"; res.json(jr); }
  // CB per URL ?
  var ycfg = { 'styles': { '!!null': 'canonical' }, }; // lineWidth: 200
  var yc = yaml.dump(j, ycfg); // Deprecated: yaml.safeDump()
  let wpath = cfg.yaml_root; // TODO: ???? Esp. intermediate paths !!!
  // How to get intermediate path - allow few (flexible) options ? Allow even ofn to be configurable ?
  let fn; // TODO: Extract path.dirname(ofn), append with URL ?
  if (j.ofn) { fn = `${wpath}/${j.ofn}`; } // Append intermediate path to wpath (req.params ???)
  else if (uel2fs_cb && (typeof uel2fs_cb == "function") && uel2fs_cb(url)) { fn = uel2fs_cb(url, cfg); } // TODO: launch once only
  else if (url2fs && url2fs[url]) { fn = url2fs[url]; }
  else { fn = `${wpath}/${req.url}`; }
  // TODO: Create intermediate directories !!!
  let dn = path.dirname(fn);
  if ( ! fs.existsSync(`${dn}`) ) { }
  try { fs.writeFileSync(fn ,yc, {encoding: "utf8"} ); console.log(`Wrote '${req.url}' (URL) to filesys: '${fn}'`); }
  catch (ex) { console.error(`Failed to write YAML to ${fn}: ${ex}`); };
  console.log("## YAML-to-save:\n"+yc+"\n# "+fn);
}

module.exports = {
  init: init,
  findinpath: findinpath,
  // Web handlers to 
  getfsyaml: getfsyaml,
  setfsyaml: setfsyaml,
  // unusable defaults for documentational purposes (data types of each)
  cfg: {yaml_root: "", url2fs: {}, uel2fs_cb: null, yaml_path: []},
};
