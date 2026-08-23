#!/usr/bin/env bash
# Shared helpers for listing and deleting Neon preview branches (preview/pr-<number>).
set -euo pipefail

NEON_API_BASE="${NEON_API_BASE:-https://console.neon.tech/api/v2}"
PREVIEW_BRANCH_PATTERN='^preview/pr-[0-9]+$'

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

neon_request() {
  curl --fail --silent --show-error \
    -H "Authorization: Bearer ${NEON_API_KEY}" \
    -H "Accept: application/json" \
    "$@"
}

neon_list_branches_json() {
  local search="${1:-}"
  local cursor=""
  local merged='[]'

  while :; do
    local url="${NEON_API_BASE}/projects/${NEON_PROJECT_ID}/branches?limit=100"
    if [ -n "$search" ]; then
      url="${url}&search=$(printf '%s' "$search" | jq -sRr @uri)"
    fi
    if [ -n "$cursor" ]; then
      url="${url}&cursor=$(printf '%s' "$cursor" | jq -sRr @uri)"
    fi

    local response
    response="$(neon_request "$url")"

    local page
    page="$(printf '%s' "$response" | jq -c '.branches // []')"
    merged="$(jq -s 'add' <<< "$merged"$'\n'"$page")"

    cursor="$(printf '%s' "$response" | jq -r '.pagination.next // empty')"
    if [ -z "$cursor" ]; then
      break
    fi
  done

  jq -nc --argjson branches "$merged" '{branches: $branches}'
}

neon_find_branch_id_by_name() {
  local branch_name="$1"
  local branches_json="$2"

  printf '%s' "$branches_json" | jq -r --arg name "$branch_name" \
    '.branches[] | select(.name == $name) | .id' | head -n 1
}

neon_child_branch_ids() {
  local parent_id="$1"
  local branches_json="$2"

  printf '%s' "$branches_json" | jq -r --arg parent "$parent_id" \
    '.branches[] | select(.parent_id == $parent) | .id'
}

neon_delete_branch() {
  local branch_id="$1"
  local tmp_body http_code

  tmp_body="$(mktemp)"
  http_code="$(neon_request -o "$tmp_body" -w '%{http_code}' -X DELETE \
    "${NEON_API_BASE}/projects/${NEON_PROJECT_ID}/branches/${branch_id}")"

  if [ "$http_code" -ge 400 ]; then
    echo "Failed to delete Neon branch ${branch_id}: HTTP ${http_code}" >&2
    cat "$tmp_body" >&2
    rm -f "$tmp_body"
    return 1
  fi

  rm -f "$tmp_body"
}

neon_delete_branch_tree() {
  local branch_id="$1"
  local branches_json="$2"

  while IFS= read -r child_id; do
    [ -n "$child_id" ] || continue
    neon_delete_branch_tree "$child_id" "$branches_json"
  done < <(neon_child_branch_ids "$branch_id" "$branches_json")

  neon_delete_branch "$branch_id"
}

neon_delete_preview_branch_by_name() {
  local branch_name="$1"
  local branches_json="$2"
  local branch_id

  branch_id="$(neon_find_branch_id_by_name "$branch_name" "$branches_json")"
  if [ -z "$branch_id" ] || [ "$branch_id" = "null" ]; then
    echo "No Neon branch found for ${branch_name}"
    return 0
  fi

  neon_delete_branch_tree "$branch_id" "$branches_json"
  echo "Deleted ${branch_name}"
}

neon_list_preview_branches_tsv() {
  local branches_json="$1"

  printf '%s' "$branches_json" | jq -r \
    --arg pattern "$PREVIEW_BRANCH_PATTERN" \
    '.branches[] | select(.name != null and (.name | test($pattern))) | [.id, .name] | @tsv'
}

github_list_open_pr_numbers() {
  local page=1

  while :; do
    local response count
    response="$(curl --fail --silent --show-error \
      -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls?state=open&per_page=100&page=${page}")"

    count="$(printf '%s' "$response" | jq 'length')"
    printf '%s' "$response" | jq -r '.[].number'

    if [ "$count" -lt 100 ]; then
      break
    fi

    page=$((page + 1))
  done
}

cmd_delete_preview_branch() {
  require_env NEON_API_KEY
  require_env NEON_PROJECT_ID
  require_env BRANCH_NAME

  local branches_json
  branches_json="$(neon_list_branches_json "$BRANCH_NAME")"
  neon_delete_preview_branch_by_name "$BRANCH_NAME" "$branches_json"
}

cmd_reconcile_preview_branches() {
  require_env NEON_API_KEY
  require_env NEON_PROJECT_ID
  require_env GITHUB_TOKEN
  require_env GITHUB_REPOSITORY

  local open_pr_numbers branches_json failures=0

  open_pr_numbers="$(github_list_open_pr_numbers)"
  branches_json="$(neon_list_branches_json "preview/pr")"

  while IFS=$'\t' read -r branch_id branch_name; do
    [ -n "$branch_id" ] || continue
    local pr_number="${branch_name#preview/pr-}"

    if printf '%s\n' "$open_pr_numbers" | grep -qx "$pr_number"; then
      echo "Keeping ${branch_name} because PR #${pr_number} is open"
      continue
    fi

    if neon_delete_branch_tree "$branch_id" "$branches_json"; then
      echo "Deleted orphaned ${branch_name}"
    else
      echo "Failed to delete orphaned ${branch_name}" >&2
      failures=$((failures + 1))
    fi
  done < <(neon_list_preview_branches_tsv "$branches_json")

  if [ "$failures" -gt 0 ]; then
    echo "Reconciliation finished with ${failures} deletion failure(s)" >&2
    exit 1
  fi

  echo "Reconciliation complete"
}

main() {
  local command="${1:-}"
  case "$command" in
    delete-preview-branch)
      cmd_delete_preview_branch
      ;;
    reconcile-preview-branches)
      cmd_reconcile_preview_branches
      ;;
    *)
      echo "Usage: $0 delete-preview-branch|reconcile-preview-branches" >&2
      exit 1
      ;;
  esac
}

main "$@"
