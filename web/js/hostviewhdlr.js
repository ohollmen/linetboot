
// OS/Version view ?
function osview_guisetup() {
  // 3x views. Now in more specific location
  $(".hostcell").click(on_host_click);
  // 1x (osview)
  // Need this (to avoid trigger multiple times): $(".drinfo").off("click"); ???
  $(".drinfo").click(on_docker_info);
  $(".nfsinfo").click(on_docker_info);
}

/** Create Simple grid from pre-loaded (cached) data.
 * 
 */
function simplegrid_cd(ev, an) {
  //document.getElementById(an.elsel).innerHTML =
  contbytemplate(an.tmpl, an, an.elsel);
  // Extract fldinfo label from 
  var m = an.gridid.match(/^jsGrid_(\w+)/);
  if (!m || !m[1]) { return alert("simplegrid_cd: Not a valid grid !"); }
  var d = datasets["hostlist"];
  showgrid(an.gridid,  datasets["hostlist"], fldinfo[m[1]]);
  if (an.uisetup) { an.uisetup(); } // TODO: Params ? (see rapp)
}

/** Display Hosts in Groups (in mutiple grids)
 */
function hostgroups(ev, act) {
  var elsel = ev.routepath ? "routerdiv" : act.elsel;
  //console.log("Generate into: " + elsel);
  $('#' + elsel).html(''); // Clear
  axios.get(act.url).then(function (resp) { // '/groups'
    grps = resp.data; // AoOoAoO...
    if (!grps || !grps.length) { $('#' + elsel).html("No groups in this system"); return; }
    // TODO: Template ?
    //console.log(JSON.stringify(grps, null, 2));
    grps.forEach(function (g) {
      var harr = g.hosts;
      $('#' + elsel).append("<h2>"+g.name+" ("+ harr.length +")</h2>\n");
      $('#' + elsel).append("<div id=\"grp_"+ g.id +"\"></div>\n");
      showgrid("grp_"+g.id, harr, fldinfo["hw"]);
    });
  }).catch(function (error) { console.log(error); });
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
  axios.get(act.url).then(function (resp) { // '/nettest'
    var pinfo = resp.data.data;
    // console.log("Probe data: ", pinfo);
    if (!pinfo || !pinfo.length) { alert("No Net Probe data"); return; }
    showgrid("jsGrid_probe", pinfo, fldinfo.netprobe);
    //$("#proberun").click(function () { probeinfo(); }); // Reload. TODO: Wait ...
  }).catch(function (error) { console.log(error); });
}
/** Load Process and Uptime Information.
 */
function loadprobeinfo(event, act) {
  toastr.info("Running Load Probe ... Please Wait ...");
  axios.get(act.url).then(function (resp) {
    var pinfo = resp.data.data;
    // console.log("Probe data: ", pinfo);
    if (!pinfo || !pinfo.length) { alert("No Load Probe data"); return; }
    showgrid("jsGrid_loadprobe", pinfo, fldinfo.proc);
    //$("#proberun").click(function () { probeinfo(); }); // Reload. TODO: Wait ...
    if (act.uisetup) { act.uisetup(); console.log("CALLED UISETUP"); }
  })
  .catch(function (error) { console.log(error); });
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
    // $("#").click(function () { zzzzz(); }); // Reload. TODO: Wait ...
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
  }
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

function dockercat_show(ev, act) {
  var tgtid = ev.routepath ? "routerdiv" : act.elsel;
  axios.get("/dockerenv").then(function (resp) {
    var d = resp.data;
    if (!d || !d.data) { return $('#denvinfo').html("No Docker Env. Info"); }
    //console.log(d.data);
    // Late-Templating (after we have data)
    var cont = rapp.templated("dockercat", d.data);
    // act.elsel
    $('#'+tgtid).html(cont); // Redo with results of late-templating (w. d.data)
    showgrid ("jsGrid_dockercat", d.data.catalog, fldinfo.dockercat);
    // Docker sync ops
    $(".docksync").click(function (jev) {
      var img = this.getAttribute("data-image"); // .dataset.image;
      //console.log(img);
      var hgrp; try {
        hgrp = datasets.cfg.docker.hostgrp; if (!hgrp) {  throw "No value !"; }
      } catch (ex) { console.log("Docker hostgrp EX: "+ex); return toastr.error("No Docker Host Group"); }
      var p = {hostgroups: [hgrp], "playbooks": ["./playbooks/docker_pull.yaml"], xpara: {image: img}}; // See: ansirun
      console.log(p);
      // Run ansible w. params /ansrun
      axios.post("/ansrun", p).then(function (resp) {
        var r = resp.data;
        toastr.info(r.msg);
      });
    });
  }).catch(function (err) { alert(err); });
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
  .fail(function (jqXHR, textStatus, errorThrown) { throw "Failed to load item: "+textStatus; });
  // axios.get(url).then((resp) => { cfg.initdocs(resp.data); })
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
    return "<a class=\"recipecell\" data-hn=\""+item.hname+"\" data-ip=\""+item.ipaddr+"\">"+val+"</a>";
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
      console.log("EV:", jev); // event.type
      console.log("THIS:", this);
      console.log("TGT:", jev.target);
      var p = this.dataset; // Use datase directly as params, add some params
      p.rname = this.textContent;
      //p.url = this.href;
      p.url = p.rname + "?ip=" + p.ip;
      p.type = "text/plain;charset=utf-8";
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

function loginform(ev, act) {
  if (!ev.viewtgtid) { console.log("Routing Failed to set target view"); return; }
  rapp.templated(act.tmpl, act, ev.viewtgtid);
  $("#nav").hide();
  $("#loginbut").click(function () {
    var p = { username: $("#username").val(), password: $("#password").val() };
    // var pp = {}; // POST params - Not needed, use p directly
    // BAD: leaves express middleware logging creds !
    // axios.get("/login", {params: p}).then( function (resp) {
    // POST (more securely)
    axios.post("/login", p).then( function (resp) {
      var d = resp.data;
      console.log("Response:", d);
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
  function search(p) {
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
      
    }).catch (function (ex) { console.log(ex); });
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
  }).catch (function (ex) { console.log(ex); });
}

function eflowlist(ev, act) {
  //console.log("EFlow ...");
  rapp.templated("simplegrid", act, ev.viewtgtid);
  toastr.info("Request Resource Info from EFlow ... please wait...");
  axios.get(act.url).then(function (resp) { // "/eflowrscs"
    var d = resp.data;
    if (d.status == 'err') { toastr.clear(); return toastr.error("Failed search: " + d.msg); }
    if (!d.data) { return toastr.error("No Data Found."); }
    if (!Array.isArray(d.data)) { return toastr.error("Data Not in Array."); }
    console.log(d.data);
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
      .finally(() => { $(uithis).prop('disabled', false); })
    });
  }).catch (function (ex) { console.log(ex); });
}

/** Show all guests from a VM Host.
 * TODO: Use xui to show navi list of servers ?
 */
function esxilist(ev, act) {
  rapp.templated("simplegrid", act, ev.viewtgtid);
  var cfg = datasets["cfg"];
  toastr.clear();
  if (cfg.vmhosts) { esxihostmenu(act, cfg.vmhosts); }
  // Figure out host (default to ... (first?) ?)
  // From a-element (may be a global navi link, or host specific link)
  var ds = ev.target.dataset;
  var host;
  if (ds && ds.ghost) { host = ds.ghost; }
  if (!host && cfg.vmhosts) { host = cfg.vmhosts[0]; }
  if (!host) { return toastr.error("No Default host available."); }
  console.log("Search by: "+ host);
  var url = act.url + host;
  toastr.info("Request ESXI Host VM Info ... please wait...");
  axios.get(url).then(function (resp) {
    var d = resp.data;
    toastr.clear();
    if (d.status == 'err') { toastr.clear(); return toastr.error("Failed search: " + d.msg); }
    if (!d) { return toastr.error("No Data Found."); } // d.data
    if (!Array.isArray(d)) { return toastr.error("Data Not in Array."); } // d.data
    console.log(d); // d.data
    showgrid(act.gridid, d, fldinfo.esxilist); // d.data
    
  }).catch (function (ex) { console.log(ex); });
  //function loadhostglist(host) {
  //  
  //}
}
/* */
function esxihostmenu(act, vmhosts) {
  var cont = "";
  vmhosts.forEach((h) => { cont += "<span class=\"vmglink\" data-ghost=\""+h+"\">"+h+"</span>\n"; });
  $(".xui").html(cont);
  $(".xui").show();
  $(".vmglink").click(function (ev) { esxilist(ev, act); });
  //return cont;
}
//////////// Dialog handlers ////////////////////
