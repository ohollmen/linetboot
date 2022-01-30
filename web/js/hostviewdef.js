var Intl;

var gridplug = {
  isodate: (val, item) => {
    if (!val || (typeof val != 'string')) { return ""; }
    return "<span title=\""+val+"\">"+val.substr(0, 10)+"<span>";
  },
  csum_short: (val, item) => {
    if (!val || (typeof val != 'string')) { return ""; }
    return "<span title=\""+val+"\">"+val.substr(0, 4)+"..."+val.substr(-4, 4)+"<span>";
  },
  arrcnt: (val, item) => {
    if (!Array.isArray(val)) { return ""; }
    return Array.length;
  },
  // Note: Assumes color to be dark enough to have (text) color: white
  coloring: (val, item) => {
    if (!val || (typeof val != 'string')) { return ""; }
    if (!item._coloring) { return val; }
    var col = item._coloring[val];
    return "<span style=\"background-color: "+col+"; color: white; display: block; border-radius: 3px; padding: 2px\">"+val+"</span>"; // 
  },
  arr_commas: (val, item) => {
    if (!Array.isArray(val)) { return ""; }
    return val.join(", ");
  }
};
// Filtering: Part of controller(js-grid) cellFilter:(ui-grid)
   function distrocell(value, item) {
     var img = "iconfinder_logo_brand_brands_logos_linux_3215592.svg"; // Default
     if (value == "Debian") { img = "iconfinder_debian_386459.svg"; }
     if (value == "Ubuntu") { img = "iconfinder_Ubuntu_2744987.svg"; }
     if (value == "RedHat") { img = "iconfinder_redhat_7353.png"; }
     if (value == "MacOSX") { img = "104490_apple_icon.svg"; }
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
     return value ? "<span class=\"drinfo\" data-tgt=\"dockerimg\" data-hname=\""+n+"\">Imgs</span>" +
     " / <span class=\"drinfo\" data-tgt=\"dockercont\" data-hname=\""+n+"\">Conts</span>" : "";
   }
   function hasnfscell(value, item) {
     var n = item.hname;
     return value ? "<span class=\"nfsinfo\" data-tgt=\"nfsinfo\" data-hname=\""+n+"\">NFS</span>" : "";
   }
   function bver_cell(val, item) {
     if (val && val.length > 10) { return(val.substr(0, 10)+".."); }
     return val ? val : "n/a";
    }
   // TODO: Populate dynamic fields separately (at server or client ?)
   var fldinfo_dist = [
     hostfld,
     // Distro
     // insertTemplate: "<img src='foo.png'> Hi"
     {name: "distname",  title: "Distro", type: "text", width: 80, itemTemplate: distrocell }, // css: "osicon"
     {name: "distver",   title: "Ver", type: "number", width: 50},
     {name: "kernelver", title: "Kernel", type: "text", width: 90},
     // Long lost ...
     {name: "biosver", title: "BIOS Ver.", type: "text", width: 45, itemTemplate: bver_cell},
     {name: "biosdate", title: "BIOS Date", type: "text", width: 45},
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
     fldinfo_net[4],
     // {name: "ipaddrtype",  title: "IP Addr Type", type: "text", width: 120}, // Redundant
     fldinfo_net[3],
     {name: "ulist",  title: "RMgmt Users", type: "text", width: 150},
     {name: "rfop",  title: "RF Info", type: "text", width: 50, itemTemplate: redfish_cell},
   ];
   function probeokcell(value, item) {
    // console.log("Got value:'" + value + "'");
    var ok = value ? 1 : 0;
    if (value == 2) { ok = 2; }
    var markers = [
      {sty:"color: white; background-color: #B42424;display: block; Xwidth: 100%;padding: 2px; border-radius: 3px;",txt:"Fail"},
      {sty:"color: #1A7A0C;", txt:"OK"},
      {sty:"color: white; background-color: #dfb319;display: block; Xwidth: 100%;padding: 2px; border-radius: 3px;", txt:"Skipped"}
    ];
    return "<span style=\""+markers[ok].sty+"\">"+markers[ok].txt+"</span>";
  }
  function sshokcell(value, item) {
    // console.log("Got value:'" + value + "'");
    var ok = value ? 1 : 0;
    var markers = [
      {sty:"color: white; background-color: #B42424;display: block; Xwidth: 100%;padding: 2px; border-radius: 3px;",txt:"Fail"},
      {sty:"color: #1A7A0C;", txt:"OK"}];
    var txt = markers[ok].txt;
    if (item.nossh) { txt = "Skipped"; } // Cancelled
    return "<span style=\""+markers[ok].sty+"\">"+txt+"</span>";
  }

   var fldinfo_netprobe = [
     hostfld, // Need hn ?
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
     // Additionally block with explicit flag
     if (item.norf) { return "-"; }
     return "<a class=\"rfop\" data-hname=\""+item.hname+"\" data-op='info' Xhref=\"/rf/info/"+item.hname+"\" data-tgt=\"rfdialog\">Info</a>" + '';
            //"<a class=\"rfop\" data-op='boot' Xhref=\"/rf/boot/"+item.hname+"?pxe\">PXE Boot</a>" +
            //"<a class=\"rfop\" data-op='boot' Xhref=\"/rf/boot/"+item.hname+"\">Reboot</a>";
   }
   function procps_cell(val, item) {
     // TODO: Image/Icon
     return "<span data-tgt=\"proclist\" data-hname=\""+item.hname+"\"class=\"procps\">Proc</span>";
   }
   var fldinfo_proc = [
     hostfld, // Need hn ?
     {name: "pcnt",     title: "# Procs", type: "number", width: 30},
     {name: "uptime",   title: "Uptime and Users", type: "text", width: 70},
     {name: "loads",    title: "Load Avg", type: "text", width: 50, visible: false},
     {name: "loadsarr",    title: "Load Avg", type: "text", width: 50, itemTemplate: loads_cell},
     {name: "ssherr",    title: "Probe Error (?)", type: "text", width: 100}, // 
     {name: "rfop",    title: "RedFish", type: "text", width: 50, itemTemplate: redfish_cell}, // 
     {name: "proc",    title: "Proc", type: "text", width: 50, itemTemplate: procps_cell}, // visible: false
   ];
   function hkeycell(value, item) {
     // 
     return value ? "OK" : "-";
   }
   function sshkeysfetch_cell(value, item) {
     var cnt = 0;
     // Note this is purposely off-by-one as first field is "hname" (not key type)
     // console.log("Got: "+ item[n.name]);
     fldinfo_sshkeys.forEach((n) => {  cnt += item[n.name] ? 1 : 0; }); // Short circuit / stop on first for ()
     if (cnt > 1) { return ""; } // return cnt;
     // Icon (TODO: Fetch/Restore). Give action name as data-op="fetch"
     return "<span class=\"sshkeyload\" data-hname=\""+item.hname+"\"><i class=\"glyphicon glyphicon-repeat\"></span>"; // -repeat -refresh
   }
   var fldinfo_sshkeys = [
     hostfld, // Need hn ?
     {name: "rsa_pub",     title: "RSA Pub",  type: "text", width: 50, itemTemplate: hkeycell},
     {name: "rsa_priv",    title: "RSA Priv", type: "text", width: 50, itemTemplate: hkeycell},
     {name: "dsa_pub",     title: "DSA Pub",  type: "text", width: 50, itemTemplate: hkeycell},
     {name: "dsa_priv",    title: "DSA Priv", type: "text", width: 50, itemTemplate: hkeycell},
     {name: "ecdsa_pub",   title: "ECDSA Pub",  type: "text", width: 50, itemTemplate: hkeycell},
     {name: "ecdsa_priv",  title: "ECDSA Priv", type: "text", width: 50, itemTemplate: hkeycell},
     {name: "ed25519_pub", title: "ED25519 Pub",  type: "text", width: 50, itemTemplate: hkeycell},
     {name: "ed25519_priv",title: "ED25519 Priv", type: "text", width: 50, itemTemplate: hkeycell},
     // TODO: Make sure right action occurs. Seems some Fetch restored ... glyphicon glyphicon-share-alt
     // glyphicon glyphicon-circle-arrow-left glyphicon glyphicon-circle-arrow-right
     // glyphicon glyphicon-save
     //{name: "actions",title: "Fetch", type: "text", width: 15, itemTemplate: sshkeysfetch_cell},
     
   ];
   function dockidcell(value, item) {
     value = value.replace("sha256:", "");
     return value.substring(0, 12);
   }
   // Probe version from "Labels"
   function dockver(value, item) {
     if (!value) { return ""; }
     if (Array.isArray(value)) { return ""; }
     // Pretty sure it's object
     //if (!value.version) { return "-"; }
     //return value.version;
     //var lblset = Object.keys(value)
    var lblset = ["maintainer", "description"].map((k) => { return k+": "+(value[k] ? value[k] : ""); }).join("<br>");
    return lblset;
   }
   function docktags(value, item) {
     if (!value || !value.length) {
       // Use RepoDigests for fallback (also an array), but parse
       var rd = item.RepoDigests;
       if (rd && Array.isArray(rd) && (rd.length > 0)) {
        var rdarr = rd[0].split('@');
        if (rdarr[0]) { return finalwrap(rdarr[0]); }
       }
       else { return ""; }
    } 
     // var cntstr = value.length > 1 ? "("+value.length+")" : "";
     if (!Array.isArray(value) || value.length < 1) { return ""; }
     return finalwrap(value[0]); // + cntstr;
     function finalwrap(durl) {
       var bn = durl;
       if (durl.match(/\//)) { var carr = durl.split(/\//); bn = carr.pop(); }
       return "<span title=\""+durl+"\">"+bn+"</span>";
     }
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
     // When null, could take path from "RepoDigests" (appends: ...@sha256:50717054ef7f3...)
     {name: "RepoTags",     title: "Tag(s)",  type: "text", width: 100, itemTemplate: docktags},
     // Object with k-v pairs (e.g. description, maintainer, license, name, vendor, ...)
     {name: "Labels",     title: "Labels",  type: "text", width: 60, itemTemplate: dockver},
     // To ISO
     {name: "Created",     title: "Created",  type: "text", width: 80, itemTemplate: tscell},
     {name: "Id", title: "Id", type: "text", width: 52, itemTemplate: dockidcell},
     {name: "ParentId", title: "ParentId", type: "text", width: 60, visible: false, itemTemplate: dockidcell},
     {name: "Size",     title: "Size (MB)",  type: "text", width: 55, itemTemplate: function (value, item) { return (value /1000000).toFixed(1); }},
   ];
   // Container
   function contimg_cell(val, item) {
     if (val && val.match(/^sha256:/)) { return val.substr(7, 12);  }
     return val;
   }
   function contcomm_cell(val, item) {
     if (val.length > 40) { return "<span title=\""+val+"\">"+val.substr(0, 40) + " ...<span>"; }
     return val;
   }
   var fldinfo_dockercont = [
    //{name: "RepoTags",     title: "Tag(s)",  type: "text", width: 100, itemTemplate: docktags},
    //{name: "Labels",     title: "Labels",  type: "text", width: 50, itemTemplate: null}, // Object (.maintainer)
    {name: "Image",   title: "Image (Name)",  type: "text", width: 40, itemTemplate: contimg_cell}, // OK (Has ver.)
    {name: "ImageID", title: "Image ID",  type: "text", width: 40, itemTemplate: dockidcell}, // OK
    {name: "Command", title: "Command",  type: "text", width: 100, itemTemplate: contcomm_cell}, // OK (truncate ?)
    // To ISO
    {name: "Created", title: "Created",  type: "text", width: 70, itemTemplate: tscell}, // OK
    {name: "Id",     title: "Cont. Id", type: "text", width: 40, itemTemplate: dockidcell}, // OK (cont id)
    {name: "State", title: "State", type: "text", width: 25, itemTemplate: null}, // OK
    //{name: "Status", title: "Status", type: "text", width: 30, itemTemplate: null}, // OK (Up N Months)
    {name: "Mounts", title: "Mnt", type: "text", width: 12, itemTemplate: function(val) { return val.length; }},
    {name: "Names",     title: "Name(s)",  type: "text", width: 50, itemTemplate: null}, // function (value, item) { return value /1000000; }
  ];
   /*
    * // Docker Containers
    * TODO: var fldinfo_dockercont = [];
    // Docker imager
    var fldinfo_dockerimager = [
      {name: "author",  title: "Author", type: "text", width: 50},
      {name: "desc",    title: "Description", type: "text", width: 50},
      {name: "plist",   title: "Package list", type: "text", width: 50}, // Icon to pop
      {name: "plfname", title: "Package list filename", type: "text", width: 50},
      {name: "image",   title: "Image Label", type: "text", width: 50},
      {name: "baseimage",title: "Base Image", type: "text", width: 50},
      {name: "vertag",  title: "Version", type: "text", width: 25},
      {name: "pkgtype", title: "PkgMgmt Type", type: "text", width: 25},
      {name: "extpkgs", title: "AdHoc Pkgs", type: "text", width: 25}, // Initially count ? Popup icon ?
      {name: "env",     title: "Environment", type: "text", width: 80},
      {name: "mkdir",   title: "Dirs to Create", type: "text", width: 80},
      {name: "links",   title: "SymLinks to Create", type: "text", width: 80},
    ]; */
   var fldinfo_nfs = [
     {name: "path",     title: "Exported Path",  type: "text", width: 200, }, // itemTemplate: docktags
     {name: "iface",     title: "For Clients (by IP,mask, name, etc.)",  type: "text", width: 150, }, // itemTemplate: dockver
   ];
   function docker_sync(val, item) {
     return "<a class=\"docksync\" href=\"#\" data-image=\""+item.dockerimg+"\">Sync</a>";
   }
   function docker_mnts(val, item) {
     if (!Array.isArray(val)) { return ""; }
     // class=\"dockermnt\"
     return val.map((v) => {return "<span style=\"padding-right: 5px;\">"+v+"</span>"; }).join(" ");
   }
   // 
   var fldinfo_dockercat = [
     {name: "dockerlbl",title: "Label",  type: "text", width: 80, }, // itemTemplate: docktags
     {name: "dockerimg",title: "Image",  type: "text", width: 200, }, // itemTemplate: dockver
     {name: "vols",     title: "Required mounts",  type: "text", width: 100, itemTemplate: docker_mnts},
     {name: "title",     title: "Description",  type: "text", width: 180, },
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
     if (item.loopdev) {return "<span class=\"icontext\">Mounted Loop device</span> <i class=\"glyphicon glyphicon-cd\"></i>";} //  // -cd / -record
     // All following are !item.loopdev
     if (!item.filecnt) { return ("<span class=\"icontext\" style=\"color: #C60C30\">Empty Dir</span> <i class=\"glyphicon glyphicon-question-sign\"></i>"); } // 
     //if (!item.filecnt) {}
     return "<span class=\"icontext\">Bare Directory (w. files)</span> <i class=\"glyphicon glyphicon-folder-open\"></i>"; // (w. "+item.filecnt+" items on top dir) //   // Also -close
   }
   function bootmedia_info(val, item) {
     if (!item.filecnt) { return (""); }
     return "<a class=\"mediainfo\" href=\"#\" data-path=\""+item.path+"\">Info</a>";
   }
   // Boot Dirs / ISO Media
   var fldinfo_bootmedia = [
     
     {name: "path",      title: "Boot Media Path",  type: "text", width: 40, },
     {name: "filecnt",   title: "File Cnt.", type: "text", width: 10, },
     {name: "status",    title: "Status",  type: "text", width: 50, itemTemplate: bootmedia_status}, // 
     //{name: "actions",     title: "Info",  type: "text", width: 30, itemTemplate: bootmedia_info, visible: true},
     // Additional "join" fields (from losetup res.)
     {name: "loopdev",   title: "Loop Device",  type: "text", width: 18, },
     {name: "imagefn",   title: "Image File (ISO)",  type: "text", width: 60, },
     {name: "size",      title: "Image Size",  type: "text", width: 10, },
   ];
   function uname_cell(val, item) {
     return "<span class=\"unamecell\" data-uid=\""+item.sAMAccountName+"\">"+val+"</span>";
   }
   var ldinfo_ldad = [
    // itemTemplate: ...
    {name: "givenName", title: "First Name", type: "text", width: 40, visible: false},
    {name: "sn", title: "Last Name", type: "text", width: 40, visible: false},
    {name: "displayName", title: "Name", type: "text", width: 80, itemTemplate: uname_cell},
    {name: "sAMAccountName", title: "Username", type: "text", width: 40},
    //{name: "uid", title: "Username (UNIX)", type: "text", width: 40, visible: false},
    {name: "mail", title: "Email Address", type: "text", width: 70},
    //{name: "title", title: "title", type: "text", width: 60},
    {name: "employeeNumber", title: "Emp #", type: "text", width: 40, visible: false},
    {name: "division", title: "Division", type: "text", width: 20},
    //{name: "telephoneNumber", title: "Phone", type: "text", width: 100, visible: false},
    // Locality
    {name: "streetAddress", title: "Street Address", type: "text", width: 40, visible: false},
    {name: "l", title: "City/Town", type: "text", width: 40, visible: true},
    {name: "st", title: "State/County", type: "text", width: 40, visible: true},
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
   // Note type: "text" forces toString() and cmp must be done using stringified form.
   function ibdhcp_cell(val, item) {
     if (val == "true") { return "<span style='font-weight: bold;'>"+val+"</span>"; }
     return "<span style='color: #888888;'>"+val+"</span>";
   }
   var fldinfo_iblox = [
     hostfld, // "Joined"
     {name: "ipaddr",  title: "IP Addr", type: "text", width: 100},
     {name: "macaddr", title: "Mac Addr", type: "text", width: 110, css: "macaddr"},
     {name: "ipaddr_ib",  title: "IB: IP Addr", type: "text", width: 100, itemTemplate: ibip_cell},
     {name: "macaddr_ib", title: "IB: Mac Addr", type: "text", width: 110, css: "macaddr", itemTemplate: ibmac_cell},
     {name: "usedhcp", title: "IB: Use DHCP", type: "text", width: 20, itemTemplate: ibdhcp_cell}, // Has bool
     {name: "boothost", title: "Boot/Next Server", type: "text", width: 120, visible: false},
     {name: "nbp", title: "Boot File", type: "text", width: 80, visible: false},
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
   var pss_state_map = { 'D':'NI-Sleep','R':'Run', 'S': 'Sleep', 'T':'Stop','t':'Stop(D)','W':'Page','X':'Dead','Z':'Zombie'};
   function pidlink_cell(val, item) {
     return "<span data-pid=\""+item.pid+"\" class=\"psact\" style=\"\">"+item.pid+"</span>";
   }
   function pstate_cell(val, item) {
     // styleX=\"display: block; color: red;\"
     return "<span class=\"pss pss_"+val+"\" >"+pss_state_map[val]+"</span>";
   }
   function pstime_cell(val, item) {
     // TODO: Color progressively by delta:
     //var dts = (Date().now()/1000) - val; // delta seconds // leave out "new" !
     // TODO: Coloring ? See: loads_cell (151 / 215)
     function l2c_ifhack(v2) {
      var col = '#FFFFFF';
      if (v2 > 86400) { col = "#CCCCCC"; } // 1d
      if (v2 > 86400 * 7) { col = "#BBBBBB"; } // 1w
      if (v2 > 86400 * 30) { col = "#AAAAAA"; }
      if (v2 > 86400 * 90)   { col = "#888888"; }
      return col;
     }
     var delta = (Date.now() / 1000) - val;
     var c = l2c_ifhack(delta); // Calc color
     // TODO: text color
     //return "<span style=\"background-color: "+c+"\">" + intlDate.format(new Date(val*1000)) + "</span>";
     return intlDate.format(new Date(val*1000));
     //return val;
   }
   function s2X(sec, div) {
     div = div || 1;
     return (sec / div).toFixed(2);
   }
   function pscputimecell(val, item) {
    // > 3days
    if (val > 259200) { return "<span title=\""+s2X(val, 86400)+" days.\">"+val+"</span>"; }
    // Hours
    if (val > 3600) { return "<span title=\""+s2X(val, 3600)+" hrs.\">"+val+"</span>"; }
    return val;
   }
   function psact_cell(val, item) {
     // 
     return "<span data-pid=\""+item.pid+"\" class=\"psact\">View</span>";
   }
   var intlopts = {year: 'numeric', month: 'numeric',day: 'numeric',
     hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,}; // timeZone: ""
   //var intlDate = new Intl.DateTimeFormat( undefined, intlopts );
   var intlDate = Intl.DateTimeFormat('sv-SE', intlopts);
   var fldinfo_proclist = [
      {name: "pid", title: "Pid", type: "number", width: 25, itemTemplate: pidlink_cell},
      {name: "ppid", title: "PPid", type: "number", width: 25},
      {name: "state", title: "State", type: "text", width: 25, itemTemplate: pstate_cell},
      {name: "owner", title: "User", type: "text", width: 45},
      {name: "cmd", title: "Cmd", type: "text", width: 60}, // Truncates ? (by procps ? procster ? ..?)
      {name: "cmdline", title: "Cmdline", type: "text", width: 150, visible: false}, // Or grab substr.
      
      {name: "rss",   title: "RSS(kB)", type: "number", width: 30},
      {name: "size",  title: "SIZE(kB)", type: "number", width: 30}, // , visible: false
      {name: "starttime", title: "Start Time", type: "text", width: 60, itemTemplate: pstime_cell},
      {name: "utime", title: "User T", type: "number", width: 25, itemTemplate: pscputimecell},
      {name: "stime", title: "Sys T", type: "number", width: 25, itemTemplate: pscputimecell},
      
      {name: "cpuid", title: "Core #", type: "number", width: 20},
      // Replaced w. pidlink
      {name: "act",   title: "View", type: "text", width: 30, visible: false, itemTemplate: psact_cell},
      
   ];
   function gstate_cell(val, item) {
     // "running", "notRunning", (others?)
     var col = (val == "running") ? "#00AA00" : "#AA0000";
     return "<span style=\"color: white; background-color: "+col+"; width: 100%; padding-left: 10px; padding-right: 10px;\">"+val+"</span>";
   }
   var fldinfo_esxi = [
     // 
     {name: "num",       title: "#", type: "number", width: 12, itemTemplate: null},
     {name: "name",       title: "Name", type: "text", width: 80, itemTemplate: null},
     {name: "guestId",       title: "Guest ID", type: "text", width: 60, itemTemplate: null},
     {name: "guestFullName", title: "OS Type", type: "text", width: 90, itemTemplate: null},
     {name: "annotation", title: "Notes", type: "text", width: 90, itemTemplate: null},
     {name: "numCPU", title: "#CPU", type: "number", width: 15, itemTemplate: null},
     {name: "memoryMB",       title: "Mem (MB)", type: "number", width: 20, itemTemplate: null},
     {name: "hostName", title: "Hostname", type: "text", width: 80, itemTemplate: null},
     {name: "ipAddress", title: "IP Addr", type: "text", width: 40, itemTemplate: null},
     // 
     {name: "guestState", title: "State", type: "text", width: 50, itemTemplate: gstate_cell},
   ];
   function depson_cell(val, item) {
     if (!val) { return "";}
     if (Array.isArray(val)) { return val.join("<br/>"); }
     return Object.keys(val).join("<br>\n");
   }
   var fldinfo_dcomposer = [
     {name: "servid",      title: "Service-Label", type: "text", width: 30, itemTemplate: null},
     {name: "image",       title: "Image", type: "text", width: 85, itemTemplate: null},
     {name: "depends_on",  title: "Depends ...", type: "text", width: 30, visible: false, itemTemplate: depson_cell},
     {name: "labels", title: "Labels", type: "text", width: 90, itemTemplate: (val,it) => { return Array.isArray(val) ? val.join("<br>\n") : ""; }},
     {name: "environment", title: "Env", type: "text", width: 90, itemTemplate: depson_cell},
     {name: "restart", title: "Restart on...", type: "text", width: 18, itemTemplate: null},
     
     {name: "volumes", title: "Volumes", type: "text", width: 70, itemTemplate: depson_cell},
     // labels - Array
     
     // command: array or string
   ];
   /*
   var fldinfo_appact = [
     {name: "name", title: "Action Name", type: "text", width: 50},
     {name: "path", title: "Route Lbl/Path", type: "text", width: 40},
     {name: "url", title: "Server URL", type: "text", width: 70},
     // Sub-tabs
     {name: "tabs", title: "Sub-Tabs", type: "text", width: 70},
     {name: "tmpl", title: "Template", type: "text", width: 70},
   ];
   */
   function iprof_mulval(val, item) {
     if (!Array.isArray(val)) { return "???"; }
     return val.join("<br>");
     
   }
   var fldinfo_iprofs = [
     {name: "id", title: "ID", type: "text", width: 15},
     {name: "domain", title: "DNS Domain", type: "text", width: 40},
     {name: "netmask", title: "Netmask", type: "text", width: 40},
     {name: "gateway", title: "Gateway", type: "text", width: 40},
     {name: "nameservers", title: "DNS Name Servers", type: "text", width: 40, itemTemplate: iprof_mulval},
     {name: "namesearch", title: "DNS Search Domains", type: "text", width: 50, itemTemplate: iprof_mulval},
     {name: "nisdomain", title: "NIS Domain", type: "text", width: 20},
     {name: "nisservers", title: "NIS Servers", type: "text", width: 50, itemTemplate: iprof_mulval},
     {name: "time_zone", title: "Timezone", type: "text", width: 30},
     {name: "locale", title: "Locale", type: "text", width: 30},
     {name: "keymap", title: "Keymap", type: "text", width: 10},
     // TODO: osid ? piuser ?
   ];
   function md5sum_trunc(val, item) {
     if (!val) { return ''; }
     return "<span title=\""+val+"\">"+val.substr(0, 4) + "..." + val.substr(28)+"</span>"; // 32 B
   }
   function boo_status(val, item) {
     val = val || "";
     var c = "#000000"; // Default / black
     if (!item.code) { return "<span id=\"bsstatus_"+item.lbl+"\" style=\"color: "+c+"\">"+""+"</span>"; }
     c = httpcode2color(item.code); // in js/hostviewhdlr.js
     return "<span id=\"bsstatus_"+item.lbl+"\" style=\"color: "+c+"\">"+item.status+"</span>";
   }
   // TODO: Detect also mounted status
   function haslocallycell (val, item) {
     var ccont = val ? "<i class=\"glyphicon glyphicon-check\"></i>" : "";
     if (item.mounted) { ccont += " (mnt)";}
     return ccont;
   }
   var fldinfo_bootables = [
    {name: "lbl", title: "Boot Label", type: "text", width: 25},
    {name: "name", title: "Name", type: "text", width: 70},
    // {name: "btype", title: "Boot Type", type: "text", width: 20}, // tool, inst, live
    {name: "url", title: "Image Download URL", type: "text", width: 100},
    {name: "md5sum", title: "Image MD5", type: "text", width: 20, itemTemplate: md5sum_trunc},
    
    {name: "kernel", title: "Kernel Path", type: "text", width: 70},
    {name: "initrd", title: "Initrd Path", type: "text", width: 70},
    {name: "present", title: "Have it ?", type: "text", width: 10, itemTemplate: haslocallycell}, // title: "Usable" ?
    {name: "status", title: "Status", type: "text", width: 20, itemTemplate: boo_status},
    // Popup commands to download, mount (if needed), test local download, create menu item
    //{name: "howto", title: "Howto", type: "text", width: 20, itemTemplate: function (val, item) {}}, // Help icon

   ];
   /** */
   function snapid_cell(val, item) {
     return "<span class=\"ccid\" data-snid=\""+val+"\">"+val+"</span>";
   }
   var fldinfo_covstr = [
    {"name": "snapshot","title": "Snapshot ID", type: "number", width: 10, itemTemplate: snapid_cell},
    //{"name": "streamName","title": "Stream", width: 50},
    {"name": "snapshotVersion", "title": "Version",  type: "text", width: 30},
    {"name": "snapshotTarget", "title": "Target", type: "text", width: 30},
    {"name": "snapshotDate","title": "Date", type: "text", width: 40},
    {"name": "buildTime","title": "Build time", type: "text", width: 25},
    {"name": "fileCount","title": "File Count",  type: "number", width: 15},
    // {"name": "snapshotDescription","title": "Description"},
    {"name": "totalDetected","title": "Total Detected",  type: "number", width: 15,},
    {"name": "newlyDetectedDefectCount","title": "Newly Detected",  type: "number", width: 15},
    {"name": "newlyEliminatedDefectCount","title": "Newly Eliminated",  type: "number", width: 15},
   ];
   function covfile_cell(val, item) {
     if (!val) { return ""; }
     var m;
     //var oval = val;
     var nval;
     if (m = val.match(/\/([^\/]+)$/)) { nval = m[1]; }
     else { nval = val.substr(-15); }
     return "<span title=\""+val+"\">"+nval+"</span>";
   }
   var fldinfo_coviss = [
    {"name": "cid",          "title": "CID",     type: "number", width: 10, }, // itemTemplate: snapid_cell
    {"name": "displayType",  "title": "Name",    type: "text", width: 45},
    {"name": "displayImpact","title": "Impact",  type: "text", width: 13},
    {"name": "status",       "title": "Status",  type: "text", width: 10}, // Color ! itemTemplate: snapid_cell
    {"name": "firstDetected","title": "First Det.", type: "text", width: 20}, // US Date itemTemplate: snapid_cell
    {"name": "owner",        "title": "Owner",      type: "text", width: 18}, // LDAP trans itemTemplate: snapid_cell. Note: "Unassigned"
    {"name": "classification","title": "Classif.",  type: "text", width: 20}, // "Unclassified"
    {"name": "severity",     "title": "Severity",    type: "text", width: 20}, // "Unspecified"
    {"name": "action",       "title": "Action",      type: "text", width: 20},
    
    {"name": "displayComponent","title": "Component", type: "text", width: 25},
    
    {"name": "displayCategory","title": "Category",  type: "text", width: 30,},
    {"name": "displayFile",    "title": "File",      type: "text", width: 30, itemTemplate: covfile_cell},
    {"name": "checker",        "title": "Checker",  type: "text", width: 20},
   ];
   var fldinfo_covcomp = [
     //
     {"name": "component",         "title": "Component", type: "text", width: 20, },
     {"name": "newCount",          "title": "New", type: "number", width: 15, },
     {"name": "outstandingCount",  "title": "Outstanding", type: "number", width: 15, },
     {"name": "totalCount",        "title": "Total", type: "number", width: 15, },
     {"name": "fixedCount",        "title": "Fixed", type: "number", width: 15, },
     {"name": "triagedCount",      "title": "Triaged", type: "number", width: 15, },
     //{"name": "component",         "title": "Component", type: "number", width: 20, },
     //{"name": "component",         "title": "Component", type: "number", width: 20, },
     //{"name": "component",         "title": "Component", type: "number", width: 20, },
   ];
   // Jenkins Jobs
   var fldinfo_jjobs = [
     //{"name": "name", "title": "Job Name",  type: "text", width: 40},
     //{"name": "url", "title": "Job URL",  type: "text", width: 80}, // url
     // color
   ];
   function deplydest_cell(val, item) {
     if (!val) { return ""; }
     if (!Array.isArray(val)) { return "???"; }
     return val.map((dd) => { return dd.dlbl + " ("+dd.userhost+")"; }).join(", "); // + " ("+dd.userhost+")"
   }
   var fldinfo_dproj = [
     {"name": "name",    "title": "Project Name",  type: "text", width: 40},
     {"name": "projlbl", "title": "Label",        type: "text", width: 20},
     {"name": "srcrepo", "title": "Repository",  type: "text", width: 60},
     {"name": "deploydest", "title": "Deploy Destinations",  type: "text", width: 60, itemTemplate: deplydest_cell},
   ];
   function subtabs_cell(val, item){
     if (!val){return "";}
     if(!Array.isArray(val)){return "???";}
     return val.join(", ");
   }
   function act_hdlr_cell(val, item) {
     if (typeof val == 'undefined') { return ""; }
     if (val == null) { return ""; } // Cannot read property 'toString' of null
     var src = val.toString();
     var m; var funcname = "???";
     if (typeof src == 'string' && (m = src.match(/function\s+(\w+)/))) {
       if (m) { funcname = m[1]; }
     }
     //return typeof val; // Raw func, causes JSGrid to exec
     //return val.toString(); // src
     return funcname;
   }
   // UI-Setup: Add click handler to invoke iframe w. data
   function appurl_cell(val, item) {
     if (!val) { return ""; }
     return "<span class=\"urlcell\" data-url=\""+val+"\">"+val+"</span>";
   }
   var fldinfo_actinfo = [
     {"name": "path",    "title": "Route Path",  type: "text", width: 20},
     {"name": "name",    "title": "Action Name", type: "text", width: 40},
     {"name": "elsel",   "title": "Tab Label",   type: "text", width: 20},
     {"name": "tabs",    "title": "Sub-tabs",    type: "text", width: 35, itemTemplate: subtabs_cell},
     {"name": "tmpl",    "title": "Template (lbl)", type: "text", width: 20},
     {"name": "url",     "title": "Data URL",    type: "text", width: 35, itemTemplate: appurl_cell},
     {"name": "gridid",  "title": "GridID",      type: "text", width: 25},
     {"name": "fsetid",  "title": "Field Defs (lbl)",  type: "text", width: 20},
     // Handlers
     {"name": "hdlr",    "title": "Handler",     type: "text", width: 25, itemTemplate: act_hdlr_cell},
     {"name": "uisetup", "title": "UI Setup",    type: "text", width: 25, itemTemplate: act_hdlr_cell},
     {"name": "urlpara", "title": "URLGen",      type: "text", width: 25, itemTemplate: act_hdlr_cell},
     {"name": "dataprep","title": "DataPrep",    type: "text", width: 25, itemTemplate: act_hdlr_cell},
     //{"name": "dataid",  "title": "Data ID - ???", type: "text", width: 25},
     {"name": "dsid",    "title": "Cached Data(set) id",  type: "text", width: 25}, // THIS is dataset id
     {"name": "dialogid",    "title": "Dialog ID",  type: "text", width: 25},
     //{"name": "help",    "title": "HelpDoc",  type: "text", width: 25},
     //{"name": "gdmem",    "title": "Grid Data Mem.",  type: "text", width: 25},
     //{"name": "",    "title": "",  type: "text", width: 25},
     //{"name": "",    "title": "",  type: "text", width: 25},
     //{"name": "",    "title": "",  type: "text", width: 25},
   ];
   // https://kubernetes.io/docs/tasks/administer-cluster/access-cluster-api/
   // https://nieldw.medium.com/curling-the-kubernetes-api-server-d7675cfc398c
   // "kind": "APIResourceList", "resources": [...]. Apis from 
   var fldinfo_kub_apis = [
     {"name": "name",      "title": "API Name",     type: "text", width: 15},
     {"name": "namespaced","title": "Has Namespace", type: "text", width: 10, itemTemplate: null}, // See how true/false works
     {"name": "kind",      "title": "Kind/Type",    type: "text", width: 10},
     {"name": "verbs",     "title": "Verbs",        type: "text", width: 30, itemTemplate: gridplug.arr_commas}, // Array of HTTP methods (? also has list, deletecollection !!)
     {"name": "shortNames","title": "Short names",  type: "text", width: 10},
     {"name": "storageVersionHash", "title": "Stor. Ver. Hash",  type: "text", width: 10},
   ];
   // This is ~2000 l. 7 comps list (namespaces/kube-system/pods).
   // Even if this needs to go through server side, try keep attrs the same. Under "items" ...
   // "namespace": "kube-system", repeating here
   function podcont_cell(val, item) {
     if (!val || !Array.isArray(val)) { return ""; }
     return val.length;
   }
   // See dockver
   function podcont_kv_cell(val, item) {
     if (!val) { return ""; }
     return Object.keys(val).map((k) => { return k + "="+ val[k]; }).join("<br>");
     //return "";
   }
   var fldinfo_kub_systempods = [
     {"name": "metadata.name",      "title": "Pod Name",  type: "text", width: 40},
     {"name": "metadata.uid",       "title": "UID",  type: "text", width: 17, itemTemplate: gridplug.csum_short}, // substr()
     // "creationTimestamp": "2022-01-16T03:40:48Z",
     {"name": "metadata.creationTimestamp",    "title": "Time",  type: "text", width: 15, itemTemplate: gridplug.isodate},
     // 
     {"name": "metadata.labels",    "title": "Labels",  type: "text", width: 20, itemTemplate: podcont_kv_cell},
     // Note: metadata.managedFields.manager (e.g. kube-controller-manager)... parent in Hierarchy (oabels.component = kube ... OR containes.name = kube ...)
     // spec
     {"name": "spec.volumes",        "title": "Vols",  type: "text", width: 20, itemTemplate: gridplug.arrcnt}, // podcont_cell -> gridplug.arrcnt
     // spec.containers - AoO - usually 1 esp. for system (w. O: name, image, livenessProbe (Obj), startupProbe
     // Note: spec.containers[0] gets to container (note singular)
     {"name": "container.name",      "title": "Container Name", type: "text", width: 20, itemTemplateXXX: podcont_cell},
     {"name": "container.volumeMounts", "title": "Volume Mounts", type: "text", width: 12, itemTemplate: gridplug.arrcnt}, // Some rep. of volumes (aggregate ?)
     // ???
     {"name": "container.env",       "title": "Env", type: "text", width: 20, itemTemplate: podcont_kv_cell},
     {"name": "spec.serviceAccount", "title": "Svc Account", type: "text", width: 20, itemTemplateXX: null},
     {"name": "spec.nodeName",       "title": "Node Name",  type: "text", width: 20}, // e.g. minikube
     // 
     {"name": "spec.priorityClassName",    "title": "Priority Class",  type: "text", width: 25},
     // {"name": "spec.preemptionPolicy",    "title": "Prior. Class",  type: "text", width: 20}, // PreemptLowerPriority
     // status
     {"name": "status.phase",       "title": "Phase",  type: "text", width: 15, itemTemplate: gridplug.coloring}, // Running 
     {"name": "status.conditions",  "title": "Conditions",  type: "text", width: 20, itemTemplate: gridplug.arrcnt}, // AoO (always 4?) w type: Initialize, Ready,
     {"name": "status.hostIP",      "title": "Host IP",  type: "text", width: 20}, // Also (sib) podIP, podIPs
     {"name": "status.startTime",   "title": "Start Time",  type: "text", width: 15, itemTemplate: gridplug.isodate},
     {"name": "status.qosClass",    "title": "qos Class",  type: "text", width: 20},
     // 
     //{"name": "status.containerStatuses[0].name",  "title": "Cont Stat Name",  type: "text", width: 20},
     
   ];
   var fldinfo_gerr_change = [
     {"name": "_number",     "title": "Number",    type: "number", width: 8},
     
     {"name": "project",     "title": "Project",   type: "text", width: 20},
     {"name": "branch",      "title": "Branch",    type: "text", width: 15},
     //{"name": "hashtags",     "title": "Hashtags",  type: "text", width: 20},
     {"name": "change_id",   "title": "Change ID",  type: "text", width: 12,  itemTemplate: gridplug.csum_short},
     {"name": "subject",     "title": "Subject",   type: "text", width: 50},
     {"name": "status",      "title": "Status",    type: "text", width: 10},
     {"name": "created",     "title": "Created",   type: "text", width: 12, itemTemplate: gridplug.isodate}, // Trunc
     {"name": "updated",     "title": "Updated",   type: "text", width: 12, itemTemplate: gridplug.isodate}, // trunc
     {"name": "mergeable",   "title": "MergeOK",   type: "text", width: 6}, // 
     {"name": "submittable", "title": "SubmitOK",  type: "text", width: 6},
     {"name": "insertions",  "title": "Added Lines", type: "text", width: 12},
     {"name": "deletions",   "title": "Deleted Lines",  type: "text", width: 12},
     
     {"name": "owner._account_id",     "title": "Acct ID",  type: "text", width: 10},
     
   ];
   // TODO: Send sets as AoO, index by id
   var fldinfo = {"net": fldinfo_net, "dist": fldinfo_dist, "hw": fldinfo_hw, "pkg": fldinfo_pkg,
      "rmgmt": fldinfo_rmgmt, "netprobe" : fldinfo_netprobe, "proc": fldinfo_proc,
      "sshkeys" : fldinfo_sshkeys, "dockerimg": fldinfo_dockerimg, "dockercont": fldinfo_dockercont, "nfsinfo" : fldinfo_nfs,
      "dockercat": fldinfo_dockercat, "pxelinux": fldinfo_pxelinux, "bootmedia": fldinfo_bootmedia, "ldad": ldinfo_ldad,
      "iblox":  fldinfo_iblox, "eflow": fldinfo_eflow, "proclist": fldinfo_proclist, "esxilist":fldinfo_esxi,
      "dcomposer":fldinfo_dcomposer,  "iprofs": fldinfo_iprofs, "bootables": fldinfo_bootables, // "appact": fldinfo_appact,
      "covstr": fldinfo_covstr, "coviss": fldinfo_coviss, "covcomp": fldinfo_covcomp,
      "jjobs": fldinfo_jjobs, "dproj": fldinfo_dproj, "actinfo": fldinfo_actinfo,
      "kubapis": fldinfo_kub_apis, "syspods": fldinfo_kub_systempods, "gerr_change": fldinfo_gerr_change,
   };
   
