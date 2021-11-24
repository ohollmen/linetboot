var spinopts = {lengthX: 37, widthX: 10, scale: 5, color: '#555', top: '80%'}; // TODO: Global (consistent)

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
 */
function simplegrid_cd(ev, an) {
  //document.getElementById(an.elsel).innerHTML =
  contbytemplate(an.tmpl, an, an.elsel);
  // rapp.templated(an.tmpl, an, an.elsel);
  // Extract fldinfo label from gridid (... or alternative way ?)
  var m = an.gridid.match(/^jsGrid_(\w+)/);
  if (!m || !m[1]) { return alert("simplegrid_cd: Not a valid grid !"); }
  var dsid = "hostlist";
  // var fsid = m[1];
  if (an.dsid) { dsid = an.dsid; }
  var d = datasets[dsid];
  if (!d) { return alert("No dataset found"); }
  if (!Array.isArray(d)) { return alert("dataset no in array"); }
  showgrid(an.gridid,  d, fldinfo[m[1]]);
  if (an.uisetup) { an.uisetup(); } // TODO: Params ? (see rapp)
}
/** Simple grid from URL.
 */
function simplegrid_url(ev, an) {
  console.log("simplegrid_url URL:", an.url);
  //$('#vtitle').html(act.name);
  var url = an.genurl ? an.genurl(act) : an.url;
  var ttgt = ev.viewtgtid || an.selsel;
  var para = "";
  if (an.urlpara && (para = an.urlpara(ev, an))) { url += "?" + para; }
  axios.get(url).then( function (resp) {
    var data = resp.data;
    var arr = (data && data.data) ? data.data : data; // AoO
    // TODO: Refine logic
    if (data.status == 'err') { return toastr.error(data.msg); }
    if (!arr || !Array.isArray(arr)) { return toastr.error("Simplegrid: No data (as array)"); }
    //var an2 = rapp.dclone(an);
    contbytemplate(an.tmpl, an, ttgt); //document.getElementById('content').innerHTML =

// NEW: Look for extended ui generator (was: an.xuigen)
// Must be late, after templating !!
if (an.uisetup && (typeof an.uisetup == 'function')) {
  console.log("Calling UI-Setup for "+an.name);
  an.uisetup(an);
}

    showgrid(an.gridid, arr, fldinfo[an.fsetid]); // 
    return;
    /////////////////////////////////////////////////////////
    var cfg = rapp.dclone(rapp.gridcfg);
    //var fi = window.fi; // Alt fields "cache" ? || rapp.fi || 
    cfg.data = arr; cfg.fields = fi[act.gridid];
    $("#" + act.gridid).jsGrid(cfg);
    //console.log(JSON.stringify(arr, null, 2));
  })
  .catch(function (error) { console.log(error); });
}

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
function hostgroups(ev, act) {
  var elsel = ev.routepath ? "routerdiv" : act.elsel;
  //console.log("Generate into: " + elsel);
  $('#' + elsel).html(''); // Clear
  var nattr = act.nattr || "name";
  var ida = act.ida || "id";
  var colla = act.colla || "items"; // items ? ("hosts" already in org act node)
  var fsid = act.fsid; // NO default
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
      if (typeof act.uisetup == 'function') { act.uisetup(arr); } // act
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
  
  axios.get('/hostrmgmt').then(function (resp) {
    // Shared global for event handler... on_rmgmt_click
    rmgmt_data = resp.data; // TODO: .data
    // console.log("Remote Mgmt data: ", rmgmt_data);
    if (!rmgmt_data || !rmgmt_data.length) { alert("No rmgmt data"); return; } // Dialog
    var hr = 0; // Has remote management
    if (!rmgmt_data.filter((it) => {return it.ipaddr; }).length) { $('#'+act.elsel).append("<p>Remote management not in use in this environment.</p>"); return; }
    showgrid("jsGrid_rmgmt", rmgmt_data, fldinfo.rmgmt);
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
    if (!pinfo || !pinfo.length) { toastr.error("No Net Probe data"); return; }
    showgrid("jsGrid_probe", pinfo, fldinfo.netprobe);
    //$("#proberun").click(function () { probeinfo(); }); // Reload. TODO: Wait ...
  }).catch(function (error) {  console.log(error); }) // spinner.stop();
  .finally(() => { spinner.stop(); });
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
    // spinner.stop();
    // console.log("Probe data: ", pinfo);
    if (!pinfo || !pinfo.length) { toastr.error("No Load Probe data"); return; }
    showgrid("jsGrid_loadprobe", pinfo, fldinfo.proc);
    //$("#proberun").click(function () { probeinfo(); }); // Reload. TODO: Wait ...
    if (act.uisetup) { act.uisetup(); console.log("CALLED UISETUP"); }
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
    if (!pinfo || !pinfo.length) { toastr.error("No SSH Key data"); return; }
    showgrid("jsGrid_sshkeys", pinfo, fldinfo.sshkeys);
    $(".sshkeyload").click(function () {
      // Get host
      var p = this.dataset;
      console.log(p);
      var hname = p.hname; // See: onrecipeclick this.dataset
      toastr.info("TODO: load keys for "+hname);
      // trigger ansible
      var p = {hostnames: [hname], playbooks: ["sshkeyarch.yaml"], playprofile: ""}; // See: ansishow
      //return;
      axios.post("/ansrun", p).then((resp) => {
        console.log("Key archive launched ok");
       // Reload data and grid ? showgrid("jsGrid_sshkeys", pinfo, fldinfo.sshkeys); sshkeys(ev, act) ???
      }).catch((ex) => { console.log("Failed key arch launch: "+ex); })
      .finally(() => { console.log("Finally there"); });
      //zzzzz();
    }); // Reload. TODO: Wait ...
  }).catch(function (error) { console.log(error); });
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
/** Show Info on catalogued Docker images.
 * - Pass top-level Object that came in response data as data to templating
 * - Pass auto-discovered or explicitly defined array set (by member name) to grid generator
 */
function dockercat_show(ev, act) {
  var tgtid = ev.routepath ? "routerdiv" : act.elsel;
  var url = act.url;
  console.log("GET: "+url);
  axios.get(url).then(function (resp) { // "/dockerenv"
    var d = resp.data;
    if (!d) { return toastr.error("No data in HTTP request (resp.data) !"); }
    d = d.data || d; // Try to pick "data"
    // || !d.data
    if (!d ) { return $('#denvinfo').html("No "+act.name+" Info"); } // Docker Env.
    console.log("DATA:", d);
    console.log("Place data to id: "+tgtid);
    var el = document.getElementById(tgtid);
    if (!el) { toastr.error(tgtid + " - No such element !"); }
    // Late-Templating (after we have data). Pass top-level data here
    var cont = rapp.templated(act.tmpl, d); // '#'+tgtid // "dockercat"
    if (!cont) { console.log("No templated content\n"); }
    // act.elsel
    
    $('#'+tgtid).html(cont); // Redo with results of late-templating (w. d.data)
    // TODO: Where to get 1) grid-array member (gdatamem, gdmem) ? 2) fldinfo key (same as tmpl name ?) ?
    var fiid = act.fsid || act.tmpl;
    
    var garrmem = act.gdmem || autoarray(d);
    console.log("FIID: "+fiid+", gdmem:"+garrmem);
    showgrid (act.gridid, d[garrmem], fldinfo[fiid]); // "jsGrid_dockercat", d.data.catalog, .dockercat
    // TODO: Style w. padding, etc.
    // var dgopts = {}; // style for table ?
    //OLD: $("#jsGrid_dockercat").html(webview.listview_jsg(d.data.catalog, fldinfo.dockercat, dgopts));
    
    if (act.path == 'dockerenv') { uisetup_dockercat(act); }
    if (act.path == "bootables") { uisetup_bootables(act); }
    // TODO: if (act.uisetup) { act.uisetup(act); }
  function uisetup_bootables(act) {
    axios.get("/bs_statuses").then((resp) => {
        
        var d = resp.data.data;
        if (!Array.isArray(d)) { return toastr.error("Not in array"); }
        toastr.info("ISO statuses from "+d.length+" sources retrieved !");
        d.forEach((img) => {
          var id = "bsstatus_"+img.lbl;
          console.log("Try set: "+id);
          $("#"+id).html(img.status ); // + "("+img.code+")"
          $("#"+id).attr('style', 'color: '+code2color(img.code)); // Color ...
        });
      }).catch((ex) => {  alert("Error !"); });
      function code2color(code) {
        if ((code >= 200) && (code < 300)) { return "#33FF33"; }
        return "#AA0000";
      }
  }
  // UI Setup: Docker sync ops
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
      axios.post("/ansrun", p).then(function (resp) {
        var r = resp.data;
        if (r.status == 'err') { toastr.error(r.msg); }
        else { toastr.info(r.msg); }
      });
    });
  } // uisetup

  }).catch(function (err) { return toastr.error(err, "Error getting "+act.name+" from "+act.url); });
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
/** Display docker-imager config files */
function dockerimg_show(ev, act) {
  
}

function showdocindex (ev, act) {
  // Mimick flow from docindex_main.js
  //var tgtid = ev.routepath ? "routerdiv" : act.elsel;
  if (ev.routepath) { rapp.templated("docs", null, "routerdiv"); }
  var cfg = new docIndex({acc: 0, linkproc: "post", pagetitleid: "dummy", debug: 1, nosidebarhide: 1 });
  docIndex.ondocchange = function (docurl) {
    console.log("DOC-CHANGE: "+docurl);
    // location.hash = '#nop';
  };
  var url = act.idxurl || act.url || "/docindex.json";
  //if () {}
  //console.log("Staring load: "+ url);
  $.getJSON(url).done(function (d) {
    //console.log("Completed load: "+ url);
    //console.log(d);
    cfg.initdocs(d);
  })
  .fail(function (jqXHR, textStatus, errorThrown) { toastr.error("Failed to load item: "+textStatus); });
  // axios.get(url).then((resp) => { cfg.initdocs(resp.data); }).catch((ex) => { toastr.error("Error loading docs");});
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
  axios.get("/tftplist").then(function (resp) {
    var d = resp.data;
    console.log(d);
    showgrid("jsGrid_pxelinux", d.data, fldinfo.pxelinux);
    // Handle Click on (Default Boot) Reset Link
    $(".defboot").click(defboot_reset);
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
  axios.get("/medialist").then(function (resp) {
    var d = resp.data;
    console.log(d);
    showgrid("jsGrid_bootmedia", d.data, fldinfo.bootmedia);
    // Handle Click on Media Info
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
  }).catch(function (err) { console.log(err); });
}

/** Present a Preview grid on various supported recipes.
 * Should also include other templated content (e.g. boot menu).
 */
function recipes() {
  function recipe_cell(val, item) {
    // href=\""+val+"?ip="+item.ipaddr+"\"
    //var ccont = val; // ORIG
    var ccont = "<i class=\"glyphicon glyphicon-play\"></i>"; // Icon !
    return "<a class=\"recipecell\" data-hn=\""+item.hname+"\" data-ip=\""+item.ipaddr+"\" data-rname=\""+val+"\" title=\""+val+" for "+item.hname+"\">"
      +ccont+"</a>";
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
      var p = this.dataset; // Use datase directly as params, add some params
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
    showgrid(act.gridid, d, fldinfo[act.fdefs]);
  }).catch((ex) => { toastr.error(ex); });
}

function loginform(ev, act) {
  if (!ev.viewtgtid) { console.log("Routing Failed to set target view"); return; }
  rapp.templated(act.tmpl, act, ev.viewtgtid);
  $("#nav").hide();
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
      datasets.cfg.username = d.data.username;
      location.hash = "basicinfo";
      $("#nav").show();
    }).catch(function (ex) { console.log("Error in login: "+ex.toString()); } );
    return false;
  });
}
function logout(ev, act) {
  $("#"+ev.viewtgtid).html('');
  
  // {params: p}
  axios.get("/logout").then( function (resp) {
    var d = resp.data;
    // NO: return; 
    if (d.status == "err") { toastr.error("Logout Failed: " + d.msg); }
    else {
      //$("#"+ev.viewtgtid).html()
      toastr.info('Logged out Successfully');
    }
    $("#nav").hide();
    // Only the form is no going to help
    //rapp.templated("loginform", act, ev.viewtgtid);
    var a2 = tabloadacts.filter((an) => { return an.path == "loginform"; })[0];
    loginform(ev, a2);
    
  }).catch(function (ex) { console.log("Error in logout: "+ex.toString()); } );
  
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
      showgrid(act.gridid, uarr, fldinfo.ldad);
      // if (cb) { cb(d.data); }
      // Need to index or populate id / sequence numbers
      var idx = {};
      d.data.forEach((it) => { idx[it.sAMAccountName] = it; });
      console.log("Assign click hdlr");
      // TODO: Alternatively fetch by DN
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
  $('#sbutt').click(function () {
    var p = {uname: $("#uname").val()};
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
  axios.get("/ibshowhost").then(function (resp) {
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
    d.data.forEach((item) => {
      if ((item.ipaddr_ib != item.ipaddr) || (item.macaddr_ib != item.macaddr)) { item.needsync = 1; }
      // Bug in jsgrid ? boolean false in "usedhcp" (type: "string") shows as "", but true shows as "true" (!).
      // See also jsgrid doc and jsGrid.fields for type-extensibility.
      item.usedhcp = typeof item.usedhcp == 'undefined' ? "" : item.usedhcp.toString();
    });
    showgrid(act.gridid, d.data, fldinfo.iblox);
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
  }).catch (function (ex) { console.log(ex); })
  .finally( () => { spinner.stop(); });
}

function eflowlist(ev, act) {
  //console.log("EFlow ...");
  rapp.templated("simplegrid", act, ev.viewtgtid);
  toastr.info("Request Resource Info from EFlow ... please wait...");
  var spel = document.getElementById(ev.viewtgtid); // spinner && spinner.stop();
  var spinner = new Spinner(spinopts).spin(spel);
  axios.get(act.url).then(function (resp) { // "/eflowrscs"
    var d = resp.data;
    // spinner.stop(); // See finally
    if (d.status == 'err') { toastr.clear(); return toastr.error("Failed search: " + d.msg); }
    if (!d.data) { return toastr.error("No Data Found."); }
    if (!Array.isArray(d.data)) { return toastr.error("Data Not in Array."); }
    //console.log(d.data);
    showgrid(act.gridid, d.data, fldinfo.eflow);
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
      .finally(() => {  $(uithis).prop('disabled', false); })
    });
  }).catch (function (ex) { console.log(ex); })
  .finally( () => { spinner.stop(); });
}

/** Show all guests from a VM Host.
 * TODO: Use xui to show navi list of servers ?
 */
function esxilist(ev, act) {
  var host;
  var cfg = datasets["cfg"];
  toastr.clear();
  rapp.templated("simplegrid", act, ev.viewtgtid);
  if (cfg.vmhosts) { esxihostmenu(act, cfg.vmhosts); }
  else { $('#'+ev.viewtgtid + " " + ".xui").html("No VM hosts in this system.").show(); return; }
  // Figure out host (default to ... (first?) ?)
  // From a-element (may be a global navi link, or host specific link)
  function urlpara() {
    var ds = ev.target.dataset;
    if (ds && ds.ghost) { host = ds.ghost; }
    if (!host && cfg.vmhosts) { host = cfg.vmhosts[0]; }
    return host;
  }
  host = urlpara();
  if (!host) { return toastr.error("No Default host available."); }
  $("#routerdiv h3").html(act.name + " on VM Host " +host);
  console.log("Search by: "+ host);
  var url = act.url + host;
  toastr.info("Request ESXI Host "+host+" VM Info ... please wait...");
  axios.get(url).then(function (resp) {
    var d = resp.data;
    toastr.clear();
    if (d.status == 'err') { toastr.clear(); return toastr.error("Failed search: " + d.msg); }
    if (!d) { return toastr.error("No Data Found."); } // d.data
    if (!Array.isArray(d)) { return toastr.error("Data Not in Array."); } // d.data
    console.log(d); // d.data
    showgrid(act.gridid, d, fldinfo.esxilist); // d.data
    //var csv = $("#"+act.gridid).jsGrid("exportData", expcfg);
    //console.log("CSV:\n",csv);
    console.log("# Guests for "+host);
    //var opts = {sep: ','};
    var csv = gridexp(fldinfo.esxilist, d); 
    console.log(csv);
    
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
  $(".vmglink").click(function (jev) { esxilist(jev, act); });
  
  $("#esxicache").click(function (jev) {
    toastr.info("Caching ... Please Wait");
    axios.get("/esxi/cache").then((resp) => {
      var d = resp.data;
      if (d.status == "ok") { return toastr.info("Cached OK"); }
      return toastr.error("Caching Failed: "+d.msg);
    }).catch((ex) => { return toastr.error("Caching failed (exception) "+ex); })
  });
  //return cont;
}

/** Display API docs.
 * TODO: Get structure and group to sections here.
 */
function apidoc(ev, act) {

  toastr.info("Load API Docs");
  // act.url ... JSON struct
  act.url = "/apidoc?doc=1"; // FORCE (HTML)
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