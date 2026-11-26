# Local GNOME desktop for dev/start-dev.sh.
# Debian trixie ships GNOME 48. After changing this file, run:
#   ./dev/start-dev.sh rebuild
FROM debian:trixie
ENV LANG en_US.UTF-8
ENV SHELL=/bin/bash

# cleanup script for use after apt-get
RUN echo '#! /bin/sh\n\
  env DEBIAN_FRONTEND=noninteractive apt-get autoremove -y\n\
  apt-get clean\n\
  find /var/lib/apt/lists -type f -delete\n\
  find /var/cache -type f -delete\n\
  find /var/log -type f -delete\n\
  exit 0\n\
  ' > /cleanup && chmod +x /cleanup

# basics
RUN apt-get update && \
  env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  locales locales-all && \
  env DEBIAN_FRONTEND=noninteractive apt-get install -y \
  at-spi2-core \
  dbus \
  dbus-x11 \
  libpulse0 \
  procps \
  systemd \
  inotify-tools \
  x11-xserver-utils && \
  /cleanup

# Gnome
# Recommends stay installed. A Shell session is missing pieces without them.
RUN apt-get update && \
  env DEBIAN_FRONTEND=noninteractive apt-get install -y \
  gnome-session \
  gnome-shell && \
  /cleanup

# Gnome apps
RUN apt-get update && \
  env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  gnome-text-editor \
  gnome-terminal \
  gnome-control-center \
  gnome-tweaks \
  nautilus && \
  /cleanup

# Gnome Shell extensions
RUN apt-get update && \
  env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  dconf-editor \
  gnome-shell-extension-manager && \
  /cleanup

# This is the CMD x11docker was looking for
CMD ["gnome-shell"]
