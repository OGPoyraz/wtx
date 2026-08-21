_wtx_get_repos() {
  local config_file
  if [ -n "$XDG_CONFIG_HOME" ]; then
    config_file="${XDG_CONFIG_HOME}/wtx/config.json"
  else
    config_file="${HOME}/.config/wtx/config.json"
  fi
  if [ -f "$config_file" ]; then
    if command -v jq >/dev/null 2>&1; then
      jq -r '.repos | keys[]' "$config_file" 2>/dev/null
    else
      grep -E '^    "[^"]+":' "$config_file" 2>/dev/null | sed 's/^    "//; s/":.*//'
    fi
  fi
}

_wtx_get_branches() {
  local config_file root postfix
  if [ -n "$XDG_CONFIG_HOME" ]; then
    config_file="${XDG_CONFIG_HOME}/wtx/config.json"
  else
    config_file="${HOME}/.config/wtx/config.json"
  fi
  if [ -f "$config_file" ] && command -v jq >/dev/null 2>&1; then
    root=$(jq -r '.root' "$config_file" 2>/dev/null)
    root="${root/#\~/$HOME}"
    postfix=$(jq -r '.postfix // "-wt"' "$config_file" 2>/dev/null)
    for repo in $(jq -r '.repos | keys[]' "$config_file" 2>/dev/null); do
      local wt_dir="${root}/${repo}${postfix}"
      if [ -d "$wt_dir" ]; then
        git -C "${root}/${repo}" worktree list --porcelain 2>/dev/null | \
          grep '^branch refs/heads/' | sed 's|^branch refs/heads/||'
      fi
    done | sort -u
  fi
}

_wtx_completions() {
  local cur prev cword
  _init_completion 2>/dev/null || {
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"
    cword=$COMP_CWORD
  }

  local subcommands="config create remove open rebase fetch sync deps ls cd status init skill"
  local config_subcommands="init show set add-repo remove-repo"
  local skill_subcommands="show path list"
  local skill_names="opencode cursor claude"
  local config_set_keys="root postfix ide default_main_branch"
  local ides="cursor code vscode code-insiders vscodium idea webstorm zed vim nvim emacs"

  local subcommand="" subsubcommand=""
  local i=1
  while [ $i -lt $cword ]; do
    local w="${COMP_WORDS[i]}"
    [[ "$w" == -* ]] && { i=$((i + 1)); continue; }
    if [ -z "$subcommand" ]; then
      subcommand="$w"
    elif { [ "$subcommand" = "config" ] || [ "$subcommand" = "skill" ]; } && [ -z "$subsubcommand" ]; then
      subsubcommand="$w"
    fi
    i=$((i + 1))
  done

  if [ "$prev" = "--repo" ] || [ "$prev" = "-r" ]; then
    local repos=$(_wtx_get_repos)
    if [[ "$cur" == *,* ]]; then
      local prefix="${cur%,*},"
      local suffix="${cur##*,}"
      COMPREPLY=($(compgen -P "$prefix" -W "$repos" -- "$suffix"))
    else
      COMPREPLY=($(compgen -W "$repos" -- "$cur"))
    fi
    return 0
  fi

  if [ "$prev" = "--ide" ]; then
    COMPREPLY=($(compgen -W "$ides" -- "$cur"))
    return 0
  fi

  if [ "$prev" = "--base" ]; then
    COMPREPLY=($(compgen -W "main master develop dev" -- "$cur"))
    return 0
  fi

  if [[ "$cur" == -* ]]; then
    local flags=""
    case "$subcommand" in
      create)  flags="-r --repo --base --verbose --dry-run --help" ;;
      remove)  flags="-f --force -r --repo --verbose --dry-run --help" ;;
      open)    flags="-r --repo --ide --verbose --dry-run --help" ;;
      rebase)  flags="--repo --verbose --dry-run --help" ;;
      fetch)   flags="--repo --verbose --dry-run --help" ;;
      sync)    flags="--repo --verbose --dry-run --help" ;;
      deps)    flags="-r --repo --install --symlink --verbose --dry-run --help" ;;
      ls)      flags="-r --repo --verbose --dry-run --help" ;;
      status)  flags="-r --repo --verbose --dry-run --help" ;;
      config)
        case "$subsubcommand" in
          add-repo) flags="--sync-files --post-create --post-sync --help" ;;
          *)        flags="--help" ;;
        esac
        ;;
      *) flags="--verbose --dry-run --help" ;;
    esac
    COMPREPLY=($(compgen -W "$flags" -- "$cur"))
    return 0
  fi

  if [ -z "$subcommand" ]; then
    COMPREPLY=($(compgen -W "$subcommands" -- "$cur"))
    return 0
  fi

  case "$subcommand" in
    config)
      if [ -z "$subsubcommand" ]; then
        COMPREPLY=($(compgen -W "$config_subcommands" -- "$cur"))
        return 0
      fi
      case "$subsubcommand" in
        set)
          [ "$prev" = "set" ] && COMPREPLY=($(compgen -W "$config_set_keys" -- "$cur")) && return 0
          ;;
        remove-repo)
          COMPREPLY=($(compgen -W "$(_wtx_get_repos)" -- "$cur"))
          return 0
          ;;
      esac
      ;;
    init)
      COMPREPLY=($(compgen -W "bash zsh" -- "$cur"))
      return 0
      ;;
    skill)
      if [ -z "$subsubcommand" ]; then
        COMPREPLY=($(compgen -W "$skill_subcommands" -- "$cur"))
        return 0
      fi
      case "$subsubcommand" in
        show|path)
          COMPREPLY=($(compgen -W "$skill_names" -- "$cur"))
          return 0
          ;;
      esac
      ;;
    cd)
      [ "$prev" = "cd" ] && COMPREPLY=($(compgen -W "$(_wtx_get_repos)" -- "$cur")) && return 0
      ;;
    rebase|open|status|remove|sync|deps)
      [ "$prev" = "$subcommand" ] && COMPREPLY=($(compgen -W "$(_wtx_get_branches)" -- "$cur")) && return 0
      ;;
  esac

  COMPREPLY=()
  return 0
}

complete -F _wtx_completions wtx
