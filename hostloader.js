"use strict;";
var fs = require("fs");
var fact_path;
var colls;
/** 
*/
function init(global, gcolls) {
  // TODO: Store whole global config.
  fact_path = global.fact_path;
  if (!fact_path) { console.log("No fact path given.");process.exit(1);}
  colls = gcolls;
}

/** Find out the configured hostnames (from various possible places) and load host facts.
Hosts can come from:
- A Inventory style text file given in `global.hostsfile`
- A JSON array given in global.hostnames

In either case the (string) entries are in the same format, String:
- Starts with hostname
- Optional key value pairs follow in key=my+value

As shown in sample key-value pair above, the spaces must be escaped with
same rules as URL (%HH sequences or '+' for space) as parsing the line
is whitespace delimiter based.

Host loading is performed in *synchronous* manner.

* TODO: throw on errors
*/
function hosts_load(global) {
  var hnames = global.hostnames;
  var hfn = global.hostsfile;
  // Line oriented text file
  if (hfn) {
    hnames = [];
    // Fatal or NOT ?!!!
    if (!fs.existsSync(hfn)) { console.log("hostsfile given ("+hfn+"), but does not exist !"); }
    // Keep else as above is not fatal for now. Parse hostsfile.
    else {
      // Refrain from doing too much hostsfile specific work here. Instead assume host lines in either
      // source - line oriented text fire and json array have the same format (refine stuff in common section)
      hnames_f = fs.readFileSync(hfn, 'utf8').split("\n");
      hnames_f = hnames_f.filter(function (it) { return it.match(/^\s*$/) ? false : true; }); // Weed out empties
      if (Array.isArray(hnames_f)) { hnames = hnames_f; }
    }
  }
  if (!hnames || !Array.isArray(hnames)) { console.error("No Hostnames gotten from any possible source"); process.exit(1);}
  console.error("Hosts:", hnames);
  // Allow easy commenting-out as JSON itself does not have comments.
  hnames = hnames.filter(function (hn) { return ! hn.match(/^(#|\[)/); });
  if (!hnames) { console.error("No hosts remain after filtering"); process.exit(1); }
  
  // NEW: Parse inverntory-style free-form params here
  global.hostparams = {};
  var i = 0;
  hnames.forEach(function (hnline) {
    if (hnline.match(/\s+/)) {
      var rec = hnline.split(/\s+/);
      var hn = hnames[i] = rec.shift();
      // Parse rec
      console.log(rec);
      global.hostparams[hn] = {}; // Init params !
      rec.forEach(function (pair) {
        
        var kv = pair.split(/=/, 2);
	kv[1] = kv[1].replace('+', ' ');
	global.hostparams[hn][kv[0]] = decodeURI(kv[1]); // Unescape
      });
      console.log("Pairs found ("+hn+"): ", global.hostparams[hn]);
    }
    
    //else {global.hostparams[hnline] = {}; return;};
    i++;
  });
  global.hostnames = hnames;
  //console.log("Hostnames NOW: " + JSON.stringify(global.hostnames, null, 2)); // hnames
  hnames.forEach(function (hn) { facts_load(hn); });
  //console.log("Cached: " + Object.keys(hostcache).join(','));
}


/** Load Ansible facts for a single host from facts directory.
* This is to be done during init phase.
* Cache facts into global facts cache by both (fqdn) hostname and ip address.
* @param hn - Hostname
* @return None
*/
function facts_load(hn) { // ipaddr
  var absname = fact_path + "/" + hn;
  var facts;
  try {
    //facts = require(absname);
    if (!fs.existsSync(absname)) { console.error("No ansible_facts file ("+absname+") for host '" + hn + "'"); return; }
    // For some reason this works for ansible host files as require() does not.
    var cont = fs.readFileSync(absname, 'utf8');
    
    facts = JSON.parse(cont);
    facts = facts.ansible_facts; // Simplify !
    if (!facts) { console.error("No ansible_facts branch for host '" + hn + "'"); return; }
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
  var ifinfo = facts.ansible_default_ipv4;
  if (!ifinfo) { console.error("No Net Interface info in facts."); return; }
  var ip = ifinfo.address;
  var maca = ifinfo.macaddress;
  // Brute force cache by name and ip addr to same cache / hash table
  colls.hostcache[hn] = facts;
  colls.hostcache[ip] = facts;
  // NEW: Also index by ethernet address. In facts it is lower case !!!
  if (maca) { colls.hostcache[maca] = facts; }
  colls.hostarr.push(facts);
}

module.exports = {
  init: init,
  hosts_load: hosts_load,
  facts_load: facts_load
};
