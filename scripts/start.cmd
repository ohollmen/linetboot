:: Test snippet to see if this file gets launched
cmd.exe
pause

echo "Hello and welcome to Windows install"
dir c:\
:: Detect devices and load drivers
wpeinit.exe
:: Enable (TCP/IP) Networking
ipconfig.exe
:: Mount final install network share
:: /user:user pass
net use I: \\{{ smbserver }}\isomnt
:: Launch wget and get Autounttend.xml from  ?
:: I:\wget.exe http://{{httpserver}}/Autounattend.xml
:: Run installer from network drive
I:\setup.exe
