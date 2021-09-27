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
var urls = ["/ubuntu20/casper/vmlinuz","/ubuntu20/casper/initrd"];
var async = require("async");
var axios = require("axios");
// Parse options
var ipaddr = "192.168.1.5";
var totsize = 0;
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
    console.log("Failed to GET "+url);
    cb(ex, null);
  })
}
