# IRIS Community Edition with Aperture installed through its own IPM package.
#
# Build context is the repository root (see docker-compose.yml). Only what the package
# needs is copied in: the manifest, the installer class, the built portal (www/, produced
# by `npm run build:www`) and the build-time script.
#
# Default base: the official Community Edition image (no custom entrypoint). init.script
# fetches the InterSystems Package Manager from the community registry at build time; the
# script skips that download when the base image already has it (IRIS_IMAGE build arg).
ARG IRIS_IMAGE=intersystems/iris-community:2026.2
FROM ${IRIS_IMAGE}

# The base image runs as irisowner (uid 51773); create the module root as that user so
# IPM can read it and the copied files keep the right owner.
RUN mkdir -p /home/irisowner/aperture
WORKDIR /home/irisowner/aperture

COPY --chown=irisowner:irisowner module.xml ./
COPY --chown=irisowner:irisowner ipm ./ipm
COPY --chown=irisowner:irisowner www ./www
COPY --chown=irisowner:irisowner docker/iris/init.script ./init.script

# Configure at build time, the pattern of the InterSystems templates: start IRIS, run the
# script (zpm "load" of this package, then the Embedded Python readiness report), stop IRIS.
# The result is baked into the image, so `docker compose up` needs no runtime hook.
RUN iris start IRIS \
 && iris session IRIS < init.script \
 && iris stop IRIS quietly
