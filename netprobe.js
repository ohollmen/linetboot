var dns = require("dns");
var ping = require('ping');
// var snmp = require ("net-snmp");
var node_ssh = require('node-ssh');
var fs = require('fs');
var async = require("async");
var servers;
var resolver;
//const resolver = new Resolver();
// resolver.setServers([]);
var dnsopts = {};
var inited = 0;
var ssh = new node_ssh();
var pkey;
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
  
}
/** Resolve single host in DNS
*/
function resolve(hnode, cb) {
  cb = cb || function () {};
  var hn = hnode.ansible_fqdn;
  var ip_org = hnode.ansible_default_ipv4.address;
  var prec = {hn: hn, ip: ip_org, ipok: 0, nameok: 0}; // probe record
  var pingcfg = {timeout: 10};
  // TODO: Pull from module config
  var sshcfg = {host: hn, username: process.env['USER'], privateKey: pkey};
  var sshcmd = "uptime";
  if (typeof cb != 'function') { throw "resolve: cb is not a function !"; }
  // resolve4, resolveAny, resolveCname
  dns.resolveAny(hn, dnsopts, function (err, addrs) {
    if (err) { console.log("Resolution error: " + err); return cb(); }
    console.log("IPv4 Addresses: ", addrs);
    if (addrs[0].address == ip_org) { prec.ipok = 1; }
    prec.addrs = addrs; // Results of resolveAny()
    addrs.forEach(function (rec) {
      var ipaddr = rec.address; // Skip IPv6 ?
      dns.reverse(ipaddr, function (err, domains) {
        if (err) { console.log("Reverse Resolution error: " + err); return cb(); }
	if (domains[0] == hn) { prec.nameok = 1;}
        console.log("Reverse: " + JSON.stringify(domains));
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
	  }).catch(function () { return cb(null, prec); });
	  
	  //return cb(null, prec);
	  
	}, pingcfg);
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
  async.map(harr, resolve, function(err, results) {
    if (err) { return cb("Error resolving hosts: " + err); }
    //res.json({status: "ok", data: results});
    console.log(JSON.stringify(results));
    cb(results);
  });
}
module.exports = {
  init: init,
  probe_all: probe_all,
  //resolve: resolve,
  //diff: diff
};
