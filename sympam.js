// Sym PAM
// ## Turning PAM API On
// By default API is off, turn it on by:
// Configuration => Security => Access => External REST API => select (radio button) Enabled
// Turn cluster off ("clustering"): PUT: /cspm/ext/rest/config/clustering/deactivate
// ...on: PUT /cspm/ext/rest/config/clustering/activate
// Seems these (all ?) are under Settings (e.g. Global Settings => Passwords)
// GET /cspm/ext/rest/configProperties (.data is AoO w. name,value (both string, even value nums)
// PUT /cspm/ext/rest/configProperties [ {"passCounterReset": "61", "passChangeInterval": "62"} ] <= All in same object
// GET /api.php/v1/policies.json?limit=200&fields=*
// On policy set: hasRecording: "t", "hasSelectedAccessMethods": "t",
//      hasPamScIntegration: "f", hasTransparentLogin: "f", hasExtendedTimeout: "f", "hasSFFilter": "f", "hasCFFilter": "f", "hasSelectedServices": "f", ??
//      "hasSelectedVPNServices": null, "hasOverriddenRecording": null,
// GET /api.php/v1/policies.json/20001/30001?fields=* (details on policies by UserOrGroupId  + deviceOrGroupId)
//   Beginning looks same as ents in listing
// Service (add, POST, returns JSON string (!) e.g. "33002"):
//   "localIP": "127.0.0.1", // req
//   "serviceName": "{{{ svcpatt }}}-svc", "ports": "" (single num, space delim, range by '-', or remote:local), "protocol": "tcp", "applicationProtocol": "WEB",
//   "launchURL": "https://<Local IP>:<First Port>", // req
//   "browserType": "xceedium", // xceedium = Symantec PAM Browser, native = Native Browser
//   "autoLoginMethod": "...", "XsuiteHTML" = Symantec PAM HTML Web SSO (Forms based), Symantec PAM HTTP Web SSO (Basic) OR "Disabled" (default for missing value = null shows on GUI as "Disabled")
//   "mainframeProtocol": "none", "enabled": "t", "hideFromUser": null,
//   "routeWebPortal": null, // Likely GUI (cbox): "Route Through Symantec PAM" (defaults to null)
//   "showInColumn": "f", // GUI: Show In Column
//   "hideCredentialLink": 0, // GUI: Hide From User
// Resp JSON (e.g.) "32145002"

// Upload
// curl -X POST -F "data=@~/Downloads/CAPAM_4.1.3.H_sy649721_DE561989-fix-4.1.3-revert.p.bin" -u '' https://pam.company.com/cspm/servlet/ConfigUpgradeServlet?action=upload
// Has in request: Cookie: JSESSIONID=... Also Host: ... Pragma: no-cache Upgrade-Insecure-Requests: 1
// 
// Not having Cookie may result in:
// - HTTP Status 401 ? Unauthorized
// - The request has not been applied because it lacks valid authentication credentials for the target resource.
// Caching ents
// ```
// node sympam.js devs  --save default
// node sympam.js svs   --save default
// node sympam.js users --save default
// node sympam.js ugrps --save default
// node sympam.js pols  --save default
// node sympam.js pcps  --save default
// # Need custom for apps / accounts (depend on devs, )
// mkdir -p ~/.linetboot/sympam/tgtaccts ~/.linetboot/sympam/tgtapps
// node sympam.js apps  --save default
// node sympam.js accts --save default
// ```
var axios = require("axios");
var ansdi = require("./ansdi.js");
var mc    = require("./mainconf.js");
var path  = require("path");
var async = require("async");
var fs    = require("fs");
var Mustache = require("mustache");
const { ConstraintViolationError } = require("ldapjs");
//var Getopt = require("node-getopt");

// All must be preceeded by /api.php/v1/ (unless have explicit "/" in string)
var apieps = [
  {"id": "devs", "url": "devices.json"},
  // For POST this must be POST /api.php/v1/services/tcpudp.json
  {"id": "svs",  "url": "services.json", "addp": "type=TCPUDP"}, // Bad Request: PAM-CMN-0003: Not authorized to perform this action.
  // 
  {"id": "svs_new", "url": "services/tcpudp.json", "m": "POST"}, // TCP service (Webapp)
  //
  // Applications (of device) - Grab one by one (apps)
  {"id": "apps",     "url": "devices.json/{{ id }}/targetApplications"}, // TODO: deviceId (Has "fields" param)
  {"id": "apps_new", "url": "devices.json/{{ devid }}/targetApplications", }, // devid from CL
  // Accounts (of device / app). deviceId. Problem: does not allow fields, returns 5 attrs only (applicationId,accountId, has resp. name attrs,
  // but deviceId missing, deviceName is there)
  // Need to consult GET: GET /api.php/v1/devices.json/{deviceId}/targetApplications/{applicationId}/targetAccounts/{accountId} (Has "fields" param)
  {"id": "accts",     "url": "devices.json/{{ deviceId }}/targetApplications/{{ id }}/targetAccounts"}, // OLD: applicationId
  {"id": "accts_det", "url": "devices.json/{{ deviceId }}/targetApplications/{{ id }}/targetAccounts/{{ accountId }}"}, // has fields param
  {"id": "accts_new", "url": "devices.json/{{ devid }}/targetApplications/{{ appid }}/targetAccounts", "m": "POST"},
  // Policies
  // OLD: Bad Request: PAM-CMN-0003: Not authorized to perform this action.
  {"id": "pols",   "url": "policies.json", "m": "GET"}, // GET all
  {"id": "pols_new","url": "policies.json/{{ u_or_ug }}/{{ d_or_dg }}", "m": "POST"}, // {{ userOrGroupId }}/{{ deviceOrGroupId }}
  {"id": "users",  "url": "users.json"}, // "addp": "searchRelationship=AND"  Bad Request: PAM-CMN-0215: Unauthorized attempt to retrieve the list of users.
  {"id": "roles",  "url": "roles.json", "m":"GET"},
  {"id": "ugrps",  "url": "userGroups.json", "m":"GET"}, // ugroups (Can have "roles" and "groupUsers")
  {"id": "pcps",   "url": "passwords/compositionPolicies.json", },
  {"id": "pvps",   "url": "passwords/viewPolicies.json", "":""},
  //{"id": "confs",  "url": "/cspm/ext/rest/configProperties"},
  ////////////////// Update (Cloud Security Posture Management (CSPM))
  {"id": "staged", "url": "system/upgrade/staged.json"}, // list files (staged)
  // NOTE: These APIs are disable when the cluster is deactivated !!! (why are these APIs even there !)
  {"id": "sysver", "url": "system/version.json"}, // e.g. version: 4.1.6.99
  {"id": "up",     "url": "system/upgrade.json/{{{ filename }}}", "m": "POST"}, // Apply patch by its name
  {"id": "up_del", "url": "system/upgrade.json/{{{ filename }}}", "m": "DELETE"}, // delete patch file (staged)
  // For upgrade Internal API has
  //{"id":"upx", "url": "cspm/servlet/ConfigUpgradeServlet/action=apply&fileName={{{ filename }}}", "m": "POST"},
  // Payload: action=apply&fileName=CAPAM_4.1.6.01.p.bin (In url, body CL: 0)
  {"id": "up2",    "url":"cspm/rest/config/upgrade/reboot/{{{ filename }}}", "m": "PUT"}, // CL: 0
  // Resp: {"data":"","success":true,"total":0,"message":null}
  //{"id":"reboot", "url": "cspm/rest/config/power/reboot", "m": "POST"}, // (CL:0)
  // Polling for system-up
  // {"id":"poll", "url":"cspm/rest/timeout?_dc={{ uxts }}"}, // 1711674451856
  // CSPM (Clustering)
  {"id": "nodesup",   "url": "cspm/ext/rest/config/clustering/nodesUp", "pns": ["siteToBeChecked","myself"]}, // startup progress/status (GUI: "Cluster Startup Details")
  {"id": "unlock",    "url": "cspm/ext/rest/config/clustering/unlock", "m": "PUT"}, // Maint mode ?
  {"id": "activate",  "url": "cspm/ext/rest/config/clustering/activate", "m": "PUT"},  // Turn cluster on
  {"id": "deactivate","url": "cspm/ext/rest/config/clustering/deactivate", "m": "PUT"}, // Turn cluster off (works)
  // CSPM (configProps)
  {"id": "config",    "url": "cspm/ext/rest/configProperties", }, // Also "m": "PUT" for Update
  // "cspm/rest/config/upgrade/applianceInfo?_dc=1711675152146&orderby=name&desc=false"
  // Maint mode:
  // /cspm/servlet/ConfigDiagnosticsServlet?action=configSystemModes&aactrl=&maintenance=false&cluster=&remotedebug=&dateTime=&scheduledState=0 POST
  // /cspm/servlet/ConfigDiagnosticsServlet?action=maintenancemode&_dc=1711678329984 GET
  // Dashboard
  //{"id":"siteinfo", "url": "cspm/ext/rest/dashboard/clusterSiteInfo", "m": "GET"}
];

//////////////////////////// Protos (POST) ///////////////////////////////
var protos = {};
// Service proto
// Svs is most frequently used for Web Apps (w. "applicationProtocol": "WEB")
// Note: "learnMode" seems to be used (only) internally
var sproto = protos.svs =
{
  "serviceName": "", // Service Name (e.g. lin-svc)
  "localIP": "127.0.0.1",
  "ports": "3000",
  "protocol": "tcp",
  "applicationProtocol": "WEB", // WEB=Web Portal, Also: should have ...
  "webPortal": "true", // (GET: "t")
  //"webProxyID", null, "webProxyName", null, // web Proxy (Search fld)
  "autoLoginMethod": "XsuiteHTML", // XsuiteHTML=Forms based, XsuiteHTTP=Basic (SymPAM HTTP Web SSO) (Also: null, "Disabled"=No AutoLogin)
  //"comments": "...",
  "launchURL": "https://<Local IP>:<First Port>/",
  "browserType": "xceedium", // native=, xceedium=PAM Browser (80%)
  "routeWebPortal": "t", // Route Through Symantec PAM ("t" on GET)
  "enabled": "t"
}
// Device
// In GUI Password Management (typePassword: "t") enables option to "Save and Add Target Applications" (Not only on creation, but edit).
// This opens App entry with prefilled H.N and Dev name, prompts for App Name, App Type: 
// For above In API, run
// - POST /api.php/v1/devices.json/{id}/targetApplications (see protos.apps)
// - POST /api.php/v1/devices.json/{deviceId}/targetApplications/{applicationId}/targetAccounts
var pam_dproto  = protos.devsX =
{
    "description":null,
    "deviceAccessMethods":null, // VNC,Telnet,SSH,RDP,KVM,Embedded VNC,TN3270,TN5250,TN3270SSL,TN5250SSL
    "deviceGroupMembershipIds":null,
    "deviceMonitors":null,
    "deviceName":null,
    "deviceServiceIds":null,
    "deviceTerminalData":null,
    "deviceVPNServiceIds":null,
    "domainName":null,
    "isHostNamePreserved":null,
    "kdcServerId":null,
    "ldapObjectId":null,
    "location":null,
    "os":null,
    "overrideAddress":null,
    "requestServerActive":null,
    "requestServerDescription1":null,
    "requestServerDescription2":null,
    "tags":null,
    "targetServerDescription1":null,
    "targetServerDescription2":null,
    "transparentLoginType":null,
    "transparentPrompts":null,
    "typeA2A":null,
    "typeAccess":null,
    "typePamsc":null,
    "typePassword":null
}
// To del
// deviceAccessMethods Accepted, but has no effect unless typeAccess: "t" is set !!!
// See /deviceGroups to assign  deviceGroupMembershipIds (Use e.g. "groupId": "00001"),
// devices.json/{id}/accessMethods ONLY needs to be set to add further deviceAccessMethods.
// NOTE: Device can be accessible by solely it being in device group IFF there is an policy
// for that device group and user/usergroup (Empirically shown).
// Pass/Replace: ["deviceAccessMethods", "deviceGroupMembershipIds"] => acctype, devgrps
// Derive/Replace: ["domainName", "os", "location"]
// Deletion cascades delete (http: DELETE)
// Sometimes (not-as-a-rule) accounts can be entered as device (with non-real IP)
// 
var dproto = protos.devs =
{
  // "description": ""
  "deviceAccessMethods": [{"type":"SSH"}], // "port":"22", "taskProperty": "x11forwarding". Also type:RDP, port:3389
  "deviceGroupMembershipIds": [""], // E.g. 5 digit (as string for API) p.deviceGroupMembershipIds[0] += cfg.devsgrp
  "deviceName": "myvm", // Typical: VM name
  "deviceServiceIds":[], // Ids for Web (Not SSH) Services (VNC, RDP should have deviceAccessMethods)
  "domainName": "myvm.mycomp.com", // FQDN (or IP, anything resolvable for connection)
  "os":"Linux",
  "tags": [],
  "location": "", // Arbitrary loc. indicator. Could use e.g. cloud region us-central1-b
  "typeAccess": "t", // 
  "typePassword": "t" // has passwd stored for device
}
// App as in GET: devices.json/{{ id }}/targetApplications
// App type for SSH: UNIX
// App can hold SSH key requirements / policies (Tab: SSH-2 => Conn. Info, Cipher, Hash, Key Exch., Comp., Server Host Key (types))
// Conn.Info has: SSH Key Pair Policy (Default or per user, w. Key Type, Key Length req:s)
// App can be named to be an ssh-key.
// Application Type: Generic (Web APp), UNIX (SSH access, has a tree of subtabs), API Key (rare, internal)
var aproto = protos.apps = {
  "applicationName": "", // App name (mandatory), e.g. {{ devname }}-rdp
  "deviceId": "", // In get as int, not string (rare in API!)
  "applicationType":"Generic", // UNIX ("unixII") for SSH keys. If key or policy: "unixII". RDP: windowsRemoteAgent
  //"attributes":null, // Seems {} w. (e.g.) sshKeyPairPolicyID
  "description1": "",
  "description2": "",
  //"overrideDnsType":null, // Windows remote w. Kerberos enabled
  "passwordCompositionPolicyId": "0", // Default "0" (Could refer to an actual pcp ...)
  "sshCertificatePolicyId":null,
  "sshKeyPairPolicyId":null
};
var acctproto = protos.accts = {
  "accountName": "",
  "aliasNames": null, // "" ?
  // Force password change attribute is incorrect. , - seems "false" works on POST ("f" shows on GET response)
  "attributes": { "accountType": "admin", "isProvisionedAccount": "false",
    "extensionType": "windowsRemoteAgent",
    "forcePasswordChange": "false", "useOtherAccountToChangePassword": "false"},
  "cacheBehavior": "useCacheFirst", // useCacheFirst, useServerFirst, noCache
  "cacheDuration":"30", // 1-356
  "description1": "",
  "description2": "",
  "password":null, // UI: Credential. passwd or rpiv key. "_generate_pass_" will create a password for the acct.
      // "Bad Request: `data.password` is required."
  "passwordViewPolicyId": "1000", // E.g. Default (default for acct ? API expects integer ID. Default=1000 ... "name": "Default",)
  "privileged": "t", // Dropdown: A2A Account / Privileged Account ("t")
  "synchronize": "f", // Sync passwd on PAM w. target sys.
  "useAliasNameParameter":null // "0" Does not appear in GET
};
// policy: 
// NO accountId
// Consider Access tab (SSH)
// "services" would be web services(AoO): w. serviceId, accountIds: [0,]
var polproto = protos.pols = {
  // find SSH, find accs on 
  //"accessMethods" : [{"accessMethodId": 0, "accountIds":[1001,1002] }],
  //"cliRecording": "t", // Get does not have
  //"graphicalRecording": ""
  //"webPortalRecording": ""
  //  No applets or services which support bidirectional CLI recording are selected.
  //"bidirectionCLIRecording": "t",
  "targetAccounts": [], // AoS ("$accid")
  //"isUserGroup": "f", "isDeviceGroup": "f", // Props for being U/D groups (need ?)
  "services": [] // Important "serviceId": ..., "accountIds": []
};
// Note: You can join a dev to devgrp at the time of creation by deviceGroupMembershipIds
protos.devgrps = {

};
/////////////////////////////////////////////////////

function mkdev(d, opts) {
  if (cfg.domain) { d.domainName = opts.host + "."+cfg.domain; }
  // Else lookup IP from ansible inv.
  else {}
}

// Actually varies, e.g. cspm/ext/rest/configProperties
var apiprefix = "api.php/v1"; // Add trail slash in uage context
var atype = "Basic";
var osacct = '';
var cfg = {};
var creds = "";

function init(_mcfg) {
  if (!_mcfg) { throw "No main config"; }
  if (!_mcfg["sympam"]) { throw "No sympam config within main config"; }
  cfg = _mcfg["sympam"];
  if (!cfg.host) { console.log( "No sympam config host" ); return; }
  if (!cfg.user) { console.log( "No sympam config user" ); return; }
  if (!cfg.pass) { console.log( "No sympam config pass" ); return; }
  if (!cfg.pass) { console.log( "No sympam config pass" ); return; }
  cfg.storepath = cfg.storepath || process.env["HOME"] + "/.linetboot/sympam/";
  process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
  creds = cfg.user+":"+cfg.pass;
}

function dclone(d) { return JSON.parse(JSON.stringify(d)); }

function fullurl(ep, opts) {
  if (typeof ep != 'object') { return }
  //NOT: var full = "https://"+cfg.host+""+
  var urlpath = ep.url + "?limit=300&fields=*"; // Removed prefix "/"
  if (ep.m == 'POST' || ep.m == 'PUT') { urlpath = ep.url; }
  // if (ep.url.match(/^\//)) { urlpath = ep.url; } // None start by '/'
  if (ep.url.match(/^cspm/)) { urlpath = ep.url; } // cspm URLs are .. ???
  // TODO: See if we have to move ?limit... here
  if (ep.addp) { urlpath += "&"+ep.addp; }
  // if (cfg.limit) { urlpath += "?limit=" + cfg.limit + '&'; }
  var host = cfg.host;
  if (opts && opts.hostidx) { host = cfg.clushosts[opts.hostidx-1]; } // E.g. 1 for primary, cont to index by -1
  else if (opts && opts.host) { host = opts.host; }
  var finurl = "https://"+host+"/"+apiprefix+"/"+urlpath;
  // cspm URLs are missing the apiprefix
  if (ep.url.match(/^cspm/)) { finurl = "https://"+host+"/"+urlpath; }
  return finurl;
}
/**  Get an API entrypoint by finding / matching.
 * Matching can be done by upatt:
 * - exact sting, against id
 * - RegExp in URL
 */
function getep(upatt) {
  var ep;
  if (upatt instanceof RegExp) {
    ep = apieps.find( (ep) => { return ep.url.match(upatt); } );
  }
  // Exact match by id
  else { ep = apieps.find( (ep) => { return ep.id == upatt; } ); }
  if (!ep) { return null; }
  if (cfg.debug) { console.log("Got EP: ",ep); }
  return ep;
}
// optype - API Obj type (e.g. devices, services, policies)
// (otype, opts) {
function api_url_list(opts) {
  // if (!otype) { console.log("otype missing "); return null; }
  var urlprefix = "https://"+cfg.host+"/"+apiprefix+"/"; // +otype;
  // url += "";
  // var creds = cfg.user+":"+cfg.pass;
  //if (opts.curl) {
  apieps.forEach( (ep) => {
    // urlprefix +
    var meth = ep.m || "GET";
    var finurl = fullurl(ep);
    var cmd = "curl -X "+meth+" -u '"+creds+"' '"+finurl+"' ";
    cmd += " | python3 -m json.tool";
    // cmd += " > "+ cfg.storepath + "/" + 
    console.log(cmd);
  });
  return 
}
// Get apps associated w. devices
// TODO: Store apps to single file ?
function apps(opts) {
  // Load devices
  var devs = require(cfg.storepath + "devices.json");
  if (!devs) { usage("No devices found (for app loading) !"); }
  // Revised to elim trailing slash for devices fetch reuse
  //var urlprefix = "https://"+cfg.host+"/"+apiprefix+"/devices.json";
  var ropts = { auth: {username: cfg.user, password: cfg.pass} }; // headers: { 'Authorization': + basicAuth }
  devs = devs.devices;
  //var creds = cfg.user+":"+cfg.pass;
  
  //var appinfo = {};
  devs.forEach( (d) => {
    if (d.deviceName == "$device_name") { return; }
    var fn = "dev."+ d.deviceId + ".apps.json"; // App fn
    // TODO: Utilize fullurl
    var urlt = fullurl(getep("apps"));
    var url = Mustache.render(urlt, {id: d.deviceId}); // app query
    //var url = Mustache.render(urlt, d); // or pass d directly (if deviceId on tmpl) ?
    // Curl
    var cmd = "curl -X GET -u '"+creds+"' '"+url+"' ";
    cmd += " | python3 -m json.tool > " + cfg.storepath + "/" + fn;
    console.log(cmd);
    //return; // DEBUG
    axios.get(url, ropts).then( (resp) => {
      console.log("DATA ("+d.deviceId+"):", resp.data);
      var apps = resp.data; // should be an array
      if (!Array.isArray(apps)) { console.error("apps not in array for device "+ d.deviceId); return; }
      if (opts.save ) { // && (opts.save == 'default')
        var bn = `dev.${d.deviceId}.apps.json`;
        //var fn = opts.save == 'default' ? cfg.storepath + "/tgtapps/" + bn : opts.save;
        var fn =  cfg.storepath + "/tgtapps/" + bn ;
        fs.writeFileSync( fn,  JSON.stringify(apps, null, 2) , {encoding: "utf8"} );
        //console.log("Should be saving\n"); return;
      }
      // cb(null, apps);
    }).catch( (ex) => {
      console.log("Error fetching ("+d.deviceId+"/"+d.deviceName+"): "+ex);
      console.log("Test-by-Curl: "+ cmd);
    }); // cb("No device or app", null);
  });
  //console.log("Done apps.");
}
/** Fetch application accounts (*accounts only* - based on existing, cached devs and apps).
 * - Load and Combine devices and applications
 *   - Both devs (devices.json) and apps (tgtapps/dev.$DEVID.apps.json) must exist
 */
function accts(opts) {
  
  // function devs_load(opts) { // Opt: loadapps: true
  var devs = require(cfg.storepath + "/devices.json");
  if (!devs) { usage("No devices found (for app loading) !"); }
  devs = devs.devices;
  // return devs;
  //}
  //var appidx = {}; // .. or attach directly to dev
  // OLD: Re-iterate later w. apps, use permutations to search accounts
  // Permutations can be found in apps only !
  var apparr = [];
  devs.forEach( (d) => {
    var id = d.deviceId;
    var appfn = cfg.storepath+"/tgtapps/"+`dev.${id}.apps.json`; // App (read-only)
    if (!fs.existsSync(appfn)) { console.log("No app file "+appfn+" for dev "+id); return; }
    var apps = require(appfn);
    if (!apps) { console.log("No apps loaded for dev: "+id); return; }
    console.log(apps.length + " apps for DevId: "+id);
    // Inject parent dev id to app already here (app must be exclusively on one device, not shared !)
    //ALREADYIN, assert:
    apps.forEach( (app) => {
      if (app.deviceId != d.deviceId) { console.log(`App ${app.id} does not belong to device ${d.deviceID} : `, app); }
      //app.devent = d; // Parent hard-link (Circular, Would not work well w. JSON)
    });
    d.APPS = apps;
    apparr = apparr.concat(apps);
  });
  console.log("DEV_APPS:\n"+JSON.stringify(devs, null, 2));
  
  console.log(`${apparr.length} Apps (to search accounts for)`);
  // Process apparr ?
  var ropts = { auth: {username: cfg.user, password: cfg.pass} };
  //accts_test(apparr[0]); // TEST/DEBUG (w. one)
  async.mapSeries(apparr, accts_fetch, function (err, ress) {
    if (err) { console.error("Error in mapSeries: "+err); return; }
    //console.log(ress);
  });
  // Fetch accounts for app (on a device)
  function accts_fetch(app, cb) {
    var urlt = fullurl(getep("accts"));
    // Note: app has deviceId natively (use it, instead d.deviceId). OLD: {deviceId: d.deviceId, id: app.id}
    var url = Mustache.render(urlt, app); // Is "id" (appid) in app, also deviceId !!!
    console.log("FETCH: "+url);
    //return cb(null, app); // DEBUG
    axios.get(url, ropts).then( (resp) => {
      var accts = resp.data;
      // Save ?
      if (opts.save) {
        var fn = cfg.storepath+"/tgtaccts/"+`dev.${app.deviceId}.app.${app.id}.accts.json`;
        fs.writeFileSync( fn,  JSON.stringify(accts, null, 2) , {encoding: "utf8"} );
      }
      return cb(null, accts);
    }).catch( (ex) => { console.log("Failed to fetch "); return cb(ex.toString(), null); });
  }
}

////////////////////////////////// Generic GET / POST /////////////////////////////////////////////////////

function getany(opts) { // getany
  var ep = getep(opts.etype);
  var fn = opts.save == 'default' ? cfg.storepath + "/" + ep.url: opts.save; // 
  if ( (opts.save == 'default') && fn.match("/")) { console.log("Fixup default filename path to basename ..."); fn = cfg.storepath + "/" + path.basename(fn); }
  var url = fullurl(getep(opts.etype));
  console.log("Call (GET) "+url);
  var ropts = { auth: {username: cfg.user, password: cfg.pass} };
  axios.get(url, ropts).then( (resp) => {
    //console.error("DATA:", resp.data);
    var ents = resp.data; // should be an array
    //if (!Array.isArray(ents)) { console.error("No ${opts.etype} items as an array"); return; }
    console.log(JSON.stringify(ents, null, 2));
    //console.log(ents);
    var arr = ents[opts.colla];
    var tot;
    if (!arr) { console.error("No coll.attr. present for "+opts.etype+". Using raw array."); arr = ents; tot = -1; } // NOT: return
    else { tot = ents.totalRows; }
    console.error(`${tot} ${opts.etype} by totalRows`);
    console.error(`${arr.length} ${opts.etype} by collection`);
    if (tot != arr.length) { console.error("Did not (possibly) get all the ents in single set ("+url+")"); }
    if (opts.verbose) { console.log(JSON.stringify(ents, null, 2)); }
    if (opts.save) {
      fs.writeFileSync( fn,  JSON.stringify(ents, null, 2) , {encoding: "utf8"} );
      console.error(`Saved to ${fn}`); //return;
    }
  }).catch( (ex) => { console.log("Error fetching ${opts.etype}: "+ex); }); // cb("No device or app", null);
}

/////////////////////// Create ////////////////////////
// Create ent (POST)
// Types: devs, svs, apps, accts, pols
function mkany(opts, cb) {
  if (!cb) { cb = cb_nop; }
  var et = opts.etype; // Use et ONLY for API info lookup
  if (et == 'svs') { et = "svs_new"; }
  if (et == 'apps') { et = "apps_new"; }
  if (et == 'accts') { et = "accts_new"; }
  if (et == 'pols') { et = "pols_new"; }
  var ep = getep(et); // opts.etype
  if (!ep) { usage("No API entrypoint for etype: "+opts.etype); }
  //if (ep.m != 'POST') { usage("mkany(): Not a POST API e.p."); } // Some URLs are shared GET/POST
  var url = fullurl(getep(et));
  var ropts = { auth: {username: cfg.user, password: cfg.pass} };
  if (!protos[opts.etype]) { usage(`No data-proto for ${opts.etype}`); }
  var para = dclone(protos[opts.etype]); // copy initial !
  // Override / merge
  var jd = null;
  if (opts.data) {
    jd = (typeof opts.data == 'string') ? JSON.parse(opts.data) : opts.data;
    if (!jd || Array.isArray(jd)) { usage("data passed w. --data must contain JSON object (not invalid syntax or Array) !!"); }
    opts.debug && console.log("Override w. data:", jd);
    Object.keys(jd).forEach( (k) => { para[k] = jd[k]; }); // merge/override
  }
  // Need to template url ?
  if (opts.etype == 'apps' || opts.etype == 'accts') {
    if (!opts.devid) { usage("Must have --devid for App or Account !!!"); }
    if (opts.etype == 'accts' && !opts.appid) { usage("Must have 'appid' for account creation"); }
    // Check if ( url.match(/\{\{/) ) {  }
    url = Mustache.render(url, opts);
  }
  // Must have (See API def)  userOrGroupId / deviceOrGroupId
  if (opts.etype == 'pols' ) {
    opts.u_or_ug = opts.userid || opts.usergrpid;
    opts.d_or_dg = opts.devid || opts.devgrpid;
    console.log("opts", opts); // Debug
    if (!opts.u_or_ug) { usage("No policy userOrGroupId present by --userid or --usergrpid"); }
    if (!opts.d_or_dg) { usage("No policy deviceOrGroupId present by --devid or --devgrpid"); }
    url = Mustache.render(url, opts); // opts
    console.log(`pols: POST ${url}`);
    console.log(JSON.stringify(para, null, 2));
    //return;  // DEBUG
  }
  if (opts.debug) {
    console.log(`Create-Data opts '${opts.etype}':\n`+JSON.stringify(opts, null, 2));
    console.log(`Create-Data for type '${opts.etype}':\n`+JSON.stringify(para, null, 2));
    console.log(`Call URL (POST): ${url}`);
  }
  if (opts.dryrun) { console.log("DRYRUN - No POSTing"); return cb(null, tocl(opts)); }
  if (opts.showcl) { console.log(tocl(opts)); }
  //var ropts = { auth: {username: cfg.user, password: cfg.pass} };
  axios.post(url, para, ropts).then( (resp) => {
    // These seem to be returning plain quoted string id for ent (as JSON, numeric inside quotes)
    var d = resp.data;
    // Shows most often as '"1234"' (stringify serializes back the rec'd string)
    console.log(`Create-Response for type${opts.etype}:\n`+JSON.stringify(d, null, 2));
    opts._id = d; // Store id for related ents (to follow)
    // Allow using as async CB
    return cb(null, d); // if (cb) {  } // String most of time
  // Get actual response (JSON), output error.message
  }).catch( (ex) => {
    var resp = ex.response;
    console.log(resp.data);
    console.log("mk-exception: "+ex);
  });
  function cb_nop(err, data) { return data; }
}
function tocl(opts) {
  var add = "";
  var et = opts.etype;
  var pmap = {
    "devs": [], "svs": [], // No opts (=> independent)
    "apps": ["devid"], "accts": ["devid","appid"],
    "pols": ["userid","devid","usergrpid","devgrpid"], };
  var ks = pmap[et];
  if (!ks) { return "Cannot generate command !!!"; }
  ks.forEach( (k) => { if (opts[k]) { add += " --"+k+" '"+opts[k]+"' "  } });
  return "node sympam.js mk"+opts.etype+" --data '"+JSON.stringify(opts.data)+"' "+add;
}
///////////////////// SW Update / Upgrade ///////////////////////////

// Upgrade:
// Version: GET /api.php/v1/system/version.json
// List: GET /api.php/v1/system/upgrade/staged.json (number items ?)
// Upgrade: /api.php/v1/system/upgrade.json/{filename}
// https://medium.com/@petehouston/upload-files-with-curl-93064dcccc76
// Hotfix

/////////////////// Update ///////////
// e.g. --fname CAPAM_4.1.6.01.p.bin  CAPAM_4.1.7.p.bin 
function update(opts) {
  if (!opts.fname) { usage("Missing --fname"); }
  //var ep = getep("up");
  console.log("Upgrade w. file: "+opts.fname+" Host idx: "+ opts.hostidx);
  var urlt = fullurl(getep("up"));
  var url = Mustache.render(urlt, { filename: opts.fname });
  var ropts = { auth: {username: cfg.user, password: cfg.pass} };
  var para = {filename: opts.fname};
  console.log("Call by: ", para);
  axios.post(url, para, ropts).then( (resp) => {
    var d = resp.data;
    console.log("Response: ", d);

  }).catch( (ex) => { console.log("Failed update: "+ex); }); // (ex) => {exhdlr(ex, resp)}
  //// Exceptions
  function exhdlr(ex, resp) {
    console.log("Failed update by file: "+opts.fname+": "+ex);
    var resp = ex.response;
    console.log(resp.data);
  }
}
// NOTE: Cluster on/off ops must be executed on Replication leader/primary node
function cluster_set(opts) {
  var wop = opts.op == "clusteron" ? "activate" : "deactivate";
  //var hidx = opts.hostidx || 1;
  var url = fullurl(getep(wop), opts); // {hostidx: hidx}
  console.log(`Cluster:${wop}: ${url}`);
  if (!opts.exec) { console.log("Cluster is not to be triggered on/off lightly (w/o real need). Pass --exec to actually toggle"); return; }
  //return;
  var ropts = { auth: {username: cfg.user, password: cfg.pass} };
  var para = {};
  axios.put(url, para, ropts).then( (resp) => {
    var d = resp.data;
    console.log(`Response(${url}): `, JSON.stringify(d, null, 2));
    console.log("You can monitor cluster status with: nodesup Subcommand.");
  }).catch( (ex) => { console.log(`Error(${url}): `+ ex); });
}
function cluster_info(opts) {
  console.log("Cluster DNS Name: "+cfg.host);
  console.log("Node IPs: "+cfg.nodeips.join(", "));
  console.log("Cluster API account: "+cfg.user);
}
function nodesup(opts) {
  var url = fullurl(getep("nodesup"), opts);
  var ropts = { auth: {username: cfg.user, password: cfg.pass} };
  if (opts.site) { url += "?siteToBeChecked="+cfg.site; } // siteToBeChecked=... (-1 default)
  else { url += "?myself=true"; }
  // 
  axios.get(url, ropts).then( (resp) => {
    var d = resp.data;
    console.log(`Response(${url}): `, JSON.stringify(d, null, 2));
  }).catch( (ex) => { console.log(`Error(${url}): `+ ex); });
}
// Get PAM Configuration (k-v) settings.
function config(opts) {
  var url = fullurl(getep("config"), opts);
  var ropts = { auth: {username: cfg.user, password: cfg.pass} };
  axios.get(url, ropts).then( (resp) => {
    var d = resp.data;
    console.log(`Response(${url}): `, JSON.stringify(d.data, null, 2));

  }).catch( (ex) => { console.log(`Error(${url}): `+ ex); });
}
function usage(msg) {
  if (msg) { console.log(msg); }
  console.log("Subcommands ");
  acts.forEach( (a) => { console.log("- " + a.id + " - " + a.title ); });
  console.log("Options (each may apply to only certain subcommand)");
  clopts.forEach( (o) => { console.log("- "+o[1] + " - " + o[2]); });
  process.exit(1);
}
var pemeta = {
  "devs": { "colla": "devices", "nattr": "deviceName" }, // "deviceId"
  "pols": {"colla": "policyAssociationInfos", "nattr": "" }, // // No name attr // "id"
  //"": {},
  "svs": { "colla": "services", "nattr": "serviceName" },
  //"users": { "colla": "users", "nattr": "userName",}, // "userId"
  "ugrps": { "colla": "groups", "nattr": "groupName", }, // "groupId"
  // apps, accts: Raw array (no colla) per device (files numbered by device id)
  "apps": { "colla": "", "nattr": "applicationName"}, // "id"
  "accts": { "colla": "", "nattr": "accountName"}, // "accountId"
  //"": {},
};
// For all etype/colla sets check totalRows
// TODO: separate ent meta (?)
var acts = [
  // List / GET
  {"id": "url",   "title": "List PAM API URL(s)",   "cb": api_url_list, },
  // Standard fetch
  {"id": "devs",  "title": "List Devices",  "cb": getany, "etype": "devs", "colla": "devices"}, // getdevs
  {"id": "pols",  "title": "List Policies", "cb": getany, "etype": "pols", "colla": "policyAssociationInfos"}, // pols
  {"id": "svs",   "title": "List Services", "cb": getany, "etype": "svs",   "colla": "services"}, // svs
  {"id": "users", "title": "List Users",    "cb": getany, "etype": "users", "colla": "users"}, // new-gen
  {"id": "ugrps", "title": "List User Groups","cb": getany, "etype": "ugrps", "colla": "groups"},
  {"id": "pcps",  "title": "List PCPs",      "cb": getany, "etype": "pcps",  "colla": ""}, // Raw array, no colla
  // Custom / Special Device fetch (params in URL) - Apps, Accts
  {"id": "apps",  "title": "List Apps for all devices", "cb": apps, }, // Custom
  {"id": "accts", "title": "List Devices, Apps, Accounts", "cb": accts, }, // Custom
  
  //////// Create (Most: mkany). Must check nattr (name attr) is not empty
  {"id": "mkdevs", "title": "Create Device",  "cb": mkany, "etype": "devs", "colla": "",  "nattr": "deviceName"},
  {"id": "mksvs",  "title": "Create Service", "cb": mkany, "etype": "svs",  "colla": "",  "nattr": "serviceName"},
  // POST /api.php/v1/devices.json/{id}/targetApplications MUST Pass device
  {"id": "mkapps",  "title": "Create App",    "cb": mkany, "etype": "apps", "colla": "",  "nattr": "applicationName"},
  // POST /api.php/v1/devices.json/{deviceId}/targetApplications/{applicationId}/targetAccounts  
  {"id": "mkaccts", "title": "Create Account","cb": mkany, "etype": "accts", "colla": "",  "nattr": "accountName"},
  {"id": "mkpols", "title": "Create policy",  "cb": mkany, "etype": "pols", "colla": "",  "nattr": ""}, // No name attr
  //////////// Maint. Operations Update SW
  {"id": "update",  "title": "Update SW by applying a patch/update file (--fname ...)", "cb": update, },
  // Config
  {"id": "config",  "title": "Show Global Configuration ", "cb": config, },
  // cluster_set
  {"id": "clusteron",  "title": "Turn Cluster On", "cb": cluster_set, },
  {"id": "clusteroff",  "title": "Turn Cluster Off", "cb": cluster_set, },
  {"id": "nodesup",  "title": "Check cluster nodesup status (\"data\": true => Cluster is fully running)", "cb": nodesup, },
  {"id": "clusterinfo",  "title": "Cluster Infon", "cb": cluster_info, },
];
var clopts = [
  // ARG+ for multiple
  ["h", "host=ARG", "Hostname "], // or multiple full hostnames (given w. multiple -h args)
  ["", "devgrps=ARG", "Device Groups"], // Not used
  // Note: abstract keywords - may lead to adding Device => Access Method(s) OR a Service(s)
  // (2 adjacent tabs in GUI)
  ["a", "acctype=ARG", "Access Type (SSH, RDP, WEB)"],  // For ...
  ["", "webauth", "Web authentication type: 'form' or 'basic' (default basic)"],
  ["s", "save=ARG", "Save to a file (Use default to save with 'standard' path and name."], // For any GET/Cache
  ["f", "fname=ARG", "Filename to apply as update"],
  ["i", "hostidx=ARG", "Hostindex (1-based) to address a host in cluster with the request"], // For Upgrade
  ["e", "exec", "Execute Operation (to be not triggered lightly)"], // For Upgrade ops
  ["d", "data=ARG", "JSON data for Create (or Update)"], // mkany
  ["d", "dryrun", "Dry-run for Create (or Update)"], // mkany
  ["", "appid=ARG", "Application ID for Acct Creation"],
  // Policy (Also: App/Acct)
  ["", "devid=ARG", "Device Id for App/Acct/Policy Creation"],
  ["", "userid=ARG", "User ID for Policy Creation"],
  ["", "usergrpid=ARG", "User Group (for Policy)"],
  ["", "devgrpid=ARG", "Device Group (for Policy)"],
  //["", "", ""],
  //["", "", ""],
  //["", "", ""],

];
// Perform secondary parsing (that Getopt is not aware of)
function opts_parse2(opts) {
  if (opts.acctype) { //  && opts.acctype.match(",")
    opts.acctype = opts.acctype.split(/,/);
  }
  if (opts.devgrps) {
    opts.devgrps = opts.devgrps.split(/,/);
  }
  // Delete single char opts
  Object.keys(opts).forEach( (k) => {
    if (k.length == 1) { delete opts[k]; }
  });
}

module.exports = {init: init, tocl: tocl, mkany: mkany, pemeta: pemeta };
// test: node sympam.js run --host=myhost --devgrps=mgmt --acctype=SSH,RDP
if (process.argv[1].match("sympam.js")) {
  var argv2 = process.argv.slice(2);
  var op = argv2.shift();
  if (!op) { usage("No subcommand"); }
  var opnode = acts.find( (an) => { return an.id == op;  });
  if (!opnode) { usage("Subcommand  "+op+" not supported."); }
  var Getopt   = require("node-getopt");
  var getopt = new Getopt(clopts);
  var opt = getopt.parse(argv2);
  let opts = opt.options;
  opts.op = op; // For handlers to detect op
  // TODO: Load all: device, service,
  var cfgfn = process.env["HOME"] + "/.linetboot/global.conf.json"
  var mcfg = mc.mainconf_load(cfgfn);
  mc.env_merge(mcfg);
  mc.mainconf_process(mcfg);
  init(mcfg);
  //console.log("OK");
  opts_parse2(opts);
  if (opts.hostidx) { opts.hostidx = parseInt(opts.hostidx); }
  if (opnode.etype) { opts.etype = opnode.etype; opts.colla = opnode.colla; }
  // console.log(opts);
  var rc = opnode.cb(opts) || 0;
  //process.exit(rc);
}
