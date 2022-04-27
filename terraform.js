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
* # Other
* Siblings of instances:
* - "mode" (sibling of "instances") can be "managed" or "data"
* - "name" (-II-) may be same for all items of same rsc type
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
  tfpath = process.env.LINETBOOT_TF_MODELPATH || _cfg.;
  // console.error(process.argv);
  
  // console.error("OP: '"+op+"'");
  //var
  fnarr = fnames_load(tfpath);
  if (!fnarr) { console.log("No terraform files from "+tfpath); return; }
  console.error(fnarr.length + " Files to parse");
  //var
  tf = tfmodel_create(fnarr);
  if (!tf) { console.log("No Teraform mode\n"); tf = {}; return; }
}

// Because of missing.json suffix :-(
function json_load(fn) {
  var jcont = fs.readFileSync(fn, 'utf8');
  if (!jcont) { return null; }
  var j = JSON.parse(jcont);;
  // Inject origin (Also into resources ?)
  j._fname = fn;
  if (j.resources) {
    // Add _fname
    // j.resources.forEach((fn) => { r._fname = fn; })
  }
  return j;
}
/** */
function rsc_add(rscidx, rsc) {
  if (!rscidx[rsc.type]) { rscidx[rsc.type] = []; }
  rscidx[rsc.type].push(rsc);
}
/** Load filename index file
@return Filenames in an array
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
/** Merge instances from arr[1] onwards to node in arr[0].
 * TODO: What to do with "outputs" from different nodes
 */
function insts_merge(arr, name) {
  console.log("Staring with: "+name);
  arr.forEach((inode) => {
    var ocnt = 0;
    if (inode.outputs) { ocnt = Object.keys(inode.outputs).length; }
    console.log("- Num instances: "+inode.instances.length);
    console.log("- Outputs: "+ocnt);
    console.log(inode);
  });
}

function tfmodel_create(fnarr) {
  var rscidx = {};
  var farr = [];
  fnarr.forEach( (fnrel) => {
    var fn = tfpath + "/"+ fnrel;
    //console.log(fn);
    var sm = json_load(fn); // Sub-model
    //console.log(JSON.stringify(sm, null, 2));
    // Grab resources from sub-model
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

if (process.argv[1].match("terraform.js")) {
  var ops = {idx:1, farr: 1, types: 1};
  
  // process.exit(1);
  init();
  var op = process.argv.splice(2, 1)[0];
  // console.log(op);
  if (!op) { console.log("No op given. Use one of: "+Object.keys(ops).join(', ')); process.exit(1); }
  if (op == 'farr')   { console.log( JSON.stringify(tf.farr, null, 2) ); }
  if (op == 'idx')   { console.log( JSON.stringify(tf.rscidx, null, 2) ); }
  if (op == 'types') { console.log( JSON.stringify(Object.keys(tf.rscidx), null, 2) ); }
  if (op == 'stats') {
    var keys = Object.keys(tf.rscidx); // All
    if (0) { keys = []; }
    var iarr;
    keys.forEach((k) => {

      iarr = tf.rscidx[k];
      //iarr.forEach(() => {});
      insts_merge(iarr, k);

    });
  }
  //console.log("EXIT");
}
function rsctype_show(req, res) {
  var jr = {status: "err", msg: "Failed to show resource type"};
  var type = "google_project"; // ???
  if (req.query.type) { type = eq.query.type; }

  var d = tf.rscindex[type];
  if (!d) { jr.msg += "Type "+type+ " not presnt in data"; res.json(jr); }
  res.json({status: "ok", data: d});
}
module.exports = {
  init: init,
  rsctype_show: rsctype_show
};
