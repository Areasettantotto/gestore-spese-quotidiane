#!/usr/bin/env bash
set -euo pipefail

readonly EXPECTED_BASENAME="Gestore-Spese-SaaS-AI-Context"
readonly MANIFEST_NAME=".ai-context-mirror-manifest.txt"

usage() {
  echo "Usage: scripts/sync-ai-context-mirror.sh [--full] --dry-run | --apply | --status" >&2
  echo "  Default sync scope: HOT (handoff + index). Use --full for local docs/**/*.md and .cursor/rules/**/*.mdc." >&2
  echo "  File lists come from the local filesystem (not git ls-files). AI context may be gitignored." >&2
  exit 1
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

# Resolve a directory to a canonical absolute path without leaking paths on stderr.
safe_realpath_dir() {
  local directory="$1"
  local resolved
  resolved="$(
    cd -- "$directory" 2>/dev/null || exit 1
    pwd -P 2>/dev/null || exit 1
  )" || return 1
  printf '%s\n' "$resolved"
}

# True only for a regular local file (not a symlink).
is_regular_local_file() {
  local abs="$1"
  [[ -e "$abs" ]] || return 1
  [[ ! -L "$abs" ]] || return 1
  [[ -f "$abs" ]] || return 1
  return 0
}

SCOPE="hot"
MODE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --full)
      SCOPE="full"
      shift
      ;;
    --dry-run)
      [[ -z "$MODE" ]] || usage
      MODE="dry-run"
      shift
      ;;
    --apply)
      [[ -z "$MODE" ]] || usage
      MODE="apply"
      shift
      ;;
    --status)
      [[ -z "$MODE" ]] || usage
      MODE="status"
      shift
      ;;
    *)
      usage
      ;;
  esac
done

[[ -n "$MODE" ]] || usage

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" \
  || die "repository Git non disponibile (git rev-parse fallito)"
cd -- "$REPO_ROOT" 2>/dev/null \
  || die "impossibile entrare nella root del repository"

resolve_dest() {
  if [[ -n "${AI_CONTEXT_MIRROR_DIR:-}" ]]; then
    DEST="${AI_CONTEXT_MIRROR_DIR}"
  else
    CONFIG_FILE="${REPO_ROOT}/.git/ai-context-mirror-path"
    [[ -f "$CONFIG_FILE" ]] || die "configurazione locale mirror assente (.git/ai-context-mirror-path)"
    DEST="$(
      head -n 1 "$CONFIG_FILE" 2>/dev/null \
        | tr -d '\r' 2>/dev/null \
        | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' 2>/dev/null
    )" || die "lettura configurazione locale mirror fallita"
    [[ -n "$DEST" ]] || die "configurazione locale mirror vuota"
  fi
}

is_allowed_path() {
  local path="$1"

  [[ "$path" != /* ]] || return 1
  [[ "$path" != *'..'* ]] || return 1

  if [[ "$path" == docs/* && "$path" == *.md ]]; then
    return 0
  fi
  if [[ "$path" == .cursor/rules/* && "$path" == *.mdc ]]; then
    return 0
  fi
  return 1
}

is_hot_path() {
  case "$1" in
    docs/chatgpt-handoff.md|docs/ai-context-index.md) return 0 ;;
    *) return 1 ;;
  esac
}

# Enumerate authorized local regular files (deterministic). Does not use git ls-files.
# find -P: never follow symlinks; -type f: regular files only (symlinks excluded).
enumerate_local_ai_files() {
  {
    if [[ -d docs ]]; then
      find -P docs -type f -name '*.md' -print 2>/dev/null || true
    fi
    if [[ -d .cursor/rules ]]; then
      find -P .cursor/rules -type f -name '*.mdc' -print 2>/dev/null || true
    fi
  } | LC_ALL=C sort -u | while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    is_allowed_path "$path" || continue
    if ! is_regular_local_file "${REPO_ROOT}/${path}"; then
      continue
    fi
    printf '%s\n' "$path"
  done
}

append_list_path() {
  local path="$1"
  printf '%s\n' "$path" >>"$LIST_FILE"
  FILE_COUNT=$((FILE_COUNT + 1))
}

build_file_list() {
  LIST_FILE="$(mktemp)"
  FILE_COUNT=0

  if [[ "$SCOPE" == "hot" ]]; then
    local hot_path abs
    for hot_path in docs/chatgpt-handoff.md docs/ai-context-index.md; do
      abs="${REPO_ROOT}/${hot_path}"
      is_allowed_path "$hot_path" || die "percorso HOT non ammesso: ${hot_path}"
      is_regular_local_file "$abs" \
        || die "file HOT assente o non e' un file regolare locale: ${hot_path}"
      append_list_path "$hot_path"
    done
  else
    local path
    while IFS= read -r path; do
      [[ -n "$path" ]] || continue
      append_list_path "$path"
    done < <(enumerate_local_ai_files)
  fi

  if [[ "$SCOPE" == "hot" && "$FILE_COUNT" -eq 0 ]]; then
    die "lista HOT vuota (servono docs/chatgpt-handoff.md e docs/ai-context-index.md sul filesystem locale)"
  fi
  [[ "$FILE_COUNT" -gt 0 ]] || die "lista file mirror vuota"
}

validate_list() {
  while IFS= read -r path; do
    is_allowed_path "$path" || die "percorso non ammesso nella lista: ${path}"
    [[ "$path" != /* ]] || die "percorso non relativo: ${path}"
    [[ "$path" != *'..'* ]] || die "percorso contiene '..': ${path}"
    if [[ "$SCOPE" == "hot" ]]; then
      is_hot_path "$path" || die "percorso non HOT: ${path}"
    fi
    case "$path" in
      docs/*)
        [[ "$path" == *.md ]] || die "estensione non valida per docs/: ${path}"
        ;;
      .cursor/rules/*)
        [[ "$path" == *.mdc ]] || die "estensione non valida per .cursor/rules/: ${path}"
        ;;
      *)
        die "prefisso non ammesso: ${path}"
        ;;
    esac
    is_regular_local_file "${REPO_ROOT}/${path}" \
      || die "file assente o non regolare nella lista: ${path}"
  done <"$LIST_FILE"
}

write_manifest() {
  local dest_dir="$1"
  local branch head_sha ts
  branch="$(git branch --show-current 2>/dev/null || echo unknown)"
  head_sha="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo unknown)"
  {
    echo "schema: gestore-spese-ai-context-mirror-manifest/v1"
    echo "timestamp_utc: ${ts}"
    echo "branch: ${branch}"
    echo "head: ${head_sha}"
    echo "scope: ${SCOPE}"
    echo "mode: apply"
    echo "file_count: ${FILE_COUNT}"
    echo "files:"
    while IFS= read -r path; do
      printf '  %s\n' "$path"
    done <"$LIST_FILE"
    echo "one_way: locale_to_drive"
    echo "delete: never"
    echo "source: local_filesystem"
  } >"${dest_dir}/${MANIFEST_NAME}"
}

config_present="no"
if [[ -n "${AI_CONTEXT_MIRROR_DIR:-}" ]]; then
  config_present="yes(env)"
elif [[ -f "${REPO_ROOT}/.git/ai-context-mirror-path" ]]; then
  config_present="yes(file)"
fi

if [[ "$MODE" == "status" ]]; then
  HOT_COUNT=0
  FULL_COUNT=0
  while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    FULL_COUNT=$((FULL_COUNT + 1))
    if is_hot_path "$path"; then
      HOT_COUNT=$((HOT_COUNT + 1))
    fi
  done < <(enumerate_local_ai_files)

  WT_STATE="clean"
  if [[ -n "$(git status --porcelain --untracked-files=all 2>/dev/null || true)" ]]; then
    WT_STATE="dirty"
  fi

  echo "mode: status"
  echo "default_scope: hot"
  echo "config_present: ${config_present}"
  echo "working_tree: ${WT_STATE}"
  echo "note_working_tree: clean-tree guard applies to Git-tracked paths only; gitignored AI context edits do not dirty the tree"
  echo "hot_local_count: ${HOT_COUNT}"
  echo "full_local_count: ${FULL_COUNT}"
  echo "hot_files:"
  echo "  docs/chatgpt-handoff.md"
  echo "  docs/ai-context-index.md"
  for hot_path in docs/chatgpt-handoff.md docs/ai-context-index.md; do
    if ! is_regular_local_file "${REPO_ROOT}/${hot_path}"; then
      echo "hot_missing_or_not_regular: ${hot_path}"
    fi
  done
  echo "manifest_destination_only: ${MANIFEST_NAME}"
  echo "one_way: locale_to_drive"
  echo "delete: never"
  echo "note: HOT/FULL enumerate local regular files in docs/**/*.md and .cursor/rules/**/*.mdc; independent of Git tracking"
  echo "result: OK (status)"
  exit 0
fi

# Apply requires a fully clean working tree (Git-tracked paths) before any destination I/O.
# After AI context is gitignored, edits under docs/**/*.md and .cursor/rules/**/*.mdc
# are invisible to Git and do not satisfy or violate this guard by themselves.
if [[ "$MODE" == "apply" ]]; then
  GIT_STATUS="$(git status --porcelain --untracked-files=all 2>/dev/null)" \
    || die "verifica stato Git fallita"
  [[ -z "$GIT_STATUS" ]] || die "working tree non pulita (path Git-tracked); apply rifiutato"
fi

resolve_dest

DEST_BASENAME="$(basename -- "$DEST" 2>/dev/null)" \
  || die "basename destinazione non risolvibile"
[[ -e "$DEST" ]] || die "destinazione mirror assente"
[[ -d "$DEST" ]] || die "destinazione mirror non e' una directory"
[[ "$DEST_BASENAME" == "$EXPECTED_BASENAME" ]] \
  || die "basename destinazione non valido (atteso: ${EXPECTED_BASENAME})"

REPO_ABS="$(safe_realpath_dir "$REPO_ROOT")" \
  || die "risoluzione root repository fallita"
DEST_ABS="$(safe_realpath_dir "$DEST")" \
  || die "risoluzione destinazione mirror fallita"
[[ "$DEST_ABS" != "$REPO_ABS" ]] \
  || die "destinazione coincide con la root del repository"

LIST_FILE=""
trap '[[ -n "${LIST_FILE}" && -f "${LIST_FILE}" ]] && rm -f -- "$LIST_FILE"' EXIT
build_file_list
validate_list

echo "mode: ${MODE}"
echo "scope: ${SCOPE}"
echo "file_count: ${FILE_COUNT}"
echo "destination_basename: ${DEST_BASENAME}"
echo "files:"
while IFS= read -r path; do
  printf '  %s\n' "$path"
done <"$LIST_FILE"

if [[ "$MODE" == "dry-run" ]]; then
  # -c skips transfers when checksum matches (identical content).
  if ! rsync -avhnc --files-from="$LIST_FILE" ./ "${DEST}/" >/dev/null 2>&1; then
    die "rsync dry-run fallito"
  fi
  echo "result: OK (dry-run)"
  exit 0
fi

if ! rsync -avhc --files-from="$LIST_FILE" ./ "${DEST}/" >/dev/null 2>&1; then
  die "rsync apply fallito"
fi

VERIFY_OK=0
VERIFY_FAIL=0
while IFS= read -r path; do
  src_file="./${path}"
  dst_file="${DEST}/${path}"
  if [[ ! -f "$dst_file" ]]; then
    echo "ERROR: file mancante nel mirror: ${path}" >&2
    VERIFY_FAIL=$((VERIFY_FAIL + 1))
    continue
  fi
  if ! cmp -s -- "$src_file" "$dst_file"; then
    echo "ERROR: differenza byte rilevata: ${path}" >&2
    VERIFY_FAIL=$((VERIFY_FAIL + 1))
    continue
  fi
  VERIFY_OK=$((VERIFY_OK + 1))
done <"$LIST_FILE"

if [[ "$VERIFY_FAIL" -ne 0 ]]; then
  die "verifica post-apply fallita (${VERIFY_FAIL} file non allineati; ${VERIFY_OK} ok)"
fi

write_manifest "$DEST"

echo "verify: byte-compare OK (${VERIFY_OK} file)"
echo "manifest: written (${MANIFEST_NAME})"
echo "result: OK (apply)"
