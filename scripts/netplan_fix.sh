#!/bin/bash
# Overwrite Ubuntu Netplan with network-config-wise correct values.
# We detect the first network if here (assumed to be the one in use, but
# note this assumption may be optimistic and fail, see $NETIF evaluation).
# We skip any other OS:s than Ubuntu 18.04 and 20.04 that are known to use netplan.
## TEMPLATE_WITH: user
# NETPLAN

POST_LOG={{{ user.homedir }}}/post-log.txt
# NP_PATH=/target/etc/netplan
NP_PATH=/etc/netplan
# Test Netplan use
grep -P '(\b18\.04\b|\b20\.04\b)' /etc/os-release
usenp_rc=$?
echo "Netplan usage: usenp_rc=$usenp_rc" >> $POST_LOG
# Note /etc/netplan might be /target/etc/netplan at this point
# [ -d "$NP_PATH" ] &&
if [ $usenp_rc -ne 0 ]; then
  echo "netplan_fix.sh: This OS ("`uname -a`") does not use netplan" >> $POST_LOG
  cat /etc/os-release >> $POST_LOG
  exit 0
fi
# Assumes first device name is the one used for main interface.
NETIF=`ip addr show | grep -P -o '^\d+:\s\K(e[\w]+)' | head -n 1` 
# NETIF=`ip addr show | sed -n -e 's/^[0-9]+: \([[:alnum:]]\+\):/\1/p'
echo "netplan_fix.sh: Detected local main netif: $NETIF" >> $POST_LOG
# DEBUG
ls -al /etc/netplan/* >> $POST_LOG
ls -al /target/etc/netplan/* >> $POST_LOG
# Changed move to cp
cp -p $NP_PATH/01-netcfg.yaml $NP_PATH/01-netcfg.yaml.orig
# Curl *will* overwrite w/o complaints
/usr/bin/curl "http://{{{ httpserver }}}/netplan2.yaml?netif=$NETIF" -o $NP_PATH/01-netcfg.yaml
echo "Downloaded and installed new netplan: rc=$?" >> $POST_LOG
netplan apply
echo "Applied netplan: rc=$?" >> $POST_LOG
exit 0
