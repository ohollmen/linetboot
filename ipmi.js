/** Module to expose some of the ipmi extractable info.
* - LAN Info
* - TODO: Accounts. Start allowing changing settings.
*/
var fs = require('fs');
var ssh = require("node-ssh");
var async = require("async");

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
if (process.argv[1].match(/\bipmi\b/)) {
  lan_test();
  users_test();
}
/** Get remote management info for the hosts
*/
function hosts_rmgmt_info(hlist, sshpara) {
  sshpara = sshpara || {};
  // host,username, privateKey
  if (!sshpara) { throw "Need SSH params"; }
  if (!sshpara.privateKey) {
    sshpara.privateKey = "/home/"+process.env["USER"]+"/.ssh/id_rsa";
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
        var lan = ipmi_lan_parse(result); // result.stdout
	cb(lan);
      });
    });
  }
  // async.map(hlist, host_rm_info, function () {});
}

/** Parse IPMI Lan Info.
* Return ke-value Object with current LAN settings.
* @param Output of `ipmitool lan print`
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
  return lan;
}
/** Parse the results of IPMI User Listing.
* @param userlist {string} - Userlist string as output by ipmitool
* @return Array of Objects for IPMI User accounts with trailing "empty" accounts stripped out.
*/
function users_parse(userlist, opts) {
  // Original headers, Verbatim
  var attrs = ["ID","Name","Callin","Link Auth","IPMI Msg","Channel Priv Limit"]; // "Limit" ?
  var attrs2 = ["ID","Name","Callin","Link_Auth","IPMI_Msg","Channel_Priv_Limit"];
  var users = userlist.split(/\n/).filter(function (l) {return l; });
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

module.exports = {
  hosts_rmgmt_info: hosts_rmgmt_info,
  lan_parse: lan_parse,
  users_parse: users_parse
};
