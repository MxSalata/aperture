#!/bin/bash
# Run by iris-main once IRIS is up (see start.sh). On the first start only, IRIS_PASSWORD becomes
# the password of the accounts the image build gave SYS, the list init.script wrote to
# image-accounts; then a marker records that it was applied. So a restart keeps every password
# changed in IRIS since, and an account an administrator created is never touched. The marker
# lives with IRIS's data: in the durable directory when ISC_DATA_DIRECTORY is set, otherwise in the
# container, which a new container (docker compose up after a change to .env) starts without.
# IRIS reads the password from its own environment, so it is never written to a file, a command
# line or the log. A password IRIS's rules refuse (by default 3 to 32 letters, digits and
# punctuation) is reported, the accounts keep the one they had, and the next start tries again.
# Always exits 0: a refused password must not stop IRIS.
marker="${ISC_DATA_DIRECTORY:-/home/irisowner/aperture}/.aperture-password-applied"
if [ -e "$marker" ]; then
  echo "Aperture image: IRIS_PASSWORD was applied at the first start; the accounts keep their passwords"
  exit 0
fi
# One statement per line: iris session reads its input line by line. The session ends with exit
# code 1 when no account took the password.
if iris session IRIS -U %SYS <<'OBJECTSCRIPT'
Set pw=$System.Util.GetEnviron("IRIS_PASSWORD"),n=0,failed=0,list=##class(%Stream.FileCharacter).%New(),sc=list.LinkToFile("/home/irisowner/aperture/image-accounts")
While 'list.AtEnd { Set u=$ZStrip(list.ReadLine(),"<>W")  Continue:(u="")||'##class(Security.Users).Exists(u)  Kill p  Set p("Password")=pw,p("ChangePassword")=0,sc=##class(Security.Users).Modify(u,.p)  If sc { Set n=n+1 } Else { Set failed=failed+1  Write "Aperture image: IRIS_PASSWORD not set for ",u,": ",$system.Status.GetErrorText(sc),! } }
Write "Aperture image: IRIS_PASSWORD is the password of the image's ",n," accounts",$Select(failed:", "_failed_" refused it",1:""),!
Kill pw,p,list
If failed||'n Do $system.Process.Terminate($job,1)
Halt
OBJECTSCRIPT
then
  touch "$marker"
fi
exit 0
