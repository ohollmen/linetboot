#!/bin/sh
# Setup NIS. Host params must have:
# - nis - NIS domain name
# - nismm - NIS master map (without nay preceding '+' sign
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
sudo apt-get install rpcbind nis nfs-common autofs nscd --no-install-recommends
# Set domain (todo: make backups of old)
echo "$NIS_DOM" > /etc/defaultdomain
echo "+$NIS_AUTO_MASTER_MAP" > /etc/auto.master
# RH/Centos

# Simple NIS-favouring naming ordering
cat <<EOT > /etc/nsswitch.conf
passwd:         files nis
group:          files nis
shadow:         files nis

hosts:          files dns
networks:       files

protocols:      files
services:       files
ethers:         files
rpc:            files

netgroup:       files nis

automount:	files nis
sudoers:	files ldap
EOT
# TODO: /etc/yp.conf (NIS servers: "ypserver nis1.mycomp.com" ....)
if [ -z "$NIS_SERVERS"]; then
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
