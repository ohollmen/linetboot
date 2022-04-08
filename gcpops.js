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

//var gcp = require('google-cloud'); // gcp.compute
// Hmmm (!?) gcp.
// const computeProtos = compute.protos.google.cloud.compute.v1;

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
if (process.argv[1].match(/gcpops.js$/)) {
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
  for await (const [zone, instancesObject] of aggListRequest) {
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
};
