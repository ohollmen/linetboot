/** @file
 * Kubernetes Info (kubi)
 */
 
var fs = require("fs");

 // List of linetboot server side data (info) set name:s (OLD: URL:s)
  // Most (v1) apis work the same with trailing slash or w/o. leave out here
  var urlmap = [
    // NS: kube-system Pods. Also: ?labelSelector=tier%3Dcontrol-plane&limit=500
    {name: "pod-sys", url: "/podinfo", apipath: "/api/v1/namespaces/kube-system/pods", title: "Kube System Pods"}, // 
    {name: "pod-default", url: "/podinfodef", apipath: "/api/v1/namespaces/default/pods", title: "Default NS Pods"}, // 
    //{name: "", url: "/depinfodef", apipath: "/api/v1/namespaces/default/pods", title: "Default NS Deployments"},
    //{name: "", url: "/kubdash", apipath: "/api/v1/namespaces/kubernetes-dashboard/services/", title: "Kubernetes Dashboard"}, // Note: services. Some fields compat.
    {name: "api", url: "/kubapirsc", apipath: "/api/v1", title: "APIs"},
    {name: "nss", url: "/kubnss", apipath: "/api/v1/namespaces", title: "Namespaces"},
    // "/kubdash" "/kubapirsc"
  ];
  
var cfg = null; // null ?
function init(global) {
  cfg = global.k8s;
  if (!cfg) { return; }
  return module.exports;
}
/** Get K8S Pods (and other) info from Kubernetes (or Minikube, "/kubinfo").
 * To run API proxying:
 * - In small (minikube) scale (min. setup overhead):  kubectl proxy --port=8080 --accept-hosts='^localhost$,^192.168.1.*$'
 * - In proper scale (JWT, cacert): Setup JWT, cacert properly as pointed out by article ...
 *   - Generic case: Authorization: Bearer $TOKEN
 *   - Google GKE: ...
 *   - https://nieldw.medium.com/curling-the-kubernetes-api-server-d7675cfc398c
 *   - https://kubernetes.io/docs/tasks/administer-cluster/access-cluster-api/
 *   - https://stackoverflow.com/questions/63169737/kubernetes-api-list-pods-with-a-label
 * Note: This servers more than pods (almost any K8S API). TODO: rename.
 * TODO: Move to kubi.js, Have urlmap (rename kubimap) as module-global, export from module and attach to client config in config_send
 */
function kube_info(req, res) {
  var jr = {status: "err", "msg": "Could not list Pods"};
  //var testfn = "./pods.json";
  // TODO: Add attr or cb to get to AoO (to be listed) ?
  
  //var cfg = global.k8s;
  if (!cfg) { jr.msg += "No k8s config (miss init ?)"; return res.json(jr); }
  var info = req.query.info;
  //OLD(multi-URL): var apicfg = urlmap.find((it) => { return it.url == req.url; });
  var apicfg = urlmap.find((it) => { return it.name == info; });
  if (!apicfg) { jr.msg = "No match (for: '"+info+"') in API mapping!"; return res.json(jr); } // OLD: req.url
  //var apipath = apicfg ...
  // No "host" given - use Mock-file
  if (!cfg.host) {
    let path = require("path");
    // Figure out testfn here !!!
    var testfn = "./"+path.basename(apicfg.apipath)+".json";
    if (!fs.existsSync(testfn)) { jr.msg += "No test file ("+testfn+")"; return res.json(jr); }
    console.log("k8s: Use mock file: "+testfn);
    var pods = require(testfn);
    
    if (!pods) { jr.msg += "Loading of test file failed"; return res.json(jr); }
    let data = api2data(pods);
    return res.json({status: "ok", data: data}); // pods.items
  }
  // TODO: Deprecate Non-URL (hostname only)
  var k8surl = (cfg.ssl ? "https" : "http") + "://" + cfg.host + apicfg.apipath; // "/api/v1/namespaces/kube-system/pods";
  // NEW: Detect "standard" kubeconfig URL (Simple !)
  if (cfg.host.match(/^http/)) { k8surl = cfg.host + apicfg.apipath; }
  console.log("Consult k8S Live URL: "+k8surl);
  var rpara = {};  // TODO: ..
  if (cfg.token) { rpara =  { headers: { "Authorization":"Bearer " + cfg.token } }; console.log("Got token, added to rpara."); }
  console.log("Axios para:", rpara);
  axios.get(k8surl, rpara).then((resp) => {
    var apidata = resp.data;
    // Raw API data: console.log("Raw API data: ", apidata);
    let data = api2data(apidata);
    if (!Array.isArray(data)) { jr.msg += "No array gotten for ("+info+")result !"; return res.json(jr); }
    res.json({status: "ok", data: data}); // pods.items
  })
  .catch((ex) => {
    jr.msg += "Failed k8s Api Server HTTP Call: "+ex;
    console.log(ex);
    res.json(jr);
  });
  // Extra data from API result.
  // Strive to return a grid-compatible AoO set.
  function api2data(rdata) {
    let data = rdata.items;
    // Special cases / exceptions
    //if (req.url.match(/kubapirsc/)) { data = rdata.resources; }
    if (info == 'api') { data = rdata.resources; }
    return data;
  }
}

module.exports = {
  init: init,
  kubimap: urlmap,
  //kubimap: kubimap,
  kube_info: kube_info
};
