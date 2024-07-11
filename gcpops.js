/** @file
* Google cloud provisioning ops.
* ## References
* - API Code: https://github.com/googleapis/nodejs-compute/
* - Examples: https://github.com/googleapis/nodejs-compute/tree/main/samples
* - https://www.npmjs.com/package/@google-cloud/compute
* - https://github.com/googleapis/gax-nodejs/blob/main/client-libraries.md#creating-the-client-instance
* - Instance template (named tmpl) https://cloud.google.com/compute/docs/instance-templates/create-instance-templates#api
*   - Has machineType with zone +

* ## InstanceClient
* - /blob/main/src/v1/instances_client.ts (~l. 2000 ?)
* - Calls this.innerApiCalls.insert ?
*/
var compute; // = require('@google-cloud/compute'); // For const:  Missing initializer in const declaration

// var compute = new Compute(); // Older version
// var axios = require("axios");
var async = require("async");
var cproc = require("child_process"); // https://nodejs.org/api/child_process.html
//var gcp = require('google-cloud'); // gcp.compute
// Hmmm (!?) gcp.
// const computeProtos = compute.protos.google.cloud.compute.v1;
// Some option items (not an exhaustive lists of options, mainly for VMs)
var optdata = {
  // https://cloud.google.com/compute/docs/regions-zones
  "zonesuff": ["a", "b", "c", "d", "e", "f"], // {"id": "-a", "name": "a"}
  "region":   ["us-east1", "us-east2", "us-east3", "us-east4",
    "us-central1","us-central2","us-central3", "us-central4",
    "us-west1","us-west2","us-west3", "us-west4"],
  // https://cloud.google.com/compute/docs/machine-resource
  // https://cloud.google.com/compute/docs/general-purpose-machines
  "predef_types": ["highcpu", "standard", "highmem", "megamem", "hypermem", "ultramem", ], // mid-part
  "insttype_sers": ["n2", "n4", "e2", "c2", "c3", "c4", "n4"],
  // TODO: Procedurally ?
  "insttype": [
    //"e2-", // Low end, shared-core, day-to-day (e.g. u-svcs)
    // mid-part: 
    // for "standard" the trailing number reflects number of VCPU:s (and 4GM ram per vcpu)
    "n2-standard-2", "n2-standard-4", "n2-standard-8", "n2-standard-16", "n2-standard-32",
    "n2-himem-2", "n2-himem-4", "n2-himem-8", "n2-himem-16"],
  //"": [],
  //"": [],
  //"": [],
};
function opts_init() {
  optdata.insttype = [];
  optdata.insttype_sers.forEach( (ser) => {
    optdata.predef_types.forEach( (pt) => {
      [1,4,8,16].forEach( (num) => {
        optdata.insttype.push(`${ser}-${pt}-${num}`);
      });
    });
  });
  optdata.zonesuff = optdata.zonesuff.map( (it) => { return {id: "-"+it, name: it}; });
  //var expandables = [ "region"]; // see above: "zonesuff",
  optdata.region   = optdata.region.map(to_obj);
  optdata.insttype = optdata.insttype.map(to_obj);
  function to_obj(v) { // use with map()
    return {id: v, name: v};
  }
}
var vmcfg = {
  project: "compute-29058235482", // Note: this is longer id, not just name of project
  // gcloud config set compute/region REGION or export CLOUDSDK_COMPUTE_REGION=REGION
  // gcloud config set compute/zone ZONE or export CLOUDSDK_COMPUTE_ZONE=ZONE
  // ... or --zone or --region on CL
  zone: "us-west4", // Geographical (...4 = LV) 'europe-central2-b'
  name: "build_65", // "instance" ?
  // 1) Top class: n1, n2, e2, n2d, t2d
  // 2) classifier: micro,small,medium,standard,highmem,highcpu
  // 3) Num CPU:s
  // Not all combos are possible, but whatever is configured for top class
  // Num CPU:s may be missing implying: 2, but sometime "..-2" given
  machtype: "n1-standard-1", // See e.g. calculator "e2-standard-2"
  // https://cloud.google.com/compute/docs/images/os-details
  scrcimg: "projects/debian-cloud/global/images/family/debian-10", // "projects/ubuntu-os-cloud/global/images/family/ubuntu-1804-lts", // 
  "dsizegb": 10, // Disk size, GB (default 10 GB)
  "netname": "global/networks/default"
};
// Describe the size and source image of the boot disk to attach to the instance.
// google.cloud.compute.v1.Instance
// NOTE: "name" at top would be the name of "Instance Template" (to create). Structure seems to be the same.
var vmmsgtmpl = {
  instanceResource: {
    name: null,
    disks: [
      {
        initializeParams: { diskSizeGb: null, sourceImage: null, },
        autoDelete: true,
        boot: true,
        //type: computeProtos.AttachedDisk.Type.PERSISTENT, // Seesm tmpl has (str) "PERSISTENT"
        // mode: "READ_WRITE" // from tmpl
      },
    ],
    machineType: null, // `zones/${zone}/machineTypes/${machineType}`,
    networkInterfaces: [
      {
        // Use the network interface provided in the networkName argument.
        name: null, // "global/networks/default".
      },
    ],
  },
  project: null,
  zone: null,
}
var gcp_cmds = {
  // Scope of 1 serv acct
  "sa_keys_list" : "gcloud iam service-accounts keys list --iam-account {{ sacct }} --format json",
  // Also --uri
  "mimg_list": "gcloud beta compute machine-images list --format json",
  // VM Instances
  "inst_list": "gcloud beta compute instances list --format json",
 
  // Index by name (no parent, name by displayName)
  "orgs_list":"gcloud organizations list --format json",
  // idx by name (has parent, e.g. "organizations/$ORGNUM"), name by displayName
  "folders_list":"gcloud resource-manager folders list --organization {{ orgnum }} --format json", // --organization
  // Index by projectNumber (type:number), has parent.id, parent.type (folder), name by name or projectId
  // (has also projectNumber), has labels (k-v)
  "proj_list": "gcloud projects list --format json",
  // Accts
  "sa_list": "gcloud iam service-accounts list --format json",
  // List machine images
  "mi_list": "gcloud compute machine-images list --project my-proj",
  "mi_del":  "gcloud compute machine-images delete --project my-proj",

};
var cfg;

function init(_cfg) {
  cfg = _cfg.gcp || _cfg;
  if (!cfg) { throw "No gcp config !"; }
  if (cfg.apikey && cfg.usemodule) {
    compute = require('@google-cloud/compute');
    if (!compute) { throw "Compute module not loaded !"; }
  }
  // Check cfg mems ?
  //Object.keys(vmcfg)
  vmcfg = cfg;
  console.log("GCP: Using module: "+ compute ? "yes" : "no");
  return module.exports;
}

function dclone(d) { return JSON.parse(JSON.stringify(d)); }

// Populate creation message with vmcfg.
function createmsg(vmcfg) {
  var vmmsg = dclone(vmmsgtmpl);
  ["name","project","zone"].forEach((k) => { vmmsg[k] = vmcfg[k]; });
  //[].
  vmmsg.instanceResource.machineType = `zones/${vmcfg.zone}/machineTypes/${vmcfg.machtype}`;
  var d0 = vmmsg.instanceResource.disks[0];
  d0.initializeParams.diskSizeGb  = vmcfg.dsizegb;
  d0.initializeParams.sourceImage = vmcfg.srcimg;
  var n0 = vmmsg.instanceResource.networkInterfaces[0];
  n0.name = vmcfg.netname;
  return vmmsg;
}
/** Create client (mainly auth) config. */
function clientconfig() {
  // Store apikey to file to access via keyFilename ?
  return {projectId: cfg.project, fallback: true, };
}

/** Create universal instance indentity filter to use in ops.
* Consists of project, zone and instance (Instanve name).
* Usable for many instancesClient ops like: , start, stop,
* reset, delete (literal method names given).
* Note / TODO: list would not have instance, allow proj/zone msg ?
*/
function filtermsg(vmcfg) {
  // name / instance
  var msg = {};
  //["project","zone"].forEach((k) => { msg[k] = vmcfg[k]; }); // "name",
  msg.instance = vmcfg.name;
}

async function waitop(operation, vmcfg) {
  const operationsClient = new compute.ZoneOperationsClient();

  // Wait for the create operation to complete.
  while (operation.status !== 'DONE') {
      [operation] = await operationsClient.wait({
        operation: operation.name, // Something like "create" ?
        project: vmcfg.project,
        zone: operation.zone.split('/').pop(), // vmcfg.zone ?
      });
  }
  // Evaluate success ... (???)
  console.log(operation);
  return 1;
}
if (process.argv[1].match(/XXXXXXgcpops.js$/)) {
  var mcfname = process.env["HOME"]+"/.linetboot/global.conf.json";
  var mcfg = require(mcfname);
  init(mcfg.gcp);
  var msg = createmsg(cfg);
  console.log(msg);
  listInstancesOfProject(cfg);
  // process.exit(1);
  // gcp.
  /*
  // kfn: .json, .pem or .p12
  var iccfg = {projectId: cfg.project, keyFilename: "", fallback: true};
  const instancesClient = new compute.InstancesClient();
  // const [response] = await instancesClient.insert(msg);
  instancesClient.insert(msg).then((response, foo) => {
    let operation = response.latestResponse;
    waitop(operation, cfg);
    console.log('Waited ... Instance created.');
  });
 */
  //process.exit(0);
}


  
async function listInstancesOfProject(vmcfg) {
  // console.log(compute);
  const instancesClient = new compute.InstancesClient(); // new
  
  var qpara = { project: cfg.project, zone: cfg.zone, maxResults: 100, };
  console.log("Query by: ", qpara);
  const aggListRequest = instancesClient.aggregatedListAsync(qpara);
// Also list()
  // See note from: samples/listAllInstances.js
  // Despite using the `maxResults` parameter, you don't need to handle the pagination
  // yourself. The returned object handles pagination automatically,
  // requesting next pages as you iterate over the results.
  var arr = [];
  var debug = 1;
  // await after for !!!??? Related to auto-iteration ?
  // Keep await out for now to allow Ubuntu 18.04 node (v8.10.0) run linetboot
  for /*await*/ (const [zone, instancesObject] of aggListRequest) {
    const instances = instancesObject.instances;

    if (instances && instances.length > 0) {
      debug && console.log(` ${zone}`);
      for (const instance of instances) {
        debug && console.log(` - ${instance.name} (${instance.machineType})`);
        app.push(instance);
      }
    }
  }
  return arr;
}

module.exports = {
  init: init,
  waitop: waitop,
  listInstancesOfProject: listInstancesOfProject,
  subdivide: subdivide,
  subarr_proc: subarr_proc,
  opts_init: opts_init,
};
  // Sub-divide / Pre-process to batches
function subdivide(arr, sasize, opts) {
  opts = opts || {debug: 0}
  var bs = []; //var i = 0;
  var sa; // Sub-array
  sasize = sasize || 3;
  // Using arr.length would leave out last (uneven / remainder) batch
  for (var i=0;(sa = arr.splice(0, sasize)) && sa.length ;i++) { opts.debug && console.log(sa); bs[i] = sa; }
  return bs;
}

function subarr_proc(arr, sasize, proccb, opts, finalcb) {
  opts = opts || {debug: 0}
  // Batch processing (still abstract). TODO: Pass the item processor here (ctx var ?).
  function proc_batch(sarr, cb) {
    //console.log("Got:", sarr);
    // Mock-up: proc_item
    async.map(sarr, proc_item, (err, results) => {
      if (err) { console.log("Error processing a parallel batch !"); return cb(err, null); }
      opts.debug && console.log(`Done inner map batch of ${sarr.length} items.`);
      opts.debug && console.log("Got res: ", results);
      // Note: eachSeries will still use first as error. We now use mapSeries
      cb(null, results);
    });
  }
  var bs = gcpops.subdivide(arr, sasize);
  opts.debug && console.log( JSON.stringify(bs) ); // process.exit(0);
  // eachOfSeries will get index, eachSeries will not (neither will get compl. cb results), mapSeries completion cb gets called w. err,results
  async.mapSeries(bs, proc_batch, (err, results) => {
    if (err) { console.error("Outer (series) processing - Got error: "+err); return ; }
    opts.debug && console.log("Done all batches ", results);
    if (finalcb) { finalcb(err, results); }
    else { console.error("Warning: finalcb not passed (should pass for full async control)"); }
  });
  // Always aim to pass finalcb and capture results. There's no meaningful return value here.
}

function run_multiproc() {
  var gcpops = module.exports;
  // Test for now https://caolan.github.io/async/v3/docs.html
  var arr = ["bu1","bu2","bu3","bu4","bu5","bu6","bu7","bu8","bu9","bu10","bu11","bu12","bu13","bu14","bu15","bu16",];
  // Map item cb (e.g. gcloud compute machine-images delete client-template)
  function proc_item(item, cb) {
    console.log("Process: "+item);
    var cmd = "echo "+ item + "; sleep 2";
    // opts (obj) as optional 2nd (e.g. pwd: ...)
    cproc.exec(cmd, (err, stdout, stderr) => {
      if (err) { console.log("Error running "+cmd+" "+ err); return cb(err, null); }
      cb(null, stdout);
    });
    
  }
  var sasize = 3;
  var opts = {debug: 1};
  function finalcb() { console.log("Done (main)"); }
  gcpops.subarr_proc(arr, sasize, proc_item, opts, finalcb); // finalcb (test w. null)
  //NOT:process.exit(0);
}

if (process.argv[1].match("gcpops.js")) {
  opts_init()
  console.log(JSON.stringify(optdata, null, 2));
  //NOT:process.exit(0);
}
