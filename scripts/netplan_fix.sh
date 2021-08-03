#!/bin/bash
## TEMPLATE_WITH: user
# NETPLAN

POST_LOG={{{ user.homedir }}}/post-log.txt

NETIF=`ip addr show | grep -P -o '^\d+:\s\K(e[\w]+)'`
# NETIF=`ip addr show | sed -n -e 's/^[0-9]+: \([[:alnum:]]\+\):/\1/p'
echo "netplan_fix.sh: Detected local netif: $NETIF"

mv /etc/netplan/01-netcfg.yaml /etc/netplan/01-netcfg.yaml.orig
/usr/bin/curl "http://{{{ httpserver }}}/netplan.yaml?netif=$NETIF" -o /etc/netplan/01-netcfg.yaml
echo "Downloaded new netplan: rc=$?" >> $POST_LOG
netplan apply
echo "Applied netplan: rc=$?" >> $POST_LOG
exit 0
