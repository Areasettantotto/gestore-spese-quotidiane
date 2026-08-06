#!/usr/bin/env bash
set -euo pipefail

readonly EXPECTED_BASENAME="Gestore-Spese-SaaS-AI-Context"

usage() {
  echo "Usage: scripts/sync-ai-context-mirror.sh --dry-run | --apply" >&2
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

if [[ $# -ne 1 ]]; then
  usage
fi

MODE=""
case "$1" in
  --dry-run) MODE="dry-run" ;;
  --apply) MODE="apply" ;;
  *) usage ;;
esac

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" \
  || die "repository Git non disponibile (git rev-parse fallito)"
cd -- "$REPO_ROOT" 2>/dev/null \
  || die "impossibile entrare nella root del repository"

# Apply requires a fully clean working tree before any destination I/O or operational output.
if [[ "$MODE" == "apply" ]]; then
  GIT_STATUS="$(git status --porcelain --untracked-files=all 2>/dev/null)" \
    || die "verifica stato Git fallita"
  [[ -z "$GIT_STATUS" ]] || die "working tree non pulita; apply rifiutato"
fi

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

LIST_FILE="$(mktemp)"
trap 'rm -f -- "$LIST_FILE"' EXIT

FILE_COUNT=0
while IFS= read -r path; do
  [[ -n "$path" ]] || continue
  if is_allowed_path "$path"; then
    printf '%s\n' "$path" >>"$LIST_FILE"
    FILE_COUNT=$((FILE_COUNT + 1))
  fi
done < <(git ls-files)

[[ "$FILE_COUNT" -gt 0 ]] || die "lista file mirror vuota"

while IFS= read -r path; do
  is_allowed_path "$path" || die "percorso non ammesso nella lista: ${path}"
  [[ "$path" != /* ]] || die "percorso non relativo: ${path}"
  [[ "$path" != *'..'* ]] || die "percorso contiene '..': ${path}"
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
done <"$LIST_FILE"

echo "mode: ${MODE}"
echo "file_count: ${FILE_COUNT}"
echo "destination_basename: ${DEST_BASENAME}"
echo "files:"
while IFS= read -r path; do
  printf '  %s\n' "$path"
done <"$LIST_FILE"

if [[ "$MODE" == "dry-run" ]]; then
  if ! rsync -avhn --files-from="$LIST_FILE" ./ "${DEST}/" >/dev/null 2>&1; then
    die "rsync dry-run fallito"
  fi
  echo "result: OK (dry-run)"
  exit 0
fi

if ! rsync -avh --files-from="$LIST_FILE" ./ "${DEST}/" >/dev/null 2>&1; then
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

echo "verify: byte-compare OK (${VERIFY_OK} file)"
echo "result: OK (apply)"
