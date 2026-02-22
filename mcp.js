#!/usr/bin/env node
/** Small MCP Example with dummy/example MCP services, but extensible with actual meaningful
 * Examples aim to be read-only operations to not cause mayhem on the system.
 * - Plain echo of received params on server side
 * - Grab uptime (by child process)
 * Add facility to add handlers.
 * For JSON-RPC part See: https://www.jsonrpc.org/specification
 * ## tests
 * 
 * ## Historical notes
 * 
 * JSON-RPC spec is compact, simple and terse, but OpenRPC proposed a method "rpc.discover" method (similar to swagger standard)
 * that would return an OpenRPC document describing methods and their parameters. Also XML-RPC "system.listMethods" was adopted by
 * some JSON-RPC implementations. Note: MCP did not adopt OpenRPC's "rpc.discover" but uses "$noun/$verb" notation for various
 * discovery methods (e.g. tools/list, resources/list, It seems tools/call invokes a too (!?)).
 * References:
 * - https://modelcontextprotocol.io/specification/2025-11-25
 * - https://modelcontextprotocol.io
 * - https://github.com/modelcontextprotocol/modelcontextprotocol ... See schema.ts
 * - MCP Apps: https://modelcontextprotocol.io/docs/extensions/apps
 *   - Most AI have config dir in ~ and `skills/` dir under it (E.g. .claude, .copilot, .gemini, .codex - for chatGPT)
 * - .outputSchema: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/371
 * - Superficial article on schemas (w. examples): https://www.merge.dev/blog/mcp-tool-schema
 * - https://github.com/modelcontextprotocol/typescript-sdk
 * -https://modelcontextprotocol.wiki/en/docs/concepts/resources
 * ## Client side configuration
 * 
 * - https://platform.claude.com/docs/en/agent-sdk/mcp
 * - e.g. In proj dir ./.mcp.json: command: "" and "args":[] OR: "url": ... 
 * ## TODO
 * - Facilitate asynchronicity, but it seems we can do a lot synchronously (esp. await ...).
 */
const express = require("express");
let cproc     = require("child_process");
let readline  = require('readline'); // for stdio transport. In node.js core !
// let jrpc  = require('jrpc');
// Standard MCP "capabilities" (from initialize - capability negotiation)
let stdcapa = { "protocolVersion": "2025-11-25", "capabilities": {
    "tools": {}, // Also: "resources": {}, "prompts": {},
  },
  "serverInfo": { "name": "my-mcp-server", "version": "1.0.0" }
};

// TODO: Require more props, e.g. if handler should be run in async or sync mode (!)
// Mandatory: initialize Practically mandatory tools/list.
// See if rpc.discover is fit here (?): return res.json({ jsonrpc: "2.0", result: schema, id: id, });
let method_hdlrs = {
  // MCP JSON-RPC level handlers (NOT *tools* level - tools/call will call tool handler)
  "initialize": (method, id, params) => { return { result: stdcapa }; },
  // loop through
  "tools/list": (method, id, params) => { return { jsonrpc: "2.0", result: {tools: [schema_tool] }, id: id, }; },
  "tools/call": (method, id, params) => {
    let tname = params.name;
    return tools_hdlrs[tname](tname, id, params.arguments); // ret. result
  },
  // This is *notification* - No body response
  "notifications/initialized":  (method, id, params) => { return { jsonrpc: "2.0", result: {}, id: id, }; },
  "uptime": hdl_uptime,
};
// These should have similar/same signature (method, id, params) as method calls
// BUT: method => toolname (within), params => arguments (within params)
let tools_hdlrs = {
  "uptime": hdl_uptime,
};
let jrpc = {}; // JRPC module / NS "method_hdlr": {} ?
// Add JSON-RPC Handler to module-global (for now) dispatch table.
function method_hdlr_add(mname, mhdlr) {
  if (typeof mhdlr != 'function') { console.error(`Method handler passed is not a function !`); return; }
  method_hdlrs[mname] = mhdlr;
}
/** Utility: Safe shell execution for shelled-out commands.
 */
function safeExec(cmd) {
  try {
    return cproc.execSync(cmd, { encoding: "utf8" }).trim(); // stdout
  } catch (err) {
    throw new Error(`Shell command failed: ${err.message}`);
  }
}
/** Create a wrapping for a tool call for client (there is a 2nd stage indirection here). Let caller add id (?)
 * @return request message (to be sent out by client).
*/
function mcp_tools_call_msg(tname, params) {
  let m = { // "jsonrpc": "2.0",
    method: "tools/call", params: { name: tname, arguments: params } };
  return m;
}
// Answer 2 questions: 1) is this an MCP tool call 2) what is the method name ?
// This allows to switch to MCP tool callback table
function mcp_is_mcp_call(m) { return (m.method == 'tools/call') ? m.params.name : null; }
/** Get system start time from `uptime --since`.
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


/** JSON-RPC Error Helper.
 */
function jsonRpcError(id, code, message) {
  return { jsonrpc: "2.0", error: { code: code, message: message }, id: id || null, };
}

/** Service Schema (for MCP discovery rpc.discover - see how official the standard it)
 * TODO: Isolate these to JS "plugin" modules.
 * Allow module to export one or array of these to then register here.
 * Note: It seems intial documentation on schema format was wrong/misleading - revise this.
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
let schema_tool = {
  name: "uptime",
  description: "Returns system uptime based on --since",
  inputSchema: {
    type: "object",
    properties: {
      restype: { type: "string", description: "Uptime Result type (startiso,minutes,hours,days,raw)" },
      //destination: { type: "string", description: "Arrival Airport" },
      //date: { type: "string", format: "date", description: "Travel date" }
    },
    required: ["restype"],
    "additionalProperties": false,
  }
};
// For tools/list Seems JSON-RPC needs to have result.tools = [{}, {}, ...] // t1, t2, ...
// Each tool should have: name, description, inputSchema: {}, 
// The granularity is per-function/method, not per-service/module


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
    return jsonRpcError(id, -32602, `Invalid 'restype' (${restype}). Allowed: ${allowed.join(", ")}`)
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

// Thin wrapper for HTTP / Express.js
function hdl_rpc_req_express(req, res) {
  let m = req.body; // Auto-parsed by express
  //const { jsonrpc, method, params, id } = req.body;
  let rp = hdl_rpc_req(m, res);
  //if (rp) res.json();
}

function jrpc_is_notif(m) {
  return (!("id" in m) && !("params" in m)) || false;
}

/** Handle request by node.js "http" (raw server module, NO express) in SSE manner
 * E.g. codex defaults to HTTP/SSE in MCP interaction (No way to use/configure "traditional" stateless HTTP).
 * See: Server-Sent Events (SSE),  EventSource API in browsers
 * codex sends in header: "accept":"text/event-stream, application/json"
 * when url is present instead of command (in config), Codex treats it as HTTP/SSE transport automatically.
 */
function hdl_rpc_req_http_raw(req, res) {
  if (req.method != "POST") { res.statusCode = 404; return res.end(); }
  console.error(`Got raw ${req.method} req (on URL: '${req.url}')`);
  let streamhdr = { 'Content-Type': 'application/json',
    'Transfer-Encoding': 'chunked', 'Connection': 'keep-alive' }; // Need to change Content-Type to text/event-stream ?
  //res.statusCode = 200; // Express equivalent: res.status(200);
  let streamhdr2 = { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' };
  res.writeHead(200, streamhdr2); // Also: res.setHeader(k, v);
  res.write("\n"); // Required initial flush
  let buffer = ''; // Cumulated JSON-RPC message buffer to parse as JSON.
  // (Monkey) patch res to be compatible with express res.json(d)
  // This will be unecessary soon with move to handle output here (res.write(....))
  res.json = (d) => {
    console.error(`.json() sending out: ${JSON.stringify(d)}`);
    res.write("data: "+ JSON.stringify(d) + "\n\n"); // Should we have "\n\n" for SSE ?
    //res.end() // ? w/o this e.g. curl (used for testing) 1) does not close conn, takes long to output response (after timeout ?)
  }; 
  req.on('data', (chunk) => {
    console.error(`Got data chunk: ${chunk.length} B`);
    buffer += chunk.toString();
  });
  /*
    try {
      const m = JSON.parse(buffer); // TODO: Move to req.on('end', ...) handler
      console.error(`Parsed buffer (${buffer.length} B): ${JSON.stringify(m)}`);
      //buffer = ''; // reset if NO exceptions
      //handleMessage(res, msg);
      try {
        let rp = hdl_rpc_req(m, res); // For now rp unused
        //TODO: if (rp) res.write(JSON.stringify(rp));
        console.log(`res-finished: ${res.finished}`); // This seems to correspond to res.end() being called.
      } catch(ex) { console.error(`RPC Handling error: ${ex}`); }
    } catch (ex) {
     console.error(`More data needed:${ex} (Got C: ${chunk.length} B: ${buffer.length}, HSENT: ${res.headersSent}`);
     // wait for more data
    }
  //});
  */
  // Finished receiving request body from client //  ${req.headers['user-agent']}
  // Socket should stay open despite this. TODO: We should parse (collected buffer) and handle jrpc here !!
  req.on('end', () => {
    console.error(`req-end - Client has sent all of request BODY (${buffer.length})`); // (Buf: ${buffer.length} B)
    if (!buffer.length) { }
    const m = JSON.parse(buffer);
    console.error(`Parsed buffer (${buffer.length} B): ${JSON.stringify(m)}`);
    let rp = hdl_rpc_req(m, res);
  });
  res.on('close', () => {console.error(`res-close - Response stream closed (by server)`); })
  // Added for *connection* close detection.
  req.socket.on('close', () => {
    // by 
    console.error(`TCP socket closed (${JSON.stringify(req.headers)})`); // ${JSON.stringify(req.headers)}
    console.error(`  - Requested by ${req.headers['user-agent']}`);
  });
}

/** JSON-RPC level handler (for any of the transport types: http, stdio)
 * 
 * @param m - Incoming JSON-RPC Message
 * @param res - "http" or express response (we have monkey-patched http resp so it can handle .json() )
 * TODO: Return message only to not have to do with output methods of any of the specific transports and libraries (http, express).
 */
function hdl_rpc_req(m, res) {
  //let m = null; // Message
  //const { jsonrpc, method, params, id } = m = req.body;
  const { jsonrpc, method, params, id } = m;
  //console.log(`Received JSON-RPC message: ${JSON.stringify(m)}`);
  if (Array.isArray(m)) { return res.json(jsonRpcError(id, -32600, "JSON-RPC Batch Request (array-of-msgs) detected. Not supported (yet) !")); } // Number ???
  
  if (jsonrpc !== "2.0") { return res.json(jsonRpcError(id, -32600, "Invalid JSON-RPC version")); }
  if (!method)           { return res.json(jsonRpcError(id, -32600, "Missing method")); }

  console.error(`FULL-REQ: ${JSON.stringify(m, null, 2)}`);
  // Notification. in future: return null; res.end() here causes: Error [ERR_STREAM_WRITE_AFTER_END]: write after end
  // res.write("");  res.end(); # E(only) closes sockets (at timeout ? Transport channel closed, when send initialized notification)
  // W+E Same
  // W - Client does not close immed, but doesnot recv (empty) resp either (waits for 100s),res-finished: false (due to no res.end())
  // res.end(); res.statusCode = 200; <= too late here. DO not even do this on SSE: res.write("data: \n\n");
  // For notifications: You send nothing. Just accept them. Do NOT close connection.
  //if (typeof id != 'number') { console.error("NOTIF: Send empty 200");   return; }
  try {
    console.error(`Got RPC Request: id: ${id}, method: ${method}), params: ${JSON.stringify(params)}`);
    // if (!("id" in m)) { return res.send(); } // Notification
    let result = null; // Rename: jres or jrpcres
    // Dispatch method from method_hdlrs (TODO: make more granular)
    let mcb = method_hdlrs[method];
    // Detect notification, do not respond
    if (jrpc_is_notif(m)) { console.error("NOTIF: Send empty 200");   return; }
    if (!mcb) { return res.json(jsonRpcError(id, -32601, `Method '${method}' not found`)); }
    console.error(`Found handler for m: '${method}'`);
    result = mcb(method, id, params); // rmsg ?
    if (typeof result != 'object') { return res.json(jsonRpcError(id, -32603, "No result object returned from RPC handler !!!")); }
    if (result.error) { return res.json(result); } // Assume complete response (?) OR add result.id = id; result.jsonrpc = "2.0";
    // Still check result.result (for saneness) for value and object (array, even string ?) type ?
    // At JSON-RPC Handling level: Now create complete response with "jsonrpc" and "id"
    result.jsonrpc = "2.0";
    result.id = id;
    return res.json(result); // res.json({ jsonrpc: "2.0", result: result, id: id, });
    // }
    // else { 
  } catch (err) {
    //let msg = `Error during json-rpc handling: ${err.message}`;
    return res.json(jsonRpcError(id, -32603, err.message));
  }
}
module.exports = {
  hdl_rpc_req: hdl_rpc_req,
  hdl_rpc_req_express: hdl_rpc_req_express, // For arbitrary express applications.
};
if (process.argv[1].match("mcp.js")) {
  let PORT = process.env.PORT || 3000;
  let mode = process.argv[2] || "http"; // http / httpraw / stdio
  let servurl = "/mcp"; // "/rpc" works equally
  console.error(`Got mode: ${mode}`);
  let res = null;
  // HTTP transport - HTTP/SSE transport
  if (mode == 'httpraw') {
    // Raw Node.js
    let http = require("http");
    let server = http.createServer(hdl_rpc_req_http_raw);
    server.listen(PORT, () => {
      console.log('Streamable HTTP MCP server running on port 3000');
    });
  }
  if (mode == 'http') {
    let app = express();
    app.use(express.json());
    app.post(servurl, hdl_rpc_req_express);
    app.listen(PORT, () => {
      console.log(`MCP (HTTP) JSON-RPC server running on port ${PORT} (Service URL path: '${servurl}')`);
    });
  }
  // stdio transport
  else if (mode == 'stdio') {
    // Create (i.e. "mock') an object that looks similar to Express res, w. method json() to share the response handling interface 1:1
    //let
    res = {json: (rmsg) => {
        let j = JSON.stringify(rmsg);
        process.stdout.write(`Content-length: ${j.length}\n\n`);
        process.stdout.write( j ); // + '\n'
      },
      send: (rmsg) => { process.stdout.write(rmsg + '\n'); },
      write: (rmsg) => { process.stdout.write(rmsg + '\n'); },
      status: (any) => { return res; }, // for chaining - should not be used
    };
    // output => Don't let readline touch stdout, terminal => stdin is not a TTY.
    const rl = readline.createInterface({ input: process.stdin, output: null, terminal: false });
    console.error(`Hook handlers`);
    // Request handler. Note *ALL* JSON of request must be on one line.
    rl.on('line', hdl_rpc_req_stdio_msg);
    // Register "client close" handler for stdio mode (stdin closed - client disconnected, clean up and exit)
    // There is an explicit: rl.close()
    rl.on('close', () => { process.exit(0); }); // Do fancier stuff here ?

  }
   function hdl_rpc_req_stdio_msg(line) { // TODO: hdl_rpc_req_stdio_msg(res)(line)
      console.error(`Got line: ${line}`);
      let trimmed = line.trim();
      if (!trimmed) { return; } // skip empty lines (i.e. requests)
      let message;
      // Parse, detect early errors (e.g. parsing malformed JSON)
      try { message = JSON.parse(trimmed); }
      catch (err) {
        // Malformed JSON ...
        let jerr = jsonRpcError(0, -32700, `Could not parse JSON-RPC message - check you JSON syntax !`)
        process.stdout.write(JSON.stringify(jerr) + '\n');
        return;
      }
      // Parsed as JSON ok - process JSON-RPC.
      let rp = hdl_rpc_req(message, res);
      
      // OLD/TEST - Write response as a single line to stdout. Now written with hdl_rpc_req using res.json()
      // if (rp) process.stdout.write(JSON.stringify(response) + '\n');
    }
}
