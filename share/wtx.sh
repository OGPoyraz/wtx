# Usage: eval "$(wtx init zsh)" or source this file

wtx() {
  if [ "$1" = "cd" ]; then
    shift
    local _wtx_path
    _wtx_path=$(command wtx _resolve-path "$@") || return $?
    builtin cd "$_wtx_path" || return $?
  else
    command wtx "$@"
  fi
}
