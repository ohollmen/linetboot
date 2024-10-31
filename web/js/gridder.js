var rapp;
var gridder = {};

// NOT in use ? (w. new showgrid_*)
/*
var db = {
  datakey: "hosts",
  filterdebug: 1,
  // The filter here is an object keyed by col names
  // this here is the db
  loadData: js_grid_filter
};
*/
/// Template for default options (to dclone())
var gridopts_std = {
    // TODO: Eliminating 100% makes 2 latter tabs out of 3 not show !
    width: "100%",
    //height: "400px",
    pageSize: 120,
    //inserting: true,
    //editing: true,
    sorting: true,
    paging: true,
    filtering: true,
    
    data: null, // griddata,
 
    controller: null, // db,
    // rowClass: function (item,itemidx) { return "redhat"; },
    // rowClick: function (evpara) { alert("Row Click !"); },
    fields: null, // fields
  };

/** Generate Internal Grid config with good defaults, embedding/attaching data and filed defs to config. Used (only) internally by showgrid() (Not part of external API).
 */
function showgrid_opts(divid, griddata, fields) {
  var gridopts = rapp.dclone(gridopts_std);
  gridopts.data   = griddata;
  gridopts.fields = fields;
  // NOTE: Use a unique thing for datakey: ... (e.g. divid OR append name props of fields ...)
  var mydb = {datakey: divid, filterdebug: 1, loadData: js_grid_filter, uisruncnt: 0}; // rapp.dclone(db);
  //mydb.loadData = js_grid_filter;
  mydb[divid] = griddata; // TODO: retroactive check on docs: why also here (See gridopts.data above). for rapp (cb passing) purposes ?
  gridopts.controller = mydb;
  //NOT: gridopts.controller = db; // Global
  return gridopts;
}
gridder.showgrid_opts = showgrid_opts;

/** Filter items in JSGrid by a filter (k=v) object.
 * The controller / "db" object(of gridopts)  gets applied as "this" here.
 * See showgrid
 */
function js_grid_filter (filter) {
  var debug = this.filterdebug || 0;
  debug && console.log("Grid-Filter:" + JSON.stringify(filter));
  debug && console.log("Grid-filter-This:", this);
  if (!this.datakey) { throw "Data key not defined for filtering";  } // return;
  if (!this[this.datakey]) { throw "Data key ("+this.datakey+") does not exist in controller"; } // return;
  var myarr = this[this.datakey];
  if (!Array.isArray(myarr)) { throw "Data key ("+this.datakey+") in controller is not array (dataset) form"; } // return;
  var fkeys = Object.keys(filter).filter((k) => { return filter[k]; });
  var matchers = filter_matchers(filter, fkeys);
  if (debug) { console.log("Actual Filter keys:" + JSON.stringify(fkeys)); }
  var arr = myarr.filter(function (item) { // db[this.datakey]
    //console.log("Host: ", item);
    //return {"hname": "foo"};
    var fk; // var keep = 1;
    for (var i = 0;fk = fkeys[i];i++) {
      ////var fval = filter[fk];
      // console.log(fk +"="+fval);
      // console.log("No Filter for " + fk);
      ////if (!filter[fk]) {  continue; } // Filter is always string
      ////var re = new RegExp(fval);
      var re = matchers[fk];
      if (!item[fk]) { console.log("No property '" + fk + "' in row object: ", item); return 0; } // Orig: continue; Eliminate / return 0;
      var t = typeof item[fk];
      // The following can be e.g. 'object' (where itemTemplate: ... makes it display a reasonable value)
      if (typeof item[fk] != 'string') { debug && console.log("Not a string to match in '"+fk+"': "+item[fk]+" got:"+t); continue; }
      if (item[fk].match(re)) { debug && console.log("Match in key = "+fk+", val = " + item[fk]); continue; }
      return 0;
      //keep = 0; // NA
    }
    return 1; // keep
  }); // filter
  if (debug) { console.log("After filter:" + arr.length + " items"); }
  return arr;
  // Create regexp matchers by *actual* (in-effect) filter keys.
  function filter_matchers(filter, fkeys) {
    var matchers = {};
    if (!Array.isArray(fkeys)) { return null; }
    fkeys.forEach((fk) => {
      var fval = filter[fk];
      if (!fval) { return; }
      var re = new RegExp(fval);
      matchers[fk] = re;
      // matchers[fk] = new RegExp(filter[fk]);
    });
    return matchers;
  }
}
gridder.js_grid_filter = js_grid_filter;
// $("#jsGrid").jsGrid("sort", field);
// NOTE: The new showgrid_opts() makes the controller short-lifetime, per grid instance (no global interference)
// http://js-grid.com/docs/#callbacks
// See: showgrid_opts() (called here), js_grid_filter() as db.loadData CB.
// Gets config info from act (uisetup, ), act also gets attached to gridopts.controller.act = act;
// Internally scoped onRefreshed CB also calls act.uisetup(act, data)
// TODO: new Gridder(), expose gridopts, db, allow setting by opts() (override any) before calling showgrid()
function showgrid (divid, griddata, fields, act) {
  // toastr.error
  if (!divid || typeof divid != 'string') { return toastr.error("showgrid: Div id not passed !"); }
  if (!Array.isArray(griddata)) { toastr.error("No Grid data " + divid); return; }
  if (!Array.isArray(fields)) { toastr.error("No fields data " + divid); return; }
  console.log("showgrid: Generating grid into div (id): " + divid + " w. "+griddata.length+" items.");
  // "#jsGrid"
  // var gridopts = rapp.dclone(gridopts_std); // Not only this
  // Generate Grid specific opts
  var gridopts = showgrid_opts(divid, griddata, fields);
  // First arg (obj) has: pageIndex:1, grid: ... Complemented gridopts w. extra. Has controller !!!
  // NOTE: Data has been changed (e.g. filtered), but NOT sure if page has been re-rendered to hook callbacks
  // So while callback triggers fine, the timing of hook seems not right. See onRefreshed
  /*
  gridopts.onPageChangedXX = (gridev) => { // No second arg console.log("Grid changed 2nd: ", foo);
    console.log("Grid-changed: ", gridev);
    var grid = gridev.grid; // Has e.g. _sortOrder, onPageChanged (itself), _validation, paging: false
    var ctrl = gridev.grid.controller;
    console.log("Grid-changed controller: ", ctrl);
    // Test with .hostcell
    
  };
  */
  // Notes on onRefreshed callback: Triggers *after* grid rendered, does not have the pageIndex
  if (act && act.uisetup) { // MUST have uisetp (to be of any use)
    console.log("showgrid(): Setup onRefreshed");
    gridopts.controller.act = act; // Allows act to follow where ever contoller is available !!!
    gridopts.onRefreshed = onRefreshed;
  }
  $("#" + divid).jsGrid(gridopts);
  // Emit (done divid) !
  //ee.emit("on_"+divid+"_done", { msg: "Hello!", divid: divid }); // New: Disabled
  
  // Re-run uisetup on refreshed grid (based on gridevent description)
  function onRefreshed(gridev) {
    //console.log("Grid-refreshed: ", gridev);
    var grid = gridev.grid; // Has e.g. _sortOrder, onPageChanged (itself), _validation, paging: false
    var ctrl = grid.controller; // controller / db object w. act object (and thus act.uisetup callback), uisruncnt (ui setup run count)
    var data = grid.data; // AoO for grid data
    //console.log("Grid-refreshed controller: ", ctrl);
    //$(".hostcell").click(() => { alert("Re-hooked"); }); // Test: Works !
    // Note: can use 1) closure act coming to showgrid() IFF onRefreshed() is inside it ... OR 2) attach act to controller
    let act = ctrl.act; // Controller stored act
    if (!act) { console.log("No act present, even if pre-validated !!!"); return; }
    if (!act.uisetup) { console.log("No act.uisetup present, even if pre-validated !!!"); return; }
    //if (ctrl.uisruncnt) {
    console.log("UI Setup has been run by grid N times: "+ctrl.uisruncnt); // }
    if (ctrl.uisruncnt && act.noresetup) { console.log("Prevent uisetup rerun");return; }
    act.uisetup(act, data); // act.uisetup was checked above
    ctrl.uisruncnt++; // Inc number of act.uisetup() calls run.
  }
}
gridder.showgrid = showgrid;
