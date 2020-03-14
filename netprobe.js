var dns = require("dns");
var ping = require('ping');
// Disable 'node-arp' because of pkg manager level (dependency) incompat with node-ssh (Causes mutual
// uninstall between node-ssh and node-arp, yet manual install (on remote dir) allows linetboot to run fine)
// var arp = require('node-arp'); // pref. over arpjs (dep on libpcap)
// var snmp = require ("net-snmp");
var node_ssh = require('node-ssh');
var fs    = require('fs');
var async = require("async");
var servers;
var resolver;
//const resolver = new Resolver();
// resolver.setServers([]);
var dnsopts = {};
var inited = 0;
var ssh = new node_ssh();
var pkey;
var selfmac; // Discover own mac (for better report, where self would have mac error)
/**
*/
function init(opts) {
  if (inited) { return; }
  inited++;
  opts = opts || {};
  // MUST read in utf8 (to not get a binary buffer)
  pkey = fs.readFileSync(process.env['HOME']+'/.ssh/id_rsa', 'utf8');
  // pkey = process.env['HOME']+'/.ssh/id_rsa';
  servers = opts.dns ? opts.dns : dns.getServers();
  //resolver.setServers([]);
  // require('os').networkInterfaces() // [{mac: ...},{mac:...},...]
  
}
/** Resolve single host in DNS.
* @todo Convert to async.series
*/
function resolve(hnode, cb) {
  cb = cb || function () {};
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
  // Note: None of the cb() or promise calls should. The calls should *ONLY*
  // set statistics on various probe stages (ipok, nameok, sshconn) in prec
  dns.resolveAny(hn, dnsopts, function (err, addrs) {
    if (err) { console.log("Resolution error: " + err); return cb(null, prec); }
    console.log("IPv4 Addresses: ", addrs);
    if (addrs[0].address == ip_org) { prec.ipok = 1; }
    prec.addrs = addrs; // Results of resolveAny()
    addrs.forEach(function (rec) {
      // Note: For 'CNAME' Recs rec.value contains name
      // Avoid: The "name" argument must be of type string. Received type undefined
      var ipaddr = rec.address || ip_org; // rec.value; // Skip IPv6 ?
      dns.reverse(ipaddr, function (err, domains) {
        if (err) { console.log("Reverse Resolution error: " + err); return cb(null, prec); }
	if (domains[0] == hn) { prec.nameok = 1;}
        console.log("Reverse result: " + JSON.stringify(domains));
	// Note: Lineboot host itself does not resolve. Implement self-check differentiation !
	//arp.getMAC(ipaddr, function(err, mac) {
	//  if (err) { console.log("No ARP response for "+ ipaddr); return cb(null, prec); }
	//  prec.macok = 1; // mac; // mac rdundant
	//  
	ping.sys.probe(ipaddr, function (isok) {
	  prec.ping = isok;
	  if (! isok) { return cb(null, prec); } // No use connecting, but not error
	  // console.log(sshcfg);
	  ssh.connect(sshcfg).then(function () {
	    prec.sshconn = 1;
	    // result with .stdout, .stderr
	    // NOTE: This is only successful on volatile basis !
	    //ssh.execCommand(sshcmd, {cwd: "/"}).then(function (result) {
	    //  prec.sshrunok = 1; // result.stdout;
	      return cb(null, prec); // Success
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

function probe_all(harr, cb) {
  var msg = "";
  var callable = resolve;
  async.map(harr, resolve, function(err, results) {
    if (err) { return cb("Error resolving hosts: " + err); }
    console.log(JSON.stringify(results));
    cb(results);
  });
}

function stats_proc(hnode, cb) {
  var cmd = "ps -ef | wc -l";
  ssh.connect(sshcfg).then(function () {
    ////ssh.execCommand(sshcmd, {cwd: "/"}).then(function (result) {
    return cb(null, prec);
    //}).catch(function () { console.log("Run error: " + hn);return cb(null, prec); });
  }).catch(function (err) {
    console.log("SSH Conn. Err: " + err);
    prec.ssherr = err.toString();
    return cb(null, prec);
  });
}

module.exports = {
  init: init,
  probe_all: probe_all,
  //resolve: resolve,
  //diff: diff
};
