
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
  }).catch(function (error) { console.log(error); });
}
/** Create Remote management info (grid).
* Note: hosts unused (!)
*/
function rmgmt(ev, act) {
  
  axios.get('/hostrmgmt').then(function (response) {
    // SHared global for event handler... on_rmgmt_click
    rmgmt_data = response.data; // TODO: .data
    // console.log("Remote Mgmt data: ", rmgmt_data);
    if (!rmgmt_data || !rmgmt_data.length) { alert("No rmgmt data"); return; } // Dialog
    var hr = 0; // Has remote management
    if (!rmgmt_data.filter((it) => {it.ipaddr}).length) { $('#'+act.elsel).append("<p>Remote management not in use in this environment.</p>"); return; }
    showgrid("jsGrid_rmgmt", rmgmt_data, fldinfo.rmgmt);
    // $("jsGrid_rmgmt .hostcell").click(on_rmgmt_click); // UI Setup
  })
  .catch(function (error) { console.log(error); });
}

/** Do network geared probing for DNS, ping, SSH
 */
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
/** Load Process and Uptime Information.
 */
function loadprobeinfo(event, an) {
  //console.log("Launch Probe ...");
  axios.get('/proctest').then(function (response) {
    var pinfo = response.data.data;
    // console.log("Probe data: ", pinfo);
    if (!pinfo || !pinfo.length) { alert("No Load Probe data"); return; }
    showgrid("jsGrid_loadprobe", pinfo, fldinfo.proc);
    //$("#proberun").click(function () { probeinfo(); }); // Reload. TODO: Wait ...
    if (an.uisetup) { an.uisetup(); console.log("CALLED UISETUP"); }
  })
  .catch(function (error) { console.log(error); });
}
/** Display archived (and restorable) hostkeys.
 */
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
/** Display a package comparison view.
 * Note: dot (".") i field name (here: package name, jsgrid: "name") causes a problem in grid
 * because of jsgrid dot-notation support.
*/
function pkgstat() {
  // console.log("Launch Pkg stat ...");
  axios.get('/hostpkgstats').then(function (response) {
    var pinfo = response.data.data;
    var gdef = response.data.grid;
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
  axios.get('/allhostgen').then(function (response) {
    var outtypes = response.data || [];
    var tpara = {outtypes: outtypes};
    //var otmpl = document.getElementById("outputs").innerHTML;
    //var olistout = Mustache.render(otmpl, tpara);
    //olistout += '';
    //document.getElementById("tabs-65").innerHTML = olistout;
    document.getElementById(act.elsel).innerHTML = rapp.templated('outputs', tpara);
    
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
  
  axios.get("/dockerenv").then((resp) => {
    var d = resp.data;
    //console.log(d.data);
    // Late-Templating
    var cont = rapp.templated("dockercat", d.data);
    $('#'+act.elsel).html(cont); // Redo with results of late-templating (w. d.data)
    showgrid ("jsGrid_dockercat", d.data.catalog, fldinfo.dockercat);
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
  var cfg = new docIndex({acc: 0, linkproc: "post", pagetitleid: "dummy", debug: 1, nosidebarhide: 1, acc: 0});
  docIndex.ondocchange = function (docurl) { console.log("DOC-CHANGE: "+docurl); location.hash = '#nop'; };
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
};



//////////// Dialog handlers ////////////////////