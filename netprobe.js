/** @file
 * 
 * # Various Linetboot over-the network probing and real-time monitoring operations.
 * 
 * Network reachability test:
 * - Ping Host to check host is alive (w. network interface up)
 * - Lookup host by IP and check DNS name (matching host inventory name)
 * - SSH Onto host programmatically (Using public/private key auth) to see host is accessible
 * Host Load and uptime test:
 * - See 1, 5 and 15 minute CPU loads
 * - Show uptime and number of logged-in users
 */
var dns  = require("dns");
var ping = require('ping');
// Disable 'node-arp' because of pkg manager level (dependency) incompat with node-ssh (Causes mutual
// uninstall between node-ssh and node-arp, yet manual install (on remote dir) allows linetboot to run fine)
// var arp = require('node-arp'); // pref. over arpjs (dep on libpcap)
// var snmp = require ("net-snmp");
// https://github.com/steelbrain/node-ssh (promises based)
// Also: https://github.com/mscdex/ssh2 (More popular)
var node_ssh = require('node-ssh');
var ssh2  = require('ssh2'); // .Client;
var fs    = require('fs');
var async = require("async");
var ipmi  = require("./ipmi.js"); // IPMI !!!!
var hlr      = require("./hostloader.js"); // NEW (for hostparams)
var servers;
var resolver;
//const resolver = new Resolver();
// resolver.setServers([]);
var dnsopts = {};
var inited = 0;
var ssh = new node_ssh();
//NOT HERE: var ssh2Client = ssh2.client();
var pkey;
var pubkey;
var selfmac; // Discover own mac (for better report, where self would have mac error)
var tout;
var opts = {tout: 0, debug: 0};
var debugarr = []; // Like async results
function privkey() { return pkey; }
function pubkey() { return pubkey; }
/**
*/
function init(popts) {
  if (inited) { return; }
  inited++;
  popts = popts || {};
  // MUST read in utf8 (to not get a binary buffer)
  pkey   = fs.readFileSync(process.env['HOME']+'/.ssh/id_rsa', 'utf8');
  pubkey = fs.readFileSync(process.env['HOME']+'/.ssh/id_rsa.pub', 'utf8');
  if (!pkey || !pubkey) { console.log("Warning: Linetboot should have SSH keys to interact effectively during installation.");}
  // pkey = process.env['HOME']+'/.ssh/id_rsa';
  servers = popts.dns ? popts.dns : dns.getServers();
  //resolver.setServers([]);
  // require('os').networkInterfaces() // [{mac: ...},{mac:...},...]
  if (popts.tout) { tout = opts.tout = popts.tout; }
  if (popts.debug) { opts.debug = popts.debug; }
}
/** Probe Network connectivity and setup on single host (DNS, Ping, SSH).
 * The checks *must* be run in sequence as following steps are dependent on the earlier (e.g. host must be pinable to SSH in).
* @todo Convert the sequence to async.series, call netresolve or netprobe
*/
function resolve(hnode, cb) {
  cb = cb || function () {};
  if ((typeof hnode == 'string') || (typeof hnode != 'object')) { return cb("", null); }
  var hn = hnode.ansible_fqdn;
  var ip_org = hnode.ansible_default_ipv4.address;
  var mac_org = hnode.ansible_default_ipv4.macaddress;
  var prec = {hname: hn, ip: ip_org, ipok: 0, nameok: 0, macok: 0}; // probe record
  var pingcfg = {timeout: 10};
  // TODO: Pull from module config
  var sshcfg = {host: hn, username: process.env['USER'], privateKey: pkey};
  var sshcmd = "uptime";
  if (typeof cb != 'function') { throw "resolve: cb is not a function !"; }
  // dns module: resolve4, resolveAny, resolveCname
  // Note: None of the cb() or promise calls should fail (even if check fails). The calls should *ONLY*
  // set statistics on various probe stages (ipok, nameok, sshconn) in prec
  dns.resolveAny(hn, dnsopts, function (err, addrs) {
    if (err) { console.log("Resolution error: " + err); return cb(null, prec); }
    console.log("IPv4 Addresses: ", addrs);
    if (addrs[0].address == ip_org) { prec.ipok = 1; }
    prec.addrs = addrs; // Results of resolveAny()
    // Fix: Limit addrs always to max 1 item.
    if (addrs.length > 1) { console.log("Warn: multi-rec ("+addrs.length+") for "+hn); addrs = [addrs[0]]; }
    // This forEach() (for multiple addr records) could cause "Callback was already called" (understandably)
    addrs.forEach(function (rec) {
      // Note: For 'CNAME' Recs rec.value contains name
      // Avoid: The "name" argument must be of type string. Received type undefined
      var ipaddr = rec.address || ip_org; // rec.value; // Skip IPv6 ?
      dns.reverse(ipaddr, function (err, domains) {
        if (err) { console.log("Reverse Resolution error: " + err); return cb(null, prec); }
        if (domains[0] == hn) { prec.nameok = 1; }
        console.log("Reverse result ("+ipaddr+"): " + JSON.stringify(domains));
        // Note: Linetboot host itself does not resolve. Implement self-check differentiation !
        //arp.getMAC(ipaddr, function(err, mac) {
        //  if (err) { console.log("No ARP response for "+ ipaddr); return cb(null, prec); }
        //  prec.macok = 1; // mac; // mac rdundant
        //  
        ping.sys.probe(ipaddr, function (isok) {
          prec.ping = isok;
          if (! isok) { console.log("Ping fail: "+ipaddr); return cb(null, prec); } // No use connecting, but not error. Error: Callback was already called.
          // Host still registered in inventory, but SSH does not work (or may block)
          var p = hlr.hostparams(hn);
          // sshconn = 2 => Skipped
          if (p && p.nossh) { prec.nossh = 1; prec.sshconn = 2; console.log("Skipping SSH ("+hn+") !!!"); return cb(null, prec); }
          // console.log(sshcfg);
          ssh.connect(sshcfg).then(function () {
            prec.sshconn = 1;
            // result with .stdout, .stderr
            // NOTE: This is only successful on volatile basis ! Not concurrency proof ?
            //ssh.execCommand(sshcmd, {cwd: "/"}).then(function (result) {
            //  prec.sshrunok = 1; // result.stdout;
            return cb(null, prec); // Final Success
          //}).catch(function () { console.log("Run error: " + hn);return cb(null, prec); });
          }).catch(function (err) {
            console.log("SSH Conn. Err: " + err);
            prec.ssherr = err.toString();
            return cb(null, prec);
          });
          
          //return cb(null, prec);
          
        }, pingcfg); // ping
        // return cb(null, prec); // NOT: ret arp Error: Callback was already called.
      // }); // arp
      });
    });
  });
}
// Local consultancy (may involve cache)
function lookup(hn) {
  hn = 'iana.org';
  hn = "google.com";
  dns.lookup(hn, function (err, address, family) {
    console.log('address: "%s" family: "%s"', address, family);
  });
}
//var servers = dns.getServers();
//console.log("DNS Servers:", servers);
//resolve(hn);
//lookup(hn);
//dns.lookupService('127.0.0.1', 22, (err, hostname, service) => {
//  console.log(hostname, service);
//  // Prints: localhost ssh
//});
//ping.sys.probe("nuc5", function (isok) {
//  console.log("nuc5: ok = " + isok);
//});

//NONEED:function resolve_host() {}

/** Perform a network or process/load based probing on set of hosts.
 * Hosts are passed in host facts array 
 * @param harr {array} - Array of host-facts
 * @param usecase {string} - String form tag/label for the kind of probing wanted ("net","proc")
 * @return Return none, but call the callback cb with probing results.
 */
function probe_all(harr, usecase, cb) {
  var msg = "";
  var callable = resolve;
  // var cbs = {"net": resolve, "proc": stats_proc};
  // callable = cbc[usecase];
  // if (!callable) { return cb("Processing not found for "+usecase, null); }
  if (usecase == "proc") { callable = stats_proc; }
  debugarr = [];
  // Only on debug:
  opts.debug && setTimeout(function () {
    console.log("Dump "+debugarr.length+" hosts:\n"+JSON.stringify(debugarr, null, 2));
    var idx = {};
    debugarr.map((it) => { idx[it.hname] = it; });
    console.log("Missing (if any):"); let i = 0;
    harr.forEach((it) => { if (!idx[it.ansible_fqdn]) { console.log(it.ansible_fqdn); i++; } });
    console.log("Done reporting Missing ("+i+")");
  }, 30000);
  console.log("Probe (type:"+usecase+") on "+harr.length+" hosts");
  async.map(harr, callable, function(err, results) {
    if (err) { return cb("Error probing hosts: " + err, null); }
    //console.log(JSON.stringify(results)); /// Dump !
    cb(null, results);
  });
}
/** OLD node-ssh based Non-working version of. "Not connected to server" at execCommand
 * Deprecated. See: stats_proc()
 */
function stats_proc_0(hnode, cb) {
  var cmd = "/bin/ps -ef | /usr/bin/wc -l";
  var prec = {"pcnt": -1};
  var hn = hnode.ansible_fqdn;
  // Compat w. node-ssh (port?) and ssh2
  var sshcfg = {host: hn, username: process.env['USER'], privateKey: pkey, port: 22};
  if (!pkey) { console.log("No pkey !"); return cb("No pkey", null); }
  console.log("Starting to connect " + hn);
  ssh.connect(sshcfg).then(function () {
    // Not concurrency proof
    ssh.execCommand(cmd, {cwd: "/"}).then(function (result) { // 
      prec.pcnt = parseInt(result.stdout);
      return cb(null, prec);
    }, //)
    //.catch(
    function (err) {
      
      prec.ssherr = err.toString();
      console.log("SSH Cmd Run error: " + hn + " - " + prec.ssherr);
      return cb(null, prec);
    });
  }, //)
  //.catch(
  function (err) {
    
    prec.ssherr = err.toString();
    console.log("SSH Conn. Err: " + hn +" - "+ prec.ssherr);
    return cb(null, prec);
  });
}
/** Parse output of command "w"
* Lines of w:
* - 1: Similar (identical) to utime
* - 2: Headers for user stats
* - 3...N Lines for logged-in users
* Sample(uptime): 21:35:10 up 1 day, 12 min,  1 user,  load average: 0.24, 0.37, 0.37
*/
function parse_w(str, o) {
  //o.uptime = str; // Simple Processing
  // w: var lines = str.split("\n");
  //if (m = str.match(/(\d+)\s+users?/)) { o.numusers = parseInt(m[1]); }
  var arr = str.split(/,\s+load average:\s+/);
  o.uptime = arr[0];
  o.loads = arr[1];
  if (o.uptime) { o.uptime = o.uptime.replace(/^\s+\d{2}:\d{2}:\d{2}\s+up/, ""); }
  o.loadsarr = o.loads.split(/,/);
}
// Parse output of ps -ef | wc -l - Basically simple integer.
function parse_pcnt(str, o) {
  o.pcnt = parseInt(str);
}
/** Detect load and uptime on the remote server (ssh2 based version).
 * @param hnode {object} - Ansible facts (?) w. ansible_fqdn
 * @param cb {function} - callback signal hook for using with async
 * Notes: conn-ready does not receive params (would benefit out of conn).
 */
function stats_proc(hnode, cb) {
  // var cmd = "/bin/ps -ef | /usr/bin/wc -l";
  var hn = hnode.ansible_fqdn;
  var prec = {"hname": hn, "pcnt": -1};
  // readyTimeout
  var sshcfg = {host: hn, username: process.env['USER'], privateKey: pkey, port: 22};
  if (tout) { sshcfg.readyTimeout =  tout; }
  if (!pkey) { console.log("No pkey !"); prec.ssherr = "No pkey"; return cb(null, prec); }
  //console.log("Starting to connect to: " + hn);
  var oparams = [
    {id: "upt", cmd: "uptime", pcb: parse_w}, // uptime or w
    {id: "pcnt", cmd: "ps -ef | wc -l", pcb: parse_pcnt},
  ];
  // Detect presence of rmgmt. TODO: Move out of ipmi.js ?
  prec.hasrm = ipmi.rmgmt_exists(hnode.ansible_fqdn, process.env["RMGMT_PATH"]);
  function additem(prec) { debugarr.push(prec); return prec; }
  async.map(oparams, runprobecmd, function(err, results) {
    if (err) { var cerr = "Error completing async.map: " + err; console.log(cerr); return cb(cerr); }
    return cb(null, prec);
  });
  //runprobecmd(oparams[0], cb);
  // Function context constants: hn, prec
  // Props to pass (as objs): id: "", cmd: "", prop: "", pcb: (str, obj) => {}
  // 
  function runprobecmd(cfg, cb) {
    var conn = new ssh2.Client();
    conn.on('ready', function() { // After succesful auth
      console.log('conn-ready on ' + hn + "(" +cfg.id+ ")");
      conn.exec(cfg.cmd, function(err, stream) {
        if (err) { prec.ssherr = "Exec Err:" + err; return cb(null, additem(prec)); }
        stream.on('close', function(code, signal) {
          // signal seems to be ~always undefined ', signal=' + signal +
          console.log('stream-close: ' +hn+ ' (code=' + code +  ', tout=' +tout+')');
          //conn.end(); // Was enabled. Got : Cannot call write after a stream was destroyed Error: Callback was already called.
        })
        .on('end', function () { conn.end(); return cb(null, additem(prec)); }) // NEW (move conn.end() here)
        .on('data', function on_data_uptime(data) {
          //console.log('stream-data('+cfg.id+'): ' + data); // Buffer
          //OLD: prec[cfg.prop] = data.toString(); // parseInt(data);
          cfg.pcb(data.toString(), prec);
          //return cb(null, prec); // Long time loc
        }); // .stderr.on('data', function(data) { console.log('STDERR: ' + data); });
      });
    });
    // Note: this cb cannot be placed to outer scope (and call cb, cause that would be outer scopes cb)
    // ... w/o getting Error: Callback was already called.
    conn.on('error', function on_conn_error(err) {
      prec.ssherr = "conn-error: "+hn+": " + err.toString();
      console.log(prec.ssherr);
      // HERE ?
      conn.end(); // or does close/end event still take place ?
      return cb(null, additem(prec)); // long time loc. "Callback was already called." (BUGS.md)
    });
    conn.on('end', function () {
      console.log("conn-end:   "+hn+'('+cfg.id+')');
      //return cb(null, prec); // Recent try (jam)
    });
    // {host: hn,port: 22,username: process.env['USER'],privateKey: pkey}
    conn.connect(sshcfg);
  }
  // Universal conn error handler
  
}
//stream.on('error', function(err) {
      //  console.log("Client stream error ("+hn+"): " + err.toString());
      //  return cb(err, prec);
      //});
////// Host-up functionality ///////





module.exports = {
  privkey: privkey,
  pubkey: pubkey,
  init: init,
  probe_all: probe_all,
  stats_proc: stats_proc
  //resolve: resolve,
  //diff: diff
};
