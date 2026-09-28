# syntax=docker/dockerfile:1
# IRIS Community Edition with Aperture installed through its own IPM package: the image CI
# checks against the SysAdmin API and publishes as ghcr.io/mxsalata/aperture (docker-compose.yml
# runs it), and the one docker-compose.build.yml builds from the sources.
#
# Build context is the repository root. Only what the package needs is copied in: the manifest,
# the classes, the built portal (www/, produced by `npm run build:www`), the build-time script
# and the two start-up scripts.
#
# Default base: the official Community Edition image (no custom entrypoint), pinned by digest
# (the multi-architecture index of the 2026.2 tag, Build 221U). init.script fetches the
# InterSystems Package Manager from the community registry at build time, pinned by version and
# SHA-256; it skips that download when the base image already has it (IRIS_IMAGE build arg).
ARG IRIS_IMAGE=intersystems/iris-community:2026.2@sha256:cd2ebcab02d1ef80ec155def4418399f353d867162688c36a3705760e750bdaa
FROM ${IRIS_IMAGE}

LABEL org.opencontainers.image.title="Aperture" \
      org.opencontainers.image.description="IRIS Community 2026.2 with Aperture, a management portal on the SysAdmin REST API, installed through its IPM package" \
      org.opencontainers.image.source="https://github.com/MxSalata/aperture" \
      org.opencontainers.image.url="https://github.com/MxSalata/aperture"

# The base image runs as irisowner (uid 51773); create the module root as that user so
# IPM can read it and the copied files keep the right owner.
RUN mkdir -p /home/irisowner/aperture
WORKDIR /home/irisowner/aperture

COPY --chown=irisowner:irisowner module.xml ./
COPY --chown=irisowner:irisowner ipm ./ipm
COPY --chown=irisowner:irisowner www ./www
COPY --chown=irisowner:irisowner docker/iris/init.script ./init.script
COPY --chown=irisowner:irisowner --chmod=755 docker/iris/start.sh docker/iris/apply-password.sh ./

# Configure at build time, the pattern of the InterSystems templates: start IRIS, run the
# script (the accounts' demonstration password, zpm "load" of this package, then the Embedded
# Python readiness report), stop IRIS. The result is baked into the image.
RUN iris start IRIS \
 && iris session IRIS < init.script \
 && iris stop IRIS quietly

# IRIS starts as the base image starts it (tini, then iris-main, with the container's options);
# start.sh adds the step that applies IRIS_PASSWORD, when it is set, once IRIS is up at the
# container's first start.
ENTRYPOINT ["/tini", "--", "/home/irisowner/aperture/start.sh"]
