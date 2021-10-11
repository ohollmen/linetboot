/** Simulate an OS install (or e.g. tool-ISO boot).
 * Make a large number of HTTP (GET) requests to linetboot
 * starting with (early boot) kernel and initrd download.
 * - Aim to compute total download size.
 * - Each item could have "processing delay" (e.g. kernel load/init).
 * ## Recording URL:s
 * Type of URL:s:
 * - Static URL:s - kernel, initrd (from boot menu file)
 * - Dynamic: Recipe (E.g. /preseed.cfg)
 * - packages (e.g. )
 * - pre / post scripts (/installevent/:evtype, handler oninstallevent,
 *   evtype: start, end)
 * Implementing recoding
 * - Allow middleware and static logger to track URL:s
 * - Turn on in main cfg: inst.staticdebug (e.g. ... = 1;, sets .setHeaders
 *   callback in static module)
 * 
 * ## TODO
 * - Allow concurrency / load testing by lauching multiple installs
 *   at the same time (and allow analyzing slow-down by concurrency)
 */

/* Initially load (GET) URL:s from a JSON file. TODO: *.txt */
//var urls = require("insturls.json");
var urls = [
  //"/ubuntu20/casper/vmlinuz","/ubuntu20/casper/initrd"
  "http://localhost:3000/list",
];
var async = require("async");
var axios = require("axios");
// Parse options
var ipaddr = "192.168.1.5";
var totsize = 0;
// POST "/login" test to maintain cookie state.
// Note binary data in resp may jam terminal
// NOTE: resp.request Member agent (type Agent) agent.options
function respint(resp) {
  console.log("###### Resp has ("+resp.path+") hdrs ",resp.headers);
  console.log("resp.request.agent.options: ",resp.request.agent.options);
  if (resp.headers['set-cookie'] && Array.isArray(resp.headers['set-cookie'])) {
    resp.request.agent.options.headers = {}; // if not ...
    var foo = resp.request.agent.options.headers["foo"] = resp.headers['set-cookie'][0];
    if (foo) { console.log("COOKIE:", foo); }
  }
  resp.headers["Access-Control-Allow-Origin"] = "*";
  return resp; }

function reqint(config) {
  // .method is avail here !
  config.withCredentials = true; // Set here to mimick coming from server
  console.log("#### REQ-CONFIG: ", config);
  
  return config;
}
axios.interceptors.request.use(reqint);
axios.interceptors.response.use(respint);
var cfg = {
  headers: {"content-type": "application/json"},
  withCredentials: true
};
/*
'set-cookie': [ 'connect.sid=s%3A1y33obn0Y33fO1BaN4nHNQqPeL_VzrKw.kRh997i87W2ILFne2Sx3U6W1ZQ0nCFz%2FjY6BAAonlkw; Path=/; Expires=Thu, 30 Sep 2021 06:04:07 GMT; HttpOnly; SameSite=Strict' ],
 */
axios.post("http://localhost:3000/login", {username: "ohollmen", password: "hi"}, cfg).then((resp) => {
  console.log("RESP:", resp);
}).catch((ex) => {
  console.log("FAIL: ", ex.response.status, ex);
});


// waterfall / series ?

async.map(urls, download, (err, results) => {
  console.log("Done downloading all install related files ("+totsize+" B)");
});


/** Download any of files or dynamic content needed during install (HTTP GET).
* Will be used as async.map() item callback (passing URL).
*/
function download(url, cb) {
  // On select URL:s add IP ADDRESS
  if (url.match("foo")) { url += "ip="+ ipaddr; }
  var para = null;
  axios.get(url, para).then((resp) => {
    var d = resp.data;
    var size = d.length; // Or content-length ?
    
    totsize += size;
    console.log("Got "+url+", "+size+" B.");
    cb(null, url);
  })
  .catch((ex) => {
    console.log("Failed to GET "+url+ "(",ex.response.status,")"); // .code
    cb(ex, null);
  })
}
