/** @file
* 
* # Router666 - Beastly lightweight routing for SPA Apps
* 
* Handle Client side routing in a SPA application in a toolkit / framework independent manner.
* The router itself does not have any dependencies and does not carry any inter-relationships
* to any particular web frameworks or toolkits.
* 
* Example of setup sequence for SPA App:

window.onload = function () {
  // Actions to be routed
  var acts = [
    {path: "proclist",  name: "Process List",  hdlr: proclist},
    {path: "procgraph", name: "Process Graph", hdlr: procgraph},
    {path: "hostgrps",  name: "Host Groups Graph",   hdlr: hostgrps},
    // "hostgrps_listing"
    {path: "hostgrps_\\w+",  name: "Host Groups List",   hdlr: hostgrps_listing},
    // TEST Items for paramsters
    {path: "proclist/:proc",  name: "Process List EXTRA",  hdlr: proclist},
    {path: "proclist/:proc/:proc2",  name: "Process List EXTRA",  hdlr: proclist},
  ];
  var router = new Router666({defpath: "hostgrps", debug: 1});
  $.getJSON("/resource.json", function (data) {
    app_setup(data); // Something that must be done before allowing user to navigate meaningfully
    // Only now enable routing (navigating around the app)
    router.start();
    toaster.clear(); /// ... or close spinner
  });
  // Distract user with popup during above data loading
  toastr.info('Welcome to THE App !'); // ... or start spinner
  
};

You can setup routes also in a more imperative / non data-driven way:

var router = new Router666({defpath: "hostgrps", debug: 1});
router.add("search", handle_search);
router.add("request/:id", handle_details);
...
router.add("proclist", handle_proclist);
router.start();

## Action properties

These properties appear as parameters of `router.add(path, hdlr)` method or are used as member names in
in objects of action array in call form `router.add(array_of_actions)`.

- path - URL path to route (e.g. "#/adm/remove")
- hdlr - Event Handler callback for action (called at routing event)
- name - Optional name for the action (not directly used by router). May be useful for generating
  navigational HTML elements through which routing often happens (this would happen outside this routing toolkit).

### Handler interface

All action handlers have interface:

    hdlr(ev, act);

where the parameters are:
- ev - the very traditional JS Client side event complemented with "params" member for route url/path extracted params
  - For JS events see: [Events](https://developer.mozilla.org/en-US/docs/Web/Events) => [Mouse Events](https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent)
  - **ev.params** - Paramaters for route URL (*if* route was parameterized route). params member is absent for non-parameteric routes.
- act - the action node originally matched for route (And added during initialization of routing with add() method).

###  Imperative routing

Not available at this time as router.route(ev) works by events.
TODO: router.route_to("/path") with simulated (or modded) event.

## Author

(C) Olli Hollmen 1998-2020

## References

- https://stackoverflow.com/questions/5367369/named-capturing-groups-in-javascript-regex
- Google: javascript router
*/

/** Create new router.

Options in opts:
- **defpath** - default route path to route to when application starts. Should be exactly one of paths added later (by add() method).
- **debug** - Produce verbose output in console (for development and learning purposes)
@todo Add possibility to resolve handlers from a "namespace object" with string names mapped to functions (possibly several or dot.notation ?).
*/
function Router666(opts) {
  
  var defopts = {pathattr: "path", hdlrattr: "hdlr", nameattr: "name", defpath: "/", "debug": 0};
  opts = opts || defopts;
  var debug = opts.debug || 0;
  var coreprops = ["pathattr","hdlrattr", "nameattr", "defpath", "noactcopy"];
  coreprops.forEach(function (p) { if (!opts[p]) { opts[p] = defopts[p]; } });
  
  debug && console.log("Options after merge w. defaults: "+JSON.stringify(opts));
  Object.keys(opts).forEach(function (p) { this[p] = opts[p]; }, this);
  this.routes = {};
  this.routesarr = [];
  // this.debug = 0;
  debug && console.log("Router666 (v. "+Router666.VERSION+") instance:", this);
}

Router666.parapatt = /(:(\w+))/g; // Parameter pattern
Router666.pprepl = '([^\/]+)';
Router666.VERSION = "0.0.1";

/** Add route path and handler to router routing table.
* Can alternatively accept a set of actions describing routes.
* Create regexp and pre-cache it in action for fastest possible routing.
* 
* @param path - Route path as RegExp string or fixed path
* @param hdlr - Route handler callback
* @param name - Displayable (short) name for route
*/
Router666.prototype.add = function (path, hdlr, name) {
  var debug = this.debug;
  if ((arguments.length == 1) && Array.isArray(path)) {
    this.debug && console.log("add: Got Array to add (" + path.length + " items)");
    // var self = this; // Not needed
    path.forEach(function (it) {
      // if (this.noactcopy) { this.addact(it); }
      this.add(it[this.pathattr], it[this.hdlrattr], it[this.nameattr]);
    }, this);
    debug && console.log("add(batch): ", this.routesarr);
    return;
  }
  //console.log("Add path:" + path);
  // this.debug && console.log(JSON.stringify([arguments[0], arguments[1], arguments[2]]));
  var act = { path: path, hdlr: hdlr }; // name: (name ? name : "Route for " + path)
  if (name) { act.name = name; }
  debug && console.log("add: Action node created: ", act);
  ////////////// TODO: Separate this to another method ... ///////////////
  // this.addact(act);
  // Router666.prototype.addact = function (act) {
  // var debug = this.debug;
  // if (typeof act !== 'object') { throw "Action is not an object !"; }
  // if (typeof act.hdlr !== 'function') { throw "Action handler is not an callable function !"; }
  if (act.path.match(/\^/)) { throw "Do not include caret (^) in path"; }
  if (act.path.match(/\$/)) { throw "Do not include sigil ($) in path"; }
  // TODO: Replace parameter notation
  try {
    var ppmatch = act.path.match(Router666.parapatt); // All by 'g'
    let path = act.path;
    if (ppmatch) {
      act.pnames = [];
      debug && console.log("add: Has "+ ppmatch.length +" params in path: " + path);
      path = path.replace(Router666.parapatt, function(match, p1, p2, off) { // TODO: path vs. act.path
        var arr = [match, p1, p2, off]; // p2 is the param tag. arr is wasted (!?)
        debug && console.log("add: replace: Got: " + arr);
	act.pnames.push(p2);
        return '([^\/]+)';
      });
      debug && console.log("add: Converted orig path to: " + path);
    }
    act.pathre = new RegExp("^"+path+"$");
    debug && console.log("add: Created and added path RegExp: " + act.pathre);
  } catch (ex) { console.log(ex.message + " in " + path); }
  // Add path to routes table
  if (this.routes[act.path]) { console.error("Routing for path '"+act.path+"' already exists, not adding "); return; }
  this.routes[act.path] = act; // OLD: hdlr, NEW: act
  this.routesarr.push(act);
  // }; // addact
  
};
// Add ready-to-go action (or action set) to router.
// Whether action is added as-is or deep copied to not alter original action
// depends on option "noactcopy" in construction options.
// @param 
Router666.prototype.addact = function (act) {
  
};
/** Handle dispatch routing event.
 * As the nature of event is "hashchange" on browser URL line, the target
 * of event is (always?) Window, which is not useful info. Unfortunately,
 * the element that (... dictated the routing is often not meaningful as ...)
 * @todo Call handler in a try/catch block ?
 */
Router666.prototype.route =  function (ev) { // ev
  //console.error("Route ev:", ev);
  var path = (location.hash || '#').substr(1);
  var def = 0;
  if (!path) { path = this.defpath; def = 1; }
  this.debug && console.log("route: Execute routing for '"+path+"' (def:"+def+")");
  //var act = acts.filter(function (act) {
  //  return act.path == path;
  //})[0];
  //if (!act) { alert("Act not found"); return; }
  //act.hdlr(ev);
  // Match path
  var routes = this.routes;
  var routesarr = this.routesarr;
  var hdlr;
  //for (rpath in routes) {
  //  var re = new RegExp("^"+rpath+"$");
  //  console.log("Got re:" + re);
  //  //if (path === rpath) { hdlr = routes[rpath]; break; } // Literal comp
  //  if (path.match(re)) { hdlr = routes[rpath]; break; }
  //}
  var act;
  var marr;
  for (var i =0; i < routesarr.length; i++) {
    act = routesarr[i];
    //(debug > 1) && console.log("route: Try match: " + act.pathre);
    if ( marr = path.match(act.pathre) ) { hdlr = act.hdlr; marr.shift(); break; }
  }
  if (hdlr) {
    this.debug && console.log("Routing using: " + act.pathre + " X-Params: " + marr + " names: " + act.pnames);
    var params;
    // AND 
    if (act.pnames) { params = this.mkparams(act, marr); }
    ev.params = params;
    hdlr(ev, act);
    return; // false
  }
  console.error("route: Could not do routing properly for path (missing hdlr ?): " + path);
}
/** Make routing url derived parameters combining the parameter names from actions
* and values extracted from URL.
*/
Router666.prototype.mkparams = function (act, marr) {
  var params = {};
  if (act.pnames.length != marr.length) { throw "mkparams: Param k-v count mismatch."; }
  for (var i = 0;i < act.pnames.length;i++) { params[act.pnames[i]] = marr[i]; }
  this.debug && console.log("Route params: ", params);
  return params;
};
/** Start Routing on URL line hash changes.
* Routing can be started after setting up all 
*/
Router666.prototype.start = function () {
  // Check / Validate default path
  location.hash = '#'; // Safe to change / set, no listener yet
  
  var act = this.routes[this.defpath];
  if (!act) { throw "start: Could not lookup action for default route path ("+this.defpath+")!"; }
  var hdlr = act.hdlr;
  if (!hdlr) { throw "start: Default Route Not Properly Configured (" + this.defpath + ")"; }
  var self = this; // For onchange
  // 
  var onchange = function (ev) {
    // if (self.pre) { self.pre(); } // In route() ?
    self.route(ev);
    // Similar post
  }; // return false ?
  window.addEventListener("hashchange", onchange, false);
  // Change to default ?
  this.debug && console.log("start: Set default path/route: "+this.defpath);
  location.hash = this.defpath; // Auto-dispatches (as ev. listener is set)
  this.debug && console.log("start: START Routing (by UI events) !!!");
};
/** */
Router666.prototype.generate = function (what, acts, opts) {
  var what_opts = {
    "handlers": function () {
      cont = "/* JS route Handlers */\n";
      function replacer(path) { return path.replace(/\W/g, "_"); }
      acts.forEach(function (it) {
        // Parse something or check actid
	var id = (typeof it.hdlr == 'string') ? it.hdlr : replacer(it.path);
        cont += "function hdl_"+id+"(ev, act) {\n\n}\n";
	
      });
      return cont;
    },
    "menu": function () {
      var cont = "<ul id=\"menu\">\n";
      // TODO: Should not generate for parametrized routes
      acts.forEach(function (it) {
        //if (it.path.match(/:\w+/)) { return; }
        cont += "<ul><a href=\"#"+it.path+"\">"+it.name+"</a></ul>\n";
      });
      cont += "</ul>"; return cont; }
  };
  var gencb = what_opts[what];
  if (gencb) { return gencb(); }
  console.error("Don't know how to generate: "+ what);
  return null;
};
