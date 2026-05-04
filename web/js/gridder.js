// var rapp;
// "Namespace" to add various gridder () "methods" to
var gridder = {
  "dclone": function dclone(d) { return JSON.parse(JSON.stringify(d)); },
};

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
    width: "100%", // Universal good
    //height: "400px",
    pageSize: 120,
    //inserting: true,
    //editing: true,
    sorting: true,
    paging: true,
    filtering: true,
    
    data: null, // grid data
 
    controller: null, // db object controlling (to assign later)
    // rowClass: function (item,itemidx) { return "redhat"; },
    // rowClick: function (evpara) { alert("Row Click !"); },
    fields: null, // field definitions
  };

/** Generate Internal Grid config with good defaults, embedding/attaching data and filed defs to config.
 * Used (only) internally by showgrid() (Not part of external API).
 * @param divid - (globally) Unique divid - will also be used as (unique) key in controller/db object
 * @param griddata - AoO data to display in grid
 * @param fields - Field definitions
 * @return 
 */
function showgrid_opts(divid, griddata, fields) {
  let gridopts = gridder.dclone(gridopts_std); // rapp.dclone(gridopts_std); // Inline cloning ?
  gridopts.data   = griddata;
  gridopts.fields = fields;
  // NOTE: Use a unique thing for datakey: ... (e.g. divid OR append name props of fields ...)
  let mydb = {datakey: divid, filterdebug: 1, loadData: js_grid_filter, uisruncnt: 0}; // rapp.dclone(db);
  //mydb.loadData = js_grid_filter;
  mydb[divid] = griddata; // TODO: retroactive check on docs: Q: why also here (See gridopts.data above). A: for rapp (cb passing) purposes ?
  gridopts.controller = mydb;
  //NOT: gridopts.controller = db; // Do NOT use Global
  return gridopts;
}
gridder.showgrid_opts = showgrid_opts;

/** Filter items in JSGrid by a filter (k=v) object.
 * The controller / "db" object(of gridopts)  gets applied (by jsgrid) appearing as "this"-object here.
 * "this" object may/will convey many useful/necessary params to do the filtering.
 * See showgrid
 */
function js_grid_filter (filter) {
  let debug = this.filterdebug || 0;
  debug && console.log("Grid-Filter:" + JSON.stringify(filter));
  debug && console.log("Grid-filter-This:", this);
  if (!this.datakey) { throw "Data key not defined for filtering";  } // return;
  if (!this[this.datakey]) { throw "Data key ("+this.datakey+") does not exist in controller"; } // return;
  let myarr = this[this.datakey];
  if (!Array.isArray(myarr)) { throw "Data key ("+this.datakey+") in controller is not array (dataset) form"; } // return;
  let fkeys = Object.keys(filter).filter((k) => { return filter[k]; });
  let matchers = filter_matchers(filter, fkeys);
  if (debug) { console.log("Actual Filter keys (from jsgrid):" + JSON.stringify(fkeys)); }
  let arr = myarr.filter(function (item) { // db[this.datakey]
    //console.log("Host: ", item);
    //return {"hname": "foo"};
    let fk; // let keep = 1;
    for (let i = 0;fk = fkeys[i];i++) {
      ////let fval = filter[fk];
      // console.log(fk +"="+fval);
      // console.log("No Filter for " + fk);
      ////if (!filter[fk]) {  continue; } // Filter is always string
      ////let re = new RegExp(fval);
      let re = matchers[fk];
      if (!item[fk]) { console.log("No property '" + fk + "' in row object: ", item); return 0; } // Orig: continue; Eliminate / return 0;
      let t = typeof item[fk];
      // The following can be e.g. 'object' (where itemTemplate: ... makes it display a reasonable value)
      // TODO: refine this logic to make sure all relevant data types work (bool ? number ?)
      // (t == 'number') { }
      if (t != 'string') { debug && console.log("Not a string to match in '"+fk+"': "+item[fk]+" got:"+t); continue; }
      if (item[fk].match(re)) { debug && console.log("Match in key = "+fk+", val = " + item[fk]); continue; }
      return 0;
      //keep = 0; // NA
    }
    return 1; // keep array item 
  }); // filter
  if (debug) { console.log(`After filter: ${arr.length} items`); }
  return arr;
  // Create regexp (string) matchers by *actual* (in-effect) filter keys.
  // TODO: expand this to other types too ? BUT: jsgrid (def.) .type may not have e.g. 'number'
  // TODO: gridder.filter_matchers = filter_matchers;
  function filter_matchers(filter, fkeys) {
    let matchers = {};
    if (!Array.isArray(fkeys)) { return null; }
    fkeys.forEach((fk) => {
      let fval = filter[fk];
      if (!fval) { return; }
      let re = new RegExp(fval);
      // if (!re) { return; } // should validate ?
      matchers[fk] = re;
      // matchers[fk] = new RegExp(filter[fk]);
    });
    return matchers;
  }
}
gridder.js_grid_filter = js_grid_filter;
// $("#jsGrid").jsGrid("sort", field);
// NOTE: The new showgrid_opts() makes the gridopts.controller short-lifetime, per grid instance (no global interference)
// See: http://js-grid.com/docs/#callbacks
// See: showgrid_opts() (called here), js_grid_filter() as db.loadData CB.
// Gets config info from act (uisetup, ), act also gets attached to gridopts.controller.act = act;
// Internally scoped onRefreshed CB also calls act.uisetup(act, data)
// TODO: new Gridder(), expose gridopts, db, allow setting by opts() (override any) before calling showgrid()
function showgrid (divid, griddata, fields, act) {
  // toastr.error
  if (!divid || typeof divid != 'string') { return toastr.error("showgrid: Div id not passed (or is not a string)!"); }
  if (!Array.isArray(griddata)) { toastr.error("No Grid data (as array)" + divid); return; }
  if (!Array.isArray(fields)) { toastr.error("No fields data " + divid); return; }
  console.log(`showgrid: Generating grid into div (id): ${divid}" w. ${griddata.length} items.`);
  // "#jsGrid"
  // let gridopts = rapp.dclone(gridopts_std); // Not only this
  // Generate Grid specific opts
  let gridopts = showgrid_opts(divid, griddata, fields);
  // First arg (obj) has: pageIndex:1, grid: ... Complemented gridopts w. extra. Has controller !!!
  // NOTE: Data has been changed (e.g. filtered), but NOT sure if page has been re-rendered to hook callbacks
  // So while callback triggers fine, the timing of hook seems not right. See onRefreshed
  /*
  gridopts.onPageChangedXX = (gridev) => { // No second arg console.log("Grid changed 2nd: ", foo);
    console.log("Grid-changed: ", gridev);
    let grid = gridev.grid; // Has e.g. _sortOrder, onPageChanged (itself), _validation, paging: false
    let ctrl = gridev.grid.controller;
    console.log("Grid-changed controller: ", ctrl);
    // Test with .hostcell
    
  };
  */
  // Notes on onRefreshed callback: Triggers *after* grid rendered, does not have the pageIndex
  if (act && act.uisetup) { // MUST have uisetp (to be of any use)
    console.log("showgrid(): Assign act and Setup onRefreshed cb.");
    gridopts.controller.act = act; // Allows act to follow where ever contoller is available !!!
    gridopts.onRefreshed = onRefreshed;
  }
  $("#" + divid).jsGrid(gridopts);
  console.error(`Set grid onto div ${divid}`);
  // OLD: Emit (done divid) ! NEW: Do not tightly couple to any event emission system.
  //ee.emit("on_"+divid+"_done", { msg: "Hello!", divid: divid }); // New: Disabled
  
  // Re-run uisetup on refreshed grid (based on gridevent description).
  // .uisetup() typically sets various UI event (e.g. "click") handlers to make UI functional.
  // If this was not called to delegate setup to act.uisetup() the Grid UI does not have any "needed-for-functionality"
  // 
  function onRefreshed(gridev) {
    //console.log("Grid-refreshed: ", gridev);
    let grid = gridev.grid; // Has e.g. _sortOrder, onPageChanged (itself), _validation, paging: false
    let ctrl = grid.controller; // controller / db object w. act object (and thus act.uisetup callback), uisruncnt (ui setup run count)
    let data = grid.data; // AoO for grid data
    //console.log("Grid-refreshed controller: ", ctrl);
    //$(".hostcell").click(() => { alert("Re-hooked"); }); // Test: Works !
    // Note: can use 1) closure act coming to showgrid() IFF onRefreshed() is inside it ... OR 2) attach act to controller
    let act = ctrl.act; // Controller-object stored act (set by grid-generator for these future events)
    if (!act) { console.log("No act present, even if pre-validated !!!"); return; }
    if (!act.uisetup) { console.log("No act.uisetup (cb) present, even if pre-validated !!!"); return; }
    //if (ctrl.uisruncnt) {
    console.log(`UI Setup has been run by grid N times: ${ctrl.uisruncnt}`); // }
    // act.noresetup - 
    if (ctrl.uisruncnt && act.noresetup) { console.log("Prevent uisetup rerun");return; }
    // See current framework signatures on this
    act.uisetup(act, data); // act.uisetup was checked above
    ctrl.uisruncnt++; // Inc number of act.uisetup() calls that have been run.
  }
}
gridder.showgrid = showgrid;
