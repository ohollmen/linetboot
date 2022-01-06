# SSH Setup for Linetboot

Lot of functionality in Lineboot is based on SSH, where passwordless SSH
interactions muts be authorized by SSH public key authorization mechanisms.
Additionally hosts must be known to each other with SSH `known_hosts` mechanism.
Being familiar with SSH here helps *significantly*.

## Examples of Linetboot SSH usage

Linetboot uses SSH "infra" for following operations:

- Host Facts gathering (Ansible+SSH)
- SSH remote host keys archiving (by ansible and rsync, which both use SSH)
- SSH Remote connectivity / Login testing (GUI: Remote => NetProbe)
- SSH based Load and uptime probing (GUI: Remote => Load Probe)
- Remote host OS SW Package information gathering (SSH execution)
- BMC/IPMI information gathering (Ansible or SSH)
- Running Ansible Playbooks from Linetboot GUI (Ansible+SSH)
- Distributing /Syncing Docker images to remote hosts (Ansible+SSH)
- Syncing TFTP and DHCP Configs and TFTP stored binaries to respective servers by Rsync (Uses SSH as transport)
- OS Installation post install ...:
  - Host-up detection by SSH (Poll login => success => host is up)
  - Setup / post-provisioning by Ansible+SSH
- Git Deployments - Git uses SSH (or HTTPS) in all remote operations

Based on this list you probably understand how crucial SSH keys are for
Linetboot to work properly.

By default Linetboot expects the account it runs under to exist on remote hosts.

## SSH Setup to connect to remote host

While Linetboot documentation cannot be a full SSH documentation (do `man ssh`,
`man ssh-keygen` and `man ssh-copy-id` for that), here's a list of few elements of SSH config that have to be in good shape for SSH to work.

- **public/private key presence** (Typical: RSA: ~/.ssh/id_rsa and ~/.ssh/id_rsa.pub, use `ssh-keygen` to create these. Do not use passphrase as
this would trigger blocking interacticity)
- **`known_hosts` authorization** - The remote hosts must be in Linetboot (running account) `~/.ssh/known_hosts`
- **`authorized_keys` authorization** - For any non-interactive SSH connectivity Linetboot should copy its public key to remote hosts / remote account by `ssh-copy-id` (Effectively adding it to remote `~/.ssh/authorized_keys`).
- **File permissions for all `~/.ssh/*` files** - SSH is very picky (for a good reason) about `~/.ssh` file and dir permissions, these must be set to "standard SSH config file permissions" (Learn / Google these)

## 2-way operations between linetboot and remote host

Some operations between Linetboot and remote host trigger a two-way
interactions between the two. Example of this is copying SSH keys from remote host where:
- Linetboot contacts remote host with ansible (passing its own host name as destination host)
- Privileges in Ansible session get elevated to "root" with Ansible "become" mechanism
- Remote host copies the keys with `shell: rsync ...` Ansible shell execution
  to Linetboot host key archive

This pattern requires remote host to be authorized to do passwordless SSH back to Linetboot host successfully (not only as linetboot user, but root account).

<!-- illustrations: one-way, two-way, two-way with switch user -->
