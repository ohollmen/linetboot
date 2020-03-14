// Filtering: Part of controller(js-grid) cellFilter:(ui-grid)
   function distrocell(value, item) {
     var img = "iconfinder_logo_brand_brands_logos_linux_3215592.svg"; // Default
     if (value == "Debian") { img = "iconfinder_debian_386459.svg"; }
     if (value == "Ubuntu") { img = "iconfinder_Ubuntu_2744987.svg"; }
     if (value == "RedHat") { img = "iconfinder_redhat_7353.png"; }
     
     return value + "<img src=\"img/"+img+"\" class=\"osicon\">"; // 
   }
   function rotcell(value, item) {
     if (typeof value == 'undefined' || value == "") { return "??"; }
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
   var hostfld = {name: "hname", title: "Host", type: "text", css: "hostcell", width: 200};
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
     return value ? "<span onclick=\"on_docker_info();\">Docker Info</span>" : "";
   }
   // TODO: Populate dynamic fields separately (at server)
   var fldinfo_dist = [
     hostfld,
     // Distro
     // insertTemplate: "<img src='foo.png'> Hi"
     {name: "distname",  title: "Distro", type: "text", width: 80, itemTemplate: distrocell }, // css: "osicon"
     {name: "distver",   title: "Ver", type: "number", width: 50},
     {name: "kernelver", title: "Kernel", type: "text", width: 150},
     // Dynamic
     {name: "use", title: "Usage", type: "text", width: 80},
     {name: "loc", title: "Location", type: "text", width: 80},
     {name: "dock", title: "Docker", type: "text", width: 40, itemTemplate: hasdockcell},
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
     return "<span style=\""+markers[ok].sty+"\">"+markers[ok].txt+"</span>"
   }
   var fldinfo_hw = [
     hostfld,
     // Disk
     {name: "cpuarch",  title: "CPU Arch", type: "text", width: 70},
     {name: "cores",    title: "# Cores", type: "number", width: 70},
     
     {name: "cpuname",  title: "CPU", type: "text", width: 170},
     {name: "memsize",  title: "Mem (MB)", type: "number", width: 70},
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
     {name: "ipaddr",  title: "Rmgmt IP Addr", type: "text", width: 120, itemTemplate: rmgmtcell},
     {name: "rmhname",  title: "Rmgmt Host", type: "text", width: 120, itemTemplate: rmgmtcell}, // 
     fldinfo_net[5],
     
     // {name: "ipaddrtype",  title: "IP Addr Type", type: "text", width: 120}, // Redundant
     fldinfo_net[3],
     {name: "ulist",  title: "RMgmt Users", type: "text", width: 150},
   ];
   var fldinfo_probe = [
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
   var fldinfo_dockerimg = [
     {name: "RepoTags",     title: "Tag(s)",  type: "text", width: 100, itemTemplate: docktags},
     {name: "Labels",     title: "Version",  type: "text", width: 50, itemTemplate: dockver},
     // To ISO
     {name: "Created",     title: "Created",  type: "text", width: 100, itemTemplate: tscell},
     {name: "Id", title: "Id", type: "text", width: 60, itemTemplate: dockidcell},
     {name: "ParentId", title: "ParentId", type: "text", width: 60, itemTemplate: dockidcell},
     {name: "Size",     title: "Size (MB)",  type: "text", width: 100, itemTemplate: function (value, item) { return value /1000000; }},
   ];
   // TODO: Send sets as AoO, index by id
   var fldinfo = {"net": fldinfo_net, "dist": fldinfo_dist, "hw": fldinfo_hw, "pkg": fldinfo_pkg,
      "rmgmt": fldinfo_rmgmt, "probe" : fldinfo_probe, "sshkeys" : fldinfo_sshkeys, "dockerimg": fldinfo_dockerimg
   };
   
