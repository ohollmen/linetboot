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
       if (!Array.isArray(myarr)) { throw "Data key ("+this.datakey+") does not exist in controller"; } // return;
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

/** Create dialog+grid for host and view described in event elem (by data-hname, data-tgt).
 * The "data-tgt" attribute (For now..) on event target el. determines the
 * specific handler called from here (by if-elsing, todo: model).
 * This func: dispatch to custom fetcher -> custom fetcher -> dialogcb (here), calls showgrid()
 * Note: 
*/
function on_docker_info(ev) { // TODO:
  var actsmodel = [ // Dialogs. TODO: Add gridid for grid based views
    {tgtid: "dockerimg", dcb: dockerinfo, grid: null},
    {tgtid: "nfsinfo",   dcb: nfsinfo, },
    {tgtid: "rfdialog",  dcb: rfinfo, },
    {tgtid: "proclist",  dcb: procinfo, grid: "jsGrid_procs"},
  ];
  // Final dialog handler. The 2nd param of if-else dispatched calls at bottom come as 2nd (dialogsel) here.
  // Works both as grid (cache index-object) and dialog (DOM-id) selector id
  var dialogcb = function (pinfo, dialogsel) { // TODO: add (2nd) gridsel OR dialog id
    if (!pinfo || !Array.isArray(pinfo)) { console.log("No data set for grid"); return; }
    console.log("dialogcb: called (#-sel) dialogsel:" + dialogsel); // e.g. proclist
    // Select child ".fwgrid" of dialogsel elem and find out gridsel (id)
    // class fwgrid is on grid-wrapping div-element
    var id = $("#"+ dialogsel + " .fwgrid").attr("id");
    console.log("jsGrid elem id: "+id);
    if (!id) { toastr.error("No grid id found from dialog by id: "+dialogsel); return; }
    // 
    if (!fldinfo[dialogsel]) { alert("No grid info for '"+ dialogsel+"' "); return; }
    showgrid(id, pinfo, fldinfo[dialogsel]); // OLD(1st)gridsel ... "dockerimg"
    console.log("Call showgrid dialog CB ... #" + dialogsel);
    if (!dialogsel) { console.error("No dialog selector, no gui."); return; }
    $("#"+ dialogsel ).dialog(dopts_grid); // "#dockerimg"
    // Hook UI handlers by  dialogsel (from ui-setup cb mapping below)
    // alert("Got setup");
    if (uisetup[dialogsel]) { uisetup[dialogsel](pinfo);  } // Pass ...?
  }
  // Process *grid* UI - hook additional UI actions.
  // If further 
  var uisetup = {"proclist": (pinfo) => {
      
      $('.psact').click(function (ev) {
        var pid = this.dataset.pid;
        // Where to get process ?
        //toastr.info("Find: "+pid+ "..."); // Distraction
        var proc = pinfo.find((p) => { return p.pid == pid; });
        var proc2 = rapp.dclone(proc); // For extending for template
        proc2.stateview = pstate_cell(proc2.state, proc2);
        proc2.starttimeview = pstime_cell(proc2.starttime, proc2);
        console.log("Show:", proc2);
        var out = rapp.templated("process", proc2, "procdialog");
        
        var dopts = {modal: true, width: 650, height: 600};
        $("#procdialog").dialog(dopts);
        // Hook Buttons pkill, pgkill. Must have host,pid
        $('#pkill').click((jev) => {
          // Check role
          var bel = document.getElementById("pkill");
          // Note: this.dataset does behave differently (hname not avail !?)
          if (!bel.dataset) { return alert("No dataset"); }
          var pi = {hname: bel.dataset.hname, pid: bel.dataset.pid};
          console.log("PI:", bel.dataset); // this.dataset is DOMStringMap
          toastr.info("Should kill "+pi.hname+" Proc: "+pi.pid);
          //return;
          axios.get("http://"+pi.hname+":8181/kill/"+pid).then((resp) => {
            console.log(resp.data);
            toastr.info("Killed  "+pi.hname+" Proc: "+pi.pid+ "!");
            // Close
            $("#procdialog").dialog("close");
            // Reload ps listing dialog OR possibly data only ()
            //procinfo(pi.hname, "proclist", dialogcb);
          }).catch((err) => {
            console.error("Kill error: "+err);
          });
        });
      });
    }
  };
  //console.log("ARG[0]:"+ev);
  // Note: also the 
  var hn  = ev.target.getAttribute("data-hname"); // Hostname (to do op on)
  var tgt = ev.target.getAttribute("data-tgt"); // id-lbl 
  console.log("Dlg-HNAME:"+hn+", data-tgt: " + tgt);
  // hn - from ev element
  // gridsel - grid/dialog selector (id) (from data-tgt=...)... replace w. dialog
  // dialogcb - dialogcb
  if      (tgt == 'dockerimg') { dockerinfo(hn, "dockerimg", dialogcb); } // OLD: gridsel
  else if (tgt == "nfsinfo")   { nfsinfo(hn, "nfsinfo", dialogcb); return; } // alert("N/A");
  else if (tgt == "rfdialog")  { rfinfo(hn, "rfdialog", dialogcb); return; }
  else if (tgt == "proclist")  { procinfo(hn, "proclist", dialogcb); }
  //showgrid(gridsel, response.data, fldinfo.net);
}

/** Display host details (Shared click handler for hostname click).
*/
function on_host_click(ev, barinfo) {
  // console.log("Ev:", ev, " Val:"); //  // , "td"
  var tmplsel = "#singlehost";
  var hname; // Get some other way than just html (data-hname="+e.hname+") ... ev.target.dataset.hname;
  hname = $(ev.target).html(); // Can we get the whole entry (by one of custom field callbacks ?)
  // Try treating this as Chart.js event (w. barinfo Array)
  if (!hname && barinfo && Array.isArray(barinfo)) { hname = barinfo[0]._model.label; }
  if (!hname) { alert("No hostname !"); return; }
  // Lookup host
  var ent = db.hosts.filter(function (it) { return it.hname == hname; })[0];
  if (!ent) { return alert("No host ent by name "+ hname); }
  //var tmpl = $(tmplsel).html();
  //var output = Mustache.render(tmpl, ent); // {hname: hname}
  //$( "#dialog" ).html(output);
  rapp.templated('singlehost', ent, 'dialog');
  
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
  // var sets = ["aplays","aprofs"];
  // OLD: groups: grps
  var p = { hosts: db.hosts, groups: datasets["grps"], aplays: datasets["aplays"], "aprofs": datasets["aprofs"] };
  //var tmpl = $("#ansrun").html();
  //if (!tmpl) { return alert("No tmpl !"); }
  //console.log("Got to ansishow w. para: ", p);
  //var output = Mustache.render(tmpl, p);
  var output = rapp.templated('ansrun', p);
  $( "#dialog_ans" ).html(output);
  var dopts = {modal: true, width: 650, height: 600}; // See also min,max versions
  $( "#dialog_ans" ).dialog(dopts);
  
  // Hook select-reset listeners
  function ansui_setup() {
    $('#playbooks').change(function () {  $("#playprofile").val([""]); }); // alert("PB");
    $('#playprofile').change(function () { $("#playbooks").val([]);  }); // $("#playbooks:selected").removeAttr("selected");  alert("PProd");
    $('#anssend').click(ansirun);
  }
  ansui_setup();
}
/** Get values from UI and run ansible POST request.
* - ansrunhosts, ansrungroups
* - ..
* https://stackoverflow.com/questions/1857781/best-way-to-unselect-a-select-in-jquery
*/
function ansirun(jev) {
  // Lock immediately
  var but = jev.originalEvent.target;
  //$(but).click(function () {});
  $(but).attr("disabled", "disabled");
  var para = form_obj("#ansform", ["hostnames","hostgroups", "playbooks", ]); // "playprofile"
  console.log("Got UI params: ", JSON.stringify(para, null, 2) );
  console.log("JEV:",jev);
  //return;
  function is_not_given(v) {
    if (!v) { return 1; }
    if (Array.isArray(v) && !v.length) { return 1; }
    return 0;
  }
  
  if (is_not_given(para.playbooks) && is_not_given(para.playprofile)) { alert("Neither playbooks or playprofile given !"); return; }
  axios.post("/ansrun", para).then(function (resp) {
    var rp = resp.data;
    if (!resp.headers["content-type"].match(/json/)) { return alert("ansrun: Non-JSON response"); }
    if (!rp) { return alert("No ansible response !"); }
    $(but).removeAttr("disabled");
    // TODO: Toaster
    if (rp.status == 'err') { return toastr.error(rp.msg); }
    toastr.info(rp.msg);
    console.log("Got Ansible run server resp: ", rp);
    // Unlock element
    //$(but).click(ansirun);
    
  });
  return false;
}

function tabsetview(ev, act) {
  function gettabinfo(elsel) {
    var ti = tabloadacts.filter((it) => { return it.elsel == elsel; })[0];
    return ti;
  }
  if (!act.tabs) { return alert("tabsetview: Action using tabsetview should have 'tabs'" + JSON.stringify(act)); }
  if (!Array.isArray(act.tabs)) { return alert("tabsetview: tabs should be an array"); }
  //alert("tabsetview: Create tabset: "+act.tabs.join(', '));
  
  //function tabs_get(tabselarr) {
  var tabs = tabloadacts.filter((ti) => {
    //console.log("Find "+ti.elsel+" from ", act.tabs);
    // Auto filters missing entries (?!)
    return act.tabs.includes(ti.elsel);
    });
  //  return tabs;
  //}
  console.log("tabsetview: Got "+tabs.length + " items for tabs");
  //return;
  //act.tabs.forEach((ti) => {});
  // Setup router div to contain tab structure
  $('#routerdiv').html("<div id=\"tabsnest\"></div>");
  $('#tabsnest').html( webview.tabs(tabs, null, {idattr: "elsel"}) );
  $( "#tabsnest" ).tabs({active: 1});
  $( "#tabsnest" ).tabs({ activate: ontabactivate });
  $( "#tabsnest" ).tabs("option", "active", 0 );
  // Set click handler !
  
}

// Converted to more action-like: title => name
// Note: template/tamplating might be of early (at tab creation) or late (at data load) type.
// For now late templated should have tmpl: .. to false val and do templating themselves (because early templating is automatic by tmpl).
// Allow "path" attribute to indicate a routable item and "elsel" a tabbed item
var tabloadacts = [
  {"name": "Basic Info", "path":"basicinfo", tabs: ["tabs-1","tabs-2","tabs-3"], hdlr: tabsetview}, // NEW(tabset)
  // Non-routables
  {"name": "Networking",  "elsel": "tabs-1", "tmpl":"simplegrid", hdlr: simplegrid_cd, "dataid": "net", gridid: "jsGrid_net", uisetup: osview_guisetup}, // url: "/list" (All 3)
  {"name": "Hardware",    "elsel": "tabs-2", "tmpl":"simplegrid", hdlr: simplegrid_cd, "dataid": "hw", gridid: "jsGrid_hw", uisetup: osview_guisetup},
  {"name": "OS/Version",  "elsel": "tabs-3", "tmpl":"simplegrid", hdlr: simplegrid_cd, "dataid": "dist", gridid: "jsGrid_dist", uisetup: osview_guisetup}, // Last could have hdlr ?
  //NONEED: {"name": "Reports", "path":"XXXXXXXX", tabs: ["tabs-X","tabs-Y","tabs-Z"], hdlr: tabsetview},
  {"name": "Reports",     "elsel": "tabs-4",  "tmpl":"reports", hdlr: pkg_stats, "url": "/hostpkgcounts", gridid: null, "path": "reports"}, // DUAL
  {"name": "Groups",      "elsel": "tabs-5",  "tmpl":null,      hdlr: hostgroups, "url": "/groups", gridid: null, path: "groups"},
  {"name": "Remote ...",  "path":"remoteviews", tabs: ["tabs-6","tabs-63","tabs-64"], hdlr: tabsetview}, // NEW(tabset)
  {"name": "Remote Mgmt", "elsel": "tabs-6",  "tmpl":"simplegrid", hdlr: rmgmt, "url": "/hostrmgmt", gridid: "jsGrid_rmgmt"},
  {"name": "Net Probe",   "elsel": "tabs-63", "tmpl":"netprobe",  hdlr: probeinfo, "url": "/nettest", gridid: "jsGrid_probe"},
  {"name": "Load Probe",  "elsel": "tabs-64", "tmpl":"simplegrid", hdlr: loadprobeinfo, "url": "/proctest", gridid: "jsGrid_loadprobe", 
    uisetup: function () { $('.rfop').click(on_docker_info); $('.procps').click(on_docker_info); } },
  {"name": "Output Fmts", "elsel": "tabs-65", "tmpl":null,         hdlr: outfmts, "url": "/allhostgen", gridid: null, path: "genoutput"}, // DUAL
  {"name": "Hostkeys",    "elsel": "tabs-67", "tmpl":"simplegrid", hdlr: sshkeys, "url": "/ssh/keylist", gridid: "jsGrid_sshkeys", path: "hostkeys"}, // DUAL
  {"name": "PkgStat",     "elsel": "tabs-68", "tmpl":"simplegrid", hdlr: pkgstat, "url":"/hostpkgstats", gridid: "jsGrid_pkgstat", path: "pkgstats"}, //DUAL
  //{"name": "About ...",   "elsel": "tabs-7",  "tmpl":"about",    hdlr: function () {}, "url": "", gridid: null}, // DEPRECATED
  {"name": "Docs",        "elsel": "tabs-8", "tmpl":"docs",      hdlr: showdocindex, url: "/web/docindex.json", path: "docsview"}, // DUAL
  {"name": "Docker Env",  "elsel": "tabs-9", "tmpl":"dockercat", hdlr: dockercat_show, url: "/dockerenv", path: "dockerenv"},
  {"name": "Boot/Install","elselXX": "tabs-10", tabs: ["tabs-11","tabs-12","tabs-13", "tabs-14"], "tmplXXX":"bootreq", hdlr: tabsetview, url: "", path: "bootinst"}, // NEW(tabset)
  // Sub Tabs (for Boot/Install, non-routable)
  {"name": "Boot/OS Install",   "elsel": "tabs-11", "tmpl":"bootreq",    hdlr: bootgui, url: "", path: ""},
  {"name": "TFTP Boot Hosts",   "elsel": "tabs-12", "tmpl":"simplegrid", hdlr: tftplist, url: "/tftplist",  gridid: "jsGrid_pxelinux", path: ""},
  {"name": "ISO Boot Media",    "elsel": "tabs-13", "tmpl":"simplegrid", hdlr: medialist, url: "/medialist",  gridid: "jsGrid_bootmedia", path: ""},
  {"name": "Recipes Preview",   "elsel": "tabs-14", "tmpl":"simplegrid", hdlr: recipes, url: "/recipes",  gridid: "jsGrid_recipes", path: ""},
  {"name": "Login",   "elselXX": "", "tmpl":"loginform", hdlr: loginform, url: "",  gridid: "", path: "loginform"},
  // logout (todo: literal template)
  {"name": "Logout",   "elselXX": "", "tmpl":"", hdlr: logout, url: "/logout",  gridid: "", path: "logout"},
  // Directory  (TODO: composite templating)
  {"name": "People Lookup", tmpl: "simplegrid",     "hdlr": showpeople,    url: "/ldaptest", gridid: "jsGrid_ldad", path: "peopledir"},
  {"name": "People Entry", tmpl: "lduser",     "hdlr": gendialog,    url: "", gridid: null, path: "uent", dialogid: "userdialog"},
  // Iblox
  {"name": "InfoBlox", "elselXX": "tabs-15", tmpl: "simplegrid",     "hdlr": ibloxlist,    url: "/ibshowhost", gridid: "jsGrid_iblox", path: "ibloxlist"},
  {"name": "EFlow", "elselXX": "tabs-15", tmpl: "simplegrid",     "hdlr": eflowlist,    url: "/eflowrscs", gridid: "jsGrid_eflow", path: "eflowlist"},
  // esxi
  {"name": "ESXI Hosts",    "elselXX": "", "tmpl":"simplegrid", hdlr: esxilist, "url": "/esxi/", gridid: "jsGrid_esxi", path: "esxiguests"},
  
];
var dialogacts = [
  {name: "", tmpl: "", hdlr: null, url: "", diaid: "", uisetup: null}
];
// TODO: griddialog / entdialog
function gendialog(ev, act) {
  // Create even the element (w. unique id) to which to create dialog ?
  // var uniid = new Date().foo()+"_"+act.path; // No act.dialogid ?
  // Most dialogs have data ...
  var axopts = {params: null};
  if (act.pmaker) { axopts.params = act.pmaker(); } // TODO: pass ....
  if (ev.viewdata) { return showdialog(ev.viewdata); } // sync
  if (!act.url) {   return; }
  axios.get(act.url).then(function (resp) {
    var d = resp.data;
    if (!d) { return alert("No data from server for dialog !"); }
    showdialog(d);
  })
  .catch(function (ex) { console.log(""); });
  function showdialog(data) {
    if (!act.dialogid) { return alert("No dialog indicated (by 'dialogid')"); }
    // Check existence of elem by act.dialogid
    var diael = document.getElementById(act.dialogid);
    if (!diael) { alert("No dialog by id:" + act.dialogid); return; }
    rapp.templated(act.tmpl, data, act.dialogid);
    var dopts = {modal: true, width: 500, height: 200};
    console.log("Dialog.dataset", diael.dataset);
    // Look for size in ... target elem (jev: this)
    if (diael.dataset && diael.dataset.dsize) {
      var m = diael.dataset.dsize.match(/(\d+)x(\d+)/);
      if (m) { dopts.width = m[1];  dopts.height = m[2]; }
      console.log("DOPTS(post-adjust):", dopts );
    }
    //console.log("gendialog:TGT:",ev.target);
    //console.log("gendialog:THIS:",this); // this is Window
    //$("#"+act.dialogid).html(out);
    $("#"+act.dialogid).dialog(dopts);
  }
  // TODO: Make this into rapp. ...
  // Get "raw" DOM element where event being handled now took place.
  // This is expected to be used within event handler function
  // This should cover either case of (e.g. click event)
  // // 
  // elem.addEventListener("click", function (rawev) {})
  // // Type: jQuery.Event
  // $(elem).click(function (jqev) {});
  // 
  function getevelem(anyev) {
    // Test this directly ?
    console.log("getevelem -> this: " + this);
    if (anyev.originalEvent) { return anyev.originalEvent.target; } // Same as this in ev handler
    return anyev.target;
  }
}

var tabloadacts_idx = {};
tabloadacts.forEach(function (it) { tabloadacts_idx[it.elsel] = it; });
var dopts = {modal: true, width: 600, // See min,max versions
                    height: 500}; // show: {effect: "", duration: 1000}, hide: {}
// MUST have separate custom opts (wide grid)
// See min,max versions
var dopts_grid = {modal: true, width: 1000, height: 500};
//////////////////// Tabs and Grids ////////////////////////
/** Tab Activation handler.
* Treat new tab activation almost like routing event. Mediate tab activate to handlers.
* @param event {object} - JQuery UI event
* @param ui {object} - JQuery UI object (has: newTab, newPanel, oldTab, oldPanel
*/
function ontabactivate( event, ui ) {
  //var tgt = ui.newTab['0'].attributes["aria-controls"]; // id of panel
  var tgt = ui.newPanel[0].id; // ui.newTab['0'].id; => Not valid
  console.log("Tab ("+tgt+") active ...NP:", tgt); // , " NP:",ui.newPanel[0].id
  // Do event forwarding ?
  var an = tabloadacts_idx[tgt]; // "#"+
  // TODO: var an = rapp.findtabact(acts, tgt);
  if (!an) { console.error("No action node for:" + tgt); return; } // toastr.error("No Action node");
  // Load template ? 
  //if (an.tmpl) { var c = Mustache.render($('#'+an.tmpl).html(), an); $("#"+an.elsel).html(c); }
  if (an.tmpl) { rapp.templated(an.tmpl, an, an.elsel); }
  console.log(an);
  //console.log(event);
  event.viewtgtid = an.elsel; // Target View ID
  // TODO: Dispatch like a route handler
  if (an.hdlr) { an.hdlr(event, an); }
}
// Initialize tab content (w/o loading data, for cases where data is not initially needed)
function inittabcontent(tabs) {
  // Populate tab templated (or literal) content (run before .tabs() ?)
  tabs.forEach((titem) => { /// INEFFECTIVE
    //console.log("Loop:"+titem.name);
    if (!titem.tsel) { return; }
    // rapp.templated(); // document.getElementById ?
    console.log("Setting template for:"+titem.tsel);
    document.getElementById(titem.elsel).innerHTML = contbytemplate(titem.tsel, titem); // .tmpl rapp.templated(titem.tsel, titem, titem.elsel);
  });
}
function tabui_setup(tabs) {
  $('#tabs').html( webview.tabs(tabs, null, {idattr: "elsel"}) );
  // TODO: use disabled: [] as needed
  $( "#tabs" ).tabs({active: 1}); //  ... active will NOT load if already def. tab by default (e.g. 0)
  ////$( "#tabs2" ).tabs({active: 1});
  inittabcontent(tabs); // NOT EFFECTIVE
  $( "#tabs" ).tabs({ activate: ontabactivate });
  $("#nav").hide();
}
/** Pass set of actions whose validation item is to be hidden from menu.
 */
function acts_rmitem(acts, attr, val) {
  var remok = 0;
  for (var i = 0;i<acts.length;i++) {
    var n = acts[i];
    //if (n[attr]== val) { acts.splice(i, 1); remok = 1; console.log("RM(by):"+val); break; }
    // Alt: Suppress the static item by DOM selector
    //$('nav ').css(); // select by "a", but suppress outer/parent "li" !
    //var n.path;
    $("nav a[href=\'#"+n.path+"\']").hide(); // #eflowlist
  }
  //return acts; // NO need for caller to store
  return remok;
}

// TODO: Make into reusable by passing disable-list
function acts_uidisable(actitems) {
  var cfg = datasets["cfg"];
  if (!cfg) { alert("No config dataset."); }
  var dis = cfg.disabled;
  //////
  if (!dis) { return alert("disabled setting is completely absent"); }
  if (!Array.isArray(dis)) { console.log("Disable-list not in an array"); return;}
  if (!dis.length) { console.log("Nothing to disable"); return; }
  //if (!Array.isArray(dis)) { return alert("disabled ... not an Array"); }
  // Do not check acts_rmitem() return values strictly as items may already be removed.
  dis.forEach((fstr) => {
    console.log("Check:"+fstr);
    // var rmby = "path"; var lbl = fstr;
    //if (fstr == 'ipmi')      { acts_rmitem(actitems, "elsel", "tabs-6"); } // 
    if (fstr == 'groups')    { acts_rmitem(actitems, "path", "groups"); }
    if (fstr == 'dockerenv') { acts_rmitem(actitems, "path", "dockerenv"); }
    if (fstr == 'hostkeys')  { acts_rmitem(actitems, "path", "hostkeys"); }
    if (fstr == 'pkgstats')  { acts_rmitem(actitems, "path", "pkgstats"); }
    if (fstr == 'ibloxlist') { acts_rmitem(actitems, "path", "ibloxlist"); }
    if (fstr == 'eflowlist') { acts_rmitem(actitems, "path", "eflowlist"); }
    if (fstr == 'esxiguests') { acts_rmitem(actitems, "path", "esxiguests"); }
    // acts_rmitem(actitems, rmby, lbl);
  });
}
// Also 2nd {params: {}}
  // {id: "docindex", url: "/docindex.json"}
  var dnodes = [
    {id: "hostlist", url: "/list"},
    {id: "grps", url: "/groups"},
    {id: "aplays", url: "/anslist/play"},
    {id: "aprofs", url: "/anslist/prof"},
    {id: "cfg", url: "/config"},
  ];

window.onload = function () {
  
  
  // Data Load
  var dl = new DataLoader(dnodes, {dstore: datasets});
  dl.load(initapp);
  // Init after loading mandatory data/config with DataLoader
  function initapp (response_dummy) {
    var cfg = datasets["cfg"] || {};
    var tabui = cfg.tabui;
    // TODO: Navigation, e.g. var acts_menu = acts.filter((it) => { return it.menu; });
  //$('nav').html( webview.list(acts_menu, {titleattr: "name"}) );
  /////////////// Setup Tabs (Dynamic) ////////////////////
  var tabs = tabloadacts.filter((ti) => { return ti.elsel; });
  //acts_uidisable(tabs);
  let ccfg = datasets["cfg"]; // Why cfg vs. ccfg ???
  // Disabled menu items
  if (ccfg && Array.isArray(ccfg.disabled)) {
    ccfg.disabled.forEach((p) => { $("nav a[href='#"+p+"']").parent().hide(); });
  }
  if (tabui) { tabui_setup(tabs); }
  else { } // .sidebar_static Style changes (float ...)
  /////////////// Router / routable acts ///////////////////
  var acts = tabloadacts.filter((ti) => { return ti.path; });
  // Can we do async preroute-op ?
  function preroute(ev, act) {
    console.log("Routing: "+act.name+" ('"+location.hash+"')");
    if (!datasets.cfg.username) { location.hash = "loginform";  } // return;
    // Need to override in action for e.g. dialog (e.g. viewid)
    event.viewtgtid = "routerdiv";
  }
  var router = new Router66({ noactcopy: 1, sdebug: 1, pre: preroute}); //defpath: "basicinfo",
  router.add(acts);
    // Page Branding (title, image)
    if (datasets.cfg.hdrbg) { document.getElementById('header').style.backgroundImage = "url("+ datasets.cfg.hdrbg + ")"; }
    if (datasets.cfg.appname) { $("#appname").html(datasets.cfg.appname); }
    db.hosts = datasets["hostlist"];
    // Immediate grids
    ee.on("on_jsGrid_net_done", function (d) {  }); // alert("Net Grid done: "+d.msg);
    ee.on("on_jsGrid_dist_done", function (d) {  });
    ee.on("on_jsGrid_hw_done", function (d) {  });
    //NOT:ee.on("on_jsGrid_dockercat_done", function (d) {  });
    // Others
    ee.on("on_jsGrid_rmgmt_done", function (d) { $("jsGrid_rmgmt .hostcell").click(on_rmgmt_click); });
    // Reload handler. TODO: Wait ...
    function on_probe_reload(jev) {
      $("#jsGrid_probe").fadeOut();
      $("#reloadsym").removeClass().addClass("glyphicon glyphicon-hourglass");
      probeinfo(); // Run !
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
    //toastr.info("Grids loaded"); // Outdated
    // Shared data (/list), different views
    //$( "#tabs" ).tabs( "option", "event", "activate" ); // NA
    
    //$( "#tabs" ).tabs( "load", 1 );
    // https://stackoverflow.com/questions/17967902/trigger-tab-activate-function-jquery-ui-tabs
    
    if (tabui) { $( "#tabs" ).tabs("option", "active", 0 ); } // Required trans. Does not trigger if 0, but does with 1 (!)
   
    
    
    // Hook Only after grid(s) created
    // $(".hostname").click(function (ev) {
    //$(".hostcell").click(on_host_click); // NEW: Moved to specific UI setup
    // Activate Router
    if (!tabui) {
      // TEST selector 'nav ...' 
      //$('nav a[href=\'#eflowlist\']').parent().hide(); // css('display', 'none');
      router.start();
      location.hash = "basicinfo"; // ~defpath
    }
    // Enable extra fields in OS/Version tab (cfg.xflds)
    if (cfg && cfg.xflds) {
      if (!Array.isArray(cfg.xflds)) { return; }
      if (!fldinfo.dist) { return; } // 
      var farr = fldinfo.dist;
      console.log("Add flds: ", cfg.xflds);
      // Choose out of 2 ways (drive by farr
      // if (farr.includes(e.name)) {  }
      cfg.xflds.forEach((fname) => {
      var fld = farr.find((e) => {
        return e.name == fname;
      });
      if (fld) { fld.visible = true; console.log("Enable(visible): ", fld);  }
      });
    }
  } // initapp
  
  
  
  $(document).on('keypress', function(ev){
    console.log(ev.originalEvent); // Dump
    // shiftKey, metaKey, ctrlKey
    //if (ev.originalEvent.charCode == 98) { console.log("Got key"); }
    //if (ev.which == 80 && e.ctrlKey) { console.log("ctrl + p pressed"); }
    if ((ev.which == 13 || ev.which == 10) && ev.ctrlKey) { ansishow(); return false; }
    return true;
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
function chartdata(darr, cdata, vprop, cmap) {
  // OLD: var prop = "pkgcnt";
  // TODO:
  var lblprop = 'hname';
  // var vprop = ... // 
  cdata.labels = darr.map(function (it) { return it[lblprop]; });
  // Add dataset
  cdata.datasets[0].data = darr.map(function (it) { return it[vprop]; });
  // Lookup BG color for each bar
  if (cmap) {
    cdata.datasets[0].backgroundColor = darr.map(function (it) { return cmap[it.distname] ? cmap[it.distname] : "#777777"; });
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
    
/** Load and chart package statistics
* https://www.chartjs.org/docs/latest/axes/cartesian/linear.html
*/
function pkg_stats(ev, act) {
  // Param: prop (for stat), label/name, scaling, canvas sel.
  //var gscale = 1000;
  // Routing event ?
  if (ev.routepath) { rapp.contbytemplate("reports", null, "routerdiv"); }
  axios.get('/hostpkgcounts').then(function (resp) {
    var d = resp.data;
    if (d.status == "err") { alert("Package stats error: " + d.msg); return; }
    var data = d.data;
    var chdef = { lblprop: "hname", subtype: "bar", chcols: [{attr: "pkgcnt", name: "Packages"}], canvasid: "canvas_pkg", gscale: 1000};
    createchart(data, chdef); // "Packages", "pkgcnt", 'canvas_pkg'
  }).catch(function (ex) { console.log(ex); });
  
  //gscale = 10;
  axios.get('/hostcpucounts').then(function (resp) {
    var d = resp.data;
    if (d.status == "err") { alert("Package stats error: " + d.msg); return; }
    var data = d.data;
    var chdef = {lblprop: "hname", subtype: "bar", chcols: [{attr: "numcpus", name: "CPU:s"}], canvasid: "canvas_cpu", gscale: 10};
    createchart(data, chdef); // "CPU:s", "numcpus", 'canvas_cpu'
  }).catch(function (ex) { console.log(ex); });
  // 
  axios.get('/hostmemstats').then(function (resp) {
    var d = resp.data;
    if (d.status == "err") { alert("Package stats error: " + d.msg); return; }
    var data = d.data;
    var chdef = {lblprop: "hname", subtype: "bar", chcols: [{attr: "memcapa", name: "Mem (MB)"}], canvasid: "canvas_mem", gscale: 10};
    createchart(data, chdef); // "CPU:s", "numcpus", 'canvas_cpu'
  }).catch(function (ex) { console.log(ex); });
  // Uses global: cmap, global scales, outer: gscale (for ... suggestedMax)
  function createchart(data, chdef) { // label, vprop, canvasid
    var vprop = chdef.chcols[0].attr;
    var label = chdef.chcols[0].name;
    var canvasid = chdef.canvasid;
    var gscale = chdef.gscale;
    // label: null displays as :"null" (). See legend: { display: false} below.
    var cdata = {labels: [], datasets: [{ "label": label, borderWidth: 1, data: [] }]}; // "Packages"
    // cdata.datasets[0].backgroundColor = color('rgb(255, 99, 132)').alpha(0.5).rgbString();
    var ctx = document.getElementById(canvasid).getContext('2d'); // 'canvas_pkg'
    chartdata(data, cdata, vprop, cmap); // AoO to chart
    // console.log(JSON.stringify(cdata, null, 2));
    // Position for 'label' of each dataset. 'top' / 'bottom'
    //title: {display: true,text: 'Chart.js Bar Chart'}
    // display: false - Important !!
    var scales2 = rapp.dclone(scales);
    // TODO: setup ...
    if (gscale) { scales2.yAxes[0].ticks.suggestedMax = gscale; }
    var copts = { responsive: true, legend: {position: 'top', display: false}, scales: scales2, onClick: on_host_click}; // onCC
    //window.myBar =
    new Chart(ctx, { type: 'bar', data: cdata, options: copts });
  }; // createchart
} // pkg_stats

//var idx = {};
    //pkginfo.forEach(function (it) { idx[it.hname] = it.pkgcnt; }); // || 0 ?
    //db.hosts.forEach(function (it) { it.pkgcnt = idx[it.hname]; });
    //console.log(db.hosts); console.log(idx);


  



/** fetch docker info and pass tu UI-geared callback.
* @param hname {string} - Hostname
* @param gridsel {string} - Selector (id, "#...") for grid (TODO: dialogsel)
*/
function dockerinfo(hname, dialogsel, cb) { // gridsel
  var port = 4243; // cfg.
  if (!hname) { toastr.error("No hostname (from ui) for docker info"); return; }
  if (!dialogsel) { console.error("No dialogsel to forward call to"); return;}
  //console.log("Calling docker ...");
  axios.get('http://'+hname+':'+port+'/v1.24/images/json').then(function (resp) {
    var pinfo = resp.data; // NO: data.data
    //console.log("Docker data: "+ JSON.stringify(pinfo, null, 2));
    if (!pinfo ) { toastr.error("No data from " + hname); return; }
    if (!pinfo.length) { toastr.warning("No images found", "... on " + hname); return; }
    console.log("dockerinfo: Creating grid to: '" + dialogsel + "' with data " + pinfo + ""); // gridsel
    cb(pinfo, dialogsel);
    // OLD: showgrid(gridsel, pinfo, fldinfo.dockerimg); // TODO: Revive ?
  }).catch(function (error) { console.log(error); toastr.error("No Docker info", error); });
}
/** Display NFS exports from an NFS server.
 * @param hname {string} - Hostname
 * @param dialogsel {string} - Dialog selector
 */
function nfsinfo(hname, dialogsel, cb) {
  // Load data
  // MOCKUP: return cb([], dialogsel);
  axios.get("/showmounts/" + hname).then(function (resp) {
    var pinfo = resp.data;
    // console.log(pinfo);
    cb(pinfo, dialogsel); return;
  })
  .catch(function (error) { console.log(error); alert("No NFS info, "+ error); });
}
/** RedFish Info dialog.
 * TODO: Allow to use boot methods other than default
 */
function rfinfo(hname, dialogsel, cb) {
  var tc = $('#redfish').html();
  if (!tc) { return alert("No template content"); }
  toastr.info("Please wait ...", "Inquiring BMC Info");
  axios.get("/rf/info/" + hname).then(function (resp) {
    var rd = resp.data;
    if (rd.status == 'err') { return toastr.error(""+rd.msg); }
    //console.log("RFDATA", rd);
    var d = rd.data;
    if (!d) { return alert("No Data"); }
    console.log("RF-DATA:"+ JSON.stringify(d, null, 2));
    // Setup Extra
    d.hname = hname; // hname - here or server ?
    // Reset Types
    var resettypes; try { resettypes = d.Actions["#ComputerSystem.Reset"]["ResetType@Redfish.AllowableValues"]; } catch (ex) {};
    if (resettypes && Array.isArray(resettypes)) { d.ResetValues = resettypes; }
    // Boot media Types
    var mediatypes; try { mediatypes = d.Boot["BootSourceOverrideTarget@Redfish.AllowableValues"]; } catch (ex) {};
    if (mediatypes && Array.isArray(mediatypes)) { d.MediaValues = mediatypes; }
    // TODO: map esp. resettypes (maybe also mediatypes) to clickable links here or do on template ?
    // TODO: Add "Boot Options" that pops up options.
    // resettypes = resettypes.map((ri) => { return "<span class='rsttype' data-hname=''></span>"; });
    // BMC (MC) Info / Link
    if (rd.mcinfo && rd.mcinfo.ipaddr) { d.ipaddr = rd.mcinfo.ipaddr; }
    else { d.ipaddr = ""; }
    var out = Mustache.render(tc, d);
    $('#'+ dialogsel ).html(out); // '#rfdialog'
    $("#"+ dialogsel ).dialog(dopts_grid); // ????
    // 
    function uisetup() {
      $('.bbut').click(function (jev, ui) {
        console.log(jev); // JQuery.Event (has originalEvent)
        console.log(jev.originalEvent.target); // Same as this
        console.log("THIS:", this); // 2 elems ?
        console.log($(this).data('pxe'));
        var op = $(this).data('op');
        var url = "/rf/"+op+"/"+hname;
        var btype = "";
        if ($(this).data('pxe')) { url += "?pxe=1"; btype = " (PXE)"; }
        console.log("use URL: "+url);
        // var tid = setTimeout(() => {}, 10000);
        axios.get(url).then(function (resp) {
          console.log(resp.data);
          toastr.info("Op "+op+" executed on "+hname+btype); // in Progress
        }).catch(function (err) { alert(err); });
      });
    }
    uisetup();
    // No grid based dialog here
  })
  .catch(function (error) { console.log(error); alert("No RF info, "+ error); }) // toastr.error
  .finally(() => { toastr.clear(); });
}
/** Process Info.
 * See also: dockerinfo and http://$HOST:4243/v1.24/images/json
 */
function procinfo(hname, dialogsel, cb) {
  var port = 8181; // cfg.
  if (!hname) { toastr.error("No hostname (from ui) for proc info"); return; } // proc
  if (!dialogsel) { console.error("No dialogsel to forward call to"); return;}
  //console.log("Calling procps ...");
  axios.get('http://'+hname+':'+port+'/proclist').then(function (resp) { // /proclist
    var pinfo = resp.data; // NO: data.data
    //console.log("Proc data: "+ JSON.stringify(pinfo, null, 2));
    if (!pinfo ) { toastr.error("No data from " + hname); return; }
    if (!pinfo.length) { toastr.warning("No procs found", "... on " + hname); return; } // procs
    //console.log("procinfo: Creating grid to: '" + dialogsel + "' with data " + pinfo + ""); // gridsel
    // Could this roll back V8 object optimizations
    pinfo.forEach((it) => { it.hname = hname; });
    cb(pinfo, dialogsel);
    // OLD: showgrid(gridsel, pinfo, fldinfo.dockerimg); // TODO: Revive ?
  }).catch(function (error) { console.log(error); toastr.error("No Process info:", error); });
}

// $("#jsGrid").jsGrid("sort", field);
function showgrid (divid, griddata, fields) {
  // toastr.error
  if (!divid || typeof divid != 'string') { return toastr.error("showgrid: Div id not passed !"); }
  if (!Array.isArray(griddata)) { toastr.error("No Grid data " + divid); return; }
  if (!Array.isArray(fields)) { toastr.error("No fields data " + divid); return; }
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
