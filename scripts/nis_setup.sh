#!/bin/sh
# Setup NIS. Net ("net") section should have:
# - nisdomain - NIS domain name (Alternatively host params may have "nis")
# - nismm - NIS master map (without nay preceding '+' sign
# - nisservers - (array of) NIS server fqdn names or IP addresses
# TEMPLATE_WITH: user
NIS_DOM="{{{ nisdomain }}}"
NIS_AUTO_MASTER_MAP="{{{ nisamm }}}"
NIS_SERVERS="{{{ nisservers }}}"
POST_LOG={{{ homedir }}}/post-log.txt
if [ -z "$NIS_AUTO_MASTER_MAP" ]; then
  NIS_AUTO_MASTER_MAP=auto.master
  echo "Falling back to auto master map name auto.master" >> $POST_LOG
fi


if [ -z "$NIS_DOM"]; then
  echo "No NIS domain is configured globally or for this machine. Skip NIS setup" >> $POST_LOG
  exit 0
fi
# TODO: Check OS (rh/debian)
# Notes: nis deps on portmap, comes with yp.conf
# rpcbind exists for 1804, replaces portmap
export DEBIAN_FRONTEND=noninteractive
# Debian/Ubuntu
sudo DEBIAN_FRONTEND=noninteractive apt-get -yq install --no-install-recommends rpcbind nis nfs-common autofs nscd
# RH/Centos
#if [ ... rh/centos ... ]; then
#  yum install yp-tools nfs-utils autofs nscd
#fi

# Set domain (todo: make backups of old)
echo "$NIS_DOM" > /etc/defaultdomain
echo "+$NIS_AUTO_MASTER_MAP" > /etc/auto.master
# RH/Centos
if [ -f "/etc/sysconfig/network" ]; then
  grep '^NISDOMAIN=' /etc/sysconfig/network
  rc=$?
  if [ $rc -ne 0 ]; then
    # TODO: sed ?
    perl -pi -e 's/^NISDOMAIN=.+/NISDOMAIN={{{ nisdomain }}}/;' /etc/sysconfig/network
  else
    echo "NISDOMAIN=$NIS_DOM" >> /etc/sysconfig/network
  fi
fi
# Simple NIS-favouring naming ordering (removed inlining)
#cat <<EOT > /etc/nsswitch.conf
#EOT
wget "http://{{ httpserver }}/scripts/nsswitch.conf" -O /etc/nsswitch.conf

# TODO: /etc/yp.conf (NIS servers: "ypserver nis1.mycomp.com" ....)
if [ -z "$NIS_SERVERS" ]; then
  echo "Warning: No NIS server configured !" >> $POST_LOG
  exit 0
else
  echo -n "" > /etc/yp.conf
  for NSERV in $NIS_SERVERS; do echo "ypserver $NSERV" >> /etc/yp.conf; done
fi
# Ubu 18: nis, but also ypbind works
service ypbind stop; service ypbind start
service autofs stop; sleep 5; service autofs start
service nscd stop; sleep 5; service nscd start
