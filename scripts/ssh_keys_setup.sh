#!/bin/bash
# Generate SSH keys for user.
# TEMPLATE_WITH: user
########################### SSH #################
export PATH=/usr/sbin:/usr/bin:/sbin:/bin:{{{ homedir }}}/bin
hash -r
ldconfig
POST_LOG={{{ homedir }}}/post-log.txt

LINET_HNAME=`echo -n {{{ httpserver }}} | cut -d ':' -f 1`
# The ls does not work ?
ls -al {{{ homedir }}} >> $POST_LOG
ls -al /usr/bin/ssh-keygen >> $POST_LOG
ldd /usr/bin/ssh-keygen >> $POST_LOG
mkdir {{{ homedir }}}/.ssh/; chmod 700 {{{ homedir }}/.ssh/
touch {{{ homedir }}/.ssh/authorized_keys
# echo "{ sshkey }" >> {{{ homedir }}/.ssh/authorized_keys
chmod 0600 {{{ homedir }}/.ssh/authorized_keys
# Generate user SSH keys (and .ssh with correct rights). All (normal) output from ssh-keygen comes to stdout.
# su -p: preserve env (-su: /root/.bash_profile: Permission denied)
/bin/su -l '{{ username }}' -p -c '/usr/bin/ssh-keygen -t rsa -b 4096 -f {{{ homedir }}}/.ssh/id_rsa -N ""' >> $POST_LOG 2>&1
echo "Created SSH keys: rc=$?" >> $POST_LOG
if [ ! -d "{{{ homedir }}}/.ssh" ]; then
  echo "{{{ homedir }}}/.ssh (and keys) not created" >> $POST_LOG
  exit 0
fi
# 

# Copy linetboot public key back (can copy direct to ~/.ssh/authorized_keys)
SSH_AKFN={{{ homedir }}}/.ssh/authorized_keys
SSH_HKEY_PATH=/etc/ssh/
SSH_BK_PATH=/etc/ssh/keybackup
/bin/su -l '{{ username }}' -c "/usr/bin/curl -v -X POST -H 'content-type: application/octet-stream' http://{{{ httpserver }}}/keyxchange --data-binary @{{{ homedir }}}/.ssh/id_rsa.pub -o ${SSH_AKFN}" >> $POST_LOG 2>&1
echo "Uploaded self-key and downloaded linet-user-key (for authorized_keys): $?" >> $POST_LOG
chown {{ username }}:{{ username }} ${SSH_AKFN}
mkdir -p $SSH_BK_PATH
cp -p $SSH_HKEY_PATH/ssh_host* $SSH_BK_PATH
echo "Created backup of hostkeys: $?" >> $POST_LOG
### Hostkeys (for /etc/ssh) ####
# TODO: Only allow saving on valid content ("# Error (keypath/root missing)", )
/usr/bin/curl http://{{{ httpserver }}}/ssh/rsa > $SSH_HKEY_PATH/ssh_host_rsa_key
/usr/bin/curl http://{{{ httpserver }}}/ssh/rsa.pub > $SSH_HKEY_PATH/ssh_host_rsa_key.pub
# Grep content for "Error"
#
# mv /tmp/ssh_host_rsa_key $SSH_HKEY_PATH/ssh_host_rsa_key
# mv /tmp/ssh_host_rsa_key.pub $SSH_HKEY_PATH/ssh_host_rsa_key.pub
echo "Downloaded hostkeys to $SSH_HKEY_PATH: $?" >> $POST_LOG
# Add to ~/.ssh/known_hosts
/bin/su -l '{{ username }}' -c "ssh-keyscan -H $LINET_HNAME >> {{{ homedir }}}/.ssh/known_hosts"
echo "Scanned lineboot server hostkeys to known_hosts: $?" >> $POST_LOG
exit 0
