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
     {name: "kernelver", title: "Kernel", type: "text", width: 150}
     //{name: "", title: "", type: "text"},
     // https://codepen.io/shunty/pen/Njywpz
     //
     //{name: "", title: "", type: "control", editButton: false, deleteButton: false}
     // {name: "foo", title: "Action !", type: "actionButton"} // Works
   ];
   var fldinfo_hw = [
     hostfld,
     // Disk
     {name: "cpuarch",  title: "CPU Arch", type: "text", width: 70},
     {name: "cores",    title: "# Cores", type: "number", width: 70},
     {name: "sysvendor",title: "System Vendor", type: "text", width: 120},
     {name: "prodver",  title: "Prod.Ver.", type: "text", width: 100},
     {name: "prodser",  title: "Prod.Ser.", type: "text", width: 100},
     {name: "diskmod",  title: "Disk Model", type: "text", width: 120},
     {name: "diskrot",  title: "Disk Type", type: "text", width: 70, itemTemplate: rotcell},
     {name: "disksize", title: "Disk Size", type: "text", width: 70},
     {name: "diskvirt", title: "Virtual Disk", type: "text", width: 80, visible: 0}, // This is wrong most of the time
   ];
   var fldinfo_pkg = [
     hostfld,
     {name: "pkgcnt",  title: "# Pkgs", type: "number", width: 70},
   ]
   var fldinfo = {"net": fldinfo_net, "dist": fldinfo_dist, "hw": fldinfo_hw, "pkg": fldinfo_pkg};
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
       if (!this.datakey) { throw "Data key not defined for filtering"; return; }
       if (!this[this.datakey]) { throw "Data key ("+this.datakey+") does not exist in controller"; return; }
       var myarr = this[this.datakey];
       if (!Array.isArray(myarr)) { throw "Data key ("+this.datakey+") does not exist in controler"; return; }
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
   
window.onload = function () {
  // Setup Tabs
  $( "#tabs" ).tabs();
  // Also 2nd {params: {}}
  axios.get('/list')
  .then(function (response) {
    // handle success
    //console.log(response);
    db.hosts = response.data;
    response.data[5].distname = "RedHat";
    response.data[6].distname = "";
    // DONOT: response.data.forEach(function (it) { it.diskrot = parseInt(it.diskrot); });
    showgrid("jsGrid_net", response.data, fldinfo.net);
    showgrid("jsGrid_dist", response.data, fldinfo.dist);
    showgrid("jsGrid_hw", response.data, fldinfo.hw);
    var dopts = {modal: true}; // show: {effect: "", duration: 1000}, hide: {}
    // Hook Only after grid created
    // $(".hostname").click(function (ev) {
    $(".hostcell").click(function (ev) {
      
      var tmpl = $("#singlehost").html();
      console.log("Ev:", ev, " Val:"); //  // , "td"
      var hname = $(ev.target).html(); // Can we get the whole entry (by one of custom field callbacks ?)
      var ent = db.hosts.filter(function (it) { return it.hname == hname; })[0];
      var output = Mustache.render(tmpl, ent); // {hname: hname}
      $( "#dialog" ).html(output);
      $( "#dialog" ).dialog(dopts);
    });
  })
  .catch(function (error) { console.log(error); });
  /////// Packages //////////////
  axios.get('/hostpkgcounts')
  .then(function (response) {
    if (response.data.status == "err") { alert("Package stats error: " + response.data.msg); return; }
    var pkginfo = response.data.data;
    console.log(response.data.data);
    var idx = {};
    response.data.data.forEach(function (it) { idx[it.hname] = it.pkgcnt; });
    db.hosts.forEach(function (it) { it.pkgcnt = idx[it.hname]; });
    //console.log(db.hosts); console.log(idx);
    var color = Chart.helpers.color;
    var cdata = {labels: [], datasets: [{label: "Packages", borderWidth: 1, data: []}]};
    cdata.datasets[0].backgroundColor = color('rgb(255, 99, 132)').alpha(0.5).rgbString();
    function chartdata(pkginfo, cdata) {
      cdata.labels = pkginfo.map(function (it) { return it.hname; });
      cdata.datasets[0].data = pkginfo.map(function (it) { return it.pkgcnt; });
    }
    var ctx = document.getElementById('canvas').getContext('2d');
    chartdata(pkginfo, cdata);
    console.log(JSON.stringify(cdata, null, 2));
    
    showgrid("jsGrid_pkg", db.hosts, fldinfo.pkg);
    window.myBar = new Chart(ctx, {
      type: 'bar',
      data: cdata,
      options: {
    	responsive: true,
	// Position for 'label' of each dataset.
    	legend: {position: 'top'} // 'top' / 'bottom'
    	//
    	//title: {display: true,text: 'Chart.js Bar Chart'}
      }
    });
  })
  .catch(function (error) { console.log(error); });
}

// $("#jsGrid").jsGrid("sort", field);
function showgrid (divid, griddata, fields) {
  $("#" + divid).jsGrid({ // "#jsGrid"
    // TODO: Eliminating 100% makes 2 latter tabs out of 3 not show !
    width: "100%",
    //height: "400px",
    pageSize: 50,
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
