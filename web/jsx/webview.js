/** @file
 * # webview - Create Web views
 * 
 * Webview library aims to provide tools to create minimalistic web applications (SPA)
 * front ends with no mandated dependencies.
 * 
 * - Author: Olli Hollmen (2013-2020)
 * - License: MIT
 * 
 * ### Generating docs
 *     # TODO: -R README.md
 *     jsdoc webview.js -c ./jsdoc.conf.json
 *
 * ### TODO
 * Create universal facility to place generated content to an element whose selector (id?)
 * is given in property "destelem" of opts object.
 */
"use strict;";
var console;
// var webview;
// if (webview) { var msg = "JS Symbol conflict - webview already exists !"; window ? alert(msg) : console.error(msg); }
// webview = {};
// Refs:
// Google: writing JS modules (writing modular javascript, javascript module example)
// http://addyosmani.com/writing-modular-js/
//   http://www.adequatelygood.com/JavaScript-Module-Pattern-In-Depth.html
// http://addyosmani.com/resources/essentialjsdesignpatterns/book/
// http://nodejs.org/docs/latest/api/modules.html

/** 
 * Create listview as HTML table.
 * @param result - Array of Objects to display as table
 * @param attrs - Attributes to display from each Object
 * @param opts - Additional options (see below)
 * Additional options (opts above) allows following parameters:
 * - als - Display names for key attributes (of Objects)
 * - plugs - Field callbacks (Sign: (val, ent, attr, ctx)
 * - numprec - Numeric precisions for numeric columns to auto-format (value must be of JS type 'number')
 * - ctx - context to pass to field plugins
 * - thtb - Add thead / tbody elements to structure (This single flag adds both)
 * - thcl - Table heading class to embed into th elements.
 * - tabcl - Table style class (default: webview_list)
 * 
 * Note: To have table header (th) elements left aligned: Use style: `th { text-align: left; }`
 * (this is likely what you want as browsers still default to having th text center-aligned).
 */
function listview (result, attrs, opts) { // als, plugs, ctx in opts ?
  // Do not check inner Objects in result - act in good faith
  // Check arrays
  if (! (result instanceof Array)) {throw "listview: result Not an array";}
  if (! (attrs instanceof Array)) {throw "listview: attrs Not an array";}
  opts = opts || {};
  var plugs = opts.plugs || {};
  var ctx = opts.ctx || {};
  var als = opts.als || {};
  var numprec = opts.numprec || {};
  // TODO: Allow thead ... tbody ?
  var tabcl = opts.tabcl || "webview_list"; // Default
  var out = "<table class=\"" + tabcl + "\">\n";
  if (opts.thtb) {out += "<thead>\n";}
  out += "<tr>";
  //if (als) {attrs.map(function (at) {out += "<th>" + als[at] + "</th>";});}
  // else ...
  var thsty = opts.thcl || "";
  attrs.forEach(function (at) {
    out += "  <th class=\"" + thsty + "\">" + (als[at] ? als[at] : at) + "</th>\n";
  });
  out += "</tr>\n\n";
  if (opts.thtb) {out += "</thead>\n<tbody>\n";}
  result.map(function (e) {
    out += "<tr>\n";
    // " + JSON.stringify(at.name) + "=
    attrs.map(function (at) {
      var p = plugs[at];
      if (p) {out += "<td>" + p(e[at], e, at, ctx) + "</td>";}
      //if (at == pkattr) {out += "<td><a href=\"?act=showrec&recid="+ e[at] + "\">"+ (e[at] ? e[at] : "") + "</a></td>";}
      else if ((typeof e[at] == 'number') && (typeof numprec[at] != 'undefined')) {
        out += "<td>" + e[at].toFixed(numprec[at]) + "</td>";
      }
      // MUST detect undefined (false value is not enough (e.g. explicit 0)
      else {out += "<td>" + (typeof e[at] != 'undefined' ? e[at] : "") + "</td>";}
      
    });
    out += "\n</tr>\n";
  });
  if (opts.thtb) {out += "</tbody>\n";}
  out += "</table>";
  return (out);
} // listview

/** webview.seview()
 * Create single entry view.
 * @param {Object} e - Entry to display as HTML (passed as Object)
 * @param {Array} attrs - List (array) Attributes to display from the Object
 * @param {Object} opts - Additional options (optional, see below)
 * Options in opts:
 * - plugs - Callbacks for transforming values (see plugins doc below)
 * - ctx - Additiona "user data" for use in plugins (see plugins doc below)
 * - als - property/attribute names mapped to display names
 * 
 * ## Plugin interface
 * Plugins will be dispatched with following signature:
 *
 *      cb(propvalue, entry, propname, ctx)
 *
 * in which signature the parameters are:
 * - propvalue - Property value
 * - entry - Entry Object for single view (passed as e)
 * - propname - propery name for current property (for reuse of plugins between properties)
 * - ctx - Additional "user data" Object (or any other data) for processing of attribute plugin.
 *
 * Note: For first 2 params plugins are compatible with jsgrid plugins.
 *
 * ### Example
 *
 * 
 *      var e = {"fname":"Millie", "lname":"Johnson", "dob":"1894-04-27", "gender":"F", };
 *      var als = {"fname":"First Name", "lname":"Last Name", "dob":"Born on", "gender":"gender", };
 *      function gendertrans(propvalue, entry, propname, ctx) {
 *        var tr = {"F" :"Female", "M":"Male"};
 *        return tr[propvalue];
 *      }
 *      var opts = {als: als, plugs: {gender: gendertrans}};
 *      var cont = webview.seview(e, opts);
 *      $("#sentry").html(cont);
 */
function seview (e, attrs, opts) {
  if (! (e instanceof Object)) {throw "seview: entry Not an Object";}
  attrs = attrs || [];
  if (! (attrs instanceof Array)) {throw "seview: attrs Not an array";}
  if (!attrs.length) {for (var k in e) {attrs.push(k);}} // Use attrs from Object e
  opts = opts || {};
  var plugs = opts.plugs || {};
  var ctx = opts.ctx || {};
  var als = opts.als || {};
  if (opts.debug) {console.log("Using attrs: " + JSON.stringify(attrs));}
  var out = "<table>";
  attrs.forEach(function (at) {
    var p = plugs[at];
    var lbl = als[at] ? als[at] : at;
    out += "<tr><td><label>" + lbl + "</label></td>";
    if (p) {out += "<td>" + p(e[at], e, at, ctx) + "</td>";}
    //if (at == pkattr) {out += "<td><a href=\"?act=showrec&recid="+ e[at] + "\">"+ (e[at] ? e[at] : "") + "</a></td>";}
    else {out += "<td>" + (e[at] ? e[at] : "") + "</td>";}
    out += "</tr>";
  });
  out += "</table>";
  return (out);
}
/** Create a matrix view of items in AoO.
* Matrix view creates a tabular view of items passed to it taking care of
* table, rows and cells, generating HTML for them and closing everything
* off appropriately.
@param items {array} - Items to display in a matrix view in an array.
@param cellcb {function} - Function to create single cell in the view.
@param opts {object} - Options for creation of matrix view
* Options in opts:
* - colcnt - Column count (as positive integer, default: 5)
* - rowcl - Row class
* - tabcl - Table class
* - ctx - Contextual custom "user data" to pass cell callback (see cellcb) and 2nd parameter
* Cell Callback parameters / Signature:
*     
*     cellcb(arr_entry, context)
*     
* Where parameters have meaning:
* - arr_entry - Single Object in array
* - context - Additional context (typically object, but not limited to being object) passed as opts.ctx
*   (see above)
*/
function matrix(arr, cellcb, opts) {
  if (!cellcb) {throw "No Cell callback";}
  if (typeof cellcb != 'function') { throw "Cell callback is not a function";}
  var rattr = opts.rowcl ? "class=" + opts.rowcl + "\"" : "";
  var cols  = opts.colcnt || 5;
  var ctx   = opts.ctx || {};
  var tabcl = opts.tabcl || "";
  var cont = "<table class=\"" + tabcl + "\">\n";
  var i = 0;
  arr.forEach(function (e) {
      if (i === 0) {cont += "<tr "+ rattr + ">\n";}
      //if (cellcb)  {
      cont += "<td>" + cellcb(e, ctx) + "</td>";
      //}
      i++;
      if (i >= cols) {cont +=  "</tr>\n";i=0;}
   });
  
  if (i !== 0) {cont += "</tr>\n";}
  cont += "</table>\n";
  return(cont);
}

/** Convert (i.e organize) typical vwebview parameters into a JqGrid colModel and wrapping config.
* Config will be partial with most default settings set, you will need to set the rest (like "url").
* @param attrs - Attributes (in Array)
* @param als - Aliases / Display names (in Object/Hash)
* @param opts - Additional options: data - local AoO data, do not use HTTP to fetch
*/
// http://stackoverflow.com/questions/27966057/jqgrid-paginator-not-visible-in-scroll-pagination
function tojgcmodel(attrs, als, opts) {
  // TODO (Research): gridview: true,
  var cfg = {mtype: "GET", datatype: "json", viewrecords: true}; // url: "", datatype may also be jsonp
  var i = 0;
  opts = opts ? opts : {};
  // Local data ... change datatype, delete mtype, add data
  if (opts.data) {
    cfg.datatype = "local";delete(cfg.mtype);cfg.data = opts.data;
  }
  // Create col model
  cfg.colModel = attrs.map(function (v) {
    var al = als[v] ? als[v] : v;
    var w = opts.widths[v] ? opts.widths[v] : 75; // Allow override
    var colmi = {name: v, label: al, width: w};
    if (!i) {colmi.key = true;}
    i++;
    return (colmi);
  });
  return (cfg);
}

/** Create a simple linear navigation menu for the actions passed (as Array).
* Action objects may/must have following:
* - name - Displayed to user as action name
* - id - action id: gets embedded in URL as action parameter (based on opts.akw or "act" by default, see below)
* - Any properties that custom callback opts.hrefcb may utilize
*
* @param acts Array containing action objects explained above
* @param opts - Additional Options  
* Options in opts:
* - akw - action keyword (default: "act")
* - divid - element ID for an outer div to create and wrap the ul list with
* - OLD: hrefcb - callback to generate link (href) URL 
* - licb - callback to generate "li" element content with signature licb(action_item)
* 
* @return HTML (unordered list) Content for the menu.
*/
// example function () {return "#";}
// Example of creating a menu items with links to be generated and handled by VueRouter:
//      var opts = {
//        licb: function (item) { return "<router-link to=\""+item.path+"\">"+item.name+"</router-link>"; }
//      };
//      webview.navimenu(routes, opts);
//
function navimenu (acts, opts) {
  opts = opts || {};
  var menu = "";
  var akw = opts.akw || "act"; // NOT req.app.akw (tight coupling)
  if (opts.divid) {menu += "<div id=\"" + opts.divid + "\">";}
  var hrefcb = function (it) {return "?" + akw + "=" + it.id;};
  if (opts.hrefcb) { hrefcb = opts.hrefcb; } // Check hrefcb is function !
  var licb = function (it) {
    return "<a href=\"" + hrefcb(it) + "\" data-actid=\"" + it.actid + "\" >" + it.name + "</a>";};
  if (opts.licb) {licb = opts.licb;}
  menu += "<ul >";
  acts.map(function(it) {
    // var id = it.id || it.actid || ""; // OLD
    // <a href="' + hrefcb(it) + '" data-actid="' +id + '">'+ it.name + '</a>
    menu += "<li>" + licb(it) + "</li>";
  });
  menu += "</ul >";
  if (opts.divid) {menu += "</div>";}
  return (menu);
}
/** Create a nested and hierarchical HTML list.
* Usable for (e.g.) hierarchical navigation menu.
* @param treeroot {array} - The tree structure staring as an array (If you have an object, wrap it with an array)
* @param opts {object} - Options for HTML output
* @return Generated HTML content
*
* Parameters in **opts**:
* - subattr - Attribute/property in tree nodes containing child items (Defaul5t: "children")
* - nameattr - Name attribute in node (Mostly for default output by default licb, default value: "name")
* - idattr - ID attribute to embed to (default) link.
* - licb - List item callback for rendering the LI cell (Gets parameters: (nodeitem), Must return content, Defaul: Plain )
* - licl - Custom listitem class
* - lvlsty - Custom level style class
* - debug - produce debug output
* 
*/
function navimenu2l (acts, opts) {
  if (!opts) {throw "No Sub-item attribute";}
  // var f = opts.licb; // Not Used ?
  // Allow passing akw
  // var bu = opts.baseurl ? opts.baseurl : "?act="; // Not used ?
  if (!opts.licl) {opts.licl = "";}
  if (!opts._lvl) {opts._lvl = 0;}
  var lvl = opts._lvl ; // Recursion depth Level index (0...) || 0
  var ida = opts.idattr || "id";
  var na = opts.nameattr || "name";
  //var ovas;
  var suba = opts.subattr || 'children';
  if (!suba) { throw "No Sub-item attribute"; }
  // quaternary, quinary, senary, septenary, octonary, nonary, denary
  var lsty = opts.lvlsty || ["primary", "secondary", "tertiary"]; // Level styles arrayref
  if (!Array.isArray(lsty)) {throw "Need level styles as array";}
  // Default list item / link CB.
  var licb = opts.licb || function (n) {return "<a href=\"" + n[ida] + "\">" + n[na] + "</a>";};
  // Overriding id,name attrs for AoH items
  // TODO:
  // if (var ovas = opts.attrs) {(ida, na) = @ovas;}
  if (opts.debug) {console.log(JSON.stringify(acts));}
  // Test One of the sub actions (of current action n) is current action
  // NOTUSED: var childcurr = function () {var (n, currid) = @_;grep({_.actid eq currid;} @{n->{suba}});};
  // 'id' ok, since one of each level will be open at time (?)
  var OUT = "";
  OUT += "<ul class=\"" + lsty[lvl] + "\">\n"; // Fix: id => class
  acts.forEach(function (n) {
    // TODO: Need CB to lookup subarray ???
    var sa = n[suba]; // Look for subattr and associated subarray (if any)
    // http://stackoverflow.com/questions/202605/repeat-string-javascript
    OUT += new Array( lvl + 1 ).join( "  " ) + "<li class=\"" + opts.licl + "\">"; // Llvl) ra ASK sa (ra)
    // Is current in request / active action TODO: Detect parent too
    // var iscurr = (n->{ida} eq opts.cid) || childcurr(n, opts.cid); # || (n.parent->{ida} eq opts.cid)
    // Current under iteration (pass iscurr ?) or deco 'li'
    OUT +=  licb(n);
    // Sub hierarchy for "current".
    // NEW: Give up concept of current and create all subtrees for all menus, NOT ONLY CURRENT.
    // iscurr &&
    if (sa && Array.isArray(sa) && sa.length) {
      // Deep copy opts to override '_lvl'
      // var newlvl = lvl + 1;
      opts._lvl++;
      OUT += navimenu2l(sa, opts);
      opts._lvl--;
    }
    OUT += "</li>\n";
  });
  OUT += "</ul>\n";
  return (OUT);
}

/** Traverse array tree.
 * Common context "user data" for the whole traversal can be held in opts, however avoiding the members...
 * @param arr {array} - Array to traverse
 * @todo Circular traversal check
 */
function traverse(arr, cb, opts) {
  // Mandate opts ? fall back ?
  opts = opts || {};
  var suba = opts.subattr || "children";
  if (!cb) { throw "Need CB for traversal"; }
  // Traverse items calling traverse on all sub-arrays
  arr.forEach(function (n) {
    var sarr = n[suba];
    cb(n, opts);
    // Has children
    if (sarr && Array.isArray(sarr) && sarr.length) {
      opts._lvl++;
      traverse(sarr, cb, opts);
      opts._lvl--;
    }
  });
}

/** Set options into a HTML select element.

@param {array} arr - Options array as Array Of Objects (AoO with "id" and "name" properties. See opts.aid,aname for having different properties to be the id/name)
@param selelem {object} - Native HTML "select" DOM element 
@param opts {object} - Additional options for populating menu (optional)

Options:
- aid - Object attribute/property for id value for option item
- aname - Object attribute/property for displayable name for option item
- def - Selected default value (or multiple values) within menu

### Example of usage

Basic usage (with menuopts objects having "id" and "name" propeties):

    var menuopts = [{id:"ford", name: "Ford Motors"}, {id:"chevrolet", name: "Chevrolet / GM"}, ];
    // Raw DOM API
    var selel = document.getElementsByName("brand");
    webview.addoptions( menuopts, selel);
    // Same JQuery assisted
    webview.addoptions( menuopts, $('[name=brand]').get(0));
    
With custom attributes:

    var menuopts = [{vendorlbl:"ford", companyname: "Ford Motors"}, {vendorlbl:"chevrolet", companyname: "Chevrolet / GM"}, ];
    var selel = $('[name=brand]').get(0)
    webview.addoptions( menuopts, selel, {aid: "vendorlbl", aname: "companyname"});

http://www.w3schools.com/jsref/coll_select_options.asp
@todo: Possibly add fancier version that derives info from data-... elements
in option menu.
*/
function addoptions(arr, selelem, opts) {
  selelem.innerHTML = ""; // Reset
  if (!opts) {opts = {};}
  var aid = "id";
  var aname = "name";
  if (opts.aid) {aid = opts.aid;}
  if (opts.aname) {aname = opts.aname;}
  if (!Array.isArray(arr)) {throw "Options NOT in Array, got: " + arr;}
  arr.map(function (e) {
    var option = document.createElement("option");
    option.text  = e[aname];
    option.value = e[aid];
    selelem.add(option);
  });
  // Extra round of map to select particular item(s)
  // selectedIndex
  //NOTUSED:var ismultidef = function (v) {return def[v];}; // exists ? def[v] != undefined  typeof variable !== 'undefined'
  // var isdef = function (v) {return (v == def);}; // TODO
  var def = opts.def;
  var def2 = selelem.getAttribute("data-defval");
  if (def2) { def = def2; }
  if (def) {
    console.log("Got default :'" + def + "'");
    // TODO: Detect if def is single scalar or Object
    var i;
    for (i = 0; i < selelem.length; i++) {
      // MULTI: def[ selelem.options[i].value ]
      if (selelem.options[i].value == def) {
        // if (opts.debug) { ...}
        console.log("Found (single scalar) item :" + i);
        selelem.selectedIndex = i;
        break;
      }
    }
  }

}
/** Create simple (ul) list from AoO in arr.
* @param arr {array} - Set of items (array of Objects) to display on list
* @param opts {objects} - Options for list
* Options in opts:
* - uldivid - Create wrapping div for "ul" list. Even empty string triggers creation of div. If non empty value is given it is used as id for wrapping div.
* - titleattr - Title property / attribute in objects of AoO (arr)
* - liclass - Style class(es) to add to "li" list items
* - hrefattr - Attribute to get the href="..." value from. If not given the href is filled as "#".
* - dataattr - One or more data attributes given as Array to place into anchor elements as HTML5 "data-...=" attribute. The suffix of data-... is taken directly from attribute name (for simplicity, to avoid mapping)
* - licb - Listitem callback to generate (Default: place title property as content)
*
* ### Example
*      var items = [{id:"ford", name: "Ford Motors"}, {id:"chevrolet", name: "Chevrolet / GM"}, ];
*      var opts = {
*        titleattr: "name",
*        uldivid: "vehiclelist",
*      }
*      webview.list(items, opts);
*
*/
function list(arr, opts) {
  opts = opts || {}; // Defaults ?
  var cont = "";
  if (opts.ldiv || opts.uldivid) {
    
    cont += "<div ";
    if (opts.uldivid) {cont += " id=\""+opts.uldivid+"\" ";}
    cont += ">\n";
  }
  cont += "<ul>\n";
  var titleattr = opts.titleattr;
  var hrefattr  = opts.hrefattr;
  var dataattr  = opts.dataattr;
  arr.forEach(function (item) {
     if (opts.licb) { opts.licb(item); return; }
     // class=\"" + opts.liclass + "\"
     cont += "<li><a  href=\""+ (hrefattr ? item[hrefattr] : "#") + "\"";
     if (dataattr) {
       dataattr.forEach(function (da) {
         cont += " data-" + da + "\"" + item[da] + "\" ";
       });
     }
     cont += ">" + item[titleattr] + "</a></li>\n"; // End li
  });
  cont += "</ul>\n";
  // NONEED: Fix (||) cause having uldivid ONLY will not need closing div
  if (opts.ldiv || opts.uldivid) { cont += "</div>\n"; }
  return(cont);
}
/** Create multiple separate grouped lists.
* 
* Example use case would be (Jquery) accordion widget.
* Uses webview.list() to create each of the inner lists.
*
* @param arr {array) - Outer array of multilist sections
* @param opts {object} - Options for multilist
*
* Option parameters in opts:
*
* - **divid** - wrapping (outer) div element id
* - **divattrs** - html attributes for wrapping (outer div)
* - **hdrattr** - Title Header attr in the elements of outer arr
* - **hdrcb** - Title Header attr generation callback (gets passed item in outer array)
* - **subitemsattr** - Sub items attribute
*
* For inner lists, all the options for webview.list() are applicable.
*
* ### Example

     // Outer Data with 2 sections, 3 and 2 items each (respectively)
     var arr = [
       {name: "Group 1"; items: [{},{},{}]},
       {name: "Group 2", items: [{},{}]}
     ]; 
     var opts = {divid: "accordion", hdrattr: ""}
     webview.multilist(arr, opts);
*
* ### CSS Recommendations
*
* To leave out bullets from listitems, use style: `#multilist ul {list-style-type: none;}`
*
* @todo possibly prefix div* opts with "outer" to allow inner list opts
* to be more simple
* @todo shorten subitemsattr
* @todo allow callback for header (hrdcb)
*/
function multilist(arr, opts) {
  opts = opts || {divid: "multilist"};
  opts.ldiv = true;
  var cont = "";
  // Naive implementation and does not account for items needing escaping
  // (all in the interest of performance and simplicity)
  function makeattrs (ats) {
    var acont = "";
    if (!ats || (typeof ats != 'object')) { return ""; }
    for (var k in ats) { acont += " "+k+"=\"" + ats[k] + "\" "; }
    return acont;
  }
  // Always wrapped / contained by div
  // See makeattrs on how to work attrs like data-role="collapsible-set"
  cont += "<div id=\"" + opts.divid + "\" "+ makeattrs(opts.divattrs) +">\n";
  arr.forEach(function (it) {
    if (opts.hdrcb) { cont += "<h3>"+opts.hdrcb(it)+"</h3>\n"; }
    else if (opts.hdrattr) { cont += "<h3>"+it[opts.hdrattr]+"</h3>\n"; }
    //cont += "  <div>\n"; // TODO leave class (or other attr) clue to have
                         // callers to be able to add attrs !!!
    var itemarr = it[opts.subitemsattr]; // 
    // Try to give a debug friendly clue on what is missing
    if (!itemarr || !Array.isArray(itemarr)) {
      cont += "<p>No items in '"+opts.subitemsattr+"' (Add correct subitemsattr)</p>";
    }
    else { cont += webview.list(itemarr, opts); }
    //cont += "  </div>\n";
  });
  cont += "</div>\n";
  return cont;
}
/** Create JQuery tabs compliant HTML skeleton for tab-items passed.
* TODO: nodiv (e.g. generate inside existing div)
*/
function tabs(arr, divid, opts) {
  opts = opts || {};
  var nodiv = opts.nodiv || !divid || 0;
  var cont = nodiv ? "" : "<div id=\"#"+ divid +"\" >\n";
  var cgen = opts.cgen || null;
  cont += "<ul>\n";
  arr.forEach(function (it) {
    cont += "  <li><a href=\"#"+it.id+"\">"+it.name+"</a></li>\n";
  });
  cont += "</ul>\n";
  arr.forEach(function (it) {
    cont += "  <div id=\""+it.id+"\">\n";
    // Fill-up Callback ?
    if (it.cont) { cont += it.cont; }
    else if (cgen) { cont += cgen(it, opts); }
    cont += "  </div>\n";
  });
  cont += nodiv ? "" : "</div>";
  return cont;
}

var webview = {
  listview : listview,
  seview : seview,
  tojgcmodel : tojgcmodel,
  navimenu : navimenu,
  navimenu2l : navimenu2l,
  traverse : traverse,
  addoptions : addoptions,
  matrix : matrix,
  list: list,
  multilist: multilist,
  tabs: tabs
};
//var exports;
//var module;
var window;
// Node boilerplate
if (!window) { module.exports = webview; }
