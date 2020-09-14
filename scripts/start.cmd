:: Test snippet to see if this file gets launched.
:: Seems to tolerate bare "\n" fine.
cmd.exe
pause

echo "Hello and welcome to Windows install"
:: Note: after WInPE boots the main drive seems to be x:
:: and active dir seems to be \windows\system32
dir x:\
:: Detect devices and load drivers (\windows\system32\wpeinit.exe)
wpeinit.exe
:: Enable (TCP/IP) Networking
ipconfig.exe
:: Mount final install network share
:: Pass dummy creds to succeed /user:user pass
net use I: \\{{ smbserver }}\isomnt /user:user pass
:: Launch wget and get Autounttend.xml from http ?
:: (e.g. https://eternallybored.org/misc/wget/ - EXE)
:: I:\wget.exe http://{{httpserver}}/Autounattend.xml
:: Run installer from network drive
:: Pops up a "Windows Setup" dialog with lang, time/curr fmts and KB settings
:: and button to proceed (Next). Does not seem to run A..xml
:: (even is in same but not current dir) as the settings are in
:: A...xml
:: Accepts /unattend:filename option
I:\setup.exe
:: If run from x:\ rename setup.exe.orig