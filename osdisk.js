/** @file
 *
 * # OS Install Disk Related Functionality
 * 
 * This module generates disk part of the OS Install recipes in the formats the recipes require.
 * The module supports a "disk partition layout model" (AoO - an array of objects) in neutral format,
 * which can then be output in various formats. The module also accounts for some variations in distro
 * prederences - e.g. if a separate /boot partition is used for particular distro.
 * 
 * ## Supported Disk partitioning and formatting output formats
 * 
 * - kickstart (separate /boot)
 * - preseed
 * - autoinst.xml (separate /boot)
 * - Autounattend.xml (MS Windows documented layout)
 * 
 * ## Lineboot Disk Definition Format
 * 
 * Describes a set of disk partitions:
 * 
 * - size_mb (number) - Partition Size in millions on bytes (Mib, ~megabytes)
 * - type - Partition type (ptype ? partype ?)
 *   - BIOS/MBR: "Primary" / "Extended" / "Logical"
 *   - EFI/GPT: "Primary" (default value)
 *   - EFI/GPT Special: Windows has also types "MSR","EFI" for GPT
 * - fmt - File system type (format, TODO: fstype, Windows uses upper case, e.g. "NTFS", "FAT32")
 * - lbl - Partition or filesystem label (It depends on OS and FS used, where the label is located)
 * - extend - Expand partition to take up remaining space (TODO: expand ? See terminology in various places, docs, programs)
 * 
 * # References
 * 
 * Microsoft documentation of Disk partitioning, layouts and FS Formats:
 * 
 * - https://docs.microsoft.com/en-us/windows-hardware/customize/desktop/unattend/microsoft-windows-setup-diskconfiguration
 * - https://docs.microsoft.com/en-us/previous-versions/windows/it-pro/windows-8.1-and-8/hh825686(v=win.10)
 * - https://docs.microsoft.com/en-us/previous-versions/windows/it-pro/windows-8.1-and-8/hh825701(v=win.10) - BIOS/mbr
 * - https://docs.microsoft.com/en-us/previous-versions/windows/it-pro/windows-8.1-and-8/hh825702(v=win.10) - EFI/gpt
 * - https://docs.microsoft.com/en-us/previous-versions/windows/it-pro/windows-8.1-and-8/hh825205(v=win.10) - BIOS/mbr - More than 4
 * - https://docs.microsoft.com/en-us/previous-versions/windows/it-pro/windows-8.1-and-8/hh825675(v=win.10) - More than 4 (refs to type=0x27)
 * - https://social.technet.microsoft.com/Forums/windows/en-US/e2463292-e2c5-4896-97ea-58a2443b6ec6/what-is-type-id-inside-windows-aik-20-under-modify-and-how-to-use-type-id?forum=w7itproinstall
 * - https://docs.microsoft.com/en-us/previous-versions/windows/it-pro/windows-8.1-and-8/hh825701%28v%3dwin.10%29#example-automatically-install-the-default-partition-configuration
 * 
 * Windows part typeid: 0x27 does not receive drive letter
 */
var Mustache = require("mustache");
var yaml  = require('js-yaml'); // subiquity
// NOTE: Loading osinstall.js here on top shows it's
// module.exports (== osinst) as empty (object) !!!
// See console.log() below. Must load during init() ... osinst shows ok.
var osinst; // DONOT: = require("./osinstall.js");
var hostcache; // diskinfo() handler / Ansible  only (?)


// Set lbl == WINRE with typeid = ...
// Set lbl == Windows letter = C, global installto = N
// Stub for Windows server partitioning.
var winparts = [
  // EFI Only typeid: "de94bba4-06d1-4d40-a16a-bfd50179d6ac",
  { size_mb: 500, type: "Primary",  fmt: "NTFS", lbl:"WINRE"},
  // Universal. For BIOS (this is 1st part) lbl:WINRE, type:MSR stuff goes here
  // For EFI (Autounattend.xml) by doc and examples type: EFI, fmt: "FAT32"
  { size_mb: 500, type: "Primary", fmt: "NTFS", lbl: "System"},
  { size_mb: 128, type: "MSR",     fmt: ""}, // FAT32 ?
  { size_mb: 0,   type: "Primary", fmt: "NTFS", lbl: "Windows", mpt: "C", extend: true}, // 
];
// /boot/efi FS Recommends: Suse: FAT32 (vfat ?)
var linparts = [
  { size_mb: 600, type: "Primary",  fmt: "ext4", lbl:"boot", mpt: "/boot"}, // Was 250, Make 512,550,500 as Rocky/RH requires > 512
  // Linux distros seem to agree on the mpt: "/boot/efi"
  // NEW: Added lbl: ESP
  { size_mb: 200, type: "Primary",  fmt: "fat32", lbl:"ESP", mpt: "/boot/efi"}, // "EFI System" UEFI (esp), See RH pages (fat32/vfat ?)
  // mpt: biosboot usable w. KS as-is
  { size_mb: 1,   type: "Primary",  fmt: "biosboot",     lbl:"biosboot", mpt: "biosboot"}, // "BIOS Boot" EFI/GPT 1 MiB
  { size_mb: 16000,type: "Primary",     fmt: "swap", lbl:"swap", mpt: "swap"}, // RH+KS wants mpt: "swap"
  { size_mb: 32000,type: "Primary",  fmt: "ext4", lbl:"root", mpt: "/", extend: true},
  
];
/** Derive from partitions what kind of partition table is in use.
 * The need for this may go away if we store partitions in wrapping object where ptable type is already
 * indicated.
 * @param parr - Array of paritions.
 * @retrun Either "mbr" or "gpt" based on discoveries made.
 */
function ptable_derive(parr) {
  var m = parr.filter((p) => { return (p.type == 'MSR') || (p.fmt == 'biosboot') || (p.lbl == 'biosboot'); });
  return m.length ? "gpt" : "mbr";
}
function is_esp(p) {
  return (p.mpt && p.mpt.match(/\befi$/) || (p.type == 'ESP') || (p.type == 'EFI'));
}
/** Try to create simple Linux disk layout with root partition and swap plus mandatory extra parts.
 * Mandatory extra parts include parts like "EFI System" and RH conventional "/boot" part.
 * Clones module global "linparts" (AoO) linux partition spec as basis for layout.
 * @param btype (str, should be ptt=part table type) - type of boot / partition table ('mbr' or 'gpt')
 * @param ostype - OS (Linux distro) type indicator (Valid values: 'suse', 'debian', 'centos')
 * https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/6/html/installation_guide/s2-diskpartrecommend-x86
 * https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/7/html/installation_guide/sect-disk-partitioning-setup-x86
 * Dir /sys/firmware/EFI indicates EFI Boot
 */
function lindisk_layout_create(btype, ostype) {
  var debug = 0;
  debug && console.log("Before clone: "+linparts.length + " for "+btype+"/"+ostype);
  var parts = dclone(linparts);
  // Debian/Ubuntu - delete boot partition
  if (ostype && ostype.match(/^(ubu|deb)/)) { parts.splice(0, 1); }
  // MBR => Delete EFI
  if (btype == 'mbr') {
    // Just mark extend
    debug && console.log("Before parts filter: "+parts.length);
    parts = parts.filter(non_efi);
    debug && console.log("After parts filter: "+parts.length);
  }
  // Non-EFI filter cb
  function non_efi(p) { return (p.mpt != "biosboot") && (p.mpt != "/boot/efi"); }
  // TODO: Make into reusable. On linux / KS Not sure if extend is needed ?
  function check_extended(parts) {
    var ext = {size_mb: 1, type: "Extended", fmt: null, lbl: "", extend: true};
    
    // If > 4, nest at offset 3
    if (parts.length > 4) { parts.splice(3, 1, ext); }
  }
  return parts;
}

/** Create recommended fresh layout of Windows disk for cases BIOS or EFI.
 * Boot types BIOS / EFI map to disk partition table types mbr (Master Boot Record) / gpt (GUID Partition Table)
 * @param btype {string} - Boot mechanism type bios/efi (No default)
 * @return Disk layout (array of objects)
 */
function windisk_layout_create(btype) {
  var oktypes = {mbr: "mbr", gpt: "gpt", bios: "mbr", "efi": "gpt"};
  if (!oktypes[btype]) { console.log("Not a valid btype: "+btype+"(Use: "+Object.keys(oktypes).join(",")+")"); return null; }
  btype = oktypes[btype];
  var myparts = dclone(winparts);
  if (btype == 'mbr') {
    // Simplify for BIOS
    myparts.splice(0, 1); // shift()
    // What used to be [2] is now [1]
    myparts.splice(1, 1);
    console.log(myparts);
  }
  // efi
  else {
    // lbl == WINRE
    myparts[0].typeid = "de94bba4-06d1-4d40-a16a-bfd50179d6ac"; // "Utility partition"
    // Search p.lbl == 'System' ?
    var sysp = myparts[1];
    // var sysp = myparts.filter((p) => { return p.lbl == 'System'; });
    sysp.type = 'EFI'; // Override 'Primary'
    sysp.fmt  = 'FAT32';
  }
  // Windows Main part (Win oddity: letter: 'C'). Last in all: extend: true
  var wp = myparts.filter((p) => { return p.lbl == "Windows"; })[0];
  if (!wp) { console.log("Could not find lbl: 'Windows' part (must-have)."); return null; }
  //wp.letter = wp.mpt; // 'C'; Now handled by "mpt": "C"
  // wp.extend = true;
  var i = 1;
  // Assign seq numbers (1-based)
  myparts.forEach ((p) => {p.seq = i; i++; } );
  return myparts;
}
function dclone(d) { return JSON.parse(JSON.stringify(d)); }
//console.log("osdisk-OSINTALL", osinst);
// Created for the sole purpose of late-loading osinstall.js
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
  // DEPRECATED: global.targetos ||
  var osid = req.query["osid"] || "ubuntu18"; // TODO: 1) Later. recipe.osid
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
/** Generate Disk parameters for super simple disk layout based on Ansible facts.
 * Layout: root+swap (and optional boot).
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
    var debug = 0;
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
    if (debug) { console.log(JSON.stringify(ansparr, null, 2)); }
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
    disk.swapsize = (disktot - rootsize - disk.bootsize - 1000); // Need to shrink a bit further.
    if (debug) { console.error("Calculated Disk Plan:", disk); }
    
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

////////////////////////// Windows disk partitioning ////////////////////////

// Templates embed CreatePartitions and ModifyPartitions
  var tmpls = {};
  // To take partials into use {{{ cpart }}} => {{#parr}}{{> cpart }}{{/parr}}
  // {{{ cpart }}}   {{{ mpart }}}
  tmpls.dconf = `            <DiskConfiguration>
                <Disk wcm:action="add">
                  <CreatePartitions>
          
          {{#parr}}{{> cpart }}{{/parr}}
                  </CreatePartitions>
                  <ModifyPartitions>
          
          {{#parr}}{{> mpart }}{{/parr}}
                  </ModifyPartitions>
                  <DiskID>0</DiskID>
                  <WillWipeDisk>true</WillWipeDisk>
                </Disk>
                <WillShowUI>OnError</WillShowUI>
            </DiskConfiguration>
  `;
  tmpls.cpart = `            <CreatePartition wcm:action="add">
                            <Order>{{ seq }}</Order>
                            <Type>{{ type }}</Type>
                            {{^extend}}<Size>{{ size_mb }}</Size>{{/extend}}
                            {{#extend}}<Extend>{{ extend }}</Extend>{{/extend}}
            </CreatePartition>
  `;
  tmpls.mpart = `            <ModifyPartition wcm:action="add">
                            {{#fmt}}<Format>{{ fmt }}</Format>{{/fmt}}
                            {{#lbl}}<Label>{{ lbl }}</Label>{{/lbl}}
                            <Order>{{ seq }}</Order>
                            <PartitionID>{{ seq }}</PartitionID>
                            {{#typeid}}<TypeID>DE94BBA4-06D1-4D40-A16A-BFD50179D6AC</TypeID>{{/typeid}}
                            {{#mpt}}<Letter>{{ mpt }}</Letter>{{/mpt}}
              </ModifyPartition>
  `;
// https://github.com/digital-wonderland/packer-templates/blob/master/openSUSE-13.1_x86_64/http/autoinst.xml
// <initialize config:type="boolean">true</initialize>
// <use>all</use> MUST Have (per Yast)
// Note: fat32 may not be valid (per doc) btrfs, ext*, fat, xfs, swap
tmpls.yastdrive = `
  <partitioning config:type="list">
    <drive>
      <device>/dev/sda</device>
      <initialize config:type="boolean">true</initialize>
      <disklabel>msdos</disklabel>
      <use>all</use>
      <partitions config:type="list">
        {{#parr}}{{> yastpart }}{{/parr}}
      </partitions>
    </drive>
  </partitioning>
`;
tmpls.yastpart = `
    <partition>
      <filesystem config:type="symbol">{{ fmt }}</filesystem>
      {{^extend}}<size>{{ size_mb }}M</size>{{/extend}}{{#extend}}<size>max</size>{{/extend}}
      {{#mpt}}<mount>{{{ mpt }}}</mount>{{/mpt}}
      <label>{{{ lbl }}}</label>
    </partition>
`;
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
function disk_out_winxml(parr) {
  
  //var disk2 = dclone(disk);
  var para = {};
  // Populate Win. specific attrs, w. right units, etc.
  // p.size_mb = Math.floor(p.size_bysect / 1000000);
  var xconts = {"cpart": "", "mpart":"", parr: parr};
  /*
  parr.forEach((p) => {
    
    xconts.cpart += Mustache.render(tmpls.cpart, p);
  });
  parr.forEach((p) => {
    
    xconts.mpart += Mustache.render(tmpls.mpart, p);
  });
  var cont = Mustache.render(tmpls.dconf, xconts);
  */
  // Partials (3rd)
  var cont = Mustache.render(tmpls.dconf, xconts, tmpls);
  //console.log(cont);
  return cont;
}
function disk_out_yast(parr) {
  var xconts = { parr: parr };
  var cont = Mustache.render(tmpls.yastdrive, xconts, tmpls);
  return cont;
}

/** generate disk output in KS (Typical of RH, Centos) format.
 * https://dark.ca/2009/08/03/complex-partitioning-in-kickstart/
 */
function disk_out_ks(parr) {
  var comps = ["# Parts should have --asprimary --fstype --label --size (size unit: MiB)"];
  var drive = "sda"; // var basedisk = path.basename(d.lindisk); // <= Need d / disk info
  comps.push("bootloader --location=mbr");
  comps.push("zerombr");
  comps.push("clearpart --drives="+drive+" --all --initlabel");
  parr.forEach((p) => {
    // --asprimary does not hurt on EFI. Consider: swap --recommended
    var pdef = "part "+p.mpt+" "+(p.type.toLowerCase() == 'primary' ? "--asprimary " : "");
    pdef += "";
    pdef += p.fmt ? " --fstype=\""+p.fmt +"\"": "";
    pdef += p.lbl ? " --label=\"" +p.lbl +"\"": "";
    // --maxsize= could limit the growth. --ondisk could refere to disk/by-id/...
    // Seems --size=... and --grow can coexist (and must per doc - size is min size)
    pdef += p.size_mb ? " --size="+p.size_mb : "";
    if (p.fmt == 'swap') { pdef += " --recommended"; } // Ok with size on Centos 7
    else if (p.extend) { pdef += " --grow"; }
    
    comps.push(pdef);
  });
  // Needed for EFI, etc ? What if these are already prepared by above ?
  // Would add also (IBM) PRePBoot
  //comps.push("reqpart --add-boot");
  return comps.join("\n") + "\n";
}
/** Output disk in (Debian/Ubuntu/Preseed) "d-i partman-auto/expert_recipe" (partman) format.
 * Note: The disk chosen is expressed separately by preseed `partman-auto/disk` directive (e.g. `partman-auto/disk string /dev/sda`).
 * Refs:
 * https://www.bishnet.net/tim/blog/2015/01/29/understanding-partman-autoexpert_recipe/
 * d-i/debian-installer/doc/devel/partman-auto-recipe.txt
 */
function disk_out_partman(parr) {
  var hasboot = 0; // Has boot-flagged partition  $bootable{ } - Allow only single
  var comps = []; // DO NOT Include name **here**, e.g. "boot-root :: "
  parr.forEach((p) => {
    // Number triplet:
    // - Min
    // - Priority
    // - Max (-1 = no maximum - extend ?)
    // Consider parr.length (e.g. 4) to derive perc ?
    var perc = 100 / parr.length; // Equal percentages to use as prio (But note: max will cap prio to 0)
    var tri = [ p.size_mb, Math.floor(p.size_mb + perc), p.size_mb ];
    if (p.extend) { tri[2] = -1; } // No maximum / extend. Imply tri[1] ?
    // Modify priority / weight tri[1]
    // Non-extN (low-level) partition - do not prioritize for growth
    if (!p.fmt.match(/^ext/) && !p.extend) { tri[1] = p.size_mb; }
    var pdef = tri.join(" ");
    // Additional format indicator here (e.g. "ext3", "linux-swap") ?
    if (p.fmt == 'swap') { pdef += " linux-swap"; }
    else { pdef += " "+p.fmt; }
    pdef += (p.type.toLowerCase() == 'primary' ? " $primary{ } " : "");
    // Derive $bootable{ } - Allow only single (see hasboot) !
    if (((p.mpt == '/') || (p.mpt == '/boot')) && !hasboot ) { pdef += " $bootable{ }"; }
    
    //pdef += p.lbl ? " --label=\"" +p.lbl +"\"": "";
    // --maxsize= could limit the growth. --ondisk could refere to disk/by-id/...
    // Seems --size=... and --grow can coexist (and must per doc - size is min size)
    
    if (p.fmt == 'swap') { pdef += " method{ swap } format{ }"; }
    else {
      pdef += " method{ format } format{ }";
      pdef += p.fmt ? " use_filesystem{ } filesystem{ "+p.fmt +" }": "";
      pdef += p.mpt ? " mountpoint{ "+p.mpt+" }" : "";
    }
    //pdef += " ";
    pdef += " .";
    comps.push(pdef);
  });
  return comps.join("\n") + "\n";
}

// Reassemble partman string as preseed embeddable, line continuum chars included.
    function partman_esc_multiline(out) {
      //var comps = out.split(/\.\s+/);
      //if (!comps[comps.length-1]) { comps.pop(); }
      //console.log("Comps:", comps);
      //return comps.join(".\\\n") + " .";
      out = out.replace(/\.\n/g, ".\\\n"); out = out.replace(/\.\\\n$/, ".\n"); // Strip last '\'
      return out;
    }
    
/** Output disk in parted format.
 * Used by e.g. alis.
 * 
 */
function disk_out_parted(parr) {
  var parttypes = {"mbr": "msdos", "gpt":"gpt"};
  var type = ptable_derive(parr);
  // parted uses gpt/msdos
  var comps = ["mklablel "+parttypes[type]];
  var idx1 = 1;
  var curroff = (type == "mbr" ? 4 : 1); // Start offset (Arch/alis)
  parr.forEach((p) => {
    var pdef = "mkpart";
    // This should say "ESP" for "EFI system partition
    if ((type == 'gpt') && is_esp(p)) { pdef += " ESP"; }
    else { pdef += (p.type.toLowerCase() == 'primary') ? " primary" : ""; }
    pdef += " "+p.fmt;
    // Start, End (!!)
    pdef +=  " " + curroff + "MiB";
    curroff += p.size_mb;
    
    // Note: End of prev should be beginning of new (Or 100% for last-only (??))
    if (p.extend) { pdef += " 100%"; }
    else { pdef +=  " " +curroff + "MiB"; }
    // NOT: Then MAX ? Either 512MiB or 100% in (alis 2 part) examples
    // NOT: else { pdef += " 512MiB"; }
    // Label ?
    if (p.lbl) { pdef += " name " + idx1 + " "+p.lbl+""; }
    comps.push(pdef);
    if (p.fmt == 'swap') { comps.push("set "+idx1+ " swap on"); }
    idx1++;
  });
  comps.push("set 1 "+(type == 'gpt' ? 'esp' : 'boot')+" on");
  // Swap
  
  return comps.join(" ");
}
/** Create Ubuntu 20 subiquity YAML "storage.config" section (Array of Objects).
 * This is by far the most indirect, yet linearly presented format (one step beyond MS Autounattend.xml "DiskConfiguration" section).
 * - Each partition has 4 different entities associated with it (classified by "type"-attribute):
 *   - disk (device, 1x in a simple case)
 *   - partition - Containing space, refers/parents to disk by `device: ...`
 *   - format - Filesystem format (e.g. ext4, xfs) refers to `partition` by `volume: ...`,
 *   - mount - Mounting spec, refers to format by `device: ...`(! term reused, see partition)
 * - All of above types are are presented in linear array (!)
 * - Additionally the disk / partition table (type: disk) is presented in the same linear array (typically as first item)
 * - Exception: autoinstall config did not create needed bootloader partition => grub_device: true to the disk, not a partition
 * ### References
 * 
 * - https://ubuntu.com/server/docs/install/autoinstall-reference
 * - https://askubuntu.com/questions/1244293/how-to-autoinstall-config-fill-disk-option-on-ubuntu-20-04-automated-server-in
 * - https://github.com/canonical/curtin/blob/master/curtin/block/schemas.py - disk schema allowed vals
 * - https://www.molnar-peter.hu/en/ubuntu-jammy-netinstall-pxe.html
 * - https://askubuntu.com/questions/1415360/ubuntu-22-04-autoinstall-storage-section-autoinstall-config-did-not-create-ne
 *   ( Exception: autoinstall config did not create needed bootloader partition )
 */
function disk_out_subiquity(parr) {
  var parttypes = {"mbr": "msdos", "gpt":"gpt"}; // subiquity uses msdos (dos), not "mbr"
  var type = ptable_derive(parr);
  var mytype = parttypes[type];
  // var basedisk = path.basename(d.lindisk);
  var diskname = "sda";
  // parted uses gpt/msdos.So does ubiquity
  var disk = { type: "disk", id: "disk-"+diskname, ptable: mytype, path: "/dev/"+diskname, preserve: false, name: '', grub_device: true, // old false => true ? OK, works
     wipe: "superblock"
     };
  var comps = [disk]; // "mklablel "+
  var dcs = { parts: [], fmts: [], mnts: [] };
  var parts = []; var fmts = []; var mnts = [];
  var idx0 = 0;
  var idx1 = 1;
  parr.forEach((p) => {
    // subiquity partition (sp)
    // Should not be on part-level: wipe: "superblock", ?
    // NOTE: "number:..." Should be 1-based per examples, partition: ... 0-based (e.g. partition-0) or 1-based "partition-"+diskname+idx1
    var sp = { type: "partition", id: "partition-"+diskname+idx1, device: "disk-"+diskname,  preserve: false, number: idx1,
       //size: p.size_mb*1000000,  flag: "boot",
       //grub_device: true, <= Used on disk level
    };
    // Add optionals
    sp.size = p.extend ? -1 : p.size_mb*1000000;
    // flag: bios_grub
    if (idx1 == 1) { sp.flag = "boot"; } // TODO: REVIEW p.lbl == "biosboot"
    //if (idx1 == 1) { sp.grub_device = true; } // Use on part conditionally ? Disabled for debug
    //comps.push(sp);
    //dcs.parts.push(sp);
    parts.push(sp);
    // subiquity "format" (Should be 0-based (??) per examples
    var sf = { type: "format", id: "format-"+idx0,  volume: "partition-"+diskname+idx1, fstype: p.fmt, preserve: false, };
    //comps.push(sf);
    //dcs.fmts.push(sf);
    fmts.push(sf);
    // subiquity "mount"
    var sm = { type: "mount", device: "format-"+idx0, path: p.mpt,  id: "mount-"+idx0 };
    // Only add if mountable (has mpt)
    if (p.mpt) {
      //comps.push(sm);
      //dcs.mnts.push(sm);
      mnts.push(sm);
    }
    idx1++;
    idx0++;
  });
  
  // Combine in type: order ... partition, format, mount
  // ["parts","fmts","mnts"].forEach((k) => { comps = comps.concat( dcs[k] ); }); // Add each type-group
  comps = comps.concat( parts ); comps = comps.concat( fmts ); comps = comps.concat( mnts );
  console.log(comps);
  // YAML ! //'sortKeys': true
  var ycfg = {
    'styles': { '!!null': 'canonical' }, // dump null as ~
  };
  var ycont = yaml.safeDump(comps, ycfg);
  //
  return ycont;
}
// Photon OS JSON disk config in reciperoot.partitions = [ ... ]
// Map osdisk.js parts to photon.
// Note: There is also (top-level) "partition_type": "msdos" (msdos,gpt, latter default)
function disk_out_photon(parr) {
  var photon_parts = parr.map( (p) => {
    var php = {}; // Photon part mountpoint: "", size: INT, filesystem: p.fmt
    // php.size = p.size_mb; // Photon part size unit looks like MB (128 in examples, could be GB ?)
    //if (p.fmt ==  swap) { delete(php.mountpoint) }
    return php;
  });
  return JSON.stringify(photon_parts, null, 2);
}
module.exports = {
  init: init,
  disk_params: disk_params,
  diskinfo: diskinfo, // Handler
  // Windows
  disk_out_winxml: disk_out_winxml,
  // TODO: layouts: {lin: lindisk_layout_create, win: windisk_layout_create}
  windisk_layout_create: windisk_layout_create,
  lindisk_layout_create: lindisk_layout_create,
  disk_out_ks: disk_out_ks,
  disk_out_partman: disk_out_partman,
  disk_out_yast: disk_out_yast,
  disk_out_parted: disk_out_parted,
  disk_out_subiquity: disk_out_subiquity,
  partman_esc_multiline: partman_esc_multiline,
  tmpls: tmpls
};
