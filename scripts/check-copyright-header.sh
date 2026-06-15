#!/usr/bin/env bash
export PATH=$PATH:$(go env GOPATH)/bin

if ! command -v addlicense &> /dev/null
then
    echo "installing addlicense..."
    go install github.com/google/addlicense@latest
fi

license() {
    local year=$(date +'%Y')

    cat <<EOF
Copyright (c) ${year}, Circle Internet Group, Inc. All rights reserved.

SPDX-License-Identifier: Apache-2.0

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
EOF
}

files=("$@")
if [ "${#files[@]}" -eq 0 ]
then
  mapfile -t files < <(git diff --name-only --diff-filter=AMR --cached)
fi

set -eu
for file in "${files[@]}"
do
    if ! addlicense -check -f <(license '%f') "$file" > /dev/null 2>&1 ; then
        echo "$file is not with copyright header"
        addlicense -f <(license '%f') "$file"
    fi
done
