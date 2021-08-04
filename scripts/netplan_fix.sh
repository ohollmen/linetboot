#!/bin/bash
# Overwrite Ubuntu Netplan with network-config-wise correct values.
# We detect the first network if here (assumed to be the one in use, but
# note this assumption may be optimistic and fail, see $NETIF evaluation).
# We skip any other OS:s than Ubuntu 18.04 and 20.04 that are known to use netplan.
## TEMPLATE_WITH: user
# NETPLAN

POST_LOG={{{ user.homedir }}}/post-log.txt
# Test Netplan use
grep -P '(\b18\.04\b|\b20\.04\b)' /etc/os-release
usenp_rc=$?
echo "Netplan usage: usenp_rc=$usenp_rc" >> $POST_LOG
# Note /etc/netplan might be /target/etc/netplan at this point
# [ -d "/etc/netplan/" ] && ...
if [ $usenp_rc -eq 0 ]; then
  echo "netplan_fix.sh: This OS ("`uname -a`") does not use netplan" >> $POST_LOG
  exit 0
fi
# Assumes first device name is the one used for main interface.
NETIF=`ip addr show | grep -P -o '^\d+:\s\K(e[\w]+)' | head -n 1` 
# NETIF=`ip addr show | sed -n -e 's/^[0-9]+: \([[:alnum:]]\+\):/\1/p'
echo "netplan_fix.sh: Detected local main netif: $NETIF" >> $POST_LOG

mv /etc/netplan/01-netcfg.yaml /etc/netplan/01-netcfg.yaml.orig
/usr/bin/curl "http://{{{ httpserver }}}/netplan2.yaml?netif=$NETIF" -o /etc/netplan/01-netcfg.yaml
echo "Downloaded and installed new netplan: rc=$?" >> $POST_LOG
netplan apply
echo "Applied netplan: rc=$?" >> $POST_LOG
exit 0
