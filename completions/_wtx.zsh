#compdef wtx

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

_wtx_branches() {
  local config_file root postfix branches
  if [ -n "$XDG_CONFIG_HOME" ]; then
    config_file="${XDG_CONFIG_HOME}/wtx/config.json"
  else
    config_file="${HOME}/.config/wtx/config.json"
  fi
  branches=()
  if [ -f "$config_file" ] && command -v jq >/dev/null 2>&1; then
    root=$(jq -r '.root' "$config_file" 2>/dev/null)
    root="${root/#\~/$HOME}"
    for repo in $(jq -r '.repos | keys[]' "$config_file" 2>/dev/null); do
      if [ -d "${root}/${repo}" ]; then
        branches+=($(git -C "${root}/${repo}" worktree list --porcelain 2>/dev/null | \
          grep '^branch refs/heads/' | sed 's|^branch refs/heads/||'))
      fi
    done
  fi
  _describe 'branch' branches
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
        'pull[Fetch a PR and create its worktree]' \
        'fetch[Fetch origin main]' \
        'sync[Re-copy sync files and run post_sync]' \
        'deps[Manage node_modules strategy]' \
        'ls[List worktrees with status]' \
        'cd[Change directory to worktree]' \
        'status[Show worktree status]' \
        'prs[Show pull request status across worktrees]' \
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
            '--base[Base ref]:ref:(main master develop dev)' \
            {-o,--open}'[Open worktree(s) in IDE after creation]' \
            '--ide[IDE to open with]:editor:(cursor code vscode idea webstorm zed vim nvim emacs)' \
            '--verbose[Show git commands]' \
            '--dry-run[Show what would happen]'
          ;;
        remove)
          _arguments \
            ':branch:_wtx_branches' \
            {-r,--repo}'[Target specific repo(s)]:repo:_wtx_repos' \
            {-f,--force}'[Force removal]' \
            '--verbose[Show git commands]' \
            '--dry-run[Show what would happen]'
          ;;
        open)
          _arguments \
            ':branch:_wtx_branches' \
            {-r,--repo}'[Target specific repo(s)]:repo:_wtx_repos' \
            '--ide[IDE to open with]:editor:(cursor code vscode idea webstorm zed vim nvim emacs)' \
            '--verbose[Show git commands]' \
            '--dry-run[Show what would happen]'
          ;;
        rebase)
          _arguments \
            ':branch:_wtx_branches' \
            '--repo[Target specific repo(s)]:repo:_wtx_repos' \
            '--verbose[Show git commands]' \
            '--dry-run[Show what would happen]'
          ;;
        pull)
          _arguments \
            ':pr-link:' \
            {-r,--repo}'[Target specific repo(s)]:repo:_wtx_repos' \
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
            ':branch:_wtx_branches' \
            '--repo[Target specific repo(s)]:repo:_wtx_repos' \
            '--verbose[Show git commands]' \
            '--dry-run[Show what would happen]'
          ;;
        deps)
          _arguments \
            '::branch:_wtx_branches' \
            {-r,--repo}'[Target specific repo(s)]:repo:_wtx_repos' \
            '--install[Switch to independent node_modules]' \
            '--symlink[Switch to symlinked node_modules]' \
            '--verbose[Show git commands]' \
            '--dry-run[Show what would happen]'
          ;;
        ls)
          _arguments \
            {-r,--repo}'[Target specific repo(s)]:repo:_wtx_repos' \
            '--pr[Include pull request status column]' \
            '--verbose[Show git commands]' \
            '--dry-run[Show what would happen]'
          ;;
        cd)
          _arguments \
            ':repo:_wtx_repos' \
            ':branch:_wtx_branches'
          ;;
        status)
          _arguments \
            ':branch:_wtx_branches' \
            {-r,--repo}'[Target specific repo(s)]:repo:_wtx_repos' \
            '--verbose[Show git commands]' \
            '--dry-run[Show what would happen]'
          ;;
        prs)
          _arguments \
            {-r,--repo}'[Target specific repo(s)]:repo:_wtx_repos' \
            '--json[Output machine-readable JSON]' \
            '--all[Include drafts and closed/merged PRs]' \
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
            '--sync-files[Files to sync]:files:' \
            '--post-create[Post-create commands]:cmds:' \
            '--post-sync[Post-sync commands]:cmds:'
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
