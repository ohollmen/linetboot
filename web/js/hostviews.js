"use strict;";
   // Note: jsgrid type(s) are mostly "widget" based: "text" (not string), "textarea", "number"
   // //autosearch: true, // Not in a field ?
   // Disp Name: title (js-grid,vue-table), displayName (ui-grid)
   // Visibility: visible (ui-grid,vue-table)
   // Value transform: callback(vue-table), cellTemplate (ui-grid) itemTemplate(cb in js-grid)
   // Sortability: sortField(vue-table, must set), All(ui-grid: sort: {direction(asc/desc), priority}, sortingAlgorithm: cb)
   // https://blog.logrocket.com/how-to-make-http-requests-like-a-pro-with-axios/ (Making simultaneous requests)

var rapp;var fldinfo;var Chart;var window;var Mustache; var webview;
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
/** Filter items in JSGrid.
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
  // Create matchers by *actual* (in-effect) filter keys.
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

// 
var db = {
  datakey: "hosts",
  filterdebug: 1,
  // The filter here is an object keyed by col names
  // this here is the db
  loadData: js_grid_filter
};
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
function showgrid_opts(divid, griddata, fields) {
  var gridopts = rapp.dclone(gridopts_std);
  gridopts.data   = griddata;
  gridopts.fields = fields;
  // NOTE: Use a unique thing for datakey: ... (e.g. divid OR append name props of fields ...
  var mydb = {datakey: divid, filterdebug: 1, loadData: js_grid_filter, uisruncnt: 0}; // rapp.dclone(db);
  //mydb.loadData = js_grid_filter;
  mydb[divid] = griddata;
  gridopts.controller = mydb;
  //gridopts.controller = db; // Global
  return gridopts;
}
  // var gridopts = 
  
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

/** Hook Process listing items to detail view.
 * Must have el by id "pkill" with data-hname 
 * @param pinfo - Process dataset.
 */
function procinfo_uisetup(pinfo) {
      
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
          var bel = document.getElementById("pkill"); // Has data-hname, data-pid
          // Note: this.dataset does behave differently (hname not avail !?)
          if (!bel.dataset) { return alert("No dataset"); }
          var pi = {hname: bel.dataset.hname, pid: bel.dataset.pid};
          console.log("PI:", bel.dataset); // this.dataset is DOMStringMap
          toastr.info("Should kill "+pi.hname+" Proc: "+pi.pid);
          //return;
          var port = datasets.cfg.procster.port || 8181;
          axios.get("http://"+pi.hname+":"+port+"/kill/"+pid).then((resp) => {
            console.log(resp.data);
            var d = resp.data;
            if (!d) { return toastr.error("No proper response !"); }
            if (d.status == 'err') {
              var msg = d.msg ? d.msg : "Details unknown"; // TODO: Use
              return toastr.error("Error Killing process "+pi.pid); } // TODO: + "("+msg+")"
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

/** Create dialog+grid for host and view described in event elem (by data-hname, data-tgt).
 * The "data-tgt" attribute (For now..) on event target el. determines the
 * specific handler called from here (by if-elsing, todo: model).
 * This func: dispatch to custom fetcher -> custom fetcher -> dialogcb (here), calls showgrid()
 * Note: 
*/
function on_docker_info(ev) { // TODO: datadialog (rapp.?)
  var actsmodel = [ // Dialogs. TODO: Add gridid for grid based views. dcb = data cb.
    // TODO: Add tmpl (default: simplegrid, do double templating to make {{ name }} into a nice title ?)
    // - Come back tmplid => tmpl to sync with router (or other way around).
    // Add name (could create dialog elem completely autom.) ?
    // Foold other use cases here (e.g. host, people, bootmedia, recipe prev.)
    {tgtid: "dockerimg", dcb: dockerinfo, gridid: "jsGrid_dockerimg_d"}, // Note gridid unused except as flag
    {tgtid: "nfsinfo",   dcb: nfsinfo, gridid: "jsGrid_nfs"},
    {tgtid: "rfdialog",  dcb: rfinfo, gridid: undefined, tmplid: "redfish", uisetup: rfinfo_uisetup}, // templated (not grid) and never gets to dialogcb.
    {tgtid: "proclist",  dcb: procinfo, gridid: "jsGrid_procs", uisetup: procinfo_uisetup},

    {tgtid: "dockercont", dcb: dockerinfo, gridid: "jsGrid_dockercont_d"}, // NEW: Containers (see first)
  ];
  // Final dialog handler. The 2nd param of if-else dispatched calls at bottom come as 2nd (dialogsel) here.
  // Works both as grid (cache index-object) and dialog (DOM-id) selector id
  var dialogcb = function (pinfo, dialogsel) { // TODO: add (2nd) gridsel OR dialog id
    if (!pinfo ) { console.log("No data set for grid"); return; }
    if (am.gridid && !Array.isArray(pinfo)) { console.log("Data set not in Array for grid"); return; }
    if (!dialogsel) { console.error("No dialog selector, no gui."); return; }
    console.log("dialogcb: called (#-sel) dialogsel:" + dialogsel); // e.g. proclist
    // Select child ".fwgrid" of dialogsel elem and find out gridsel (id)
    // class fwgrid is on grid-wrapping div-element
    var del = $("#"+ dialogsel ).get(0); // Dialog element
    if (!del) { console.log("No dialog element for dialog (id) selector: "+ dialogsel); }
    // New: We give gridid directly in model, no need to probe it.
    //var gel = $("#"+ dialogsel + " .fwgrid");
    //var id = gel.attr("id");
    
    var tmplid = am.tmplid || "simplegrid";
    console.log("Got template id: "+tmplid);
    var titletmpl = del.getAttribute("nametmpl"); // TODO: Change proper
    // rapp.templated(titletmpl, tpara); - too complex here as template does not have id
    if (titletmpl) { tpara.name = Mustache.render(titletmpl, tpara); } // toastr.info("Formulated title/name: "+tpara.name);
    // TODO: Template into dialog container
    
    // If needtemplate ? // tpara => am (clone) ?
    // Problem: You'd need to blend tpara (w. hname, gridid, ...) and data from server
    if (tmplid) {
      // Blend tpara and data from server (Assume it to be in object ? Which way ?) ?
      if (typeof pinfo == 'object') { Object.keys(pinfo).forEach((k) => { tpara[k] = pinfo[k]; });}
      rapp.templated(tmplid, tpara, dialogsel); // Place to dialog
      //console.log("TEMPLATE_CONT: "+rapp.templated(tmplid, tpara));
      $("#"+ dialogsel ).dialog(dopts_grid);
    }
    if (!am.gridid) {}
    //////////// Grid ///////////////////
    else {
      var id = am.gridid;
      console.log("jsGrid elem id: "+id);
      if (!id) { toastr.error("No grid id found from dialog by id: "+dialogsel); return; }
      // Must have fldinfo by same name
      if (!fldinfo[dialogsel]) { alert("No grid info for '"+ dialogsel+"' "); return; }
      showgrid(id, pinfo, fldinfo[dialogsel]); // OLD(1st)gridsel ... "dockerimg"
      console.log("Call showgrid dialog CB ... #" + dialogsel);
      $("#"+ dialogsel ).dialog(dopts_grid); // "#dockerimg"
    }
    // $("#"+ dialogsel ).dialog(dopts_grid); // TODO !
    // Hook UI handlers by  dialogsel (from ui-setup cb mapping below)
    // if (uisetup[dialogsel]) { uisetup[dialogsel](pinfo);  } // Pass ...?
    // TODO:
    if (am.uisetup) { am.uisetup(pinfo); }
  };
  // Process *grid* UI - hook additional UI actions.
  // If further 
  //var uisetup = {"proclist": procinfo_uisetup };
  //console.log("ARG[0]:"+ev);
  // Note: also the 
  var hn  = ev.target.getAttribute("data-hname"); // Hostname (to do op on)
  var tgt = ev.target.getAttribute("data-tgt"); // id-lbl for dialog and fldinfo
  console.log("Dlg-HNAME:"+hn+", data-tgt: " + tgt);
  var am = actsmodel.find((am) => { return am.tgtid == tgt; });
  if (!am) { return toastr.error("No Action model found for: "+tgt); }
  // Consider: Clone am (PLUS functions in it), use in template.
  // Future todo: Merge all elem data-* attributes to am
  var tpara = {hname: hn, gridid: am.gridid, name: ""}; // Lookup actsmodel by tgt => use am.gridid
  // hn - from ev element
  // gridsel - grid/dialog selector (id) (from data-tgt=...)... replace w. dialog
  // dialogcb - dialogcb
  //if      (tgt == 'dockerimg') { dockerinfo(hn, "dockerimg", dialogcb); } // OLD: gridsel
  //else if (tgt == "nfsinfo")   { nfsinfo(hn, "nfsinfo", dialogcb); return; } // alert("N/A");
  //else if (tgt == "rfdialog")  { rfinfo(hn, "rfdialog", dialogcb); return; }
  //else if (tgt == "proclist")  { procinfo(hn, "proclist", dialogcb); }
  // TODO: Allow alternate dialogcb (for case templated) ?
  am.dcb(hn, tgt, dialogcb);
}

/** Display host details (Shared click handler for hostname click).
*/
function on_host_click(ev, barinfo) {
  // console.log("Ev:", ev, " Val:"); //  // , "td"
  // var tmplsel = "#singlehost";
  var hname; // Get some other way than just html (data-hname="+e.hname+") ... ev.target.dataset.hname;
  if (!ev && barinfo && !Array.isArray(barinfo)) { hname = barinfo.hname; }
  if (ev && ev.target) { hname = $(ev.target).html(); } // Can we get the whole entry (by one of custom field callbacks ?)
  // Try treating this as Chart.js event (w. barinfo Array)
  if (!hname && barinfo && Array.isArray(barinfo)) { hname = barinfo[0]._model.label; }
  // Final check
  if (!hname) { alert("No hostname available !"); return; }
  // Lookup host. Form global cache / datasets
  //var ent = db.hosts.filter(function (it) { return it.hname == hname; })[0];
  var ent = datasets.hostlist.filter(function (it) { return it.hname == hname; })[0];
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
function ansishow(ev, an) {
  // var sets = ["aplays","aprofs"];
  // "grps" (OLD) => "grps_inv"
  var p = { //hosts: db.hosts,
    hosts: datasets["hostlist"],
    groups: datasets["grps_inv"], aplays: datasets["aplays"], "aprofs": datasets["aprofs"] };
  var output = rapp.templated('ansrun', p); // , "dialog_ans"
  if (!an) { // Dialog
    $( "#dialog_ans" ).html(output);
    var dopts = {modal: true, width: 650, height: 600}; // See also min,max versions
    $( "#dialog_ans" ).dialog(dopts);
  }
  else {
    var tgtid = ev.routepath ? "routerdiv" : an.elsel;
    console.log("Launching ansishow as action (tgtid): " + tgtid);
    $( "#" + tgtid ).html(output);
  }
  // Hook select-reset listeners
  function ansui_setup(act, dataX) { // act, data ?
    $('#playbooks').change(function () {  $("#playprofile").val([""]); }); // alert("PB");
    $('#playprofile').change(function () { $("#playbooks").val([]);  }); // $("#playbooks:selected").removeAttr("selected");  alert("PProd");
    $('#anssend').click(ansirun);
    $('#anssend3').click(ansirun);
    // Doc ?
    $('#playbooks option').dblclick(function(jev) {
      //$('#selectedOption').val(this.outerHTML);
      //alert("Hi "+ $('#selectedOption').val() ); // this.outerHTML
      var dopts = {modal: true, width: 650, height: 600}; // See also min,max versions
      console.log("Dblclick on "+this);
      console.log("Value "+this.value);
      var e = datasets["aplays"].find((e) => { return e.relname == this.value; });
      var c = new showdown.Converter();
      // TODO: Vars as yaml (See: js-yaml) !
      var docpara = {doc: c.makeHtml(e.doc), tasknames: e.tasknames, vars: JSON.stringify(e.vars, null, 2)};
      // docpara.vars = yaml.dump(e.vars, {'styles': { '!!null': 'canonical' }, sortKeys: false}) // dump null as ~
      rapp.templated('anspbdoc', docpara, 'dialog_pbdoc');
      
      //$( "#dialog_pbdoc" ).html( c.makeHtml(e.doc) );
      //$( "#dialog_pbdoc" ).html( "<pre>"+e.doc+"</pre>" );
      $( "#dialog_pbdoc" ).dialog(dopts);
    });
    var time = Date.now();
    var atmpls = {
      pb : "ansible-playbook -i ~/.linetboot/hosts {{{ pb }}} -l {{ hns }} -b -e '{{{ ejson }}}'",
      facts : "mkdir {{ factdir }} ; ansible {{{ hns }}} -i ~/.linetboot/hosts -b -m setup --tree {{factdir}} -e '{{{ ejson }}}'; echo 'Facts in {{factdir}}'"
    };
    $('#anssend2').click((jev) => {
      var extra = {ansible_user: "...", ansible_sudo_pass: "...", host: null};
      var para = form_obj("#ansform", ["hostnames","hostgroups", "playbooks", ]); // "playprofile"
      console.log("Got UI params: ", JSON.stringify(para, null, 2) );
      console.log("JEV:",jev);
      console.log("ID:",this.id);
      //if ((para.hostnames && para.hostnames.length) && (para.hostgroups && para.hostgroups.length)) { return toastr.error("Only hostnames OR hostgroups !"); }
      //para.what = para.hostnames || para.hostgroups; // Either or
      var what = [];
      //what = what.concat(para.hostnames);
      //para.what = what.concat(para.hostgroups);
      para.what = what.concat(para.hostnames).concat(para.hostgroups);
      //if (para.what.length != 1) { return toastr.error(); } // NOT !
      if (!para.playbooks || !para.playbooks.length || para.playbooks.length > 1) { return toastr.error("Only single playbook allowed (provide one, but no more) !"); }
      para.pb = para.playbooks[0];
      extra.host = para.what.join(','); // Only on pb !
      
      para.hns   = para.what.join(',');
      para.ejson = JSON.stringify(extra);
      para.time = Date.now();
      para.factdir = "/tmp/facts_"+para.time;
      //rapp.templated("simplegrid", act);
      var out = Mustache.render(atmpls['pb'], para);
      out += "\n"+Mustache.render(atmpls['facts'], para);
      $('#anscmd').html(out); $('#anscmd').show();
      //alert(out);
    });
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
  console.log("ID:",this.id); // anssend, anssend3
  //return;
  function is_not_given(v) {
    if (!v) { return 1; }
    if (Array.isArray(v) && !v.length) { return 1; }
    return 0;
  }
  var act2url = {anssend: "/ansrun", anssend3: "/ansfacts"};
  if (this.id == 'anssend' && is_not_given(para.playbooks) && is_not_given(para.playprofile)) { toastr.error("Neither playbooks or playprofile given !"); $(but).removeAttr("disabled"); return; }
  var url = act2url[this.id];
  /////////////////// Call ansible /////////////////
  // TODO: Come up with hooks (e.g.): onresp, onresperr
  console.log("ansirun Call URL:" + url);
  axios.post(url, para).then(function (resp) { // "/ansrun"
    var rp = resp.data;
    // TODO: throw
    if (!resp.headers["content-type"].match(/json/)) { return alert("ansrun: Non-JSON response"); }
    if (!rp) { return alert("No ansible response !"); }
    $(but).removeAttr("disabled");
    // TODO: Toaster
    if (rp.status == 'err') { return toastr.error(rp.msg); }
    var id = rp.data ? rp.data.runid : 0; // Grab "runid" (to poll by)
    if (!id) { return toastr.error("No runid in response !"); }
    toastr.info("<li>Request ID: "+id+ "<li>"+ rp.msg, "Gather and Copy were run.");
    console.log("Got Ansible run server resp ("+id+"): ", rp);
    var opts = {
      pollint: 5000,
      trycnt: 20,
      baseurl: "/ansackpoll?runid=",
      cb: (data) => {
        toastr.info("Completed in "+data.time_d +" s.", "Ansible op "+data.runid+" complete");
      }
    };
    // Only (playbook) "anssend" button is compatible with ack-file.
    // TODO: new Poller(opts).poll(id, cb);
    if (but.id == 'anssend') { compl_ack_poll(id, opts); } // this.id does not work here (in axios ctx)
    // NO NEED: Unlock element
    //$(but).click(ansirun); // handler Assignment does not change
    // Initially rely on "this" / current ctx info (e.g. iid, opts, ...) be avail via local ctx vars
    function compl_ack_poll(id, opts) {
      var cnt = 0;
      // cb = cb || opts.cb || function () { console.log("Completed polling for "+id); }
      console.log("Start polling "+id);
      var iid = setInterval(() => {
        cnt++;
        if (cnt >= opts.trycnt) { console.log("Tries ("+opts.trycnt+") exhausted"); clearInterval(iid); }
        var url = opts.baseurl + id; // "/ansackpoll?runid="+id;
        console.log("Inquire: "+url);
        axios.get(url).then((resp) => {
          var d = resp.data; // TODO More heuristics in finding "d" / "d.data".
          if (d.status == "err")  { console.log("Error at ..."+cnt+" - "+d.msg); clearInterval(iid); } // Error - Cancel poll
          if (d.status == "wait") { console.log("Continue polling ..."+cnt); } // Continue wait
          if (d.status == "ok")   {
            console.log("Complete at "+cnt); clearInterval(iid);
            console.log("Completion data: ", d.data);
            // toastr.info("Ansible op "+d.data.runid+" complete !"); // id == d.data.runid
            // TODO:
            if (opts.cb) { opts.cb(d.data); }
          } // Complete - Cancel poll
        }).catch((ex) => { console.log("Exception at "+cnt); clearInterval(iid); }); // Error - Cancel poll
      }, opts.pollint);
      // return this;
    } // compl_ack_poll
  }).catch((ex) => {
    var resp = ex.response;
    toastr.error(ex);
  });
  return false;
}

/** Wrapper handler for tabset view.
 * Change of tab (also loading a new tabset and implicitly setting the default / first tab)
 * triggers the handler associated with the view contained by tab (!).
 * 
*/
function tabsetview(ev, act) {
  function gettabinfo(elsel) {
    var ti = tabloadacts.filter((it) => { return it.elsel == elsel; })[0];
    return ti;
  }
  if (!act.tabs) { return alert("tabsetview: Action using tabsetview should have 'tabs'" + JSON.stringify(act)); }
  if (!Array.isArray(act.tabs)) { return alert("tabsetview: tabs for view should be an array"); }
  //alert("tabsetview: Create tabset: "+act.tabs.join(', '));
  
  //function tabs_get(tabselarr) {
  var tabs = tabloadacts.filter((ti) => {
    //console.log("Find "+ti.elsel+" from ", act.tabs);
    // Auto filters missing entries (?!)
    return act.tabs.includes(ti.elsel);
    });
  //  return tabs;
  //}
  console.log("tabsetview: Got "+tabs.length + " tab items for parent view '"+act.name+"'");
  //return;
  //act.tabs.forEach((ti) => {});
  // Setup router div to contain tab structure
  $('#routerdiv').html("<div id=\"tabsnest\"></div>");
  $('#tabsnest').html( webview.tabs(tabs, null, {idattr: "elsel"}) );
  $( "#tabsnest" ).tabs({active: 1});
  $( "#tabsnest" ).tabs({ activate: ontabactivate }); // Set click handler !
  $( "#tabsnest" ).tabs("option", "active", 0 );
  
  
}

// Converted to more action-like: title => name
// Note: template/tamplating might be of early (at tab creation) or late (at data load) type.
// For now late templated should have tmpl: .. to false val and do templating themselves (because early templating is automatic by tmpl).
// Allow "path" attribute to indicate a routable item and "elsel" a tabbed item
// subnavi: 1 ... in esxiguests(esxilist), dcomposer(see: dcomposer_uisetup), peopledir(showpeople) (potentially: covbuilds) . esxihostmenu(act, items) is a close example
var tabloadacts = [
  {"name": "Basic Info", "path":"basicinfo", tabs: ["tabs-1","tabs-2","tabs-3"], hdlr: tabsetview}, // NEW(tabset)
  // Tabs (NOTE: dataid unused, See: dsid (used by simplegrid_cd)
  {"name": "Networking",  "elsel": "tabs-1", "tmpl":"simplegrid", hdlr: simplegrid_cd, "dataid": "net", mtx:0, dsid: "hostlist", gridid: "jsGrid_net", fsetid: "net", uisetup: osview_guisetup}, // url: "/list" (All 3)
  {"name": "Hardware",    "elsel": "tabs-2", "tmpl":"simplegrid", hdlr: simplegrid_cd, "dataid": "hw",  dsid: "hostlist", gridid: "jsGrid_hw",  fsetid: "hw", uisetup: osview_guisetup},
  {"name": "OS/Version",  "elsel": "tabs-3", "tmpl":"simplegrid", hdlr: simplegrid_cd, "dataid": "dist", dsid: "hostlist", gridid: "jsGrid_dist", fsetid: "dist", uisetup: osview_guisetup}, // Last could have hdlr ?
  //NONEED: {"name": "Reports", "path":"XXXXXXXX", tabs: ["tabs-X","tabs-Y","tabs-Z"], hdlr: tabsetview},
  {"name": "Reports",     "elsel": "tabs-4",  "tmpl":"reports", hdlr: pkg_stats, "url": "/hostpkgcounts", gridid: null, "path": "reports"}, // DUAL
  {"name": "Groups",      "elsel": "tabs-5",  "tmpl":null,      hdlr: multigridview, "url": "/groups", gridid: null, path: "groups", "fsetid": "hw", colla: "hosts"},
  {"name": "Remote ...",  "path":"remoteviews", tabs: ["tabs-6","tabs-63","tabs-64"], hdlr: tabsetview}, // NEW(tabset)
  {"name": "Remote Mgmt", "elsel": "tabs-6",  "tmpl":"simplegrid", hdlr: rmgmt, "url": "/hostrmgmt", gridid: "jsGrid_rmgmt", fsetid: "rmgmt",},
  {"name": "Net Probe",   "elsel": "tabs-63", "tmpl":"netprobe",   hdlr: probeinfo, "url": "/nettest", gridid: "jsGrid_probe", fsetid: "netprobe",},
  {"name": "Load Probe",  "elsel": "tabs-64", "tmpl":"simplegrid", hdlr: loadprobeinfo, "url": "/proctest", gridid: "jsGrid_loadprobe", fsetid: "proc",
    uisetup: function () { $('.rfop').click(on_docker_info); $('.procps').click(on_docker_info); } },
  {"name": "Generated Output", "elsel": "tabs-65", "tmpl":null,    hdlr: outfmts, "url": "/allhostgen", gridid: null, path: "genoutput"}, // DUAL
  {"name": "Hostkeys",    "elsel": "tabs-67", "tmpl":"simplegrid", hdlr: sshkeys, "url": "/ssh/keylist", gridid: "jsGrid_sshkeys", fsetid: "sshkeys", path: "hostkeys", uisetup: sshkeys_uisetup}, // DUAL
  {"name": "PkgStat",     "elsel": "tabs-68", "tmpl":"simplegrid", hdlr: pkgstat, "url":"/hostpkgstats", gridid: "jsGrid_pkgstat", fsetid: "DYNAMIC", path: "pkgstats", "help": "x.md"}, //DUAL
  {"name": "Docs/About",   "elsel": "tabs-8", "tmpl":"docs",       hdlr: showdocindex, url: "/web/docindex.json", path: "docsview"}, // DUAL
  // Disabled from here (groups): "tabs-5",
  {"name": "Dev/Admin",   tabs: ["tabs-65", "tabs-68", "tabs-api", "tabs-bprocs", "tabs-dc", "ansitab"], hdlr: tabsetview, "path":"devadm",}, // NEW(tabset)
  {"name": "Docker Env",  "elsel": "tabs-9", "tmpl": "dockercat", hdlr: dockercat_show, url: "/dockerenv", gridid: "jsGrid_dockercat", fsetid: "dockercat", gdmem: "catalog",
     path: "dockerenv", uisetup: uisetup_dockercat },
  {"name": "Boot/Install", tabs: ["tabs-11","tabs-12","tabs-13", "tabs-14", "tabs-iprof", "tabs-bos"], "tmplXXX":"bootreq", hdlr: tabsetview, url: "", path: "bootinst"}, // NEW(tabset)
  // Sub Tabs (for Boot/Install, non-routable)
  {"name": "Boot/OS Install",   "elsel": "tabs-11", "tmpl":"bootreq",    hdlr: bootgui, url: "", path: ""},
  {"name": "TFTP Boot Hosts",   "elsel": "tabs-12", "tmpl":"simplegrid", hdlr: tftplist,  url: "/tftplist",  gridid: "jsGrid_pxelinux",  fsetid: "pxelinux", path: "", uisetup: function () { $(".defboot").click(defboot_reset); }},
  {"name": "ISO Boot Media",    "elsel": "tabs-13", "tmpl":"simplegrid", hdlr: medialist, url: "/medialist", gridid: "jsGrid_bootmedia", fsetid: "bootmedia", path: "", uisetup: medialist_uisetup },
  {"name": "Recipes Preview",   "elsel": "tabs-14", "tmpl":"simplegrid", hdlr: recipes,   url: "/recipes",   gridid: "jsGrid_recipes",   fsetid: "DYNAMIC", path: ""},
  {"name": "Install Profiles",  "elsel": "tabs-iprof", "tmpl":"simplegrid", hdlr: instprofiles, url: "/instprofiles",  gridid: "jsGrid_instprofiles", fsetid: "iprofs", path: ""},
  {"name": "Login",  "tmpl":"loginform", hdlr: loginform, url: "",  path: "loginform"},
  // logout (todo: literal template)
  {"name": "Logout",   "tmpl":"", hdlr: logout, url: "/logout",  path: "logout"}, // TODO: Add tmpl for ack ?
  // Directory  (TODO: composite templating)
  {"name": "People Lookup", elsel: "tabs-pd", tmpl: "simplegrid", "hdlr": showpeople, url: "/ldaptest", gridid: "jsGrid_ldad", fsetid: "ldad", path: "peopledir"},
  {"name": "People Entry", tmpl: "lduser", "hdlr": gendialog, url: "", path: "uent", dialogid: "userdialog"},
  // Iblox
  {"name": "InfoBlox", tabs: ["tabs-ibnet", "tabs-ibhost"], hdlr: tabsetview, "path": "ibloxlist"},
  {"name":"InfoBlox Networks", "elsel": "tabs-ibnet", tmpl: "simplegrid", "hdlr": simplegrid_url,  url: "/ipamnets", gridid: "jsGrid_ibnets", fsetid: "ibnets",
    path: "ibnets", uisetup: null, urlpara: null, dprep: null, longload: 0},
  {"name": "InfoBlox Hosts",   "elsel": "tabs-ibhost", tmpl: "simplegrid", "hdlr": ibloxlist,  url: "/ibshowhost", gridid: "jsGrid_iblox", fsetid: "iblox", path: "ibhosts", uisetup: ibox_uisetup},
  
  // Eflow
  {"name": "EFlow",      "elselXX": "tabs-15", tmpl: "simplegrid",  "hdlr": eflowlist, url: "/eflowrscs", gridid: "jsGrid_eflow", fsetid: "eflow", path: "eflowlist", uisetup: eflow_uisetup},
  // esxi
  {"name": "ESXi Guests","elselXX": "",        tmpl:"simplegrid", "hdlr": esxilist,      "url": "/esxi/", gridid: "jsGrid_esxi", fsetid: "esxilist", path: "esxiguests"},
  
  {"name": "DockerCompose",  "elsel": "tabs-dc", "tmpl":"simplegrid", hdlr: simplegrid_url, "url": "/listdc", gridid: "jsGrid_dcomposer", fsetid: "dcomposer", path:"dcomposer",
    uisetup: dcomposer_uisetup,
    urlpara:  (ev, an) => { // See: simplegrid_url
      var dcfn;var ds = ev.target.dataset;
      if (ds && ds.dcfn) { dcfn = ds.dcfn; }
      if (!dcfn && datasets.cfg.docker.files) { dcfn = datasets.cfg.docker.files[0]; }
      //return "fn="+dcfn; // OLD: params only
      return an.url + "?fn="+dcfn; // NEW: Resp. for whole URL
    },
  },
  // See: Groups
  {"name": "Bad Procs",      "elsel": "tabs-bprocs",  "tmpl": null,  hdlr: multigridview, "url": "/staleproc/", path: "staleproc",
      nattr: "hname", "colla":"procs", "fsetid": "proclist", "skipe":1, longload: 1,
      ida:   (hpent) => { var arr = hpent.hname.split(/\./); return arr[0]; },
      uisetup: (act, arr) => { procinfo_uisetup(arr); }, // $('.psact').click((jev) => { alert("Proc ..."); });
      dataprep: (g) => { g.procs.forEach((p) => { p.hname = g.hname; }); }
  },
  {"name": "ApiDocs", "elsel": "tabs-api", "url": "/apidoc", "tmpl": "", hdlr: apidoc, path: "apidoc"},
  
  // Ansible
  {"name": "AnsiRun", elsel: "ansitab", tmpl: "ansrun", hdlr: ansishow, path: "ansirun"},
  {"name": "Bootables",  "elsel": "tabs-bos", "tmpl": "bootables", hdlr: dockercat_show, url: "/bs_list", gridid: "jsGrid_bootables", fsetid: "bootables",
    path: "bootables", uisetup: uisetup_bootables, noresetup: 1},
  // shell
  {"name": "Shell",  "elsel": "", "tmpl": "t_shell", hdlr: shellview_show, url: "", path: "shell"},
  // Cov (for now only manually routable)
  // NEW: Cov Top level tabbed
  {name: "Coverity", tabs: ["cov-1","cov-2", "cov-3","cov-4", "cov-5"], hdlr: tabsetview, tmpl: "", "path": "coverity"}, // 
  {name: "Release Baseline Defects (Chart)", elsel: "cov-1", tmpl: "t_chart", url: "/covtgtchart?rep=build", hdlr: rapp.showchart_cov, path: "covbuilds",
    //setupui: null, // Check tag
    canid: "canvas_blds", chtype: "bar", limit: 120},
  // 
  {name: "Coverity Baseline Defects (Grid)", elsel: "cov-2", tmpl: "simplegrid", tmplid: "simplegrid", gridid: "jsGrid_covstr", fsetid: "covstr",
     url: "/covtgtgrid", hdlr: rapp.fetchgrid_cov, path: "covgrid", uisetup: covgrid_uisetup, longload: 1},
  // Cov. iss / comp
  {name: "Coverity Defects - All (Grid)", elsel: "cov-3", tmpl: "simplegrid", tmplid: "simplegrid", gridid: "jsGrid_coviss", fsetid: "coviss", url: "/coviss", hdlr: simplegrid_url, path: "coviss", longload: 1},
  {name: "Coverity Components (Grid)",    elsel: "cov-4", tmpl: "simplegrid", tmplid: "simplegrid", gridid: "jsGrid_covcomp", fsetid: "covcomp", url: "/covcomp", hdlr: simplegrid_url, path: "covcomp", longload: 1},
  {name: "Component Defects (Chart)", elsel: "cov-5", tmpl: "t_chart", url: "/covcomp", hdlr: rapp.showchart_cov, path: "covcompchart", canid: "canvas_comps", chtype: "bar", // "horizontalBar"
     dataisarr: 1, arrconv: dprep_covcomp,  cmod: cmod_covcomp, limit: null},
  // Share main handler
  {"name": "Git Projects", tabs: ["gitdeploy","gitmkrepo", "showgitproj"], "tmplXXX":"bootreq", hdlr: tabsetview, url: "", path: "gitproj"},
  {name: "Deploy Git Project",      elsel: "gitdeploy", hdlr: proj_deploy, url: "/deploy_config", tmpl: "t_deploy", "path": "deploy", "uisetup": deploy_uisetup},
  {name: "Create Git Repo/Project", elsel: "gitmkrepo", hdlr: proj_deploy, url: "/gitrepo_config", tmpl: "t_mkrepo", "path": "mkrepo", "uisetup": mkrepo_uisetup},
  // "uisetupXX": deploy_uisetup,
  {name: "Deployable Projects",  elsel: "showgitproj", hdlr: proj_deploy, url: "/deploy_config", tmpl: "simplegrid", "path": "deployprojs",  gridid: "jsGrid_dproj", fsetid: "dproj"},
  // TODO: Place actions to global datacache (at init): datasets["actions"] = tabloadacts; ...
  // {"name": "AppActs", "elsel": "tabs-acts", "url": "", "tmpl": "", hdlr: simplegrid_cd, gridid: "jsGrid_appact", path: "appact"}, // NOTE: hdlr: simplegrid_cd
  // hdlr: actinfo
  {name: "Application Actions",  "elsel": "tabs-acts", hdlr: simplegrid_cd, url: null, tmpl: "simplegrid", "path": "appact",  gridid: "jsGrid_appact", fsetid: "actinfo", dsid: "actions",
      uisetup: actinfo_uisetup },
  {name: "Host Groups Hierarchy", hdlr: visnethier, url: "/hosthier", tmpl: "t_hosthier", "path": "hosthier", helemid: "hh", dprep: dprep_hosthier,
      netopts: netopts_hosthier, nclick: onhostnetclick, },
  //  K8S (Old serv. paths: /podinfo /kubapi). TODO: Use simplegrid xui to create choices by urlpara: kub_urlpara (like GitHub/GitLab)
  // fsetidgen: kub_fsetidgen, 
  {"name": "K8S System Pods",   "elselXX": "", tmpl: "simplegrid", "hdlr": simplegrid_url,  url: "/kubinfo?info=pod-sys", gridid: "jsGrid_syspods",
    fsetid: "syspods", fsetidgen: kub_fsetidgen, path: "kubinfo",  dprep: dprep_syspods, uisetup: kub_uisetup, urlpara: kub_urlpara}, // OLD: path: "syspods"
  /*
  {"name": "K8S System APIs",   "elselXX": "", tmpl: "simplegrid", "hdlr": simplegrid_url,  url: "/kubinfo?info=api", gridid: "jsGrid_kubapis",
    fsetid: "kubapis", fsetidgen: kub_fsetidgen, path: "kubapis", dprep: null, uisetup: kub_uisetup, urlpara: kub_urlpara},
  {"name": "K8S Namespaces",   "elselXX": "", tmpl: "simplegrid", "hdlr": simplegrid_url,  url: "/kubinfo?info=nss", gridid: "jsGrid_kubnss",
    fsetid: "kubnss", fsetidgen: kub_fsetidgen, path: "kubnss", dprep: null, uisetup: kub_uisetup, urlpara: kub_urlpara }, // TODO: Fieldsets (use meta ?)
  */
  {name: "Gerrit - My Changes", tmpl: "simplegrid", "hdlr": simplegrid_url,  url: "/gerr/mychanges", gridid: "jsGrid_mych", fsetid: "gerr_change", path: "mychange", uisetup: null, dprep: null},
  {name: "Test Form", tmpl: null, "hdlr": jgrid_form, url: null, fsetid: "gerr_change", path: "testform"},
  // Git*
  {"name": "GitHub Org. Repos",   "elselXX": "ghprojs", tmpl: "simplegrid", "hdlr": simplegrid_url,  url: "/gh_projs", gridid: "jsGrid_ghprojs", fsetid: "ghprojs",
      path: "ghprojs", uisetup: ghprojs_uisetup, urlpara: ghprojs_urlpara, dprep: null, longload: 1},
  {"name": "GitLab Grp. Repos",   "elselXX": "glprojs", tmpl: "simplegrid", "hdlr": simplegrid_url,  url: "/gl_projs", gridid: "jsGrid_glprojs", fsetid: "glprojs",
      path: "glprojs", uisetup: ghprojs_uisetup, urlpara: ghprojs_urlpara, dprep: null, longload: 1},
  {"name": "Confluence Docs",   "elselXX": "", tmpl: "simplegrid", "hdlr": simplegrid_url,  url: "/confluence", gridid: "jsGrid_cflpages", fsetid: "cflpages",
      path: "cflpages", uisetup: null, urlpara: null, dprep: null, longload: 1},
  {"name":"GCP Dynamic Inventory", "elselXX": "gcpdi", tmpl: "simplegrid", "hdlr": simplegrid_url,  url: "/gcpdi", gridid: "jsGrid_gcpdi", fsetid: "gcpdi",
    path: "gcpdi", uisetup: null, urlpara: null, dprep: null, longload: 0},
  {name: "GCP Hosts Hierarchy", hdlr: visnethier, url: "/gcpdi_hier", tmpl: "t_hosthier", "path": "gcpdi_hier", helemid: "hh", dprep: dprep_hosthier,
    netopts: netopts_hosthier, nclick: null, // onhostnetclick,
  },
  // TF: TODO: Use xpara, set fsetid to func, use urlpara ()
  {"name":"Terraform ...", "elselXX": "", tmpl: "simplegrid", "hdlr": simplegrid_url,  url: "/tftypeinst", gridid: "jsGrid_tfinst", fsetid: "tfinst",
    path: "tfinst", uisetup: null, urlpara: null, dprep: null, longload: 0},
  // TODO: Add "mon"
  {"name": "Services (Mon. and DR)", "path":"hostserv", tabs: ["servmon","dr",], hdlr: tabsetview},
  {"name":"Services", "elsel": "servmon", tmpl: "simplegrid", "hdlr": simplegrid_url,  url: "/hostserv", gridid: "jsGrid_hostserv", fsetid: "hostserv",
    path: "", uisetup: null, urlpara: null, dprep: null, longload: 0},
  {"name":"Disaster Recovery", "elsel": "dr", tmpl: "simplegrid", "hdlr": simplegrid_url,  url: "/hostserv", gridid: "jsGrid_dr", fsetid: "dr",
    path: "", uisetup: null, urlpara: null, dprep: null, longload: 0},
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
* Treat new tab activation almost like routing event. Uses action nodes similar to router
* (w. handler). Mediate tab activate to action handler and mock up an event to make it look
* to handler like this is a normal routing event.
* @param event {object} - JQuery UI event
* @param ui {object} - JQuery UI (Tabs) object (has: newTab, newPanel, oldTab, oldPanel)
* Note: Could one bind the configuring this to the function before call (does not look like it
* because of $( "#tabsnest" ).tabs({ activate: ontabactivate }); . What about closure ?
* Fallback(s) would be class variable (single action set possible). Or having data-.. attr in
* tabs elem that addresses the action set (within (named)sets of sets).
*/
function ontabactivate( event, ui ) {
  //var tgt = ui.newTab['0'].attributes["aria-controls"]; // id of panel
  var tgt = ui.newPanel[0].id; // ui.newTab['0'].id; => Not valid
  console.log("Tab ("+tgt+") active ...NewP:", tgt); // , " NP:",ui.newPanel[0].id
  // Do event forwarding ? Lookup action. TODO: Store acts in a deterministic place.
  // acts.find((n) => { return n.elsel == tgt; }); // ??
  var an = tabloadacts_idx[tgt]; // "#"+ // Index by .elsel
  // TODO: var an = rapp.findtabact(acts, tgt);
  if (!an) { console.error("No action node for:" + tgt); return; } // toastr.error("No Action node");
  // Load template ? 
  //if (an.tmpl) { var c = Mustache.render($('#'+an.tmpl).html(), an); $("#"+an.elsel).html(c); }
  // Pre-handler ("like-routing-handler") templating. Handler may need to re-template.
  if (an.tmpl) { rapp.templated(an.tmpl, an, an.elsel); }
  console.log("tabactivate - Action node:", an);
  //console.log(event);
  event.viewtgtid = an.elsel; // Target View ID (Uses more specific/nested containing element than the top-level / main containing element)
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
    // .tmpl
    document.getElementById(titem.elsel).innerHTML = contbytemplate(titem.tsel, titem);
    //rapp.templated(titem.tsel, titem, titem.elsel); // Replacement for contbytemplate (line before)
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
  if (!cfg) { return alert("No config dataset."); }
  var dis = cfg.disabled;
  //////
  if (!dis) { return alert("disabled setting is completely absent"); }
  if (!Array.isArray(dis)) { console.log("Disable-list not in an array"); return;}
  if (!dis.length) { console.log("Nothing to disable"); return; }
  // Do not check acts_rmitem() return values strictly as items may already be removed.
  dis.forEach((fstr) => {
    console.log("Check:"+fstr);
    // var rmby = "path"; var lbl = fstr;
    //if (fstr == 'ipmi')      { acts_rmitem(actitems, "elsel", "tabs-6"); } // 
    /*
    if (fstr == 'groups')    { acts_rmitem(actitems, "path", "groups"); }
    if (fstr == 'dockerenv') { acts_rmitem(actitems, "path", "dockerenv"); }
    if (fstr == 'hostkeys')  { acts_rmitem(actitems, "path", "hostkeys"); }
    if (fstr == 'pkgstats')  { acts_rmitem(actitems, "path", "pkgstats"); }
    if (fstr == 'ibloxlist') { acts_rmitem(actitems, "path", "ibloxlist"); }
    if (fstr == 'eflowlist') { acts_rmitem(actitems, "path", "eflowlist"); }
    if (fstr == 'esxiguests'){ acts_rmitem(actitems, "path", "esxiguests"); }
    if (fstr == 'coverity')  { acts_rmitem(actitems, "path", "coverity"); }
    */
    acts_rmitem(actitems, "path", fstr);
  });
}
// Also 2nd {params: {}}
  // {id: "docindex", url: "/docindex.json"}
  var dnodes = [
    {id: "hostlist", url: "/list"}, // exptype: "string" / "object"
    //{id: "grps",     url: "/groups"},
    {id: "grps_inv", url: "/groups_inv"},
    {id: "aplays", url: "/anslist/play"},
    {id: "aprofs", url: "/anslist/prof"},
    {id: "cfg", url: "/config"},
    // NEW: APIDoc tmpl. No client access to /tmpl
    // {id: "apidoc", url: "/tmpl/apidoc.mustache"},
  ];

window.onload = function () {
  
  
  // Data Load
  var dl = new DataLoader(dnodes, {dstore: datasets});
  dl.load(initapp);
  // Init after loading mandatory data/config with DataLoader
  function initapp (response_dummy) {
    var cfg = datasets["cfg"] || {};
    var tabui = 0; // cfg.tabui;
    // TODO: Navigation, e.g. var acts_menu = acts.filter((it) => { return it.menu; });
  //$('nav').html( webview.list(acts_menu, {titleattr: "name"}) );
  /////////////// Setup Tabs (Dynamic) ////////////////////
  var tabs = tabloadacts.filter((ti) => { return ti.elsel; });
  //acts_uidisable(tabs);
  let ccfg = datasets["cfg"]; // Why cfg vs. ccfg ???
  datasets["actions"] = tabloadacts;
  // Disabled menu items
  if (ccfg && Array.isArray(ccfg.disabled)) {
    ccfg.disabled.forEach((p) => { $("nav a[href='#"+p+"']").parent().hide(); });
  }
  //if (tabui) { tabui_setup(tabs); }
  //else { } // .sidebar_static Style changes (float ...)
  /////////////// Router / routable acts ///////////////////
  var acts = tabloadacts.filter((ti) => { return ti.path; });
  // Can we do async preroute-op ?
  function preroute(ev, act) {
    console.log("Routing: "+act.name+" ('"+location.hash+"' ... "+act.path+")");
    if (!datasets.cfg.username) { location.hash = "loginform";  } // return;
    // Need to override in action for e.g. dialog (e.g. viewid)
    ev.viewtgtid = "routerdiv";
  }
  var router = new Router66({ noactcopy: 1, sdebug: 1, pre: preroute}); //defpath: "basicinfo",
  router.add(acts); /// ...filtered
    if (!datasets.cfg) { return alert("No config - can't work without it !"); }
    // Page Branding (title, image)
    if (datasets.cfg.hdrbg) { document.getElementById('header').style.backgroundImage = "url("+ datasets.cfg.hdrbg + ")"; }
    if (datasets.cfg.appname) { $("#appname").html(datasets.cfg.appname); }
    if (datasets.cfg.username) {
      console.log("Got cfg username: '"+datasets.cfg.username+"'");
    }
    // db.hosts = datasets["hostlist"]; // Legacy ...Can't do this globally. now handled by each showgrid()
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
    
    // if (tabui) { $( "#tabs" ).tabs("option", "active", 0 ); } // Required trans. Does not trigger if 0, but does with 1 (!)
   
    
    
    // Hook Only after grid(s) created
    // $(".hostname").click(function (ev) {
    //$(".hostcell").click(on_host_click); // NEW: Moved to specific UI setup
    // Activate Router
    //if (!tabui) {
      // TEST selector 'nav ...' 
      //$('nav a[href=\'#eflowlist\']').parent().hide(); // css('display', 'none');
      router.start();
      location.hash = "basicinfo"; // ~defpath
    //}
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
  
  
  /*
  $(document).on('keypress', function(ev){
    console.log(ev.originalEvent); // Dump
    // shiftKey, metaKey, ctrlKey
    //if (ev.originalEvent.charCode == 98) { console.log("Got key"); }
    //if (ev.which == 80 && e.ctrlKey) { console.log("ctrl + p pressed"); }
    if ((ev.which == 13 || ev.which == 10) && ev.ctrlKey) { ansishow(); return false; }
    return true;
  });
  */
  
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
* @param darr {array} - Array of Objects (AoO) from where (numeric) data values will be extracted
* @param cdata {object} - Chart Data (structure) to populate with values and colors
* @param cmap {object} - Option color mapping object (to signify distro by "distname")
* @param lblprop {object} - Labeling (name) property from where chart "labels" will be extracted
* Accesses outer scope Color map (cmap)
*/
function chartdata(darr, cdata, vprop, cmap, lblprop) {
  // OLD: var prop = "pkgcnt";
  // TODO:
  //var lblprop = 'hname'; // old, fixed
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
  // TODO(data, all in one ?): {charts: [{},{}, ...]}
  var chdefs = [
    { title: "Package Stats", lblprop: "hname", url:"/hostpkgcounts", subtype: "bar", chcols: [{attr: "pkgcnt", name: "Packages"}], canvasid: "canvas_pkg", gscale: 1000},
    { title: "CPU Counts",    lblprop: "hname", url: "/hostcpucounts", subtype: "bar", chcols: [{attr: "numcpus", name: "CPU:s"}], canvasid: "canvas_cpu", gscale: 10},
    { title: "Memory Stats",  lblprop: "hname", url: "/hostmemstats", subtype: "bar", chcols: [{attr: "memcapa", name: "Mem (MB)"}], canvasid: "canvas_mem", gscale: 10},
    // Note: When changing to "pie" will keep the grid. TODO: Have config opts to eliminate grid (for "pie")
    { title: "OS Distro Stats", lblprop: "distname", url: "/distrostats", subtype: "bar", chcols: [{attr: "val", name: "Count"}], canvasid: "canvas_osdist", gscale: 10, noclick: 1},
  ];
  if (ev.routepath) { rapp.templated("reports", null, "routerdiv"); } // OLD: contbytemplate
  async.map(chdefs, fetchchart, (err, ress) => { console.log("Done with charts"); });
  return;
  /*
  axios.get('/hostpkgcounts').then(function (resp) {
    var d = resp.data;
    if (d.status == "err") { alert("Package stats error: " + d.msg); return; }
    var data = d.data;
    var chdef = chdefs[0];
    createchart(data, chdef); // "Packages", "pkgcnt", 'canvas_pkg'
  }).catch(function (ex) { console.log(ex); });
  
  //gscale = 10;
  axios.get('/hostcpucounts').then(function (resp) {
    var d = resp.data;
    if (d.status == "err") { alert("Package stats error: " + d.msg); return; }
    var data = d.data;
    var chdef = chdefs[1];
    createchart(data, chdef);
  }).catch(function (ex) { console.log(ex); });
  // 
  axios.get('/hostmemstats').then(function (resp) {
    var d = resp.data;
    if (d.status == "err") { alert("Package stats error: " + d.msg); return; }
    var data = d.data;
    var chdef = chdefs[2];
    createchart(data, chdef);
  }).catch(function (ex) { console.log(ex); });
  
  axios.get('/distrostats').then(function (resp) {
    var d = resp.data;
    if (d.status == "err") { alert("Distro stats error: " + d.msg); return; }
    var data = d.data;
    var chdef = chdefs[3];
    createchart(data, chdef);
  }).catch(function (ex) { console.log(ex); });
  */
  // TODO: /cpuarchstats
  // Fetch and create/display chart
  function fetchchart(chdef, cb) {
    if (!chdef.url) { alert("No URL for chart !"); return; }
    // clone chdef to add stats about ch-dataset ?
    //chdef = rapp.dclone(chdef);
    axios.get(chdef.url).then(function (resp) {
      var d = resp.data;
      if (d.status == "err") { alert(chdef.title + " stats error: " + d.msg); return; }
      var data = d.data;
      createchart(data, chdef);
      return cb(null, chdef);
    }).catch((ex) => { console.log(ex); return cb(ex, null); });
  }
  // Uses global: cmap, global scales, outer: gscale (for ... suggestedMax)
  function createchart(data, chdef) { // label, vprop, canvasid
    var vprop    = chdef.chcols[0].attr;
    // Note for not-by-host charts the label for (e.g. bar) is not necessarily constant - now fixed by passing lblprop to chartdata()!
    var label    = chdef.chcols[0].name;
    var canvasid = chdef.canvasid;
    var gscale   = chdef.gscale;
    var lblprop  = chdef.lblprop;
    // label: null displays as :"null" (). See legend: { display: false} below.
    var cdata = {labels: [], datasets: [{ "label": label, borderWidth: 1, data: [] }]}; // "Packages"
    // cdata.datasets[0].backgroundColor = color('rgb(255, 99, 132)').alpha(0.5).rgbString();
    var ctx = document.getElementById(canvasid).getContext('2d'); // 'canvas_pkg'
    chartdata(data, cdata, vprop, cmap, lblprop); // AoO to chart
    // console.log(JSON.stringify(cdata, null, 2));
    // Position for 'label' of each dataset. 'top' / 'bottom'
    //title: {display: true,text: 'Chart.js Bar Chart'}
    // display: false - Important !!
    var scales2 = rapp.dclone(scales);
    // TODO: setup ...
    if (chdef.gscale) { scales2.yAxes[0].ticks.suggestedMax = chdef.gscale; }
    var copts = { responsive: true, legend: {position: 'top', display: false}, scales: scales2, onClick: on_host_click}; // onCC
    if (chdef.noclick) { delete(copts.onClick);  }
    //window.myBar =
    var subtype = chdef.subtype; // "bar". ("pie" ?)
    new Chart(ctx, { type: subtype, data: cdata, options: copts });
  } // createchart
} // pkg_stats

//var idx = {};
    //pkginfo.forEach(function (it) { idx[it.hname] = it.pkgcnt; }); // || 0 ?
    //db.hosts.forEach(function (it) { it.pkgcnt = idx[it.hname]; });
    //console.log(db.hosts); console.log(idx);


  



/** fetch docker info and pass to UI-geared callback.
* @param hname {string} - Hostname
* @param gridsel {string} - Selector (id, "#...") for grid (TODO: dialogsel)
*/
function dockerinfo(hname, dialogsel, cb) { // gridsel
  var port = datasets.cfg.docker.port || 4243;
  if (!hname) { toastr.error("No hostname (from ui) for docker info"); return; }
  if (!dialogsel) { console.error("No dialogsel to forward call to"); return;}
  console.log("Calling docker API fetcher with dialogsel: "+dialogsel);
  var enttype = "images"; // "containers"
  if (dialogsel == 'dockercont') { enttype = "containers"; }
  var url = 'http://'+hname+':'+port+'/v1.24/'+enttype+'/json';
  axios.get(url).then(function (resp) {
    var pinfo = resp.data; // NO: data.data
    //console.log("Docker data: "+ JSON.stringify(pinfo, null, 2));
    if (!pinfo ) { toastr.error("No docker "+enttype+" data from " + hname); return; }
    if (!pinfo.length) { toastr.warning("No "+enttype+" found", "... on " + hname); return; }
    //  Creating grid to: '" + dialogsel + "'
    console.log("dockerinfo: got data " + pinfo + ""); // gridsel
    cb(pinfo, dialogsel);
    // OLD: showgrid(gridsel, pinfo, fldinfo.dockerimg); // TODO: Revive ?
  }).catch(function (error) { console.log(error); toastr.error("No Docker info"+ error); });
}
/** Display NFS exports from an NFS server.
 * @param hname {string} - Hostname
 * @param dialogsel {string} - Dialog selector
 */
function nfsinfo(hname, dialogsel, cb) {
  // Load data
  toastr.info("Loading Exports for "+hname);
  // MOCKUP: return cb([], dialogsel);
  axios.get("/showmounts/" + hname).then(function (resp) {
    var pinfo = resp.data;
    // console.log(pinfo);
    cb(pinfo, dialogsel); return;
  })
  .catch(function (error) { console.log(error); alert("No NFS info, "+ error); });
}


function rfinfo_uisetup(d) { // d not used (in here)
      $('.bbut').click(function (jev, ui) {
        console.log(jev); // JQuery.Event (has originalEvent)
        console.log(jev.originalEvent.target); // Same as this
        console.log("THIS:", this); // 2 elems ?
        console.log($(this).data('pxe'));
        var op = $(this).data('op');
        var url = "/rf/"+op+"/"+d.hname;
        var btype = "";
        if ($(this).data('pxe')) { url += "?pxe=1"; btype = " (PXE)"; }
        console.log("use URL: "+url);
        // var tid = setTimeout(() => {}, 10000);
        axios.get(url).then(function (resp) {
          console.log(resp.data);
          toastr.info("Op "+op+" executed on "+d.hname+btype); // in Progress
        }).catch(function (err) { alert(err); });
      });
    }
    
/** RedFish Info dialog.
 * TODO: Allow to use boot methods other than default
 */
function rfinfo(hname, dialogsel, cb) {
  //var tc = $('#redfish').html();
  //if (!tc) { return alert("No template content"); }
  
  toastr.info("Please wait ...", "Inquiring BMC Info");
  axios.get("/rf/info/" + hname).then(function (resp) {
    var rd = resp.data;
    if (rd.status == 'err') { return toastr.error(""+rd.msg); }
    //console.log("RFDATA", rd);
    var d = rd.data;
    if (!d) { return alert("No Data"); }
    console.log("RF-DATA:"+ JSON.stringify(d, null, 2));
    ///////// Setup Extra (to be usable) /////////////
    //function 
    d.hname = hname; // hname - here or server ?
    // Reset Types
    var resettypes; try { resettypes = d.Actions["#ComputerSystem.Reset"]["ResetType@Redfish.AllowableValues"]; } catch (ex) {}
    if (resettypes && Array.isArray(resettypes)) { d.ResetValues = resettypes; }
    // Boot media Types
    var mediatypes; try { mediatypes = d.Boot["BootSourceOverrideTarget@Redfish.AllowableValues"]; } catch (ex) {}
    if (mediatypes && Array.isArray(mediatypes)) { d.MediaValues = mediatypes; }
    // TODO: map esp. resettypes (maybe also mediatypes) to clickable links here or do on template ?
    // TODO: Add "Boot Options" that pops up options.
    // resettypes = resettypes.map((ri) => { return "<span class='rsttype' data-hname=''></span>"; });
    // BMC (MC) Info / Link
    if (rd.mcinfo && rd.mcinfo.ipaddr) { d.ipaddr = rd.mcinfo.ipaddr; }
    else { d.ipaddr = ""; }
    d.hname = hname;
    
    // TODO: Could call cb() here (to delegate templating ...)
    //console.error("Returning to FW.");
    return cb(d, dialogsel);
    /*
    //var out = Mustache.render(tc, d);
    //$('#'+ dialogsel ).html(out); // '#rfdialog'
    rapp.templated("redfish", d, dialogsel); // TODO (also elim. tc from above)
    $("#"+ dialogsel ).dialog(dopts_grid); // ????
    // Note: Original impl. never calls the cb, not using grid part of framework
    // OLD Spot / imperative call for rfinfo_uisetup
    
    rfinfo_uisetup(d);
    // No grid based dialog here
    */
  })
  .catch(function (error) { console.log(error); alert("No RF info, "+ error); }) // toastr.error
  .finally(() => { toastr.clear(); });
}
/** Produce Process Info Listing for a host.
 * See also: dockerinfo and http://$HOST:4243/v1.24/images/json
 */
function procinfo(hname, dialogsel, cb) {
  var port = datasets.cfg.procster.port || 8181;
  if (!hname) { toastr.error("No hostname (from ui) for proc info"); return; } // proc
  if (!dialogsel) { console.error("No dialogsel to forward call to"); return;}
  //console.log("Calling procps ...");
  var url = 'http://'+hname+':'+port+'/proclist'; // Dynamic
  axios.get(url).then(function (resp) {
    var pinfo = resp.data; // NO: data.data
    //console.log("Proc data: "+ JSON.stringify(pinfo, null, 2));
    if (!pinfo ) { toastr.error("No data from " + hname); return; }
    if (!pinfo.length) { toastr.warning("No procs found", "... on " + hname); return; } // procs
    //console.log("procinfo: Creating grid to: '" + dialogsel + "' with data " + pinfo + ""); // gridsel
    // Could this roll back V8 object optimizations ?
    pinfo.forEach((it) => { it.hname = hname; }); // Data-preproc
    cb(pinfo, dialogsel);
    // OLD: showgrid(gridsel, pinfo, fldinfo.dockerimg); // TODO: Revive ?
  }).catch(function (error) { console.log(error); toastr.error("No Process info:", error); });
}

// $("#jsGrid").jsGrid("sort", field);
// NOTE: The new showgrid_opts() makes the controller short-lifetime, per grid instance (no global interference)
// http://js-grid.com/docs/#callbacks
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
  // First arg (obj) has: pageIndex:1, grid: ... Complemented dridopts w. extra. Has controller !!!
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
  // Re-run uisetup on refreshed grid
  function onRefreshed(gridev) {
    //console.log("Grid-refreshed: ", gridev);
    var grid = gridev.grid; // Has e.g. _sortOrder, onPageChanged (itself), _validation, paging: false
    var ctrl = grid.controller;
    var data = grid.data;
    //console.log("Grid-refreshed controller: ", ctrl);
    //$(".hostcell").click(() => { alert("Re-hooked"); }); // Test: Works !
    // Note: can use 1) closure act coming to showgrid() IFF onRefreshed() is inside it ... OR 2) attach act to controller
    let act = ctrl.act; // Controller stored act
    if (!act) { console.log("No act present, even if pre-validated !!!"); return; }
    if (!act.uisetup) { console.log("No act.uisetup present, even if pre-validated !!!"); return; }
    //if (ctrl.uisruncnt) {
    console.log("UI Setup has been run by grid N times: "+ctrl.uisruncnt); // }
    if (ctrl.uisruncnt && act.noresetup) { console.log("Prevent uisetup rerun");return; }
    act.uisetup(act, data);
    ctrl.uisruncnt++;
  }
}

/** Setup help for an routed app action with help markdown.
 * 
 * Refs:
 * 
 * - https://stackoverflow.com/questions/18838964/add-bootstrap-glyphicon-to-input-box
 * - https://stackoverflow.com/questions/18567098/css-bootstrap-add-icon-to-h1
 * 
 * @param act {object} - Action Object for the help action/topic
 * @param sel {string} - Selector for element (e.g. heading to which clickable help sybol/icon should be appended)
 */
function setuphelp(act, sel) {
  var hp = act.help; // Help page
  if (!hp) { console.log("No help for action, cancelling help-setup"); return; }
  // Nest-Select from router div ? What about dialog ?
  // First heading within router element
  var usel = sel || '';
  var hid = act.path + "_help";
  console.log("Append to: "+usel);
  //$(usel).append("<span id=\"" + hid +"\">FOO</span>"); // Help Icon
  // span makes a difference here.
  $(usel).append("<span id=\""+hid+"\" class=\"glyphicon glyphicon-question-sign\" style=\"position: relative;top: 1px;display: inline;padding-left: 10px;\"></span>");
  $("#"+hid).click(function (jev) {
    var url = "/web/help/"+act.help;
    console.log("Fetch help: "+url);
    axios.get(url).then((resp) => {
      var cont = resp.data;
      if (!cont) { return toastr.error("Empty help-doc for "+act.name+"!"); }
      // Wrapping Template ?: rapp.templated("");
      var c = new showdown.Converter();
      cont = c.makeHtml(cont);
      $("#helpdialog").html(cont); // act.name
      $("#helpdialog").dialog();
      //alert("Help:" + act.name);
    }).catch((err) => { toastr.error("Help Error:"+err);});
  });
}
