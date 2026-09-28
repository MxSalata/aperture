#!/bin/bash
# The image's entry point: IRIS through the base image's own iris-main (under tini, as the base
# image starts it), with the options the container was given (docker run ... <options>, or
# command: in docker compose). With IRIS_PASSWORD set, apply-password.sh makes it the password of
# the image's accounts once IRIS is up, at the container's first start (restarts keep the
# passwords changed since); without it they keep the demonstration password SYS the image was
# built with.
set -e
if [ -n "${IRIS_PASSWORD:-}" ]; then
  exec /iris-main "$@" --after /home/irisowner/aperture/apply-password.sh
fi
exec /iris-main "$@"
