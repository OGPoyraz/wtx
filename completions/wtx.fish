function _wtx_get_repos
    set -l config_file
    if set -q XDG_CONFIG_HOME
        set config_file "$XDG_CONFIG_HOME/wtx/config.json"
    else
        set config_file "$HOME/.config/wtx/config.json"
    end
    if test -f "$config_file"
        if type -q jq
            jq -r '.repos | keys[]' "$config_file" 2>/dev/null
        else
            grep -E '^    "[^"]+":' "$config_file" 2>/dev/null | sed 's/^    "//; s/":.*//'
        end
    end
end

function _wtx_get_branches
    set -l config_file
    if set -q XDG_CONFIG_HOME
        set config_file "$XDG_CONFIG_HOME/wtx/config.json"
    else
        set config_file "$HOME/.config/wtx/config.json"
    end
    if test -f "$config_file"; and type -q jq
        set -l root (jq -r '.root' "$config_file" 2>/dev/null | sed "s|^~/|$HOME/|")
        set -l postfix (jq -r '.postfix // "-wt"' "$config_file" 2>/dev/null)
        for repo in (jq -r '.repos | keys[]' "$config_file" 2>/dev/null)
            if test -d "$root/$repo"
                git -C "$root/$repo" worktree list --porcelain 2>/dev/null | grep '^branch refs/heads/' | sed 's|^branch refs/heads/||'
            end
        end | sort -u
    end
end

complete -c wtx -f

# Global Options
complete -c wtx -s q -l quiet -d "Suppress output"
complete -c wtx -l verbose -d "Show git commands"
complete -c wtx -l dry-run -d "Show what would happen"
complete -c wtx -s h -l help -d "Display help for command"

# Subcommands
set -l commands config create remove prune open rebase fetch sync deps ls cd status prs pull pull-branch init skill terminal mcp exec rename stack

# Setup completions for commands
complete -c wtx -n "not __fish_seen_subcommand_from $commands" -a "config" -d "Manage configuration"
complete -c wtx -n "not __fish_seen_subcommand_from $commands" -a "create" -d "Create worktrees"
complete -c wtx -n "not __fish_seen_subcommand_from $commands" -a "remove" -d "Remove worktrees"
complete -c wtx -n "not __fish_seen_subcommand_from $commands" -a "prune" -d "Remove worktrees with merged PRs"
complete -c wtx -n "not __fish_seen_subcommand_from $commands" -a "open" -d "Open worktree in IDE"
complete -c wtx -n "not __fish_seen_subcommand_from $commands" -a "rebase" -d "Fetch and rebase onto recorded base"
complete -c wtx -n "not __fish_seen_subcommand_from $commands" -a "pull" -d "Fetch a PR and create its worktree"
complete -c wtx -n "not __fish_seen_subcommand_from $commands" -a "pull-branch" -d "Fast-forward pull a worktree branch"
complete -c wtx -n "not __fish_seen_subcommand_from $commands" -a "rename" -d "Rename branch and move worktree directory"
complete -c wtx -n "not __fish_seen_subcommand_from $commands" -a "fetch" -d "Fetch origin main"
complete -c wtx -n "not __fish_seen_subcommand_from $commands" -a "sync" -d "Re-copy sync files and run post_sync"
complete -c wtx -n "not __fish_seen_subcommand_from $commands" -a "deps" -d "Manage node_modules strategy"
complete -c wtx -n "not __fish_seen_subcommand_from $commands" -a "ls" -d "List worktrees with status"
complete -c wtx -n "not __fish_seen_subcommand_from $commands" -a "cd" -d "Change directory to worktree"
complete -c wtx -n "not __fish_seen_subcommand_from $commands" -a "status" -d "Show worktree status"
complete -c wtx -n "not __fish_seen_subcommand_from $commands" -a "stack" -d "Show recorded branch stack"
complete -c wtx -n "not __fish_seen_subcommand_from $commands" -a "prs" -d "Show pull request status across worktrees"
complete -c wtx -n "not __fish_seen_subcommand_from $commands" -a "init" -d "Output shell integration code"
complete -c wtx -n "not __fish_seen_subcommand_from $commands" -a "skill" -d "Manage AI agent skills"
complete -c wtx -n "not __fish_seen_subcommand_from $commands" -a "terminal" -d "Interactive terminal dashboard"
complete -c wtx -n "not __fish_seen_subcommand_from $commands" -a "mcp" -d "Run MCP server exposing worktree tools"
complete -c wtx -n "not __fish_seen_subcommand_from $commands" -a "exec" -d "Execute commands across worktrees"

# Dynamically complete branch arguments
complete -c wtx -n "__fish_seen_subcommand_from create open rebase sync deps status remove rename pull-branch stack" -a "(_wtx_get_branches)"

# Flags
complete -c wtx -n "__fish_seen_subcommand_from create remove prune open rebase fetch sync deps ls status stack prs pull pull-branch rename" -s r -l repo -xa "(_wtx_get_repos)" -d "Target specific repo(s)"

# create flags
complete -c wtx -n "__fish_seen_subcommand_from create" -l base -xa "main master develop dev" -d "Base ref"
complete -c wtx -n "__fish_seen_subcommand_from create" -s o -l open -d "Open worktree in IDE after creation"
complete -c wtx -n "__fish_seen_subcommand_from create" -l deps -xa "auto link symlink install off" -d "Dependency strategy"
complete -c wtx -n "__fish_seen_subcommand_from create open" -l ide -xa "cursor code vscode code-insiders vscodium idea webstorm zed vim nvim emacs" -d "IDE to open with"
complete -c wtx -n "__fish_seen_subcommand_from create" -l track -d "Track remote branch even if it belongs to someone else"
complete -c wtx -n "__fish_seen_subcommand_from create" -l agent -d "AI agent to delegate work to"
complete -c wtx -n "__fish_seen_subcommand_from create" -l prompt -d "Prompt for AI agent"

# remove/prune flags
complete -c wtx -n "__fish_seen_subcommand_from remove prune" -s f -l force -d "Force removal"
complete -c wtx -n "__fish_seen_subcommand_from remove prune" -s y -l yes -d "Skip confirmation prompt"

# deps flags
complete -c wtx -n "__fish_seen_subcommand_from deps" -l install -d "Switch to independent node_modules"
complete -c wtx -n "__fish_seen_subcommand_from deps" -l symlink -d "Switch to symlinked node_modules"

# json flag
complete -c wtx -n "__fish_seen_subcommand_from ls status stack prs deps" -l json -d "Output machine-readable JSON"

# ls flags
complete -c wtx -n "__fish_seen_subcommand_from ls" -l pr -d "Include pull request status column"

# prs flags
complete -c wtx -n "__fish_seen_subcommand_from prs" -l all -d "Include drafts and closed/merged PRs"

# terminal flags
complete -c wtx -n "__fish_seen_subcommand_from terminal" -l wo-details -d "Repositories panel only (hide details/right pane)"

# stack-aware flags
complete -c wtx -n "__fish_seen_subcommand_from rebase" -l onto -xa "main master develop dev" -d "Override recorded base"
complete -c wtx -n "__fish_seen_subcommand_from status" -l base -xa "main master develop dev" -d "Override recorded base"

# config subcommands
set -l config_commands init show set add-repo remove-repo
complete -c wtx -n "__fish_seen_subcommand_from config; and not __fish_seen_subcommand_from $config_commands" -a "init" -d "Initialize configuration"
complete -c wtx -n "__fish_seen_subcommand_from config; and not __fish_seen_subcommand_from $config_commands" -a "show" -d "Show current configuration"
complete -c wtx -n "__fish_seen_subcommand_from config; and not __fish_seen_subcommand_from $config_commands" -a "set" -d "Set a configuration key"
complete -c wtx -n "__fish_seen_subcommand_from config; and not __fish_seen_subcommand_from $config_commands" -a "add-repo" -d "Add or update a repo"
complete -c wtx -n "__fish_seen_subcommand_from config; and not __fish_seen_subcommand_from $config_commands" -a "remove-repo" -d "Remove a repo"

# config flags
complete -c wtx -n "__fish_seen_subcommand_from add-repo" -l sync-files -d "Files to sync"
complete -c wtx -n "__fish_seen_subcommand_from add-repo" -l post-create -d "Post-create commands"
complete -c wtx -n "__fish_seen_subcommand_from add-repo" -l post-sync -d "Post-sync commands"
complete -c wtx -n "__fish_seen_subcommand_from remove-repo" -xa "(_wtx_get_repos)"

# skill subcommands
set -l skill_commands show path list
complete -c wtx -n "__fish_seen_subcommand_from skill; and not __fish_seen_subcommand_from $skill_commands" -a "show" -d "Show skill content"
complete -c wtx -n "__fish_seen_subcommand_from skill; and not __fish_seen_subcommand_from $skill_commands" -a "path" -d "Show skill file path"
complete -c wtx -n "__fish_seen_subcommand_from skill; and not __fish_seen_subcommand_from $skill_commands" -a "list" -d "List available skills"
complete -c wtx -n "__fish_seen_subcommand_from show path" -xa "opencode cursor claude"

# init
complete -c wtx -n "__fish_seen_subcommand_from init" -xa "bash zsh fish"

# cd
complete -c wtx -n "__fish_seen_subcommand_from cd" -xa "(_wtx_get_repos)"
