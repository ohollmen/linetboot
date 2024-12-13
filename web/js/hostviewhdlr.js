var spinopts = {lengthX: 37, widthX: 10, scale: 5, color: '#555', top: '80%'}; // TODO: Global (consistent)
var rapp;
var datasets;
var Spinner;
var fldinfo;
var webview;
var rmgmt_data;
var on_host_click;
var docIndex;
var vis;
var location;
var tabloadacts; // hostviews
var window;
//import {Spinner} from 'spin.js';
// OS/Version view ?
function osview_guisetup() {
  // 3x views. Now in more specific location
  $(".hostcell").click(on_host_click);
  // 1x (osview)
  // Need this (to avoid trigger multiple times): $(".drinfo").off("click"); ???
  $(".drinfo").click(on_docker_info);
  $(".nfsinfo").click(on_docker_info);
}

/** Create Simple grid from pre-loaded (cached) data (syncronously).
 * Uses action node ..:
 * - dsid - Cached Dataset id - data set **must** be found from cache by this id.
 * - fsetid
 * The cached data must be in array (of objects, AoO).
 */
function simplegrid_cd(ev, act) {
  var tgtid = ev.routepath ? "routerdiv" : act.elsel;
  rapp.templated(act.tmpl, act, tgtid); // act.elsel
  if (!act.dsid) { return alert("No dataset id for cached data !"); } // dsid = an.dsid;
  var d = datasets[act.dsid];
  if (!d) { return alert("No (cached) dataset found (by: "+act.dsid+")"); }
  if (!Array.isArray(d)) { return alert("dataset not in an array"); }
  if (act.mtx) {
    var cellcb = (e) => { return e.hname; }; let opts = {};
    let c = webview.matrix(d, cellcb, opts); $("#"+act.gridid).html(c); return; }
  showgrid(act.gridid,  d, fldinfo[act.fsetid], act); 
  if (act.uisetup) { act.uisetup(act, d); } // TODO: Params ? (see rapp)
}
// Extract fldinfo label from gridid (... or alternative way ?)
  //if (0) {
  //  var m = act.gridid.match(/^jsGrid_(\w+)/);
  //  if (!m || !m[1]) { return alert("simplegrid_cd: Not a valid grid !"); }
  //}
  // var fsid = m[1];
  // var dsid = "hostlist"; // TODO: Discard
  // showgrid() - pass fldinfo[m[1]]
/** Simple grid from URL.
 * Hooks supported in action:
 * - urlpara(ev, act) - Generate complete or relative URL compatible with axios.get(url)
 *   - Handler can use URL in the action as base url to extend (e.g. with params or additional URL route components
 *   - Handler can pick up hints set in the event
 * - dprep(act, respdata, ev) - Refine data received from server (currently always an array)
 *   - NEW: pass also event to be able to reuse same action for more scenarios
 * - uisetup(act, respdata) - Setup ui (e.g. decorate, add DOM content) and associate event handlers
 */
function simplegrid_url(ev, an) {
  console.log("simplegrid_url URL(a.n="+an.path+"):", an.url);
  //$('#vtitle').html(act.name);
  var url = an.url; // an.genurl ? an.genurl(act) : an.url; // DEFAULT
  var ttgt = ev.viewtgtid || an.elsel; // was: selsel ????
  var para = "";
  var urlgen = an.urlpara || an.genurl; // Allow legacy genurl
  //if (an.urlpara && (para = an.urlpara(ev, an))) { url += "?" + para; } // After curr. var urlgen
  var spinner;
  var spel = document.getElementById(ev.viewtgtid); // ttgt
  // Note: When view calls itself, this block *IS* visited, but Spinner does not show (ev.viewtgtid/spel not there).
  if (an.longload) { console.log("LONGLOAD !"+ev.viewtgtid); spinner = new Spinner(spinopts).spin(spel); }
  else { console.log("No 'longload' (no spinner)"); }
  if (urlgen) {  url = urlgen(ev, an); console.log("Called urlgen() => "+url); }
  axios.get(url).then( function (resp) {
    var data = resp.data;
    var arr = (data && data.data) ? data.data : data; // AoO
    // TODO: Refine logic
    if (data.status == 'err') { return toastr.error(data.msg); }
    if (!arr || !Array.isArray(arr)) { return toastr.error("Simplegrid: No data found in response (as array)"); }
    if (an.dprep) { an.dprep(an, arr, ev); } // New: ev
    //var an2 = rapp.dclone(an);
    // contbytemplate(an.tmpl, an, ttgt);
    rapp.templated(an.tmpl, an, ttgt); // Initial templating
    var fsetid = an.fsetid;
    if (typeof an.fsetidgen == 'function') { fsetid = an.fsetidgen(ev, an); } // NEW
    //TODO: let fldinfo = an.fldinfo || window.fldinfo;
    showgrid(an.gridid, arr, fldinfo[fsetid]); // No need for act as uisetup is not within Grid
    // Must be late-enough, after initial templating (contbytemplate()/rapp.templated()) !!
    // Seems this *can* this be *after* showgrid() like uisetup in others (was before showgrid())
    // NOTE: If we pass act to showgrid(..., act); must disable this
    // NEW(2301): Pass ev, as data within it may contribute to view
    if (an.uisetup && (typeof an.uisetup == 'function')) { an.uisetup(an, arr, ev); }
  }).catch(function (error) { console.log(error); })
  .finally(() => { spinner && spinner.stop(); spinner = null; });
}
/////////////////////////////////////////////////////////
    //var cfg = rapp.dclone(rapp.gridcfg);
    //////////var fi = window.fi; // Alt fields "cache" ? || rapp.fi || 
    //cfg.data = arr; cfg.fields = fi[act.gridid];
    //$("#" + act.gridid).jsGrid(cfg);
    //console.log(JSON.stringify(arr, null, 2));
/** Add navigation to the .xui section of template.
 * 
 */
function dcomposer_uisetup(act) { // 
  var fs = datasets.cfg.docker.files;
  var cont = "";
  // toastr.info(fs);
  fs.forEach((name) => { cont += "<span class=\"vmglink mpointer\" data-dcfn=\""+name+"\">"+name+"</span>\n"; });
  $(".xui").html(cont);
  $(".xui").show();
  // TODO: Must inject parameters to event (that should be accounted for by simplegrid_url)
  $(".vmglink").click(function (jev) {
    // toastr.info("Click on "+Object.keys(jev));
    // TODO: Grab this from original act ? act.hdlr
    simplegrid_url(jev, act);
  });
} // uisetup

/** Display Entities in Grid contained Groups (in multiple grids).
 * Reusable for almost any entities
 * ```
 * [
 *   { // <= start of group 1
 *     "id": "...",
 *     "name": "...",
 *     "items": [
 *        {...}
 *        {...}
 *      ],
 *   }, // end of group 1
 *   {  // <= start of group 2
 *     "id": "...",
 *     "name":"...",
 *     "items": [
 *   ...
 * ]
 * ```
 * TODO: See how to handle dialog ui setup. uisetup could be done either
 * - In loop for each grid dataset <= CURRENT
 * - After whole loop for all grids collectively.
 * Action params: fsid (string) fset, set gridid: null, ... nattr - nameattr, ida - idattr (may be func), colla: coll(arr) attr
 * To support esp. latter the hname would need to be in each process record (!)
 * See: procinfo_uisetup(pinfoarr) for 
 */
function multigridview(ev, act) {
  var elsel = ev.routepath ? "routerdiv" : act.elsel;
  //console.log("Generate into: " + elsel);
  $('#' + elsel).html(''); // Clear
  var nattr = act.nattr || "name";
  var ida = act.ida || "id";
  var colla = act.colla || "items"; // items ? ("hosts" already in org act node)
  var fsid = act.fsetid; // NO default
  if (!fsid) { return alert("No field layout !"); }
  // See disabled by act.elsel (TODO: Suppress whole tab)
  if (datasets && datasets.cfg && datasets.cfg.disabled && datasets.cfg.disabled.includes(act.elsel)) {
    return $('#' + elsel).append("<p style=\"font-size: 11px; \">"+act.name+" not enabled in this system.</p>");
  }
  // console.log("Disabled: ",datasets.cfg.disabled, " elsel:", act.elsel);
  toastr.info("Loading "+act.name);
  var spinner;
  var spel = document.getElementById(ev.viewtgtid);
  if (act.longload) { spinner = new Spinner(spinopts).spin(spel); }
  axios.get(act.url).then(function (resp) { // '/groups'
    var grps = resp.data; // AoOoAoO...
    // NOTE: Can we do this before knowing Arr/Obj (add !Array.isArray(grps) && ...
    // spinner && spinner.stop();
    if (grps.status && grps.status == 'err' && grps.msg) { return toastr.error("Error: "+grps.msg); }
    console.log("DATA:"+JSON.stringify(grps, null, 2));
    if (Array.isArray(grps) && (!grps || !grps.length)) { $('#' + elsel).html("No groups in this system"); return; }
    if (!Array.isArray(grps) && grps.data) { grps = grps.data; } // Auto-detect (e.g. For staleproc use-case)
    if (!Array.isArray(grps)) { toastr.clear(); return toastr.error("Results not in array !"); }
    // TODO: Template ?
    //console.log(JSON.stringify(grps, null, 2));
    // var cont = ""; // TODO: generate string initially ? Problem: How to do showgrid()
    //$('#' + elsel).append("<h1>"+act.name+" ("+ grps.length +")</h1>\n");
    grps.forEach(function (g) {
      var arr = g[colla]; // g.hosts
      var id = (typeof ida == "function") ? ida(g) : g[ida];
      if (typeof act.dataprep == 'function') { act.dataprep(g); } // Data-prep
      $('#' + elsel).append("<h2>"+g[nattr]+" ("+ arr.length +")</h2>\n"); // g.name
      if ((!arr || !arr.length) && act.skipe) { return $('#' + elsel).append("<p style=\"font-size: 11px; \">No items.</p>"); } // No items, allow skip
      $('#' + elsel).append("<div id=\"grp_"+ id +"\"></div>\n");
      showgrid("grp_"+id, arr, fldinfo[fsid]); // "hw"
      if (typeof act.uisetup == 'function') { act.uisetup(act, arr); } // act
    });
    //if (typeof act.uisetup == 'function') { act.uisetup(); } // act
    toastr.clear();
  }).catch(function (error) {  console.log(error); })
  .finally(() => { spinner && spinner.stop(); });
}
/** Create Remote management info (grid).
* Note: hosts unused (!)
*/
function rmgmt(ev, act) {
  // How is "simplegrid" templating prepped ?
  axios.get('/hostrmgmt').then(function (resp) { // act.url
    // Shared global for event handler... on_rmgmt_click
    rmgmt_data = resp.data; // TODO: .data
    // console.log("Remote Mgmt data: ", rmgmt_data);
    if (!rmgmt_data || !rmgmt_data.length) { alert("No rmgmt data"); return; } // Dialog
    var hr = 0; // Has remote management
    if (!rmgmt_data.filter((it) => {return it.ipaddr; }).length) { $('#'+act.elsel).append("<p>Remote management not in use in this environment.</p>"); return; }
    showgrid("jsGrid_rmgmt", rmgmt_data, fldinfo.rmgmt); // act.gridid, ...,  fldinfo[act.fsetid]
    // $("jsGrid_rmgmt .hostcell").click(on_rmgmt_click); // UI Setup
    //$("jsGrid_rmgmt .rfop").click(); // Dedicate
    $('.rfop').click(on_docker_info); // VERY Shared.
  })
  .catch(function (error) { console.log(error); });
}

/** Do network geared probing for DNS, ping, SSH
 */
function probeinfo(ev, act) {
  toastr.info("Running Network Probe ... Please Wait ...");
  var el = document.getElementById(ev.viewtgtid);
  console.log(el);
  var spinner = new Spinner(spinopts).spin(el);
  axios.get(act.url).then(function (resp) { // '/nettest'
    var pinfo = resp.data.data;
    
    // console.log("Probe data: ", pinfo);
    if (!pinfo || !pinfo.length) { toastr.error("No "+act.name+" data"); return; }
    showgrid(act.gridid, pinfo, fldinfo[act.fsetid]); //  "jsGrid_probe" ...  fldinfo.netprobe
    //$("#proberun").click(function () { probeinfo(); }); // Reload. TODO: Wait ...
  }).catch(function (error) {  console.log(error); }) // spinner.stop();
  .finally(() => { spinner && spinner.stop(); });
}
/** Load Process and Uptime Information.
 */
function loadprobeinfo(event, act) {
  toastr.info("Running Load Probe ... Please Wait ...");
  // TODO: Lookup tab (?) element (from ev.) that can be used for spinner elem, see ontabactivate
  var tgtid = event.viewtgtid; // From ontabactivate
  
  var el = document.getElementById(tgtid);
  var spinner = new Spinner(spinopts).spin(el); // new Spin.Spinner or new Spinner() ?
  // target.appendChild(spinner.el); // When invoked w/o target: .spin()
  axios.get(act.url).then(function (resp) {
    var pinfo = resp.data.data;
    // console.log("Probe data: ", pinfo);
    if (!pinfo || !pinfo.length) { toastr.error("No "+act.name+" data"); return; } // Load Probe
    showgrid(act.gridid, pinfo, fldinfo[act.fsetid]); // "jsGrid_loadprobe"
    //$("#proberun").click(function () { probeinfo(); }); // Reload. TODO: Wait ...
    if (act.uisetup) { act.uisetup(act, pinfo); } // act, pinfo unused
  })
  .catch(function (error) { console.log(error); })
  .finally(() => { spinner.stop(); });
}
/** Display archived (and restorable) hostkeys.
 */
function sshkeys(ev, act) {
  var tgtid = ev.routepath ? "routerdiv" : act.elsel;
  rapp.templated(act.tmpl, act, tgtid);
  axios.get(act.url).then(function (resp) { // '/ssh/keylist'
    var pinfo = resp.data.data;
    //console.log("SSH Key data: ", pinfo);
    if (!pinfo || !pinfo.length) { toastr.error("No "+act.name+" data"); return; } // SSH Keys
    showgrid(act.gridid, pinfo, fldinfo[act.fsetid]); // "jsGrid_sshkeys", .., fldinfo.sshkeys
    if (act.uisetup) { act.uisetup(act, pinfo); } // pinfo
  }).catch(function (error) { console.log(error); });
}
/** Note: This ansible triggering UI setup (click => fetch SSH keys) requires
 * 2-way ssh-copy-id between the linetboot and remote host (whose keys are being archived).
 * Things to check: See README.sshsetup.md
 *
 */
function sshkeys_uisetup(act, pinfo) {
  if (!Array.isArray(pinfo)) { return toastr.error("Keylist not in array !!"); }
  $(".sshkeyload").click(function () {
    // Get host
    var p = this.dataset;
    console.log(p);
    var hname = p.hname; // See: onrecipeclick this.dataset
    var op = p.op;
    toastr.info("Note: If copy hangs with SSH interactivity, you need to do further SSH setup (See README.sshsetup.md in documentation)", "Load keys for "+hname);
    // trigger ansible
    var pname = ""; // Todo: Have dispatch table w. Op Name, playbook ...
    var ops = {"fetch": {pp: "sshkeyarch.yaml", name: "Store/Retrieve Keys"}, "restore": { pp: "", name: "Restore Keys"}};
    if (op == 'fetch') { pname = "sshkeyarch.yaml"; }
    else if (op == 'restore') { pname = ""; }
    //if (!ops[op]) { return toastr.error("No op: "+op+" available"); }
    var pp = { hostnames: [hname], playbooks: ["sshkeyarch.yaml"], playprofile: "" }; // See: ansishow
    //return;
    axios.post("/ansrun", pp).then((resp) => {
      console.log("Key archive launched ok (on server)"); // TODO: Use ops[op].name
     // Reload data and grid ? showgrid("jsGrid_sshkeys", pinfo, fldinfo.sshkeys); sshkeys(ev, act) ???
     
    }).catch((ex) => { console.log("Failed key archive launch: "+ex); return; })
    .finally(() => { console.log("Finally there"); });
    //zzzzz();
  }); // Reload. TODO: Wait ...
  // 
  $(".sshkeyrestore").click(function () {
    var p = this.dataset;
    var hname = p.hname;
  });
}
/** Display a package comparison view.
 * Note: dot (".") i field name (here: package name, jsgrid: "name") causes a problem in grid
 * because of jsgrid dot-notation support.
*/
function pkgstat(jev, act) {
  var tgtid = jev.viewtgtid;
  rapp.templated("simplegrid", act, tgtid);
  //setuphelp(act, "#routerdiv h3");
  // TODO: Allow server to config these datasets.cfg.NNN (Server has: pkglist_path)
  var deflist = "wget,x11-common,python2.7,patch,xauth,build-essential";
  // TODO: (Pre-)Load and Add distro options (e.g. load by DataLoader ?). How to default a distro (first ?)?
  // Distro: <select id="osname"></select>
  $('.xui').html("<div><input type='text' name='pkgs' value='"+deflist+"' size='80'><input id='pkgcheck' type='button' value='Lookup'></div>").show();
  function lookup() {
  // Params to pass
  var upara = $("input[name='pkgs']").val();
  var url = act.url + "?pkgs=" + encodeURIComponent(upara); // +"&osname="+$('#osname').val()
  axios.get(url).then(function (resp) {
    var pinfo = resp.data.data;
    var gdef  = resp.data.grid;
    console.log("Pkg data: ", pinfo);
    if (!pinfo || !pinfo.length) { toastr.error("No Package Data"); return; }
    // Set cell handlers
    gdef.forEach(function (it) {
      if (it.name == 'hname') { return; }
      it.itemTemplate = haspackagecell;
    });
    showgrid("jsGrid_pkgstat", pinfo, gdef);
    
  }).catch(function (error) { console.log(error); })
  .finally(() => { toastr.clear(); });
  } // lookup
  lookup();
  $("#pkgcheck").click((jev) => {
    toastr.info("Looking up package info");
    lookup();
  });
}

// Output Gen
function outfmts(ev, act) {
  var tgtid = ev.routepath ? "routerdiv" : act.elsel;
  axios.get('/allhostgen').then(function (resp) {
    var outtypes = resp.data || [];
    var tpara = {outtypes: outtypes};
    rapp.templated('outputs', tpara, tgtid);
    $('.outitem').click(function (ev) {
      var frame = document.getElementById("cmdoutput");
      //console.log(ev.target);
      frame.src = ev.target.href;
      return false;
    });
  })
  .catch(function (error) { console.log(error); });
}
/** Show Info on catalogued Docker images or Bootables.
 * - Pass top-level Object that came in response data as data to templating
 * - Pass auto-discovered or explicitly defined array set (by member name) to grid generator
 */
function dockercat_show(ev, act) {
  var tgtid = ev.routepath ? "routerdiv" : act.elsel;
  var url = act.url;
  console.log("GET: "+url);
  axios.get(url).then(function (resp) {
    var d = resp.data;
    if (!d) { return toastr.error("No data in HTTP request (resp.data) !"); }
    d = d.data || d; // Try to pick "data"
    // || !d.data
    if (!d ) { return $('#denvinfo').html("No "+act.name+" Info"); }
    //console.log("DATA:", d);
    console.log("Place data to id: "+tgtid);
    var el = document.getElementById(tgtid);
    if (!el) { toastr.error(tgtid + " - No such element !"); }
    // Late-Templating (after we have data). Pass top-level data here
    var cont = rapp.templated(act.tmpl, d, tgtid); // '#'+tgtid // "dockercat". NEW: Added tgtid
    // if (!cont) { console.log("No templated content\n"); }
    // act.elsel
    
    // $('#'+tgtid).html(cont); // Redo with results of late-templating (w. d.data)
    // TODO: Where to get 1) grid-array member (gdatamem, gdmem) ? 2) fldinfo key (same as tmpl name ?) ?
    //var fiid = act.fsetid; //  || act.tmpl; (old: act.fsid)
    
    var garrmem = act.gdmem || autoarray(d);
    console.log("FSETID: "+act.fsetid+", gdmem:"+garrmem);
    showgrid (act.gridid, d[garrmem], fldinfo[act.fsetid], act); // "jsGrid_dockercat", d.data.catalog, .dockercat
    // TODO: Style w. padding, etc.
    // var dgopts = {}; // style for table ?
    //OLD: $("#jsGrid_dockercat").html(webview.listview_jsg(d.data.catalog, fldinfo.dockercat, dgopts));
    
    //if (act.path == 'dockerenv') { uisetup_dockercat(act); }
    //if (act.path == "bootables") { uisetup_bootables(act); }
    // NOTE: Grid showgrid() already runs uisetup (when available) !!!
    //if (act.uisetup) { act.uisetup(act, []); }
 

  }).catch(function (err) { return toastr.error(err, "Error getting "+act.name+" from "+act.url); });
  // ... TODO: rapp.
  function autoarray(data) {
    var ks = Object.keys(data);
    var arrks = [];
    // Pick only, pick first ?
    ks.forEach((k) => { if (Array.isArray(data[k])) { arrks.push(k); } });
    if (!arrks.length) { return null; }
    if (arrks.length == 1) { return arrks[0]; }
    return arrks[0]; // if allowed by config ("first")
  }
}

function uisetup_bootables(act, arr) {
  if (!arr || !Array.isArray(arr)) { return alert("No data passed"); }
  console.log("BOOTABLES-UISETUP");
  axios.get("/bs_statuses").then((resp) => {
    var d = resp.data.data;
    if (!Array.isArray(d)) { return toastr.error("Not in array"); }
    toastr.info("ISO statuses from "+d.length+" sources retrieved !");
    // TODO/NEW: Map status vals to orig. *data* not just HTML(view)
    d.forEach((img) => {
      var id = "bsstatus_"+img.lbl; // ID in HTML
      var e = arr.find((e) => { return e.lbl == img.lbl; });
      e.code = img.code;
      e.status = img.status;
      //return; // NEW
      console.log("Try set: "+id);
      $("#"+id).html(img.status ); // + "("+img.code+")"
      $("#"+id).attr('style', 'color: '+httpcode2color(img.code)); // Color ...
    });
    
  }).catch((ex) => {  alert("Bootables Error !"); });
  
}

function httpcode2color(code) {
  if ((code >= 200) && (code < 300)) { return "#6AB423"; } // OK #33FF33
  return "#AA0000";
}
  
// UI Setup: Docker sync ops (Hook onto cell data-image created by grid fld plugin)
function uisetup_dockercat(act) {
  $(".docksync").click(function (jev) {
    var img = this.getAttribute("data-image"); // .dataset.image;
    //console.log(img);
    // TODO: Use syncgrps (arr), not hostgrp
    var syncgrps;
    try {
      syncgrps = datasets.cfg.docker.syncgrps; // See main cfg, mainconf.js
      if (!syncgrps || !syncgrps.length) {  throw "No sync groups !"; } // if (!syncgrp || !syncgrp.length) {}
    } catch (ex) { console.log("Docker hostgrp EX: "+ex); return toastr.error("Docker Sync Error: "+ex); }
    var p = { hostgroups: syncgrps, "playbooks": ["./playbooks/docker_pull.yaml"], xpara: {image: img}}; // See: ansirun OLD: [hgrp]
    console.log("Docker run para:", p);
    // Run ansible w. params /ansrun. TODO: Add request para ?
    // TODO: Use higher level approach with polling (See: 
    axios.post("/ansrun", p).then(function (resp) {
      var r = resp.data;
      if (r.status == 'err') { toastr.error(r.msg); }
      else { toastr.info(r.msg); }
    });
  });
} // uisetup


/** Display docker-imager config files */
function dockerimg_show(ev, act) {
  
}

function showdocindex (ev, act) {
  // Mimick flow from docindex_main.js
  //var tgtid = ev.routepath ? "routerdiv" : act.elsel;
  let tmplid = act.tmplid || "docs";
  if (ev.routepath) { rapp.templated(tmplid, null, "routerdiv"); }
  var cfg = new docIndex({acc: 0, linkproc: "post", pagetitleid: "dummy", debug: 1, nosidebarhide: 1 });
  docIndex.ondocchange = function (docurl) {
    console.log("DOC-CHANGE: "+docurl);
    // location.hash = '#nop';
  };
  var url = act.idxurl || act.url || "docindex.json";
  docIndex.converter.setOption('tables', true);
  //if () {}
  //console.log("Staring load: "+ url);
  /*
  $.getJSON(url).done(function (d) {
    //console.log("Completed load: "+ url);
    //console.log(d);
    cfg.initdocs(d);
  })
  .fail(function (jqXHR, textStatus, errorThrown) { toastr.error("Failed to load item: "+textStatus); });
  */
  axios.get(url).then((resp) => { cfg.initdocs(resp.data); }).catch((ex) => { toastr.error("Error loading docindex config:"+ex);});
}
/** Show Boot Options and allow set boot target (Boot / OS Install) on host(s).
 * 
 */
function bootgui(ev, act) {
  var tgtid = ev.routepath ? "routerdiv" : act.elsel;
  //var cont =
  rapp.templated("bootreq", {}, tgtid);
  // $('#'+act.elsel).html(cont);
  
  // UI Setup
  function boot_select_setup() {
    var bootlbls = datasets["cfg"].bootlbls; // id, name. Should do rapp.dclone()
    bootlbls = bootlbls.map((bi) => { return {id: bi.id, name: bi.id + " - " + bi.name}; }); // Effective clone
    webview.addoptions(bootlbls, $("#bootlbl").get(0), {}); // datasets["cfg"].bootlbls
    var hlist = datasets["hostlist"];
    hlist = hlist.map((it) => { return {hname: it.hname}; } ).sort((a,b) => { return a.hname.localeCompare(b.hname);  });
    webview.addoptions(hlist, $("#hname").get(0), {aid: "hname", aname: "hname"});
  }
  boot_select_setup();
  $("#bootreqsubmit").click(function (jev) {
    // TODO: Allow multiple hosts, not ONLY one !!!
    // Call async.map(hnames, )
    var hval = $("#hname").val();
    console.log("Go host-value: ", hval);
    var para =  {"bootlbl": $("#bootlbl").val(), "hname": $("#hname").val()[0]};
    console.log(para);
    axios.get("/install_boot?", {params: para}).then(function (resp) {
      var d = resp.data;
      console.log(d);
      if (d.status == "err") { return toastr.error("Failed to complete request "+ d.msg); }
      var summ = d.msgarr ? d.msgarr.map.join("\n") : "";
      toastr.info("Sent boot/install request successfully\n"+summ);
      tftplist(); // Refresh (IFF on same view)
    }).catch(function (err) { console.log(err); });
  }); // 
  // Legacy (single view)
  //tftplist(ev, act);
  //medialist(ev, act);
  //recipes(ev, act);
  // {params: para}
  
}
// In a separate tab, make this to an action handler, not merely event
function tftplist(ev, act) {
  // TODO: "Join" with hostname here or server side ?
  axios.get(act.url).then(function (resp) { // "/tftplist"
    var d = resp.data;
    console.log(d);
    showgrid(act.gridid, d.data, fldinfo[act.fsetid]); // "jsGrid_pxelinux", ..., fldinfo.pxelinux
    // UISETUP: Handle Click on (Default Boot) Reset Link
    // uisetup: (act, data) = {
    // $(".defboot").click(defboot_reset);
    //}
    if (act.uisetup) { act.uisetup(act, d.data); }
  }).catch(function (err) { console.log(err); });
}
// Click handler for Boot item reset (to default)
function defboot_reset(jev) {
  // var macfname = this.dataset.macfname;
  var mac = this.dataset.macaddr; // NEW
  console.log("Reset MAC:" + mac);
  var url = "/bootreset?macaddr="+mac;
  // TODO: Block / disable link ?
  $(".defboot").click(function (jev) {});
  toastr.info("Reset Permanent boot on MAC:" + mac);
  axios.get(url).then(function (resp) {
    var d = resp.data;
    if (d.status == "err") { return toastr.error("Error resetting boot by mac "+mac+ "\n"+d.msg); }
    toastr.info("Successfully reset boot to default menu.");
    //showgrid("jsGrid_pxelinux", d.data, fldinfo.pxelinux); // ONLY shows grid (NO click hdlrs)
    tftplist(); // Now on separate tab. Adds click handlers !
  }).catch(function (ex) { toastr.error(ex.toString()); });
  return false;
}
function medialist(ev, act) {
  // TODO: Why do we not template here ?
  axios.get(act.url).then(function (resp) { // "/medialist"
    var d = resp.data;
    console.log(d);
    showgrid(act.gridid, d.data, fldinfo[act.fsetid]); // "jsGrid_bootmedia" ... fldinfo.bootmedia
    // UISETUP: Handle Click on Media Info
    if (act.uisetup) { act.uisetup(act, d.data); }
  }).catch(function (err) { console.log(err); });
}

function medialist_uisetup() {
  $(".mediainfo").click(function (jev) {
    var p = this.dataset.path;
    // Pop up dialog
    //alert(p);
    var url = "/mediainfo?mid=" + p;
    axios.get(url).then(function (resp) {
      var d = resp.data;
      if (!d) { return toastr.error("No media info"); }
      if (d.status == 'err') { return toastr.info(p + " Does not seem to be a loop mounted image"); }
      console.log(d);
      //return;
      // Dialog "pattern"
      //document.getElementById('midialog').innerHTML =
      rapp.templated("mitmpl", d.data, 'midialog');
      var dopts2 = {modal: true, width: 500, height: 200};
      //$( "#midialog" ).html(output); // NOT needed
      $( "#midialog" ).dialog(dopts2);
    }).catch(function (ex) { toastr.error(ex.toString()); });
    return false;
  });
} // medialist_uisetup

/** Present a Preview grid on various supported recipes.
 * Should also include other templated content (e.g. boot menu).
 */
function recipes(ev, act) {
  function recipe_cell(val, item) {
    // href=\""+val+"?ip="+item.ipaddr+"\"
    //var ccont = val; // ORIG
    var ccont = "<i class=\"glyphicon glyphicon-play\"></i>"; // Icon !
    return "<a class=\"recipecell\" data-hn=\""+item.hname+"\" data-ip=\""+item.ipaddr+"\" data-rname=\""+val+"\" title=\""+val+" for "+item.hname+"\">"+ccont+"</a>";
  }
  axios.get("/recipes").then(function (resp) {
    var d = resp.data;
    console.log(d);
    var fis  = d.grid; // Grid fields
    var urls = d.urls; // Recipe rel. url
    var data = datasets["hostlist"]; // All hosts
    var i = 0;
    fis.forEach((fi) => {
      if (fi.name == 'hname') { console.log("Skipping: " + fi.name); return; }
      var name = fi.name;
      fi.itemTemplate = recipe_cell;
      data.forEach((it) => { it[name] = urls[i]; });
      i++;
    });
    
    showgrid("jsGrid_recipes", data, fis);
    // Recipe cell click => Dialog
    $('.recipecell').click(onrecipeclick);
    //$('.recipecell').get(0).addEventListener("click", onrecipeclick)
    function onrecipeclick(jev) {
      console.log("Click on recipe: "+this.href);
      var dopts = {modal: true, width: 900, height: 700};
      console.log("EV:", jev); // event.type // ICON: target:i, currentTarget: a, TEXT: Both: a
      console.log("THIS:", this); // a always(?)
      console.log("TGT:", jev.target); // ICON: i-elem (glyph) TEXT: a
      var p = this.dataset; // Use dataset directly as params, add some params
      //p.rname = this.textContent; // ICON as textContent will mess this up (rname will be empty, URL will be "" => "/web")
      //p.url = this.href;
      p.url = p.rname + "?ip=" + p.ip;
      p.type = "text/plain;charset=utf-8";
      console.log("p=", p);
      //if (p.rname.match(/\.xml$/)) { p.type = "application/xml;charset=utf-8"; }
      // TODO: Choose template based on mime-type ?
      // Data URIs cannot be larger than 32,768 characters.
      // iframeElement.setAttribute('src', 'data:text/xml,<test>data</test>'); Also srcdoc="" base64,
      rapp.templated("recipe", p, "recipedialog");
      //var cont = "";
      //$('#recipedialog').html(cont);
      $('#recipedialog').dialog(dopts);
      return false;
    }
  }).catch(function (err) { console.log(err); });
}
/** View install profiles.
 * Almost generic routine for handling simple grid view.
 */
function instprofiles(ev, act) {
  // alert("Inst profiles");
  axios.get(act.url).then(function (resp) {
    var d = resp.data;
    if (d.status == "err" || (d.data && !d.data.length)) {
       $('#'+act.gridid).html("No Install profiles (configuration, JSON filename given in .inst.iprofsconfig) in use in this system.");
      return toastr.info("No Install profiles in use in this system.");
    }
    d = d.data; // Grab *actual* data
    console.log(d);
    showgrid(act.gridid, d, fldinfo[act.fsetid]);
  }).catch((ex) => { toastr.error(ex); });
}

function loginform(ev, act) {
  if (!ev.viewtgtid) { console.log("Routing Failed to set target view"); return; }
  rapp.templated(act.tmpl, act, ev.viewtgtid);
  $("#nav").hide();
  // UISetup
  $("#loginbut").click(function () {
    // TODO: ["username","password"].forEach((k) => { p[k] = document.getElementById(k); }
    var p = { username: $("#username").val(), password: $("#password").val() };
    // POST creds
    axios.post("/login", p).then( function (resp) {
      var d = resp.data;
      console.log("Login Response:", d);
      if (d.status == "err") { toastr.error("Login Failed: " + d.msg); return; }
      if (!d.data) { toastr.error("userinfo Missing"); return; }
      if (!d.data.username) { toastr.error("username Missing (in userinfo)"); return; }
      toastr.info("Login Success");
      // or call whole init/initapp ?
      //var u = datasets.cfg.user = {};
      datasets.cfg.username = d.data.username; // Over-writes the session provided value ?
      $("#userinfo").html(d.data.username);
      location.hash = "basicinfo";
      $("#nav").show();
    }).catch(function (ex) { var emsg = "Error in login: "+ex.toString(); console.log(emsg); toastr.error(emsg); return;} );
    return false;
  });
}
/** Log user out of the application.
 */
function logout(ev, act) {
  $("#"+ev.viewtgtid).html('');
  
  // {params: p}
  axios.get("/logout").then( function (resp) {
    var d = resp.data;
    // NO: return; 
    if (d.status == "err") { toastr.error("Logout Failed: " + d.msg); }
    //$("#"+ev.viewtgtid).html()
    else { toastr.info('Logged out Successfully'); }
    $("#nav").hide();
    // Only the form is no going to help
    //NOT-LOW-LEVEL: rapp.templated("loginform", act, ev.viewtgtid);
    var a2 = tabloadacts.filter((an) => { return an.path == "loginform"; })[0];
    loginform(ev, a2);
    
  }).catch(function (ex) { var emsg ="Error in logout: "+ex.toString(); console.log(emsg); toastr.error("Logout Failed w. Ex.: " + emsg);} );
  
}

function showpeople(ev, act) {
  rapp.templated("simplegrid", act, ev.viewtgtid);
  $("#"+ev.viewtgtid).prepend(rapp.templated("searchui"));
  // new Spinner
  var spel = document.getElementById(ev.viewtgtid); // spinner && spinner.stop();
  
  function search(p) {
    var spinner = new Spinner(spinopts).spin(spel);
    // TODO: Analyze params to support different use cases
    // "/ldaptest"
    axios.get(act.url, {params: p}).then(function (resp) {
      // Populate AoO to grid
      var d = resp.data;
      if (d.status == 'err') { return toastr.error("Failed search: " + d.msg); }
      if (!d.data) { return toastr.error("No Data Found."); }
      if (!Array.isArray(d.data)) { return toastr.error("Data Not in Array."); }
      var uarr = d.data;
      showgrid(act.gridid, uarr, fldinfo[act.fsetid]); // fldinfo.ldad
      // if (cb) { cb(d.data); }
      // Need to index or populate id / sequence numbers
      var idx = {};
      d.data.forEach((it) => { idx[it.sAMAccountName] = it; });
      console.log("Assign click hdlr");
      // Secondary UISETUP: TODO: Alternatively fetch by DN
      $('.unamecell').click(function (jev) {
        //console.log("Calling click hdlr");
        var un = this.dataset.uid;
        var e = idx[un]; // From idx
        if (!e) { toastr.error("No data looked up (locally)"); return false; }
        console.log(e);
        //var out = rapp.templated("lduser", e); // app.gridid
        //console.log(out);
        var act = tabloadacts.filter((a) => { return a.path == "uent"; })[0];
        if (!act) { console.log("No Action"); return; }
        jev.viewdata = e;
        gendialog(jev, act);
        return false;
      });
      
    }).catch (function (ex) { console.log(ex); })
    .finally( () => { spinner.stop(); });
  } // search (on top)
  // UISETUP
  var clistnames = datasets.cfg.clistnames;
  if (clistnames && Array.isArray(clistnames)) {
    var cont = "<style>.clistname { padding: 0px 5px; display: inline-block; border-radius: 5px; border: 1px solid #BBBBBB; } #clists { display: inline-block; padding: 10px; }</style>";
    clistnames.forEach((name) => { // OLD: cls contact list string => name
      // encodeURIComponent(name)
      cont += " <span class=\"clistname\" data-name=\""+name+"\">"+name+"</span> ";
     });
     $("#clists").html(cont);
     $(".clistname").click(function (jev) {
       //alert(this.dataset.name);
       var p = { pblbl: this.dataset.name };
       search(p);
     });
  }
  $('#sbutt').click(function () {
    var p = { uname: $("#uname").val() };
    toastr.info("Search by: "+p.uname);
    search(p);
  });
  // Contacts
  
}
/** List Infoblox Info In a grid/summary view.
 * However drive list by "all hosts" so that missing or bad info can be clearly seen.
 */
function ibloxlist(ev, act) {
  rapp.templated("simplegrid", act, ev.viewtgtid);
  // , {params: p}
  toastr.info("Looking up Iblox host info ... please wait");
  var spel = document.getElementById(ev.viewtgtid); // spinner && spinner.stop();
  var spinner = new Spinner(spinopts).spin(spel);
  axios.get(act.url).then(function (resp) { // "/ibshowhost"
    var d = resp.data;
    if (d.status == 'err') { toastr.clear(); return toastr.error("Failed search: " + d.msg); }
    if (!d.data) { return toastr.error("No Data Found."); }
    if (!Array.isArray(d.data)) { return toastr.error("Data Not in Array."); }
    // Merge All and subset ? Add attrs for view.
    /*
    d.data.forEach((it) => {
      var ibent = it.data.ipv4addrs[0];
      if (!ibent) { return; }
      // Move to top
      it.ipaddr_ib  = ibent.ipv4addr;
      it.macaddr_ib = ibent.mac;
      it.usedhcp    = ibent.configure_for_dhcp;
    });
    */
    // NOTE: Too early for this to reside in Uisetp ???
    d.data.forEach((item) => {
      if ((item.ipaddr_ib != item.ipaddr) || (item.macaddr_ib != item.macaddr)) { item.needsync = 1; }
      // Bug in jsgrid ? boolean false in "usedhcp" (type: "string") shows as "", but true shows as "true" (!).
      // See also jsgrid doc and jsGrid.fields for type-extensibility.
      item.usedhcp = typeof item.usedhcp == 'undefined' ? "" : item.usedhcp.toString();
    });
    showgrid(act.gridid, d.data, fldinfo[act.fsetid]); // fldinfo.iblox
    // UISETUP:
    if (act.uisetup) { act.uisetup(act, d.data); }
    
  }).catch (function (ex) { console.log(ex); })
  .finally( () => { spinner.stop(); });
}

function ibox_uisetup(act, dataunused) {
  $('.syncbutt').click(function () {
    var hname = this.dataset.hname;
    // TODO: lock/disable buttons
    $('.syncbutt').prop('disabled', true);
    //toastr.info("Should sync "+hname+" with infoblox !");
    axios.get("/ipamsync?hname="+hname).then((resp) => {
      var d = resp.data;
      if (d.status == 'err') { toastr.clear(); return toastr.error("Failed InfoBlox sync: " + d.msg); }
      if (!d.data) { return toastr.error("No Data Found."); }
      toastr.clear();
      toastr.info("Sync'd "+hname+" with infoblox successfully !");
    }).catch((ex) => { toastr.error(ex); })
    .finally(() => { $('.syncbutt').prop('disabled', false); });
  });
}


function eflowlist(ev, act) {
  //console.log("EFlow ...");
  rapp.templated("simplegrid", act, ev.viewtgtid);
  toastr.info("Request Resource Info from EFlow ... please wait...");
  var spel = document.getElementById(ev.viewtgtid); // spinner && spinner.stop();
  var spinner = new Spinner(spinopts).spin(spel);
  axios.get(act.url).then(function (resp) { // "/eflowrscs"
    var d = resp.data;
    if (d.status == 'err') { toastr.clear(); return toastr.error("Failed search: " + d.msg); }
    if (!d.data) { return toastr.error("No Data Found."); }
    if (!Array.isArray(d.data)) { return toastr.error("Data Not in Array."); }
    //console.log(d.data);
    showgrid(act.gridid, d.data, fldinfo[act.fsetid]); // 
    // UISETUP
    if (act.uisetup) { act.uisetup(act, d.data); }
   
  }).catch (function (ex) { console.log(ex); })
  .finally( () => { spinner.stop(); });
}

 function eflow_uisetup(act, dataunused) {
  $(".hostcell").click(on_host_click);
  $('.efena').change(function () {
    var uithis = this;
    var rscname = this.dataset.rscname;
    var hname   = this.dataset.hname;
    $(uithis).prop('disabled', true); // Or all '.efena' ?
    // Box: "enabled"
    //var disa = this.checked ? 0 : 1;
    var ena = this.checked ? 1 : 0;
    toastr.clear();
    toastr.warning("Rsc "+rscname+" ena: "+ena);
    axios.get("/eflowrsctoggle/?hname="+hname+"&rscname="+rscname+"&ena="+ena).then((resp) => {
      var d = resp.data;
      console.log("resp.status: " + resp.status);
      toastr.clear();
      var darr = ["Disabled", "Enabled"];
      toastr.info("Changed resource "+rscname+ " to "+darr[d.data.ena]); // +    enabled= " + d.data.ena
    }).catch((ex) => { toastr.error(ex); })
    .finally(() => {  $(uithis).prop('disabled', false); });
  });
  }

/** Show all guests from a VM Host.
 * TODO: Use xui to show navi list of servers ?
 */
function esxilist(ev, act) {
  var host;
  var cfg = datasets["cfg"];
  toastr.clear();
  rapp.templated("simplegrid", act, ev.viewtgtid); // Use act.tmpl
  // TODO: do at esxi_uisetup(act, respdata) ?
  if (cfg.vmhosts) { esxihostmenu(act, cfg.vmhosts); }
  else { $('#'+ev.viewtgtid + " " + ".xui").html("No VM hosts in this system.").show(); return; }
  // Figure out host (default to ... (first?) ?)
  // From a-element (may be a global navi link, or host specific link)
  function esxi_urlpara(ev, act) { // 
    var ds = ev.target.dataset;
    if (ds && ds.ghost) { host = ds.ghost; }
    if (!host && cfg.vmhosts) { host = cfg.vmhosts[0]; }
    return host;
  }
  host = esxi_urlpara(ev, act);
  if (!host) { return toastr.error("No Default host available."); }
  $("#routerdiv h3").html(act.name + " on VM Host " +host); // In _uisetup()
  console.log("Search by: "+ host);
  var url = act.url + host; // esxi_urlgen();
  toastr.info("Request ESXI Host "+host+" VM Info ... please wait...");
  axios.get(url).then(function (resp) {
    var d = resp.data;
    toastr.clear();
    if (d.status == 'err') { toastr.clear(); return toastr.error("Failed search: " + d.msg); }
    if (!d) { return toastr.error("No Data Found."); } // d.data
    if (!Array.isArray(d)) { return toastr.error("Data Not in Array."); } // d.data
    console.log(d); // d.data
    showgrid(act.gridid, d, fldinfo[act.fsetid]); // d.data, fldinfo.esxilist
    //var csv = $("#"+act.gridid).jsGrid("exportData", expcfg);
    //console.log("CSV:\n",csv);
    console.log("# Guests for "+host);
    //var opts = {sep: ','};
    //var csv = gridexp(fldinfo.esxilist, d); 
    //console.log(csv);
    
  }).catch (function (ex) { console.log(ex); });
  var expcfg = {
    type: "csv", //Only CSV supported
    subset: "all", // | "visible", //Visible will only output the currently displayed page
    delimiter: "|", //If using csv, the character to seperate fields
    includeHeaders: true, //Include header row in output
    encapsulate: false, //Surround each field with quotes
    newline: "\n", //Newline character to use (\r\n)
    // filter: (item) => { return 1; }, transformations: {"attr": (val) => { return val; }}
  };
  //
  //function loadhostglist(host) {
  //  
  //}
}
// CSV
function gridexp(flds_g, data, opts) {
  opts = opts || {};
  //var flds_g = fldinfo.esxilist;
  var flds = flds_g.map((col) => { return col.name; });
  opts.sep = opts.sep || ",";
  //var hdr = fldinfo.esxilist.map((col) => { return col.name; }).join(',');
  var lines = [];
  //opts.debug && console.log("HDR:"+flds.join(sep)+"\n");
  lines.push(flds.join(opts.sep));
  data.forEach((it) => {
    var varr = flds.map((fn) => { return it[fn]; });
    varr = varr.map((v) => { return (typeof v == 'string') ? v.replace(opts.sep, "\\"+opts.sep) : v; });
    //opts.debug && console.log("LINE:"+varr.join(sep)+"\n");
    lines.push(varr.join(opts.sep));
  });
  return lines.join("\n");
}

/* Present (ESXi host) Items in a listing to choose item from. */
function esxihostmenu(act, vmhosts) {
  var cont = "";
  vmhosts.forEach((name) => { cont += "<span class=\"vmglink mpointer\" data-ghost=\""+name+"\">"+name+"</span>\n"; });
  // Extra action
  cont += " (<span id=\"esxicache\" class=\"mpointer\">Re-cache ESXi Info</span>)";
  $(".xui").html(cont);
  $(".xui").show();
  // On Click ...
  $(".vmglink").click(function (jev) { esxilist(jev, act); });
  
  $("#esxicache").click(function (jev) {
    toastr.info("Caching ... Please Wait");
    axios.get("/esxi/cache").then((resp) => {
      var d = resp.data;
      if (d.status == "ok") { return toastr.info("Cached OK"); }
      return toastr.error("Caching Failed: "+d.msg);
    }).catch((ex) => { return toastr.error("Caching failed (exception) "+ex); });
  });
  //return cont;
}

/** Display API docs.
 * TODO: Get structure and group to sections here.
 */
function apidoc(ev, act) {

  toastr.info("Load API Docs");
  // act.url ... JSON struct
  act.url = "/apidoc?doc=1"; // FORCE (HTML) // TODO: urlgen
  axios.get(act.url).then(function (resp) {
    var info = resp.data;
    // console.log(info);
    //rapp.templated("apidoc", info, ev.viewtgtid); // Client tmpl ?
    $("#"+ev.viewtgtid).html(info);
  }).catch (function (ex) { console.log(ex); });
}
//////////// Dialog handlers ////////////////////
// Shell view
// https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe
function shellview_show(ev, act) {
  // TEST: Extract hosts from dataloader cache
  var hlist = datasets.hostlist;
   console.log(hlist.length + " hosts");
   // splice(1, 5).
   // Filter by nossh
   var hnl = hlist.filter((e) => { return !e.nossh; }).map((e) => { return e.hname; });
   // console.log("hnl: ", hnl);
   
   //////////////// 
  var p = {shellid: "siab", hname: "", port: 4200};
  rapp.templated("t_shell", p, ev.viewtgtid);
  var hlinks = hnl.map((hn) => {
    return " <li><span class=\"shlink\" data-hname=\""+hn+"\" style=\"font-size: 10px\">"+hn+"</span></li>";
    // console.log("Create link for "+hn);
   }).join(' ');
   $("#shlinks").append(hlinks);
  var el = document.getElementById(p.shellid);
  if (!el) { return toastr.error("Could not find terminal"); }
  // Set hanlder on host links
  // $(".shlink").click((jev) => { let el = jev.target; alert(el.dataset.hname);  }); // dataset.hname (NOT: this - why ?)
  $(".shlink").click(sethost);
  function sethost(jev) {
    var evel = jev.target;
    var hname = evel.dataset.hname;
    $("#s_hname").html(hname);
    el.src = "https://"+hname+":"+p.port;
    //el.src = "http://"+p.hname+":3000/preseed.cfg"; // "/web"
    console.log("Set URL to: "+el.src+ " on "+el);
  }
}
/** Deploy Git projects (configured on server side).
 * Reused for deploy, mkrepo, deployprojs
 */
function proj_deploy(ev, act) {
  var tgtid = ev.viewtgtid;
  console.log("Git Deploy / Createrepo ev.viewtgtid: "+tgtid);
  rapp.templated(act.tmpl, act, tgtid);
  axios.get(act.url).then((resp) => {
    var d = resp.data.data;
    if (!Array.isArray(d)) { return toastr.error(act.name + " config is not an array!"); }
    if (act.uisetup) { act.uisetup(act, d); } // deploy_uisetup(d);
    // Overloaded for grid
    if (act.tmpl && act.tmpl.match(/grid/)) {
      showgrid(act.gridid, d, fldinfo[act.fsetid]);
    }
  }).catch((ex) => {
    //alert("Bad: "+ex);
    toastr.error("Problems loading deployment info: "+ex);
  });
}
function mkrepo_uisetup(act, data) {
  var opt1 = document.getElementById("repolbl");
  var inp2  = document.getElementById("reponame");
  webview.addoptions(data, opt1, {aname: "name", aid: "lbl"});
  $('#mkrepobut').on('click', function(jev) {
    var p = {repolbl: $(opt1).val(), reponame: $(inp2).val(),  }; //$(el3).val() initial: $(el3).is(':checked')
    console.log("Send: "+JSON.stringify(p));
    var spel = document.getElementById("routerdiv"); // ev.viewtgtid
    var spinner = new Spinner(spinopts).spin(spel);
    // GET:{ params: p}
    axios.post("/createrepo", p).then((resp) => {
      var d = resp.data;
      if (d.status == "err") { return toastr.error(act.name+" error: " + d.msg); }
      toastr.info(act.name+" success with info: " + d.data.msg);
      // NEW: Update info sect on: tmpl: "t_mkrepo"
      // TODO: Follow ansible GUI example of showing <pre> on-demand (only)
      var infoel = document.getElementById("mkrepo_usage");
      if (!infoel) { console.log("No mkrepo_usage (id) element !"); return; }
      var remname = "myrepo"; // TODO: parametrize from GUI
      var text = `# Clone empty repo and fill it out\ngit clone ${d.data.repourl}\n`;
      text += `# Add newly created repo as remote and push to it\ngit remote add ${remname} ${d.data.repourl}\ngit push ${remname} master\n`;
      text += `# Push and set as default upstream repo\ngit push --set-upstream ${remname} master`; // TODO: Only set as upstream (not push)
      infoel.innerHTML = text;
    }).catch((ex) => {
      toastr.error("Problems with Deployment: "+ex);
    }).finally(() => {  spinner.stop(); }); // spinner &&
  });
}
function deploy_uisetup(act, dpconf) {
  console.log("Got conf:", dpconf);
  if (!Array.isArray(dpconf)) { return alert("deploy_uisetup: dpconf not in Array !"); }
  var opt1 = document.getElementById("projlbl");
  var opt2 = document.getElementById("dlbl");
  var el3  = document.getElementById("initial");
  webview.addoptions(dpconf, opt1, {aname: "name", aid: "projlbl"}); // 
  // Fetch tags / branches (all refs ? possible on ssh repo only ? Use git or ssh+git) ?
  //axios.get("/gittags?projlbl=" + $(opt1).val()).then((resp) => {}).catch((ex) => {});
  //opt1.
  $('#projlbl').on('change', function(jev) { // selectmenuchange
    console.log("projlbl Changed: ", this);
    let v = $(this).val();
    console.log("projlbl has value: " + v);
    // Choose deployment options accordingly
    var pr = dpconf.find((pr) => { return pr.projlbl == v; });
    if (!pr) { toastr.error("No project found by: "+v); }
    var dopts = pr.deploydest;
    console.log("Changing deployment options to: ", dopts);
    webview.addoptions(dopts, opt2, {aname: "userhost", aid: "dlbl"});
  });
  
  // TODO: Check [0] (detect from chosen project ?)
  let v = $(opt1).val();
  var pr = dpconf.find((pr) => { return pr.projlbl == v; });
  var dopts = pr.deploydest;
  // dpconf[0].deploydest
  webview.addoptions(dopts, opt2, {aname: "userhost", aid: "dlbl"});
  $('#deploybut').on('click', function(jev) {
    var p = {projlbl: $(opt1).val(), dlbl: $(opt2).val(), initial: $(el3).is(':checked') }; //$(el3).val()
    console.log("Send: "+JSON.stringify(p));
    var spel = document.getElementById("routerdiv"); // ev.viewtgtid
    var spinner = new Spinner(spinopts).spin(spel);
    // GET:{ params: p}
    axios.post("/deploy", p).then((resp) => {
      var d = resp.data;
      if (d.status == "err") { return toastr.error(act.name+" error: " + d.msg); }
      toastr.info(act.name+" success with info: " + d.data);
    }).catch((ex) => {
      toastr.error("Problems with Deployment: "+ex);
    }).finally(() => {  spinner.stop(); }); // spinner &&
  });
}

// Redundant, See: simplegrid_cd
function actinfo(ev, act) {
  var tgtid = ev.routepath ? "routerdiv" : act.elsel;
  rapp.templated(act.tmpl, act, tgtid);
  var d = datasets[act.dsid]; // MUST pre-pop into cache (tabloadacts)
  if (!d) { return; }
  showgrid(act.gridid, d, fldinfo[act.fsetid]); // "jsGrid_sshkeys", .., fldinfo.sshkeys
  // uisetup ?
  if (act.uisetup) { act.uisetup(act, d); }
}

function actinfo_uisetup(act, data) {
  //alert("Hello");
  $('.urlcell').click((jev) => {
    var evel = jev.target;
    // TODO: See recipes review dialog invocation: recipes / onrecipeclick
    //alert(evel.dataset.url);
  });
}


var netopts_hosthier = {
  // hierarchicalLayout: { direction: ...}
  nodes: {shape: "box"}, // OLD: "box" ("image", "dot"). borderWidth: 2, size: ... fontFace: "times"
  edges: {
    color: 'lightgray'
  },
  groups: {}, // key: {opacity: }
  // physics: {barnesHut:{springLength: 200}}
  //stabilize: false,
  //configurePhysics:true
};

function dprep_hosthier(null_data, netdata, netopts) {
  if (!netopts) { return alert("No netops passed to cb"); }
  // Merge groups (if any) from netdata to config
  if (netdata.groups) { Object.keys(netdata.groups).forEach((k) => { netopts.groups[k] = netdata.groups[k]; }); }
  
}
/**
 * Constraints: none of the id:s given to hierarchical elems may overlap.
 * fontawesome: 5.4.2 components-font-awesome "git://github.com/components/font-awesome.git
 * npm install graphology sigma
 */
function visnethier(ev, act) {
  var tgtid = ev.routepath ? "routerdiv" : act.elsel;
  console.log("get: "+act.url);
  // TODO: Allow to come from action
  var tp = { name: act.name, appname: (datasets.cfg ? datasets.cfg.appname: "???") };
  rapp.templated(act.tmpl, tp, tgtid);
  var spel = document.getElementById(ev.viewtgtid);
  //if (act.longload) {
    var spinner = new Spinner(spinopts).spin(spel);
  //}
  // Validate netopts early (for now mandatory per act). Possible to have global fallaback defaults ?
  if (!act.netopts) { return toastr.error("No netopts config for "+act.name); }
  var netopts = rapp.dclone(act.netopts); // Make copy because of possible config mods.
  axios.get(act.url).then((resp) => {
    //var d = resp.data.data;
    // DEBUG: $("#"+tgtid).html("<pre>"+JSON.stringify(d, null, 2)+"</pre>");
    var data = null;
    var netdata = resp.data.data; // d;
    //var netdata = rapp.respdata(resp);
    // FOr the "other" use-case: Must create netdata by dprep
    // var netdata = { nodes: [], edges: [] };
    //var idx = {};
    //netdata.nodes.forEach((it) => { idx[it.id] = it; });
    // <div id="hh" style="height: 800px"></div> / 
    // Note: How to deal with ready-to-go graph netdata. For now set data null
    if (act.dprep) { data = act.dprep(null, netdata, netopts); } // NOT: act.netopts, but use local clone
    
    // Note: container: ... 1.X: elem, 2.x ... here is not the elem, but id (w/o #)
    // Merge groups from netdata to config
    //if (netdata.groups) { Object.keys(netdata.groups).forEach((k) => { netopts.groups[k] = netdata.groups[k]; }); }
    
    var container = document.getElementById(act.helemid); // 'hosthier'
    if (!container) { return alert("No Vis Graph DOM element present ("+act.helemid+")"); }
    //// Instantiate Net. 
    var network = new vis.Network(container, netdata, netopts);
    //network.on("click", onhostnetclick ); // on_node_click
    if (act.nclick) { network.on("click",  function (o) { act.nclick(o, netdata); } ); }
  })/**/.catch((ex) => {
    console.error(act.name+" exception: "+ex);
    toastr.error("Problems loading "+act.name+" info: "+ex);
  })/**/
  .finally (() => { spinner && spinner.stop(); });
}

function onhostnetclick (o, netdata) { // , netdata
  console.log("Params ", o);
  if (!o.nodes.length) { console.log("Not a click on node"); return; }
  console.log("o keys: "+Object.keys(o)); // pointer,event,nodes,edges,items
  console.log(o);
  var id = o.nodes[0];
  //var n = idx[id]; // Lookup from index
  var n = netdata.nodes.find((n) => { return n.id == id; });
  //toastr.info("VIS Click on "+id);
  console.log(n);
  if (n.kind == 'host') { on_host_click(null, {hname: n.id}); }
  else if (n.kind == 'group') { var l = netdata.edges.filter((it) => { return it.to == n.id; }).length;  } // alert(l);
}
/*
// NOTE: New version, as of late 2021/early 2022 needs the 3 param construction, not OLD: new sigma(sigmacfg);
// Also new version does not take "raw" data structures, they must be graphology instances
// Note slight diff. in order of params (cmp to Vis.js)
// <div id='sigma-container'></div>
var sigmacfg = {renderer: { container: container, type: "canvas" }, settings: { minArrowSize: 10 }};
if (act.sigma) {
    //console.log(Graph);
    //console.log(Graph.Graph);
    //var g = new Graph(); //  NOT: 4525 graphology.umd.js  Graph. cjs: Graph is not a constructor
    
    // makesigmagraph(netdata, g);
    //g.import(netdata); // 2.X "nodes" should have "key", "edges" source, target. "attributes": {name: "My Graph"} optional (also "options")?
    //var s = Sigma.Sigma(netdata, container, sigmacfg);
    var s = new sigma(sigmacfg); // v1.X.Y
    // load the graph
    delete(netdata.groups);
    // 
    netdata.nodes.forEach((n) => {
      n.x = Math.random(500); n.y = Math.random(500);
      //n.x = 250; n.y = 250;
      n.size = 3; n.color = "#000000";
    });
    console.log(JSON.stringify(netdata, null, 2)); // The edge must have a string or number id.
    try { s.graph.read(netdata); } catch (ex) { console.log("sigma read Error: "+ex); }
    // draw the graph
    s.refresh();
}
    // https://graphology.github.io ("Quick Start")
    function makesigmagraph(data, graph) {
      data.nodes.forEach((n) => { graph.addNode(n.id, n); });
      data.edges.forEach((e) => { graph.addEdge(e.from, e.to); });
    }
*/

// Need for coloring ?
function dprep_syspods(act, arr) {
  console.log("RUNNING syspods DPREP !!!");
  var cols = {"Running": "#6AB423"};
  arr.forEach((pod) => {
    if (!pod.spec || !pod.spec.containers || !Array.isArray(pod.spec.containers)) { return; }
    var conts = pod.spec.containers;
    // Note: More than 1 cont. is NOT an error or even worth warning ... store / later output  count ?
    if (conts.length > 1) { console.error("Warning: More than 1 container for ... !!!"); }
    pod.container = pod.spec.containers[0]; // Singular, Also Move up
    if (typeof pod.container != 'object') { console.error("Warning: container is not an object"); }
    // NEW: Add cols map
    pod._coloring = cols;
  });
}
// UI Prep for xui menu
function kub_uisetup(act, data, ev) {
  var cont = "";
  var kubimap = datasets.cfg["kubimap"];
  var idx = {};
  kubimap.forEach((kmo) => {
    cont += " <span class=\"kubact\" data-info=\""+kmo.name+"\">"+kmo.title+"</span> ";
    idx[kmo.name] = kmo;
  });
  var kmo = idx[ev.kinfo] || kubimap[0];
  if (kmo) { $("#routerdiv h3").html(kmo.title); }
  $(".xui").html(cont);
  $(".kubact").click(function (jev) {
    //toastr.info("Hi!");
    var info = this.dataset.info;
    jev.kinfo = info ; //  || ''
    console.log("kubact ev-hdlr(a.n="+act.path+"): "+jev.kinfo);
    jev.viewtgtid = "routerdiv";
    simplegrid_url(jev, act); // act.hdlr(jev, act)
    //location.hash = "";
  });
  $(".xui").show();
  
}

function kub_urlpara(ev, act) {
  console.log("kub_urlpara: Got: "+ ev.kinfo);
  // Get from ...
  var kinfo_def = datasets.cfg["kubimap"][0].name;
  if (!ev.kinfo) { ev.kinfo = "pod-sys"; console.log("kub_urlpara: info="+ev.kinfo); }
  return "/kubinfo?info="+ev.kinfo+"&CREATOR=kub_urlpara";
  // return act.url + "?info=" + ev.kinfo;
}
function kub_fsetidgen(ev, act) {
  if (!ev.kinfo) { return act.fsetid; }
  if (ev.kinfo.match(/^pod/)) { return "syspods"; }
  var fsm = {"nss": "kubnss", "api": "kubapis", "nodes": "kubnodes"};
  var fsid = fsm[ev.kinfo];
  if (!fsid) { alert("No fieldset for kinfo="+ev.kinfo); return; }
  return fsid;
}
// Note: Not a Trend.
// If all count fields do not appear in chart, log in as cov user and add to that users fields.
// For other users reports that prevent access to them, 
function dprep_covcomp(act, data) {
  if (!Array.isArray(data)) { toastr.error("Data not in array for conversion"); return; }
  var arr = data; // ???
  // Transform array of Component stats to chart / datasets
  // Original / Out of Box grid has (only): New, OutSt.., Total
  // Sample from record by iterating these, chking value typeof "number"
  var attrs = ["newCount", "outstandingCount", "totalCount", "fixedCount", "triagedCount"];
  var stnames = ["New",    "Outstanding",       "Total",     "Fixed",      "Triaged"];
  var colors = ["#68C434", "#DD5014", "#E8E600", "#A9C1EE", "#C60C30"]; // Outstanding: #88580F => #DD5014, Total: #DFEED6 => #F7F500 => #E8E600
  var exc = ["Other"];
  var c = { labels: [], datasets: [] };
  /**/
  arr.forEach((it) => {
    attrs.forEach((k) => { it[k] = parseInt(it[k]); });
    //var ds = {label: "Stats for "+it.component, data: []}; // fill: false
    //attrs.forEach((k) => { ds.data.push(it[k]); });
    var ev = "not match";
    var tot = (it.outstandingCount + it.fixedCount);
    //if ( == it.totalCount) { ev = 'ok'; }
    console.log(it.component+" total "+it.totalCount+" counted tot ", tot, " delta ", (tot-it.totalCount)); // 
    if (exc.includes(it.component)) { return; }
    c.labels.push(it.component);
    //c.datasets.push(ds);
  });
  /**/
  var i = 0;
  attrs.forEach((k) => {
    var ds = {label: stnames[i], data: []}; // fill: false
    ds.backgroundColor = colors[i];
    // Iterate all comps
    arr.forEach((cit) => {
      if (exc.includes(cit.component)) { return; }
      ds.data.push(cit[k]);
    });
    c.datasets.push(ds);
    i++;
  });
  return c;
}

function cmod_covcomp(data, copts) {
  console.log("CUSTOM-CHART...");
  copts.grouped = true;
  // Eliminate stacking
  copts.scales.xAxes = [];
  copts.scales.yAxes = [];
  return copts;
}


/** Generate a form based on jg field definitions (enhanced w. some extra info).
* Each widget will have 2 HTML attributes to select by:
* - name attr. per model name
* - id attr as "w_" + name (from model)
* Options for form generation:
* - btitle (str) - Button Title
* - bid (str) - Button ID (to e.g. hook listener by)
* - labelw (int) - Label Width (default: 120 px),
* - wfactor (number) - Widget field size factor (to multiply field def "width" by to set widget size, default: 0.6)
* - formid (str) - Form element id - passing this will trigger generating the form tags around form widgets (no default).
* - lpopup - Label popup (WIP, todo: bool, function)
* @param fdefs (array) - Field definitions as AoO (with name, label, extra info)
* @param opts (object) - Options for form generation
* See http://js-grid.com/docs/ for documentation. Note: Using `"visible": false` (See: Configuration => fields) allows setting up custom or to-do fields.
*/
function form_jg(fdefs, opts) {
  opts = opts || { wfactor: 0.6, }; // labelw: 120,
  
  
  // Generate widgets (and subtype panes)
  //function form_wgen(fdefs, opts) {
  var labelw = opts.labelw; // || 120;
  var wfactor = opts.wfactor || 0.6; // TODO: From params
  var arr = [];
  let idprefix = opts.idprefix != undefined ? opts.idprefix : 'w_';
  let prefix = opts.nprefix || ""; // Must have trailing dot
  fdefs.forEach((fd) => { // map ?
    var wtype = fd.wtype || "text";
    //if (!fd.visible && cfg.onlyvis) { return; }
    if (fd.ispkey) {
      //DONOT:cont += `<input type="hidden" name=\"w_${fd.name}" id="w_${fd.name}" class="pkey">`; // hideid ?
      return; } // Pkey, hide (transmit to up a diff. way)
    // TODO: (fctx/cfg, fd)
    //cont +=
    var typetag = fd.dtype ? `data-type="${fd.dtype}"` : "";

    var lws = labelw ? `style="width: ${labelw}px"` : "";
    let lw = {};
    // Subtypes (allow array and object ?)
    if (!fd.visible && fd.type == 'array') { arr.push({ wtype: "subtypepane", subtype: `${fd.dtype}`, memname: `${fd.name}`} ); return; }
    let ltitle = opts.lpopup ? `${idprefix}${fd.name}` : ""; // WIP: Label title (popup)
    lw = { wtype: wtype, label: `<label ${lws} for="${idprefix}${fd.name}" ${ltitle}>${fd.title}</label>` };
    
    // TODO: Choice of widget (derive from ... ? "wtype"/"uitype"). How to differentiate ac (also: create another hidden for value ...)
    // TODO: Call widget gen. callbacks w. (fd, opts)
    if (wtype == 'text') {
      //  type="number" (min/max)
      let sizeinfo = Math.round(fd.width * wfactor) || 20;
      lw.widget = `<input type="text" name="${prefix}${fd.name}" v-model="${prefix}${fd.name}" id="${idprefix}${fd.name}" size="${sizeinfo}" ${typetag} class="${fd.css ? fd.css : ''}" ${readonly(fd)}>`;
    }
    else if (wtype == 'textarea') {
      let sizeinfo = Math.round(fd.width * wfactor) || 20;
      var ht = fd.ht || 5;
      lw.widget = `<textarea  name="${prefix}${fd.name}" v-model="${prefix}${fd.name}" id="${idprefix}${fd.name}" rows="${ht}" cols="${sizeinfo}"></textarea>`; }
    // Populate options dynamically / separately (TODO: conv. autobind to data-autobind="" / data-optbind)
    else if (wtype == 'options') {
      let bl = fd.optbind ? fd.optbind : ""; // Bind label. Do not allow interpolation to "undefined"
      let multi = (fd.multi) ? `multiple="multiple"` : "";
      // TODO: Add optional v-for="" for hyper-dynamic options (options from self-data) based on ...
      // let vf = ''; let forcont = '';
      //if (fd.optdatamem) { vf = `v-for="it in this.${fd.optdatamem}"`; forcont = "<option value="${}">${}</option>"; }
      lw.widget = `<select  name="${prefix}${fd.name}" v-model="${prefix}${fd.name}" id="${idprefix}${fd.name}" data-optbind="${bl}" ${typetag} class="${fd.css ? fd.css : ''}" ${multi}></select>`;
    }
    // checked=checked indeterminate / w.select(). For Vue this will automatically emit true/false (bool) values. Optional: true-value="..." false-value="..."
    else if (wtype == 'checkbox')   { lw.widget = `<input type="checkbox" name="${prefix}${fd.name}" v-model="${prefix}${fd.name}" id="${idprefix}${fd.name}">`; }
    // checked=checked indeterminate / w.select()
    else if (wtype == 'radiobutton') { lw.widget = `<input type="radiobutton" name="${prefix}${fd.name}" v-model="${prefix}${fd.name}" id="${idprefix}${fd.name}">`; }
    // min / max required pattern (re)
    else if (wtype == 'date')    { lw.widget = `<input type="date" name="${prefix}${fd.name}" v-model="${prefix}${fd.name}" id="${idprefix}${fd.name}">`; }
    // min / max / step required (give as triplet "0:10:1"?). typetag still valid for number/int (Example: min="0" max="100" value="90" step="10")
    // https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/range
    // https://www.smashingmagazine.com/2021/12/create-custom-range-input-consistent-browsers/
    else if (wtype == 'slider')  {
      let mms = ( fd.mms && typeof fd.mms == 'string') ? fd.mms.split(/\s*,\s*/) : [0, 10, 1];
      lw.widget = `<input type="range" name="${prefix}${fd.name}" v-model="${prefix}${fd.name}" id="${idprefix}${fd.name}" ${typetag} min="${mms[0]}" max="${mms[1]}" step="${mms[2]}" >`; }
    // Note: this *could* be triggered by fd.visible property, but for now must have explicit fd.wtype == 'hidden'
    else if (wtype == 'hidden')  { lw.widget = `<input type="hidden" name="${prefix}${fd.name}" v-model="${prefix}${fd.name}" id="${idprefix}${fd.name}" ${typetag}>`; }
    else { return; } //  lw.widget = `<input type="text" name="${prefix}${fd.name}" id="w_${fd.name}" size="${sizeinfo}" ${typetag}>`; } // Should not be needed !
    arr.push(lw);
  }); // for
  fdefs.forEach((fd) => { if (fd.type == 'array' && !fd.visible) { } });
  function readonly(fd) { return fd.ro ? 'readonly="readonly"' : ''; }
  let wtrans = {"slider": "range", "options": "select"};
  //function startw(fd) { let wcont = "<"+(wtrans[fd.wtype] ? wtrans[fd.wtype] : wtype); wcont += ` name="" `; }
  
  // Lay out (TODO: Provide flexible, configurable layout facility)
  // function form_layout(warr, opts) {
  let cont = "";
  if (opts.formid) { cont += `<form id="${opts.formid}">\n`; }
  // Note: put 1:many items to seq-location where declared
  let bindmod = ""; // (opts.ui == 'vue') ?  : "";
  let svar;
  // unip - unique attr/prop name (indication of v-deco.)
  if (opts.mvar && opts.unip) { // && opts.ui == 'vue'
    //let
    svar = getshortvar(opts.mvar);
    let uprop = opts.unip; // || 'id'; // uniprop. Also (below) :key="item.id" => :key="${svar}.${uprop}"
    console.log(`subtypes gend-id-suffix: ${svar}.${uprop}`);
    bindmod = `v-for="${svar} in ${opts.mvar}" :id="\`${opts.mvar}-\$\{${svar}.${uprop}\}\`"`; } // :key="${svar}.${uprop}" // etype-undefined ?
  if (opts.layout == 'rowform') { cont += `<tr ${bindmod}>`; } // Start else { cont += `<div ${bindmod}><h3>{{ ${svar}.???}}</h3>`;}
  arr.forEach( (lw) => {
    
    if (lw.wtype == 'hidden') { cont += `${lw.widget}`; return; } // hidden - wideget only, no label (but present on form)
    // NOT: fd.type == 'array' && !fd.visible. Use subtype, memname
    // Q: Why is concrete HTML creation postponed to layout stage on subtypepane ? Can we gen earlier ?
    if (lw.wtype == 'subtypepane') { cont += `<div data-memname="${lw.memname}" data-subtype="${lw.subtype}" class="stp" style="display: none;"></div>\n`; return; }
    if (opts.layout == 'rowform')  { cont += `<td>${lw.widget}</td>`; }
    else { cont += `${lw.label}<span>${lw.widget}</span><br/>\n`; }
    
  });
  
  if (opts.layout == 'rowform') {
    let symdel = `<i class="glyphicon glyphicon-minus small"></i>`; // "X" glyphicon-remove
    if (opts.mvar && opts.unip) { cont += `<td><button @click="delentry('${opts.mvar}', ${svar}.${opts.unip})">${symdel}</button></td>`; } // ${svar}
    cont += `</tr>`;
  } // Term. else { cont += `</div>`;}
  if (opts.btitle && opts.bid) {
    let vact = opts.mvar ? `@click="send()"` : "";
    cont += `<input type="button" value="${opts.btitle}" id="${opts.bid}" ${vact}>\n`;
  } // End-of-form Button
  if (opts.formid) { cont += `</form>\n`; }
  //}
  return cont;
  function getshortvar(lvar) {
    let m; return (m = lvar.match(/^(\w)/)) ? m[1] : ""; //if (!mvar) { return; }
  }
}
/** Populate (template) the subtype divs (generated by form_jg()).
 * @param fdefs (array) - fdefs of current parent type (to whom the subtypes belong).
 * @opts (object) - Options object w.  fldinfo (for lookup of child types), layout: rowform/entform
*/
function form_subtypes(fdefs, opts) { // fdefs or warr or just querySelectorAll()
  opts = opts || {debug: 0};
  if (!opts.fldinfo) { console.error("subtype: No field info passed (not able to access potential subtypes)"); return; }
  let fldinfo = opts.fldinfo;
  // Use fdefs or widget-array here ?
  let stws = document.querySelectorAll("[data-memname]");
  if (!stws) { console.log("No subtypes (divs for subtypes) found in DOM."); return; }
  for (ste of stws) {
    // Func for single ?
    var ds = ste.dataset; // w. memname, subtype
    console.log(`Found container for mem: ${ds.memname} st: ${ds.subtype}`);
    let mement = fdefs.find( (fd) => { return fd.name == ds.memname; }); // 4 name ()
    let collname = mement && mement.title ? mement.title : null; // `Entity ${ds.subtype}`
    if (!collname) { console.error(`Warning: No coll name/title for ${ds.memname}`); collname = `Entity ${ds.subtype}`; }
    // Extract short var name for type
    //let m; let mvar = (m = ds.memname.match(/^(\w)/)) ? m[1] : ""; if (!mvar) { return; }
    let svar = getshortvar(ds.memname); // e.g. "els" => "e"
    if (!svar) { console.error(`Short var extract of '${ds.memname}' failed`); }
    if (opts.debug) { console.log(`svar of ${ds.memname} => ${svar} (for nprefix '${svar}.')`); }
    let stfi = fldinfo[ds.subtype];
    if ( ! stfi) { console.log(`No subtype '${ds.subtype}' found in fldinfo !`); continue; }
    console.log("Found subtype info", stfi);
    // Need to mimick action here {name: } ? A: No
    // nprefix: `${ds.memname}.`
    // OLD: layout: "rowform"
    // nprefix - set to sname of mement + "."
    let opts2 = { layout: "rowform", nprefix: `${svar}.`, }; // for form_jg()
    if (!opts2.layout) { opts2.layout = "rowform"; } /// default
    opts2.mvar = ds.memname; // TEST
    opts2.unip = mement.unip; // par flddef, mem prop, unip of child (for e.g. key)
    if (!mement.unip) { console.log("Warning: missing unip for subtype. Binding form (w. data) may fail ..."); }
    let cont = form_jg(stfi, opts2); // Delegate to form_jg()
    if (opts.debug) { console.log(`subtype form (in cont, ${cont.length} bytes):\n${cont}`); }
    // TODO: Oly display select fields (while allowing binding to hold whole model) style="padding-right: 10px;"
    let hdrc = stfi.map( (fd) => { return `<th >${fd.title}</th>`; }).join('');
     let subcont = `<h3>${collname}</h3>\n<table class="tbform"><tr>${hdrc}</tr>${cont}</table>`;
     let symadd = `<small class="smallicon"><i class="glyphicon glyphicon-plus small"></i></small>`; // "+"
     subcont += `<button @click.prevent="addentry('${ds.memname}')">${symadd}</button>`; // ${svar}.${opts.unip}
     ste.innerHTML = subcont;
  } // for
  var celems = document.querySelectorAll('.stp'); for (e of celems) { e.style.display = 'block'; }
  function getshortvar(lvar) {
    let m; return (m = lvar.match(/^(\w)/)) ? m[1] : ""; //if (!mvar) { return; }
  }
}
/** Action handler for jgrid grid-def based form.
* Action must have following properties filled out:
* - fsetid (string) - field set id for field defs (currently relies on global  fldinfo too. TODO: config)
* - fldinfo (object) - Field info (OoAoO) structure holding field definitions (fall back to window.fldinfo)
* - formid (string) - Form id for form to generate
* - optcoll (object) - Option collection (OoA) to use for option population.
* - uisetup (CB) - Optional Callback to call after form is placed into view (similar to other rapp handlers)
* - formtmpl (string) - Outer/Wrapping mustache template for the HTML form (e.g. w. heading (at start), submit button (at end)),
*   should have member "cont" for the form content part.
* - debug - Toggle on debug output
*/ 
function jgrid_form(ev, act) {
  var tgtid = act.elsel || "routerdiv"; // ev.routepath ? "routerdiv" : ;
  if (!document.getElementById(tgtid)) { toastr.error("No final target element in DOM for the form view\n"); return; }
  var fsid = act.fsetid;
  if (!fsid) { toastr.error("No fieldset id to create form\n"); return; }
  console.log(`Looking up fsetid by ${fsid}`);
  var fi = act.fldinfo || window.fldinfo; // app.fldinfo ?
  if (!fi) { toastr.error("No field info structure to get field defs from\n"); return; }
  var fdefs = fi[fsid];
  if (!fdefs) { toastr.error("No field set to create form\n"); return; }
  // Generate form content
  let opts = { labelw: act.labelw, formid: act.formid, subtypes: act.subtypes }; // subtypes needed here at all ?
  let cont = form_jg(fdefs, opts);
  if (act.debug) { console.log("FORM:"+cont); }
  // nest into datasets to have available for rapp.templated. TODO: semi-random local name, delete-after ?
  // On submission by FormData() https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/radio
  // 
  //datasets["testform"]
  if (!rapp.dcache) { console.error("rapp.dcache was uninitialized (e.g. to {}) !"); rapp.dcache = {}; } // Avoid null-dref !
  // <form id="eform">
  rapp.dcache["testform"] = `<h1>{{{ name }}}</h1>\n{{{ cont }}}\n<input type="button" id="savebutt" value="Save" />`; // </form>
  if (act.tmplid) {} // TODO: Review rapp.templated and see what tmplid could come from (rapp.dcache, DOM-id, ...)
  rapp.templated("testform", {name: act.name, cont: cont}, tgtid);
  delete rapp.dcache["testform"]; // Should be OK to delete-after-use
  let formid = act.formid;
  if (!act.formid)  { toastr.error("No formid (for selector purposes on action)\n"); return; }
  if (!act.optcoll) { toastr.error("No optcoll (for options population)\n"); return; }
  if (typeof act.optcoll != 'object') { toastr.error("Options (optcoll) not stored in object\n"); return; }
  
  // Already checked presence of act.fldinfo. Also this should always happen before form_options_setup() to have options setup happen to subtypes.
  if (act.subtypes) { opts.fldinfo = act.fldinfo; form_subtypes(fdefs, opts); }
  
  // Prepare the *very common* UI setup tasks here
  form_options_setup(formid, act.optcoll); // formid, optcoll. TODO: 
  
  // Do similar bind-probe on autocomplete
  //var acw = document.querySelectorAll("[data-ac]");
  if (act.uisetup) { act.uisetup(act, {}); } // Pass container of bound UI vals (that will live with form) ?
}

/** Setup option fields on a form (by its id) from single option collection.
* Option collection is a single OoA structure may be static on client side or coming from server sie
* or be a mix of the two. However it must be fully poppulated before passing it here (e.g. wait async calls to complete).
* @param formid - ID of the form element (to select option input fields with data-optbind attribute)
* @param optcoll - Option collection in OoA format (See notes on array internal formats)
* OLD:  entvals - Default values (on new entry) or values to set (on update ui) for option fields in simple OoS (S=scalar) format
* @return none
* NOTE: Below ONLY in context of the form (get from act.formid ? .formsel ?)
* TODO: probe debug mode from params (rather not) or namespace of ui toolkit
*/
function form_options_setup(formid, optcoll) {
  var debug = 0;
  console.log(`opt_setup: Got: fid: '${formid}'`, optcoll);
  if (!optcoll) { console.log("No options collection passed !"); return; }
  if (!formid) { console.error("Warning: formid not passed (but w-selection should work with it too)"); }
  var obs = `#${formid} [data-optbind]`; // Option bind selector
  // This query should produce only "select" elements.
  var optw = document.querySelectorAll(obs); // NodeList. to array: [...optw]
  console.log(`Got ${optw.length} elems to bind by selector '${obs}'`); // for (const el of optw) {}
  // var oba = "optbind"; // ???
  [...optw].forEach( (el) => {
    console.log(el);
    // OLD: act.optcoll. Redundant w. check on top (optcoll && ...)
    optel_setup(el, optcoll);
  });
}
// Setup single select options element.
// Sep'd out to be able to address an exception-case select e.g. when callback based
// (non-array) options (myopt: () => {...}) are extracted from the form data itself and
// the second pass must be post-poned for data to be available.
function optel_setup(el, optcoll) {
  if ( el.dataset && el.dataset.optbind) { // el.dataset[oba] // <= option bind attribute
    // Lookup and probe array inner format, turn into universal format supported by addoptions()
    var oa = optcoll[el.dataset.optbind];
    if (!oa) { console.log(`Options could not be looked up for ${el.name}!`); return; }
    // Function ? Dispatch func oa, replace with returned array. TODO: Pass ... ?
    if (typeof oa == 'function') { console.log(`Options for ${el.name} configured by CB.`); oa = oa(); }
    // By now oa should be array - if not, log it and skip it.
    if (!Array.isArray(oa)) { console.log(`Warning: options (for ${el.dataset.optbind}) not in array (Got: ${typeof oa}) - skipping.`); return; }
    // AoA - Map/Fix to AoO
    if (Array.isArray(oa[0]))     { oa = oa.map( (e) => { return {id: e[0], name: e[1]}; } ); }
    // AoS (str or scalar) - Map/Fix to AoO
    if (typeof oa[0] == "string") { oa = oa.map( (e) => { return {id: e,    name: e}; } ); }
    // Else assume (correct) AoO (w, id,name)
    webview.addoptions( oa, el );
  }
  // Fallback try looking for V-related ... and create V-code for options (binds options 2-way). Here or in 
  
  // 
  else { console.log("optel_setup: Elem dataset or dataset.optbind missing!"); }
}

function jgrid_fielddefs(ev, act) {
  let fldinfo = act.fldinfo;
  let viewid = act.viewid || "routerdiv";
  let keys = Object.keys(fldinfo);
  console.log(`${keys.length} fldinfo specs.`);
  function wtype_cell(val, item) {
    if (val == 'options') { return `${val} (${item.optbind})`;}
    return val;
  }
  var fldinfo_fldinfo = [
     {"name": "name",   "title": "Field Label", "type": "text", "width": 20, itemTemplate: null, }, // "wtype": "options", "optbind": "chaintype"
     {"name": "title",   "title": "Field Display Name", "type": "text", "width": 20, itemTemplate: null, },
     {"name": "type",   "title": "Field Type", "type": "text", "width": 20, itemTemplate: null, },

     {"name": "dtype",   "title": "Data Type", "type": "text", "width": 20, itemTemplate: null, },
     {"name": "wtype",   "title": "Widget Type", "type": "text", "width": 20, itemTemplate: wtype_cell, },

     {"name": "width",   "title": "Width (chars)", "type": "text", "width": 20, itemTemplate: null, },
     {"name": "visible",   "title": "Visible", "type": "text", "width": 20, itemTemplate: null, },
     {"name": "itemTemplate",   "title": "Field CB", "type": "text", "width": 20, itemTemplate: (val, item) => { return val ? "CB" : ""; }, },
  ];
  let cont = "";
  // Must create content (onto view) first (jsGrid must be able to address the elem w. griddivid in DOM)
  keys.forEach( (k) => { let griddivid = `jsGrid_flddef_${k}`; cont += `<h3>Grid definition ${k}</h3>\n<div id="${griddivid}" ></div>\n`; });
  $("#" + viewid).html(cont);
  // Pass 2: Setup gridopts + data, let .jsGrid() bind to dom.
  keys.forEach( (k) => {
    //if (cont) { return; } // TEST/DEBUG
    let fsc = fldinfo[k];
    // if (act.skipself && (k == 'fldinfo')) {}
    if (!Array.isArray(fsc)) { console.log("FSC not in array format"); return; }
    let griddivid = `jsGrid_flddef_${k}`;
    //cont += `<h3>Grid definition ${k}</h3>\n<div id="${griddivid}" ></div>\n`;
    // TODO: Consider making this lighterweight grid as there will never be many pages, fldinfo_fldinfo is fixed, etc.
    //gridder.showgrid(griddivid, fldinfo[k], fldinfo_fldinfo);
    let mydb = {datakey: griddivid, filterdebug: 1,  uisruncnt: 0}; // loadData: js_grid_filter,
    mydb[griddivid] = fsc;
    let gridopts = {data: fsc, fields: fldinfo_fldinfo, controller: mydb,
      width: "100%", // pageSize: 100, sorting: true, paging: true, filtering: true, // height: "100%",
      }; // gridder.showgrid_opts() ?
    $("#" + griddivid).jsGrid(gridopts);
    console.log(`Added (to div ${griddivid}) data as grid: `, fldinfo[k]);
  });
  
}
// See handler simplegrid_url
function ghprojs_uisetup(act, data) {
  var k = "ghorgs"; // 
  if (act.path == 'glprojs') { k = "glorgs"; }
  var fs = datasets.cfg[k]; // datasets.cfg.docker.files;
  console.log("ghprojs_uisetup ..."+ fs);
  //console.log("Got Action: ", act);
  var cont = "";
  // toastr.info(fs);
  fs.forEach((name) => { cont += "<span class=\"vmglink mpointer\" data-dcfn=\""+name+"\">"+name+"</span>\n"; });
  $(".xui").html(cont);
  // $(".xui").html("Hello !"); // OK
  $(".xui").show();
  // TODO: Must inject parameters to event (that should be accounted for by simplegrid_url)
  $(".vmglink").click(function (jev) {
    //toastr.info("Click on "+Object.keys(jev));
    toastr.info("Show projects of Org/User "+this.dataset.dcfn);
    // TODO: Grab this from original act ? act.hdlr
    // Because this does no go through router pre-handler, we must set viewtgtid manually
    // TODO: High level imperative routing that consults pre-handler. Existing method ?
    jev.viewtgtid = "routerdiv";
    simplegrid_url(jev, act);
  });
}
// Like docker / dcomposer_uisetup
// dsattr, cfgattr (array in datasets.cfg[...] or getter cb), (url)parakey
// TODO: param
function ghprojs_urlpara(ev, act) {
  var val; // dcfn
  var ckey = "ghorgs"; // Config key
  if (act.path == "glprojs") { ckey = "glorgs"; } // Detect from action
  var ds = ev.target.dataset;
  if (ds && ds.dcfn) { val = ds.dcfn; }
  if (!val && datasets.cfg[ckey]) { val = datasets.cfg[ckey][0]; }
  //return "fn="+dcfn; // OLD: params only
  return act.url + "?org="+val; // NEW: Resp. for whole URL
}

function certsys_uisetup(act, data, ev) {
  //var idx = {};
  //data.forEach((it) => { idx[it.idlbl] = it; });
  $("[data-sysid]").click(function (jev) {
    // See: showpeople
    var idlbl = jev.target.dataset.sysid;
    //alert("Hello "+ idlbl);
    //var e = idx[idlbl];
    //console.log(e);
    var act = tabloadacts.filter((a) => { return a.path == "certfiles"; })[0];
    if (!act) { console.log("No Action"); return; }
    var url = act.url + "?systype=" + idlbl;
    axios.get(url).then((resp) => {
      let e = resp.data.data;
      // Set data to event, Call dialog hdlr(ev, act) gendialog(ev, act)
      jev.viewdata = e;
      gendialog(jev, act);
    });
    
  });
  
}
function afaimgs_uisetup(act, data, ev) {
  $("[data-imgpath]").click(function (jev) {
    var p = {imgpath: jev.target.dataset.imgpath, tag: jev.target.dataset.tag};
    //alert("IMGPATH:"+p.imgpath+", TAG:"+p.tag);
    // MUST search another action ???
    var act = tabloadacts.filter((a) => { return a.path == "afaimginfo"; })[0];

    axios.get("/imgmani", {params: p}).then((resp) => {
      var d = resp.data;
      console.log(d);
      jev.viewdata = d.data;
      gendialog(jev, act);
    }).catch( (ex) => { console.log(ex); });
  });
}
