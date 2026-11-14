#!/usr/bin/env bash
set -euo pipefail

hook_input="$(cat)"

# PostToolUse is emitted for every successful tool. Only inspect file-editing tools.
if ! printf '%s' "$hook_input" | grep -Eq \
  '"(tool_name|toolName)"[[:space:]]*:[[:space:]]*"(edit|create|apply_patch|write_file|replace_string_in_file)"'; then
  exit 0
fi

changed_files="$(
  {
    git diff --name-only HEAD
    git ls-files --others --exclude-standard
  } | sort -u
)"

if [[ -z "$changed_files" ]]; then
  exit 0
fi

api_patterns=()
client_patterns=()

if printf '%s\n' "$changed_files" | grep -Eq \
  '^(apps/api/src/app/endpoints/import/|apps/api/src/services/import/)'; then
  api_patterns+=(
    '(^|/)(import\.controller|import-data\.dto|import\.service)\.spec\.ts$'
  )
fi

if printf '%s\n' "$changed_files" | grep -Eq \
  '^apps/api/src/services/activities/'; then
  api_patterns+=('(^|/)activities\.service\.spec\.ts$')
fi

if printf '%s\n' "$changed_files" | grep -Eq \
  '^apps/api/src/app/endpoints/accounts/'; then
  api_patterns+=('(^|/)account\.helper\.spec\.ts$')
fi

if printf '%s\n' "$changed_files" | grep -Eq \
  '^(apps/api/src/app/portfolio/|apps/api/src/services/portfolio-table/)'; then
  api_patterns+=('(^|/)portfolio/(calculator/.*|portfolio\.service)\.spec\.ts$')
fi

if printf '%s\n' "$changed_files" | grep -Eq \
  '^apps/client/src/app/(pages/(portfolio/|accounts)/|components/portfolio-)'; then
  client_patterns+=('(^|/)portfolio.*\.spec\.ts$')
fi

if [[ "${#api_patterns[@]}" -eq 0 && "${#client_patterns[@]}" -eq 0 ]]; then
  exit 0
fi

run_targeted_tests() {
  local project="$1"
  local patterns=("${@:2}")
  local pattern

  for pattern in "${patterns[@]}"; do
    printf 'Running targeted %s tests: %s\n' "$project" "$pattern" >&2
    npx dotenv-cli -e .env.example -- npx nx test "$project" \
      --testPathPatterns="$pattern" --runInBand --passWithNoTests
  done
}

if [[ "${#api_patterns[@]}" -gt 0 ]]; then
  run_targeted_tests api "${api_patterns[@]}"
fi

if [[ "${#client_patterns[@]}" -gt 0 ]]; then
  run_targeted_tests client "${client_patterns[@]}"
fi

printf '{"continue":true,"systemMessage":"Targeted validation passed for relevant changed areas."}\n'
