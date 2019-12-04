"use strict;";
   // Note: type(s) are mostly "widget" based: "text" (not string), "textarea", "number"
   // //autosearch: true, // Not in a field ?
   // Disp Name: title (js-grid,vue-table), displayName (ui-grid)
   // Visibility: visible (ui-grid,vue-table)
   // Value transform: callback(vue-table), cellTemplate (ui-grid) itemTemplate(cb in js-grid)
   // Sortability: sortField(vue-table, must set), All(ui-grid: sort: {direction(asc/desc), priority}, sortingAlgorithm: cb)
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
   function servtagcell(value, item) {
     var dsurl = "https://www.dell.com/support/home/us/en/04/product-support/servicetag/";
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
     cont += "(" + aent.type + ")";
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
   var fldinfo_dist = [
     hostfld,
     // Distro
     // insertTemplate: "<img src='foo.png'> Hi"
     {name: "distname",  title: "Distro", type: "text", width: 80, itemTemplate: distrocell }, // css: "osicon"
     {name: "distver",   title: "Ver", type: "number", width: 50},
     {name: "kernelver", title: "Kernel", type: "text", width: 150},
     {name: "use", title: "Usage", type: "text", width: 100},
     {name: "loc", title: "Location", type: "text", width: 100},
     //{name: "", title: "", type: "text"},
     // https://codepen.io/shunty/pen/Njywpz
     //
     //{name: "", title: "", type: "control", editButton: false, deleteButton: false}
     // {name: "foo", title: "Action !", type: "actionButton"} // Works
   ];
   function rmgmtcell(value, item) {
     
     return value ? "<a href=\"https://" + value + "/\">" + value + "</a>" : "N/A" ;
   }
   function probeokcell(value, item) {
     console.log("Got value:'" + value + "'");
     var ok = value ? 1 : 0;
     var markers = [{col:"#B42424",txt:"Fail"},{col:"#1A7A0C", txt:"OK"}];
     return "<span style=\"color: "+markers[ok].col+"\">"+markers[ok].txt+"</span>"
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
     {name: "ipaddr",  title: "IP Addr", type: "text", width: 120, itemTemplate: rmgmtcell},
     fldinfo_net[5],
     
     {name: "ipaddrtype",  title: "IP Addr Type", type: "text", width: 120},
     fldinfo_net[3],
     {name: "ulist",  title: "RMgmt Users", type: "text", width: 150},
   ];
   var fldinfo_probe = [
     hostfld, // Need hn ?
     // itemTemplate: probeokcell
     {name: "ip",     title: "IP Addr", type: "text", width: 70},
     {name: "addrs",  title: "DNS Addresses", type: "text", width: 170, itemTemplate: dnsentcell},
     {name: "ipok",   title: "IP Ok", type: "number", width: 30, itemTemplate: probeokcell},
     {name: "nameok",  title: "Hostname Ok", type: "number", width: 30, itemTemplate: probeokcell},
     {name: "ping",  title: "Ping Ok", type: "number", width: 30, itemTemplate: probeokcell},
     {name: "sshconn",  title: "SSH Ok", type: "number", width: 30, itemTemplate: probeokcell},
   ];
   var fldinfo = {"net": fldinfo_net, "dist": fldinfo_dist, "hw": fldinfo_hw, "pkg": fldinfo_pkg,
      "rmgmt": fldinfo_rmgmt, "probe" : fldinfo_probe};
   // All-hosts output types
   var outtypes = [
     {"lbl": "barename", name: "Bare Host Names"},
     {"lbl": "addrname", name: "IP-Address, Hostname pairs"},
     {"lbl": "maclink", name: "MAC Address Symlinks"},
     {"lbl": "setup",   name: "Facts Gathering"},
     {"lbl": "pkgcoll", name: "Package List Extraction"},
     {"lbl": "rmgmtcoll", name: "Remote management info Extraction"}
   ];
   // Need to be inside some buildGrid
    var ActionButtonField = function(config) {
        //jsGrid.Field.call(this, config);
    };
    ActionButtonField.prototype = new jsGrid.Field({
      css: "hostname", // "font-weight: bold;",
      //itemTemplate: function (value,item) { return "<a href=\"#\">"+item.hname+"</a>"; }
      itemTemplate: function (value,item) { return item.hname; }
   });
   // jsGrid.fields.actionButton = ActionButtonField;
   
   function js_grid_filter (filter) {
       //console.log("Filter:" + JSON.stringify(filter));
       //console.log("This::", this);
       if (!this.datakey) { throw "Data key not defined for filtering";  } // return;
       if (!this[this.datakey]) { throw "Data key ("+this.datakey+") does not exist in controller"; } // return;
       var myarr = this[this.datakey];
       if (!Array.isArray(myarr)) { throw "Data key ("+this.datakey+") does not exist in controler"; } // return;
       var fkeys = Object.keys(filter);
       var debug = this.filterdebug || 0;
       if (debug) { console.log("Filter keys:" + JSON.stringify(fkeys)); }
       //OLD: var arr = $.grep(db.hosts, function(item)
       var arr = myarr.filter(function (item) { // db[this.datakey]
         //console.log("Host: ", item);
         //return {"hname": "foo"};
	 var fk; var keep = 1;
	 for (var i = 0;fk = fkeys[i];i++) {
	   var fval = filter[fk];
	   // console.log(fk +"="+fval);
	   // console.log("No Filter for " + fk);
	   if (!filter[fk]) {  continue; } // Filter is always string
	   var re = new RegExp(fval);
	   if (item[fk].match(re)) { debug && console.log("Match in val  " + item[fk]); continue; }
	   return 0;
	   //keep = 0; // NA
	 }
	 return 1;
       });
       if (debug) { console.log("After filter:" + arr.length + " items"); }
       return arr;
     }
   
   var db = {
     datakey: "hosts",
     filterdebug: 0,
     // The filter here is and object keyed by col names
     // this here is the db
     loadData: js_grid_filter
   };
   var scales = {
      yAxes: [
        {
          ticks: {
            beginAtZero: true, // NEW
            suggestedMin: 0,
            suggestedMax: 1000
          }
        }
      ],
      xAxes: [
        {
          ticks: {
          autoSkip: 0
          }
        }
      ]
    };
var rmgmt_data = [];

function on_rmgmt_click(ev) {
  var tmpl = $("#rmgmtusers").html();
  // console.log("Ev:", ev, " Val:"); //  // , "td"
  var hname = $(ev.target).html(); // Can we get the whole entry (by one of custom field callbacks ?)
  var ent = rmgmt_data.filter(function (it) { return it.hname == hname; })[0];
  var output = Mustache.render(tmpl, ent); // {hname: hname}
  $( "#dialog" ).html(output);
  $( "#dialog" ).dialog(dopts);
}

/** Shared click handler for host click.
*/
function on_host_click(ev, barinfo) {
      
      var tmpl = $("#singlehost").html();
      // console.log("Ev:", ev, " Val:"); //  // , "td"
      var hname;
      hname = $(ev.target).html(); // Can we get the whole entry (by one of custom field callbacks ?)
      // Try
      if (!hname && barinfo) { hname = barinfo[0]._model.label; }
      if (!hname) { alert("No hostname !"); return; }
      var ent = db.hosts.filter(function (it) { return it.hname == hname; })[0];
      var output = Mustache.render(tmpl, ent); // {hname: hname}
      $( "#dialog" ).html(output);
      $( "#dialog" ).dialog(dopts);
    }
var dopts = {modal: true, width: 600, // See min,max versions
                    height: 500}; // show: {effect: "", duration: 1000}, hide: {}
		    
window.onload = function () {
  // Setup Tabs
  $( "#tabs" ).tabs();
  // Also 2nd {params: {}}
  axios.get('/list')
  .then(function (response) {
    //console.log(response);
    db.hosts = response.data;
    pkg_stats(); // Only now trigger fetch of pkg stats
    // DONOT: response.data.forEach(function (it) { it.diskrot = parseInt(it.diskrot); });
    showgrid("jsGrid_net", response.data, fldinfo.net);
    showgrid("jsGrid_dist", response.data, fldinfo.dist);
    showgrid("jsGrid_hw", response.data, fldinfo.hw);
    rmgmt(response.data);
    probeinfo()
    // Dialog options (moved to bigger scope)
    
    // Hook Only after grid created
    // $(".hostname").click(function (ev) {
    $(".hostcell").click(on_host_click);
    
    
    
  })
  .catch(function (error) { console.log(error); });
  ////////////////////// Groups ///////////
  axios.get('/groups')
  .then(function (response) {
    var grps = response.data; // AoOoAoO...
    //console.log(JSON.stringify(grps, null, 2));
    grps.forEach(function (g) {
      var harr = g.hosts;
      $('#tabs-5').append("<h2>"+g.name+" ("+ harr.length +")</h2>\n");
      $('#tabs-5').append("<div id=\"grp_"+ g.id +"\"></div>\n");
      showgrid("grp_"+g.id, harr, fldinfo_hw); // newt, hw,
    });
  })
  .catch(function (error) { console.log(error); });
  // Output Gen
  var otmpl = document.getElementById("outputs").innerHTML;
  var olistout = Mustache.render(otmpl, {outtypes: outtypes});
  document.getElementById("tabs-65").innerHTML = olistout;
  /////// Packages //////////////
  function pkg_stats() {
  axios.get('/hostpkgcounts')
  .then(function (response) {
    if (response.data.status == "err") { alert("Package stats error: " + response.data.msg); return; }
    var pkginfo = response.data.data;
    // console.log(response.data.data);
    var idx = {};
    pkginfo.forEach(function (it) { idx[it.hname] = it.pkgcnt; }); // || 0 ?
    db.hosts.forEach(function (it) { it.pkgcnt = idx[it.hname]; });
    //console.log(db.hosts); console.log(idx);
    var color = Chart.helpers.color;
    var cdata = {labels: [], datasets: [{label: "Packages", borderWidth: 1, data: []}]};
    // cdata.datasets[0].backgroundColor = color('rgb(255, 99, 132)').alpha(0.5).rgbString();
    // Transform AoO to Chart data
    var cmap = {
      // "Ubuntu":color('rgb(246, 223, 12)').alpha(0.5).rgbString(), // Yellow
      "Ubuntu": color('rgb(237, 52, 23)').alpha(0.8).rgbString(), // #DD4814
      "Debian": color('rgb(255, 99, 132)').alpha(0.5).rgbString(),
      "RedHat": color('rgb(180, 36, 36)').alpha(0.5).rgbString(),
      "CentOS": color('rgb(30, 130, 25)').alpha(0.5).rgbString()
    };
    // Generate cdata.datasets[0].data into cdata
    function chartdata(pkginfo, cdata) {
      cdata.labels = pkginfo.map(function (it) { return it.hname; });
      cdata.datasets[0].data = pkginfo.map(function (it) { return it.pkgcnt; });
      // Lookup BG color for each bar
      cdata.datasets[0].backgroundColor = pkginfo.map(function (it) { return cmap[it.distname] ? cmap[it.distname] : "#777777"; });
    }
    var ctx = document.getElementById('canvas').getContext('2d');
    chartdata(pkginfo, cdata);
    // console.log(JSON.stringify(cdata, null, 2));
    
    // OLD: showgrid("jsGrid_pkg", db.hosts, fldinfo.pkg);
    // Position for 'label' of each dataset. 'top' / 'bottom'
    //title: {display: true,text: 'Chart.js Bar Chart'}
    // https://www.chartjs.org/docs/latest/axes/cartesian/linear.html
    // Chart Click (detects particular bar)
    function onCC(ev, ent) {
      //alert(p1 + p2 + p3);
      console.log(ent);
      var hn = ent[0]._model.label;
      console.log("Hostname: "+hn);
      console.log(JSON.stringify(ent[0]._model, null, 2));
      //console.log(JSON.stringify(p2)); // Cyclic
    } // 
    var copts = { responsive: true, legend: {position: 'top'}, scales: scales, onClick: on_host_click}; // onCC
    window.myBar = new Chart(ctx, { type: 'bar', data: cdata, options: copts });
  })
  .catch(function (error) { console.log(error); });
  
  } // pkg_stats
  // Create Remote management info (grid).
  function rmgmt(hosts) { // hosts not used
    
    axios.get('/hostrmgmt')
    .then(function (response) {
      
      rmgmt_data = response.data; // TODO: .data
      console.log("Remote Mgmt data: ", rmgmt_data);
      if (!rmgmt_data || !rmgmt_data.length) { alert("No rmgmt data"); return; } // Dialog
      // Merge sets: index
      // var hidx = {}; hosts.forEach(function (it) {hidx[it.hname] = it; });
      showgrid("jsGrid_rmgmt", rmgmt_data, fldinfo.rmgmt);
      $("jsGrid_rmgmt .hostcell").click(on_rmgmt_click);
    })
    .catch(function (error) { console.log(error); });
  }
  function probeinfo() {
    axios.get('/nettest')
    .then(function (response) {
      var pinfo = response.data.data;
      console.log("Probe data: ", pinfo);
      if (!pinfo || !pinfo.length) { alert("No Probe data"); return; }
      showgrid("jsGrid_probe", pinfo, fldinfo.probe);
      // $("jsGrid_probe .hostcell").click(on_rmgmt_click); // Reload
    })
    .catch(function (error) { console.log(error); });
  }
};

// $("#jsGrid").jsGrid("sort", field);
function showgrid (divid, griddata, fields) {
  $("#" + divid).jsGrid({ // "#jsGrid"
    // TODO: Eliminating 100% makes 2 latter tabs out of 3 not show !
    width: "100%",
    //height: "400px",
    pageSize: 100,
    //inserting: true,
    //editing: true,
    sorting: true,
    paging: true,
    filtering: true,
    
    data: griddata,
 
    controller: db,
    // rowClass: function (item,itemidx) { return "redhat"; },
    // rowClick: function (evpara) { alert("Row Click !"); },
    fields: fields
  });
}
