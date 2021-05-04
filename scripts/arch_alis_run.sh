#!/bin/bash -x
# TEMPLATE_WITH: global
# ALIS (Arch Linux Install Script) based Arch Linux Install orchestration.
# https://github.com/picodotdev/alis
# Start the system with lastest Arch Linux installation media (works
# at least as of 2020-10).
# Usage: Add to linux kernel CL: script=http://yourlinetserv.my.com:3000/scripts/arch_alis_run.sh
# This will be picked up (downloaded and executed) by arch root login script (See arch /root/*).
curl "http://{{ httpserver }}/installevent/start?uid=$UID&path="`pwd` || true
# Load keymap
loadkeys us
# Original: Run curl to download and run a (~50 l.) script to download
# and chmod +x ~ 8x scripts that implement the alis system.
# Alt (short-url): curl -sL https://bit.ly/2F3CATp | bash
# curl https://raw.githubusercontent.com/picodotdev/alis/master/download.sh | bash
# Linetboot: in the interest of minimizing indirection inline the essential
# downloads in here = simplify (e.g. fresh ramdisk => no rm needed, no asciinema,
# no recovery as this is presumed to be a new install).
export ALIS_COMPS="alis.sh alis-reboot.sh"
export ALIS_GITHUB_BASEURL="https://raw.githubusercontent.com/picodotdev/alis/master"
for script in $ALIS_COMPS
do
  curl -O $ALIS_GITHUB_BASEURL/$script
  chmod a+x $script
done
# Original: Edit alis.conf and change variables values with your preferences
# vim alis.conf
# Linetboot: Download auto-generated alis.conf from linetboot server
curl -O http://{{ httpserver }}/alis.conf
echo "Downloaded ALIS scripts and dynamic config to: "`pwd`
# Start Install - will WIPE EVERYTHING on machine and auto-install new Arch !
./alis.sh
# Run misc post scripts. Do wget or curl -O
curl "http://{{ httpserver }}/installevent/post?uid=$UID&path="`pwd` || true
{{#postscripts}}
curl -O "http://{{ httpserver }}/scripts/{{{ . }}}"
chmod a+x {{{ . }}}
./{{{ . }}}
{{/postscripts}}
curl "http://{{ httpserver }}/installevent/end?uid=$UID&path="`pwd` || true
#./alis-reboot.sh
