#!/usr/bin/env node
/** Small MCP Example with dummy/example MCP services, but extensible with actual meaningful
 * Examples aim to be read-only operations to not cause mayhem on the system.
 * - Plain echo of received params on server side
 * - Grab uptime (by child process)
 * Add facility to add handlers.
 * For JSON-RPC part See: https://www.jsonrpc.org/specification
 * ## tests
 * 
 */
const express = require("express");
let cproc = require("child_process");
// TODO: Require more props, e.g. if handler should be run in async or sync mode (!)
let method_hdlrs = {
  "uptime": hdl_uptime,
};
let jrpc = {};


/**
 * Utility: Safe shell execution
 */
function safeExec(command) {
  try {
    return cproc.execSync(command, { encoding: "utf8" }).trim(); // stdout
  } catch (err) {
    throw new Error(`Shell command failed: ${err.message}`);
  }
}


/**
 * Get system start time from `uptime --since`
 */
function getStartTime() {
  const since = safeExec("uptime --since");
  const date = new Date(since);
  if (isNaN(date.getTime())) { throw new Error("Unable to parse uptime --since output"); }
  return date;
}

/**
 * Compute uptime duration based on start time
 */
function computeDuration(startDate) {
  const now = new Date();
  const diffMs = now - startDate;
  if (diffMs < 0) { throw new Error("System start time is in the future"); }
  return { minutes: diffMs / (1000 * 60), hours: diffMs / (1000 * 60 * 60), days: diffMs / (1000 * 60 * 60 * 24), };
}


/**
 * JSON-RPC Error Helper
 */
function jsonRpcError(id, code, message) {
  return { jsonrpc: "2.0", error: { code: code, message: message }, id: id || null, };
}

/**
 * Service Schema (MCP discovery)
 */
const schema = {
  name: "SystemUptimeService",
  version: "1.0.0",
  methods: {
    "uptime": {
      description: "Returns system uptime based on --since",
      params: {
        restype: {
          type: "string",
          enum: ["startiso", "minutes", "hours", "days", "raw"],
          required: true,
        },
      },
      returns: {
        type: "string | number",
      },
    },
    "rpc.discover": {
      description: "Returns service schema",
      params: {},
      returns: { type: "object" },
    },
  },
};
// Note: Do not let handler worry about ID (except for erro messages ?). Return resp data only, however in response object w. {"result": ...}.
// Pass method for overloaded handlers that can do multiple variations of "same method theme" but different method names with minute differences.
// (distinct methods, but same functional pattern with minor variations).
function hdl_uptime(method, id, params) {
      if (!params || typeof params.restype !== "string") {
        //return res.json(
        return jsonRpcError(id, -32602, "Missing or invalid 'restype' parameter")
        //);
      }
      const restype = params.restype;
      const allowed = ["startiso", "minutes", "hours", "days", "raw"];
      if (!allowed.includes(restype)) {
        //return res.json(
        return jsonRpcError(id, -32602, `Invalid 'restype'. Allowed: ${allowed.join(", ")}`)
        //);
      }

      if (restype === "raw") {
        const raw = safeExec("uptime");
        //return res.json();
        return { jsonrpc: "2.0", result: raw, id: id, };
      }
      const startDate = getStartTime();
      const duration = computeDuration(startDate);

      let result;

      switch (restype) {
        case "startiso":
          result = startDate.toISOString();
          break;
        case "minutes":
          result = Number(duration.minutes.toFixed(2));
          break;
        case "hours":
          result = Number(duration.hours.toFixed(2));
          break;
        case "days":
          result = Number(duration.days.toFixed(2));
          break;
      }
      return { result: result, };
    }
/** JSON-RPC level handler */
function hdl_rpc_req(req, res) {
  const { jsonrpc, method, params, id } = req.body;
  if (Array.isArray(req.body)) { return res.json(jsonRpcError(id, -32600, "JSON-RPC Batch Request (array-of-msgs) detected. Not supported (yet) !")); } // Number ???
  if (jsonrpc !== "2.0") { return res.json(jsonRpcError(id, -32600, "Invalid JSON-RPC version")); }
  if (!method)           { return res.json(jsonRpcError(id, -32600, "Missing method")); }
  try {
    // SCHEMA DISCOVERY
    if (method === "rpc.discover") {
      return res.json({ jsonrpc: "2.0", result: schema, id: id, });
    }
    let result = null; // Rename: jres or jrpcres
    // UPTIME METHOD
    //if (method === "uptime") {
    //  result = hdl_uptime(method, params);
    let mcb = method_hdlrs[method];
    if (mcb) {
      result = mcb(method, id, params);
      if (result.error) { return res.json(result); } // Assume complete response (?) OR add id, jsonrpc
      // Still check result.result (for saneness) for value and object (array, even string ?) type ?
      // At JSON-RPC Handling level: Now create complete response with "jsonrpc" and "id"
      result.jsonrpc = "2.0";
      result.id = id;
      return res.json(result); // res.json({ jsonrpc: "2.0", result: result, id: id, });
    }
    else { return res.json(jsonRpcError(id, -32601, "Method not found")); }
  } catch (err) {
    //let msg = `Error during json-rpc handling: ${err.message}`;
    return res.json(jsonRpcError(id, -32603, err.message));
  }
}
module.exports = {
  
};
if (process.argv[1].match("mcp.js")) {
  const PORT = process.env.PORT || 3000;
  const app = express();
  app.use(express.json());
  app.post("/rpc", hdl_rpc_req);
  app.listen(PORT, () => {
    console.log(`MCP JSON-RPC server running on port ${PORT}`);
  });
}
