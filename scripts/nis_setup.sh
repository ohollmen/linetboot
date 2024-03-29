#!/bin/bash
# Setup NIS. Supports /(Debian GNU|Ubuntu)/ and /(Red Hat|CentOS)/
# Net ("net") section should have:
# - nisdomain - NIS domain name (Alternatively host params may have "nis")
# - nismm - NIS master map (without nay preceding '+' sign
# - nisservers - (array of) NIS server fqdn names or IP addresses
# TODO: Allow skipping if NIS is already setup by main recipe (e.g. Yast)
# TEMPLATE_WITH: user
NIS_DOM="{{{ net.nisdomain }}}"
NIS_AUTO_MASTER_MAP="{{{ net.nisamm }}}"
NIS_SERVERS="{{{ net.nisservers_str }}}"
POST_LOG={{{ user.homedir }}}/nis-log.txt

touch $POST_LOG; chown {{{ user.username }}}:{{{ user.username }}} $POST_LOG
if [ -z "$NIS_AUTO_MASTER_MAP" ]; then
  NIS_AUTO_MASTER_MAP=auto.master
  echo "Falling back to auto master map name auto.master" >> $POST_LOG
fi


if [ -z "$NIS_DOM" ]; then
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
# "openSUSE Leap"
grep 'openSUSE' /etc/os-release
suse_rc=$?

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
  # Related: authconfig (old), authselect (new)
  # Centos/RH 8: ypbind rpcbind. systemctl enable --now rpcbind ypbind nis-domainname oddjobd
  # OLDER: https://access.redhat.com/solutions/7247
  # NEWER: https://access.redhat.com/solutions/47192 (ypbind even in older - is it a dependency)
  yum -y install yp-tools nfs-utils autofs rpcbind nscd
fi
if [ $arch_rc -eq 0 ]; then
  # Arch AUR makepkg (https://wiki.archlinux.org/index.php/NIS https://wiki.archlinux.org/index.php/autofs)
  # Install AUR helper yay here (NOT Necessary if alis AUR="yay !aurman" !)
  #git clone https://aur.archlinux.org/yay-git.git
  #cd yay-git
  #makepkg -si --noconfirm
  # ypbind / ypbind-mt
  ###### AUR (yay, aurman) installations #########
  # Avoid Interactivity ?
  # su -l '{{ user.username }}' -p -c 'yes | yay -S ypbind-mt' > {{{ user.homedir }}}/yay_install.txt 
  # We seem to have now: ypbind, rpcbind, nscd (automount as pacman pkg)
  # Delay start after config writing ?
  # sudo systemctl start ypbind
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
if [  $suse_rc -eq 0 ]; then
  # Zypper ...
  # https://documentation.suse.com/sles/15-SP1/html/SLES-all/cha-sw-cl.html
  # "zypper install --help" mentions -y (--no-confirm, note: must be after install, -r repo)
  # See also /etc/nscd.conf
  # yast2-nis-client is a graphical utility
  # rpcbind
  # Note: there are logs of script runs in: /var/adm/autoinstall/logs/*.sh
  # ZYPP_LOCKFILE_ROOT="/var/run/autoyast"
  ps -ef >> {{{ user.homedir }}}/processes.txt
  zypper removelock >> $POST_LOG
  zyp_rc=$?
  echo "Zypper rm-locks: rc=$zyp_rc" >> $POST_LOG
  echo "Zypper pid: "`cat /var/run/zypp.pid` >> $POST_LOG
  # kill `cat /var/run/zypp.pid`
  echo "ZYPP_LOCKFILE_ROOT=$ZYPP_LOCKFILE_ROOT" >> $POST_LOG
  ls -al /etc/zypp/locks >> $POST_LOG
  echo "Zypper locks listing follows" >> $POST_LOG
  zypper locks >> $POST_LOG 2>&1
  zyp_rc=$?
  echo "zypper-locks: rc=$zyp_rc"
  echo "Start Zypper (NIS) Install ..." >> $POST_LOG
  # NOTE: ypbind is missing from ISO, autoyast (os_fixup.sh can't add) adds a repo that has it.
  # Somehow autofs, nscd missing. nfs-client ypbind, yp-tools ok (ypbind deps on rpcbind, yp-tools).
  # --no-recommends
  zypper install -y  yp-tools ypbind nfs-client autofs nscd >> $POST_LOG 2>&1
  zyp_rc=$?
  echo "Zypper (NIS) Install: rc=$zyp_rc" >> $POST_LOG
  # OLD: ~/nis_setup_report.txt
  # Prefer old-school universal NIS setup by disabling Suse specific config as advised by SUSE.
  # NETCONFIG_NIS_POLICY='' Disables netconfig config updates to yp.conf
  # NETCONFIG_NIS_SETDOMAINNAME='' Allows domainname to come from /etc/defaultdomain (old school)
  perl -pi -e 's/^NETCONFIG_NIS_POLICY=.+/NETCONFIG_NIS_POLICY=""/;' /etc/sysconfig/network/config
  perl -pi -e 's/^NETCONFIG_NIS_SETDOMAINNAME=.+/NETCONFIG_NIS_SETDOMAINNAME=""/;' /etc/sysconfig/network/config
  # Suse-ONLY Mods in /etc/sysconfig/network/config (NETCONFIG_NIS_*)
  # Note: What is delimiter in NETCONFIG_NIS_STATIC_SERVERS value ?
  # Answer: space (https://github.com/openSUSE/sysconfig/blob/master/doc/README.netconfig)
  perl -pi -e 's/^NETCONFIG_NIS_STATIC_SERVERS=.+/NETCONFIG_NIS_STATIC_SERVERS="{{{ net.nisservers_str }}}"/;' /etc/sysconfig/network/config
  perl -pi -e 's/^NETCONFIG_NIS_STATIC_DOMAIN=.+/NETCONFIG_NIS_STATIC_DOMAIN="{{{ net.nisdomain }}}"/;'     /etc/sysconfig/network/config
fi
##############################
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
    perl -pi -e 's/^NISDOMAIN=.+/NISDOMAIN={{{ net.nisdomain }}}/;' /etc/sysconfig/network
  else
    echo "NISDOMAIN=$NIS_DOM" >> /etc/sysconfig/network
  fi
fi

# Simple NIS-favouring naming ordering (removed inlining)
wget "http://{{ httpserver }}/scripts/nsswitch.conf" -O /etc/nsswitch.conf

# TODO: /etc/yp.conf (NIS servers: "ypserver nis1.mycomp.com" ....)
if [ -z "$NIS_SERVERS" ]; then
  echo "Warning: No NIS server configured !" >> $POST_LOG
  exit 0
else
  # suse seems to have yp.conf as symlink. Unlink first
  #echo -n "" > /etc/yp.conf
  rm /etc/yp.conf; touch /etc/yp.conf
  echo "Add NIS servers: $NIS_SERVERS to /etc/yp.conf ." >> $POST_LOG
  echo "NIS servers var: $NIS_SERVERS ... literal: {{{ net.nisservers_str }}}." >> $POST_LOG
  # Is this line /bin/sh incompatible ?
  for NSERV in $NIS_SERVERS; do echo "ypserver $NSERV" >> /etc/yp.conf; done
  ls -al /etc/yp.conf >> $POST_LOG
fi

echo "Restart NIS-client, autofs, nscd services" >> $POST_LOG
# Ubu 18: nis, but also ypbind works
#service ypbind enable
#service ypbind stop; service ypbind start
#service autofs enable
#service autofs stop; sleep 5; service autofs start
#service nscd enable
#service nscd stop; sleep 5; service nscd start
# Daemon useage: rpcbind (6,7) portmap (8)
# Centos/RH 8: systemctl enable --now ypbind portmap
systemctl enable --now ypbind rpcbind autofs nscd 
# systemctl start ypbind autofs nscd rpcbind

