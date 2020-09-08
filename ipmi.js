/** @file
* # Module to expose some of the ipmi info.
*
* Allows parsing:
* - LAN Info
* - User Accounts.
* ## TODO:
* Start allowing changing settings.
*/
var fs = require('fs');
var ssh = require("node-ssh");
var async = require("async");
var dns = require('dns');

function lan_test () {
  var lfn = "./ipmi_lan_sample.txt";
  var laninfo = fs.readFileSync(lfn, 'utf8');
  var lan = lan_parse(laninfo);
  console.log(lan);
}

function users_test() {
  var lfn = "./ipmi_userlist_sample.txt";
  var usersinfo = fs.readFileSync(lfn, 'utf8');
  var users = users_parse(usersinfo);
  console.log(users);
}
// console.log(process.argv);
// Detect calling CL utility and trigger test mode.
if (process.argv[1].match(/\bipmi\b/)) {
  var act = process.argv[2];
  if (act == 'lan') { lan_test(); }
  else if (act == 'user') { users_test(); }
  else { hosts_rmgmt_info(); }
}

var rmpath_ev = "RMGMT_PATH"; // TODO: Use below

/** Work on global.ipmi.path and RMGMT_PATH.
 * As a result of this initialization RMGMT_PATH should always be populated (for other modules to use).
 */
function init(global) {
  if (!global || !global.ipmi) { return; }
  var rmcfg = global.ipmi;
  // Check that this is an actuaol object
  // if (typeof rmcfg != 'object') { return; }
  // If one indication of rmgmtpath found, set the other, forcing it to sync.
  // Prioritize env variable
  if (process.env["RMGMT_PATH"]) { rmcfg.path = process.env["RMGMT_PATH"]; }
  else if (rmcfg.path) { process.env["RMGMT_PATH"] = rmcfg.path; }
  // Check presence ? Wipe out both if not present ?
  if (!fs.existsSync(rmcfg.path)) {
    console.log("WARNING: Remote management path ('"+rmcfg.path+"') does not exist !!");
    // Wipe out both ?
    // rmcfg.path = "";
    // process.env["RMGMT_PATH"] = "";
  }
  
}

function rmgmt_path () {
  return process.env["RMGMT_PATH"];
}

/** Get remote management info for the hosts by SSH.
* Hosts are listed by name as array of strings in hlist.
* @param hlist {array} - list of hostnames
* @param sshpara {object} - SSH parameters "template" (server hostname is
*      varied for each host connection)
*/
function hosts_rmgmt_info(hlist, sshpara) {
  sshpara = sshpara || {};
  // host,username, privateKey
  if (!sshpara) { throw "Need SSH params"; }
  if (!sshpara.privateKey) {
    sshpara.privateKey = process.env["HOME"]+"/.ssh/id_rsa";
  }
  if (!sshpara.username) { sshpara.username = process.env["USER"]; }
  var cmd = "sudo  ipmitool lan print 1"; // Not going to work w/o root ssh
  // if (process.env["SUDOPASS"]) { cmd = "echo '"+pass+"' |" + cmd; } // Add -S
  function host_rm_info(hn, cb) {
    var ssh = new node_ssh();
    var sshpara2 = JSON.parse(JSON.stringify(sshpara)); // Copy for each async thread
    sshpara2.host = hn;
    var execopts = {stream: 'stdout'}; // pty: true to interactively respond to prompt
    ssh.connect(sshpara2).then(function () {
      // with stream: 'stdout' ... result is directly stdout
      ssh.execCommand(cmd, execopts).then(function (result) {
        var lan = lan_parse(result); // result.stdout
        cb(lan);
      }); // .catch(function (err) {})
    });
  }
  async.map(hlist, host_rm_info, function (err, results) {
    console.log(JSON.stringify(results, null, 2));
  });
}

/** Parse IPMI Lan Info.
* Return ke-value Object with current LAN settings.
* @param lanstr {string} - Output of `ipmitool lan print`
* @return key-value Object with LAN settings
* @todo Improve parsing on weirdly or inconsistently formatted fields (with nested values, e.g. 'Auth Type Enable', 'Cipher Suite Priv Max'). Luckily these are less frequently used, less useful.
* @todo: Allow option for condensed short keys (taken from the set-parameters of IPMI tool.
*/
function lan_parse(lanstr, opts) {
  if (!lanstr) { return null; }
  var lines = lanstr.split(/\n/).filter(function (l) {return l; });
  // map() ? reduce() ?
  var lan = {};
  var prevk = '';
  lines.forEach(function (l) {
    // Note: Split stops 
    var kv = l.split(/:\s+/);
    if (kv.length > 2) { kv[1] = kv.slice(1).join(":"); }
    // console.log("k: '" + kv[0] + "', v:'" + kv[1] + "'");
    var v = kv[1].trim();
    var k = kv[0].trim();
    if (!k) { lan[prevk] += " " + v; k = prevk; }
    else { lan[k] = v; }
    prevk = k;
  });
  // Transform to short keys (used also by ipmitool in set commands)
  // if (opts && opts.shortkeys) { ... }
  // NOTHERE: if (opts.dnsname) {}
  return lan;
}
/** Resolve IPMI LANInfo hostname from ip address.
* Uses field "ipaddr" (Orig field 'IP Address') as IP address param to resolve.
* Sets member "rmhname" (for "remote management hostname") in the object passed to it.
* Not errors in resolution are never signaled to cb as error, but the absence of "rmhname"
* will indicate DNS resolution could not be made.
* @param ent {object) - Remote management Info object (with short attributes: ...).
* @param cb {function} - Callback to call (with original ent as param) after name resolution (err,data).
*/
function lan_hostname(ent, cb) {
  
  var ipaddr = ent["ipaddr"]; // ent["IP Address"];
  ent.rmhname = ""; // Keep N/A out
  if (!ipaddr) {  return cb(null, ent); } // ent.rmhname = "N/A";
  dns.reverse(ipaddr, function (err, domains) {
    if (err) {   } // return cb(null, ""); // ent.rmhname = "N/A(err)";
    else { ent.rmhname = domains[0]; } // Add resolved name
    cb(null, ent); // domains[0]
  });
}

/** Parse the results of IPMI user listing output.
* output usually has a fixed number of "user-slots" (e.g. 16), where most of accounts are
* unused and without username. These empty accounts will be detected and stripped out,
* however the ID:s of the accounts are preserved as-is (i.e. NOT renumbered).
* @param userliststr {string} - Userlist string as output by ipmitool
* @return Array of Objects for IPMI User accounts with trailing "empty" accounts stripped out.
*/
function users_parse(userliststr, opts) {
  // Original headers, Verbatim
  var attrs = ["ID","Name","Callin","Link Auth","IPMI Msg","Channel Priv Limit"]; // "Limit" ?
  var attrs2 = ["ID","Name","Callin","Link_Auth","IPMI_Msg","Channel_Priv_Limit"];
  var users = userliststr.split(/\n/).filter(function (l) {return l; });
  // NOTE: Headers have misc tabs (\t) ! Would need to do compicated tab expansion to use this.
  // var offs = attrs.map(function (at) { return users[0].indexOf(at); });
  var offs = [0, 4, 21, 29, 40, 51, 100]; // Sampled from output
  offs.push(100); // Safe beyond last field offset
  //console.log(offs);
  //console.log(users);
  var userlist = [];
  var hdr = users.shift();
  users.forEach(function (l) {
    var i = 0;
    var user = {};
    attrs2.forEach(function (at) {
      user[at] = l.slice(offs[i], offs[i+1]-1);
      user[at] = user[at].trim();
      i++;
    });
    userlist.push(user);
  });
  // Filter empty accounts from tail
  for (var i = (userlist.length-1);!userlist[i].Name;i--) { userlist.pop(); }
  return userlist;
}
/** Check merely that remote management info exists.
 * This does merely statting, no files are accessed for parsing.
 * @param hn {string} - Host name
 * @param rmgmtpath {string} - Path for IPMI files
 */
function rmgmt_exists(hn, rmgmtpath) {
  var debug = 1;
  if (!rmgmtpath) { rmgmtpath = process.env["RMGMT_PATH"]; }
  if (!rmgmtpath) { debug && console.log("No rmgmtpath as para or env."); return 0; }
  if (!fs.existsSync(rmgmtpath)) { debug && console.log("No rmgmtpath found on FS."); return 0; }
  var haslan = fs.existsSync(rmgmtpath + "/" +hn+ ".lan.txt");
  var hasusr = fs.existsSync(rmgmtpath + "/" +hn+ ".users.txt");
  if (haslan && hasusr) { return 1; }
  debug && console.log("Warning: rmgmt info: haslan = "+haslan+", hasuser = "+hasusr);
  return 0;
}
/** Load all available rmgmt info (lan info, users info).
 * Returns as-minimum a dummy record with member "hname" for hosts that do NOT have remote
 * management info collected.
 * @param f {object} - Host facts (for ansible_fqdn).
 * @param rmgmtpath {string} - Path where rmgmt (ipmi) info is stored.
 * @return single host-specific rmgmt entity.
 */
function rmgmt_load(f, rmgmtpath) { // cb
  var hn = f.ansible_fqdn;
  if (!rmgmtpath) { rmgmtpath = process.env["RMGMT_PATH"]; }
  var ent_dummy = { hname: f.ansible_fqdn, "ipaddr": "" }; // Dummy stub
  var fn = rmgmtpath + "/" + hn + ".lan.txt";
  if (!fs.existsSync(fn)) { return (ent_dummy); } // dummy_add
  var cont = fs.readFileSync(fn, 'utf8');
  if (!cont || !cont.length) { return (ent_dummy); } // dummy_add
  fn = rmgmtpath + "/" + hn + ".users.txt";
  if (!fs.existsSync(fn)) { return (ent_dummy); } // dummy_add
  var cont2 = fs.readFileSync(fn, 'utf8');
  if (!cont2 || !cont2.length) { return (ent_dummy); } // dummy_add
  var lan   = lan_parse(cont);
  var users = users_parse(cont2);
  var ulist = "";
  if (users && Array.isArray(users)) {
    // TODO: it.Name + "(" + it.ID + ")" (REVERSE map,filer order)
    //ulist = users.map(function (it) {return it.Name;}).filter(function (it) { return it; }).join(',');
    ulist = users.filter(function (it) {return it.Name;}).map(function (it) {return it.Name + "(" + it.ID + ")";}).join(',');
  }
  var ent = {hname: hn, ipaddr: lan['IP Address'], macaddr: lan['MAC Address'],
    ipaddrtype: lan['IP Address Source'], gateway: lan['Default Gateway IP'],
    users: users,
    ulist: ulist
  };
  //if (!cb) {
  //arr.push(ent);
  //}
  //return cb(ent);
  return ent;
}
/** Formulate IPMI remote command with host
 * @param hname {string} - Hostname
 * @param ipmicmd {string} - IPMI command without "remote" params (e.g. "chassis bootdev pxe" or "")
 */
/////////////////////////// IPMI ("power" options: on,off,cycle,soft) ///////////////////
  // No possibility to boot PXE on next boot ?
  // https://ma.ttwagner.com/ipmi-trick-set-the-boot-device/ (IBM)
  // https://www.dell.com/community/PowerEdge-Hardware-General/Set-up-boot-method-using-IPMI/td-p/3775936 - Dell
  // https://community.pivotal.io/s/article/How-to-work-on-IPMI-and-IPMITOOL?language=en_US
  //
  // " chassis bootdev pxe" // For the next boot (only, unless options=persistent option given) IBM
  // "chassis bootparam set bootflag pxe" - Dell ?
function ipmi_cmd(f, ipmicmd, global, opts) {
  var Mustache = require("mustache");
  // load IPMI info
  var ent = rmgmt_load(f);
  console.log(ent);
  if (!ent || !ent.ipaddr) { console.log("No ipmi info or ipdaar. Can't formulate command"); return ""; }
  var rmgmt = global.ipmi || {};
  // Use ipmitool -h to see values for -I option (open,imb,lan,lanplus)
  // -L user -L administrator
  var cmdtmpl = "ipmitool —I lanplus -H {{ bmcaddr }} -U {{{ user }}} -P {{{ pass }}}  "; // power {{ powopt }}
  var p = { user: rmgmt.user, pass: rmgmt.pass, bmcaddr: ent.ipaddr };
  var ipmifullcmd = Mustache.render(cmdtmpl, p);
  // https://www.dell.com/community/Systems-Management-General/IPMITool-Commands-Not-Working-When-Using-Encryption-Key/td-p/4485338
  // -x hexadecimal key (-k - normal "clear" key)
  // Ubuntu IPMI tool says to ue -y (not -x)
  if (rmgmt.enckey ) { ipmifullcmd += " -x " +rmgmt.enckey+" "; }
  ipmifullcmd += ipmicmd;
  return ipmifullcmd;
  // Enable IPMI Over LAN: Enabled
  // IP Blocking enabled: Disabled
  // Encryption Key: 0000000000000000000000000000000000000000 (40 x)
}
/* Google: Get Session Challenge command failed
 * https://admin-log.net/index.php/2016/07/17/ipmitool-stopped-working-on-dell-idrac-over-lan/
 * https://serverfault.com/questions/424192/ipmi-cant-ping-or-remotely-connect
 */
module.exports = {
  init: init,
  hosts_rmgmt_info: hosts_rmgmt_info,
  lan_parse: lan_parse,
  users_parse: users_parse,
  lan_hostname: lan_hostname,
  rmgmt_exists: rmgmt_exists,
  rmgmt_load: rmgmt_load,
  ipmi_cmd: ipmi_cmd
};
