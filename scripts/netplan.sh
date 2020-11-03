#!/bin/sh
# TEMPLATE_WITH: global
# Download a good netplan from Linetboot
# Try to detect current active network interface
# (from installation) to override whatever settings from earlier
# OS install state ?
# TODO (e.g.): ?netif=eno2
# ip addr show | grep -P '^\d+:\s(e[\w]+):'
# ifconfig
NETIF=`ip addr show | grep -P -o '^\d+:\s\K(e[\w]+)'`
# NETIF=`ip addr show | sed -n -e 's/^[0-9]+: \([[:alnum:]]\+\):/\1/p'
echo "netplan.sh: Detected local netif: $NETIF"
# Backup old
cp -p /etc/netplan/01-netcfg.yaml /etc/netplan/01-netcfg.yaml.bak.pre-replace
# Download new
wget "http://{{ httpserver }}/netplan.yaml?netif=$NETIF" -O /etc/netplan/01-netcfg.yaml
