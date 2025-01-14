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
*   - OLD: member "ofn" in JSON coming from frontend, append this to cfg.yaml_root
*   - uel2fs_cb callback function (called with (url, cfg)) and returning fs path to save to (See path notes below)
*   - url2fs (string-to-string object) mapping from cfg.url2fs[url] with value indicating fs path to save to (See path notes below). Note: URLs must be exact 
*   - Use URL path appending it to cfg.yaml_root
*   - TODO: explicit query-string parameter in URL (req.query) or URL path param (req.params), append to cfg.yaml_root
* 
* Client can (to some degree) mix/alternate these strategies by e.g. providing explicit ofn in some cases and leave it out in others.
* 
* Note that the uel2fs_cb callback strategy function will be executed in caller / cb definition context, which makes it easy to have access
* to variables affecting path mapping decision.
* ### Notes on paths returned/looked up by uel2fs_cb and url2fs.
* The paths returned / looked up (for YAML writing) can be:
* - absolute / starting with '/' in which case path is used as absolute as-is path
* - relative, NOT starting w. '/' in which case they are appended to cfg.yaml_root to get the final filename.
* ## TODO
* - Allow sending custom-wrapped response (driven by config)
*/
var fs = require("fs");
var path = require("path");
var yaml = require('js-yaml');
let cfg = {
  //// Read config ////
  yaml_path: [], // Must set
  //// Write config ////
  yaml_root: "", // Must set
  url2fs: {}, // Name Mapping from URL-to-FS
  url2fs_cb: null, // CB called with URL, jdata and ymcfg. Return rel path under yaml_root to use as save-to-fn.
  eemod: "", // Use event emitter module ? If yes, make sure this is installed and returns a handle to EventEmitter.
  // See: wolfy87-eventemitter, eventemitter2, eventemitter3, event-emitter, ...
  ee: null,
};
module.exports.cfg = cfg; // Keep in sync in cfg

// TODO: We could detect if module default is set to "meaningless"
// default and override one by one. 
function init(cfg_p) {
  if (cfg_p) { module.exports.cfg = cfg = cfg_p; } // Keep in sync !
  // Use Event emitter ? Node.js native: const EventEmitter = require('node:events');
  if (cfg.eemod) { let EventEmitter = require(cfg.eemod); cfg.ee = EventEmitter(); }
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
  //if (!p) { console.error(`Warning: path for ${fn} not resolved (this will lead to problems if caller is not checking returned value)!`); }
  return p ? `${p}/${fn}` : null;
}
// Helper to extract YAML ctx info:
// - basename of gotten/set file
// - fn embedded "kind" (first dot-delimited part of file basename)

// 
function yaml_ctx(fn) {
  let ctx = {};
  ctx.bn = path.basename(fn);
  if (!ctx.bn) { return null; }
  let m = ctx.bn.match(/^(\w+)\./); // .(.+)$
  if (!m) { return null; }
  ctx.kind = m[1];
  return ctx;
}
// Fetch YAML file as JSON (GET)
function getfsyaml(req, res) {
  var jr = {status: "err", msg: "Could convert/send YAML as JSON. "}
  var fname = findinpath(req.url, cfg.yaml_path); // module: yaml_path
  if (!fname) { jr.msg += `Failed find YAML file from configured paths (${cfg.yaml_path.length}) !`; console.log(`${jr.msg}`); return res.json(jr); }
  let cont = fs.readFileSync(fname, 'utf8');
  let j = yaml.load(cont); // safeLoad() deprecated !!
  if (!j) { jr.msg += "Failed to parse YAML !"; console.log(`${jr.msg}`); return res.json(jr); }
  cfg.debug && console.log(`Loaded YAML from ${fname}: `+JSON.stringify(j));
  // Preproc CB per URL or common (single/shared) cb ? Similar to set...()
  if (cfg.precb_r && typeof cfg.precb_r == 'function') { cfg.precb_r(j, fname); }
  //res.json({status: "ok"});
  //res.json(cont); // YAML
  res.json(j);
  console.log("## YAML to send as JSON:\n"+cont+"\n#"+fname);
  // if (cfg.postcb_r && typeof cfg.postcb_r == 'function') { cfg.postcb_r(j); } // would be fairly meaningless
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
  // Preproc CB per URL or common (single/shared) cb ? Modify data (in j) in-place. For now keep the cb interface simple (no errors, no rejections)
  if (cfg.precb_w && typeof cfg.precb_w == 'function') { cfg.precb_w(j); }
  var ycfg = { 'styles': { '!!null': 'canonical' }, }; // lineWidth: 200
  var yc = yaml.dump(j, ycfg); // Deprecated: yaml.safeDump()
  let wpath = cfg.yaml_root; // TODO: ???? Esp. intermediate paths !!!
  // How to get intermediate path - allow few (flexible) options ? Allow even ofn to be configurable ?
  let fn; // TODO: Extract path.dirname(ofn), append with URL ?
  let fnmethod = "";
  // Do NOT take from ofn !!!
  //if (j.ofn) { fn = `${wpath}/${j.ofn}`; } // Append intermediate path to wpath (req.params ???)
  //else
  if (cfg.url2fs_cb && (typeof cfg.url2fs_cb == "function") ) { // && cfg.url2fs_cb(url) ???
    fn = cfg.url2fs_cb(url, j, cfg);
    //if (!fn.match(/^\//)) { fn = `${wpath}/${fn}`; } // relative fn, prefix cfg.yaml_root
    // Initial simple & "secure" implementation: Always force save under ${wpath} (whether prefixed with '/' or not)
    fn = `${wpath}/${fn}`;
    fnmethod = 'cb';
  } // TODO: launch once only
  else if (cfg.url2fs && cfg.url2fs[url]) {
    fn = cfg.url2fs[url];
    // Test relative / absolute
    if (!fn.match(/$\//)) { fn = `${wpath}/${fn}`; } // relative fn, prefix cfg.yaml_root
    fnmethod = 'name-mapping';
  }
  else { fn = `${wpath}/${req.url}`; fnmethod = 'name-from-url';}
  // TODO: Create intermediate directories !!!
  let dn = path.dirname(fn);
  if ( ! fs.existsSync(`${dn}`) ) { fs.mkdirSync(`${dn}`, { recursive: true }); console.log(`Created (missing) dir path '${dn}' for '${fn}'`); }
  try { fs.writeFileSync(fn ,yc, {encoding: "utf8"} ); console.log(`Wrote '${req.url}' (URL) to filesys: '${fn}' (Method: ${fnmethod})`); }
  catch (ex) { jr.msg += `Failed to write YAML to ${fn}: ${ex}`; console.error(jr.msg); return res.json(jr); };
  console.log("## YAML-to-save:\n"+yc+"\n# "+fn);
  let r = { status: "ok", data: j, };
  // if (cfg.rdatafmt == 'yaml') { r.data = yc; }
  
  // Elswhere to receive ee.on("yaml-set", (jdata) => { ... })
  if (cfg.ee) { ee.emit("yaml-set", j); } // j = data from client. Only when cfg.eemod loaded, cfg.ee instantiated !!
  if (cfg.postcb_w && typeof cfg.postcb_w == 'function') {
    let ro = cfg.postcb_w(j, fn, r);
    if (!ro || (typeof ro != 'object') ) { return res.json(r); } // none or non-object
    else { Object.keys(ro).forEach( (k) => { r[k] = ro[k]; }); return res.json(r); } // Merge
  } // Added r
  else { return res.json(r); }
}

module.exports = {
  init: init,
  findinpath: findinpath,
  yaml_ctx: yaml_ctx,
  // Web handlers to 
  getfsyaml: getfsyaml,
  setfsyaml: setfsyaml,
  // unusable defaults for documentational purposes (data types of each)
  cfg: {yaml_root: "", url2fs: {}, uel2fs_cb: null, yaml_path: []},
};
