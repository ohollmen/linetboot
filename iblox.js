/** Inquire info from proprietary Infoblox DHCP/DNS management system.
* 
*/
var ibconf;

function init(global) {
  if (global && global.iblox) { ibconf = global.iblox; }
}

/** Set addr info in IB ()
 * URL Options:
 * - cmds - Set true to produce commands (default)
 * TODO: Create correspnding validation and view
 */
function ib_set_addr(req, res) {
  var jr = {status: "err", msg: "Could not query IB."};
  var ibconf = global.iblox;
  if (!ibconf) { jr.msg += "No IB config";return res.json(jr); }
  var url_h = ibconf.url + "/record:host?";
  console.log("Query: "+url_h);
  var bauth = redfish.basicauth(ibconf);
  var getpara = {headers: {Authorization: "Basic "+bauth}};
  // Use host inventory (instead of ibconf.hpatt) to decide which hosts to include in ipaddr sync.
  var syncarr = hostarr.filter((h) => { var hp = hlr.hostparams(h); return h.ansible_fqdn && hp.ibsync; });
  console.log(syncarr.length + " Hosts for IB op.");
  console.log("getpara: ", getpara);
  ibhs_fetch(syncarr);
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
  /** Generate IP/MAC change record with info to submit to
   */
  function ipmac_gen(f, ibh) {
    var ipi = ibh.ipv4addrs;
      if (!ipi) { return null; }
      if (ipi.length > 1) { return null; }
      // --data '{"ipv4addrs": [{"ipv4addr": "10.0.0.1", "mac": "01:23:45:67:89:ab"}]}'
      
      if (ipi[0].ipv4addr != f.ansible_default_ipv4.address) { console.log("IP address conflict IB vs. Ans. Skipping..."); return null; }
      var addrs = [{ipv4addr: f.ansible_default_ipv4.address, mac: f.ansible_default_ipv4.macaddress, configure_for_dhcp: true}];
      // URL with ibh._ref works because this is host level change. Network level: ipi[0]._ref
      var o = {method: 'PUT', url: ibconf.url+"/"+ibh._ref, data: {ipv4addrs: addrs}};
      return o;
  }
  function ipmac_cmds_gen(aout) {
    //var cmds = [];
      var txt = "#!/bin/bash\n# Import IP/MAC Info to IB.\nexport IBCREDS=jsmith:o35cR\n"+aout.map((it) => {
        var puturl = it.url; // Works as change is on host level
        // // it.ipv4addrs[0].
        return "curl -X PUT -u $IBCREDS -H 'content-type: application/json' -d '"+JSON.stringify(it.data)+"' '"+puturl+"'";
      }).join("\n");
      return res.end(txt);
  }
  function ibh_fetch(f, cb) {
    if (!f) { return cb("ibh_fetch: No facts (from async.map arr).", null);  }
    if (!f.ansible_fqdn) { return cb("ibh_fetch: facts missing FQDN", null);  }
    axios.get(url_h+"name="+f.ansible_fqdn, getpara).then((resp) => {
      if (resp.status != 200) { return cb("Non-200 status:" + res.status, null); }
      if (!resp.data) { return cb("No data in IB host resp.", null); }
      // Looking good
      var ibharr = resp.data;
      if (!Array.isArray(ibharr)) { return cb("IB host resp. not in Array", null); }
      if (ibharr.length > 1) { return cb("IB host resp. len > 1", null); }
      var ibh = ibharr[0];
      if (!ibh) { console.log("No IB Info for: "+f.ansible_fqdn); return cb(null, null); } // Happens, let happen. old: "No ibh for host: "+f.ansible_fqdn
      // No double lookup or shadowing (and causes: async.map error:axios exception:TypeError: Cannot read property 'ansible_fqdn' of undefined)
      //var f = hostcache[ibh.name]; // By name (ibh.ipv4addrs[0].ipv4addr)
      //if (!f) { console.log("No facts by: "+ibh.name); return cb("No facts by: "+ibh.name, null); } // 
      var o = ipmac_gen(f, ibh);
      return cb(null, o); // resp.data
    }).catch((ex) => { return cb("axios exception:"+ex, null); });
  }
  // Async fetch of IB hosts
  function ibhs_fetch(syncarr) {
    async.map(syncarr, ibh_fetch, function (err, ress) {
      if (err) { jr.msg += "async.map error:"+err; console.log(jr.msg); return res.json(jr); }
      // Filter out faulty
      ress = ress.filter((it) => { return it; });
      ipmac_cmds_gen(ress);
    });
  }
}


module.exports = {
  ib_set_addr: ib_set_addr
};
