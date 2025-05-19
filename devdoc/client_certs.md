#  Client Certificates

Google: ssl certificate authentication process
Aka: TLS Web client authentication, SSL/TLS WWW Client Authentication

## Creating Cert

Client creates a key-certificate pair (much like server), keeps
private key secret. Client must posess both private and public key to prove
to server it can encrypt / decrypt with them (proof of "ownershp of certificate").
The public key of the client certificate (and its issuing authority) are trusted by the server.
The openssl process of creating cert is very much like process for server cert (!)

## Creating cert (and private key)

Create openssl.conf (Used implicitly by `openssl req ...` command)
```
distinguished_name = req_distinguished_name
# This section could have props. given in IBM article
# https://www.ibm.com/docs/en/hpvs/1.2.x?topic=reference-openssl-configuration-examples
[req_distinguished_name]
[v3_req_client]
# See: https://www.openssl.org/docs/manmaster/man5/x509v3_config.html
extendedKeyUsage = clientAuth
subjectAltName = otherName:1.3.6.1.4.1.311.20.2.3;UTF8:{{ username }}@localhost
```

Then run (Read `man openssl-req` for details, -x509 - self-signed, See: -addext ext):
```
# Make openssl use config
export OPENSSL_CONF=openssl.conf
# Run openssl (Old 1.1.1: newkey, -nodes: no key encryption / passphrase)
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 -out cert.pem -outform PEM -keyout cert_key.pem -subj "/CN=$USERNAME" -extensions v3_req_client
# Compare to Debian Server side cert. gen. The below relies on interactive prompting, not config file.
# Orig example saves certs to /etc/ssl/localcerts/, stripped to be easier to test (e.g. /tmp).
# Ubu 18 openssl 1.1.1 (Sep 218) does not recognize noenc (New 3.X directive for no passphrase)
# Asks:
# - PEM priv key passphrase (1.1.1),
# - All following for Issuer / Subject (DN)
#   - Country name (e.g. US), State or Province Name (e.g. NY),
#   - Locality Name (e.g. city, "New York"), Organization Name (eg, company, "My Company"),
#   - Organizational Unit Name (eg, section, "Research and Development"),
#   - Common Name (e.g. server FQDN or YOUR name), Email Address
# openssl req -new -x509 -days 365 -noenc -out apache.pem -keyout apache.key
# Digital ocean (Deb 10, oldstyle)
# sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout apache.key -out apache.crt
```

## Auth process

- Server requests cert, client sends cert
- Client sends private key encrypted with server's public key
- Server verifies key by decrypting clients private key with its own secret key

## Ansible Client Certificate

After creating Cert (and key) on Linux Ansible control host:
- using the "certificates" MMC snapin to import cert to 2 stores:
  - "Trusted People" store
  - If self-signed same cet also "Trusted Root Certification Authorities" store
  - If official, place CA cert to "Trusted Root Certification Authorities" store


## References

- Explanations with client-server sequence diagram https://comodosslstore.com/blog/what-is-ssl-tls-client-authentication-how-does-it-work.html
- Ansible cert auth: https://vnuggets.com/2019/08/08/ansible-certificate-authentication-to-windows/
- Debian Self Signed Cert: https://wiki.debian.org/Self-Signed_Certificate (as a ref article
  for simple server side cert creation)
- problems making Certificate Request (string too short): https://github.com/davidmoten/jenkins-ec2-https/issues/1
- Digital Ocean - creating Self signed for Debian 10: https://www.digitalocean.com/community/tutorials/how-to-create-a-self-signed-ssl-certificate-for-apache-in-debian-10
- https://www.openssl.org/docs/manmaster/man5/x509v3_config.html
- IBM On openssl config file (including req_distinguished_name) https://www.ibm.com/docs/en/hpvs/1.2.x?topic=reference-openssl-configuration-examples
