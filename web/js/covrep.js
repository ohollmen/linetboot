/**/
var charts_cov = {}; // = {};
// Route time handler
rapp.showchart_cov = function (ev, act) {
  //var title = act.name;
  //$('#vtitle').html(act.name);
  //alert("SHOW-C");
  // Make this into
  //var rdivid = ev.tgtid || "content";
  var tgtid = ev.routepath ? "routerdiv" : act.elsel;
  // contbytemplate("t_wait", null, rdivid);
  //showchart2(act, null);
  var ctx;
  var url = act.genurl ? act.genurl(act) : act.url;
  console.log("showchart url: "+url);
  console.log(act);
  // act.dataurl+"?proj="+v
  axios.get(url).then( function (resp) {
    var data = resp.data;
    if (!data) { toastr.error("No data"); return; }
    console.log("Got data !", data);
    console.log("Place content to: "+tgtid);
    // Orig loc for setting template. Late for many things. Try earlier
    //document.getElementById('content').innerHTML =
    contbytemplate(act.tmpl, act, tgtid);
    if (act.setupui && 1) { act.setupui(act); } // && isfunc // //makechartsui(act);
    var chid = act.canid || "";
    try { ctx = document.getElementById(chid).getContext('2d'); }
    catch (ex) { console.log("Exception during canavas search ("+chid+")"); }
    if (!ctx) { console.log("Could not get canvas id");return;  }
    if (data.title) { $('#vtitle').html(data.title); } // Overr
    // Crop ?
    if (act.limit && data.labels.length > act.limit) {
      //function chartdatacrop(data, act) {
      var cnt = act.limit;
      data.labels.splice(cnt, data.labels.length);
      data.datasets.forEach((ds) => { ds.data.splice(cnt, data.labels.length); });
      //}
    }
    var csid = act.canid || "chart1"; // Chart store id
    if (charts_cov[csid]) { charts_cov[csid].destroy(); }
    var chtype = act.chtype || data.typehint || 'line';
    var copts2 = rapp.dclone(rapp.chartcfg); // copts
    if (act.ns) { copts2.scales.yAxes = []; } // yAxes delete(copts2.scales);
    copts2.scales.xAxes = [{ticks: { autoSkip: 0 } }] // HARD-WIRE
    if (act.cmod) { copts2 = act.cmod(data, copts2); } // Chart opts mod
    
    console.log("Chart type: "+chtype);
    charts_cov[csid] = new Chart(ctx, { type: chtype, data: data, options: copts2 });
  }).catch((ex) => { console.log("Charting error: "+ex); });
};

// TODO: Gridview: Allow 1) heuristic data finding (array or resp.data.data) 2) Explicit cb (datafindcb) to lookup AoO for grid
// (with generic error msg when lookup fails: toastr.error("Could not lookup Grid dataset") )

rapp.fetchgrid_cov = function (ev, act) {
  console.log("fetchgrid URL:", act.url);
  var tgtid = ev.viewtgtid || 'routerdiv'; // 'content';
  //$('#vtitle').html(act.name);
  var url = act.genurl ? act.genurl(act) : act.url;
  axios.get(url).then( function (resp) {
    var d = resp.data; // Coverity Object
    //var arr = rapp.respdata(resp);
    var arr = d.viewContentsV1.rows;
    if (!arr || !Array.isArray(arr)) { return alert("No data"); }
    // showgrid("content", arr, fi.builds); // fi.change
    //document.getElementById('content').innerHTML =
    contbytemplate(act.tmpl, act, tgtid);
    showgrid(act.gridid, arr,  fldinfo[act.fsetid]); // Last: act.gridid
    if (0) {
      var cfg = rapp.dclone(rapp.gridcfg);
      var fi = fldinfo; //window.fi; // Alt fields "cache" ? || rapp.fi || 
      //if (!fi) { alert(); }
      cfg.data = arr; cfg.fields = fi[act.gridid];
      $("#" + act.gridid).jsGrid(cfg);
    }
    // UISETUP
    if (act.uisetup) { act.uisetup(act, arr); }
  })
  .catch(function (error) { console.log(error); });
};

function covgrid_uisetup(act, arr) {
  var idx = {};
  arr.forEach((it) => { idx[it.snapshot] = it; });
  //console.log(JSON.stringify(arr, null, 2));
  // data-cid
  $(".ccid").click((jev) => {
    var snid = jev.target.dataset.snid; // Snap
    //console.log(jev.target);
    //console.log("CID: "+cid);
    console.log(idx[snid]);
    //alert(idx[snid]);
  });
}

var acts_cov = [
  // /rep_rel.json => /covtgtchart?rep=rel
  {name: "Release Defects (Chart)", tmpl: "t_chart", url: "/covtgtchart?rep=rel", hdlr: rapp.showchart_cov, path: "rels", setupui: null,
    canid: "canvas_rel", chtype: "bar"},
  // /rep_build.json => /covtgtchart?rep=build 
  {name: "Release Build Defects (Chart)", tmpl: "t_chart", url: "/covtgtchart?rep=build", hdlr: rapp.showchart_cov, path: "builds",
    setupui: null, canid: "canvas_blds", chtype: "bar", limit: 120},
  {name: "Release Defects (Grid)", tmpl: "simplegrid", tmplid: "simplegrid", gridid:"covstr", url: "cov_proj_data.json", hdlr: rapp.fetchgrid_cov, path: "defgrid", }
];
/*
// Note: routerdiv
function preroute_cov (ev, act) {
  ev.tgtid = "routerdiv"; // From act ? act.tgtid || ...
  ev.viewtgtid = "routerdiv";
}
window.onloadXX = () => {
  // alert("Hi Reps !");
  var router = new Router66({ noactcopy: 1, sdebug: 1, pre: preroute_cov}); //defpath: "basicinfo",
  router.add(acts_cov);
  router.start();
  location.hash = "rels"; // ~defpath
};
*/