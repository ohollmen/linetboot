#!/bin/bash
# MCP uptime service Tests
# All restype;s
curl -X POST http://localhost:3000/rpc -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"uptime","params":{"restype":"startiso"},"id":1}'
curl -X POST http://localhost:3000/rpc -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"uptime","params":{"restype":"minutes"},"id":2}'
curl -X POST http://localhost:3000/rpc -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"uptime","params":{"restype":"hours"},"id":3}'
curl -X POST http://localhost:3000/rpc -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"uptime","params":{"restype":"days"},"id":4}'
curl -X POST http://localhost:3000/rpc -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"uptime","params":{"restype":"raw"},"id":5}'
# Discover
curl -X POST http://localhost:3000/rpc -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"rpc.discover","params":{},"id":6}'
# Negative
curl -X POST http://localhost:3000/rpc -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"uptime","params":{"restype":"seconds"},"id":7}'
curl -X POST http://localhost:3000/rpc -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"uptime","params":{},"id":8}'
curl -X POST http://localhost:3000/rpc -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"uptime","params":{"restype":123},"id":9}'
curl -X POST http://localhost:3000/rpc -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"unknownMethod","params":{},"id":10}'
# Invalid JRPC
curl -X POST http://localhost:3000/rpc -H "Content-Type: application/json" -d '{"jsonrpc":"1.0","method":"uptime","params":{"restype":"minutes"},"id":11}'
# Batch (!)
curl -X POST http://localhost:3000/rpc -H "Content-Type: application/json" -d '[{"jsonrpc":"2.0","method":"uptime","params":{"restype":"minutes"},"id":12},{"jsonrpc":"2.0","method":"rpc.discover","params":{},"id":13}]'
