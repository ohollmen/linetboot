var Mustache = require("mustache");
// NOTE: Loading osinstall.js here on top shows it's
// module.exports (== osinst) as empty (object) !!!
// See console.log() below. Must load during init() ... osinst shows ok.
var osinst; // = require("./osinstall.js");
var hostcache;
//console.log("osdisk-OSINTALL", osinst);
// Created for the sole purpose of late-loading osinstall
function init(mcfg, hdls) {
  osinst = require("./osinstall.js");
  //console.log("osdisk-OSINTALL", osinst);
  if (!hdls) { return console.log("Host data structures not passed"); }
  hostcache = hdls.hostcache;
  return module.exports;
}
//////////////////////////// Disk //////////////////////////
/** Show disk info parameters or full disk section output.
 * This is effectively "disk-recipe".
 * Very similar to (full) recipe, but for disk only.
 * Test (e.g): /diskinfo?ip=192.168.1.3
  "rootsize": 449844,
  "swapsize": 14430,
  "bootsize": 500,
  * Ansible Disk info:
  * - ansible_devices - Partitions (No filesystem info, but has part label)
  * - ansible_mounts - Mounted Filesystems. Has:
  *   - "device": "/dev/sda3" - to connect / assciate to partition
  *   - "fstype": "ext4"
  *   - "mount": "/",
  *   - "uuid": "5de139cb-e881-462e-8a8a-33779509b786" (part or FS ?)
 */
function diskinfo(req, res) {
  var jr = {status: "err", msg:"No Proper Disk Info."};
  var xip = req.query["ip"]; // eXplicit IP
  var ip = osinst.ipaddr_v4(req); // Detect IP
  // TODO: Review osid / oshint concept (and for what all it is used (1. Mirrors, 2. ...)
  var osid = req.query["osid"] || global.targetos || "ubuntu18"; // TODO: 1) Later. recipe.osid
  if (xip) { console.log("Overriding ip: " + ip + " => " + xip); ip = xip; }
  // Lookup directly by IP
  var f = hostcache[ip]; // Get facts. Even no facts is ok for new hosts.
  if (!f) { jr.msg += "No Facts => no disk info"; console.log(jr.msg); return res.json(jr); }
  var disk = disk_params(f);
  
  //if (1) { return res.json(disk); }
  // Generate in particular format
  var xml = disk_out_winxml(disk.ansparr);
  //res.type('application/xml');
  return res.end(xml);
}
/** Generate Disk parameters for super simple disk layout: root+swap (and optional boot).
  * Calculate disk params based on the facts.
  * The unit on numbers is MBytes (e.g. 32000 = 32 GB)
  * See facts sections: ansible_device_links ansible_devices ansible_memory_mb
  * @param f {object} - Ansible facts (w. ansible_devices, ansible_memory_mb, ... on top level).
  * @return Disk Object (To convert to disk recipe format by caller)
  * 
  * @todo Allow output generation in various unattended install recipe formats
  * - Debian/Ubuntu
  * - RH kickstart
  * - Windows Autounattend.xml (XML Section "DiskConfiguration")
  * - Pass default disk template here, that may be returned if heuristics fail (?)
  * - Pass default disk device (e.g 'sda' when hard default 'sda' is not avail.)
  * # Notes
  * - Ansible disk structure (e.g. for sda) has all info, but is not usable as-is.
  *    - It must be be transformed to much more simple, sequenced and ordered structure
  * - 
  */
  function disk_params (f) {
    var disk = {rootsize: 40000, swapsize: 8000, bootsize: 500, disktotsize: 0}; // Safe undersized defaults in case we return early (should not happen)
    if (!f) { return disk; }
    var ddevs = f.ansible_devices;
    var mem = f.ansible_memory_mb;
    if (!ddevs) { return disk; }
    if (!mem || !mem.real || !mem.real.total) { return disk; }
    var memtot = mem.real.total; // In MB
    console.log("Got disk devices: " + Object.keys(ddevs));
    var sda = ddevs.sda; // Ansible disk
    if (!sda) { console.error("Weird ... Machine does not have disk 'sda' !"); return disk; }
    var parts = sda.partitions;
    var ansparr = parts2array(parts);
    console.log(JSON.stringify(ansparr, null, 2));
    var disktot = disk.disktotsize = disk_calc_size(ansparr); // OLD: sda
    disk.ansdisk_name = "sda";
    disk.ansparr = ansparr; // OLD: sda, NEW: ansparr
    
    ///////////////////// Calc root, swap as function of disktot, memtot /////////////////////
    if (memtot > disktot) { console.error("Warning: memory exceeds size of disk !"); return disk; }
    var rootsize = (disktot - memtot);
    // Memory is over 20% of disk, reduce 
    if ((memtot/disktot) > 0.20) { rootsize = 0.80 * disktot; }
    // Assemble / Set final figures
    disk.rootsize = rootsize;
    disk.swapsize = (disktot - rootsize - disk.bootsize - 1000); // Need to schrink a bit further.
    console.error("Calculated Disk Plan:", disk);
    
    return disk;
  }
/** Compute size of a disk from its partitions (within facts)
 * Facts member "partitions" (has "sda1", "sda2", ...) is looked into here.
* Lower level task called by disk_params()
* @param sda {object} - Disk Object (containing partitions ...)
* @return size of the disk.
*/
/*
function disk_calc_size_OLD(sda) { // Internal
  
  if (!sda) { return 0; }
  var parts = sda.partitions;
  var pnames = Object.keys(parts);
  console.error("Got disk parts: " + pnames);
  var disktot = 0; // Size
  
  
  
  for (var i in pnames) {
    var pn = pnames[i]; // e.g. sda1
    var part = parts[pn];
    // console.log(pn); continue;  DEBUG
    var s = partsize(part);
    disktot += s; // (sf * uf);
  }
  
  return disktot;
}
*/

/** Calculate total size from set of parts.
* TODO: Allow passing units or calc style (what size-member gets used)
*/
function disk_calc_size(ansparr) {
  var s = 0; // Total
  
  ansparr.forEach((part) => { s += partsize(part); });
  return s;
}
/** Extract Ansible partitions into proper sequence here
* Note 
*/
function parts2array(parts) {
    var ansparr = [];
    var pnames = Object.keys(parts);
    var seqi = 1;
    pnames.forEach((pn) => {
      //console.log("PN:"+pn);
      // TODO: Make pattern mmcblk0p2 -friendly
      var m = pn.match(/^[a-zA-Z]+(\d+)/);
      if (!m) { return; }
      let part = parts[pn];
      part.partid = pn;
      var i = parseInt(m[1]);
      ansparr[i] = part; // Assign !
      part.size_bysect = (parseInt(part.sectors) * parseInt(part.sectorsize));
      part.size_mb = Math.floor(part.size_bysect / 1000000);
      // Delete distracting members
      // Extract part.links.labels[0] (e.g. linux3)
      if (!part.links) { console.log("Warning: No part.links !!");}
      else if (part.links.labels && Array.isArray(part.links.labels)) { part.lbl = part.links.labels[0]; }
      delete(part.links);
      delete(part.holders);
      part.seq = seqi;
      
      //console.log("Disk-part: "+ i);
      seqi++;
    });
    if (!ansparr[0]) { ansparr.shift(); }
    
    return ansparr;
} // parts2array
  
/** Convert partition size from Ansible unit notation to absolute numeric units.
 * Member "size" with unit GB,MB or KB gets used for this.
 */
function partsize(part) {
  var unitfactor = { "GB": 1000, "MB": 1, "KB": 0.1 };
  // Allow bare number w/o units !
  if (part.size.match(/^([\d\.]+)$/)) { return parseFloat(marr[1]); }
  marr = part.size.match(/^([0-9\.]+)\s+([KMGB]+)/);
  console.log(marr + " len:" + (marr ? marr.length: "None"));
  if (marr && (marr.length == 3)) {
    var sf = parseFloat(marr[1]);
    var uf = unitfactor[marr[2]];
    if (!uf) { console.error("Weird / Unsupported unit: " + marr[2]); return 0; }
    return (sf * uf);
  }
  return 0; // Fallback
}
  
/** Generate contents of Windows Autounattend.xml DiskConfiguration -> Disk section.
 * 
 * "DiskConfiguration" Subsections:
 * - Disk - nearly empty: <Disk wcm:action="add">
 * - Disk -> CreatePartitions (no-attrs) -> CreatePartition
 *   - Create parts w. Size,Order,Type (or Extend=true instead of Size)
 *   - Size units seem to be MB
 *   - Type (e.g.): Primary, EFI, MSR
 * - Disk -> ModifyPartitions (no-attrs) -> ModifyPartition
 *   - Format parts w. Format,Label,Order,PartitionID (Opt: Letter
 *   - May be missing Format,Label e.g if imaged by ImageInstall -> OSImage or special part (MSR ?).
 *   - Format: NTFS, FAT32, 
 *   - Label: WinRE, System, Windows
 * TODO: Pass single linetboot disk structure, iterate it twice for XML format
 */
function disk_out_winxml(ansparr) {
  // Should embed CreatePartitions and ModifyPartitions
  var dconf = `<DiskConfiguration>
                <Disk wcm:action="add">
                  <CreatePartitions>
                    {{{ confs }}}
                  </CreatePartitions>
                  <ModifyPartitions>
                    {{{ mods }}}
                  </ModifyPartitions>
                  <DiskID>0</DiskID>
                  <WillWipeDisk>true</WillWipeDisk>
                </Disk>
                <WillShowUI>OnError</WillShowUI>
            </DiskConfiguration>
  `;
  var cpart = `<CreatePartition wcm:action="add">
                            <Order>{{ seq }}</Order>
                            <Type>EFI</Type>
                            <Size>{{ size_mb }}</Size>
                            
  </CreatePartition>
  `;
  var mpart = `<ModifyPartition wcm:action="add">
                            {{#fmt}}<Format>{{ fmt }}</Format>{{/fmt}}
                            {{#lbl}}<Label>{{ lbl }}</Label>{{/lbl}}
                            <Order>{{ seq }}</Order>
                            <PartitionID>{{ seq }}</PartitionID>
                            <!-- <TypeID>DE94BBA4-06D1-4D40-A16A-BFD50179D6AC</TypeID> -->
  </ModifyPartition>
  `;
  //var disk2 = dclone(disk);
  var para = {};
  // Populate Win. specific attrs, w. right units, etc.
  // p.size_mb = Math.floor(p.size_bysect / 1000000);
  var xconts = {"confs": "", "mods":""};
  ansparr.forEach((p) => {
    
    xconts.confs += Mustache.render(cpart, p);
  });
  ansparr.forEach((p) => {
    
    xconts.mods += Mustache.render(mpart, p);
  });
  var cont = Mustache.render(dconf, xconts);
  console.log(cont);
  return cont;
}
module.exports = {
  init: init,
  disk_params: disk_params,
  diskinfo: diskinfo // Handler
};
