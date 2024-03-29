/** @file
* Inquire info from proprietary Infoblox DHCP/DNS management system.
* 
* Infoblox provides a REST API to inquire and modify IP Address management related DHCP/DNS Info.
* @todo CSV Merge w.macaddr (possibly next-server/boot-server, bootfile). See "CSV Import" in GUI.
* Creating a stub of (Infobox-proprietary) CSV, See:  "Infoblox CSV Import Format".
*
* ## Infobox and PXE Boot info
* Source: https://community.infoblox.com/t5/api-integration-devops-netops/api-to-get-ipv4-network-bootp-pxe-information/m-p/18789
* curl -k -u admin:infoblox -X GET 'https://192.168.1.2/wapi/v2.3/network' -d 'network=192.168.1.0/24' -d '_return_fields=options,bootfile,bootserver,nextserver'
*/
var ibconf;
var hostarr;
var hostcache;
var getpara;
var url_h;

var async   = require("async");
var axios   = require("axios");

var redfish  = require("./redfish.js"); // For basic auth
var hlr      = require("./hostloader.js");

function init(_conf, hdls) {
  if (_conf && _conf.iblox) { ibconf = _conf.iblox; }
  else if (_conf) { ibconf = _conf; }
  else { return module.exports; }
  hostarr = hdls.hostarr;
  hostcache = hdls.hostcache;
  // Prepare get parameters that stay constant
  var bauth = redfish.basicauth(ibconf);
  getpara = { headers: { Authorization: "Basic "+bauth }};
  url_h = ibconf.url + "/record:host?";
  return module.exports;
}

/** Web handler to set IP,MAC address info in IB ()
 * URL Options:
 * - cmds - Set true to produce commands (default)
 * TODO: Create correspnding validation and view
 */
function ib_set_addr(req, res) {
  var jr = {status: "err", msg: "Could not query IB."};
  if (!ibconf) { jr.msg += "No IB config";return res.json(jr); }

  console.log("Query: "+url_h);
  // Use host inventory (instead of ibconf.hpatt) to decide which hosts to include in ipaddr sync.
  var syncarr = [];
  if (ibconf.syncall) { syncarr = hostarr; }
  else { syncarr = hostarr.filter((h) => { var hps = hlr.hostparams(h); return h.ansible_fqdn && hps.ibsync; }); }
  console.log(syncarr.length + " Hosts for IB op.");
  console.log("getpara: ", getpara);
  ibhs_fetch(syncarr, ipmac_cmds_gen, res, jr);
  /*
  axios.get(url_h+"name~=" + ibconf.hpatt, getpara).then(function (resp) {
    var d = resp.data;
    if (!Array.isArray(d)) { jr.msg += "Response not in array"; return res.json(jr); }
    console.log(d.length + " Hosts ret from IB");
    // PUT Messages (ipv4addr, configure_for_dhcp). ibh = IB Host
    var aout = d.map((ibh) => {
      var f = hostcache[ibh.name]; // By name (ibh.ipv4addrs[0].ipv4addr)
      if (!f) { console.log("No facts by: "+ibh.name); return null; } // Non registered host in result set (by pattern)
      // Handle single (f, ibh) // Either or ?
      return ipmac_gen(f, ibh);
    }).filter((it) => { return it; });
    
    if (req.query.cmds) { return ipmac_cmds_gen(aout); }
    res.json({status: "ok", data: aout});
    
  }).catch(function (ex) { console.log(ex); jr.msg += ex.toString(); return res.json(jr); });
  */
  ///////////////////////////////
  
}

var tset = [
  {hname: "nuc7", ipaddr: "1.1", macaddr: "aa", ipaddr_ib: "", macaddr_ib: "", "nbp": "pxelinux.0"},
  {hname: "nuc5", ipaddr: "2.2", macaddr: "bb", ipaddr_ib: "", macaddr_ib: "", "boothost": "bootie"}
];

/** Web handler for the Iblox info view.
 * Fetch info from iblox REST API, transform and forward to Linetboot view.
 */
function ib_show_hosts(req, res) {
  var jr = {status: "err", msg: "Could not query IB."};
  if (!ibconf) { jr.msg += "No IB config";return res.json(jr); }
  if (ibconf.test) { return res.json({status: "ok", data: tset}); } // TEST Mode
  if (!ibconf.user || !ibconf.pass) { jr.msg += "Not Connected to IBlox system";return res.json(jr); }
  console.log("Query: "+url_h);
  var syncarr = [];
  if (ibconf.syncall) { syncarr = hostarr; }
  // Use host inventory (instead of ibconf.hpatt) to decide which hosts to include in ipaddr sync.
  else { syncarr = hostarr.filter((h) => { var hps = hlr.hostparams(h); return h.ansible_fqdn && hps.ibsync; }); }
  console.log(syncarr.length + " Hosts for IB op.");
  // console.log("getpara: ", getpara);
  ibhs_fetch(syncarr, showitems, res, jr);
  function showitems(ress, res) {
    // TODO: Index ress, iterate all hosts (hostarr) ?
    var ress_idx = {};
    ress.forEach((ibn) => { ress_idx[ibn.hname] = ibn; });
    var ress2 = hostarr.map((f) => {
    //var ress2 = ress.map((it) => {
      //var f = hostcache[it.hname];
      if (!f) { return {}; } // return it
      var anet = f.ansible_default_ipv4;
      if (!anet) { return {}; } // return it
      // Possibly
      // - use entry itself, copy inner obj props to top
      // - use hostarr to drive iteration
      var n = {hname: f.ansible_fqdn, ipaddr: anet.address, macaddr: anet.macaddress,
        ipaddr_ib: '', macaddr_ib: '', usedhcp: ''}; // Use ipaddr_ib, macaddr_ib, usedhcp
      
      // NEW:
      var it = ress_idx[f.ansible_fqdn];
      if (!it) { return n;}
      
      //it.ipaddr = anet.address;
      //it.macaddr = anet.macaddress;
      // TODO: Add Iblox -side info on top already here ?
      //var ibent = (it.data && it.data.ipv4addrs && it.data.ipv4addrs[0]) ? it.data.ipv4addrs[0] : null;
      var ibent = (it.ibi) ? it.ibi : null;
      if (!ibent) { return n; }
      // Assign IB info
      n.ipaddr_ib  = ibent.ipv4addr || '';
      n.macaddr_ib = ibent.mac || '';
      n.usedhcp    = ibent.configure_for_dhcp;
      return n;
    });
    res.json({status: "ok", data: ress2});
  }
  
}
/** Async fetch of IB hosts one-by-one, driven by syncarr.
 * syncarr has been determined and setup by ...
 * @param syncarr - Array of hosts to fetch/sync
 * @param cb - Operation to launch on filtered results (gets called with IB results and HTTP response)
 */
function ibhs_fetch(syncarr, cb, res, jr) {
  async.map(syncarr, ibh_fetch, function (err, ress) {
    if (err) { jr.msg += "async.map error:"+err; console.log(jr.msg); return res.json(jr); }
    // Filter out faulty (e.g. null - items)
    ress = ress.filter((it) => { return it; });
    //ipmac_cmds_gen(ress, res);
    cb(ress, res);
  });
}

/** Generate IP/MAC change record with info to submit to IB.
 * The PUT data-to-be-submitted is already inc correct format in "data" member.
 * @param f - Facts for host
 * @param ibh - IB host info (w. "ipv4addrs" member to be used here).
 * @return Return object with HTTP level info and PUT data parameters or null if update info object cannot be created.
 */
function ipmac_gen(f, ibh) {
  var ipi = ibh.ipv4addrs; // IP information
  if (!ipi) { return null; }
  if (ipi.length > 1) { return null; }
  // --data '{"ipv4addrs": [{"ipv4addr": "10.0.0.1", "mac": "01:23:45:67:89:ab"}]}'
  
  if (ipi[0].ipv4addr != f.ansible_default_ipv4.address) { console.log("IP address conflict IB vs. Ans. Skipping..."); return null; }
  // Sync/update to force (data below)
  var addrs = [{ipv4addr: f.ansible_default_ipv4.address, mac: f.ansible_default_ipv4.macaddress, configure_for_dhcp: true}];
  // Info from IB
  var ibi = {ipv4addr: f.ansible_default_ipv4.address, mac: ipi[0].mac, configure_for_dhcp: ipi[0].configure_for_dhcp };
  // URL with ibh._ref works because this is host level change. Network level: ipi[0]._ref
  var o = {method: 'PUT', url: ibconf.url+"/"+ibh._ref, data: {ipv4addrs: addrs}, ibi: ibi};
  o.hname = f.ansible_fqdn;
  return o;
}


/** Output IB mac/ip association info as curl commands.
   */
function ipmac_cmds_gen(aout, res) {
  //var cmds = [];
    var txt = "#!/bin/bash\n# Import IP/MAC Info to IB.\nexport IBCREDS=jsmith:o35cR\n";
    txt += aout.map((it) => {
      var puturl = it.url; // Works as change is on host level
      // // it.ipv4addrs[0].
      return "curl -X PUT -k -u $IBCREDS -H 'content-type: application/json' -d '"+JSON.stringify(it.data)+"' '"+puturl+"'";
    }).join("\n");
    return res.end(txt);
}
  /** Fetch info for single host from IB by fqdn in facts.
   * @param f - Host facts
   * @param cb - Async cb to call with IB host results
   */
  function ibh_fetch(f, cb) {
    if (!f) { return cb("ibh_fetch: No facts (from async.map arr).", null);  }
    if (!f.ansible_fqdn) { return cb("ibh_fetch: facts missing FQDN", null);  }
    var iburl = url_h+"name="+f.ansible_fqdn;
    var ccmd = "curl -u "+ibconf.user +":"+ibconf.pass+" '"+ iburl + "'";
    console.log("CURL: "+ccmd); // On debug only ? if (ibconf && ibconf.debug) { }
    axios.get(iburl, getpara).then((resp) => {
      if (resp.status != 200) { return cb("Non-200 status:" + resp.status, null); }
      if (!resp.data) { return cb("No data in IB host resp.", null); }
      // Looking good, got resp data. validate.
      var ibharr = resp.data;
      if (!Array.isArray(ibharr)) { return cb("IB host resp. not in Array", null); }
      if (ibharr.length > 1) { return cb("IB host resp. len > 1", null); }
      // NEW: This is half-okay. There's no "host" record in IB.
      // Returning err here fails async collection iteration, so settle for cb(null, null)
      if (ibharr.length < 1) { return cb(null, null); } // return cb("No IB host info (empty arr - host does not exist in IB) !", null);
      var ibh = ibharr[0]; // Should be single
      if (!ibh) { console.log("No IB Info for: "+f.ansible_fqdn); return cb(null, null); } // Happens, let happen. old: "No ibh for host: "+f.ansible_fqdn
      // Inspect result further ... e.g empty array ([])
      
      // No double lookup or shadowing (and causes: async.map error:axios exception:TypeError: Cannot read property 'ansible_fqdn' of undefined)
      //var f = hostcache[ibh.name]; // By name (ibh.ipv4addrs[0].ipv4addr)
      //if (!f) { console.log("No facts by: "+ibh.name); return cb("No facts by: "+ibh.name, null); } // 
      var o = ipmac_gen(f, ibh);
      // NOTE: o may be NULL
      //if (!o.url) { console.log("Warning: No URL in ibh !"); }
      return cb(null, o); // resp.data
    })
    // "cb was already called"
    .catch((ex) => { console.log("Axios (IB) EX:"+ex); return cb("axios exception:"+ex, null); });
  }
/** Web handler to sync single host (mac, ip) with iblox (from GUI).
 * Query host info from Infoblox (wich also formulates needed params for update call) and issue and update call.
 */
function ipam_sync(req, res) {
  var jr = {status: "err", msg: "Could not sync (ip,mac) with IB."};
  //var err = 1;
  var q = req.query;
  if (!q)     { jr.msg += " No query."; return res.json(jr); }
  var hname = q.hname;
  if (!hname) { jr.msg += " No hname."; return res.json(jr); }
  // Formulate message (See: ipmac_gen(f, ibh)
  var f = hostcache[hname];
  if (!f) { jr.msg += " No facts for '"+hname+"'"; return res.json(jr); }
  // 1) Query Iblox to get ibh and formulated update
  ibh_fetch(f, (err, ibh) => { // TODO: call this ibup (not ibh)
    if (err) { jr.msg += " Initial IB info fetch failure: "+ err; return res.json(jr); }
    console.log("IBH:", ibh);
    if (!ibh) { jr.msg += "Host '"+ hname+"' does not seem to exist in IB !"+ err; return res.json(jr); }
    // 2) Call to sync (ibh already has info). See ipmac_cmds_gen() for curl info
    // params: basic-creds
    var rpara = {auth: {username: ibconf.user, password: ibconf.pass}};
    axios.put(ibh.url, ibh.data, rpara).then((resp) => {
      // Detect HTML (resp.headers ?)
      if (resp.status != 200) { jr.msg += "Non-200 resp from IB:" + resp.status; return res.json(jr); }
      var d = resp.data;
      console.log("DATA: ", d);
      res.json({status: "ok", data: 1});
    }).catch((ex) => { jr.msg += ex; return res.json(jr); });
  });
  //if (err) { jr.msg += "Permission denied"; return res.json(jr); }
  
}
/** Retrieve info for one or more networks given in iblox config.
 * Transform iblox results for many calls to simple AoO.
 */
function networks(req, res) {
  var jr = {status: "err", msg: "Error fetching iblox net info. "};
  var nws = ibconf.networks;
  console.log("Look for networks: "+ nws);
  if (!nws) { jr.msg += "No iblox networks configured"; return res.json(jr); }
  if (!Array.isArray(nws)) { jr.msg += "Iblox networks not configured as array"; return res.json(jr); }
  //var ibnattr = ["options","bootfile","bootserver","nextserver","comment","network","network_view"];
  async.map(nws, fetchnwinfo, function (err, results) {
    if (err) { jr.msg += err; return res.json(jr); }
    res.json({status: "ok", data: results});
  });
  function fetchnwinfo(nip, cb) {
    // Add: comment,network,network_view
    var urlsuff = "/network?network="+nip+"&_return_fields=options,bootfile,bootserver,nextserver,comment,network,network_view";
    console.log("CALLING: "+ urlsuff);
    axios.get(ibconf.url + urlsuff, getpara).then((resp) => {
      var d = resp.data;
      //console.log("NETDATA: "+ d);
      // TODO: Transform / strip down
      // Always an array,even with 1 obj.
      // 10-13 Missing 2 returns (on cb()) below: Callback was already called.
      if (!Array.isArray(d)) { return cb(null, "Iblox response not in array"); }
      d = d.find((n) => { return n.network_view == 'default'; });
      if (!d) { return cb(null, "Iblox default net object not found"); }
      // Collect DHCP Options (name => value) to main object ? Or let be as options-children ?
      if (d.options) { d.options.forEach((opt) => { d[opt.name] = opt.value; }); d.options = null; }
      return cb(null, d);
    }).catch((ex) => { cb(ex, null); }); // 
  }
}
module.exports = {
  init: init,
  ib_set_addr: ib_set_addr,
  ib_show_hosts : ib_show_hosts,
  ipam_sync: ipam_sync,
  networks: networks
};
