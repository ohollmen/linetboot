#!/bin/sh
# Setup NIS. Supports /(Debian GNU|Ubuntu)/ and /(Red Hat|CentOS)/
# Net ("net") section should have:
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
# Check OS (rh/debian)
#grep Ubuntu /etc/os-release
grep -P '(Debian GNU|Ubuntu)' /etc/os-release
ubu_rc=$?
# RH/Centos
grep -P '(Red Hat|CentOS)' /etc/os-release
cen_rc=$?
grep 'Arch Linux' /etc/os-release
arch_rc=$?
# Notes: nis deps on portmap, comes with yp.conf
# rpcbind exists for 1804, replaces portmap
if [ $ubu_rc -eq 0 ]; then
  export DEBIAN_FRONTEND=noninteractive
  # Debian/Ubuntu
  sudo DEBIAN_FRONTEND=noninteractive apt-get -yq install --no-install-recommends rpcbind nis nfs-common autofs nscd
fi
# RH/Centos
# Seems yp-tools nfs-utils autofs are installed out-of-the-box ?
if [  $cen_rc -eq 0 ]; then
  yum -y install yp-tools nfs-utils autofs nscd
fi
if [ $arch_rc -eq 0 ]; then
  # Arch AUR makepkg (https://wiki.archlinux.org/index.php/NIS https://wiki.archlinux.org/index.php/autofs)
  #
  #pacman -S yp-tools ypbind-mt autofs nscd
  echo "NISDOMAINNAME=\"$NIS_DOM\"" > /etc/nisdomainname
  # nscd -i <database> ?
  rm -rf /var/db/nscd/
  mkdir /var/db/nscd/
  rm -f /etc/autofs/auto.master
  # Will be actually created on a later step
  touch /etc/auto.master
  ln -s /etc/auto.master /etc/autofs/auto.master
  
fi
# Set domain (todo: make backups of old)
echo "$NIS_DOM" > /etc/defaultdomain
# Arch: /etc/autofs/auto.master
echo "+$NIS_AUTO_MASTER_MAP" > /etc/auto.master
# RH/Centos
if [ $cen_rc -eq 0 ]; then
  if [ ! -f "/etc/sysconfig/network" ]; then
    touch "/etc/sysconfig/network"
  fi
  # TODO: Brute-force simplify by *only* appending (as it is ~100% sure NISDOMAIN does not exist)
  grep '^NISDOMAIN=' /etc/sysconfig/network
  rc=$?
  # Match ...
  if [ $rc -eq 0 ]; then
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
#service ypbind enable
#service ypbind stop; service ypbind start
#service autofs enable
#service autofs stop; sleep 5; service autofs start
#service nscd enable
#service nscd stop; sleep 5; service nscd start
systemctl enable ypbind autofs nscd
systemctl start ypbind autofs nscd
# rpcbind ?
