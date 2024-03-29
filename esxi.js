/**

General about ESXI "query guests":
- Seems all guests are in same XML
- To has "soapenv:Envelope" => "soapenv:Body" => RetrievePropertiesExResponse => ...
- Note: many apis (in ...Response) have a wrapping elem <returnval> (VMWare) or <rval> (Google ads)
- There is also another call (13.th call)
I Guest result (parsed XML) Look for patts (for individual guest):

- node.name[0] = config.guestFullName   node.val[0]."_": Microsoft Windows 10 (64-bit)
- node.name[0] == "config.guestFullName"
- node.val[0]["_"] == "Microsoft Windows 10 (64-bit)"
- Similarly: config.hardware.numCPU, config.hardware.memoryMB
- Better Yet (get to node): node.name[0] == "guest", node.value[0] == {}
E.g. l. ~ 1250
Object Has also
- top: hostName, ipAddress
- "net" w. , ipAddress, macAddress
"ipStack"
See also "runtime": (also: summary.runtime)
- powerState (Array, e.g. "poweredOn")
- bootTime[] (ISO)
summary.quickStats .. uptimeSeconds
* 
# Node modules
- xml2js - https://www.npmjs.com/package/xml2js
- axios - https://www.npmjs.com/package/axios
# References
- API Methods documented (e.g. Login) https://blogs.vmware.com/developer/2014/08/hello-vmware-objects.html
* - https://code.vmware.com/docs/1682/vsphere-web-services-sdk-programming-guide/doc/PG_PropertyCollector.7.5.html
* - https://vdc-download.vmware.com/vmwb-repository/dcr-public/d4fd4125-8683-4388-9bf0-7b73c0e5cc34/e5b8ce6d-969f-4e48-af05-d572c08e7b47/vsphere-web-services-sdk-70-ga.pdf
*   - See e.g. p. 60-80
* # Note on ESXi Host Machines and Facts
* When extracing facts from ESXi VM Host machines, they have following shorcomings or characteristics (as logged by linetboot at startup) and
* are not accepted as valid facts:
* - SELinux turned on ? "ansible_selinux": { status": "Missing selinux Python library" },
* - Interpreter: /usr/bin/python, version 3.5.3
* - From linetboot:
*   - "WARNING: Host 'vi-06.mycomp.com' not matching fqdn and/or hostname: fqdn" - "ansible_fqdn": "vi-06", Must be appended with e.g.
*   - "No Net Interface info in facts for vi-06" facts.ansible_default_ipv4 (object) missing, should have: address, alias, broadcast, gateway, interface(==alias),
*      macaddress, mtu, netmask, network, type(=ether)
* - Problems: ip or ifconfig not found. https://www.tunnelsup.com/networking-commands-for-the-vmware-esxi-host-command-line/
* - esxcli network ip interface list
*/

var xjs  = require('xml2js');
var fs   = require("fs");
var path = require("path");
var Mustache = require("mustache");
var axios = require("axios");
var async    = require("async"); // Move up later

// xjs.parseString();
// TODO: keep parametrized for obj type="ContainerView" value (e.g. session[52e748f1-...")
// Example value: session[52e748f1-e74e-2c34-c72a-1a3849c9d654]5269e8e7-80ef-d032-0fe3-db49f537825c
// Both number sections 36 B GUID
// The beginning of value is from Login response contents(e.g.): <key>52adbb14-df02-72eb-27be-a7508796b7ed</key>
// The rest is from ... (???)
// 40char SHA1 (MD5=32 B)
// vmware_soap_session (e.g)	"d05b03d1123c3410f3990bb5f66483af135de2a2"	host.my.com	/	Session	61 B	?	?	// Other patterns (in XML)
// <WaitForUpdatesExResponse ... <locationId>564da54e-a69d-31d2-baeb-a2a4e5e63132</locationId>
// 3.LoginResponse <key>52a56aec-3858-365e-d534-df8d1ed50509</key>
// RetrievePropertiesExResponse <key>52a56aec-3858-365e-d534-df8d1ed50509</key>
// 7. <WaitForUpdatesExResponse: <filter type="PropertyFilter">session[52a56aec-3858-365e-d534-df8d1ed50509]52b5186b-a8c7-b850-6146-209a27060f90</filter>

var msgs = {
  "login": `
<Envelope xmlns="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Body>
<Login xmlns="urn:vim25"><_this type="SessionManager">ha-sessionmgr</_this>
<userName>{{ username }}</userName>
<password>{{ password }}</password>
<locale>en-US</locale></Login>
</Body></Envelope>
`,
"getkey": `<Envelope xmlns="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Body>
<WaitForUpdatesEx xmlns="urn:vim25">
<_this type="PropertyCollector">ha-property-collector</_this>
<version></version>
<options><maxWaitSeconds>60</maxWaitSeconds></options>
</WaitForUpdatesEx>
</Body></Envelope>
`,
"session": `
<Envelope xmlns="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Body>
<RetrievePropertiesEx xmlns="urn:vim25">
<_this type="PropertyCollector">ha-property-collector</_this>
<specSet><propSet><type>SessionManager</type><all>false</all><pathSet>currentSession</pathSet></propSet><objectSet><obj type="SessionManager">ha-sessionmgr</obj><skip>false</skip></objectSet></specSet><options/>
</RetrievePropertiesEx>
</Body></Envelope>
`,
// Early 300K call (not 500). Response May have almost all the same info (?) Request does not need parametrization !
// One possibility: Call this (no params), get below, where all within filter is needed for complete call
// <filter type="PropertyFilter">session[52a56aec-3858-365e-d534-df8d1ed50509]52af59a9-6fc8-4139-535e-97716ca2192d</filter>
"glist0": `<Envelope xmlns="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Body><WaitForUpdatesEx xmlns="urn:vim25"><_this type="PropertyCollector">ha-property-collector</_this><version></version><options><maxWaitSeconds>60</maxWaitSeconds></options></WaitForUpdatesEx></Body></Envelope>
`,
"contview": `<Envelope xmlns="http://schemas.xmlsoap.org/soap/envelope/"
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Body><CreateContainerView
xmlns="urn:vim25"><_this type="ViewManager">ViewManager</_this>
<container type="Folder">ha-folder-root</container><type>VirtualMachine</type><recursive>true</recursive></CreateContainerView></Body></Envelope>`,
//~ //`<Envelope xmlns="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Body><WaitForUpdatesEx xmlns="urn:vim25"><_this type="PropertyCollector">ha-property-collector</_this><version>1</version><options><maxWaitSeconds>60</maxWaitSeconds></options></WaitForUpdatesEx></Body></Envelope>`,
// RetrievePropertiesEx for Guests based on CreateContainerViewResponse <returnval>...</returnval> elem value
// e.g. session[52e748f1-e74e-2c34-c72a-1a3849c9d654]5269e8e7-80ef-d032-0fe3-db49f537825c
// Is this 19th call ?
"glist": `<Envelope xmlns="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Body>
<RetrievePropertiesEx xmlns="urn:vim25">
<_this type="PropertyCollector">ha-property-collector</_this>
<specSet><propSet><type>VirtualMachine</type>
<all>false</all>
<pathSet>name</pathSet>
<pathSet>config.annotation</pathSet>
<pathSet>config.defaultPowerOps</pathSet>
<pathSet>config.extraConfig</pathSet>
<pathSet>config.hardware.memoryMB</pathSet>
<pathSet>config.hardware.numCPU</pathSet>
<pathSet>config.hardware.numCoresPerSocket</pathSet>
<pathSet>config.guestId</pathSet>
<pathSet>config.guestFullName</pathSet>
<pathSet>config.version</pathSet>
<pathSet>config.template</pathSet>
<pathSet>datastore</pathSet>
<pathSet>guest</pathSet>
<pathSet>runtime</pathSet>
<pathSet>summary.storage</pathSet>
<pathSet>summary.runtime</pathSet>
<pathSet>summary.quickStats</pathSet>
<pathSet>effectiveRole</pathSet>

</propSet><objectSet>
<obj type="ContainerView">{{ viewid }}</obj>
<skip>true</skip><selectSet xsi:type="TraversalSpec"><name>view</name><type>ContainerView</type><path>view</path><skip>false</skip></selectSet></objectSet></specSet><options/></RetrievePropertiesEx></Body></Envelope>
`
};
// https://stackoverflow.com/questions/43002444/make-axios-send-cookies-in-its-requests-automatically
// Also opts: {withCredentials: true}
axios.defaults.withCredentials = true;
axios.defaults.headers.post['Content-Type'] = 'text/xml';
//axios.defaults.headers.post['SOAPAction'] = 'urn:vim25/6.7.1';
//axios.defaults.headers.post['Connection'] = 'keep-alive';
//axios.defaults.headers.post['Accept'] = 'text/xml'; // Orig: */*
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

var mcfg;
// Call models
// - ea - explicitArray option for XML parser (true, false, undefined = No parsing)
var callmods = [
  // Also at login, extract Set-cookie ?
  {id: "login",  ea: false,      pcb: null, pp: (d, resp, p) => {
      p.key = d["soapenv:Envelope"]["soapenv:Body"].LoginResponse.returnval.key;
      if (resp && resp.headers) {
        //console.log("Got cookie(s): ", resp.headers['set-cookie']);
        var m;
        if (resp.headers['set-cookie'] && resp.headers['set-cookie'][0] && (m = resp.headers['set-cookie'][0].match(/vmware_soap_session="(\w+)"/))) {
          p.cookie = m[1];
          console.log("Captured and stored cookie: "+m[1]);
        }
      }
    }
  },
  // glist0
  {id: "contview", ea: false,      pcb: null, pp: (d, resp, p) => {
    //console.log("TODO: Patch sess-p w. above !"); // p["ZZZ"] = "HOHUU";
    //console.log("contview-data:", d);
    p.viewid = d["soapenv:Envelope"]["soapenv:Body"].CreateContainerViewResponse.returnval["_"];
  }},
  {id: "glist",    ea: undefined,  pcb: null, pp: null},
];
function dclone(d) {
  var d2 = JSON.parse(JSON.stringify(d));
  if (!Array.isArray(d)) {
    Object.keys(d).forEach((k) => {
      if (typeof d[k] == 'function') { d2[k] = d[k]; }
    });
  }
  return d2;
}
function init(global) {
  if (mcfg) { return; }
  mcfg = global || {};
  if (!mcfg.esxi) { mcfg.esxi = {}; }
  return module.exports;
}
/* Issue an ESXi SOAP call.
* TODO: Login ?
*/
function soapCall(host, p, sopts, cb) {
  if (!host) { console.error("SOAP Call: No host passed"); return cb("No host"); }
  if (!cb)   { console.error("SOAP Call: No CB"); return; } // return cb("No cb");
  console.error("Making call for: ", sopts);
  // NOT: var cfg  = mcfg.esxi;
  // var p = sopts.pcb ? sopts.pcb(cfg) : cfg; // pcb deprecated
  var tmpl = msgs[sopts.id];
  if (!tmpl) { console.error("No template for call id:"+sopts.id); return cb("No template"); }
  var cont = Mustache.render(tmpl, p); // { username: cfg.username, password: cfg.password }
  // Note axios internal config-props: xsrfCookieName, xsrfHeaderName: 'X-XSRF-TOKEN'
  // To see what is *actually* sent, see resp.request._header (req line + headers)
  var rp = {
    withCredentials: true,
    credentials: 'include', // Suggested on make-axios-send-cookies... but not present in manual include: ''
    headers: {
       'Content-Type': 'text/xml', Accept: 'text/xml', SOAPAction: "urn:vim25/6.7.1", // VMware ESXi 6.7.0 API vers 6.7.1
       //"Access-Control-Allow-Origin": "https://"+host,
       'Access-Control-Allow-Origin': '*', // Server hdr ?
       //cookie: "", //[],
       Connection: 'keep-alive', // Sent from browser app. resp.request has shouldKeepAlive: false, resp.agent keepAlive: false,
       //Origin: "https://"+host
    },
    
     
     // responseType: 'text', // closest for XML
     // maxContentLength: 2000, // maxContentLength: 2000,
  }; //  VMware-CSRF-Token: lbsjwb8urwffmd3m4g2md314busolf77
  if (p && p.cookie) { rp.headers.cookie = "vmware_soap_session=\""+p.cookie+"\""; } // push("vmware_soap_session=\""+p.cookie+"\"")
  if (p.debug && (p.debug > 1)) { console.log("Send (SOAP/XML) content: "+cont); console.log("Send-Reqpara: "+ JSON.stringify(rp, null, 2)); }
  // Call POST
  axios.post("https://" + host + "/sdk/", cont, rp).then((resp) => {
    if (resp.data && (resp.data.length < 2000)) { console.error("Resp-data: "+resp.data); }
    console.error("Resp-data-Type: "+(typeof resp.data)); // + 
    console.error("Resp-data-Len: "+ ( ((typeof resp.data) == 'string') ? resp.data.length : "Not string => N/A" ) );
    if (p.debug && (p.debug > 1)) { console.error("Resp-Hdrs: "+JSON.stringify(resp.headers, null, 2)); }
    // Parse, grab something from resp (e.g. LoginResponse => returnval => key)
    // Check content-type ?
    if (typeof sopts.ea != 'undefined') {
      var xopts = { explicitArray: sopts.ea };
      xjs.parseString(resp.data, xopts, function (err, data) {
        if (err) { console.log("Failed to parse XML"); return cb("XML Parse Error", null); } // cb(null, resp.data);
        // console.log("Launch and forget data:", data);
        if (p.debug && (p.debug > 1)) { console.log("Launch and forget data:", JSON.stringify(data, null, 2)); }
        // TODO: Add resp
        if (sopts.pp) { sopts.pp(data, resp, p); } // Patch Params ?
        return cb(null, resp.data); // Was missing return - callback leak
      });
    }
    else { cb(null, resp.data); }
  })
  // Note: <faultstring> has an description/explanation of error
  .catch((error) => {
    console.error("SOAP Call error: "+ error);
    var resp = error.response;
    console.error("RESP:",resp); // resp.data
    if (resp && resp.request && resp.request.agent) { console.log("SESS-CACHE:", resp.request.agent._sessionCache); }
    if (resp && resp.data) { console.error("RESP.DATA:",resp.data); }
    return cb(error, null);
   });
}
function login() {
  
}

/** Extract guests from XML content (Async).
* @param cont {string} - XML Content string (to be parsed)
* @param opts {object} - Options Object (with "debug")
* @param cb {function} - Callback to call after completing parsing (receives host array)
*/
function getGuests(cont, opts, cb) {
  if (!cont) { return cb("No (XML) content to parse\n", null); }
  opts = opts || {debug: 0};
  if (!cb) { console.error("must have CB for async parsing"); return; }
  var xopts = { explicitArray: true, // Default/Original: true; 
    // ignoreAttrs: true
  };
  xjs.parseString(cont, function (err, data) {
    if (err) { console.error("Error Parsing XML from "+fname+""); return cb("XML Parse error: "+ err, null); }
    
    data = getRealData(data); // _S
    if (!Array.isArray(data)) { return cb("Not an Array (... of guests ...for further processing)", null);  }
    //if (opts.debug > 1) { console.log(JSON.stringify(data[0], null, 2)); }
    var hosts = [];
    var i = 0;
    data.forEach((esh) => {
      var h = gethost(esh, opts.debug);
      if (!h) { console.log("Got null guest-host idx="+ i); }
      else { hosts.push(h); }
      i++;
    });
    // Simplified hosts
    if (opts.debug) { console.log(JSON.stringify(hosts, null, 2)); }
    cb(null, hosts);
  });
}

/** Convert xml2js parsed (from XML) guest to simple form.
@param esh {object} - propSet section "guest" Guest object (as-is from xml2js)
@return Guest in simple format

TODO: VirtualMachinePowerState, npivTemporaryDisabled, createDate, changeVersion (also date)

*/
function gethost(esh) {
  var h = {};
  h.guestFullName = getPropSetprop(esh, "config.guestFullName", "val");
  h.numCPU	  = getPropSetprop(esh, "config.hardware.numCPU", "val");
  h.numCPU = parseInt(h.numCPU);
  h.memoryMB	= getPropSetprop(esh, "config.hardware.memoryMB", "val"); // Enabled later
  h.memoryMB = parseInt(h.memoryMB);
  var g       = getPropSetprop(esh, "guest"); // <name>guest</name>
  if ( ! validate_node_ok(g, "guest") ) { return null; }
  
  //console.error(g);
  //if (1) { console.log("guest-branch:"+JSON.stringify(g, null, 2)); } // return;
  //if (1) { console.log("esh-top:"+JSON.stringify(esh, null, 2)); } // return;
  var gv = g.val[0]; // Guest value 0
     
  h.hostName = gv.hostName ? gv.hostName[0] : null; // Also ipStack[0].dnsConfig.hostName[0];
  // h.dhcp     = gv.dhcp ? gv.dhcp[0] : "false"; // Note: remains string !
  if (gv.ipStack) {}
  if (gv.disk) {} // capacity
  //if (gv.screen) {} // width +"x"+height
  //console.error("Work w. "+ h.hostName);
  
  h.ipAddress = gv.ipAddress ? gv.ipAddress[0] : null;
  //return h; // OK
  //h.macAddress = gv.net[0].macAddress[0];
  // Disk ? g.val[0].disk;
  h.guestState = gv.guestState ? gv.guestState[0] : null;
  h.guestId    = gv.guestId ? gv.guestId[0] : null; // Is this image ?
  // NEW
  // ALREADY IN: h.guestFullName = gv.guestFullName ? gv.guestFullName[0] : null;
  var n       = getPropSetprop(esh, "name");
  if ( ! validate_node_ok(n, "name") ) { return null; }
  var nv = n.val[0];
  //console.log("NAME: ", nv);
  h.name = nv ? nv._ : null;
  // summary.runtime is under (upper) runtime
  var rtv;
  var rt = getPropSetprop(esh, "runtime"); // "val" . Had "runtime", )
  if ( ! (rtv = validate_node_ok(g, "guest")) ) { return null; }
  //console.log("RT: ", rtv); // WIP ...: screen, guestKernelCrashed, appState, 
  var qs = getPropSetprop(esh, "summary.quickStats", "valself"); // .. uptimeSeconds
  //console.log("Qsumm: ", qs);
  h.uptimeSeconds = qs.uptimeSeconds ? parseInt(qs.uptimeSeconds[0]) : null;
  // hostMemoryUsage
  h.guestMemoryUsage = qs.guestMemoryUsage ? parseInt(qs.guestMemoryUsage[0]) : null;
  var srt = getPropSetprop(esh, "summary.runtime", "valself"); // 
  //console.log("Summ.RT: ", srt); // powerState, bootTime, maxMemoryUsage
  h.bootTime = srt.bootTime ? srt.bootTime[0] : null;
  h.bootTime = h.bootTime ? h.bootTime.substr(0, 16) : null;
  // committed => Not-Shared,Used, uncommitted => Provisioned/Uncommitted, unshared (~committed)
  var sst = getPropSetprop(esh, "summary.storage", "valself");
  // Seems sst can be null (TypeError: Cannot read property 'committed' of null)
  if (sst) {
    h.committed   = sst.committed ? sst.committed[0] : null; h.committed = parseInt(h.committed);
    h.uncommitted = sst.uncommitted ? sst.uncommitted[0] : null; h.uncommitted = parseInt(h.uncommitted);
  }
  console.log("StorageSumm: ", sst);
  h.annotation = getPropSetprop(esh, "config.annotation", "val_");
  return h;
}

function validate_node_ok(g, name) {
  if (!g) { console.error("Did not find "+name+" node !\n"); return 0; }
  if (!g.val) { console.error("Did not find "+name+" VALUE node !\n"); return 0; }
  if (!g.val[0]) { console.error("Did not find "+name+" VALUE 0 node !\n"); return 0; }
  return g.val[0];
}
// NOTE: rettype == "val" ONLY applicable for sects where val[0] has
// prop "_". Should have "directval" or "val_")
function getPropSetprop(obj, name, rettype) {
  var ps = obj.propSet; // App props are under this (AoO), very nested.
  // In AoO objs o.val (array) has one elem o.val[0]
  if (!ps) { console.error("No propSet found !"); return null; }
  if (!Array.isArray(ps)) { console.error("propSet is not Array !"); return null; }
  var pnode = ps.find((p) => { return p.name == name; });
  if (!pnode) { console.error("No property by name '"+name+"' found"); return null; }
  if (!pnode.val) { console.error("property node ",pnode,"does not have 'value'"); return null;}
  // Overload and return different things ?
  if (rettype == "val") { return pnode.val[0]._; } // Direct val "val[0]._" object
  if (rettype == "val_") { return pnode.val[0]._; } // Alias
  if (rettype == "valself") { return pnode.val[0]; }
  // Refine to easy access object
  if (rettype == "object") {
    var o = {};
    var v = pnode.val[0];
    if (!v) { return {}; }
    Object.keys(v).forEach((k) => {
      if (Array.isArray(v[k]) && v[k].length == 1) { o[k] = v[k][0]; }
    });
    return o;
  }
  return pnode; // Node itself (includes name, val)
}

/** ESXi XML & xml2js specific accessor for section properties.
* After xml2js parsing these section properties are extremely awkward
and "indirect" to access. Sturucture contains nested objects and arrays,
each of which has to be checked before access (as they may be missing).
Pass obj.propSet array here
*/
function getSectProps(psarr, foo) {
  if (!Array.isArray(psarr)) { return null; }
  
}
/** Strip WS response wrappings, get to actual data.
@param data {object} - ESXI SOAP response (as parsed by xml2js)
@return Data structure with set of guest objects in it.
*/
function getRealData(data) {
  var ok = 0;
  data = data["soapenv:Envelope"]["soapenv:Body"];
  ok = isArrayWithOneitem(data, "soapenv:Body");
  if (!ok) { return null; }
  data = data[0].RetrievePropertiesExResponse;
  ok = isArrayWithOneitem(data, "RetrievePropertiesExResponse");
  if (!ok) { return null; }
  data = data[0].returnval;
  ok = isArrayWithOneitem(data, "returnval");
  if (!ok) { return null; }
  // 1 keys "objects"
  data = data[0].objects; // isArrayWithOneitem(data, "objects"); // ~ (e.g.) 20 items
  // ~20 items w. each having "name", "val"
  // Note (!!!): this has (~3.2 kl.) info for 1 machine (See hostName, repeated twice)
  //data = data[0].propSet; ok = isArrayWithOneitem(data, "propSet");
  //ObjInspect(data[0]);
  if (data && !Array.isArray(data)) { return null; }
  return data;
}

function getRealData_S(data) {
  //console.log("SIMPLE-data:"+JSON.stringify(data, null, 2));
  data = data["soapenv:Envelope"]["soapenv:Body"];
  if (!data) { console.log("No Body/No Envelope"); }
  console.log("SIMPLE-data:"+JSON.stringify(data, null, 2));
  //data = data[0].RetrievePropertiesExResponse[0].returnval; //.objects;
  //console.log("SIMPLE-data:"+JSON.stringify(data, null, 2));
  process.exit(1);
  return data;
}
/** Access SOAP response data-section from the xml2js parsed form.
* This is ESXI specific accessor, looking for <returnval>.
* Assumes xml2js to be parsed with explicitArray: false.
* @todo Allow app specific (sync) callback to extract e.g. <returnval>
*/
function getSOAPRespData(rdata, ea) {
  if (typeof rdata != 'object') { return null; }
  var b = rdata["soapenv:Body"]; // Same for ean and !ea
  if (!b) { return null; }
  var k;
  if (ea) {
    if (!Array.isArray(b) || (typeof b[0] != 'object')) { return null; }
    //var ks = Object.keys(b[0]);
    //if (ks.length != 1) { return 0; }
    // var k = ks[0];
    //b[0][k][0];
    k = getrespkey(b[0]);
  }
  // Compact, easier
  else {
    k = getrespkey(b);
  }
  function getrespkey(o) {
    if (typeof o != 'object') { return ''; }
    var ks = Object.keys(o);
    if (ks.length != 1) { return ''; }
    return o[ks[0]];
  }
}
/** Check xml2js object member (parsed with ExplicitArray set to true - default).
 */
function isArrayWithOneitem(data, memname) {
  if (!Array.isArray(data)) { console.error(memname+" does not contain array\n"); return null; }
  var type = (typeof data[0]);
  console.error("member '"+memname+"' contains "+data.length+" items ("+type+")");
  if (type == 'object') {
    var keys = Object.keys(data[0]);
    console.error("...[0] is object and has "+keys.length+ " keys ("+keys.join(",")+")");
  }
  if (data.length != 1) { console.error(memname+" contains more than 1 items\n"); return null; }
  return data; // true
}

function ObjInspect(obj) {
  var type = (typeof obj);
  if (type != 'object') { console.error("ObjInspect - did not receive and object !"); return; }
  var keys = Object.keys(obj);
  console.error("Have keys ("+keys.length+"): "+keys.join(","));
  
}


function savecache(host, data) {
  // TODO: var fname = mcfg.esxi.cachepath
  var cachepath = mcfg.esxi.cachepath || "/tmp";
  var fname = cachepath+"/"+host+".xml";
  try {
    fs.writeFileSync(fname, data, {encoding: "utf8"} );
  } catch (ex) { console.error("esxi cache file write error: "+ ex); return; }
  console.log("Wrote: "+fname);
}

module.exports = {
  init: init,
  getGuests: getGuests,
  getRealData: getRealData,
  hostworker: hostworker
};
// console.log(process.argv);

// test main
// node esxi.js ./esxi_guest_info_sample.xml
if (path.basename(process.argv[1]).match(/esxi\.js$/)) {
  
  var mainconf = require("./mainconf.js");
  //console.error("Run sample main");
  var ops = {"parse":"1", "cache":"1", "cacheall":"1", "list": 1};
  var op = process.argv[2];
  if (!ops[op]) { console.error("No such subcommand, try "+process.argv[1]+" "+Object.keys(ops).join('|')); } // 
  // Simple: 
  //var mcfg = require(process.env["HOME"]+"/.linetboot/global.conf.json");
  // Too fancy ?
  var mcfg = mainconf.mainconf_load(process.env["HOME"]+"/.linetboot/global.conf.json");
  mainconf.mainconf_process(mcfg);
  if (!mcfg.esxi) { console.error("No esxi config !"); }
  init(mcfg);
  ///////////////////////
  if (op == "parse") {
    var fname = process.argv[3]; // "./esxi_guest_info_sample.xml"; // 2 => 3
    if (!fname) { console.error("No filename (as first arg) passed"); process.exit(1); }
    if (!fs.existsSync(fname)) { console.error("No file by name "+fname+") exists"); process.exit(1); }
    var debug = process.env['LINETBOOT_ESXI_DEBUG'] || 0;
    var cont = fs.readFileSync(fname, 'utf8');
    getGuests(cont, {debug: 0}, parsedone);
    function parsedone(err, hosts) {
      if (err) { console.error("Error getting hosts: "+ err); return; }
      console.log(JSON.stringify(hosts, null, 2));
    }
  }
  /////////////////
  // Cache single host
  else if (op == 'cache') {
    var host = process.argv[3];
    if (!host) { console.error("Pass host (and optional port for https url e.g. myhost or myhost:8443"); process.exit(1); }
    //var p = dclone(mcfg.esxi); // Copy of params as base for call chain
    //delete(p.vmhosts_BAD);
    //delete(p.vmhosts);
    p = { username: mcfg.esxi.username, password: mcfg.esxi.password, debug: mcfg.esxi.debug }; // Simple (add cachepath ?)
    var ccb = function (err, hinfo) {
      if (err) { return console.log("fetchguestinfo Error: " + err); }
      if (hinfo && (hinfo.length > 10000)) { savecache(host, hinfo); }
      else { console.log("Guest Info looks too small: "+hinfo.length+" B ("+hinfo.substr(0, 5)+")"); }
    };
    // var opts = {}; // Rem. from sign below
    fetchguestinfo(host, p, ccb);
  }
  else if (op == 'list') {
    // List machines and check their cached files
    mcfg.esxi.vmhosts.forEach((h) => {
      var fok = fs.existsSync(mcfg.esxi.cachepath+"/"+h+".xml") ? 1 : 0;
      console.log("- "+h+ " (Cached: "+fok+")");
    });
  }
  // Cache (all). Starts like "list"+"login"+...
  // hostworker() - Take care of one host
  //   
  else if (op == 'cacheall') {
    // Shared by all or should be per host ?
    p = {username: mcfg.esxi.username, password: mcfg.esxi.password };
    var hostnames = mcfg.esxi.vmhosts;
    var opts = {};
    console.error("Start eachSeries for: "+hostnames.join(", "));
    async.eachSeries(hostnames, hostworker, function (err) {
      if (err) { return console.log("cacheall error: "+err); }
      console.log("cacheall series completion success (ls -al "+mcfg.esxi.cachepath+"/*.xml) ");
    });
    
    
    

  } // 'cacheall'
}

/** Fetch and store guestinfo for a single VM host.
* gets (currently) mcfg.esxi config from global mcfg.
* @param hname {string} - VM Host name
* @param cb - Callback to call after fetching and storing. gets called with err and an object (with hname, cont).
*/
function hostworker(hname, cb) {
  // Save guestinfo for a single host
  var savecb = function (err, hresinfo) {
    if (err) { return console.log("fetchguestinfo Error: " + err); cb("hostworker error !", null); }
    var hinfo = hresinfo.cont;
    var hasfault = hinfo && hinfo.length && hinfo.match(/fault/i) ? 1 : 0;
    if (hinfo && (hinfo.length > 10000)) { savecache(hresinfo.hname, hinfo); }
    
    else { console.log("Guest Info looks too small: "+hinfo.length+" B ("+hinfo.substr(0, 5)+", fault:"+hasfault+")"); }
    cb(null, hresinfo);
  };

  var pph = {username: mcfg.esxi.username, password: mcfg.esxi.password}; // TODO: Per host (copy) here
  //var opts = null; // Unused
  // OLD: This runs away. Removed opts (betw. pph, savecb)
  fetchguestinfo(hname, pph,  savecb); // OLD: p, opts, savecb (above)
  //cb(null, 1); // Always forward success
}

/** Fetch a guest info from ESXi and forward results.
 * @param host {string} - ESXi Host VM hostname
 * @param p {object} - Per host-fetch param object (w. e.g. username,password, cookie but do not use mcfg.esxi directly).
 * NOT: @param opts {object} - Options like ...
 * @param cb {function} - Callback to be called with Object: {hname: ..., cont: ...}
 * @return No value, but call cb at completion
 */
function fetchguestinfo(host, p, cb) { // opts,
  // Perform single soap call step of series belonging to one guest.
  function soapstep(cm, cb) {
      soapCall(host, p, dclone(cm), function (err, data) {
        if (err) { console.error("soapstep error: "+ err); return cb(err, null); } // return;
        if (!data || !data.length) { console.log("No error, but no data either !!!"); return cb("No Error, no Data !", null); }
        console.log("SOAP Call '"+cm.id+"' result:"+data.length+" B");
        console.log("Params-gathered-sofar:"+ JSON.stringify(p, null, 2));
        resarr.push(data);
        // res[cm.id] = data; // Object ?
        return cb(null, data); // Forward XML data
      });
    }
    // See linetboot
    // eachSeries ... Data
    var resarr = []; // Let soapstep() fill in
    var hcallarr = [callmods[0], callmods[1], callmods[2]]; // HTTP Call array (login, contview, glist)
    // if (p.cookie) { console.log("Have cookie: "+p.cookie+" - skip login"); hcallarr.shift(); } // Has cookie from login
    async.eachSeries(hcallarr, soapstep, function (err) { // NO results (!) See manual
      if (err) { var xerr = "eachSeries Error: "+ err; console.log(xerr); return cb(xerr, null); }
      //if (!results) { return console.log("Results not avail at completion ("+results+"), err="+err); }
      console.log("RESULTS len: "+ resarr.length + ", Lengths: " + resarr.map((it) => { return it.length; }).join(", "));
      // Forward (e.g. for saving) last
      // var cont = resarr[resarr.length -1 ]; // Too simple when w/o hostname
      var hresinfo = {hname: host, cont: resarr[resarr.length -1 ]}; // cont
      //if (cb) {
        console.log("fetchguestinfo("+host+")/eachSeries completion: Should call fetchguestinfo("+host+") callback ...");
        return cb(null, hresinfo); // OLD: cont
      //}
    });
}

/*
    soapCall(host, p, dclone(callmods[0]), function (err, data) {
      if (err) { console.error("login error: "+ err); return; }
      console.log("MAIN-Login:"+data);
      soapCall(host, p, dclone(callmods[1]), function (err, data) {
        if (err) { console.error("glist0 error: "+ err);  } // return;
        console.log("MAIN-glist0:"+data);
        console.log("Params-gathered-sofar:"+ JSON.stringify(p, null, 2));
        soapCall(host, p, dclone(callmods[2]), function (err, data) {
          if (err)  { console.error("final guest info error: "+ err); }
          if (!data) { console.error("final data is empty !", data); }
          console.log("Got Data: "+data.length+" B");
          savecache(data);
        });
      });
    });
    */
