/** @file
 * # Load (ansible style) host inventory file and host facts
 * 
 * This linetboot module implements:
 * - Hosts list loading (from a simple text file similar to ansible hosts inventory)
 * - JSON host facts loading from ansible collected fact files
 * - Loading extra / custom hosts from a CSV format text files
 */
"use strict;";
var fs = require("fs");
var fact_path;
var colls;
var debug = 0;
/** Initialize host loader module.
* - fact_path
* - colls (Various host related Collections)
*/
function init(global, gcolls) {
  // TODO: Store whole global config.
  fact_path = global.fact_path;
  if (!fact_path) { console.log("hlr.init: No fact path given - can't continue without it..");process.exit(1);}
  colls = gcolls || {hostcache: {}, hostarr: [], hostnames: [], groups: {} };
  debug = global.debug || 0;
}
/** Create filtered (non-empty) set of lines from hosts file.
 * @param hfn {string} - Filename for hosts file
 * @return Array of Lines (on failures an empty array is still returned)
 */
function hostsfile_load(hfn) {
  var hnames = [];
  // Fatal or NOT ?!!!
  if (!fs.existsSync(hfn)) { console.log("hostsfile given ("+hfn+"), but does not exist !"); }
  // Keep else as above is not fatal for now. Parse hostsfile.
  else {
    // Refrain from doing too much hostsfile specific work here. Instead assume host lines in either
    // source - line oriented text fire and json array have the same format (refine stuff in common section)
    var hnames_f = fs.readFileSync(hfn, 'utf8').split("\n");
    hnames_f = hnames_f.filter(function (it) { return it.match(/^\s*$/) ? false : true; }); // Weed out empties
    hnames_f = hnames_f.map((l) => { return l.trim(); });
    if (Array.isArray(hnames_f)) { hnames = hnames_f; }
    
  }
  return hnames;
}

/** Find out the configured hostnames (from various possible places) and load host inventory.

**NO facts*** are loaded here (See `facts_load_all()` or `facts_load()` for that). 

Hosts list can come from:
- An Inventory style text file given in `global.hostsfile`
- A JSON array given (directly) in main config `global.hostnames` (Array)

In either case the (string) entries are in the same format, String:
- Starts with hostname
- Contains Optional key value pairs follow in `key=my+value`

As shown in sample key-value pair above, the spaces must be escaped with
same rules as URL (%HH sequences or '+' for space) as parsing the line
is whitespace delimiter based.

In general the format has a lot of similarities (basically is a subset) to Ansible hosts file format.
The format does not support (non-exlusive list, e.g.) host groups (and their nestedness) or group variables.
However individual variable format is close to same (Note URL escaping
style for linetboot though).

Host loading is performed in *synchronous* manner.
minimalistic loading of hosts for a generic app:

     var hlr = require("hostloader");
     hlr.init({ fact_path: "/path/to/facts" });
     var cfg = { hostsfile: "/path/to/hosts" };
     hostarr = hlr.hosts_load(cfg);
     // Access loaded things
     console.log("Host items:", hostarr);
     // (For now) hostparams are found in cfg Object passsed to hlr.hosts_load(cfg)
     console.log("Host params:", cfg.hostparams);
     // Gather facts (returns an array of facts)
     var hostsarr = hlr.facts_load_all();

* TODO:
* - throw on errors, strip out any process.exit().
* - Change global to opts object w. grpattr
*/
function hosts_load(global) {
  var hlines = global.hostnames;
  var hfn = global.hostsfile;
  // Line oriented text file. Renamed hnames => hlines
  if (hfn) { hlines = hostsfile_load(hfn); }
  if (!hlines || !Array.isArray(hlines)) { console.error("No Hostnames gotten from any possible source (main JSON config or external text file)"); process.exit(1);}
  debug && console.error(hlines.length + " Hostlines (before parsing):", hlines); // global.debug && ...
  // Allow easy commenting-out as JSON itself does not have comments.
  // Possibly Use /^\s+/ instead of /^\s*$/ to eliminate *any* line with space in front of it.
  hlines = hlines.filter(function (hn) { return (! hn.match(/^#/)) && (! hn.match(/^\s*$/)); }); // OLD: ^(#|\[)/ - keep [...] in and handle later
  // Trim all lines ? Seems trailing space used to crash parsing, now eliminated by pre-processing
  if (!hlines.length) { console.error("No hosts remain after filtering"); process.exit(1); }
  // NEW: Parse inventory-style free-form params here
  global.hostparams = {};
  colls.hostparams = {};
  var sectypes = {
    "": 1, // No sections encountered (yet)
    "group": 1,
    "groupvar": 1,
    "groupofgroup": 1,
  };
  //var i = 0;
  // Main "data" to collect - Groups, group vars, hnames
  var groups = {}; // record group members
  var groupvars = {}; // Collected group vars (assign at end)
  //var groupofgroup = {}; var hostparams = {};
  var hnames2 = [];
  // use same group state var for g,gv,gg ?
  var curr_g = ''; // Current group
  var curr_gvg = ''; // Group var group (Could re-use/overload curr_g)
  // var patts = {'gvar': //, 'gname': //};
  //var re_g = /^\[([^\]]+)\]/; // Group RE TODO: ^\[([\w+\-]+?)\] # Non-greedy with symbol, term at literal ']'
  // var pre = {g: //, gv: //, chld: //}; // parser-re
  var re_g = /^\[(\w+)\]/;
  var re_gv = /^\[(\w+?)\:vars\]/; // Group Vars RE. Elim: \-
  var re_chld = /^\[(\w+?)\:children\]/; // Children of a group
  var grpattr = (global.core && global.core.grpattr) ? global.core.grpattr : 'grpid'; // grplbl ?
  var in_gv = 0; // State: In group vars section
  var state = ''; // New state
  hlines.forEach(function (hnline) {
    var g; var gv; // Match arrays
    
    /////// Parser state changes - new section [...] /////////////////
    // Group Var (gv) section
    // DONE/OLD: Currently this must be first to test (Improve re_g to make matching order independent)
    if (gv = hnline.match(re_gv)) {
      console.log("Group var tag: '"+gv[1]+"' (line: "+hnline+")");
      curr_gvg = gv[1]; // Grab group name
      in_gv = 1; state = 'gv';
      return state;
    }
    // Group (mark as curr_g)
    else if (g = hnline.match(re_g)) {
      debug && console.log("new group-section: '" + g[1] + "'");
      curr_g = g[1];
      if (groups[g[1]]) { console.log("Warning: Duplicated group: "+g[1]); }
      groups[g[1]] = [];
      in_gv = 0; state = 'g';
      return state;
    }
    else if (g = hnline.match(re_chld)) {
      // No action
      in_gv = 0;
      curr_g = ''; // g[1]
      // groupofgroup[curr_g] = [];
      state = 'gg';
      return state;
    }
    //////////////////////////// Line in a section (hnline) ////////////////////
    //////// Group Var Line //////
    // Av k-v pair in Group vars section (for curr_gvg)
    if (in_gv) { // state == 'gv';
      var kv = hnline.split(/\s*=\s*/);
      let key = kv[0];
      let val = kv[1]; // trim ?
      // This may be unnecessary with group var post-population
      if (!groups[curr_gvg]) { console.log("Group '"+curr_gvg+"' not encountered yet, skipping"); return; }
      if ( ! groupvars[curr_gvg]) { groupvars[curr_gvg] = {}; }
      groupvars[curr_gvg][key] = val;
      return;
    }
    if (state == 'gg') {
      // groupofgroup[curr_g] = groupofgroup[curr_g] || [];
      //groupofgroup[curr_g].push(hnline);
      return;
    }
    ///////// Hostline (group or no-sect-yet) //////////////////
    // hent has "hn" (hostname) and "p" (params)
    if (state == '' || state == 'g') {
    var hent  = hline_parse(hnline); // Parses to "hn", "p"
    var hn = hent.hn;
    //global.hostparams[hn] = hent.p; // original (Bad)
    colls.hostparams[hn] = hent.p; // Module encapsulated
    debug && console.log("HN:" + hn);
    if (curr_g) {
      groups[curr_g].push(hn);
      // TODO: Post-process this *after* parsing
      //if (grpattr && !hent.p[grpattr]) { hent.p[grpattr] = curr_g; }
    }
    // NOT VALID: Collect hostnames later after parsing is fully complete.
    // Must be part of hostline parsing
    hnames2.push(hn);
    }
    //i++;
  });
  // 
  global.hostparams = colls.hostparams; // = hostparams; // For e.g. custom setup
  global.hostnames = hnames2; // NEW (OLD: hlines)
  colls.hostnames = hnames2;
  debug && console.log("Inventory Hostnames: " + JSON.stringify(global.hostnames));
  console.log(colls.hostnames.length+" Hosts from loop");
  //console.log(colls.hostnames.length+" Hosts dynamically post-loop");
  
  debug && console.log("Inventory Groups: ", groups);
  //debug && console.log("Final Hostparams: ", colls.hostparams);
  debug && console.log("Final Groupvars: ", groupvars);
  applygroupvars([], groups, groupvars);
  // NEW: Store groups
  colls.groups = groups;
  // NEW: Return for third party app (with no real global conf)
  return colls.hostnames;
  
}


/** Apply group variables to individual hosts after collecting groups and group vars.
   * Full parsing should be done at this point.
   * @param hnames {array} - Dummy
   * @param groups  {object} - Object with keys mapped to array list of group member hosts
   * @param groupvars {object} - Object of objects with outer objects keyed by groupnames and inner groups containing vars as key-val pairs
   */
  function applygroupvars(hnames, groups, groupvars) {
    // Drive by groupvars or groups (valid existing groups)
    Object.keys(groups).forEach((gn) => {
      
      var gvs = groupvars[gn];
      var hnames = groups[gn];
      if (!gvs) { return; } // No groupvars for current group
      if (!hnames || !Array.isArray(hnames)) { return; }
      // gvs or groups ?
      //Object.keys(gvs).forEach(() => {});
      hnames.forEach((hn) => {
        // Make sure colls.hostparams[hn] is object
        colls.hostparams[hn] = colls.hostparams[hn] || {};
        console.log("Assigning group vars for group "+gn+"");
        Object.keys(gvs).forEach((varkey) => {
          if (colls.hostparams[hn][varkey]) { return; } // Do not override ! Consider: != undefined ?
          colls.hostparams[hn][varkey] = gvs[varkey];
        });
        //colls.hostparams[hn][]
      });
    });
  }
//var p  = hline_parse(hnames, i, hnline);
    //var hn = hnames[i];
    //global.hostparams[hn] = p;
//else {global.hostparams[hnline] = {}; return;};

/** Parse single hostline.
Internal function to be used by hosts_load().
@param hline {string} - Current hostline to parse (from text file as-is)
@return object with "hn" (hostname) and "p" (host parameters)
*/
function hline_parse(hnline) {
  var p = {}; // Host params for the host presented by this line.
  var hn = hnline; // Simple Default: line is hostname
  if (hnline.match(/\s+/)) {
    
    var rec = hnline.split(/\s+/);
    //debug && console.log("Has space: '"+hnline+"' Rec: ", rec);
    
    hn = rec.shift(); // NEW
    // Parse remaining rec - Host Params
    //debug && console.log(rec);
    rec.forEach(function (pair) {
      
      var kv = pair.split(/=/, 2);
      kv[1] = kv[1].replace('+', ' ');
      p[kv[0]] = decodeURI(kv[1]); // Unescape
    });
    //debug && console.log("Pairs found (for hn:"+hn+"): ", p);
  }
  return {hn: hn, p: p}; // NEW (OLD: return p;)
}
//var hn = hnames[i] = rec.shift(); // OLD (Going by index gets out-of-sync)
//@param hnames {array} - An array of hostnames
//@param i {integer} - Index of current item (in hnames array)

/** Load Facts for all hosts.
 * Uses `facts_load(hn, opts) load individual host facts.
 * After this facts should be in module var colls.hostcache and colls.hostarr (See 2nd param passed to module init())
 * @param opts {object} - Options object to be forwarded to facts_load()
 * @return Hostarray
 */
function facts_load_all(opts) {
  opts = opts || {};
  if (!colls) { throw "No colls (module level) object !"; }
  if (!Array.isArray(colls.hostnames)) { throw "No member hostnames (as array) colls object !"; }
  colls.hostnames.forEach(function (hn) {
    var f = facts_load(hn, opts);
    if (!f) { console.log("facts_load_all: No facts for: "+hn); return; }
    host_add(f);
  });
  opts.debug && console.log("Cached: " + Object.keys(colls.hostcache).join(','));
  return colls.hostarr; // NEW. Maybe return all colls ? OR allow easy indexing
}


/** Load Ansible facts for a single host from facts directory.
* This is to be done during init phase.
* Cache facts into global facts cache by both (fqdn) hostname and ip address.
* @param hn - Hostname (a file by this name must be found in facts directory)
* @patam opts - Loading / parsing opst (debug)
* @return Host facts object for named host (OLD:None)
*/
function facts_load(hn, opts) { // ipaddr
  opts = opts || {};
  var absname = fact_path + "/" + hn;
  var facts;
  try {
    //facts = require(absname);
    if (!fs.existsSync(absname)) { console.error("No ansible_facts file ("+absname+") for host '" + hn + "'"); return null; }
    // For some reason this works for ansible host files as require() does not.
    var cont = fs.readFileSync(absname, 'utf8');
    
    facts = JSON.parse(cont);
    if (!facts) { console.log("No Facts loaded - corrupt JSON ?"); } // Check Object
    var facts0 = facts.ansible_facts; // Simplify !
    if (!facts0) {
      opts.debug && console.error("No 'ansible_facts' branch for host '" + hn + "'");
      // Sample a known property to "recover" a file
      var ipv4 = facts.ansible_all_ipv4_addresses;
      if (!ipv4) { return null; }
      facts0 =  facts; // Facts *DIRECTLY*
    }
    facts = facts0;
    // test keys
    //var keys = Object.keys(facts); // ansible_facts,changed
    //console.log("Found keys:" + keys.join(","));
  }
  catch (e) { console.error("Error loading Host JSON ("+absname+"): " +e.message); }
  // Detect discrepancies in hostname in local linetboot config and what's found in facts
  var hnerr = ""; // hn/fqdn/both
  if (hn != facts.ansible_fqdn) { hnerr = "fqdn"; }
  // NEW: Do not care about the plain hostname
  //if (hn != facts.ansible_hostname) { hnerr += hnerr ? " and hostname" : "hostname"; }
  if (hnerr) { console.error("WARNING: Host '" + hn + "' not matching fqdn and/or hostname: " + hnerr); }
  //var ip = facts.ansible_facts.ansible_all_ipv4_addresses;
  //if (ip.length > 1) { throw "Ambiguity for simple logic - "+hn+" has multiple interfaces:" + ip.join(","); }
  //ip = ip[0];
  // TODO: return facts; // Do caching outside ?
  // host_add(facts); // Do NOT add here
  return facts; // NEW
}
/** Add a host to appropriate array and index collections (by various props).
 * Collections that single host facts are added to:
 * - colls.hostcache (index object): Index by hostname, ip-address, mac address
 * - colls.hostarr (array): Append
 * @param facts {object} - Single host facts
 */
function host_add(facts) {
  if (!facts) { console.log("host_add: Got non-facts: '"+facts+"'"); return; }
  var ifinfo = facts.ansible_default_ipv4;
  if (!ifinfo) { console.error("No Net Interface info in facts."); return; }
  var ip = ifinfo.address;
  var maca = ifinfo.macaddress;
  var hn = facts.ansible_fqdn;
  // Brute force cache by name and ip addr to same cache / hash table
  colls.hostcache[hn] = facts;
  colls.hostcache[ip] = facts;
  // NEW: Also index by ethernet address. In facts it is lower case !!!
  if (maca) { colls.hostcache[maca] = facts; }
  colls.hostarr.push(facts);
}

/** Create dynamic groups by group definitions and hostarr.
* 
* @param global {object} - Linetboot config (with "groups")
* @param hostarr {array} - Array of (ansible) host fact objects
*/
function groups_create(global, hostarr) {
  
}

/** Resolve file (or dir) by name from paths of ':' -separated path string or an array of paths.
 * Return the first resolvable match (possibly just the original filename if resolvable as-is).
 * @param fname {string} - Filename (typically plain basename or relative name)
 * @param path {array/string} - Paths as array or ":" - delimited path-string
 * @return file with resolvable "more full" (not necessarily absolute) path or falsy value for non resolvable name.
*/
function file_path_resolve(fname, path) {
  var patharr;
  if (typeof fname != 'string') { throw "Filename is not a string"; }
  if (Array.isArray(path)) { patharr = path; }
  else if (typeof path == 'string')  { patharr = path.split(":"); }
  else { throw "Path is neither an array of paths or a path-string ("+(typeof path)+")"; }
  if (!fname) { console.log("Empty filename, no use in resolving..."); return ""; }
  if (!patharr.length) { console.log("Empty path-array, no use in resolving..."); return ""; }
  console.error("file_path_resolve: Filename: ", fname);
  console.error("file_path_resolve: Path for resolving files: ", patharr);
  // Try fname as-is (relative to current dir or by its abs name)
  if (fs.existsSync(fname)) { console.error("file_path_resolve: File itself is resolvable: "+fname); return fname; }
  pathmatch = patharr.filter(function (path) {
    var fullfn = path + '/' + fname;
    if (fs.existsSync(fullfn)) { return 1; }
    console.error("file_path_resolve: No match for (path+fname): " + fullfn);
    return 0;
  });
  if (!pathmatch.length) { return ""; }
  return pathmatch[0] + "/" + fname;
}
/** Derive dynamic members for the groups (in AoO) by hostname regexp patterns.
 * Members of inner group objects:
 * - id - ID label for group
 * - name - Descrptive name / title for the group
 * - patt - Hostname pattern
 * We store the hostnames of groups into the group objects.
* @param groups {array} - Groups array (of objects, AoO)
* @param hostarr {array} - Array of host facts to refer to during member resolution
*/
function group_mems_setup(groups, hostarr) {
    if (!Array.isArray(groups)) { console.log("Configured Groups not in array !"); return null; }
    var isgrouped = {}; // Flags (counts ?) for hosts joined to any/some group (by name pattern).
    var grp_other = []; // Groups with no pattern and policy == 'nongrouped'
    // TODO: Make more generic and allow matching on any attribute (not just hostname)
    groups.forEach(function (it) {
      
      if (it.patt) {
        var re = new RegExp(it.patt);
        // it.hosts = hostarr.filter(function (h) { return h.ansible_fqdn.match(re); });
        it.hostnames = hostarr.reduce(function (oarr, h) {
          if (h.ansible_fqdn.match(re)) { oarr.push(h.ansible_fqdn); }
          return oarr;
        }, []);
      }
      if (it.hostnames) { it.hostnames.forEach(function (hn) { isgrouped[hn] = 1; }); } // Increment ?
      if (!it.patt && it.policy == 'nongrouped') { grp_other.push(it); }
    });
    // Second pass for non-grouped
    // var others = hostarr.filter(function (h) { return ! isgrouped[h.ansible_fqdn]; });
    // othernames - hostnames of non-grouped / other hosts
    var othernames = hostarr.reduce(function (oarr, h) {
      if ( ! isgrouped[h.ansible_fqdn]) {oarr.push(h.ansible_fqdn); }
      return oarr;
    }, []);
    grp_other.forEach(function (g) { g.hostnames = othernames; });
      return 1; // No need: isgrouped / grp_other
}

/** Filter hosts (array) by regexp pattern in "ansible_fqdn" (or other given property).
* @param hostarr {array} - Array of host facts
* @param patt {string} - valid regular expression string pattern to match in hostname (or other property)
* @param propname {string} - Optional *alternative* property name besides the fefault `ansible_fqdn` from which to look for match.
*    Note: This value of this property must be a string to work with regexp matching. 
* @return filtered array of hosts facts
*/
function hosts_filter(hostarr, patt, propname) {
  var re = new RegExp(patt); // catch ?
  if (!re) { console.error("Error: hosts_filter could not compile RE !"); return []; }
  propname = propname || 'ansible_fqdn';
  var ha2 = hostarr.filter(function (it) {
    if (!it[propname]) { return 0; } // False value prop - not going to go in ...
    // Check string
    if (typeof it[propname] != 'string') { return 0; }
    return it[propname].match(re);
  });
  return ha2;
}
/** Convert minimal host record (hname,macaddr,ipaddr) to minimal "fake-facts".
 * Fake-facts are created based on main config network setting defaults (in "net" section).
 * All propseries to allow indexing (mac,ip,hname) should be present.
 * @param h {object} - Minimal host record with hname,macaddr,ipaddr (And optional bmcipaddr)
 * @param global {object} - Main config with likely-to-be-valid info to create fake facts.
 * 
 */
function host2facts(h, global) {
  var f = {ansible_default_ipv4: {}, ansible_dns: {nameservers: [] } };
  var anet = f.ansible_default_ipv4;
  var adns = f.ansible_dns;
  var net = global.net || {};
  anet.alias = anet.interface = net.ifdefault || 'eno1';
  anet.address = h.ipaddr;
  anet.macaddress = h.macaddr;
  anet.netmask = net.netmask;
  anet.gateway = net.gateway;
  // anet.network // e.g. 192.168.1.0
  // DNS
  adns.nameservers = net.nameservers;
  // Other, important
  f.ansible_domain = net.domain;
  f.ansible_fqdn = h.hname;
  f.ansible_hostname = to_hn(h.hname); // NEW, MUST have
  ///////// Secondary
  f.ansible_all_ipv4_addresses = [h.ipaddr];
  f.ansible_distribution = "Unknown";
  f.ansible_distribution_version = "???";
  
  function to_hn(hnstr) {
    var comps = hnstr.split('.');
    return comps[0];
  }
  return f;
}
/** Lightweight poor-mans (naive) CSV parser.
 * Opts:
 * - debug - Produce debug output
 * - sep - separator / delimiter. May be either string or regexp
 * - hdr - Array of headers to treat (already) the first line (basicaly every line) of CSV as (non-header) data.
 *         Not setting this (to array) makes parser treat first line of CSV as headers.
 * - max - Max number of fields (-1 = Use all)
 * @param fname {string} - CSV filename (suffix does not matter)
 * @param opts {object} - Parsing options
 * @return array of objects (AoO) formulated per first / header line.
 */
function csv_parse(fname, opts) {
  // opts = opts || {}; // Keep undefined to set good defaults !
  if (!fs.existsSync(fname)) { console.log("No CSV file "+ fname);return null; }
  var cont = fs.readFileSync(fname, 'utf8');
  return csv_parse_data(cont, opts);
  
}
function csv_parse_data(cont, opts) {
  opts = opts || {sep: ',', max: -1};
  var lines = cont.split("\n");
  console.log("csv_parse_data: " + lines.length + " lines. Headers: "+opts.hdr);
  console.log("csv_parse_data: opts: ", opts);
  var hdr = opts.hdr || lines.shift().split(opts.sep, opts.max);
  // Validate header names as symbol names ?
  opts.debug && console.log("Headers: ", hdr);
  var arr = []; // Final Array-of-Objects (AoO) from CSV
  lines.forEach(function (l) {
    var rec = {};
    var lrec = l.split(opts.sep, opts.max); // Max as many fields as hdr ?
    if (!l) { return; } // Empty !
    if (hdr.length != lrec.length) { console.log("Flawed rec. - field counts not matching ("+hdr.length+" vs "+lrec.length+")"); return; }
    for (var i =0;i<lrec.length;i++) { rec[hdr[i]] = lrec[i]; }
    arr.push(rec);
  });
  return arr;
}
/** Load special hosts from CSV file.
 * Parsing for CSV is "naive" - and does not allow any quotes in file.
 * Special hosts are finally added just like real legacy hosts (w. facts) to all indexes, etc. (hostcache, hostarr) by host_add(f);
 * @param fname {string} - CSV filename
 * @param global {object} - Main configuration (will be used to generate facts heuristically by "guessing" good values)
 * @param iptrans {object} - Optional legacy IP translation "fixup" table. Usage not recommended (and there's no need with proper DHCP).
 * TODO: json, sqlite ?
 */
function customhost_load(fname, global, iptrans) {
  // TODO: Analyze hostname, detect format.
  if (!fs.existsSync(fname)) { console.log("No customhost file "+ fname);return; }
  var arr = csv_parse(fname); // AoO (Array of objects)
  console.log("Customhost (parsed):", arr);
  // return arr; // AoO from CSV
  // TODO: Do earlier parsing and this host conversion separately
  arr.forEach(function (it) {
    // Ensure MAC is always mangled to lower case (Linetboot convention)
    if (it.macaddr) { it.macaddr = it.macaddr.toLowerCase(); }
    var f = host2facts(it, global);
    if (!f) { console.log("host2facts() made none for "+it.hname); return; }
    if (iptrans && it.tempipaddr) { iptrans[it.tempipaddr] = it.ipaddr; }
    // Create stub hostparams
    colls.hostparams[it.hname] = {};
    global.hostparams[it.hname] = {}; // BAD / Compat
    if (it.bmcipaddr) {
      colls.hostparams[it.hname].bmcipaddr = it.bmcipaddr;
      global.hostparams[it.hname].bmcipaddr = it.bmcipaddr; // BAD
    }
    host_add(f);
  });
  return arr;
}

/** Lookup inventory parameters for a host by facts (object) or  hostname (string).
 * Using this allows changing hostloader implementation w/o breaking callers.
 * @param f {object} - Ansible facts for host (OR exact hostname to lookup params by)
 * @return Host parameters object 
 */
function hostparams(f) { // obj
  if (!f) { console.log("No facts (and hostname) for looking up hostparams"); return null; }
  var hn;
  if (typeof f != 'string') {hn = f.ansible_fqdn; }
  else { hn = f; }
  // TODO: f. (Ip Address) ???
  if (!hn) { console.log("No hostname gotten from facts (for "+"???"+")for looking up hostparams"); return null; }
  if (!colls.hostparams) { console.log("No colls.hostparams"); }
  //if (!colls.hostparams[hn]) { colls.hostparams[hn] = {}; }
  // SET: if (obj) { Object.keys(obj).forEach((k) => { colls.hostparams[hn][k] = obj[k]; }); }
  return colls.hostparams[hn];
}
/** Get group names list.
 * @return Array of group names.
 */
function groupnames() {
  if (!colls.groups || (typeof colls.groups != 'object')) { return null; }
  var gnames = Object.keys(colls.groups);
  return gnames;
}
function groupmemmap() {
  return colls.groups;
}
module.exports = {
  init: init,
  hosts_load: hosts_load,
  facts_load: facts_load,
  file_path_resolve: file_path_resolve,
  group_mems_setup: group_mems_setup,
  hosts_filter: hosts_filter,
  customhost_load: customhost_load,
  host2facts: host2facts,
  facts_load_all: facts_load_all,
  csv_parse: csv_parse,
  csv_parse_data: csv_parse_data,
  hostparams: hostparams,
  groupnames: groupnames,
  groupmemmap: groupmemmap
};
