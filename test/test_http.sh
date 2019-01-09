#!/bin/bash
# Minimal tests for http delivery.
# Currently makes assumptions about app server port, etc.
TEST_PATH=/tmp/linetboot_test_$$
#FAKE_IP=192.168.1.76
FAKE_IP=192.168.1.141
mkdir -p $TEST_PATH
cd $TEST_PATH
TEST_URL=http://localhost:3000
# Simple GET Tests
# wget -O fname
# curl -o fname
# Install templates
wget "$TEST_URL/preseed.cfg?ip=$FAKE_IP" -O preseed.cfg
wget "$TEST_URL/ks.cfg?ip=$FAKE_IP" -O ks.cfg
wget "$TEST_URL/sysconfig_network?ip=$FAKE_IP" -O sysconfig_network
wget "$TEST_URL/interfaces?ip=$FAKE_IP" -O interfaces
# Scripts / Data files
wget "$TEST_URL/scripts/sources.list"
wget "$TEST_URL/scripts/preseed_dhcp_hack.sh"
wget "$TEST_URL/scripts/mv_homedir_for_autofs.sh"
# Events
wget "$TEST_URL/installevent/start" -O ev_start.json
wget "$TEST_URL/installevent/done" -O ev_done.json
# Keys
wget "$TEST_URL/ssh/dsa.pub?ip=$FAKE_IP" -O ssh_host_dsa_key.pub
wget "$TEST_URL/ssh/rsa.pub?ip=$FAKE_IP" -O ssh_host_rsa_key.pub
wget "$TEST_URL/ssh/ecdsa.pub?ip=$FAKE_IP" -O ssh_host_ecdsa_key.pub
wget "$TEST_URL/ssh/ed25519.pub?ip=$FAKE_IP" -O ssh_host_ed25519_key.pub
# View
wget "$TEST_URL/list" -O hostview.json
cp /etc/passwd .
echo "Results in $TEST_PATH (pushd $TEST_PATH ... to inspect)"
ls -al $TEST_PATH/*
# Addl test for replace
TESTUSER=$USER
NEW_HOME_PATH=/home_install

md5sum passwd
grep $TESTUSER passwd
perl -pi -e "s/\/home\/$TESTUSER/\\$NEW_HOME_PATH\/$TESTUSER/" ./passwd
md5sum passwd
grep $TESTUSER passwd
