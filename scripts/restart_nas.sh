#!/bin/sh
set -eu
"$(dirname "$0")/stop_nas.sh" || true
"$(dirname "$0")/start_nas.sh"
