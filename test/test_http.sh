#!/bin/bash
# Minimal tests for http delivery.
# Currently makes assumptions about port, etc.
TEST_PATH=/tmp/linetboot_test_$$
FAKE_IP=192.168.1.76
mkdir -p $TEST_PATH
cd $TEST_PATH
TEST_URL=http://localhost:3000
# Simple GET Tests
# wget -O fname
# curl -o fname
wget "$TEST_URL/preseed.cfg?ip=$FAKE_IP" -O preseed.cfg
wget "$TEST_URL/ks.cfg?ip=$FAKE_IP" -O ks.cfg
wget "$TEST_URL/scripts/sources.list"
wget "$TEST_URL/scripts/preseed_dhcp_hack.sh"
wget "$TEST_URL/scripts/mv_homedir_for_autofs.sh"
wget "$TEST_URL/installevent/start" -O start.json
wget "$TEST_URL/installevent/done" -O done.json
echo "Results in $TEST_PATH (pushd $TEST_PATH ... to inspect)"
ls -al $TEST_PATH/*
# Addl test for replace
TESTUSER=$USER
NEW_HOME_PATH=/home_install
cp /etc/passwd .
md5sum passwd
grep $TESTUSER passwd
perl -pi -e "s/\/home\/$TESTUSER/\\$NEW_HOME_PATH\/$TESTUSER/" ./passwd
md5sum passwd
grep $TESTUSER passwd
