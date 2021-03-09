/**

General about ESXI "query guests":
- Seems all guests are in same file
- To has "soapenv:Envelope" => "soapenv:Body" => RetrievePropertiesExResponse => ...

Look for patts (for individual guest)

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
*/

var xjs = require('xml2js');
var fs  = require("fs");
var path = require("path");
var Mustache = require("mustache");
var axios = require("axios");


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

var logmsg = `
<Envelope xmlns="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Body>
<Login xmlns="urn:vim25"><_this type="SessionManager">ha-sessionmgr</_this>
<userName>{{ username }}</userName>
<password>{{ password }}</password>
<locale>en-US</locale></Login>
</Body></Envelope>
`;
var getkeymsg = `<Envelope xmlns="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Body>
<WaitForUpdatesEx xmlns="urn:vim25">
<_this type="PropertyCollector">ha-property-collector</_this>
<version></version>
<options><maxWaitSeconds>60</maxWaitSeconds></options>
</WaitForUpdatesEx>
</Body></Envelope>
`;


var sessmsg = `
<Envelope xmlns="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Body>
<RetrievePropertiesEx xmlns="urn:vim25">
<_this type="PropertyCollector">ha-property-collector</_this>
<specSet><propSet><type>SessionManager</type><all>false</all><pathSet>currentSession</pathSet></propSet><objectSet><obj type="SessionManager">ha-sessionmgr</obj><skip>false</skip></objectSet></specSet><options/>
</RetrievePropertiesEx>
</Body></Envelope>
`;

var esxiqmsg = `<Envelope xmlns="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Body>
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
<obj type="ContainerView">session[52e748f1-e74e-2c34-c72a-1a3849c9d654]5269e8e7-80ef-d032-0fe3-db49f537825c</obj>
<skip>true</skip><selectSet xsi:type="TraversalSpec"><name>view</name><type>ContainerView</type><path>view</path><skip>false</skip></selectSet></objectSet></specSet><options/></RetrievePropertiesEx></Body></Envelope>
`;
// https://stackoverflow.com/questions/43002444/make-axios-send-cookies-in-its-requests-automatically
axios.defaults.withCredentials = true;
/* Get listing of guest info as XML.
* TODO: Login ?
*/
function getGuestResponse(host, cb) {
  if (!host) { console.error("getGuestResponse: No host passed"); return; }
  if (!cb) { console.error("getGuestResponse: No CB"); return; }
  var maincfg = require(process.env["HOME"]+"/.linetboot/global.conf.json");
  var cfg = maincfg.esxi;
  var cont = Mustache.render(logmsg, {username: cfg.username, password: cfg.password});
  // SOAPAction: 'http://schemas.facilinformatica.com.br/Facil.Credito.WsCred/IEmprestimo/CalcularPrevisaoDeParcelas'
  var p = {headers: {'Content-Type': 'text/xml'}};
  // cfg.url
  axios.post("https://" + host + "/sdk/", cont, p).then((resp) => {
    console.error("Respdata: "+resp.data);
    // Parse, grab LoginResponse => returnval => key
    //xjs
    cb(null, resp.data);
  })
  .catch((error) => { console.error("getGuestResponse error: "+ error); cb(error, null); });
}
function login() {
  
}

/** Extract guests from XML content (Async).
* 
*/
function getGuests(cont, opts, cb) {
  if (!cont) { return cb("No (XML) content to parse\n", null); }
  opts = opts || {debug: 0};
  if (!cb) { console.error("must have CB for astnc parsing"); return; }
  xjs.parseString(cont, function (err, data) {
    if (err) { console.error("Error Parsing XML from "+fname+""); return cb("XML Parse error: "+ err, null); } // process.exit(1);
    
    data = getRealData(data);
    if (!Array.isArray(data)) { return cb("Not an Array (... of guests ...for further processing)", null);  }
    //if (opts.debug > 1) { console.log(JSON.stringify(data[0], null, 2)); }
    var hosts = [];
    var i = 0;
    data.forEach((esh) => {
      var h = gethost(esh);
      if (!h) { console.log("Got null guest-host idx="+ i); }
      else { hosts.push(h); }
      i++;
    });
    if (opts.debug) { console.log(JSON.stringify(hosts, null, 2)); }
    cb(null, hosts);
  });
}

/** Convert xml2js parsed (from XML) host to simple form.
@param esh {object} - Guest object (as is from xml2js)
@return Guest in simple format
*/
function gethost(esh) {
  var h = {};
  h.guestFullName = getPropSetprop(esh, "config.guestFullName", "val");
  h.numCPU	  = getPropSetprop(esh, "config.hardware.numCPU", "val");
  var g = getPropSetprop(esh, "guest");
  if (!g) { console.error("Did not find GUEST node !\n"); return null; }
  if (!g.val) { console.error("Did not find GUEST VALUE node !\n"); return null; }
  if (!g.val[0]) { console.error("Did not find GUEST VALUE 0 node !\n"); return null; }
  //console.error(g);
  //console.error(JSON.stringify(g, null, 2)); // return;
  var gv = g.val[0]; // Guest value 0
   
  h.hostName = gv.hostName ? gv.hostName[0] : null; // Also ipStack[0].dnsConfig.hostName[0];
  //console.error("Work w. "+ h.hostName);
  
  h.ipAddress = gv.ipAddress ? gv.ipAddress[0] : null;
  //return h; // OK
  //h.macAddress = gv.net[0].macAddress[0];
  // Disk ? g.val[0].disk;
  h.guestState = gv.guestState ? gv.guestState[0] : null;
  h.guestId    = gv.guestId ? gv.guestId[0] : null; // Is this image ?
  return h;
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

function getPropSetprop(obj, name, rettype) {
  var ps = obj.propSet;
  if (!ps) { console.error("No propSet found !"); return null; }
  if (!Array.isArray(ps)) { console.error("propSet is not Array !"); return null; }
  var pnode = ps.find((p) => { return p.name == name; });
  if (!pnode) { console.error("No property by name '"+p.name+"' found"); return null; }
  if (!pnode.val) { console.error("property node ",pnode,"does not have 'value'"); return null;}
  // Overload and return different things ?
  if (rettype == "val") { return pnode.val[0]._; }
  return pnode; // Node itself
}

module.exports = {
  getGuests: getGuests,
  getRealData: getRealData,
};
// console.log(process.argv);

// test main
// node esxi.js ./esxi_guest_info_sample.xml
if (path.basename(process.argv[1]).match(/esxi\.js$/)) {
  var async = require("async");
  //console.error("Run sample main");
  var ops = {"parse":"1", "login":"1"};
  var op = process.argv[2];
  if (!ops[op]) { console.error("No such subcommand, try "+process.argv[1]+" parse|login"); }
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
  else if (op == 'login') {
    var host = process.argv[3];
    if (!host) { console.error("Pass host (and optional port for https url e.g. myhost or myhost:8443"); }
    getGuestResponse(host, function (err, data) {
      if (err) { console.error("login error: "+ err); return; }
      console.log(data);
    });
  }
}
