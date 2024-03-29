#!/usr/bin/node
/** Grab ESXi Host network information after having extracted
* the facts for it.
* 
* # Examples
* ```
* ## netinfo (read-only / dryrun)
* esxi_host_prep.js netinfo myhost
* ## netinfo + merge (using piping)
* # In first myhost means hostname
* # Dry-run, review JSON output
* esxi_host_prep.js netinfo myhost | esxi_host_prep.js merge ~/hostinfo/myhost
* # Overwrite a file
* esxi_host_prep.js netinfo myhost | esxi_host_prep.js merge ~/hostinfo/myhost > ~/hostinfo/myhost.new
* ```
* References
* - Dealing with stdin in Node.js: https://stackoverflow.com/questions/20086849/how-to-read-from-stdin-line-by-line-in-node
*/
var cproc = require("child_process");
var fs = require("fs");
var dns = require("dns");
// Translation map (ESXi => ansible)
var atmap = {
  "Name": "interface", // aka alias
  "MTU": "mtu",
  'MAC Address': "macaddress",
};


//var cont = fs.readFileSync("./esxi_net_sample.txt", 'utf8');
//var net = parse_net(cont); // console.log(net); // process.exit(0);
var net = {};


function make_netinfo() {
  var hname = process.argv[3]; // OLD: 2
  if (!hname) { usage("Pass ESXi hostname as first arg."); }

  // Check host in DNS ?
  // Other cmds: esxcfg-route, esxcli network ip route ipv4 list
  var cmd = "ssh root@"+hname+" esxcli network ip interface list";
  cproc.exec(cmd, (err, stdout, stderr) => {
    if (err) { usage("No network info from "+hname+": "+ err); }
    console.error("STD-SOME:"+stderr);
    net = parse_net(stdout);
    var dnsopts = {};
    dns.resolveAny(hname, dnsopts, function (err, addrs) {
      if (err) { usage("Could not resolve "+hname+": "+err); }
      if (!Array.isArray(addrs)) { usage("DNS res not in array"); }
      if (addrs.length > 1) { usage("More than 1 address\n"); }
      var addr = addrs[0];
      net.address = addr.address;
      //console.log(addr.address);
      var olay = {ansible_fqdn: hname, ansible_default_ipv4: net};
      console.log(JSON.stringify(olay, null, 2));
    });
  });
}
function usage(msg) {
  if (msg) { console.error(msg+"\n"); }
  console.error("Sub-commands: "+Object.keys(ops));
  process.exit(1);
}

function parse_net(cont) {
  var lines = cont.split(/\n/);
  lines = lines.map((l) => { return l.trim();});
  lines.shift();
  //console.log(lines);
  var net = {};
  lines.forEach((l) => {
    var kv = [];
    //kv = l.split(/:\s*/, 10); // Does not work on MAC ...
    var m; 
    if (m = l.match(/([\ \w]+):\s*(.+)$/)) {
      kv[0] = m[1];
      kv[1] = m[2];
    }
    else { return; }
    //console.log("Got: "+kv[0]+" / "+kv[1]);
    //console.log(atmap);
    var aname = atmap[kv[0]];
    if (!aname) { return; }
    //net[kv[0]] = kv[1];
    net[aname] = kv[1];
  });
  
  if (net.interface) { net.alias = net.interface; }
  return net;
}
// Merge stdin into a named JSON file (MUST be parseable JSON)
function json_merge() {
  var fname = process.argv[3];
  if (!fs.existsSync(fname)) { usage("File "+fname+" does not exist"); }
  var j;
  try {
    // j = require(fname); // Does not for for files w/o .json
    var cont = fs.readFileSync(fname, 'utf8');
    j = JSON.parse(cont);
  }
  catch(ex) { usage("Error parsing JSON  ("+fname+"): "+ex); }
  if (!j) { usage("Error parsing JSON ("+fname+"), did hot get DS-handle"); }
  //var fs = require("fs");
  //var stdinBuffer = fs.readFileSync(0); // STDIN_FILENO = 0
  //var incont = stdinBuffer.toString();
  //console.log(incont);
  // require('split')() // was passsed to stdin.pipe()
  var sidata = "";
  console.error("Reading STDIN (if any)\n");
  var jin; // Declare here to have avail in --save block
  var newcont;
  process.stdin.on('data', (l) => {sidata += l; }).on("end", () => {
    console.error("Got: "+sidata);
    jin = JSON.parse(sidata);
    if (!jin) { usage("No Proper JSON from STDIN!"); }
    console.error(JSON.stringify(jin, null, 2));
    
    // Merge
    merge(jin, j);
    newcont = JSON.stringify(j, null, 2);
    console.log(newcont);
    if (process.argv.includes("--save")) {
      console.error("Save to '"+fname+"'");
      // JSON.stringify(j, null, 2)
      fs.writeFileSync( fname, newcont, {encoding: "utf8"} );
    }

  });

  // Patch / merge. Internally use branch j.ansible_facts
  function merge(jin, j) {
    if (j.ansible_facts) { j = j.ansible_facts; }
    Object.keys(jin).forEach((k) => {
      // if (j[k]) { usage("Key "+k+" already in target JSON."); }
      console.error("Merging "+k);
      j[k] = jin[k];
    });
  }
  //console.log(JSON.stringify(j, null, 2));
  //function processLine (line) {
  //  console.log(line + '!')
  //}
}
var ops = {netinfo: make_netinfo, merge: json_merge};
var argv2 = process.argv.slice(2);
var op = argv2.shift();
if (!ops[op]) { usage("No such op: "+op); }

//make_netinfo();
ops[op]();
