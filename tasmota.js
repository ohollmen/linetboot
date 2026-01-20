/** @file
* Inquire and display status information from Tasmota device.
* The device seems to go to sleep state and may not respond to queries.
* Curioisity queries:
* - how do I get tasmota status information similar to info gotten with "status 0" in console via http api ?
* - what is the logic of tasmota (ESP) firmware of going to sleep and with what logic will tasmota wake up ?
*/
let fs = require("fs");
let async = require("async");
let axios = require("axios");
// let mqtt = require("mqtt"); // Couple with browser client: paho-mqtt ?
let cfn = `${process.env.HOME}/.linetboot/tasmota.conf.txt`;
let ips = [];
// Tasmota status keys for numeric 0..11 (0=All, completely different structure)
// Note: 8 and 10 seem to be same ?
let skeys = [
  //  0..5 { "key": },
  { "sid": 0, "key": "Status", "name": "All", },
  { "sid": 1, "key": "StatusPRM", "name": "Device Params", },
  { "sid": 2, "key": "StatusFWR", "name": "Firmware", },
  { "sid": 3, "key": "StatusLOG", "name": "Logging and Telemetry", },
  { "sid": 4, "key": "StatusMEM", "name": "Memory", },
  { "sid": 5, "key": "StatusNET", "name": "Network", },
  // 6-11
  { "sid": 6, "key": "StatusMQT", "name": "MQTT", },
  { "sid": 7, "key": "StatusTIM", "name": "Time", },
  { "sid": 8, "key": "StatusSNS", "name": "Sensors(Legacy)", },
  { "sid": 9, "key": "StatusPTH", "name": "Power Thresholds", },
  { "sid": 10, "key": "StatusSNS", "name": "Sensors", },
  { "sid": 11, "key": "StatusSTS", "name": "General/TelePeriod", },
];
function init() {
  if (!fs.existsSync(cfn)) { return null; }
  var cont = fs.readFileSync(cfn, 'utf8');
  if (!cont) { return; }
  cont = cont.trim();
  let lines = cont.split(/\n/);
  //lines = lines.filter( (l) => { return (!l.match(/^#/)) && l; });
  ips = lines; // map to objects ?
}
function info(req, res) {
  // Prep a AoO where infoid is present in all of objs ? Or rely on info() scope ?
  let infoid = req.query.infoid; // 0 = All, e.g. 5: Network info, 7: Time info
  let infokey = skeys[infoid].key;
  async.map(ips, tasinfo, (err, ress) => {
    //if (infoid) { // Distinguish: && infoid != "0"
      ress = ress.map( (it) => { return it[infokey]; });
    //}
    let r = {"title": skeys[infoid].name, "key": skeys[infoid].key,
      "sid": skeys[infoid].sid, "data": ress };
    if (res) { return res.json(r); }
    console.log(`Done with async:\n${JSON.stringify(r,null,2)}`); // ress
  });
  // Get status info from single tasmota.
  // status / info id (See infoid):
  // - 0: All info with .Status = OoO (keys: Status*, e.g. "StatusTIM")
  // - 1-11: Single domain status with e.g. for infoid 7: .StatusTIM = Object
  // https://tasmota.github.io/docs/Commands/#management
  function tasinfo(ip, cb) {
    // Note: plain command "status" gives 1 rec of "status 0" (!!)
    var url = `http://${ip}/cm?cmnd=Status%20${infoid}`;
    axios.get(url).then(function (resp) {
      var d = resp.data;
      //console.log(`Info from ${ip}:\n${JSON.stringify(d,null,2)}`); // Debug
      return cb(null, d);
    }).catch( (ex) => {
      console.log(`${ex}`);
      // TODO: Respond with entry, but signal outage (e.g. sleep, deep sleep)
      return cb("Error", null);
    });
  }
}
module.exports = {
  init: init,
  info: info, // CLI and http handler
};
function usage(msg) {
  if (msg) { console.log(msg); }
  process.exit(1);
}
if (process.argv[1].match("tasmota.js")) {
  let tasmota = module.exports;
  let infoid = process.argv[2];
  if (!infoid) { usage("Please pass infoid (0-11) as first CL arg !"); }
  if (!infoid.match(/^\d+$/)) { usage(`infoid from CLI (Got: '${infoid}') not passed as int number (0-11) !`); }
  tasmota.init();
  let req = { query: { infoid: infoid } };
  tasmota.info(req, null);
}
