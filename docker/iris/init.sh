#!/bin/bash
# Runs once IRIS is up (container "-a" hook). Enables the SysAdmin API web app
# with password + JWT authentication and installs Aperture as an IRIS web app.
set -e
echo "[aperture] configuring /api/admin and installing the portal ..."
iris session IRIS < /opt/aperture/docker/iris/init.script
echo "[aperture] done"
