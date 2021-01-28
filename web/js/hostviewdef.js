// Filtering: Part of controller(js-grid) cellFilter:(ui-grid)
   function distrocell(value, item) {
     var img = "iconfinder_logo_brand_brands_logos_linux_3215592.svg"; // Default
     if (value == "Debian") { img = "iconfinder_debian_386459.svg"; }
     if (value == "Ubuntu") { img = "iconfinder_Ubuntu_2744987.svg"; }
     if (value == "RedHat") { img = "iconfinder_redhat_7353.png"; }
     
     return value + "<img src=\"img/"+img+"\" class=\"osicon\">"; // 
   }
   function rotcell(value, item) {
     if (typeof value == 'undefined' || value === "") { return "??"; }
     if (value == "1") { return("HDD");}
     return "SSD";
   }
   function tscell(value, item) {
     //return value + "(ISO?)";
     return new Date(value * 1000).toISOString(); 
   }
   function servtagcell(value, item) {
     var dsurl = "https://www.dell.com/support/home/us/en/04/product-support/servicetag/";
     // TODO: Find out if any other vendors do this !
     if (item && item.sysvendor && item.sysvendor.match(/\bDell\b/)) {
       return("<a href='" + dsurl + value + "' target='dellinfo'>" + value + "</a>"); }
     return value;
   }
   function dnsentcell(value, item) {
     //if (typeof item.addrs != 'object') { return ""; }
     if (!Array.isArray(item.addrs)) { return ""; }
     // type: 'A' => address: "<IP>" ... "type": "CNAME", "value": "<HOSTNAME>"
     var cont = "";
     var aent = value[0]; // Sample first
     if (typeof aent != 'object') { return ""; }
     var cbs = {
       'A': function (aent) { return(aent.address); },
       'CNAME': function (aent) { return(aent.value); }
     };
     console.log(item);
     cont = cbs[aent.type] ? cbs[aent.type](aent) : "????";
     cont += " (type " + aent.type + ")";
     return cont;
   }
   var hostfld = {name: "hname", title: "Host", type: "text", css: "hostcell", width: 130};
   var fldinfo_net = [
     hostfld,
     // Network
     {name: "dev",     title: "Device", type: "text", width: 40},
     {name: "ipaddr",  title: "IP Addr", type: "text", width: 120},
     {name: "macaddr", title: "Mac Addr", type: "text", width: 130, css: "macaddr"},
     {name: "netmask", title: "NetMask", type: "text", width: 120},
     {name: "gateway", title: "Gateway", type: "text", width: 120},
     {name: "dns", title: "DNS Server(s)", type: "text", width: 160},
   ];
   function hasdockcell(value, item) {
     var n = item.hname;
     // onclick=\"on_docker_info();\"
     return value ? "<span class=\"drinfo\" data-tgt=\"dockerimg\" data-hname=\""+n+"\">Docker Info</span>" : "";
   }
   function hasnfscell(value, item) {
     var n = item.hname;
     // onclick=\"on_docker_info();\"
     return value ? "<span class=\"nfsinfo\" data-tgt=\"nfsinfo\" data-hname=\""+n+"\">NFS</span>" : "";
   }
   // TODO: Populate dynamic fields separately (at server or client ?)
   var fldinfo_dist = [
     hostfld,
     // Distro
     // insertTemplate: "<img src='foo.png'> Hi"
     {name: "distname",  title: "Distro", type: "text", width: 80, itemTemplate: distrocell }, // css: "osicon"
     {name: "distver",   title: "Ver", type: "number", width: 50},
     {name: "kernelver", title: "Kernel", type: "text", width: 90},
     // Dynamic (visible: false). Enable by web.xflds
     {name: "use", title: "Usage", type: "text", width: 80},
     {name: "loc", title: "Location", type: "text", width: 80},
     {name: "dock", title: "Docker", type: "text", width: 40, itemTemplate: hasdockcell},
     {name: "nfs", title: "NFS", type: "text", width: 40, itemTemplate: hasnfscell}, // , visible: false
     // https://codepen.io/shunty/pen/Njywpz
     //
     //{name: "", title: "", type: "control", editButton: false, deleteButton: false}
     // {name: "foo", title: "Action !", type: "actionButton"} // Works
   ];
   function rmgmtcell(value, item) {
     
     return value ? "<a href=\"https://" + value + "/\">" + value + "</a>" : "N/A" ;
   }
   function probeokcell(value, item) {
     // console.log("Got value:'" + value + "'");
     var ok = value ? 1 : 0;
     var markers = [
       {sty:"color: white; background-color: #B42424;display: block; Xwidth: 100%;padding: 2px; border-radius: 3px;",txt:"Fail"},
       {sty:"color: #1A7A0C;", txt:"OK"}];
     return "<span style=\""+markers[ok].sty+"\">"+markers[ok].txt+"</span>";
   }
   var fldinfo_hw = [
     hostfld,
     // Disk
     {name: "cpuarch",  title: "CPU Arch", type: "text", width: 55},
     {name: "cores",    title: "# Cores", type: "number", width: 45},
     
     {name: "cpuname",  title: "CPU", type: "text", width: 170},
     {name: "memsize",  title: "Mem (MB)", type: "number", width: 60},
     {name: "sysvendor",title: "System Vendor", type: "text", width: 120},
     {name: "sysmodel", title: "Model", type: "text", width: 120},
     {name: "prodver",  title: "Prod.Ver.", type: "text", width: 100},
     {name: "prodser",  title: "Prod.Ser.", type: "text", width: 100, itemTemplate: servtagcell}, // Link On Dell
     {name: "diskmod",  title: "Disk Model", type: "text", width: 120},
     {name: "diskrot",  title: "Disk Type", type: "text", width: 70, itemTemplate: rotcell},
     {name: "disksize", title: "Disk Size", type: "text", width: 70},
     {name: "diskvirt", title: "Virtual Disk", type: "text", width: 80, visible: 0}, // This is wrong most of the time
   ];
   var fldinfo_pkg = [
     hostfld,
     {name: "pkgcnt",  title: "# Pkgs", type: "number", width: 70},
   ];
   var fldinfo_rmgmt = [
     hostfld,
     // fldinfo_net[2],
     {name: "ipaddr",  title: "Rmgmt IP Addr", type: "text", width: 90, itemTemplate: rmgmtcell},
     {name: "rmhname",  title: "Rmgmt Host (DNS Res.)", type: "text", width: 120, itemTemplate: rmgmtcell}, // 
     fldinfo_net[5],
     
     // {name: "ipaddrtype",  title: "IP Addr Type", type: "text", width: 120}, // Redundant
     fldinfo_net[3],
     {name: "ulist",  title: "RMgmt Users", type: "text", width: 150},
     {name: "rfop",  title: "RF Info", type: "text", width: 50, itemTemplate: redfish_cell},
   ];
   var fldinfo_netprobe = [
     hostfld, // Need hn ?
     // itemTemplate: probeokcell
     {name: "ip",     title: "IP Addr", type: "text", width: 70},
     {name: "addrs",  title: "DNS Addresses", type: "text", width: 170, itemTemplate: dnsentcell},
     {name: "ipok",   title: "IP Ok",   type: "number", width: 40, itemTemplate: probeokcell},
     {name: "nameok", title: "Hostname Ok", type: "number", width: 40, itemTemplate: probeokcell},
     // {name: "macok",  title: "MAC Ok",  type: "number", width: 40, itemTemplate: probeokcell},
     {name: "ping",   title: "Ping Ok", type: "number", width: 40, itemTemplate: probeokcell},
     {name: "sshconn",title: "SSH Ok",  type: "number", width: 40, itemTemplate: probeokcell},
   ];
   // https://stackoverflow.com/questions/14224535/scaling-between-two-number-ranges
   function loads_cell(val, item_dummy) {
     if (!val) { return "-"; }
     // TODO: Calc proper color (by load. logarithmic ? light load = light color, high load = dark color)
     // load-to-Color rgb(143, 230, 22) // 0..255
     // Logarithmic
     function l2c(load) {
       // .log() result should be capped at ...
       let cap = 9.7;
       var log = Math.log(load) + 5;
       if (log > cap) { log = cap; }
       //console.log(load + " => " + log); // DEBUG
       var v = 10 - log;
       //console.log("  - " + v);
       var dec =  (v/10) * 255;
       //console.log("  - " + dec);
       var h = decimalToHex(Math.floor(dec));  // or "rgb("+dec+", "+dec+", "+dec+")";
       var fc = dec > 140 ? "#222222" : "#EEEEEE"; // Not: 127
       return {bg: "#"+h+h+h, text: fc}; // generated Color !
     }
     // https://stackoverflow.com/questions/57803/how-to-convert-decimal-to-hexadecimal-in-javascript
     function decimalToHex(d, padding) {
       var hex = Number(d).toString(16);
       padding = padding || 2; // typeof (padding) === "undefined" || padding === null ? padding = 2 : padding;
       while (hex.length < padding) { hex = "0" + hex; }
       return hex;
     }
     function l2c_ifhack(v2) {
         var col = '#EFEFEF';
         if (v2 > 0.4) { col = "#CCCCCC"; }
         if (v2 > 0.6) { col = "#BBBBBB"; }
         if (v2 > 1.5) { col = "#AAAAAA"; }
         if (v2 > 2)   { col = "#888888"; }
         return col;
     }
     //console.log("Custom 50: => "+l2c(50));
     //console.log("Custom 100: => "+l2c(100));
     return val.map(function (v) {
       var col = '#EFEFEF';
       var v2 = parseFloat(v);
       //col = l2c_ifhack(v2);
       //var refvals = [0.4, 0.6, 1.5, 2];
       //var cols = ["#CCCCCC", "#BBBBBB", "#BBBBBB"];
       col = l2c(v2);
       //console.log(col);
       return "<span class=\"load\" style=\"background-color: "+col.bg+"; color: "+col.text+"\">"+v+"</span>";
     }).join(" ");
   }
   /* Can be shared on any view having item.hname */
   function redfish_cell(val, item) {
     if (item.uptime && !item.hasrm) { return "-"; } // No Rmgmt info. Misbehaved when shared.
     if ((item.rmhname !== undefined) && !item.ipaddr) { return "-"; }
     return "<a class=\"rfop\" data-hname=\""+item.hname+"\" data-op='info' Xhref=\"/rf/info/"+item.hname+"\" data-tgt=\"rfdialog\">Info</a>" + '';
            //"<a class=\"rfop\" data-op='boot' Xhref=\"/rf/boot/"+item.hname+"?pxe\">PXE Boot</a>" +
            //"<a class=\"rfop\" data-op='boot' Xhref=\"/rf/boot/"+item.hname+"\">Reboot</a>";
   }
   var fldinfo_proc = [
     hostfld, // Need hn ?
     {name: "pcnt",     title: "# Procs", type: "number", width: 30},
     {name: "uptime",   title: "Uptime and Users", type: "text", width: 70},
     {name: "loads",    title: "Load Avg", type: "text", width: 50, visible: false},
     {name: "loadsarr",    title: "Load Avg", type: "text", width: 50, itemTemplate: loads_cell},
     {name: "ssherr",    title: "Probe Error (?)", type: "text", width: 100}, // 
     {name: "rfop",    title: "RedFish", type: "text", width: 50, itemTemplate: redfish_cell}, // 
   ];
   function hkeycell(value, item) {
     // 
     return value ? "OK" : "-";
   }
   var fldinfo_sshkeys = [
     hostfld, // Need hn ?
     // itemTemplate: probeokcell
     {name: "rsa_pub",     title: "RSA Pub",  type: "text", width: 50, itemTemplate: hkeycell},
     {name: "rsa_priv",    title: "RSA Priv", type: "text", width: 50, itemTemplate: hkeycell},
     {name: "dsa_pub",     title: "DSA Pub",  type: "text", width: 50, itemTemplate: hkeycell},
     {name: "dsa_priv",    title: "DSA Priv", type: "text", width: 50, itemTemplate: hkeycell},
     {name: "ecdsa_pub",   title: "ECDSA Pub",  type: "text", width: 50, itemTemplate: hkeycell},
     {name: "ecdsa_priv",  title: "ECDSA Priv", type: "text", width: 50, itemTemplate: hkeycell},
     {name: "ed25519_pub", title: "ED25519 Pub",  type: "text", width: 50, itemTemplate: hkeycell},
     {name: "ed25519_priv",title: "ED25519 Priv", type: "text", width: 50, itemTemplate: hkeycell}
     
   ];
   function dockidcell(value, item) {
     value = value.replace("sha256:", "");
     return value.substring(0, 12);
   }
   // Probe version from "Labels"
   function dockver(value, item) {
     if (!value) { return ""; }
     // Pretty sure it's object
     if (!value.version) { return "-"; }
     return value.version;
   }
   function docktags(value, item) {
     if (!value || !value.length) { return ""; }
     var cntstr = value.length > 1 ? "("+value.length+")" : "";
     return value[0] + cntstr;
   }
   /**/
   function haspackagecell(value, item) {
     if (value) { // item[value] . Does not work with dot-not.
       //return value;
       // return "<span title=\""+value+"\">"+"X"+"</span>";
       return "<i class=\"glyphicon glyphicon-check\"></i>";
    } 
     return "";
   }
   var fldinfo_dockerimg = [
     {name: "RepoTags",     title: "Tag(s)",  type: "text", width: 100, itemTemplate: docktags},
     {name: "Labels",     title: "Version",  type: "text", width: 50, itemTemplate: dockver},
     // To ISO
     {name: "Created",     title: "Created",  type: "text", width: 90, itemTemplate: tscell},
     {name: "Id", title: "Id", type: "text", width: 52, itemTemplate: dockidcell},
     {name: "ParentId", title: "ParentId", type: "text", width: 60, itemTemplate: dockidcell},
     {name: "Size",     title: "Size (MB)",  type: "text", width: 55, itemTemplate: function (value, item) { return value /1000000; }},
   ];
   var fldinfo_nfs = [
     {name: "path",     title: "Exported Path",  type: "text", width: 200, }, // itemTemplate: docktags
     {name: "iface",     title: "For Clients (by IP,mask, name, etc.)",  type: "text", width: 150, }, // itemTemplate: dockver
   ];
   function docker_sync(val, item) {
     return "<a class=\"docksync\" href=\"#\" data-image=\""+item.dockerimg+"\">Sync</a>";
   }
   
   // 
   var fldinfo_dockercat = [
     {name: "dockerlbl",     title: "Label",  type: "text", width: 80, }, // itemTemplate: docktags
     {name: "dockerimg",     title: "Image",  type: "text", width: 200, }, // itemTemplate: dockver
     {name: "vols",     title: "Required mounts",  type: "text", width: 100, },
     {name: "title",     title: "Description",  type: "text", width: 200, },
     {name: "sync",     title: "Actions",  type: "text", width: 30, itemTemplate: docker_sync, visible: true},
   ];
   function reset_defboot(val, item) {
     if (item.issym) { return ""; }
     // OLD:  data-macfname=\""+item.fname NEW:  data-macaddr=\""+item.macaddr
     return "<a class=\"defboot\" href=\"#\" data-macaddr=\""+item.macaddr+"\">Reset</a>";
   }
   function bootitem_info(val, item) {
     if (item.issym && item.size == 7) { return("<span style=\"color: #AAAAAA\">Default Boot Menu</span>"); }
     return "Custom Boot Target ("+item.bootlbl+")"; // Name ?
   }
   var fldinfo_pxelinux = [
     hostfld, // "Joined"
     {name: "fname",     title: "Boot Menu Filename",  type: "text", width: 80, css: "macaddr"},
     {name: "macaddr",   title: "Mac Addr", type: "text", width: 130, css: "macaddr"},
     {name: "size",      title: "Size",  type: "text", width: 200, itemTemplate: bootitem_info}, // 
     {name: "mtime",     title: "Created",  type: "text", width: 100, },
     //{name: "issym",   title: "Symlink ?",  type: "text", width: 200, },
     {name: "reset",     title: "Set Default",  type: "text", width: 30, itemTemplate: reset_defboot, visible: true},
   ];
   function bootmedia_status(val, item) {
     if (!item.filecnt) { return ("<span style=\"color: #C60C30\">Not mounted or present</span>"); }
     return "Mounted (w. "+item.filecnt+" items on top dir)";
   }
   function bootmedia_info(val, item) {
     if (!item.filecnt) { return (""); }
     return "<a class=\"mediainfo\" href=\"#\" data-path=\""+item.path+"\">Info</a>";
   }
   // Boot Dirs / ISO Media
   var fldinfo_bootmedia = [
     
     {name: "path",      title: "Boot Media Path",  type: "text", width: 80, },
     {name: "filecnt",   title: "File Cnt.", type: "text", width: 30, },
     {name: "status",    title: "Status",  type: "text", width: 100, itemTemplate: bootmedia_status}, // 
     {name: "actions",     title: "Info",  type: "text", width: 30, itemTemplate: bootmedia_info, visible: true},
   ];
   function uname_cell(val, item) {
     return "<span class=\"unamecell\" data-uid=\""+item.sAMAccountName+"\">"+val+"</span>";
   }
   var ldinfo_ldad = [
    // itemTemplate: ...
    {name: "givenName", title: "First Name", type: "text", width: 40, visible: false},
    {name: "sn", title: "Last Name", type: "text", width: 40, visible: false},
    {name: "displayName", title: "Name", type: "text", width: 100, itemTemplate: uname_cell},
    {name: "sAMAccountName", title: "Username", type: "text", width: 40},
    //{name: "uid", title: "Username (UNIX)", type: "text", width: 40, visible: false},
    {name: "mail", title: "Email Address", type: "text", width: 100},
    //{name: "title", title: "title", type: "text", width: 60},
    {name: "employeeNumber", title: "Emp #", type: "text", width: 40, visible: false},
    {name: "division", title: "Division", type: "text", width: 40},
    //{name: "telephoneNumber", title: "Phone", type: "text", width: 100, visible: false},
    // Locality
    {name: "streetAddress", title: "Street Address", type: "text", width: 40, visible: false},
    {name: "l", title: "City/Town", type: "text", width: 40, visible: false},
    {name: "st", title: "State/County", type: "text", width: 40, visible: false},
    {name: "co", title: "Country", type: "text", width: 40},
    // Needs parsing (;)
    //{name: "postalAddress", title: "Complete Post Address", type: "text", width: 40, visible: false},
    {name: "postalCode", title: "Area/Zip", type: "text", width: 40, visible: false},
    // Manager
    {name: "manager", title: "Manager", type: "text", width: 40, visible: false},
    //{name: "memberOf", title: "Member of", type: "text", width: 40, visible: false},
    // POSIX:
    //{name: "homeDirectory", title: "Home Directory", type: "text", width: 40, visible: false},
    //{name: "gecos"          title: "Description", type: "text", width: 200, visible: false},
    //{name: "uidNumber"      title: "UID Num.", type: "text", width: 30, visible: false},
    //{name: "gidNumber"      title: "GID Num.", type: "text", width: 30, visible: false},
    //{name: "loginShell"     title: "Shell", type: "text", width: 80, visible: false},
   ];
// Compare these to facts values
function ibmac_cell(val, item) {
    var sty = "";
    // Mangle case ?
    if (val != item.macaddr) { sty = "color: red;"; }
    return "<span style=\""+sty+"\">"+val+"</span>";
}
function ibip_cell(val, item) {
    var sty = "";
    if (val != item.ipaddr) { sty = "color: red;"; }
    return "<span style=\""+sty+"\">"+val+"</span>";
}
   function ibsync_cell(val, item) {
     if (!item.needsync) { return "--"; }
     
     return "<input class=\"syncbutt\" type=\"button\" data-hname=\""+item.hname+"\" value=\"Sync\" >";
   }
   var fldinfo_iblox = [
     hostfld, // "Joined"
     {name: "ipaddr",  title: "IP Addr", type: "text", width: 100},
     {name: "macaddr", title: "Mac Addr", type: "text", width: 110, css: "macaddr"},
     {name: "ipaddr_ib",  title: "IB: IP Addr", type: "text", width: 100, itemTemplate: ibip_cell},
     {name: "macaddr_ib", title: "IB: Mac Addr", type: "text", width: 110, css: "macaddr", itemTemplate: ibmac_cell},
     {name: "usedhcp", title: "IB: Use DHCP", type: "text", width: 20},
     {name: "boothost", title: "Boot/Next Server", type: "text", width: 120, Xvisible: false},
     {name: "nbp", title: "Boot File", type: "text", width: 80, Xvisible: false},
     // Need rethink. Most of time host is not known in IB
     {name: "sync", title: "Sync", type: "text", width: 30, visible: false, itemTemplate: ibsync_cell},

   ];
   function efena_cell(val, item) {
     var chk = item.ena ? "checked=checked" : "";
     return "<input class=\"efena\" type=\"checkbox\" data-hname=\""+item.hname+"\" data-rscname=\""+item.rscname+"\" "+chk+" disable=disabled>"; // 
     //return "???";
   }
   var fldinfo_eflow = [
     hostfld,
     {name: "rscname",  title: "Resource Name", type: "text", width: 120},
     {name: "pools",  title: "Resource Pools", type: "text", width: 120},
     {name: "desc",  title: "Description", type: "text", width: 150},
     // stepLimit
     {name: "steplimit",  title: "Step Limit", type: "text", width: 25},
     {name: "ena", title: "Enabled", type: "text", width: 25, Xvisible: false, itemTemplate: efena_cell},
   ];
   
   // TODO: Send sets as AoO, index by id
   var fldinfo = {"net": fldinfo_net, "dist": fldinfo_dist, "hw": fldinfo_hw, "pkg": fldinfo_pkg,
      "rmgmt": fldinfo_rmgmt, "netprobe" : fldinfo_netprobe, "proc": fldinfo_proc,
      "sshkeys" : fldinfo_sshkeys, "dockerimg": fldinfo_dockerimg, "nfsinfo" : fldinfo_nfs,
      "dockercat": fldinfo_dockercat, "pxelinux": fldinfo_pxelinux, "bootmedia": fldinfo_bootmedia, "ldad": ldinfo_ldad,
      "iblox":  fldinfo_iblox, "eflow": fldinfo_eflow
   };
   
