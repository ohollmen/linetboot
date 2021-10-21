/** @file
* Google cloud provisioning ops.
* ## References
* - API Code: https://github.com/googleapis/nodejs-compute/
* - Examples: https://github.com/googleapis/nodejs-compute/tree/main/samples
* ## InstanceClient
* - /blob/main/src/v1/instances_client.ts (~l. 2000 ?)
* - Calls this.innerApiCalls.insert ?
*/
// const compute = require('@google-cloud/compute');
//var gcp = require('google-cloud'); // gcp.compute
// Hmmm (!?)
//const computeProtos = gcp.compute.protos.google.cloud.compute.v1;

var vmcfg = {
  project: "compute-29058235482", // Note: this is longer id, not just name of project
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
var vmmsgtmpl = {
  instanceResource: {
    name: null,
    disks: [
      {
	initializeParams: { diskSizeGb: null, sourceImage: null, },
	autoDelete: true,
	boot: true,
	//type: computeProtos.AttachedDisk.Type.PERSISTENT,
      },
    ],
    machineType: null, // `zones/${zone}/machineTypes/${machineType}`,
    networkInterfaces: [
      {
	// Use the network interface provided in the networkName argument.
	name: null,
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
  return 1;
}
if (process.argv[1].match(/gcpops.js$/)) {
  var msg = createmsg(vmcfg);
  console.log(msg);
  process.exit(1);
  /*
  const instancesClient = new gcp.compute.InstancesClient();
  const [response] = await instancesClient.insert(msg);
  let operation = response.latestResponse;
  waitop(operation, vmcfg);
  console.log('Instance created.');
  */
}


  
async function listInstancesOfProject(vmcfg) {
  const instancesClient = new compute.InstancesClient();
  var qpara = { project: project,maxResults: 100, };
  const aggListRequest = instancesClient.aggregatedListAsync(qpara);
  // See note from: samples/listAllInstances.js
  // Despite using the `maxResults` parameter, you don't need to handle the pagination
  // yourself. The returned object handles pagination automatically,
  // requesting next pages as you iterate over the results.
  var arr = [];
  var debug = 1;
  // await after for !!!??? Related to auto-iteration ?
  for  (const [zone, instancesObject] of aggListRequest) {
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
