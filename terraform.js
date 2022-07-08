#!/usr/local/bin/node
/** @file
Load and preset Terraform State model

Notes on fields

// Odd ones: null_resource, local_file, random_*
    // - type may appera even in objects under instances
    // - google_compute_firewall Seems these have subkey: instances (32.9k sample lines)
    // - google_project_iam_member (Also has instances). Look for "attributes.member"
    //   - serviceAccount, group, user
    //   - ~ 4k (end at 37.1)
    // - google_folder_iam_member
    // - google_client_config - 1x / remove
    // - google_compute_network
    //  - Some of tyhese have lot of null vals, no 
    //   subnetworks_self_links and no index_key
    // - google_compute_subnetwork
    // - google_compute_zones
    // - google_project
    //   - Seem to be laid out so each has instances and 1x within it
    // - template_file
    // - google_compute_instance (40.9k)
    // - google_compute_security_policy
    // - ...
    // - google_project_iam_custom_role Long lists in attributes.permissions
    // - google_service_account use attributes.email as title (id == name)
    // - google_storage_bucket_iam_member
    // - local_file
    // - null_resource (name: module_depends_on or run_command or run_destroy_command)
    // - random_integer
    // - google_container_engine_versions
    // - google_container_cluster
    // - google_compute_address IP Addresses for VM:s (hostname not directly mentioned, but appears in name with "-ip" suff)
    // - google_compute_instance_from_template ...
    //    - Majority of VM:s
    //    - may be packer
    //    - Note: hn empty (from DHCP), but name is present (is hn)
    //    - See: source_image
    // - google_compute_instance_template
    //  - labels: null
    // - google_dns_record_set
    // - google_compute_resource_policy (snapshots)
    // - google_organization
    // - google_compute_subnetwork_iam_member
    // - google_storage_bucket
    // - google_project_service
    // - google_compute_forwarding_rule
    // - google_compute_region_backend_service loadbalancing)
    // - google_essential_contacts_contact
    // - ... ?
    // - google_service_account_key
* # Notes on hierarchy
* File level top (Always Object)
* - version (format), terraform_version (sw), serial: serial: number of file e.g. 2...54 (?)
* - lineage: GUID value
* - outputs: {...}
*   - Nested, multi-level k-v tree, keys (and structure) go by resource type (e.g.):
*     - google_compute_network: host_project_id, network_name, .., service_project, service_project_num, subnetworks
*     - google_compute_zones: instance_ids, private_ips, public_ips
*   - All keys have object value with "value" and "type" (e.g. string "list" or "string" or ["list","string"])
* - terraform_service_account: w. value, type (string)
* - terraform_state_bucket: ...
* - resources: [...]
*
* Siblings of instances (see op "stats" output) :
* - module: e.g. "module.keyring[0]"
* - "mode" (sibling of "instances") can be "managed" or "data"
* - type: THE type (by which all ents are classified)
* - "name" (-II-) may be same for all items of same rsc type (e.g. "keyring" for type google_kms_key_ring)
* - provider (e.g.): 
* - outputs - Object of key-val pairs ... NOTE: Is this even on more upper level ?
* Single instance object:
* - index_key: 0 (typical)
* - schema_version: 1
* - attributes: ... misc attrs of particular type
*   - attributes.labels : key-value pairs
* - private: long hash
* - dependencies: Array of Module names, etc.
* - "sensitive_attributes": []
*/
var fs = require("fs");

var tflistfn = "tf.list.txt";
var ignorekeys = ["google_client_config"];

var tfpath = "";
var fnarr = [];
var tf = {};
/** Initialize module
 */
function init(_cfg) {
  _cfg = _cfg || {};
  //var
  tfpath = process.env.LINETBOOT_TF_MODELPATH || _cfg.modelpath;
  // console.error(process.argv);
  
  // console.error("OP: '"+op+"'");
  //var
  fnarr = fnames_load(tfpath);
  if (!fnarr) { console.log("No Terraform files from "+tfpath); return; }
  console.error(fnarr.length + " Files to parse (from "+ tfpath+")");
  //var
  tf = tfmodel_create(fnarr);
  if (!tf) { console.log("No Terraform model created"); tf = {}; return; }
  var keys = null; // Triggers all
  insts_all_merge(tf, keys);
}

// require()  not used because of missing.json suffix :-(
function json_load(fn) {
  var jcont = fs.readFileSync(fn, 'utf8');
  if (!jcont) { return null; }
  var j = JSON.parse(jcont);
  if (!j) { return null; }
  // Inject origin (Also into resources ?)
  j._fname = fn;
  if (j.resources) {
    // Add _fname
    // j.resources.forEach((fn) => { r._fname = fn; })
  }
  // Assume non-array
  if (Array.isArray(j)) { return null; }
  return j;
}
/** */
function rsc_add(rscidx, rsc) {
  if (!rscidx[rsc.type]) { rscidx[rsc.type] = []; }
  rscidx[rsc.type].push(rsc);
}
/** Load filename index file
* @return Filenames in an array
*/
function fnames_load(tfpath) {

  if (!tfpath) { console.log("No LINETBOOT_TF_MODELPATH available !"); return null; }
  var fn = tfpath+"/"+tflistfn;
  if (!fs.existsSync(fn)) { console.log("No TF state list file ("+ fn + ")"); return null; }
  //var files = fs.readdirSync(tfpath);
  //console.log(files);
  var fnarr = fs.readFileSync(fn, 'utf8').split(/\n/).filter((it) => { return it; });
  // console.log(fnarr); // Files list
  return fnarr;
}
/** Merge instances of one type from multiple "instances" to single array.
 * Option1: arr[1] onwards to node in arr[0].
 * Option2: Create new array altogether
 * TODO: What to do with "outputs" from different nodes
 * @param arr {array} - Array of resource nodes (of same type) that have instances attribute
 */
function insts_merge(arr, name) {
  console.log("Staring with: "+name);
  var newarr = [];
  var verbose = 1;
  arr.forEach((inode) => {
    var ocnt = 0;
    if (inode.outputs) { ocnt = Object.keys(inode.outputs).length; }
    // Verbose
    if (verbose) {
    console.log("- Num instances: "+inode.instances.length);
    console.log("- Outputs: "+ocnt);
    console.log(inode);
    }
    // Merge to common array
    newarr = newarr.concat(inode.instances);
  });
  return newarr;
}

function insts_all_merge(tf, keys) {
  if (!tf) { console.log("No tf model to merge all isntances"); return null; }
  if (!Array.isArray(keys)) { keys = Object.keys(tf.rscidx); }
  var instidx = {};
  var debug = 0;
  keys.forEach((k) => {
    var iarr = tf.rscidx[k];
    //OLD:iarr.forEach(() => {});
    // wrap info (merged) {..., instances: iarr} to retain important upper keys
    var iarr = insts_merge(iarr, k);
    debug && console.log("Merged("+iarr.length+", "+k+"):", iarr);
    // Revamp existing or create new instidx (latter)
    instidx[k] = iarr;
  });
  tf.instidx = instidx;
  return instidx;
} // inst ...

function tfmodel_create(fnarr) {
  var rscidx = {};
  var farr = [];
  var debug = 0;
  if (!tfpath) { console.log("No tfpath passed\n");  return null; }
  if (!fs.existsSync(tfpath)) { console.log("tfpath does not exist\n");  return null; }
  debug && console.log("Load model from path: "+tfpath+"");
  // Per-File array-of-objects
  fnarr.forEach( (fnrel) => {
    var fn = tfpath + "/"+ fnrel;
    debug && console.log("Loading JSON: "+fn);
    var sm = json_load(fn); // Sub-model
    //console.log(JSON.stringify(sm, null, 2));
    // Grab resources from sub-model
    if (!sm) { console.log("Resources file ("+fn+") JSON not loaded (null ?)!"); return; }
    if (!Array.isArray(sm.resources)) { console.log("Resources not in an array ("+fnrel+") !"); return; }
    farr.push(sm);
  });
  farr.forEach((sm) => {
    var rss = sm.resources;
    
    rss.forEach((rsc) => {
      //console.log("Type: "+rsc.type);
      rsc_add(rscidx, rsc);
      //var hasinst = rsc.instancesX ? 1 : 0;
      //if (hasinst) { console.log("Does have instances"); }
    });
  });
  return { rscidx: rscidx, farr: farr};
};

/// CLI. Perform same (datamodel) init as webapp
if (process.argv[1].match("terraform.js")) {
  var ops = {idx: idx, farr: farr, types: types, stats: stats};
  
  var op = process.argv.splice(2, 1)[0];
  // console.log(op);
  if (!op) { console.log("No op given. Use one of: "+Object.keys(ops).join(', ')); process.exit(1); }
  if (!ops[op]) { console.log("No op '"+op+" available"); process.exit(1); }
  
  function farr()  { console.log( JSON.stringify(tf.farr, null, 2) ); }
  function idx()   { console.log( JSON.stringify(tf.rscidx, null, 2) ); }
  function types() { console.log( JSON.stringify(Object.keys(tf.rscidx), null, 2) ); }
  function stats() {
    var keys = Object.keys(tf.rscidx); // All
    if (0) { keys = []; } // Or pre-defined ?
    //var iidx = insts_all_merge(tf, keys);
    console.log("ALL-Inst-Merged: ", tf.instidx); // iidx
  }
  init();
  console.log("Creating model from: "+tfpath);
  ops[op](); // Dispatch
  //console.log("EXIT");
}

function introspect(arr) {
  var mm = {}; // Top: attrs
  arr.forEach((e) => {
    var ks = Object.keys(e);
    ks.forEach((k) => {
      // Note also: o.hasOwnProperty('myProperty'), typeof myVariable === 'undefined'
      if (!mm[k]) { mm[k] = {types: { "null": 0, "undefined": 0}, lens: {} }; } // Val types
      var t = typeof e[k];
      // Special values
      if (e[k] === null)        { mm[k].types.null++; return; }
      if (e[k] === undefined)   { mm[k].types.undefined++; return; }
      if (Array.isArray(e[k]) ) { mm[k].types.array = mm[k].types.array || 0; mm[k].types.array++; return; } // ++ on non-existing sets null
      if (isobj(e[k])) { mm[k].types.object = mm[k].types.object || 0; mm[k].types.object++; return; } // TODO: ...
      if (!mm[k].types[t]) { mm[k].types[t] = 0; } // Init to 0
      if (t == 'string') { mm[k].lens[t] = mm[k].lens[t] || 0; mm[k].lens[t] = Math.max(mm[k].lens[t], e[k].length); }
      // Same with number
      if (t == 'number') { mm[k].lens[t] = mm[k].lens[t] || 0; mm[k].lens[t] = Math.max(mm[k].lens[t], e[k]); }
      mm[k].types[t] += 1;
    });
  });
  function isobj(o) {
    return typeof o === 'object' && !Array.isArray(o) && o !== null;
  }
  Object.keys(mm).forEach((ak) => {
    if (mm[ak].types.null === 0)      { delete(mm[ak].types.null); }
    if (mm[ak].types.undefined === 0) { delete(mm[ak].types.undefined); }
    
  });
  // New iter - try deriving definite (unambiguous) type
  Object.keys(mm).forEach((ak) => {
    var ks = Object.keys(mm[ak].types);
    if (ks.length == 1) {mm[ak].type = ks[0]; } // Else "typecandidates" = ks;
  });
  return mm;
}
/** View all instances of particular Terraform resource type.
 * URL Parameters: "type" for the Terrform resource type (Default: "google_project")
 */
function rsctype_show(req, res) {
  var jr = { status: "err", msg: "Failed to show resource type. " };
  if (!tf) { jr.msg += "No Terrform model"; return res.json(jr); }
  var type = "google_project"; // Default ???
  if (req.query.type) { type = eq.query.type; }
  if (!tf.rscidx || !tf.instidx) { jr.msg += "resource or instance index missing in (global) tf model: "+JSON.stringify(tf); return res.json(jr); }
  if (req.url == '/tftypeinst') {
    var d = tf.instidx[type]; // rscidx
    if (!d) { jr.msg += "TF Type by key="+type+ " not present in TF model"; return res.json(jr); }
    if (!Array.isArray(d)) { jr.msg += "TF Type instances not in array"; return res.json(jr); }
    var mm = introspect(d);
    res.json({status: "ok", tftype: type, mm: mm, data: d}); // mm: mm,
  }
  else if (req.url == '/tftypelist') {
    var rsc2cnt = {};
    Object.keys(tf.rscidx).forEach((tk) => { var arr = tf.instidx[tk]; rsc2cnt[tk] = arr.length; });
    //res.json({status: "ok", data: Object.keys(tf.rscidx) });
    res.json({status: "ok", data: rsc2cnt });
  }
  else if (req.url == '/tfm') {
    
  }
  else {res.json(jr);}
}

function rsctypes_list(req, res) {
  
}
module.exports = {
  init: init,
  rsctype_show: rsctype_show
};
