
// OS/Version view ?
function osview_guisetup() {
  $(".drinfo").click(on_docker_info);
  $(".nfsinfo").click(on_docker_info);
}

/** Create Simple grid from pre-loaded (cached) data.
 * 
 */
function simplegrid_cd(ev, an) {
  document.getElementById(an.elsel).innerHTML = contbytemplate(an.tmpl, an);
  // Extract fldinfo label from 
  var m = an.gridid.match(/^jsGrid_(\w+)/);
  if (!m || !m[1]) { return alert("simplegrid_cd: Not a valid grid !"); }
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
    // SHared global for event handler... on_rmgmt_click
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
    if (!pinfo || !pinfo.length) { alert("No SSH Key data"); return; }
    showgrid("jsGrid_sshkeys", pinfo, fldinfo.sshkeys);
    // $("#").click(function () { zzzzz(); }); // Reload. TODO: Wait ...
  }).catch(function (error) { console.log(error); });
}
/** Display a package comparison view.
 * Note: dot (".") i field name (here: package name, jsgrid: "name") causes a problem in grid
 * because of jsgrid dot-notation support.
*/
function pkgstat(jev, act) {
  // console.log("Launch Pkg stat ...");
  var tgtid = jev.viewtgtid;
  rapp.templated("simplegrid", act, tgtid);
  // Params to pass
  
  var url = act.url + "?"; // encodeURIComponent()
  axios.get(url).then(function (resp) {
    var pinfo = resp.data.data;
    var gdef  = resp.data.grid;
    console.log("Pkg data: ", pinfo);
    if (!pinfo || !pinfo.length) { alert("No Package Data"); return; }
    // Set cell handlers
    gdef.forEach(function (it) {
      if (it.name == 'hname') { return; }
      it.itemTemplate = haspackagecell;
    });
    showgrid("jsGrid_pkgstat", pinfo, gdef);
    
  })
  .catch(function (error) { console.log(error); });
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
/** Show Boot Options and allow set "next boot".
 * 
 */
function bootgui(ev, act) {
  var tgtid = ev.routepath ? "routerdiv" : act.elsel;
  //var cont =
  rapp.templated("bootreq", {}, tgtid);
  // $('#'+act.elsel).html(cont);
  
  // UI Setup
  function boot_select_setup() {
    webview.addoptions(datasets["cfg"].bootlbls, $("#bootlbl").get(0), {});
    webview.addoptions(datasets["hostlist"], $("#hname").get(0), {aid: "hname", aname: "hname"});
  }
  boot_select_setup();
  $("#bootreqsubmit").click(function (jev) {
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
  // DEBUG:alert("Reset " + macfname);
  //var url = "/bootreset?macfname="+macfname;
  var url = "/bootreset?macaddr="+mac; // NEW
  // url += "&macaddr="+mac; // Compat
  axios.get(url).then(function (resp) {
    var d = resp.data;
    if (d.status == "err") { return toastr.error("Error resetting boot by mac "+mac+ "\n"+d.msg); }
    toastr.info("Successfully reset boot to default menu.");
    //showgrid("jsGrid_pxelinux", d.data, fldinfo.pxelinux);
    //tftplist(); // Now on separate tab
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
    return "<a href=\""+val+"?ip="+item.ipaddr+"\">"+val+"</a>";
  }
  axios.get("/recipes").then(function (resp) {
    var d = resp.data;
    console.log(d);
    var fis  = d.grid;
    var urls = d.urls;
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
  }).catch(function (err) { console.log(err); });
}

function loginform(ev, act) {
  if (!ev.viewtgtid) { console.log("Routing Failed to set target view"); return; }
  rapp.templated(act.tmpl, act, ev.viewtgtid);
  $("#nav").hide();
  $("#loginbut").click(function () {
    var p = {username: $("#username").val(), password: $("#password").val()};
    var pp = {}; // POST params
    axios.get("/login", {params: p}).then( function (resp) {
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
    
    axios.get("/ldaptest", {params: p}).then(function (resp) {
      // Populate AoO to grid
      var d = resp.data;
      if (d.status == 'err') { return toastr.error("Failed search: " + d.msg); }
      if (!d.data) { return toastr.error("No Data Found."); }
      if (!Array.isArray(d.data)) { return toastr.error("Data Not in Array."); }
      var uarr = d.data;
      showgrid(act.gridid, d.data, fldinfo.ldad);
      // if (cb) { cb(d.data); }
      // Need to index or populate id / sequence numbers
      var idx = {};
      d.data.forEach((it) => { idx[it.sAMAccountName] = it; });
      console.log("Assign click hdlr");
      $('.unamecell').click(function (jev) {
        console.log("Calling click hdlr");
        var un = this.dataset.uid;
        var e = idx[un];
        //var e = 1;
        console.log(e);
        //alert(e);
        
        //var out = rapp.templated("lduser", e); // app.gridid
        //console.log(out);
        var act = tabloadacts.filter((a) => { return a.path == "uent"; })[0];
        if (!act) { console.log("No Action"); return; }
        jev.viewdata = e;
        gendialog(jev, act);
        return false;
      });
      
    }).catch (function (ex) { console.log(ex); });
  } // search
  $('#sbutt').click(function () {
    var p = {uname: $("#uname").val()};
    search(p);
  });
}
//////////// Dialog handlers ////////////////////
