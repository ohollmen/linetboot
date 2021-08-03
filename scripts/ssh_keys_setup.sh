#!/bin/bash
# Generate SSH keys for user.
# TEMPLATE_WITH: user
########################### SSH #################
export PATH=/usr/sbin:/usr/bin:/sbin:/bin:{{{ user.homedir }}}/bin
hash -r
ldconfig
POST_LOG={{{ user.homedir }}}/post-log.txt

LINET_HNAME=`echo -n {{{ httpserver }}} | cut -d ':' -f 1`
# The ls does not work ?
ls -al {{{ user.homedir }}} >> $POST_LOG
ls -al /usr/bin/ssh-keygen >> $POST_LOG
ls -al /dev/null >> $POST_LOG
ldd /usr/bin/ssh-keygen >> $POST_LOG
mkdir {{{ user.homedir }}}/.ssh/; chmod 700 {{{ user.homedir }}}/.ssh/
touch {{{ user.homedir }}}/.ssh/authorized_keys
# Store authorized (user, host) *public* keys.
#echo "{{{ linet_sshkey }}}"  >> {{{ user.homedir }}}/.ssh/authorized_keys
# Bare key is too plain (needs prefix). Use ssh-keyscan later instead
#echo "{{{ linet_hostkey }}}" >> {{{ user.homedir }}}/.ssh/known_hosts
# Universal for all *files* in ~/.ssh (but .pub can be 0644)
chmod 0600 {{{ user.homedir }}}/.ssh/authorized_keys {{{ user.homedir }}}/.ssh/known_hosts
chown -R {{ user.username }}:{{ user.username }} {{{ user.homedir }}}/.ssh
# Generate user SSH keys (and .ssh with correct rights). All (normal) output from ssh-keygen comes to stdout.
# su -p: preserve env (-su: /root/.bash_profile: Permission denied)
# Normal user: Could not open /dev/null: Permission denied
# ssh-keygen needs write access (After install -rw-r--r--)
chmod a+rw /dev/null
ls -al /dev/null >> $POST_LOG
su -l '{{ user.username }}' -p -c '/usr/bin/ssh-keygen -t rsa -b 4096 -f {{{ user.homedir }}}/.ssh/id_rsa -N ""' >> $POST_LOG 2>&1
echo "Created SSH keys: rc=$?" >> $POST_LOG
#if [ ! -d "{{{ user.homedir }}}/.ssh" ]; then
if [ ! -f "{{{ user.homedir }}}/.ssh/id_rsa.pub" ]; then
  echo "{{{ user.homedir }}}/.ssh RSA keys not created" >> $POST_LOG
  exit 0
fi
# 

# Copy linetboot public key back (can copy direct to ~/.ssh/authorized_keys)
SSH_AKFN={{{ user.homedir }}}/.ssh/authorized_keys
SSH_HKEY_PATH=/etc/ssh/
SSH_BK_PATH=/etc/ssh/keybackup
# Suse: /usr/bin/su (Others: /bin/su)
su -l '{{ user.username }}' -c "/usr/bin/curl -v -X POST -H 'content-type: application/octet-stream' http://{{{ httpserver }}}/keyxchange --data-binary @{{{ user.homedir }}}/.ssh/id_rsa.pub -o ${SSH_AKFN}" >> $POST_LOG 2>&1
echo "Uploaded self-key and downloaded linet-user-key (for authorized_keys): $?" >> $POST_LOG
chown {{ user.username }}:{{ user.username }} ${SSH_AKFN}
mkdir -p $SSH_BK_PATH
cp -p $SSH_HKEY_PATH/ssh_host* $SSH_BK_PATH
echo "Created backup of hostkeys: $?" >> $POST_LOG
### Hostkeys (for /etc/ssh) ####
# Only allow saving on valid content ("# Error (keypath/root missing)", )
# Detect if this is new host or not and act accordingly
/usr/bin/curl http://{{{ httpserver }}}/ssh/rsa > /tmp/ssh_host_rsa_key
grep 'Error' /tmp/ssh_host_rsa_key
err_sec=$?
/usr/bin/curl http://{{{ httpserver }}}/ssh/rsa.pub > /tmp/ssh_host_rsa_key.pub
grep 'Error' /tmp/ssh_host_rsa_key.pub
err_pub=$?
echo "Grep results: err_sec: $err_sec err_pub: $err_pub" >> $POST_LOG
# Grep content for "Error" or ...
# This means keys OS Install generated keys should be kept
if [ "$err_sec" -eq 0 ] || [ "$err_pub" -eq 0 ]; then
  rm -f /tmp/ssh_host_rsa_key /tmp/ssh_host_rsa_key.pub
  echo "No hostkeys could be restored - possibly new host(name)/machine HW (?): $?" >> $POST_LOG
  #exit 0
else
  mv /tmp/ssh_host_rsa_key     $SSH_HKEY_PATH/ssh_host_rsa_key
  mv /tmp/ssh_host_rsa_key.pub $SSH_HKEY_PATH/ssh_host_rsa_key.pub
  # TODO: Need chmod (pub: 0644, secret: 0600) ? 
  chmod 0644 $SSH_HKEY_PATH/ssh_host_rsa_key.pub ; chmod 0600 $SSH_HKEY_PATH/ssh_host_rsa_key
  echo "Downloaded and restored hostkeys to $SSH_HKEY_PATH: $?" >> $POST_LOG
fi

# Add to ~/.ssh/known_hosts
/bin/su -l '{{ user.username }}' -c "ssh-keyscan -H $LINET_HNAME >> {{{ user.homedir }}}/.ssh/known_hosts"
echo "Scanned lineboot server hostkeys to known_hosts: rc=$?" >> $POST_LOG
exit 0
