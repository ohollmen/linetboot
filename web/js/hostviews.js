"use strict;";
   // Note: jsgrid type(s) are mostly "widget" based: "text" (not string), "textarea", "number"
   // //autosearch: true, // Not in a field ?
   // Disp Name: title (js-grid,vue-table), displayName (ui-grid)
   // Visibility: visible (ui-grid,vue-table)
   // Value transform: callback(vue-table), cellTemplate (ui-grid) itemTemplate(cb in js-grid)
   // Sortability: sortField(vue-table, must set), All(ui-grid: sort: {direction(asc/desc), priority}, sortingAlgorithm: cb)
   // https://blog.logrocket.com/how-to-make-http-requests-like-a-pro-with-axios/ (Making simultaneous requests)
   
/**   # TODO
 
 Create emit/subscribe mechanism to (e.g.) setup link event handlers on grid
 (events.js / ee = EventEmitter();ee.emit("evname", data) ? Node only ?)
*/

   // All-hosts output types (Share betw. Serv and Client)
   // TODO: Use http://localhost:3000/allhostgen/
   /*
   var outtypes = [
     {"lbl": "barename", name: "Bare Host Names"},
     {"lbl": "addrname", name: "IP-Address, Hostname pairs"},
     {"lbl": "maclink", name: "MAC Address Symlinks"},
     {"lbl": "setup",   name: "Facts Gathering"},
     {"lbl": "pkgcoll", name: "Package List Extraction"},
     {"lbl": "rmgmtcoll", name: "Remote management info Extraction"},
     {"lbl": "sshkeyarch", name: "SSH Key archiving"}
   ];
   */
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
   // 
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
// Must be shared for event handler
var rmgmt_data = [];
var grps = [];
var datasets = {};
var ee = new EventEmitter(); // events processing.

function on_rmgmt_click(ev) {
  var tmpl = $("#rmgmtusers").html();
  // console.log("Ev:", ev, " Val:"); //  // , "td"
  var hname = $(ev.target).html(); // Can we get the whole entry (by one of custom field callbacks ?)
  var ent = rmgmt_data.filter(function (it) { return it.hname == hname; })[0];
  var output = Mustache.render(tmpl, ent); // {hname: hname}
  $( "#dialog" ).html(output);
  $( "#dialog" ).dialog(dopts);
}
/** Create Dialog related to single host with parametrized template.
* Can be called from event handler context, but does not work in event context.
* @param {string} tmplsel - Template (HTML) element selector (e.g. '#mytmpl')
* @todo Allow alternatively passing whole template content (by testing ^# or ^\. in tmplsel) ?
*/
//function host_dialog(hname, tmplsel) {
  
//}

/** Create dialog for view described in event elem.
*/
function on_docker_info(ev) {
  var dialogcb = function (pinfo, dialogsel) { // TODO: add (2nd) gridsel OR dialog id
    if (!pinfo || !Array.isArray(pinfo)) { console.log("No data set for grid"); return; }
    console.log("dialogcb: called (#-sel)" + dialogsel);
    // Select child ".fwgrid" of dialogsel elem and find out gridsel (id)
    var id = $("#"+ dialogsel + " .fwgrid").attr("id");
    console.log("jsGrid elem id: "+id);
    // 
    if (!fldinfo[dialogsel]) { alert("No grid info for '"+ dialogsel+"' "); return; }
    showgrid(id, pinfo, fldinfo[dialogsel]); // OLD(1st)gridsel ... "dockerimg"
    console.log("Call showgrid dialog CB ... #" + dialogsel);
    if (!dialogsel) { console.error("No dialog selector, no gui."); return; }
    $("#"+ dialogsel ).dialog(dopts_grid); // "#dockerimg"
  }
  
  //console.log("ARG[0]:"+ev);
  // Note: also the 
  var hn = ev.target.getAttribute("data-hname"); // Generic
  var tgt = ev.target.getAttribute("data-tgt");
  //console.log("DHNAME:"+hn+", data-tgt: " + tgt);
  // hn - from ev element
  // gridsel - grid selector (id) ... replace w. dialog
  if (tgt == 'dockerimg') { dockerinfo(hn, "dockerimg", dialogcb); } // OLD: gridsel
  else if (tgt == "nfsinfo") { nfsinfo(hn, "nfsinfo", dialogcb); return; } // alert("N/A");
  //showgrid(gridsel, response.data, fldinfo.net);
}

/** Display host details (Shared click handler for hostname click)
*/
function on_host_click(ev, barinfo) {
  // console.log("Ev:", ev, " Val:"); //  // , "td"
  var tmplsel = "#singlehost";
  var hname; // Get some other way than just html
  hname = $(ev.target).html(); // Can we get the whole entry (by one of custom field callbacks ?)
  // Try treating this as Chart.js event (w. barinfo Array)
  if (!hname && barinfo && Array.isArray(barinfo)) { hname = barinfo[0]._model.label; }
  
  
  var tmpl = $(tmplsel).html();
  if (!hname) { alert("No hostname !"); return; }
  // Lookup host
  var ent = db.hosts.filter(function (it) { return it.hname == hname; })[0];
  var output = Mustache.render(tmpl, ent); // {hname: hname}
  $( "#dialog" ).html(output);
  $( "#dialog" ).dialog(dopts);
}


// From UI vals ...
  function form_obj_fd (sel) {
    var fe = document.querySelector(sel); // "#ansform"
    var formData = new FormData(fe);
    // var fdp = formData.getAll(); // get(key) / getAll(somepara)
    var fdp = formData.values(); // entries()
    var obj = {};
    for(var pair of formData.entries()) { // entries()
      console.log(pair[0]+ ', '+ pair[1]); 
      //console.log(pair);
      obj[pair[0]] = pair[1];
    }
    return obj;
  }
  //console.log("Got UI FormData params:", fdp);
  
  // Form vals using serializeArray
  function form_obj(sel, arrattr) {
    var ismulti = {};
    arrattr = arrattr || [];
    arrattr.forEach(function (k) { ismulti[k] = 1; });
    var arr  = $(sel).serializeArray(); // serialize() gets one k=v pair
    var obj = {};
    // Could take either orientation: "not in yet" or "is multi"
    arr.forEach(function (it) {
      var k = it.name;
      var multi = ismulti[k];
      // Not in yet
      if (!obj[k]) {
        if (multi) { obj[k] = [it.value]; return; }
        obj[k] = it.value; // Assume scalar
      }
      // In already (not unique)
      else {
        if (multi || Array.isArray(obj[k])) { obj[k].push(it.value); return; }
        obj[k] = [obj[k]]; obj[k].push(it.value);  // Convert old scalar to array and push
      }
    });
    return obj;
  }
/** Show Ansible UI */
function ansishow(ev) {
  
  var tmpl = $("#ansrun").html();
  if (!tmpl) { return alert("No tmpl !"); }
  // var sets = ["aplays","aprofs"];
  var p = { hosts: db.hosts, groups: grps, aplays: datasets["aplays"], "aprofs": datasets["aprofs"] };
  console.log("Got to ansishow w. para: ", p);
  var output = Mustache.render(tmpl, p);
  $( "#dialog_ans" ).html(output);
  var dopts = {modal: true, width: 650, // See min,max versions
                    height: 600}
  $( "#dialog_ans" ).dialog(dopts);
  // Hook select-reset listeners
  $('#playbooks').change(function () {  $("#playprofile").val([""]); }); // alert("PB");
  $('#playprofile').change(function () { $("#playbooks").val([]);  }); // $("#playbooks:selected").removeAttr("selected");  alert("PProd");
}
/** Get values from UI and run ansible POST request.
* - ansrunhosts, ansrungroups
* - ..
* https://stackoverflow.com/questions/1857781/best-way-to-unselect-a-select-in-jquery
*/
function ansirun(ev) {
  var para = form_obj("#ansform", ["hostnames","hostgroups", "playbooks", ]); // "playprofile"
  console.log("Got UI params: ", JSON.stringify(para, null, 2) );
  //return;
  function is_not_given(v) {
    if (!v) { return 1; }
    if (Array.isArray(v) && !v.length) { return 1; }
    return 0;
  }
  
  if (is_not_given(para.playbooks) && is_not_given(para.playprofile)) { alert("Neither playbooks or playprofile given !"); return; }
  axios.post("/ansrun", para).then(function (response) {
    var rp = response.data;
    // TODO: Toaster
    console.log("Got Ansible run server resp: ", rp);
  });
  
}
var tabloadacts = [
  {"title": "Packages",    "elsel": "#tabs-4", "tsel":"", cb: pkg_stats, "url": "/hostpkgcounts"},
  {"title": "Groups",      "elsel": "#tabs-5", "tsel":"", cb: hostgroups, "url": "/groups"},
  {"title": "Remote Mgmt", "elsel": "#tabs-6", "tsel":"", cb: rmgmt, "url": "/hostrmgmt"},
  {"title": "NetProbe",    "elsel": "#tabs-63", "tsel":"", cb: probeinfo, "url": "/nettest"},
  {"title": "LoadProbe",   "elsel": "#tabs-64", "tsel":"", cb: loadprobeinfo, "url": "/proctest"},
  {"title": "Output Fmts", "elsel": "#tabs-65", "tsel":"", cb: outfmts, "url": "/allhostgen"},
  {"title": "Hostkeys",    "elsel": "#tabs-67", "tsel":"", cb: sshkeys, "url": "/ssh/keylist"},
  {"title": "PkgStat",     "elsel": "#tabs-68", "tsel":"", cb: pkgstat, "url":"/hostpkgstats"},
  {"title": "About ...",   "elsel": "#tabs-7", "tsel":"", cb: function () {}, "url": ""},
  //{"title": "", "elsel": "", "tsel":""},
];
var tabloadacts_idx = {};
tabloadacts.forEach(function (it) { tabloadacts_idx[it.elsel] = it; });
var dopts = {modal: true, width: 600, // See min,max versions
                    height: 500}; // show: {effect: "", duration: 1000}, hide: {}
// MUST have separate custom opts (wide grid)
// See min,max versions
var dopts_grid = {modal: true, width: 1000, height: 500};

window.onload = function () {
  // Setup Tabs
  $( "#tabs" ).tabs();
  $( "#tabs" ).tabs({
    // ui has: newTab, newPanel, oldTab, oldPanel
    activate: function( event, ui ) {
      //var tgt = ui.newTab['0'].attributes["aria-controls"]; // id of panel
      var tgt = ui.newPanel[0].id; // ui.newTab['0'].id; => Not valid
      console.log("Tab ("+tgt+") active ...NP:", tgt); // , " NP:",ui.newPanel[0].id
      // Do event forwarding ?
      var an = tabloadacts_idx["#"+tgt];
      if (!an) { console.error("No action node for:" + tgt); return; } // toastr.error("No Action node");
      console.log(an);
      an.cb();
    }
  });
  //var dataurls = ["/list", "/groups", "/hostpkgcounts", "/hostrmgmt", "/nettest", "/ssh/keylist"];
  // Also 2nd {params: {}}
  data_load('/anslist/play', 'aplays');
  data_load('/anslist/prof', 'aprofs');
  axios.get('/list')
  .then(function (response) {
    //console.log(response);
    db.hosts = response.data;
    
    // Immediate grids
    ee.on("on_jsGrid_net_done", function (d) {  }); // alert("Net Grid done: "+d.msg);
    ee.on("on_jsGrid_dist_done", function (d) {  });
    ee.on("on_jsGrid_hw_done", function (d) {  });
    // Others
    ee.on("on_jsGrid_rmgmt_done", function (d) { $("jsGrid_rmgmt .hostcell").click(on_rmgmt_click); });
    //  // Reload. TODO: Wait ...
    function on_probe_reload() {
      $("#jsGrid_probe").fadeOut();
      $("#reloadsym").removeClass().addClass("glyphicon glyphicon-hourglass");
      probeinfo();
    }
    ee.on("on_jsGrid_probe_done", function (d) {
      $("#jsGrid_probe").fadeIn(2000);
      $("#reloadsym").removeClass().addClass("glyphicon glyphicon-refresh");
      // Should hook these ONCE
      //$("#proberun").click(on_probe_reload);
      $("#proberun2").click(on_probe_reload);
    });
    // Docker
    ee.on("on_dockerimg_done", function (d) { $("#dockerimg").dialog(dopts_grid); });
    // DONOT: response.data.forEach(function (it) { it.diskrot = parseInt(it.diskrot); });
    
    // Shared data, different views
    showgrid("jsGrid_net", response.data, fldinfo.net);
    showgrid("jsGrid_dist", response.data, fldinfo.dist);
    showgrid("jsGrid_hw", response.data, fldinfo.hw);
    toastr.info("Grids loaded");
    // Tab populating handlers
    //pkg_stats(); // #tabs-4 Only now trigger fetch of pkg stats
    //hostgroups();// #tabs-5
    //rmgmt();     // #tabs-6  Was Unused: response.data
    //probeinfo(); // #tabs-63 Launches HTTP
    //outfmts();   // #tabs-65
    //sshkeys();   // #tabs-67 Launches HTTP (NO UI setup)
    //tabloadacts.forEach(function (it) { it.cb(); });
    // Dialog options (moved to bigger scope)
    
    // Hook Only after grid(s) created
    // $(".hostname").click(function (ev) {
    $(".hostcell").click(on_host_click);
    $(".drinfo").click(on_docker_info);
    $(".nfsinfo").click(on_docker_info);
    
    
  })
  .catch(function (error) { console.log(error); });
  
  
  $(document).on('keypress', function(ev){
    console.log(ev.originalEvent); // Dump
    // shiftKey, metaKey, ctrlKey
    //if (ev.originalEvent.charCode == 98) { console.log("Got key"); }
    //if (ev.which == 80 && e.ctrlKey) { console.log("ctrl + p pressed"); }
    if (ev.which == 13 && ev.ctrlKey) { ansishow(); }
    return false;
  });
  
  
  // Experimental docker info
  // works w. "localhost" (dockerd) on localhost Browser
  // Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource at http://192.168.1.141:4243/v1.24/images/json. (Reason: CORS header \u2018Access-Control-Allow-Origin\u2019 missing).
  
};

/////// Packages //////////////
var color = Chart.helpers.color;
var cmap = {
      // "Ubuntu":color('rgb(246, 223, 12)').alpha(0.5).rgbString(), // Yellow
      "Ubuntu": color('rgb(237, 52, 23)').alpha(0.8).rgbString(), // #DD4814
      "Debian": color('rgb(255, 99, 132)').alpha(0.5).rgbString(),
      "RedHat": color('rgb(180, 36, 36)').alpha(0.5).rgbString(),
      "CentOS": color('rgb(30, 130, 25)').alpha(0.5).rgbString()
    };
/** Transform AoO to Chart data
     * Generate cdata.datasets[0].data and shared cdata.labels into cdata.
    * @param pkginfo {array} - Package info (AoO) for all hosts
    * @param cdata {object} - Chart Data (structure) to populate with values and colors
    * @param cmap {object} - Option color mapping object (to signify distro by "distname")
    * Accesses outer scope Color map (cmap)
    */
    function chartdata(pkginfo, cdata, prop, cmap) {
      // var prop = "pkgcnt";
      cdata.labels = pkginfo.map(function (it) { return it.hname; });
      cdata.datasets[0].data = pkginfo.map(function (it) { return it[prop]; });
      // Lookup BG color for each bar
      if (cmap) {
        cdata.datasets[0].backgroundColor = pkginfo.map(function (it) { return cmap[it.distname] ? cmap[it.distname] : "#777777"; });
      }
    }
    // Debug Chart Click (detects particular bar)
    function onCC(ev, ent) {
      //alert(p1 + p2 + p3);
      console.log(ent);
      var hn = ent[0]._model.label;
      //console.log("Hostname: "+hn);
      //console.log(JSON.stringify(ent[0]._model, null, 2));
      //console.log(JSON.stringify(p2)); // Cyclic
    } // onCC
  /* load and Chart package statistics
   * https://www.chartjs.org/docs/latest/axes/cartesian/linear.html
   */
  function pkg_stats() {
  // Param: prop (for stat), label/name, scaling, canvas sel.
  var gscale = 1000;
  axios.get('/hostpkgcounts').then(function (response) {
    createchart(response, "Packages", "pkgcnt", 'canvas_pkg');
  } )
  .catch(function (error) { console.log(error); });
  
  gscale = 10;
  axios.get('/hostcpucounts').then(function (response) {
    createchart(response, "CPU:s", "numcpus", 'canvas_cpu');
  } )
  .catch(function (error) { console.log(error); });
  
  function createchart(response, label, prop, canvasid) {
    if (response.data.status == "err") { alert("Package stats error: " + response.data.msg); return; }
    function dclone(d) { return JSON.parse(JSON.stringify(d)); }
    var pkginfo = response.data.data; // console.log(response.data.data);
    
    // label: null displays as :"null" (). See legend: { display: false} below.
    var cdata = {labels: [], datasets: [{ "label": label, borderWidth: 1, data: [] }]}; // "Packages"
    // cdata.datasets[0].backgroundColor = color('rgb(255, 99, 132)').alpha(0.5).rgbString();
    var ctx = document.getElementById(canvasid).getContext('2d'); // 'canvas_pkg'
    chartdata(pkginfo, cdata, prop, cmap);
    // console.log(JSON.stringify(cdata, null, 2));
    // Position for 'label' of each dataset. 'top' / 'bottom'
    //title: {display: true,text: 'Chart.js Bar Chart'}
    // display: false - Important !!
    var scales2 = dclone(scales);
    if (gscale) { scales2.yAxes[0].ticks.suggestedMax = gscale; }
    var copts = { responsive: true, legend: {position: 'top', display: false}, scales: scales2, onClick: on_host_click}; // onCC
    //window.myBar =
    new Chart(ctx, { type: 'bar', data: cdata, options: copts });
  };
  } // pkg_stats
//var idx = {};
    //pkginfo.forEach(function (it) { idx[it.hname] = it.pkgcnt; }); // || 0 ?
    //db.hosts.forEach(function (it) { it.pkgcnt = idx[it.hname]; });
    //console.log(db.hosts); console.log(idx);
////////////////////// Groups ///////////
  function hostgroups() {
    axios.get('/groups').then(function (response) {
      grps = response.data; // AoOoAoO...
      //console.log(JSON.stringify(grps, null, 2));
      grps.forEach(function (g) {
        var harr = g.hosts;
        $('#tabs-5').append("<h2>"+g.name+" ("+ harr.length +")</h2>\n");
        $('#tabs-5').append("<div id=\"grp_"+ g.id +"\"></div>\n");
        showgrid("grp_"+g.id, harr, fldinfo_hw); // newt, hw,
      });
    })
    .catch(function (error) { console.log(error); });
  }
  // Create Remote management info (grid).
  // Note: hosts unused (!)
  function rmgmt() { // (hosts) ... was not used
    
    axios.get('/hostrmgmt').then(function (response) {
      // SHared global for event handler... on_rmgmt_click
      rmgmt_data = response.data; // TODO: .data
      // console.log("Remote Mgmt data: ", rmgmt_data);
      if (!rmgmt_data || !rmgmt_data.length) { alert("No rmgmt data"); return; } // Dialog
      // Merge sets: index
      // var hidx = {}; hosts.forEach(function (it) {hidx[it.hname] = it; });
      showgrid("jsGrid_rmgmt", rmgmt_data, fldinfo.rmgmt);
      // $("jsGrid_rmgmt .hostcell").click(on_rmgmt_click); // UI Setup
    })
    .catch(function (error) { console.log(error); });
  }
  // Do network geared probing for DNS, ping, SSH
  function probeinfo() {
    //console.log("Launch Probe ...");
    axios.get('/nettest').then(function (response) {
      var pinfo = response.data.data;
      // console.log("Probe data: ", pinfo);
      if (!pinfo || !pinfo.length) { alert("No Probe data"); return; }
      showgrid("jsGrid_probe", pinfo, fldinfo.probe);
      //$("#proberun").click(function () { probeinfo(); }); // Reload. TODO: Wait ...
    })
    .catch(function (error) { console.log(error); });
  }
  
  function loadprobeinfo() {
    //console.log("Launch Probe ...");
    axios.get('/proctest').then(function (response) {
      var pinfo = response.data.data;
      // console.log("Probe data: ", pinfo);
      if (!pinfo || !pinfo.length) { alert("No Load Probe data"); return; }
      showgrid("jsGrid_loadprobe", pinfo, fldinfo.proc);
      //$("#proberun").click(function () { probeinfo(); }); // Reload. TODO: Wait ...
    })
    .catch(function (error) { console.log(error); });
  }
  
  function sshkeys() {
    // console.log("Launch SSH KeyInfo ...");
    axios.get('/ssh/keylist').then(function (response) {
      var pinfo = response.data.data;
      //console.log("SSH Key data: ", pinfo);
      if (!pinfo || !pinfo.length) { alert("No SSH Key data"); return; }
      showgrid("jsGrid_sshkeys", pinfo, fldinfo.sshkeys);
      // $("#").click(function () { zzzzz(); }); // Reload. TODO: Wait ...
    })
    .catch(function (error) { console.log(error); });
  }
  /* Note: dot (".") i field name (here: package name, jsgrid: "name") causes a problem in grid
   * because of jsgrid dot-notation support.
  */
  function pkgstat() {
    // console.log("Launch Pkg stat ...");
    axios.get('/hostpkgstats').then(function (response) {
      var pinfo = response.data.data;
      var gdef = response.data.grid;
      console.log("Pkg data: ", pinfo);
      if (!pinfo || !pinfo.length) { alert("No SSH Key data"); return; }
      gdef.forEach(function (it) {
        if (it.name == 'hname') { return; }
        it.itemTemplate = haspackagecell;
      });
      showgrid("jsGrid_pkgstat", pinfo, gdef);
      
    })
    .catch(function (error) { console.log(error); });
  }
  
  // Output Gen
  function outfmts() {
    axios.get('/allhostgen').then(function (response) {
      var outtypes = response.data || [];
      var otmpl = document.getElementById("outputs").innerHTML;
      var olistout = Mustache.render(otmpl, {outtypes: outtypes});
      olistout += '<iframe id="cmdoutput" src="" width="640" height="500"></iframe>';
      document.getElementById("tabs-65").innerHTML = olistout;
      $('.outitem').click(function (ev) {
        var frame = document.getElementById("cmdoutput");
        console.log(ev.target);
        frame.src = ev.target.href;
        return false;
      });
    })
    .catch(function (error) { console.log(error); });
  }
  


/** Load dataset
* 
* data_load('/people', 'users'); // Store to datasets['users']
* data_load('/people', 'users', {grid: "jsGrid_users", gridflds: gridflds});
*/
function data_load(url, id, array, opts) {
  if (!url) { throw "data_load: No URL"; }
  axios.get(url)
  .then(function (response) {
    var info = response.data;
    
    if (!Array.isArray(info) && info.data) { info = info.data; } // Heuristic assumption
    if (!Array.isArray(info)) { console.log("Warning: final dataset is non-array ... not sure if this is okay (!) ..."); }
    console.log("Dataset ('"+id+"'):", info);
    if (!info || !info.length) { alert("No data from "+ url); return; }
    if (id && datasets) { datasets[id] = info; }
    //if (opts && opts.grid && opts.gridflds ) { showgrid(opts.grid, info, opts.gridflds); }
    // $("#").click(function () { zzzzz(); }); // Reload. TODO: Wait ...
  })
  .catch(function (error) { console.log(error); });
}
/** fetch docker info and pass tu UI-geared callback.
* @param hname {string} - Hostname
* @param gridsel {string} - Selector (id, "#...") for grid (TODO: dialogsel)
*/
function dockerinfo(hname, dialogsel, cb) { // gridsel
  var port = 4243;
  if (!hname) { console.error("No hostname (from ui) for docker info"); return; }
  if (!dialogsel) { console.error("No dialogsel to forward call to"); return;}
  console.log("Calling docker ...");
  axios.get('http://'+hname+':'+port+'/v1.24/images/json')
  .then(function (response) {
    var pinfo = response.data; // NO: data.data
    //console.log("Docker data: "+ JSON.stringify(pinfo, null, 2));
    if (!pinfo ) { alert("No data from " + hname); return; }
    if (!pinfo.length) { alert("No images found on " + hname); return; }
    console.log("dockerinfo: Creating grid to: '" + dialogsel + "' ... " + pinfo + ""); // gridsel
    cb(pinfo, dialogsel); // if (cb) { cb(pinfo, dialogsel); return; }
    //else { alert("No dialog callback ..."); }
    
    // OLD: showgrid(gridsel, pinfo, fldinfo.dockerimg); // TODO: Revive ?
  })
  .catch(function (error) { console.log(error); alert("No Docker info, "+ error); });
}

function nfsinfo(hname, dialogsel, cb) {
  // Load data
  // MOCKUP: return cb([], dialogsel);
  axios.get("/showmounts/" + hname)
  .then(function (response) {
    var pinfo = response.data;
    // console.log(pinfo);
    cb(pinfo, dialogsel); return;
  })
  .catch(function (error) { console.log(error); alert("No NFS info, "+ error); });
}

// $("#jsGrid").jsGrid("sort", field);
function showgrid (divid, griddata, fields) {
  if (!Array.isArray(griddata)) { alert("No Grid data " + divid); return; }
  if (!Array.isArray(fields)) { alert("No fields data " + divid); return; }
  console.log("showgrid: Generating grid into div (id): " + divid + " w. "+griddata.length+" items.");
  $("#" + divid).jsGrid({ // "#jsGrid"
    // TODO: Eliminating 100% makes 2 latter tabs out of 3 not show !
    width: "100%",
    //height: "400px",
    pageSize: 120,
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
  // Emit (done divid) !
  ee.emit("on_"+divid+"_done", {msg: "Hello!", divid: divid});
}
