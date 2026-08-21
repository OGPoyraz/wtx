#compdef wtx
# Zsh tab completion for wtx CLI
# Install: copy to a directory in $fpath (e.g. /usr/local/share/zsh/site-functions/)

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

_wtx_repos() {
  local repos
  repos=($(_wtx_get_repos))
  _describe 'repo' repos
}

_wtx() {
  local context state line
  typeset -A opt_args

  _arguments -C \
    '1: :->subcommand' \
    '*::: :->args'

  case $state in
    subcommand)
      _values 'wtx command' \
        'config[Manage configuration]' \
        'create[Create worktrees]' \
        'remove[Remove worktrees]' \
        'open[Open worktree in IDE]' \
        'rebase[Fetch and rebase vs main]' \
        'fetch[Fetch origin main]' \
        'sync[Re-copy sync files and run post_sync]' \
        'deps[Manage node_modules strategy]' \
        'ls[List worktrees with status]' \
        'cd[Change directory to worktree]' \
        'status[Show worktree status]' \
        'init[Output shell integration code]' \
        'skill[Manage AI agent skills]'
      ;;

    args)
      case ${line[1]} in
        config)   _wtx_config ;;
        skill)    _wtx_skill ;;
        init)     _values 'shell' 'bash' 'zsh' ;;
        create)
          _arguments \
            ':branch:' \
            {-r,--repo}'[Target specific repo(s)]:repo:_wtx_repos' \
            '--base[Base ref to create branch from]:ref:(main master develop dev)' \
            '--verbose[Show git commands]' \
            '--dry-run[Show what would happen]'
          ;;
        remove)
          _arguments \
            ':branch:' \
            {-r,--repo}'[Target specific repo(s)]:repo:_wtx_repos' \
            {-f,--force}'[Force removal even with uncommitted changes]' \
            '--verbose[Show git commands]' \
            '--dry-run[Show what would happen]'
          ;;
        open)
          _arguments \
            ':branch:' \
            {-r,--repo}'[Target specific repo(s)]:repo:_wtx_repos' \
            '--ide[IDE to open with]:editor:(cursor code vscode code-insiders vscodium idea webstorm goland pycharm zed vim nvim emacs sublime atom)' \
            '--verbose[Show git commands]' \
            '--dry-run[Show what would happen]'
          ;;
        rebase)
          _arguments \
            ':branch:' \
            '--repo[Target specific repo(s)]:repo:_wtx_repos' \
            '--verbose[Show git commands]' \
            '--dry-run[Show what would happen]'
          ;;
        fetch)
          _arguments \
            '--repo[Target specific repo(s)]:repo:_wtx_repos' \
            '--verbose[Show git commands]' \
            '--dry-run[Show what would happen]'
          ;;
        sync)
          _arguments \
            ':branch:' \
            '--repo[Target specific repo(s)]:repo:_wtx_repos' \
            '--verbose[Show git commands]' \
            '--dry-run[Show what would happen]'
          ;;
        deps)
          _arguments \
            '::branch:' \
            {-r,--repo}'[Target specific repo(s)]:repo:_wtx_repos' \
            '--install[Switch to independent node_modules]' \
            '--symlink[Switch to symlinked node_modules]' \
            '--verbose[Show git commands]' \
            '--dry-run[Show what would happen]'
          ;;
        ls)
          _arguments \
            {-r,--repo}'[Target specific repo(s)]:repo:_wtx_repos' \
            '--verbose[Show git commands]' \
            '--dry-run[Show what would happen]'
          ;;
        cd)
          _arguments \
            ':repo:_wtx_repos' \
            ':branch:'
          ;;
        status)
          _arguments \
            ':branch:' \
            {-r,--repo}'[Target specific repo(s)]:repo:_wtx_repos' \
            '--verbose[Show git commands]' \
            '--dry-run[Show what would happen]'
          ;;
      esac
      ;;
  esac
}

_wtx_config() {
  local context state line
  typeset -A opt_args

  _arguments -C \
    '1: :->config_subcommand' \
    '*::: :->args'

  case $state in
    config_subcommand)
      _values 'config subcommand' \
        'init[Initialize configuration]' \
        'show[Show current configuration]' \
        'set[Set a configuration key]' \
        'add-repo[Add or update a repo]' \
        'remove-repo[Remove a repo]'
      ;;
    args)
      case ${line[1]} in
        set)
          _arguments \
            ':key:(root postfix ide default_main_branch)' \
            ':value:'
          ;;
        add-repo)
          _arguments \
            ':name:' \
            '--sync-files[Comma-separated files to sync]:files:' \
            '--post-create[Comma-separated post-create commands]:cmds:' \
            '--post-sync[Comma-separated post-sync commands]:cmds:'
          ;;
        remove-repo)
          _arguments \
            ':repo:_wtx_repos'
          ;;
      esac
      ;;
  esac
}

_wtx_skill() {
  local context state line
  typeset -A opt_args

  _arguments -C \
    '1: :->skill_subcommand' \
    '*::: :->args'

  case $state in
    skill_subcommand)
      _values 'skill subcommand' \
        'show[Show skill content]' \
        'path[Show skill file path]' \
        'list[List available skills]'
      ;;
    args)
      case ${line[1]} in
        show|path)
          _values 'skill' 'opencode' 'cursor' 'claude'
          ;;
      esac
      ;;
  esac
}

_wtx "$@"
